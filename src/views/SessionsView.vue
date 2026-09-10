<script setup lang="ts">
import type { StatsOverview } from '@agent-hub/core'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { useSessions } from '../stores/sessions'
import WorkspacePicker from '../components/WorkspacePicker.vue'

const sessions = useSessions()
const connection = useConnection()
const router = useRouter()
const workspace = ref(lastWorkspace())
const agent = ref('')
const firstMessage = ref('')
const error = ref('')
const stats = ref<StatsOverview | null>(null)
const tab = ref<'geral' | 'modelos'>('geral')
const period = ref<0 | 30 | 7>(0)

const bookTokens = 103_000

onMounted(async () => {
  await connection.whenOnline()
  await loadStats()
})

async function loadStats(): Promise<void> {
  try {
    const res = await client.request({ type: 'stats.overview', days: period.value || undefined }, 'stats.overview')
    stats.value = res.stats
  } catch {
    stats.value = null
  }
}

function setPeriod(p: 0 | 30 | 7): void {
  period.value = p
  void loadStats()
}

const greetingName = computed(() => {
  const u = stats.value?.user ?? ''
  return u ? `, ${u.charAt(0).toUpperCase()}${u.slice(1)}` : ''
})

const heatmap = computed(() => {
  const byDate = new Map((stats.value?.days ?? []).map((d) => [d.date, d.count]))
  const weeks = 18
  const end = new Date()
  end.setHours(0, 0, 0, 0)
  const start = new Date(end)
  start.setDate(start.getDate() - (weeks * 7 - 1) - end.getDay())
  const cols: { date: string; count: number; level: number }[][] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    const col: { date: string; count: number; level: number }[] = []
    for (let d = 0; d < 7 && cursor <= end; d++) {
      const key = localDate(cursor)
      const count = byDate.get(key) ?? 0
      col.push({ date: key, count, level: levelOf(count) })
      cursor.setDate(cursor.getDate() + 1)
    }
    cols.push(col)
  }
  return cols
})

function localDate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function levelOf(count: number): number {
  if (count === 0) return 0
  if (count < 3) return 1
  if (count < 10) return 2
  if (count < 25) return 3
  return 4
}

const bookComparison = computed(() => {
  const total = stats.value?.total_tokens ?? 0
  if (total < bookTokens * 2) return null
  return `Voce usou ~${Math.round(total / bookTokens)}x mais tokens do que Harry Potter e a Pedra Filosofal.`
})

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`
  return new Intl.NumberFormat('pt-BR').format(n)
}

function shortModel(model: string | null): string {
  if (!model) return '-'
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

function money(v: number): string {
  return v < 0.005 ? 'gratis' : `$${v.toFixed(2)}`
}

function lastWorkspace(): string {
  try {
    return localStorage.getItem('agent-hub.last-workspace') ?? ''
  } catch {
    return ''
  }
}

async function create(): Promise<void> {
  error.value = ''
  if (!workspace.value.trim()) {
    error.value = 'Escolha a pasta da sessao no seletor'
    return
  }
  try {
    const s = await sessions.create(workspace.value, agent.value || undefined, firstMessage.value || undefined)
    try {
      localStorage.setItem('agent-hub.last-workspace', workspace.value)
    } catch {
      void 0
    }
    await router.push({ name: 'chat', params: { id: s.id }, query: firstMessage.value ? { first: firstMessage.value } : {} })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void create()
  }
}
</script>

<template>
  <section class="home-view">
    <div class="home-center">
      <h1 class="home-greeting"><span class="spark">*</span> O que vem a seguir{{ greetingName }}?</h1>

      <div class="stats-card" v-if="stats">
        <div class="stats-head">
          <div class="stats-tabs">
            <button :class="{ active: tab === 'geral' }" @click="tab = 'geral'">Visao Geral</button>
            <button :class="{ active: tab === 'modelos' }" @click="tab = 'modelos'">Modelos</button>
          </div>
          <div class="stats-periods">
            <button :class="{ active: period === 0 }" @click="setPeriod(0)">Todos</button>
            <button :class="{ active: period === 30 }" @click="setPeriod(30)">30d</button>
            <button :class="{ active: period === 7 }" @click="setPeriod(7)">7d</button>
          </div>
        </div>

        <template v-if="tab === 'geral'">
          <div class="stats-grid">
            <div class="stat"><span class="stat-label">Sessoes</span><span class="stat-value">{{ fmt(stats.sessions) }}</span></div>
            <div class="stat"><span class="stat-label">Mensagens</span><span class="stat-value">{{ fmt(stats.messages) }}</span></div>
            <div class="stat"><span class="stat-label">Total de tokens</span><span class="stat-value">{{ fmt(stats.total_tokens) }}</span></div>
            <div class="stat"><span class="stat-label">Dias ativos</span><span class="stat-value">{{ stats.active_days }}</span></div>
            <div class="stat"><span class="stat-label">Sequencia atual</span><span class="stat-value">{{ stats.current_streak_days }}d</span></div>
            <div class="stat"><span class="stat-label">Maior sequencia</span><span class="stat-value">{{ stats.longest_streak_days }}d</span></div>
            <div class="stat"><span class="stat-label">Horario de pico</span><span class="stat-value">{{ stats.peak_hour === null ? '-' : String(stats.peak_hour).padStart(2, '0') }}</span></div>
            <div class="stat"><span class="stat-label">Modelo favorito</span><span class="stat-value stat-model">{{ shortModel(stats.favorite_model) }}</span></div>
          </div>
          <div class="heatmap">
            <div v-for="(col, i) in heatmap" :key="i" class="heat-col">
              <span v-for="cell in col" :key="cell.date" class="heat-cell" :data-level="cell.level" :title="`${cell.date}: ${cell.count} mensagens`"></span>
            </div>
          </div>
          <p v-if="bookComparison" class="muted small home-fun">{{ bookComparison }}</p>
        </template>

        <template v-else>
          <table class="models-table" v-if="stats.models.length > 0">
            <thead>
              <tr><th>Modelo</th><th>Chamadas</th><th>Tokens</th><th>Custo</th></tr>
            </thead>
            <tbody>
              <tr v-for="m in stats.models" :key="m.model">
                <td>{{ shortModel(m.model) }}</td>
                <td>{{ fmt(m.calls) }}</td>
                <td>{{ fmt(m.tokens) }}</td>
                <td>{{ money(m.cost_usd) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="muted small">Sem chamadas no periodo.</p>
        </template>
      </div>
    </div>

    <div class="home-composer">
      <div class="composer-chips">
        <WorkspacePicker v-model="workspace" />
        <select v-model="agent" class="chip chip-select" title="Agente da sessao">
          <option value="">Auto</option>
          <option v-for="a in sessions.agents" :key="a.name" :value="a.name">{{ a.name }}</option>
        </select>
      </div>
      <div class="composer-box">
        <textarea
          v-model="firstMessage"
          rows="2"
          placeholder="Descreva uma tarefa ou faca uma pergunta"
          @keydown="onKey"
        ></textarea>
        <button class="send" title="Criar sessao" @click="create">Enviar</button>
      </div>
      <p v-if="error" class="error small">{{ error }}</p>
    </div>
  </section>
</template>
