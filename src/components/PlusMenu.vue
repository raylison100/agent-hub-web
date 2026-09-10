<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { client } from '../daemon/client'

export interface Attachment {
  kind: 'file' | 'tree' | 'local'
  label: string
  text: string
}

const props = defineProps<{ sessionId?: string; workspace?: string; agent: string | undefined }>()
const emit = defineEmits<{ attach: [a: Attachment]; insert: [text: string]; close: [] }>()

type View = 'root' | 'files' | 'commands' | 'connectors' | 'plugins'
const view = ref<View>('root')
const error = ref('')
const path = ref('.')
const entries = ref<{ name: string; dir: boolean }[]>([])
const skills = ref<{ name: string; description: string; source: string }[]>([])
const prompts = ref<{ server: string; name: string; description?: string }[]>([])
const servers = ref<{ name: string; connected: boolean; transport: string }[]>([])
const plugins = ref<{ name: string; dir: string; skills: number; agents: number; mcp: number; hooks: number }[]>([])
const root = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

async function browse(next: string): Promise<void> {
  error.value = ''
  try {
    const res = await client.request({ type: 'fs.list', session_id: props.sessionId, workspace: props.workspace, path: next }, 'fs.list')
    path.value = res.path
    entries.value = res.entries
    view.value = 'files'
  } catch (err) {
    error.value = describe(err)
  }
}

function up(): void {
  const parts = path.value.split('/').filter((p) => p && p !== '.')
  parts.pop()
  void browse(parts.join('/') || '.')
}

async function attachFile(name: string): Promise<void> {
  const target = path.value === '.' ? name : `${path.value}/${name}`
  try {
    const res = await client.request({ type: 'fs.read', session_id: props.sessionId, workspace: props.workspace, path: target }, 'fs.read', 30000)
    emit('attach', { kind: 'file', label: res.path, text: `<arquivo path="${res.path}"${res.truncated ? ' truncado="true"' : ''}>\n${res.text}\n</arquivo>` })
    emit('close')
  } catch (err) {
    error.value = describe(err)
  }
}

async function attachTree(): Promise<void> {
  try {
    const res = await client.request({ type: 'fs.tree', session_id: props.sessionId, workspace: props.workspace, path: path.value, depth: 3 }, 'fs.tree', 30000)
    emit('attach', { kind: 'tree', label: `pasta ${res.path}`, text: `<pasta path="${res.path}">\n${res.text}\n</pasta>` })
    emit('close')
  } catch (err) {
    error.value = describe(err)
  }
}

function pickLocal(): void {
  fileInput.value?.click()
}

async function onLocalFiles(e: Event): Promise<void> {
  const files = (e.target as HTMLInputElement).files
  if (!files) return
  for (const f of files) {
    if (f.size > 2_000_000) {
      error.value = `${f.name}: acima de 2 MB`
      continue
    }
    const text = await f.text()
    emit('attach', { kind: 'local', label: f.name, text: `<arquivo path="${f.name}" origem="computador">\n${text}\n</arquivo>` })
  }
  emit('close')
}

async function loadCommands(): Promise<void> {
  error.value = ''
  try {
    const res = await client.request({ type: 'skills.list', agent: props.agent }, 'skills.list')
    skills.value = res.skills
    const srv = await client.request({ type: 'mcp.servers' }, 'mcp.servers')
    servers.value = srv.servers
    prompts.value = []
    for (const s of srv.servers.filter((x) => x.connected)) {
      const p = await client.request({ type: 'mcp.prompts', server: s.name }, 'mcp.prompts', 20000).catch(() => null)
      if (p) prompts.value.push(...p.prompts.map((x) => ({ server: s.name, name: x.name, description: x.description })))
    }
    view.value = 'commands'
  } catch (err) {
    error.value = describe(err)
  }
}

async function loadConnectors(): Promise<void> {
  error.value = ''
  try {
    servers.value = (await client.request({ type: 'mcp.servers' }, 'mcp.servers')).servers
    plugins.value = (await client.request({ type: 'plugins.list' }, 'plugins.list')).plugins
    view.value = 'connectors'
  } catch (err) {
    error.value = describe(err)
  }
}

