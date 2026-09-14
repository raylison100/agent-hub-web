<script setup lang="ts">
import type { SessionSummary } from '@agent-hub/core'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { client } from '../daemon/client'
import { useAtualizacoes } from '../stores/atualizacoes'
import { useConnection } from '../stores/connection'
import { useSessions } from '../stores/sessions'
import ConfirmDialog from './ConfirmDialog.vue'
import ContextMenu, { type MenuItem } from './ContextMenu.vue'

defineEmits<{ collapse: [] }>()
const sessions = useSessions()
const connection = useConnection()
const route = useRoute()
const router = useRouter()
const query = ref('')
const showArchived = ref(false)
const menu = ref<{ x: number; y: number; session: SessionSummary } | null>(null)
const pendingDelete = ref<SessionSummary | null>(null)
const renaming = ref<{ id: string; title: string } | null>(null)
const selecionadas = ref(new Set<string>())
const ancora = ref<string | null>(null)
const pendingBulk = ref<'apagar' | 'apagar-tudo' | null>(null)
const novoGrupo = ref<string | null>(null)
const menuLista = ref<{ x: number; y: number } | null>(null)
const menuUsuario = ref<{ x: number; y: number } | null>(null)
const usuario = ref('')
const atualizacoes = useAtualizacoes()

onMounted(async () => {
  void atualizacoes.verificar()
  try {
    await connection.whenOnline()
    usuario.value = (await client.request({ type: 'stats.overview', days: 1 }, 'stats.overview', 15000)).stats.user
  } catch {
    usuario.value = ''
  }
})

const nomeUsuario = computed(() => (usuario.value ? usuario.value.charAt(0).toUpperCase() + usuario.value.slice(1) : 'Voce'))

const itensUsuario = computed<MenuItem[]>(() => [
  { id: 'settings', label: 'Configuracoes' },
  { id: 'appearance', label: 'Aparencia' },
  { id: 'connectors', label: 'Conectores' },
  { id: 'secrets', label: 'Chaves' },
  { id: 'sep', label: '', separator: true },
  { id: 'connection', label: `Conexao: ${connection.status === 'online' ? connection.device : connection.status}` },
])

function abrirMenuUsuario(e: MouseEvent): void {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  menuUsuario.value = { x: r.left, y: Math.max(8, r.top - 8 - 200) }
}

async function pickUsuario(id: string): Promise<void> {
  menuUsuario.value = null
  const rotas: Record<string, string> = {
    settings: '/settings',
    appearance: '/settings/aparencia',
    connectors: '/settings/conectores',
    secrets: '/settings/chaves',
    connection: '/settings/conexao',
  }
  const destino = rotas[id]
  if (destino) await router.push(destino)
}

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return sessions.sessions.filter((s) => {
    if (s.archived && !showArchived.value) return false
    return !q || `${s.title} ${s.agent} ${s.workspace}`.toLowerCase().includes(q)
  })
})

const pinned = computed(() => visible.value.filter((s) => s.pinned))

/** Nome do grupo: o que o usuario escolheu ou, sem escolha, a pasta da sessao. */
function grupoDe(s: SessionSummary): string {
  return s.group ?? (s.workspace.split(/[\\/]/).filter(Boolean).pop() ?? s.workspace)
}

const gruposExistentes = computed(() => [...new Set(sessions.sessions.map((s) => s.group).filter((g): g is string => Boolean(g)))].sort())

const ordenadas = computed(() => visible.value.filter((s) => !s.pinned))

const groups = computed(() => {
  const map = new Map<string, SessionSummary[]>()
  for (const s of visible.value) {
    if (s.pinned) continue
    const key = grupoDe(s)
    const list = map.get(key) ?? []
    list.push(s)
    map.set(key, list)
  }
  return [...map.entries()].sort((a, b) => (b[1][0]?.updatedAt ?? 0) - (a[1][0]?.updatedAt ?? 0))
})

