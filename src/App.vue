<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConnection } from './stores/connection'
import { useSessions } from './stores/sessions'

const connection = useConnection()
const sessions = useSessions()
const router = useRouter()

onMounted(async () => {
  if (!connection.token) {
    await router.push({ name: 'connect' })
    return
  }
  try {
    await connection.connect()
    await Promise.all([sessions.refresh(), sessions.loadAgents()])
  } catch {
    await router.push({ name: 'connect' })
  }
})
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <RouterLink to="/" class="brand">Agent Hub</RouterLink>
      <nav>
        <RouterLink to="/">Sessoes</RouterLink>
        <RouterLink to="/costs">Custos</RouterLink>
        <RouterLink to="/agents">Agentes</RouterLink>
      </nav>
      <RouterLink to="/connect" class="status" :data-status="connection.status">
        {{ connection.status === 'online' ? connection.device : connection.status }}
      </RouterLink>
    </header>
    <main class="content">
      <RouterView />
    </main>
    <div v-if="sessions.approvals.length" class="approval-dock">
      <div v-for="a in sessions.approvals" :key="a.id" class="approval">
        <div class="approval-head">
          <strong>{{ a.tool }}</strong>
          <span class="risk" :data-risk="a.risk">{{ a.risk }}</span>
        </div>
        <pre class="args">{{ JSON.stringify(a.args, null, 2) }}</pre>
        <div class="approval-actions">
          <button class="primary" @click="sessions.respond(a.id, 'allow')">Aprovar</button>
          <button @click="sessions.respond(a.id, 'deny')">Negar</button>
        </div>
      </div>
    </div>
  </div>
</template>
