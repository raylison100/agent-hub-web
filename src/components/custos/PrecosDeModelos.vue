<script setup lang="ts">
import type { PrecoDeModelo } from '@agent-hub/core'
import { computed, nextTick, ref, watch } from 'vue'
import { client } from '../../daemon/client'
import { avisar, confirmar, useAcao } from '../../ui/feedback'
import Card from '../ui/Card.vue'
import EmptyState from '../ui/EmptyState.vue'
import StatusBadge from '../ui/StatusBadge.vue'
import { dataCompleta, lerValor, paraCampo, type TabelaDePrecos } from './formato'

const props = defineProps<{ precos: TabelaDePrecos | null }>()
const emit = defineEmits<{ salvo: [precos: TabelaDePrecos]; sujo: [sujo: boolean] }>()

type Coluna = 'input' | 'output' | 'cache_read' | 'cache_write'

interface Linha {
  id: number
  chave: string
  input: string
  output: string
  cache_read: string
  cache_write: string
  preCriada: boolean
}

const colunas: { campo: Coluna; titulo: string }[] = [
  { campo: 'input', titulo: 'Entrada' },
  { campo: 'output', titulo: 'Saída' },
  { campo: 'cache_read', titulo: 'Leitura de cache' },
  { campo: 'cache_write', titulo: 'Escrita de cache' },
]

let proximoId = 1
const linhas = ref<Linha[]>(montar())
const base = ref(assinatura(linhas.value))
const busca = ref('')
const erros = ref<Record<number, { chave?: string; valores?: string }>>({})
const tabela = ref<HTMLElement | null>(null)
const { ocupado, executar } = useAcao()

const emUso = computed(() => new Set(props.precos?.em_uso ?? []))
const semPreco = computed(() => new Set(props.precos?.sem_preco ?? []))
const mudou = computed(() => assinatura(linhas.value) !== base.value)
const visiveis = computed(() => {
  const termo = busca.value.trim().toLowerCase()
  return termo ? linhas.value.filter((l) => l.chave === '' || l.chave.toLowerCase().includes(termo)) : linhas.value
})

/** Cria as linhas editáveis a partir da tabela gravada, incluindo os modelos em uso sem preço. */
function montar(): Linha[] {
  const p = props.precos
  if (!p) return []
  const lista: Linha[] = p.modelos.map((m) => ({
    id: proximoId++,
    chave: m.chave,
    input: paraCampo(m.input),
    output: paraCampo(m.output),
    cache_read: paraCampo(m.cache_read),
    cache_write: paraCampo(m.cache_write),
    preCriada: false,
  }))
  const existentes = new Set(p.modelos.map((m) => m.chave))
  const faltando = p.sem_preco.filter((c) => !existentes.has(c))
  const novas = faltando.map((chave) => ({ id: proximoId++, chave, input: '', output: '', cache_read: '', cache_write: '', preCriada: true }))
  return [...novas, ...lista.sort((a, b) => a.chave.localeCompare(b.chave))]
}

/** Converte uma linha para o formato gravado. */
function paraPreco(l: Linha): PrecoDeModelo {
  return { chave: l.chave.trim(), input: lerValor(l.input), output: lerValor(l.output), cache_read: lerValor(l.cache_read), cache_write: lerValor(l.cache_write) }
}

/** Diz se a linha foi criada só como sugestão e continua vazia. */
function sugestaoVazia(l: Linha): boolean {
  return l.preCriada && !l.input.trim() && !l.output.trim() && !l.cache_read.trim() && !l.cache_write.trim()
}

/** Resumo comparável das linhas para saber se houve alteração. */
function assinatura(lista: Linha[]): string {
  return JSON.stringify(lista.filter((l) => !sugestaoVazia(l)).map((l) => [l.chave.trim(), l.input.trim(), l.output.trim(), l.cache_read.trim(), l.cache_write.trim()]))
}

/** Diz se a linha precisa de atenção por estar em uso sem preço. */
function pendente(l: Linha): boolean {
  return semPreco.value.has(l.chave.trim()) && (!l.input.trim() || !l.output.trim())
}

/** Volta a tabela para o que está gravado. */
function descartar(): void {
  linhas.value = montar()
  base.value = assinatura(linhas.value)
  erros.value = {}
}

