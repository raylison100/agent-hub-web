<script setup lang="ts">
import type { ConectorEditavel, RoleSummary, ServerFrame, VariavelDoConector } from '@agent-hub/core'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Field from '../components/ui/Field.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { avisar, confirmar, mensagemDeErro } from '../ui/feedback'

type Servidor = Extract<ServerFrame, { type: 'mcp.servers' }>['servers'][number]

interface Linha {
  id: number
  nome: string
  valor: string
  chave: string | null
  definida: boolean
  chaveOriginal: string | null
  tipoEscolhido: boolean
}

interface Argumento {
  id: number
  valor: string
}

const props = defineProps<{ nome: string }>()
const router = useRouter()

const carregando = ref(true)
const falha = ref('')
const dePlugin = ref(false)
const salvando = ref(false)
const testando = ref(false)
const original = ref('')
const nome = ref('')
const transporte = ref<'stdio' | 'http'>('stdio')
const comando = ref('')
const argumentos = ref<Argumento[]>([])
const url = ref('')
const env = ref<Linha[]>([])
const headers = ref<Linha[]>([])
const ligado = ref(true)
const agentes = ref<RoleSummary[]>([])
const agentesMarcados = ref<string[]>([])
const agentesSalvos = ref<string[]>([])
const servidor = ref<Servidor | null>(null)
const comandoInteiro = ref('')
const erros = ref<Record<string, string>>({})
const resultado = ref<{ ok: boolean; texto: string } | null>(null)
const liberarSaida = ref(false)
const estadoSalvo = ref('')
let proximoId = 1
let desligar: (() => void) | null = null

const PARECE_SECRETO = /token|key|secret|senha|password|authorization|api/i

const editando = computed(() => original.value !== '')

const estadoAtual = computed(() => JSON.stringify({ nome: nome.value, transporte: transporte.value, comando: comando.value, argumentos: argumentos.value.map((a) => a.valor), url: url.value, env: env.value.map(resumo), headers: headers.value.map(resumo), ligado: ligado.value, agentes: [...agentesMarcados.value].sort() }))

const mudou = computed(() => !carregando.value && !falha.value && !dePlugin.value && estadoAtual.value !== estadoSalvo.value)

function resumo(l: Linha): [string, string, string | null] {
  return [l.nome, l.valor, l.chave]
}

function paraLinha(v: VariavelDoConector): Linha {
  return { id: proximoId++, nome: v.nome, valor: v.valor, chave: v.chave, definida: Boolean(v.definida), chaveOriginal: v.chave, tipoEscolhido: true }
}

function paraVariavel(l: Linha): VariavelDoConector {
  return { nome: l.nome.trim(), valor: l.valor, chave: l.chave, definida: l.chave !== null && l.chave === l.chaveOriginal && l.definida }
}

function aplicar(c: ConectorEditavel, usados: string[]): void {
  original.value = c.name
  nome.value = c.name
  transporte.value = c.transporte
  comando.value = c.command
  argumentos.value = c.args.map((valor) => ({ id: proximoId++, valor }))
  url.value = c.url
  env.value = c.env.map(paraLinha)
  headers.value = c.headers.map(paraLinha)
  ligado.value = c.enabled
  agentesMarcados.value = [...usados]
  agentesSalvos.value = [...usados]
  estadoSalvo.value = estadoAtual.value
}

function novaLinha(lista: Linha[]): void {
  lista.push({ id: proximoId++, nome: '', valor: '', chave: null, definida: false, chaveOriginal: null, tipoEscolhido: false })
}

function removerLinha(lista: Linha[], id: number): void {
  const i = lista.findIndex((l) => l.id === id)
  if (i >= 0) lista.splice(i, 1)
}

function aoDigitarNome(l: Linha): void {
  if (l.tipoEscolhido) return
  l.chave = PARECE_SECRETO.test(l.nome) ? (l.chaveOriginal ?? '') : null
}

function mudarTipo(l: Linha, tipo: string): void {
  l.tipoEscolhido = true
  l.chave = tipo === 'secreta' ? (l.chaveOriginal ?? '') : null
}

function novoArgumento(): void {
  argumentos.value.push({ id: proximoId++, valor: '' })
}

function removerArgumento(id: number): void {
  argumentos.value = argumentos.value.filter((a) => a.id !== id)
}

