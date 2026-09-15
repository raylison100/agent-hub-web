<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RightPanel from './components/RightPanel.vue'
import Sidebar from './components/Sidebar.vue'
import FeedbackHost from './components/ui/FeedbackHost.vue'
import { useConnection } from './stores/connection'
import { useSessions } from './stores/sessions'
import { useVisualizacao } from './stores/visualizacao'

const connection = useConnection()
const sessions = useSessions()
const router = useRouter()
const route = useRoute()
const estreitoQuery = window.matchMedia('(max-width: 900px)')
const estreito = ref(estreitoQuery.matches)
const sidebarOpen = ref(!estreitoQuery.matches)
const inSettings = computed(() => route.path.startsWith('/settings'))
const sidebarFlutuante = computed(() => estreito.value && sidebarOpen.value && !inSettings.value)

const larguras = { barra: 260, painel: 380 }
const larguraBarra = ref(lerLargura('barra', larguras.barra))
const larguraPainel = ref(lerLargura('painel', larguras.painel))
const arrastando = ref<'barra' | 'painel' | null>(null)

function lerLargura(qual: 'barra' | 'painel', padrao: number): number {
  try {
    const valor = Number(localStorage.getItem(`agent-hub.largura.${qual}`))
    return Number.isFinite(valor) && valor > 0 ? valor : padrao
  } catch {
    return padrao
  }
}

const estiloShell = computed(() => ({
  '--w-sidebar': `${larguraBarra.value}px`,
  '--w-panel': `${larguraPainel.value}px`,
}))

/** Largura maxima do painel lateral: tudo menos a barra lateral e um minimo legivel para o chat. */
function larguraMaximaDoPainel(): number {
  const barra = sidebarOpen.value && !inSettings.value ? larguraBarra.value : 0
  return Math.max(280, window.innerWidth - barra - 360)
}

/** Arrasta a divisoria e guarda a largura escolhida, para o painel nao mudar de tamanho sozinho ao trocar de aba. */
function iniciarArrasto(qual: 'barra' | 'painel', e: PointerEvent): void {
  arrastando.value = qual
  const alvo = e.currentTarget as HTMLElement
  alvo.setPointerCapture(e.pointerId)
  const mover = (ev: PointerEvent) => {
    if (qual === 'painel') larguraPainel.value = Math.min(larguraMaximaDoPainel(), Math.max(280, window.innerWidth - ev.clientX))
    else larguraBarra.value = Math.min(460, Math.max(190, ev.clientX))
  }
  const soltar = () => {
    arrastando.value = null
    alvo.removeEventListener('pointermove', mover)
    alvo.removeEventListener('pointerup', soltar)
    try {
      localStorage.setItem('agent-hub.largura.barra', String(larguraBarra.value))
      localStorage.setItem('agent-hub.largura.painel', String(larguraPainel.value))
    } catch {
      return
    }
  }
  alvo.addEventListener('pointermove', mover)
  alvo.addEventListener('pointerup', soltar)
}

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
const visualizacao = useVisualizacao()

watch(
  () => visualizacao.versao,
  () => {
    if (!visualizacao.alvo) return
    panelOpen.value = true
    larguraPainel.value = Math.min(larguraMaximaDoPainel(), Math.max(larguraPainel.value, Math.round(window.innerWidth * 0.42)))
  },
)

onMounted(async () => {
  if (!connection.token) await connection.pairLocal()
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
  <div class="shell" :style="estiloShell" :class="{ 'no-sidebar': !sidebarOpen || inSettings || estreito, 'no-panel': !panelOpen || route.name !== 'chat' || estreito }">
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
    <div
      v-if="panelOpen && route.name === 'chat' && !estreito"
      class="resizer resizer-panel"
      :class="{ arrastando: arrastando === 'painel' }"
      title="Arraste para mudar a largura"
      @pointerdown.prevent="iniciarArrasto('painel', $event)"
    ></div>
    <div
      v-if="sidebarOpen && !inSettings && !estreito"
      class="resizer resizer-sidebar"
      :class="{ arrastando: arrastando === 'barra' }"
      title="Arraste para mudar a largura"
      @pointerdown.prevent="iniciarArrasto('barra', $event)"
    ></div>
    <RightPanel v-if="route.name === 'chat' && visualizacao.alvo && (estreito || visualizacao.telaCheia)" class="painel-flutuante" :session-id="String(route.params.id ?? '')" />
    <RightPanel v-else-if="panelOpen && route.name === 'chat' && !estreito" :session-id="String(route.params.id ?? '')" />
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
    <FeedbackHost />
  </div>
</template>
