<script setup lang="ts">
import type { ChaveResumo } from '@agent-hub/core'
import { computed, nextTick, onMounted, ref } from 'vue'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Field from '../components/ui/Field.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { avisar, confirmar, mensagemDeErro, useAcao } from '../ui/feedback'

type TipoDeUso = ChaveResumo['usos'][number]['tipo']
type ResultadoDeTeste = { estado: 'andamento' } | { estado: 'pronto'; ok: boolean; mensagem: string }

const NOMES_CONHECIDOS: Record<string, string> = {
  ANTHROPIC_API_KEY: 'Anthropic (Claude)',
  OPENAI_API_KEY: 'OpenAI',
  DEEPSEEK_API_KEY: 'DeepSeek',
  GEMINI_API_KEY: 'Google Gemini',
  OLLAMA_API_KEY: 'Ollama',
}

const ONDE_CONSEGUIR: Record<string, string> = {
  ANTHROPIC_API_KEY: 'https://console.anthropic.com/settings/keys',
  OPENAI_API_KEY: 'https://platform.openai.com/api-keys',
  DEEPSEEK_API_KEY: 'https://platform.deepseek.com/api_keys',
  GEMINI_API_KEY: 'https://aistudio.google.com/apikey',
}

const ROTULO_DO_USO: Record<TipoDeUso, string> = {
  modelo: 'modelo',
  conector: 'conector',
  plugin: 'plugin',
  canal: 'canal',
}

const GRUPOS: {
  id: TipoDeUso | 'outras'
  titulo: string
  descricao: string
}[] = [
  {
    id: 'modelo',
    titulo: 'Empresas de IA',
    descricao: 'Chaves que os agentes usam para conversar com os modelos de IA.',
  },
  {
    id: 'conector',
    titulo: 'Conectores',
    descricao: 'Chaves que ligam os agentes a outros serviços, como GitHub ou bancos de dados.',
  },
  {
    id: 'plugin',
    titulo: 'Plugins',
    descricao: 'Chaves pedidas pelos plugins instalados.',
  },
  {
    id: 'canal',
    titulo: 'Canais de conversa',
    descricao: 'Credenciais dos bots de Telegram e WhatsApp. São gerenciadas na tela de Canais.',
  },
  {
    id: 'outras',
    titulo: 'Outras',
    descricao: 'Chaves guardadas que nada usa no momento.',
  },
]

const NOME_VALIDO = /^[A-Z][A-Z0-9_]{1,63}$/

const chaves = ref<ChaveResumo[]>([])
const carregando = ref(true)
const falha = ref('')
const editando = ref<string | null>(null)
const valorEditado = ref('')
const testes = ref<Record<string, ResultadoDeTeste>>({})
const mostrarNova = ref(false)
const novoNome = ref('')
const novoValor = ref('')
const tentouCriar = ref(false)
const { ocupado, executar } = useAcao()

const faltando = computed(() => chaves.value.filter((c) => c.length === 0 && c.usos.length > 0).length)

const grupos = computed(() =>
  GRUPOS.map((g) => ({
    ...g,
    chaves: chaves.value.filter((c) => (c.usos[0]?.tipo ?? 'outras') === g.id),
  })).filter((g) => g.chaves.length > 0),
)

const erroDoNome = computed(() => {
  const nome = novoNome.value
  if (!nome) return tentouCriar.value ? 'Informe o nome da chave.' : ''
  if (!NOME_VALIDO.test(nome)) return 'Use de 2 a 64 caracteres: letras sem acento, números e sublinhado, começando por uma letra.'
  return ''
})

const erroDoValor = computed(() => (tentouCriar.value && !novoValor.value.trim() ? 'Cole o valor da chave.' : ''))

/** Nome amigável da chave quando é de uma empresa conhecida. */
function nomeAmigavel(nome: string): string | undefined {
  return NOMES_CONHECIDOS[nome]
}

/** Estado exibido no selo da chave. */
function status(c: ChaveResumo): {
  estado: 'ok' | 'erro' | 'atencao' | 'desligado'
  texto: string
} {
  if (c.length === 0) return { estado: c.usos.length ? 'erro' : 'atencao', texto: 'Faltando' }
  if (c.source === 'env') return { estado: 'ok', texto: 'Do ambiente do sistema' }
  return { estado: 'ok', texto: 'Cadastrada' }
}