/** Separa um comando digitado em partes, respeitando trechos entre aspas. */
function separarComando(texto: string): string[] {
  const partes: string[] = []
  let atual = ''
  let aspas: string | null = null
  let temParte = false
  for (const ch of texto.trim()) {
    if (aspas) {
      if (ch === aspas) aspas = null
      else atual += ch
    } else if (ch === '"' || ch === "'") {
      aspas = ch
      temParte = true
    } else if (/\s/.test(ch)) {
      if (temParte || atual) partes.push(atual)
      atual = ''
      temParte = false
    } else {
      atual += ch
    }
  }
  if (temParte || atual) partes.push(atual)
  return partes
}

function aplicarComandoInteiro(): void {
  const partes = separarComando(comandoInteiro.value)
  if (!partes.length) return
  comando.value = partes[0]!
  argumentos.value = partes.slice(1).map((valor) => ({ id: proximoId++, valor }))
  comandoInteiro.value = ''
}

function alternarAgente(agente: string, marcado: boolean): void {
  agentesMarcados.value = marcado ? [...agentesMarcados.value.filter((a) => a !== agente), agente] : agentesMarcados.value.filter((a) => a !== agente)
}

function repetidos(lista: Linha[]): boolean {
  const nomes = lista.map((l) => l.nome.trim()).filter(Boolean)
  return new Set(nomes).size !== nomes.length
}

function validar(): boolean {
  const e: Record<string, string> = {}
  if (!nome.value.trim()) e.nome = 'Dê um nome ao conector.'
  else if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(nome.value.trim())) e.nome = 'Use só letras, números e hífen, sem espaço.'
  if (transporte.value === 'stdio' && !comando.value.trim()) e.comando = 'Informe o comando que inicia o programa.'
  if (transporte.value === 'http') {
    if (!url.value.trim()) e.url = 'Informe o endereço do serviço.'
    else if (!/^https?:\/\/\S+$/i.test(url.value.trim())) e.url = 'O endereço precisa começar com http:// ou https://.'
  }
  if (transporte.value === 'stdio' && repetidos(env.value)) e.env = 'Há variáveis com o mesmo nome. Cada nome só pode aparecer uma vez.'
  if (transporte.value === 'http' && repetidos(headers.value)) e.headers = 'Há cabeçalhos com o mesmo nome. Cada nome só pode aparecer uma vez.'
  erros.value = e
  return Object.keys(e).length === 0
}

function montar(): ConectorEditavel {
  return {
    name: nome.value.trim(),
    transporte: transporte.value,
    command: transporte.value === 'stdio' ? comando.value.trim() : '',
    args: transporte.value === 'stdio' ? argumentos.value.map((a) => a.valor.trim()).filter(Boolean) : [],
    url: transporte.value === 'http' ? url.value.trim() : '',
    env: transporte.value === 'stdio' ? env.value.filter((l) => l.nome.trim()).map(paraVariavel) : [],
    headers: transporte.value === 'http' ? headers.value.filter((l) => l.nome.trim()).map(paraVariavel) : [],
    enabled: ligado.value,
  }
}

async function atualizarServidor(): Promise<void> {
  const res = await client.request({ type: 'mcp.servers' }, 'mcp.servers').catch(() => null)
  if (res) servidor.value = res.servers.find((s) => s.name === original.value) ?? null
}

async function gravar(): Promise<boolean> {
  if (!validar()) {
    avisar('Confira os campos marcados.', 'erro')
    return false
  }
  salvando.value = true
  resultado.value = null
  try {
    const era = original.value
    const marcados = [...agentesMarcados.value]
    const res = await client.request({ type: 'mcp.save', conector: montar(), original: era || undefined }, 'mcp.detail', 30000)
    const antes = [...res.agentes].sort().join(',')
    let usados = res.agentes
    if (antes !== [...marcados].sort().join(',')) {
      usados = (await client.request({ type: 'mcp.agents', name: res.conector.name, agents: marcados }, 'mcp.agents', 30000)).agents
    }
    aplicar(res.conector, usados)
    if (!era) await router.replace(`/settings/conectores/${encodeURIComponent(res.conector.name)}`)
    await atualizarServidor()
    return true
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
    return false
  } finally {
    salvando.value = false
  }
}

async function salvar(): Promise<void> {
  if (await gravar()) avisar('Conector salvo.')
}

async function salvarETestar(): Promise<void> {
  if (!(await gravar())) return
  if (!ligado.value) {
    resultado.value = { ok: false, texto: 'O conector foi salvo, mas está desligado. Ligue o conector para testar a conexão.' }
    return
  }
  testando.value = true
  try {
    await client.request({ type: 'mcp.connect', name: original.value }, 'mcp.saved', 90000)
    await atualizarServidor()
    const n = servidor.value?.tools ?? 0
    resultado.value = { ok: true, texto: `Conector salvo e conectado. ${n} ${n === 1 ? 'ferramenta disponível' : 'ferramentas disponíveis'}.` }
  } catch (err) {
    await atualizarServidor()
    resultado.value = { ok: false, texto: mensagemDeErro(err) }
  } finally {
    testando.value = false
  }
}