const menuItems = computed<MenuItem[]>(() => {
  const s = menu.value?.session
  const running = s ? Boolean(sessions.runs.get(s.id) && !sessions.runs.get(s.id)!.finished) : false
  return [
    { id: 'open', label: 'Abrir' },
    { id: 'open-tab', label: 'Abrir em nova aba' },
    { id: 'sep1', label: '', separator: true },
    { id: 'pin', label: s?.pinned ? 'Desafixar' : 'Fixar', key: 'P' },
    { id: 'rename', label: 'Mudar o nome', key: 'R' },
    { id: 'fork', label: 'Bifurcar', key: 'F' },
    { id: 'copy', label: 'Copiar id da sessao', key: 'C' },
    { id: 'sep2', label: '', separator: true },
    { id: 'select', label: 'Selecionar', key: 'S' },
    { id: 'group', label: 'Mover para o grupo...' },
    { id: 'ungroup', label: 'Tirar do grupo', disabled: !s?.group },
    { id: 'sep3', label: '', separator: true },
    { id: 'archive', label: s?.archived ? 'Desarquivar' : 'Arquivar', key: 'A' },
    { id: 'delete', label: 'Apagar', key: 'D', danger: true, disabled: running },
  ]
})

const vazio = computed(() => sessions.sessions.length === 0)

const itensLista = computed<MenuItem[]>(() => [
  { id: 'select-all', label: 'Selecionar todas', key: 'A', disabled: visible.value.length === 0 },
  { id: 'archived', label: showArchived.value ? 'Ocultar arquivadas' : 'Mostrar arquivadas' },
  { id: 'sep', label: '', separator: true },
  { id: 'delete-all', label: 'Apagar todas as conversas', danger: true, disabled: vazio.value },
])

function abrirMenuLista(e: MouseEvent): void {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  menuLista.value = { x: r.left, y: r.bottom + 4 }
}

async function pickLista(id: string): Promise<void> {
  menuLista.value = null
  if (id === 'select-all') selecionarTodas()
  if (id === 'archived') {
    showArchived.value = !showArchived.value
    await sessions.refresh(showArchived.value)
  }
  if (id === 'delete-all' && !vazio.value) pendingBulk.value = 'apagar-tudo'
}

/** Clique com Shift seleciona o intervalo, com Ctrl alterna um item, sem modificador abre a sessao. */
function onClickSessao(e: MouseEvent, s: SessionSummary): void {
  if (e.shiftKey) {
    e.preventDefault()
    const lista = [...pinned.value, ...ordenadas.value].map((x) => x.id)
    const de = lista.indexOf(ancora.value ?? s.id)
    const ate = lista.indexOf(s.id)
    if (de >= 0 && ate >= 0) {
      const [inicio, fim] = de <= ate ? [de, ate] : [ate, de]
      for (const id of lista.slice(inicio, fim + 1)) selecionadas.value.add(id)
      selecionadas.value = new Set(selecionadas.value)
    }
    return
  }
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    alternarSelecao(s.id)
    return
  }
  if (selecionadas.value.size > 0) limparSelecao()
}

function alternarSelecao(id: string): void {
  const copia = new Set(selecionadas.value)
  if (copia.has(id)) copia.delete(id)
  else copia.add(id)
  selecionadas.value = copia
  ancora.value = id
}

function limparSelecao(): void {
  selecionadas.value = new Set()
  ancora.value = null
}

function selecionarTodas(): void {
  if (visible.value.length === 0) return
  selecionadas.value = new Set(visible.value.map((s) => s.id))
}

function arquivarSelecionadas(): void {
  sessions.updateMany([...selecionadas.value], { archived: true })
  limparSelecao()
}

function moverSelecionadas(grupo: string | null): void {
  sessions.updateMany([...selecionadas.value], { group: grupo })
  novoGrupo.value = null
  limparSelecao()
}

function confirmarGrupoNovo(): void {
  const nome = (novoGrupo.value ?? '').trim()
  if (nome) moverSelecionadas(nome)
  else novoGrupo.value = null
}

function apagarSelecionadas(): void {
  const ids = [...selecionadas.value]
  limparSelecao()
  sessions.removeMany(ids)
  if (ids.some((id) => isActive(id))) void router.push({ name: 'sessions' })
}

function apagarTodas(): void {
  const ids = sessions.sessions.map((s) => s.id)
  limparSelecao()
  sessions.removeMany(ids)
  void router.push({ name: 'sessions' })
}

function isActive(id: string): boolean {
  return route.name === 'chat' && route.params.id === id
}

