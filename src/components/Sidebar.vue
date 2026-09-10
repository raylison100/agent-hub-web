<script setup lang="ts">
import type { SessionSummary } from '@agent-hub/core'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConnection } from '../stores/connection'
import { useSessions } from '../stores/sessions'
import ContextMenu, { type MenuItem } from './ContextMenu.vue'

defineEmits<{ collapse: [] }>()
const sessions = useSessions()
const connection = useConnection()
const route = useRoute()
const router = useRouter()
const query = ref('')
const showArchived = ref(false)
const menu = ref<{ x: number; y: number; session: SessionSummary } | null>(null)
const renaming = ref<{ id: string; title: string } | null>(null)

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return sessions.sessions.filter((s) => {
    if (s.archived && !showArchived.value) return false
    return !q || `${s.title} ${s.agent} ${s.workspace}`.toLowerCase().includes(q)
  })
})

const pinned = computed(() => visible.value.filter((s) => s.pinned))

const groups = computed(() => {
  const map = new Map<string, SessionSummary[]>()
  for (const s of visible.value) {
    if (s.pinned) continue
    const key = s.workspace.split(/[\\/]/).filter(Boolean).pop() ?? s.workspace
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
    { id: 'archive', label: s?.archived ? 'Desarquivar' : 'Arquivar', key: 'A' },
    { id: 'delete', label: 'Apagar', key: 'D', danger: true, disabled: running },
  ]
})

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
    case 'delete':
      if (!window.confirm(`Apagar a sessao "${s.title}"? O historico e removido; o custo fica no ledger.`)) return
      await sessions.remove(s.id)
      if (isActive(s.id)) await router.push({ name: 'sessions' })
      return
  }
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
    <input v-model="query" class="search" type="search" placeholder="Buscar sessoes" />
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
          <RouterLink v-else :to="{ name: 'chat', params: { id: s.id } }" class="session-link" :class="{ active: isActive(s.id) }" :title="`${s.agent} em ${s.workspace}`" @contextmenu="openMenu($event, s)" @mouseup.right="openMenu($event, s)">
            <span class="dot" :data-mark="mark(s)"></span>
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
            :class="{ active: isActive(s.id), archived: s.archived }"
            :title="`${s.agent} em ${s.workspace}`"
            @contextmenu="openMenu($event, s)" @mouseup.right="openMenu($event, s)"
          >
            <span class="dot" :data-mark="mark(s)"></span>
            <span class="session-title">{{ s.title }}</span>
            <span class="session-cost">{{ s.costUsd.toFixed(2) }}</span>
          </RouterLink>
        </template>
      </div>
      <p v-if="!visible.length" class="muted small pad">Nenhuma sessao.</p>
    </div>
    <label class="archived-toggle">
      <input v-model="showArchived" type="checkbox" @change="sessions.refresh(showArchived)" />
      mostrar arquivadas
    </label>
    <nav class="sidebar-bottom">
      <RouterLink to="/costs">Custos</RouterLink>
      <RouterLink to="/agents">Agentes</RouterLink>
      <RouterLink to="/automations">Automacoes</RouterLink>
      <RouterLink to="/secrets">Chaves</RouterLink>
      <RouterLink to="/connect" class="status" :data-status="connection.status">
        {{ connection.status === 'online' ? connection.device : connection.status }}
      </RouterLink>
    </nav>
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :items="menuItems" @pick="pick" @close="menu = null" />
  </aside>
</template>
