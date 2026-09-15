<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { useSessions } from '../stores/sessions'

interface Server {
  name: string
  connected: boolean
  enabled: boolean
  transport: 'stdio' | 'http'
  command: string
  args: string[]
  url: string | null
  tools: number
  error: string | null
  agents: string[]
  oauth: 'autorizado' | 'pendente' | null
}

const connection = useConnection()
const sessions = useSessions()
const servers = ref<Server[]>([])
const selected = ref<string | null>(null)
const paste = ref('')
const adding = ref(false)
const error = ref('')
const info = ref('')
const secrets = ref<string[]>([])
const pendingRemove = ref<string | null>(null)
const busy = ref(false)

const exemplo = `{
  "mcpServers": {
    "meu-servidor": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }
}`

const current = computed(() => servers.value.find((s) => s.name === selected.value) ?? null)

onMounted(async () => {
  await connection.whenOnline()
  await sessions.loadAgents()
  await load()
})

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function load(): Promise<void> {
  try {
    servers.value = (await client.request({ type: 'mcp.servers' }, 'mcp.servers')).servers
    if (!selected.value || !servers.value.some((s) => s.name === selected.value)) selected.value = servers.value[0]?.name ?? null
  } catch (err) {
    error.value = describe(err)
  }
}

async function run(action: () => Promise<void>): Promise<void> {
  error.value = ''
  info.value = ''
  busy.value = true
  try {
    await action()
  } catch (err) {
    error.value = describe(err)
  } finally {
    busy.value = false
    await load()
  }
}

/** Tres estados que o usuario entende: conectado, desconectado por escolha dele, ou tentando e falhando. */
function estado(s: Server): { texto: string; tom: string } {
  if (!s.enabled) return { texto: 'Desconectado', tom: 'off' }
  if (s.connected) return { texto: 'Conectado', tom: 'on' }
  if (s.error) return { texto: 'Falhou', tom: 'error' }
  if (s.agents.length === 0) return { texto: 'Sem agente', tom: 'idle' }
  return { texto: 'Conectando...', tom: 'idle' }
}
async function importar(): Promise<void> {
  await run(async () => {
    const res = await client.request({ type: 'mcp.import', source: 'claude-code' }, 'mcp.saved', 30000)
    secrets.value = res.secrets
    info.value = `Importado: ${res.added.join(', ')}`
  })
}

async function adicionar(): Promise<void> {
  if (!paste.value.trim()) return
  await run(async () => {
    const res = await client.request({ type: 'mcp.add', text: paste.value }, 'mcp.saved', 30000)
    paste.value = ''
    adding.value = false
    secrets.value = res.secrets
    info.value = `Adicionado: ${res.added.join(', ')}`
    selected.value = res.added[0] ?? selected.value
  })
}

/** Conecta ou desconecta o servidor. Desconectar fica gravado no mcp.json, entao o daemon nao volta a subir sozinho. */
async function alternar(s: Server): Promise<void> {
  await run(async () => {
    await client.request({ type: 'mcp.toggle', name: s.name, enabled: !s.enabled }, 'mcp.saved', 60000)
  })
}

/** Abre o fluxo de OAuth do servidor no navegador; o daemon guarda o token quando o provedor devolve. */
function autorizar(nome: string): void {
  const base = typeof window === 'undefined' ? '' : window.location.origin.startsWith('http') ? window.location.origin : 'http://127.0.0.1:47311'
  window.open(`${base}/oauth/start?server=${encodeURIComponent(nome)}`, '_blank', 'noopener')
}

/** Liga ou desliga o servidor para um agente, editando a lista tools.mcp do perfil. */
async function alternarAgente(s: Server, agente: string): Promise<void> {
  const agentes = s.agents.includes(agente) ? s.agents.filter((a) => a !== agente) : [...s.agents, agente]
  await run(async () => {
    await client.request({ type: 'mcp.agents', name: s.name, agents: agentes }, 'mcp.agents', 30000)
  })
}

async function remover(): Promise<void> {
  const name = pendingRemove.value
  pendingRemove.value = null
  if (!name) return
  await run(async () => {
    await client.request({ type: 'mcp.remove', name }, 'mcp.saved', 30000)
  })
}
</script>