function mark(s: SessionSummary): string {
  const run = sessions.runs.get(s.id)
  if (run && !run.finished) return 'running'
  if (s.origin !== 'user') return 'auto'
  return ''
}

/** Abre o menu da sessao. O WebView2 do Windows nao entrega `contextmenu` a pagina, entao o botao direito do mouse tambem dispara. */
function openMenu(e: MouseEvent, session: SessionSummary): void {
  e.preventDefault()
  e.stopPropagation()
  menu.value = { x: e.clientX, y: e.clientY, session }
}

async function pick(id: string): Promise<void> {
  const s = menu.value?.session
  menu.value = null
  if (!s) return
  switch (id) {
    case 'open':
      await router.push({ name: 'chat', params: { id: s.id } })
      return
    case 'open-tab':
      window.open(`/session/${s.id}`, '_blank')
      return
    case 'pin':
      await sessions.update(s.id, { pinned: !s.pinned })
      return
    case 'rename':
      renaming.value = { id: s.id, title: s.title }
      return
    case 'fork': {
      const copy = await sessions.fork(s.id)
      await router.push({ name: 'chat', params: { id: copy.id } })
      return
    }
    case 'copy':
      await navigator.clipboard.writeText(s.id).catch(() => undefined)
      return
    case 'archive':
      await sessions.update(s.id, { archived: !s.archived })
      if (s.archived === false && isActive(s.id)) await router.push({ name: 'sessions' })
      return
    case 'select':
      alternarSelecao(s.id)
      return
    case 'group':
      selecionadas.value = new Set([s.id])
      novoGrupo.value = ''
      return
    case 'ungroup':
      await sessions.update(s.id, { group: null })
      return
    case 'delete':
      pendingDelete.value = s
      return
  }
}

/** Confirmacao propria: o `confirm` do navegador nao existe no webview do desktop e a acao morria em silencio. */
async function confirmDelete(): Promise<void> {
  const s = pendingDelete.value
  pendingDelete.value = null
  if (!s) return
  await sessions.remove(s.id)
  if (isActive(s.id)) await router.push({ name: 'sessions' })
}

