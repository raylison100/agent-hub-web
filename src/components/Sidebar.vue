<script setup lang="ts">
import type { SessionSummary } from '@agent-hub/core'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useConnection } from '../stores/connection'
import { useSessions } from '../stores/sessions'

defineEmits<{ collapse: [] }>()
const sessions = useSessions()
const connection = useConnection()
const route = useRoute()
const query = ref('')

const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  const map = new Map<string, SessionSummary[]>()
  for (const s of sessions.sessions) {
    if (q && !`${s.title} ${s.agent} ${s.workspace}`.toLowerCase().includes(q)) continue
    const key = s.workspace.split(/[\\/]/).filter(Boolean).pop() ?? s.workspace
    const list = map.get(key) ?? []
    list.push(s)
    map.set(key, list)
  }
  return [...map.entries()].sort((a, b) => (b[1][0]?.updatedAt ?? 0) - (a[1][0]?.updatedAt ?? 0))
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
      <div v-for="[project, list] in groups" :key="project" class="group">
        <div class="group-title">{{ project }}</div>
        <RouterLink
          v-for="s in list"
          :key="s.id"
          :to="{ name: 'chat', params: { id: s.id } }"
          class="session-link"
          :class="{ active: isActive(s.id) }"
          :title="`${s.agent} em ${s.workspace}`"
        >
          <span class="dot" :data-mark="mark(s)"></span>
          <span class="session-title">{{ s.title }}</span>
          <span class="session-cost">{{ s.costUsd.toFixed(2) }}</span>
        </RouterLink>
      </div>
      <p v-if="!groups.length" class="muted small pad">Nenhuma sessao.</p>
    </div>
    <nav class="sidebar-bottom">
      <RouterLink to="/costs">Custos</RouterLink>
      <RouterLink to="/agents">Agentes</RouterLink>
      <RouterLink to="/automations">Automacoes</RouterLink>
      <RouterLink to="/secrets">Chaves</RouterLink>
      <RouterLink to="/connect" class="status" :data-status="connection.status">
        {{ connection.status === 'online' ? connection.device : connection.status }}
      </RouterLink>
    </nav>
  </aside>
</template>