<template>
  <section class="settings-page">
    <div class="page-head">
      <div>
        <h1>Servidores MCP</h1>
        <p class="muted small">Adicione e gerencie os conectores que os agentes podem usar. Cada perfil escolhe quais deles enxerga.</p>
      </div>
      <div class="row">
        <button class="ghost" :disabled="busy" @click="importar">Importar do Claude Code</button>
        <button class="primary" :disabled="busy" @click="adding = !adding">Adicionar</button>
      </div>
    </div>

    <div v-if="adding" class="add-box">
      <p class="muted small">Cole o JSON que a documentação do servidor mostra. Aceita mcpServers, servers ou um servidor solto.</p>
      <textarea v-model="paste" rows="8" class="mono" :placeholder="exemplo" spellcheck="false"></textarea>
      <div class="row">
        <button class="primary" :disabled="busy || !paste.trim()" @click="adicionar">Salvar conector</button>
        <button class="ghost" @click="adding = false; paste = ''">Cancelar</button>
      </div>
    </div>

    <p v-if="info" class="muted small">{{ info }}</p>
    <p v-if="secrets.length" class="warn small">Cadastre em <RouterLink to="/settings/chaves">Chaves</RouterLink>: {{ secrets.join(', ') }}</p>
    <p v-if="error" class="error small">{{ error }}</p>

    <div v-if="servers.length" class="master-detail">
      <div class="master">
        <button
          v-for="s in servers"
          :key="s.name"
          class="master-item"
          :class="{ active: s.name === selected }"
          @click="selected = s.name"
        >
          <span>{{ s.name }}</span>
          <span class="tag" :data-state="estado(s).tom">{{ estado(s).texto }}</span>
        </button>
      </div>

      <div v-if="current" class="detail">
        <div class="detail-head">
          <h2>{{ current.name }}</h2>
          <span class="tag" :data-state="estado(current).tom">{{ estado(current).texto }}</span>
          <span class="spacer"></span>
          <button class="primary small" :disabled="busy" @click="alternar(current)">{{ current.enabled ? 'Desconectar' : 'Conectar' }}</button>
          <button v-if="current.oauth" class="ghost small" @click="autorizar(current.name)">
            {{ current.oauth === 'autorizado' ? 'Autorizar de novo' : 'Autorizar' }}
          </button>
          <button class="ghost small" :disabled="busy" @click="pendingRemove = current.name">Remover</button>
        </div>

        <template v-if="current.url">
          <h3>URL</h3>
          <p class="mono small break">{{ current.url }}</p>
        </template>
        <template v-else>
          <h3>Comando</h3>
          <p class="mono small">{{ current.command }}</p>
          <h3>Argumentos</h3>
          <p class="mono small break">{{ current.args?.join(' ') || '-' }}</p>
        </template>

        <h3>Agentes que usam</h3>
        <div class="agent-chips">
          <button
            v-for="a in sessions.agents"
            :key="a.name"
            class="chip-button"
            :class="{ auto: current.agents?.includes(a.name) }"
            :disabled="busy"
            @click="alternarAgente(current, a.name)"
          >
            {{ a.name }}
          </button>
        </div>
        <p v-if="!current.agents?.length" class="warn small">Nenhum agente usa este conector. Marque um agente acima e o daemon passa a manter a conexão dele sozinho.</p>

        <h3>Ferramentas</h3>
        <p class="small">{{ current.connected ? `${current.tools} disponíveis` : 'conecte para listar' }}</p>

        <template v-if="current.error">
          <h3 class="error">Erro</h3>
          <p class="error small break">{{ current.error }}</p>
        </template>
      </div>
    </div>
    <p v-else class="muted small">Nenhum conector configurado. Importe do Claude Code ou cole um JSON.</p>

    <ConfirmDialog
      v-if="pendingRemove"
      :title="`Remover o conector ${pendingRemove}?`"
      detail="O servidor sai do mcp.json. As chaves cadastradas continuam salvas."
      confirm-label="Remover"
      @confirm="remover"
      @cancel="pendingRemove = null"
    />
  </section>
</template>