function voltar(): void {
  void router.push('/settings/conectores')
}

onBeforeRouteLeave(async (para) => {
  if (liberarSaida.value || !mudou.value) return true
  if (para.name === 'connector-editor') return true
  return confirmar({ titulo: 'Descartar alterações?', detalhe: 'O que você mudou neste conector ainda não foi salvo.', botao: 'Descartar', perigo: true })
})

onMounted(async () => {
  desligar = client.on((f) => {
    if (f.type === 'mcp.servers' && original.value) servidor.value = f.servers.find((s) => s.name === original.value) ?? null
  })
  await useConnection().whenOnline().catch(() => undefined)
  try {
    const lista = await client.request({ type: 'agents.list' }, 'agents.list')
    agentes.value = [...lista.roles].sort((a, b) => a.name.localeCompare(b.name))
    if (props.nome === 'novo') {
      estadoSalvo.value = estadoAtual.value
    } else {
      try {
        const detalhe = await client.request({ type: 'mcp.get', name: props.nome }, 'mcp.detail')
        aplicar(detalhe.conector, detalhe.agentes)
        await atualizarServidor()
      } catch (err) {
        const msg = mensagemDeErro(err)
        if (msg.includes('conector não encontrado')) dePlugin.value = true
        else falha.value = msg
      }
    }
  } catch (err) {
    falha.value = mensagemDeErro(err)
  } finally {
    carregando.value = false
  }
})

onUnmounted(() => desligar?.())
</script>