async function commitRename(): Promise<void> {
  const r = renaming.value
  renaming.value = null
  if (r && r.title.trim()) await sessions.update(r.id, { title: r.title.trim() })
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-top">
      <RouterLink to="/" class="brand">Agent Hub</RouterLink>
      <button class="icon" title="Recolher" @click="$emit('collapse')">|<</button>
    </div>
    <RouterLink to="/" class="new-session">+ Novo</RouterLink>
    <div class="search-row">
      <input v-model="query" class="search" type="search" placeholder="Buscar sessoes" />
      <button class="icon" title="Mais acoes da lista" @click="abrirMenuLista">...</button>
    </div>
    <div v-if="selecionadas.size > 0" class="bulk-bar">
      <div class="bulk-linha">
        <span class="bulk-count">{{ selecionadas.size }} selecionada{{ selecionadas.size > 1 ? 's' : '' }}</span>
        <button class="link small" @click="limparSelecao">limpar</button>
      </div>
      <div class="bulk-acoes">
        <button class="chip-button" @click="novoGrupo = ''">Agrupar</button>
        <button class="chip-button" @click="arquivarSelecionadas">Arquivar</button>
        <button class="chip-button perigo" @click="pendingBulk = 'apagar'">Apagar</button>
      </div>
    </div>
    <div v-if="novoGrupo !== null" class="bulk-bar coluna">
      <input
        v-model="novoGrupo"
        class="rename"
        type="text"
        placeholder="Nome do grupo novo"
        @keydown.enter.prevent="confirmarGrupoNovo"
        @keydown.esc.prevent="novoGrupo = null"
      />
      <div class="bulk-grupos">
        <button v-for="g in gruposExistentes" :key="g" class="chip-button" @click="moverSelecionadas(g)">{{ g }}</button>
        <button class="chip-button" @click="moverSelecionadas(null)">Sem grupo</button>
      </div>
    </div>
    <div class="sidebar-scroll">
      <div v-if="pinned.length" class="group">
        <div class="group-title">Fixadas</div>
        <template v-for="s in pinned" :key="s.id">
          <input
            v-if="renaming?.id === s.id"
            v-model="renaming.title"
            class="rename"
            type="text"
            autofocus
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="renaming = null"
            @blur="commitRename"
          />
          <RouterLink v-else :to="{ name: 'chat', params: { id: s.id } }" class="session-link" :class="{ active: isActive(s.id), selecionada: selecionadas.has(s.id) }" :title="`${s.agent} em ${s.workspace}`" @click="onClickSessao($event, s)" @contextmenu="openMenu($event, s)" @mouseup.right="openMenu($event, s)">
            <span v-if="selecionadas.has(s.id)" class="check">v</span>
            <span v-else class="dot" :data-mark="mark(s)"></span>
            <span class="session-title">{{ s.title }}</span>
            <span class="session-cost">{{ s.costUsd.toFixed(2) }}</span>
          </RouterLink>
        </template>
      </div>
      <div v-for="[project, list] in groups" :key="project" class="group">
        <div class="group-title">{{ project }}</div>
        <template v-for="s in list" :key="s.id">
          <input
            v-if="renaming?.id === s.id"
            v-model="renaming.title"
            class="rename"
            type="text"
            autofocus
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="renaming = null"
            @blur="commitRename"
          />
          <RouterLink
            v-else
            :to="{ name: 'chat', params: { id: s.id } }"
            class="session-link"
            :class="{ active: isActive(s.id), archived: s.archived, selecionada: selecionadas.has(s.id) }"
            :title="`${s.agent} em ${s.workspace}`"
            @click="onClickSessao($event, s)"
            @contextmenu="openMenu($event, s)"
            @mouseup.right="openMenu($event, s)"
          >
            <span v-if="selecionadas.has(s.id)" class="check">v</span>
            <span v-else class="dot" :data-mark="mark(s)"></span>
            <span class="session-title">{{ s.title }}</span>
            <span class="session-cost">{{ s.costUsd.toFixed(2) }}</span>
          </RouterLink>
        </template>
      </div>
      <p v-if="!visible.length" class="muted small pad">Nenhuma sessao.</p>
    </div>
    <div class="user-area">
      <RouterLink v-if="atualizacoes.temNovidade" to="/settings/atualizacoes" class="aviso-versao">
        Versao nova disponivel{{ atualizacoes.appNova ? `: ${atualizacoes.appNova.versao}` : atualizacoes.daemon?.ultima ? `: ${atualizacoes.daemon.ultima}` : '' }}
      </RouterLink>
      <button class="user-bar" @click="abrirMenuUsuario">
        <span class="avatar">{{ nomeUsuario.charAt(0) }}</span>
        <span class="user-nome">{{ nomeUsuario }}</span>
        <span class="status-dot" :data-status="connection.status" :title="connection.status === 'online' ? connection.device : connection.status"></span>
      </button>
    </div>
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :items="menuItems" @pick="pick" @close="menu = null" />
    <ContextMenu v-if="menuLista" :x="menuLista.x" :y="menuLista.y" :items="itensLista" @pick="pickLista" @close="menuLista = null" />
    <ContextMenu v-if="menuUsuario" :x="menuUsuario.x" :y="menuUsuario.y" :items="itensUsuario" @pick="pickUsuario" @close="menuUsuario = null" />
    <ConfirmDialog
      v-if="pendingBulk === 'apagar'"
      :title="`Apagar ${selecionadas.size} conversas?`"
      detail="O historico delas some. O custo ja registrado continua no ledger."
      confirm-label="Apagar"
      @confirm="apagarSelecionadas(); pendingBulk = null"
      @cancel="pendingBulk = null"
    />
    <ConfirmDialog
      v-if="pendingBulk === 'apagar-tudo'"
      :title="`Apagar todas as ${sessions.sessions.length} conversas?`"
      detail="Some tudo, inclusive as arquivadas. O custo ja registrado continua no ledger."
      confirm-label="Apagar tudo"
      @confirm="apagarTodas(); pendingBulk = null"
      @cancel="pendingBulk = null"
    />
    <ConfirmDialog
      v-if="pendingDelete"
      :title="`Apagar a sessao ${pendingDelete.title.slice(0, 60)}?`"
      detail="O historico e removido. O custo ja registrado continua no ledger."
      confirm-label="Apagar"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </aside>
</template>
