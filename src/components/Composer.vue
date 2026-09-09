<script setup lang="ts">
import type { AgentSummary, SessionSummary } from '@agent-hub/core'
import { computed, ref } from 'vue'
import { useSessions, type Reasoning, type RunState } from '../stores/sessions'

const props = defineProps<{
  session: SessionSummary | undefined
  agent: AgentSummary | undefined
  run: RunState | undefined
  running: boolean
  error: string
}>()
const emit = defineEmits<{ send: [text: string, reasoning: Reasoning | undefined]; cancel: []; override: [limit: number] }>()

const sessions = useSessions()
const text = ref('')
const reasoning = ref<'' | Reasoning>('')
const showUsage = ref(false)
const showEffort = ref(false)
const overrideValue = ref('')

const levels: { value: Reasoning; label: string }[] = [
  { value: 'low', label: 'Mais rapido' },
  { value: 'medium', label: 'Medio' },
  { value: 'high', label: 'Alto' },
  { value: 'max', label: 'Mais inteligente' },
]

const effortLabel = computed(() => {
  const current = reasoning.value || props.agent?.reasoning || 'medium'
  return levels.find((l) => l.value === current)?.label ?? current
})

const contextPct = computed(() => {
  const window = props.agent?.context_window ?? 0
  const used = props.run?.lastInputTokens ?? 0
  return window > 0 ? Math.min(100, Math.round((used / window) * 100)) : 0
})

const bars = computed(() => {
  const out: { label: string; value: number; limit: number | null; unit: string }[] = []
  const window = props.agent?.context_window ?? 0
  out.push({ label: 'Janela de contexto', value: props.run?.lastInputTokens ?? 0, limit: window || null, unit: 'tokens' })
  out.push({ label: 'Run atual', value: props.run?.costUsd ?? 0, limit: props.agent?.budget.run_usd ?? null, unit: 'USD' })
  out.push({ label: 'Sessao', value: props.session?.costUsd ?? 0, limit: props.agent?.budget.session_usd ?? null, unit: 'USD' })
  const status = sessions.costStatus
  const agentStatus = props.agent ? status?.agents[props.agent.name] : undefined
  out.push({ label: `Hoje, ${props.agent?.name ?? 'agente'}`, value: agentStatus?.todayUsd ?? 0, limit: agentStatus?.dayLimit ?? null, unit: 'USD' })
  out.push({ label: 'Mes, todos os agentes', value: status?.monthUsd ?? 0, limit: status?.globalMonthLimit ?? null, unit: 'USD' })
  return out
})

function pct(value: number, limit: number | null): number {
  return limit && limit > 0 ? Math.min(100, Math.round((value / limit) * 100)) : 0
}

function fmt(value: number, unit: string): string {
  return unit === 'tokens' ? compact(value) : value.toFixed(4)
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function submit(): void {
  const value = text.value.trim()
  if (!value || props.running) return
  text.value = ''
  emit('send', value, reasoning.value || undefined)
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submit()
  }
}

function override(): void {
  const v = Number(overrideValue.value)
  if (Number.isFinite(v) && v > 0) emit('override', v)
}
</script>

<template>
  <footer class="composer">
    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="run?.stop === 'budget_exceeded'" class="row">
      <input v-model="overrideValue" type="number" step="0.1" min="0" placeholder="novo limite do run em USD" />
      <button @click="override">Subir limite e continuar</button>
    </div>
    <div class="composer-box">
      <textarea
        v-model="text"
        rows="3"
        placeholder="Mensagem. Enter envia, Shift+Enter quebra linha. Atalhos: /servidor:prompt chave=valor, /anexar servidor uri"
        @keydown="onKey"
      ></textarea>
      <div class="composer-bar">
        <span class="chip" :title="agent?.description">{{ agent?.provider ?? '' }}/{{ agent?.model ?? session?.agent ?? '' }}</span>
        <span v-if="run?.phase" class="chip">fase {{ run.phase }}</span>
        <span class="spacer"></span>
        <div class="popover-anchor">
          <button class="chip-button" @click="showEffort = !showEffort; showUsage = false">Esforco {{ effortLabel }}</button>
          <div v-if="showEffort" class="popover">
            <div class="popover-title">Esforco de raciocinio</div>
            <div class="effort-scale">
              <button
                v-for="l in levels"
                :key="l.value"
                class="effort-step"
                :class="{ active: (reasoning || agent?.reasoning) === l.value }"
                @click="reasoning = l.value; showEffort = false"
              >
                {{ l.label }}
              </button>
            </div>
            <button class="link" @click="reasoning = ''; showEffort = false">Usar o padrao do perfil ({{ agent?.reasoning ?? 'medium' }})</button>
          </div>
        </div>
        <div class="popover-anchor">
          <button class="chip-button" @click="showUsage = !showUsage; showEffort = false">
            <span class="ring" :style="{ '--pct': contextPct + '%' }"></span>
            {{ contextPct }}% contexto
          </button>
          <div v-if="showUsage" class="popover wide">
            <div v-for="b in bars" :key="b.label" class="bar-row">
              <div class="bar-head">
                <span>{{ b.label }}</span>
                <span class="muted">{{ fmt(b.value, b.unit) }}{{ b.limit !== null ? ` / ${fmt(b.limit, b.unit)}` : '' }} {{ b.unit === 'USD' ? 'USD' : '' }}<template v-if="b.limit !== null"> ({{ pct(b.value, b.limit) }}%)</template></span>
              </div>
              <div class="bar"><div class="bar-fill" :class="{ warn: pct(b.value, b.limit) >= 80 }" :style="{ width: pct(b.value, b.limit) + '%' }"></div></div>
            </div>
            <RouterLink to="/costs" class="link">Ver detalhamento</RouterLink>
          </div>
        </div>
        <button v-if="running" class="ghost" @click="$emit('cancel')">Parar</button>
        <button class="primary" :disabled="running || !text.trim()" @click="submit">Enviar</button>
      </div>
    </div>
  </footer>
</template>