/** Acrescenta uma linha vazia no topo e foca o campo do nome. */
async function adicionar(): Promise<void> {
  busca.value = ''
  const id = proximoId++
  linhas.value.unshift({ id, chave: '', input: '', output: '', cache_read: '', cache_write: '', preCriada: false })
  await nextTick()
  tabela.value?.querySelector<HTMLInputElement>(`[data-chave="${id}"]`)?.focus()
}

/** Remove uma linha, pedindo confirmação se o modelo estiver em uso. */
async function remover(l: Linha): Promise<void> {
  if (emUso.value.has(l.chave.trim())) {
    const ok = await confirmar({
      titulo: `Remover o preço de ${l.chave}?`,
      detalhe: 'Este modelo está em uso. Sem preço, os agentes que usam ele ficam parados até você informar o valor de novo.',
      botao: 'Remover',
      perigo: true,
    })
    if (!ok) return
  }
  linhas.value = linhas.value.filter((x) => x.id !== l.id)
}

/** Confere nomes e valores de todas as linhas. */
function validar(): boolean {
  const e: Record<number, { chave?: string; valores?: string }> = {}
  const vistas = new Map<string, number>()
  for (const l of linhas.value) {
    if (sugestaoVazia(l)) continue
    const chave = l.chave.trim()
    if (!/^[^\s/]+\/[^\s/][^\s]*$/.test(chave)) e[l.id] = { chave: 'Use o formato empresa/modelo, sem espaços.' }
    else if (vistas.has(chave.toLowerCase())) e[l.id] = { chave: 'Este modelo já está na tabela.' }
    vistas.set(chave.toLowerCase(), l.id)
    const invalido = colunas.some((c) => {
      const v = lerValor(l[c.campo])
      return v !== null && (Number.isNaN(v) || v < 0)
    })
    if (invalido) e[l.id] = { ...e[l.id], valores: 'Os preços devem ser números, zero ou maiores. Deixe vazio se não souber.' }
  }
  erros.value = e
  return Object.keys(e).length === 0
}

/** Grava a tabela inteira no daemon. */
async function salvar(): Promise<void> {
  if (!validar()) {
    busca.value = ''
    avisar('Confira as linhas marcadas.', 'erro')
    return
  }
  const modelos = linhas.value.filter((l) => !sugestaoVazia(l)).map(paraPreco)
  const novo = await executar(() => client.request({ type: 'pricing.save', modelos }, 'pricing'), 'Tabela de preços salva.')
  if (!novo) return
  base.value = assinatura(linhas.value)
  emit('salvo', novo)
}

watch(
  () => props.precos,
  () => {
    if (!mudou.value) descartar()
  },
)

watch(mudou, (v) => emit('sujo', v), { immediate: true })
</script>