<template>
  <div class="ui-page">
    <PageHeader :titulo="editando ? `Editar ${original}` : props.nome === 'novo' ? 'Novo conector' : 'Conector'" descricao="Diga como o agente chega até o programa ou serviço e quais agentes podem usar este conector.">
      <template #acoes>
        <button type="button" @click="voltar">Voltar</button>
      </template>
    </PageHeader>

    <EmptyState v-if="carregando" titulo="Carregando" carregando />
    <EmptyState v-else-if="dePlugin" titulo="Esse conector vem de um plugin" texto="Ele é configurado na tela Plugins e skills, junto com o plugin que o instalou.">
      <RouterLink to="/settings/plugins" class="ui-link-botao">Abrir Plugins e skills</RouterLink>
    </EmptyState>
    <EmptyState v-else-if="falha" titulo="Não consegui abrir o conector" :texto="falha">
      <button type="button" @click="voltar">Voltar para a lista</button>
    </EmptyState>

    <form v-else class="conector-editor" novalidate @submit.prevent="salvar">
      <Card v-if="servidor" titulo="Situação">
        <div class="conector-situacao">
          <StatusBadge v-if="!servidor.enabled" estado="desligado" texto="Desligado" />
          <StatusBadge v-else-if="servidor.oauth === 'pendente'" estado="atencao" texto="Aguardando autorização" />
          <StatusBadge v-else-if="servidor.error" estado="erro" texto="Com erro" />
          <StatusBadge v-else-if="servidor.connected" estado="ok" texto="Conectado" />
          <StatusBadge v-else estado="atencao" texto="Não conectado ainda" />
          <span v-if="servidor.connected" class="muted small">{{ servidor.tools }} {{ servidor.tools === 1 ? 'ferramenta' : 'ferramentas' }}</span>
        </div>
        <p v-if="servidor.error && !resultado" class="conector-bloco erro small">{{ servidor.error }}</p>
      </Card>

      <Card titulo="Básico">
        <div class="ui-form">
          <Field rotulo="Nome" obrigatorio :erro="erros.nome" :ajuda="editando ? 'O nome de um conector já criado não pode ser trocado.' : 'Letras, números e hífen, sem espaço. Ex.: arquivos-do-projeto'">
            <input v-model="nome" type="text" spellcheck="false" autocomplete="off" :readonly="editando" placeholder="ex.: arquivos-do-projeto" />
          </Field>

          <div class="ui-field">
            <span class="ui-field-rotulo">Tipo</span>
            <div class="conector-tipos" role="radiogroup" aria-label="Tipo de conector">
              <label :class="['conector-tipo', { ativo: transporte === 'stdio' }]">
                <input v-model="transporte" type="radio" name="conector-tipo" value="stdio" />
                <strong>Programa nesta máquina</strong>
                <span class="muted small">Um programa que roda no seu computador, iniciado por um comando.</span>
              </label>
              <label :class="['conector-tipo', { ativo: transporte === 'http' }]">
                <input v-model="transporte" type="radio" name="conector-tipo" value="http" />
                <strong>Serviço na internet</strong>
                <span class="muted small">Um serviço acessado por um endereço, como https://exemplo.com/mcp.</span>
              </label>
            </div>
          </div>

          <template v-if="transporte === 'stdio'">
            <Field rotulo="Colar comando inteiro" ajuda="Opcional. Cole o comando completo e clique em Separar para preencher comando e argumentos.">
              <div class="conector-linha-simples">
                <input v-model="comandoInteiro" type="text" class="mono" spellcheck="false" autocomplete="off" placeholder="npx -y @modelcontextprotocol/server-filesystem" @keydown.enter.prevent="aplicarComandoInteiro" />
                <button type="button" :disabled="!comandoInteiro.trim()" @click="aplicarComandoInteiro">Separar</button>
              </div>
            </Field>

            <Field rotulo="Comando" obrigatorio :erro="erros.comando" ajuda="O programa que inicia o conector.">
              <input v-model="comando" type="text" class="mono" spellcheck="false" autocomplete="off" placeholder="ex.: npx" />
            </Field>

            <div class="ui-field">
              <span class="ui-field-rotulo">Argumentos</span>
              <p v-if="!argumentos.length" class="muted small conector-nota">Nenhum argumento. Adicione um por linha, na ordem em que aparecem no comando.</p>
              <div v-for="(a, i) in argumentos" :key="a.id" class="conector-linha-simples">
                <input v-model="a.valor" type="text" class="mono" spellcheck="false" autocomplete="off" :aria-label="`Argumento ${i + 1}`" :placeholder="i === 0 ? 'ex.: -y' : ''" />
                <button type="button" @click="removerArgumento(a.id)">Remover</button>
              </div>
              <div>
                <button type="button" @click="novoArgumento">Adicionar argumento</button>
              </div>
            </div>
          </template>

          <Field v-else rotulo="Endereço (URL)" obrigatorio :erro="erros.url" ajuda="O endereço que a documentação do serviço indica.">
            <input v-model="url" type="url" class="mono" spellcheck="false" autocomplete="off" placeholder="https://exemplo.com/mcp" />
          </Field>
        </div>
      </Card>

      <Card
        :titulo="transporte === 'stdio' ? 'Variáveis de ambiente' : 'Cabeçalhos'"
        :descricao="transporte === 'stdio' ? 'Configurações que o programa lê ao iniciar, como uma chave de acesso.' : 'Informações enviadas junto com cada pedido ao serviço, como uma chave de acesso.'"
      >
        <p v-if="transporte === 'stdio' ? erros.env : erros.headers" class="ui-field-erro">{{ transporte === 'stdio' ? erros.env : erros.headers }}</p>
        <p v-if="!(transporte === 'stdio' ? env : headers).length" class="muted small conector-nota">Nada configurado. A maioria dos conectores só precisa disso quando pede uma chave.</p>
        <ul v-else class="ui-lista">
          <li v-for="l in transporte === 'stdio' ? env : headers" :key="l.id" class="ui-lista-item conector-variavel">
            <label class="ui-field">
              <span class="ui-field-rotulo">Nome</span>
              <input v-model="l.nome" type="text" class="mono" spellcheck="false" autocomplete="off" :placeholder="transporte === 'stdio' ? 'ex.: API_TOKEN' : 'ex.: Authorization'" @input="aoDigitarNome(l)" />
            </label>
            <label class="ui-field">
              <span class="ui-field-rotulo">Tipo</span>
              <select :value="l.chave === null ? 'texto' : 'secreta'" @change="mudarTipo(l, ($event.target as HTMLSelectElement).value)">
                <option value="texto">Texto comum</option>
                <option value="secreta">Chave secreta</option>
              </select>
            </label>
            <label class="ui-field conector-valor">
              <span class="ui-field-rotulo">Valor</span>
              <input
                v-if="l.chave === null"
                v-model="l.valor"
                type="text"
                class="mono"
                spellcheck="false"
                autocomplete="off"
              />
              <input
                v-else
                v-model="l.valor"
                type="password"
                autocomplete="new-password"
                :placeholder="l.chave === l.chaveOriginal && l.definida ? 'deixe vazio para manter a atual' : 'cole a chave aqui'"
              />
              <span v-if="l.chave !== null" class="conector-chave">
                <StatusBadge v-if="l.valor || (l.chave === l.chaveOriginal && l.definida)" estado="ok" :texto="l.valor ? 'Será guardada ao salvar' : 'Chave guardada'" />
                <StatusBadge v-else estado="atencao" texto="Falta cadastrar" />
                <span v-if="l.chave" class="muted small mono">Guardada no cofre como {{ l.chave }}</span>
                <span v-else class="muted small">O nome no cofre é criado ao salvar.</span>
              </span>
            </label>
            <button type="button" class="conector-remover" @click="removerLinha(transporte === 'stdio' ? env : headers, l.id)">Remover</button>
          </li>
        </ul>
        <div>
          <button type="button" @click="novaLinha(transporte === 'stdio' ? env : headers)">{{ transporte === 'stdio' ? 'Adicionar variável' : 'Adicionar cabeçalho' }}</button>
        </div>
      </Card>

      <Card titulo="Agentes que usam" descricao="Só os agentes marcados enxergam as ferramentas deste conector.">
        <EmptyState v-if="agentes.length === 0" titulo="Nenhum agente criado ainda" texto="Crie agentes na tela Agentes e volte aqui para escolher quais usam este conector." />
        <ul v-else class="ui-lista">
          <li v-for="a in agentes" :key="a.name" class="ui-lista-item">
            <label class="ui-opcao conector-opcao">
              <input type="checkbox" :checked="agentesMarcados.includes(a.name)" @change="alternarAgente(a.name, ($event.target as HTMLInputElement).checked)" />
              <span class="ui-lista-item-texto">
                <strong>{{ a.name }}</strong>
                <span v-if="a.description" class="muted">{{ a.description }}</span>
              </span>
            </label>
          </li>
        </ul>
      </Card>

      <Card>
        <div class="conector-situacao conector-ligado">
          <span class="ui-lista-item-texto">
            <strong>Ligado</strong>
            <span class="muted">Desligado, o conector fica salvo, mas nenhum agente consegue usá-lo.</span>
          </span>
          <button type="button" role="switch" :aria-checked="ligado" :class="['ui-interruptor', { ligado }]" @click="ligado = !ligado">
            <span class="ui-interruptor-trilho" aria-hidden="true"><span class="ui-interruptor-bola"></span></span>
            {{ ligado ? 'Ligado' : 'Desligado' }}
          </button>
        </div>
      </Card>

      <div v-if="resultado" :class="['conector-bloco', resultado.ok ? 'ok' : 'erro']" role="status">
        <strong>{{ resultado.ok ? 'Conexão funcionando' : 'A conexão não funcionou' }}</strong>
        <span>{{ resultado.texto }}</span>
      </div>

      <div class="conector-rodape">
        <button type="submit" class="primary" :disabled="salvando || testando">{{ salvando && !testando ? 'Salvando...' : 'Salvar' }}</button>
        <button type="button" :disabled="salvando || testando" @click="salvarETestar">{{ testando ? 'Testando...' : 'Salvar e testar' }}</button>
        <button type="button" :disabled="salvando || testando" @click="voltar">Cancelar</button>
        <span class="spacer"></span>
        <span v-if="mudou" class="muted small">Alterações não salvas</span>
      </div>
    </form>
  </div>
