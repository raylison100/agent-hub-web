<script setup lang="ts">
import type { BackgroundTask } from '@agent-hub/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { client } from '../daemon/client'
import { useSessions } from '../stores/sessions'
import TerminalPane from './TerminalPane.vue'
import Timeline from './Timeline.vue'

const props = defineProps<{ sessionId: string }>()
const sessions = useSessions()
const tab = ref<'subagents' | 'tarefas' | 'saidas' | 'terminal'>('subagents')
const tarefas = ref<BackgroundTask[]>([])
let timer: number | null = null

const subagents = computed(() => sessions.subagents(props.sessionId))
const running = computed(() => subagents.value.filter((s) => s.status === 'running').length)
const entries = computed(() => sessions.terminal.get(props.sessionId) ?? [])
const rodando = computed(() => tarefas.value.filter((t) => t.status === 'rodando').length)

async function carregarTarefas(): Promise<void> {
  try {
    tarefas.value = (await client.request({ type: 'tasks.list' }, 'tasks.list', 15000)).tasks
  } catch {
    return
  }
}

onMounted(() => {
  void carregarTarefas()
  timer = window.setInterval(() => void carregarTarefas(), 5000)
})

onBeforeUnmount(() => {
  if (timer !== null) window.clearInterval(timer)
})

watch(() => props.sessionId, () => void carregarTarefas())

function quando(ts: number): string {
  const segundos = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (segundos < 60) return `${segundos}s`
  if (segundos < 3600) return `${Math.round(segundos / 60)}min`
  return `${Math.round(segundos / 3600)}h`
}
</script>

<template>
  <aside class="panel-right">
    <div class="tabs">
      <button :class="{ active: tab === 'subagents' }" @click="tab = 'subagents'">
        Subagentes <span v-if="running" class="badge">{{ running }}</span>
      </button>
      <button :class="{ active: tab === 'tarefas' }" @click="tab = 'tarefas'">
        Tarefas <span v-if="rodando" class="badge">{{ rodando }}</span>
      </button>
      <button :class="{ active: tab === 'terminal' }" @click="tab = 'terminal'">Terminal</button>
      <button :class="{ active: tab === 'saidas' }" @click="tab = 'saidas'">
        Saidas <span v-if="entries.length" class="badge muted-badge">{{ entries.length }}</span>
      </button>
    </div>

    <div v-if="tab === 'subagents'" class="panel-scroll">
      <p v-if="!subagents.length" class="muted small pad">Nenhum subagente nesta sessao. Perfis com <code>delegates</code> mostram aqui cada delegacao ao vivo.</p>
      <div v-for="(s, i) in subagents" :key="i" class="panel-sub">
        <div class="panel-sub-head">
          <span class="pulse" :data-status="s.status"></span>
          <strong>{{ s.agent }}</strong>
          <span class="cost">{{ s.costUsd.toFixed(4) }} USD</span>
        </div>
        <div class="muted small">{{ s.task }}</div>
        <Timeline :items="s.items" nested />
      </div>
    </div>

    <div v-else-if="tab === 'tarefas'" class="panel-scroll">
      <div class="panel-head-row">
        <span class="muted small">Subagentes em segundo plano, de todas as sessoes</span>
        <button class="ghost small" @click="carregarTarefas">Atualizar</button>
      </div>
      <p v-if="!tarefas.length" class="muted small pad">Nada rodando em segundo plano. A ferramenta <code>spawn</code> cria tarefas assim.</p>
      <div v-for="t in tarefas" :key="t.task_id" class="panel-sub">
        <div class="panel-sub-head">
          <span class="pulse" :data-status="t.status === 'rodando' ? 'running' : 'done'"></span>
          <strong>{{ t.agent }}</strong>
          <span class="tag" :data-state="t.status === 'rodando' ? 'idle' : t.status === 'erro' ? 'error' : 'on'">{{ t.status }}</span>
          <span class="cost">{{ t.cost_usd.toFixed(4) }} USD</span>
        </div>
        <div class="muted small">{{ t.task }}</div>
        <div class="muted small">{{ t.session_title || 'sessao' }}, ha {{ quando(t.started_at) }}<span v-if="t.collected">, ja recolhida</span></div>
      </div>
    </div>

    <TerminalPane v-else-if="tab === 'terminal'" :session-id="sessionId" />

    <div v-else class="panel-scroll terminal">
      <p v-if="!entries.length" class="muted small pad">Saidas de run_command e git aparecem aqui.</p>
      <div v-for="(e, i) in entries" :key="i" class="term-entry">
        <div class="term-cmd">$ {{ e.command }}</div>
        <pre class="term-out">{{ e.output }}</pre>
      </div>
    </div>
  </aside>
</template>
