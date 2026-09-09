<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RightPanel from './components/RightPanel.vue'
import Sidebar from './components/Sidebar.vue'
import { useConnection } from './stores/connection'
import { useSessions } from './stores/sessions'

const connection = useConnection()
const sessions = useSessions()
const router = useRouter()
const route = useRoute()
const sidebarOpen = ref(true)
const panelOpen = ref(true)

onMounted(async () => {
  if (!connection.token) {
    await router.push({ name: 'connect' })
    return
  }
  try {
    const result = await connection.connect()
    if (result !== 'online') {
      await router.push({ name: 'connect' })
      return
    }
    await Promise.all([sessions.refresh(), sessions.loadAgents(), sessions.loadCostStatus()])
  } catch {
    await router.push({ name: 'connect' })
  }
})
</script>

<template>
  <div class="shell" :class="{ 'no-sidebar': !sidebarOpen, 'no-panel': !panelOpen || route.name !== 'chat' }">
    <Sidebar v-if="sidebarOpen" @collapse="sidebarOpen = false" />
    <main class="main">
      <header class="topbar">
        <button v-if="!sidebarOpen" class="icon" title="Mostrar barra lateral" @click="sidebarOpen = true">|||</button>
        <RouterView name="header" />
        <span class="spacer"></span>
        <button v-if="route.name === 'chat'" class="icon" :title="panelOpen ? 'Ocultar painel' : 'Mostrar painel'" @click="panelOpen = !panelOpen">
          {{ panelOpen ? '>|' : '|<' }}
        </button>
      </header>
      <RouterView />
    </main>
    <RightPanel v-if="panelOpen && route.name === 'chat'" :session-id="String(route.params.id ?? '')" />
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
