<script setup lang="ts">
import { onMounted } from 'vue'
import { useSessions } from '../stores/sessions'

const sessions = useSessions()
onMounted(() => void sessions.loadAgents().catch(() => undefined))
</script>

<template>
  <section class="panel">
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
          <span class="tag">raciocinio {{ a.reasoning }}</span>
          <span v-if="a.budget.run_usd !== undefined" class="tag">run {{ a.budget.run_usd }} USD</span>
          <span v-if="a.budget.session_usd !== undefined" class="tag">sessao {{ a.budget.session_usd }} USD</span>
        </div>
        <div class="muted small">{{ a.tools.join(', ') }}</div>
      </li>
    </ul>
  </section>
</template>
