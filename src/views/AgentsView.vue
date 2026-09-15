<script setup lang="ts">
import { onMounted } from 'vue'
import { useSessions } from '../stores/sessions'
import { useConnection } from '../stores/connection'

const sessions = useSessions()
onMounted(async () => {
  await useConnection().whenOnline().catch(() => undefined)
  await sessions.loadAgents().catch(() => undefined)
})
</script>

<template>
  <section class="settings-page">
    <h1>Agentes</h1>
    <p v-if="sessions.agentErrors.length" class="error">
      <span v-for="e in sessions.agentErrors" :key="e.file">{{ e.file }}: {{ e.message }}<br /></span>
    </p>
    <ul class="list">
      <li v-for="a in sessions.agents" :key="a.name">
        <div class="list-title">{{ a.name }}</div>
        <div class="muted">{{ a.description }}</div>
        <div class="list-meta">
          <span class="tag">{{ a.provider }}/{{ a.model }}</span>
          <span class="tag">raciocínio {{ a.reasoning }}</span>
          <span v-if="a.budget.run_usd !== undefined" class="tag">run {{ a.budget.run_usd }} USD</span>
          <span v-if="a.budget.session_usd !== undefined" class="tag">sessão {{ a.budget.session_usd }} USD</span>
        </div>
        <div class="muted small">{{ a.tools.join(', ') }}</div>
      </li>
    </ul>
  </section>
</template>