<template>
  <form class="precos" novalidate @submit.prevent="salvar">
    <Card titulo="O que cada coluna quer dizer" descricao="Os preços são em dólares (US$) por milhão de tokens. Um token é um pedaço pequeno de texto, mais ou menos três quartos de uma palavra.">
      <dl class="precos-legenda">
        <dt>Entrada</dt>
        <dd>O que é enviado ao modelo: suas mensagens, as instruções do agente e os arquivos lidos.</dd>
        <dt>Saída</dt>
        <dd>O que o modelo escreve de volta. Costuma ser o preço mais alto.</dd>
        <dt>Leitura de cache</dt>
        <dd>Texto repetido que o modelo reaproveita de uma conversa anterior. Costuma ser bem mais barato que a entrada.</dd>
        <dt>Escrita de cache</dt>
        <dd>O custo de guardar um texto para ele poder ser reaproveitado depois.</dd>
      </dl>
    </Card>

    <EmptyState v-if="!precos" titulo="Tabela de preços indisponível" texto="Não consegui carregar os preços agora. Tente atualizar a página." />

    <Card v-else titulo="Tabela de preços" :descricao="`Tabela atualizada em ${dataCompleta(precos.versao)}. Campo vazio quer dizer que o preço não foi informado.`">
      <template #acoes>
        <button type="button" class="primary" @click="adicionar">Adicionar modelo</button>
      </template>

      <div v-if="precos.sem_preco.length" class="precos-aviso">
        <StatusBadge estado="erro" texto="Preço faltando" />
        <span>Os modelos destacados estão em uso e sem preço. Os agentes que usam ficam parados até você preencher Entrada e Saída.</span>
      </div>
      <p v-if="(precos.idade_dias ?? 0) > 30" class="precos-antiga">Tabela de preços com {{ precos.idade_dias }} dias: confira nos sites das empresas.</p>

      <input v-model="busca" type="search" placeholder="Procurar modelo pelo nome" aria-label="Procurar modelo" />

      <EmptyState v-if="linhas.length === 0" titulo="Nenhum preço cadastrado" texto="Adicione os modelos que seus agentes usam.">
        <button type="button" class="primary" @click="adicionar">Adicionar modelo</button>
      </EmptyState>
      <EmptyState v-else-if="visiveis.length === 0" titulo="Nenhum modelo encontrado" texto="Tente outro nome na busca." />
      <div v-else ref="tabela" class="table-wrap">
        <table class="precos-tabela">
          <thead>
            <tr>
              <th>Modelo (empresa/modelo)</th>
              <th v-for="c in colunas" :key="c.campo" class="num">{{ c.titulo }}</th>
              <th><span class="precos-oculto">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="l in visiveis" :key="l.id">
              <tr :class="{ pendente: pendente(l), 'com-erro': erros[l.id] }">
                <td class="precos-modelo">
                  <input
                    v-model="l.chave"
                    type="text"
                    spellcheck="false"
                    placeholder="empresa/modelo"
                    :data-chave="l.id"
                    :class="{ invalido: erros[l.id]?.chave }"
                    aria-label="Modelo"
                  />
                  <span v-if="emUso.has(l.chave.trim())" class="precos-chip">em uso</span>
                </td>
                <td v-for="c in colunas" :key="c.campo" class="precos-valor">
                  <input v-model="l[c.campo]" type="text" inputmode="decimal" :aria-label="`${c.titulo} de ${l.chave || 'novo modelo'}`" />
                </td>
                <td>
                  <button type="button" class="danger" :aria-label="`Remover ${l.chave || 'linha'}`" @click="remover(l)">Remover</button>
                </td>
              </tr>
              <tr v-if="erros[l.id]" class="precos-erro-linha">
                <td colspan="6">
                  <span class="ui-field-erro">{{ [erros[l.id]?.chave, erros[l.id]?.valores].filter(Boolean).join(' ') }}</span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </Card>

    <div v-if="precos" class="precos-acoes">
      <button type="submit" class="primary" :disabled="ocupado || !mudou">{{ ocupado ? 'Salvando...' : 'Salvar' }}</button>
      <button type="button" :disabled="ocupado || !mudou" @click="descartar">Descartar alterações</button>
      <span class="spacer"></span>
      <span v-if="mudou" class="precos-sujo">Alterações não salvas</span>
    </div>
  </form>
</template>

<style scoped>
.precos {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.precos-legenda {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 14px;
  margin: 0;
}

.precos-legenda dt {
  font-weight: 600;
}

.precos-legenda dd {
  margin: 0;
  color: var(--text-soft);
}

@media (max-width: 560px) {
  .precos-legenda {
    grid-template-columns: 1fr;
  }
  .precos-legenda dd {
    margin-bottom: 6px;
  }
}

.precos-aviso {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  border: 1px solid color-mix(in srgb, var(--error) 40%, var(--border));
  background: color-mix(in srgb, var(--error) 8%, transparent);
}

.precos-antiga {
  margin: 0;
  color: var(--warn);
}

.precos-tabela input {
  margin-top: 0;
  padding: 6px 8px;
}

.precos-tabela input.invalido {
  border-color: var(--error);
}

.precos-modelo {
  min-width: 220px;
}

.precos-modelo input {
  display: inline-block;
  width: calc(100% - 64px);
  min-width: 150px;
}

.precos-valor {
  min-width: 100px;
}

.precos-valor input {
  text-align: right;
  font-family: var(--mono);
}

.precos-chip {
  display: inline-block;
  margin-left: 6px;
  font-size: var(--fs-small);
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  color: var(--accent);
  white-space: nowrap;
}

tr.pendente td {
  background: color-mix(in srgb, var(--warn) 12%, transparent);
}

tr.pendente td:first-child {
  box-shadow: inset 3px 0 0 var(--warn);
}

tr.com-erro td {
  border-bottom: 0;
}

.precos-erro-linha td {
  padding-top: 0;
}

.precos-oculto {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.precos-acoes {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow);
}

.precos-sujo {
  color: var(--warn);
  font-size: var(--fs-small);
}
</style>
