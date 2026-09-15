<script setup lang="ts">
import type { HealthItem, RunMode, StatsOverview } from '@agent-hub/core'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Composer from '../components/Composer.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { useSessions, type ImageAttachment, type Reasoning } from '../stores/sessions'

const sessions = useSessions()
const connection = useConnection()
const router = useRouter()
const workspace = ref(lastWorkspace())
const error = ref('')
const creating = ref(false)
const stats = ref<StatsOverview | null>(null)
const tab = ref<'geral' | 'modelos'>('geral')
const period = ref<0 | 30 | 7>(0)

const bookTokens = 103_000

onMounted(async () => {
  await connection.whenOnline()
  await sessions.loadAgents()
  await loadStats()
  await loadHealth()
})

async function loadStats(): Promise<void> {
  try {
    const res = await client.request({ type: 'stats.overview', days: period.value || undefined }, 'stats.overview')
    stats.value = res.stats
  } catch {
    stats.value = null
  }
}

const saude = ref<HealthItem[]>([])
const chaveDosFechados = 'agent-hub.avisos-fechados'
const fechados = ref<string[]>(lerFechados())

function lerFechados(): string[] {
  try {
    const valor = JSON.parse(localStorage.getItem(chaveDosFechados) ?? '[]') as unknown
    return Array.isArray(valor) ? valor.map(String) : []
  } catch {
    return []
  }
}

function assinaturaDoAviso(item: HealthItem): string {
  return `${item.title}\n${item.detail}`
}

const avisos = computed(() => saude.value.filter((i) => i.level !== 'ok' && !fechados.value.includes(assinaturaDoAviso(i))))

/** Esconde o aviso ate o conteudo dele mudar. */
function fecharAviso(item: HealthItem): void {
  const atuais = new Set(saude.value.map(assinaturaDoAviso))
  fechados.value = [...fechados.value.filter((f) => atuais.has(f)), assinaturaDoAviso(item)]
  try {
    localStorage.setItem(chaveDosFechados, JSON.stringify(fechados.value))
  } catch {
    return
  }
}

async function loadHealth(): Promise<void> {
  try {
    saude.value = (await client.request({ type: 'health.list' }, 'health.list')).items
  } catch {
    saude.value = []
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
  return `Você usou ~${Math.round(total / bookTokens)}x mais tokens do que Harry Potter e a Pedra Filosofal.`
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
  return v < 0.005 ? 'grátis' : `$${v.toFixed(2)}`
}

function lastWorkspace(): string {
  try {
    return localStorage.getItem('agent-hub.last-workspace') ?? ''
  } catch {
    return ''
  }
}

/** Cria a sessao com a pasta e o agente escolhidos no composer e ja dispara a primeira mensagem. */
async function send(text: string, reasoning: Reasoning | undefined, mode: RunMode, agent: string | undefined, improve: boolean, images: ImageAttachment[], role: string | undefined): Promise<void> {
  error.value = ''
  if (!workspace.value.trim()) {
    error.value = 'Escolha a pasta da sessão no seletor'
    return
  }
  creating.value = true
  try {
    const session = await sessions.create(workspace.value, agent, text, role)
    try {
      localStorage.setItem('agent-hub.last-workspace', workspace.value)
    } catch {
      void 0
    }
    await sessions.start(session.id, text, reasoning, mode, undefined, improve, images)
    await router.push({ name: 'chat', params: { id: session.id } })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <section class="home-view">
    <div class="home-center">
      <h1 class="home-greeting"><span class="spark">*</span> O que vem a seguir{{ greetingName }}?</h1>

      <div v-if="avisos.length" class="saude">
        <div v-for="item in avisos" :key="item.title" class="saude-item" :class="item.level">
          <span class="saude-marca"></span>
          <div class="saude-texto">
            <strong>{{ item.title }}</strong>
            <span class="muted small">{{ item.detail }}</span>
            <span class="small">{{ item.action }}</span>
          </div>
          <button v-if="item.route" class="ghost small" @click="router.push(item.route)">Ver</button>
          <button class="ghost small saude-fechar" type="button" title="Fechar este aviso" aria-label="Fechar este aviso" @click="fecharAviso(item)">x</button>
        </div>
      </div>

      <div class="stats-card" v-if="stats">
        <div class="stats-head">
          <div class="stats-tabs">
            <button :class="{ active: tab === 'geral' }" @click="tab = 'geral'">Visão Geral</button>
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
            <div class="stat"><span class="stat-label">Sessões</span><span class="stat-value">{{ fmt(stats.sessions) }}</span></div>
            <div class="stat"><span class="stat-label">Mensagens</span><span class="stat-value">{{ fmt(stats.messages) }}</span></div>
            <div class="stat"><span class="stat-label">Total de tokens</span><span class="stat-value">{{ fmt(stats.total_tokens) }}</span></div>
            <div class="stat"><span class="stat-label">Dias ativos</span><span class="stat-value">{{ stats.active_days }}</span></div>
            <div class="stat"><span class="stat-label">Sequência atual</span><span class="stat-value">{{ stats.current_streak_days }}d</span></div>
            <div class="stat"><span class="stat-label">Maior sequência</span><span class="stat-value">{{ stats.longest_streak_days }}d</span></div>
            <div class="stat"><span class="stat-label">Horário de pico</span><span class="stat-value">{{ stats.peak_hour === null ? '-' : String(stats.peak_hour).padStart(2, '0') }}</span></div>
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
          <p v-else class="muted small">Sem chamadas no período.</p>
        </template>
      </div>
    </div>

    <Composer
      class="home-composer"
      :session="undefined"
      :agent="undefined"
      :run="undefined"
      :running="creating"
      :error="error"
      :workspace="workspace"
      @update:workspace="(v: string) => (workspace = v)"
      @send="send"
    />
  </section>
</template>