async function connect(server: string): Promise<void> {
  error.value = ''
  try {
    await client.request({ type: 'mcp.prompts', server }, 'mcp.prompts', 30000)
    servers.value = (await client.request({ type: 'mcp.servers' }, 'mcp.servers')).servers
  } catch (err) {
    error.value = describe(err)
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function onPointer(e: MouseEvent): void {
  if (root.value && !root.value.contains(e.target as Node)) emit('close')
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  window.addEventListener('mousedown', onPointer)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  window.removeEventListener('mousedown', onPointer)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="popover left plus-menu">
    <input ref="fileInput" type="file" multiple hidden @change="onLocalFiles" />
    <template v-if="view === 'root'">
      <button class="menu-item" @click="browse('.')"><span>Anexar arquivo do workspace</span><span class="menu-key">&gt;</span></button>
      <button class="menu-item" @click="pickLocal"><span>Anexar arquivo do computador</span></button>
      <button class="menu-item" @click="browse('.').then(() => (view = 'files'))"><span>Adicionar pasta como arvore</span><span class="menu-key">&gt;</span></button>
      <div class="menu-sep"></div>
      <button class="menu-item" @click="loadCommands"><span>Comandos de barra</span><span class="menu-key">&gt;</span></button>
      <button class="menu-item" @click="loadConnectors"><span>Conectores e plugins</span><span class="menu-key">&gt;</span></button>
    </template>

    <template v-else-if="view === 'files'">
      <div class="menu-head">
        <button class="link" @click="view = 'root'">&lt; voltar</button>
        <code>{{ path }}</code>
        <button class="link" @click="attachTree">anexar esta pasta</button>
      </div>
      <div class="menu-list">
        <button v-if="path !== '.'" class="menu-item" @click="up"><span>..</span></button>
        <button v-for="e in entries" :key="e.name" class="menu-item" @click="e.dir ? browse(path === '.' ? e.name : `${path}/${e.name}`) : attachFile(e.name)">
          <span>{{ e.name }}{{ e.dir ? '/' : '' }}</span>
          <span class="menu-key">{{ e.dir ? '>' : 'anexar' }}</span>
        </button>
      </div>
    </template>

    <template v-else-if="view === 'commands'">
      <div class="menu-head"><button class="link" @click="view = 'root'">&lt; voltar</button><span class="muted small">insere no texto</span></div>
      <div class="menu-list">
        <div v-if="skills.length" class="group-title">Skills</div>
        <button v-for="s in skills" :key="s.name" class="menu-item" :title="s.description" @click="$emit('insert', `/${s.name} `)">
          <span>/{{ s.name }}</span><span class="menu-key">{{ s.source }}</span>
        </button>
        <div v-if="prompts.length" class="group-title">Prompts MCP</div>
        <button v-for="p in prompts" :key="`${p.server}:${p.name}`" class="menu-item" :title="p.description" @click="$emit('insert', `/${p.server}:${p.name} `)">
          <span>/{{ p.server }}:{{ p.name }}</span>
        </button>
        <div class="group-title">Anexos</div>
        <button class="menu-item" @click="$emit('insert', '/anexar servidor uri ')"><span>/anexar servidor uri</span><span class="menu-key">recurso MCP</span></button>
        <p v-if="!skills.length && !prompts.length" class="muted small pad">Nenhuma skill neste perfil e nenhum servidor MCP conectado.</p>
      </div>
    </template>

    <template v-else-if="view === 'connectors'">
      <div class="menu-head"><button class="link" @click="view = 'root'">&lt; voltar</button></div>
      <div class="menu-list">
        <RouterLink to="/settings/conectores" class="menu-item" @click="emit('close')"><span>Gerenciar conectores</span><span class="menu-key">&gt;</span></RouterLink>
        <div class="group-title">Servidores MCP</div>
        <button v-for="s in servers" :key="s.name" class="menu-item" @click="connect(s.name)">
          <span>{{ s.name }} <span class="muted small">{{ s.transport }}</span></span>
          <span class="menu-key">{{ s.connected ? 'conectado' : 'conectar' }}</span>
        </button>
        <p v-if="!servers.length" class="muted small pad">Nenhum servidor em agents/mcp.json.</p>
        <div class="group-title">Plugins</div>
        <div v-for="p in plugins" :key="p.name" class="menu-item static" :title="p.dir">
          <span>{{ p.name }}</span>
          <span class="menu-key">{{ p.skills }} skills, {{ p.agents }} agentes, {{ p.mcp }} mcp, {{ p.hooks }} hooks</span>
        </div>
        <p v-if="!plugins.length" class="muted small pad">Nenhum plugin em agents/plugins.json.</p>
      </div>
    </template>
    <p v-if="error" class="error small pad">{{ error }}</p>
  </div>
</template>