</template>

<style scoped>
.conector-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.conector-tipos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-2);
}

.conector-tipo {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-2);
  color: var(--text);
  cursor: pointer;
}

.conector-tipo.ativo {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.conector-tipo:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.conector-tipo input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: 0;
  pointer-events: none;
}

.conector-linha-simples {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.conector-linha-simples input {
  flex: 1;
  min-width: 0;
  margin-top: 0;
}

.conector-nota {
  margin: 0;
}

.conector-variavel {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(130px, 160px) minmax(180px, 2fr) auto;
  align-items: start;
}

.conector-variavel input,
.conector-variavel select {
  margin-top: 0;
}

.conector-remover {
  margin-top: 20px;
}

.conector-chave {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  overflow-wrap: anywhere;
}

.conector-opcao {
  width: 100%;
  margin: 0;
}

.conector-situacao {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.conector-ligado {
  justify-content: space-between;
}

.conector-bloco {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.conector-bloco.erro {
  color: var(--error);
  border-color: color-mix(in srgb, var(--error) 45%, var(--border));
  background: color-mix(in srgb, var(--error) 8%, transparent);
}

.conector-bloco.ok {
  border-color: color-mix(in srgb, var(--ok) 45%, var(--border));
  background: color-mix(in srgb, var(--ok) 8%, transparent);
}

.conector-rodape {
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

@media (max-width: 720px) {
  .conector-variavel {
    grid-template-columns: 1fr;
  }

  .conector-remover {
    margin-top: 0;
    justify-self: start;
  }
}
</style>
