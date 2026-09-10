<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RightPanel from './components/RightPanel.vue'
import Sidebar from './components/Sidebar.vue'
import { useConnection } from './stores/connection'
import { useSessions } from './stores/sessions'

const connection = useConnection()
const sessions = useSessions()
const router = useRouter()
const route = useRoute()
const estreitoQuery = window.matchMedia('(max-width: 900px)')
const estreito = ref(estreitoQuery.matches)
const sidebarOpen = ref(!estreitoQuery.matches)
const inSettings = computed(() => route.path.startsWith('/settings'))
const sidebarFlutuante = computed(() => estreito.value && sidebarOpen.value && !inSettings.value)

function onLargura(e: MediaQueryListEvent): void {
  estreito.value = e.matches
  sidebarOpen.value = !e.matches
}

onMounted(() => estreitoQuery.addEventListener('change', onLargura))
onUnmounted(() => estreitoQuery.removeEventListener('change', onLargura))

watch(
  () => route.fullPath,
  () => {
    if (estreito.value) sidebarOpen.value = false
  },
)
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
  <div class="shell" :class="{ 'no-sidebar': !sidebarOpen || inSettings || estreito, 'no-panel': !panelOpen || route.name !== 'chat' || estreito }">
    <Sidebar v-if="sidebarOpen && !inSettings" :class="{ flutuante: sidebarFlutuante }" @collapse="sidebarOpen = false" />
    <div v-if="sidebarFlutuante" class="sidebar-backdrop" @click="sidebarOpen = false"></div>
    <main class="main">
      <header v-if="!inSettings" class="topbar">
        <button v-if="!sidebarOpen" class="icon" title="Mostrar barra lateral" @click="sidebarOpen = true">|||</button>
        <RouterView name="header" />
        <span class="spacer"></span>
        <button v-if="route.name === 'chat' && !estreito" class="icon" :title="panelOpen ? 'Ocultar painel' : 'Mostrar painel'" @click="panelOpen = !panelOpen">
          {{ panelOpen ? '>|' : '|<' }}
        </button>
      </header>
      <RouterView />
    </main>
    <RightPanel v-if="panelOpen && route.name === 'chat' && !estreito" :session-id="String(route.params.id ?? '')" />
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