/** Indica se a chave é gerenciada pela tela de Canais. */
function ehDeCanal(c: ChaveResumo): boolean {
  return c.usos.some((u) => u.tipo === 'canal')
}

/** Data de atualização em formato brasileiro. */
function quando(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/** Converte o que foi digitado para maiúsculas com sublinhado. */
function normalizarNome(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
    .slice(0, 64)
}

function aoDigitarNome(e: Event): void {
  const alvo = e.target as HTMLInputElement
  novoNome.value = normalizarNome(alvo.value)
  alvo.value = novoNome.value
}

async function carregar(): Promise<void> {
  falha.value = ''
  try {
    chaves.value = (await client.request({ type: 'secrets.list' }, 'secrets.list')).secrets
  } catch (err) {
    falha.value = mensagemDeErro(err)
  } finally {
    carregando.value = false
  }
}

async function abrirEdicao(c: ChaveResumo): Promise<void> {
  editando.value = c.name
  valorEditado.value = ''
  await nextTick()
  document.getElementById(`chave-${c.name}`)?.focus()
}

function cancelarEdicao(): void {
  editando.value = null
  valorEditado.value = ''
}

/** Resultado do último teste concluído da chave. */
function resultado(nome: string): { ok: boolean; mensagem: string } | undefined {
  const r = testes.value[nome]
  return r?.estado === 'pronto' ? r : undefined
}

async function testar(nome: string): Promise<void> {
  testes.value = { ...testes.value, [nome]: { estado: 'andamento' } }
  try {
    const r = await client.request({ type: 'secrets.testar', name: nome }, 'secrets.teste', 30000)
    testes.value = {
      ...testes.value,
      [nome]: { estado: 'pronto', ok: r.ok, mensagem: r.mensagem },
    }
  } catch (err) {
    testes.value = {
      ...testes.value,
      [nome]: { estado: 'pronto', ok: false, mensagem: mensagemDeErro(err) },
    }
  }
}

/** Salva o valor, atualiza a lista e testa a chave em seguida quando dá. */
async function gravar(nome: string, valor: string): Promise<boolean> {
  const lista = await executar(
    async () => (await client.request({ type: 'secrets.set', name: nome, value: valor }, 'secrets.list')).secrets,
    `Chave ${nomeAmigavel(nome) ?? nome} salva.`,
  )
  if (!lista) return false
  chaves.value = lista
  testes.value = Object.fromEntries(Object.entries(testes.value).filter(([k]) => k !== nome))
  const salva = lista.find((c) => c.name === nome)
  if (salva?.testavel && salva.length > 0) void testar(nome)
  return true
}

async function salvarEdicao(c: ChaveResumo): Promise<void> {
  if (!valorEditado.value.trim()) {
    avisar('Cole o valor da chave antes de salvar.', 'erro')
    return
  }
  if (await gravar(c.name, valorEditado.value)) cancelarEdicao()
}

async function criar(): Promise<void> {
  tentouCriar.value = true
  if (erroDoNome.value || erroDoValor.value) return
  if (await gravar(novoNome.value, novoValor.value)) {
    novoNome.value = ''
    novoValor.value = ''
    tentouCriar.value = false
    mostrarNova.value = false
  }
}

async function apagar(c: ChaveResumo): Promise<void> {
  const nome = nomeAmigavel(c.name) ?? c.name
  const usos = c.usos.map((u) => `${ROTULO_DO_USO[u.tipo]} ${u.nome}`).join(', ')
  const ok = await confirmar({
    titulo: `Apagar a chave ${nome}?`,
    detalhe: usos ? `Para de funcionar até você cadastrar outra: ${usos}.` : 'Nada usa esta chave no momento.',
    botao: 'Apagar chave',
  })
  if (!ok) return
  const lista = await executar(async () => (await client.request({ type: 'secrets.delete', name: c.name }, 'secrets.list')).secrets, `Chave ${nome} apagada.`)
  if (lista) chaves.value = lista
}

async function abrirNova(): Promise<void> {
  mostrarNova.value = true
  await nextTick()
  document.getElementById('nova-chave-nome')?.focus()
}

onMounted(async () => {
  await useConnection()
    .whenOnline()
    .catch(() => undefined)
  await carregar()
})
</script>

<template>
  <div class="ui-page">
    <PageHeader
      titulo="Chaves de acesso"
      descricao="As senhas de acesso que os agentes usam para falar com as empresas de IA e outros serviços. Ficam guardadas cifradas nesta máquina e não são mostradas de novo depois de salvas."
    >
      <template #acoes>
        <button type="button" class="primary" @click="abrirNova">Adicionar outra chave</button>
      </template>
    </PageHeader>

    <EmptyState v-if="carregando" titulo="Carregando" carregando />
    <EmptyState v-else-if="falha" titulo="Não consegui carregar as chaves" :texto="falha">
      <button type="button" @click="carregar">Tentar de novo</button>
    </EmptyState>

    <template v-else>
      <div v-if="chaves.length" :class="['chaves-resumo', faltando ? 'atencao' : 'ok']" role="status">
        <template v-if="faltando">
          <strong>{{ faltando }} {{ faltando === 1 ? 'chave faltando' : 'chaves faltando' }}</strong>
          <span>O que depende delas não funciona até você cadastrar.</span>
        </template>
        <template v-else>
          <strong>Tudo cadastrado</strong>
          <span>Todas as chaves que os agentes precisam estão disponíveis.</span>
        </template>
      </div>

      <Card
        v-if="mostrarNova"
        titulo="Adicionar outra chave"
        descricao="Para serviços que ainda não aparecem na lista. O nome é o que o serviço espera encontrar."
      >
        <form class="ui-form duas-colunas" @submit.prevent="criar">
          <Field rotulo="Nome" obrigatorio :erro="erroDoNome" ajuda="Letras maiúsculas, números e sublinhado. Ex.: MEU_SERVICO_TOKEN">
            <input
              id="nova-chave-nome"
              :value="novoNome"
              type="text"
              placeholder="MEU_SERVICO_TOKEN"
              spellcheck="false"
              autocomplete="off"
              @input="aoDigitarNome"
            />
          </Field>
          <Field rotulo="Valor" obrigatorio :erro="erroDoValor">
            <input v-model="novoValor" type="password" placeholder="Cole a chave aqui" autocomplete="new-password" />
          </Field>
          <div class="ui-form-acoes">
            <button class="primary" type="submit" :disabled="ocupado">Salvar chave</button>
            <button type="button" @click="mostrarNova = false">Cancelar</button>
          </div>
        </form>
      </Card>

      <Card v-if="!chaves.length" titulo="Suas chaves">
        <EmptyState titulo="Nenhuma chave ainda" texto="Quando você criar agentes, conectores ou plugins, as chaves que eles pedem aparecem aqui.">
          <button type="button" class="primary" @click="abrirNova">Adicionar chave</button>
        </EmptyState>
      </Card>

      <Card v-for="g in grupos" :key="g.id" :titulo="g.titulo" :descricao="g.descricao">
        <ul class="ui-lista">
          <li v-for="c in g.chaves" :key="c.name" class="ui-lista-item chave">
            <div class="chave-topo">
              <span class="ui-lista-item-texto">
                <span class="chave-nome">
                  <strong>{{ nomeAmigavel(c.name) ?? c.name }}</strong>
                  <code v-if="nomeAmigavel(c.name)" class="chave-tecnico">{{ c.name }}</code>
                  <StatusBadge :estado="status(c).estado" :texto="status(c).texto" />
                </span>
                <span class="muted">
                  <template v-if="c.length"
                    >termina em <code>{{ c.hint }}</code></template
                  >
                  <template v-else>Ainda não cadastrada</template>
                  <template v-if="c.length && c.updated_at"> · atualizada em {{ quando(c.updated_at) }}</template>
                </span>
                <span v-if="c.usos.length" class="chave-usos">
                  <span class="muted">Usada por:</span>
                  <span v-for="u in c.usos" :key="`${u.tipo}-${u.nome}`" class="chave-chip">{{ ROTULO_DO_USO[u.tipo] }} {{ u.nome }}</span>
                </span>
                <a v-if="ONDE_CONSEGUIR[c.name]" class="chave-link small" :href="ONDE_CONSEGUIR[c.name]" target="_blank" rel="noopener"
                  >Onde conseguir essa chave</a
                >
              </span>
              <span v-if="editando !== c.name" class="ui-lista-item-acoes">
                <RouterLink v-if="ehDeCanal(c)" to="/settings/canais" class="ui-link-botao">Editar em Canais</RouterLink>
                <button v-else type="button" :class="{ primary: c.length === 0 }" :disabled="ocupado" @click="abrirEdicao(c)">
                  {{ c.length ? 'Trocar' : 'Cadastrar' }}
                </button>
                <button v-if="c.testavel && c.length > 0" type="button" :disabled="testes[c.name]?.estado === 'andamento'" @click="testar(c.name)">
                  {{ testes[c.name]?.estado === 'andamento' ? 'Testando...' : 'Testar' }}
                </button>
                <button v-if="c.source === 'db' && c.length > 0 && !c.usos.some((u) => u.tipo === 'canal')" type="button" class="danger" :disabled="ocupado" @click="apagar(c)">Apagar</button>
              </span>
            </div>

            <form v-if="editando === c.name" class="chave-edicao" @submit.prevent="salvarEdicao(c)">
              <input
                :id="`chave-${c.name}`"
                v-model="valorEditado"
                type="password"
                placeholder="Cole a chave aqui"
                autocomplete="new-password"
                @keydown.esc="cancelarEdicao"
              />
              <button class="primary" type="submit" :disabled="ocupado">
                {{ ocupado ? 'Salvando...' : 'Salvar' }}
              </button>
              <button type="button" @click="cancelarEdicao">Cancelar</button>
              <span v-if="c.source === 'env' && c.length" class="muted small chave-nota"
                >Esta chave vem do ambiente do sistema, que tem prioridade sobre a salva aqui.</span
              >
            </form>

            <p v-if="testes[c.name]?.estado === 'andamento'" class="chave-teste andamento small">Testando a chave. Pode levar alguns segundos.</p>
            <p v-else-if="resultado(c.name)" :class="['chave-teste', 'small', resultado(c.name)!.ok ? 'ok' : 'erro']">
              <strong>{{ resultado(c.name)!.ok ? 'Funcionou.' : 'Não funcionou.' }}</strong>
              {{ resultado(c.name)!.mensagem.charAt(0).toUpperCase() + resultado(c.name)!.mensagem.slice(1) }}.
            </p>
          </li>
        </ul>
      </Card>
    </template>
  </div>
</template>

<style scoped>
.chaves-resumo {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  border: 1px solid var(--border);
}

.chaves-resumo.atencao {
  border-color: color-mix(in srgb, var(--warn) 55%, var(--border));
  background: color-mix(in srgb, var(--warn) 10%, transparent);
}

.chaves-resumo.ok {
  border-color: color-mix(in srgb, var(--ok) 45%, var(--border));
  background: color-mix(in srgb, var(--ok) 8%, transparent);
}

.chave {
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-2);
}

.chave-topo {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.chave-nome {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.chave-tecnico {
  font-size: var(--fs-small);
  color: var(--text-soft);
}

.chave-usos {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: var(--fs-small);
}

.chave-chip {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-soft);
}

.chave-link {
  margin-top: 2px;
  width: fit-content;
}

.chave-edicao {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.chave-edicao input {
  flex: 1;
  min-width: 200px;
}

.chave-nota {
  flex-basis: 100%;
}

.chave-teste {
  margin: 0;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.chave-teste.ok {
  color: var(--ok);
  border-color: color-mix(in srgb, var(--ok) 45%, var(--border));
}

.chave-teste.erro {
  color: var(--error);
  border-color: color-mix(in srgb, var(--error) 45%, var(--border));
}

.chave-teste.andamento {
  color: var(--text-soft);
}
</style>
