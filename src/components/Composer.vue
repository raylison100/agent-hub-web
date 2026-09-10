<script setup lang="ts">
import type { AgentSummary, RunMode, SessionSummary } from '@agent-hub/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useSessions, type Reasoning, type RunState } from '../stores/sessions'
import PlusMenu, { type Attachment } from './PlusMenu.vue'
import WorkspacePicker from './WorkspacePicker.vue'

const showPlus = ref(false)
const attachments = ref<Attachment[]>([])
const textarea = ref<HTMLTextAreaElement | null>(null)

function insert(snippet: string): void {
  text.value = text.value ? `${text.value.replace(/\s*$/, '')} ${snippet}` : snippet
  showPlus.value = false
  textarea.value?.focus()
}

function addAttachment(a: Attachment): void {
  attachments.value.push(a)
}

function removeAttachment(i: number): void {
  attachments.value.splice(i, 1)
}

const props = defineProps<{
  session: SessionSummary | undefined
  agent: AgentSummary | undefined
  run: RunState | undefined
  running: boolean
  error: string
  workspace?: string
}>()
const emit = defineEmits<{
  send: [text: string, reasoning: Reasoning | undefined, mode: RunMode, agent: string | undefined, improve: boolean]
  cancel: []
  override: [limit: number]
  'update:workspace': [value: string]
}>()

const pendingAgent = ref('')

const improveKey = 'agent-hub.improve'
const improve = ref(readImprove())

function readImprove(): boolean {
  try {
    return localStorage.getItem(improveKey) !== 'off'
  } catch {
    return true
  }
}

function toggleImprove(): void {
  improve.value = !improve.value
  try {
    localStorage.setItem(improveKey, improve.value ? 'on' : 'off')
  } catch {
    return
  }
}

const showAgent = ref(false)

function pickAgent(name: string): void {
  showAgent.value = false
  if (!props.session) {
    pendingAgent.value = name === autoAgent ? '' : name
    return
  }
  void sessions.update(props.session.id, { agent: name })
}

const autoAgent = 'auto'

const chosenAgent = computed(() => (props.session ? props.session.agent : pendingAgent.value || autoAgent))

const agentChip = computed(() => {
  const name = chosenAgent.value
  if (name === autoAgent) return props.run?.model ? `Auto: ${props.run.model}` : 'Auto'
  const profile = props.agent ?? sessions.agents.find((a) => a.name === name)
  return profile ? `${profile.provider}/${profile.model}` : name
})

const sessions = useSessions()
const text = ref('')
const reasoning = ref<'' | Reasoning>('')
const showUsage = ref(false)
const showEffort = ref(false)
const showMode = ref(false)
const overrideValue = ref('')

const modes: { value: RunMode; label: string; detail: string }[] = [
  { value: 'auto_approve', label: 'Automatico', detail: 'Aprova tudo, exceto comandos destrutivos, que ainda perguntam' },
  { value: 'normal', label: 'Manual', detail: 'Segue a politica do perfil: pergunta antes de escrever e executar' },
  { value: 'accept_edits', label: 'Aceitar edicoes', detail: 'Escreve arquivos sem perguntar; comandos ainda pedem aprovacao' },
  { value: 'draft', label: 'Planejar', detail: 'So le e propoe; nenhuma escrita nem execucao' },
]

const modeKey = 'agent-hub.mode.run'
const mode = ref<RunMode>(props.session?.mode ?? storedMode())

watch(
  () => props.session?.mode,
  (value) => {
    if (value) mode.value = value
  },
)

function storedMode(): RunMode {
  try {
    const v = localStorage.getItem(modeKey)
    return modes.some((m) => m.value === v) ? (v as RunMode) : 'normal'
  } catch {
    return 'normal'
  }
}

function pickMode(value: RunMode): void {
  mode.value = value
  showMode.value = false
  if (props.session) void sessions.update(props.session.id, { mode: value })
  try {
    localStorage.setItem(modeKey, value)
  } catch {
    return
  }
}

const modeLabel = computed(() => modes.find((m) => m.value === mode.value)?.label ?? 'Manual')

function onGlobalKey(e: KeyboardEvent): void {
  if (!showMode.value) return
  const i = Number(e.key) - 1
  if (i >= 0 && i < modes.length) {
    e.preventDefault()
    pickMode(modes[i]!.value)
  }
  if (e.key === 'Escape') showMode.value = false
}

onMounted(() => window.addEventListener('keydown', onGlobalKey))
onUnmounted(() => window.removeEventListener('keydown', onGlobalKey))

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
  if ((!value && attachments.value.length === 0) || props.running) return
  const blocks = attachments.value.map((a) => a.text)
  const full = [value || 'Considere os anexos.', ...blocks].join('\n\n')
  text.value = ''
  attachments.value = []
  emit('send', full, reasoning.value || undefined, mode.value, props.session ? undefined : pendingAgent.value || undefined, improve.value)
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
      <div v-if="attachments.length" class="attachments">
        <span v-for="(a, i) in attachments" :key="i" class="chip attachment" :title="a.text.slice(0, 200)">
          {{ a.label }}
          <button class="chip-x" type="button" @click="removeAttachment(i)">x</button>
        </span>
      </div>
      <textarea
        ref="textarea"
        v-model="text"
        rows="3"
        placeholder="Mensagem. Enter envia, Shift+Enter quebra linha. Atalhos: /skill, /servidor:prompt chave=valor, /anexar servidor uri"
        @keydown="onKey"
      ></textarea>
      <div class="composer-bar">
        <WorkspacePicker v-if="!session" :model-value="workspace ?? ''" @update:model-value="(v: string) => emit('update:workspace', v)" />
        <div class="popover-anchor">
          <button class="chip-button plus" :disabled="!session && !workspace" title="Anexar, comandos, conectores" @click="showPlus = !showPlus; showMode = false; showEffort = false; showUsage = false">+</button>
          <PlusMenu
            v-if="showPlus"
            :session-id="session?.id"
            :workspace="session ? undefined : workspace"
            :agent="session?.agent ?? (pendingAgent || undefined)"
            @attach="addAttachment"
            @insert="insert"
            @close="showPlus = false"
          />
        </div>
        <div class="popover-anchor">
          <button class="chip-button mode-button" :data-mode="mode" @click="showMode = !showMode; showEffort = false; showUsage = false">{{ modeLabel }}</button>
          <div v-if="showMode" class="popover left">
            <div class="popover-title">Modo</div>
            <button v-for="(m, i) in modes" :key="m.value" class="mode-option" :class="{ active: m.value === mode }" @click="pickMode(m.value)">
              <span class="mode-name">{{ m.label }} <span v-if="m.value === mode" class="check">v</span></span>
              <span class="mode-detail">{{ m.detail }}</span>
              <span class="menu-key">{{ i + 1 }}</span>
            </button>
          </div>
        </div>
        <div class="popover-anchor">
          <button class="chip-button" :class="{ auto: chosenAgent === 'auto' }" :title="agent?.description ?? 'o harness escolhe a cada mensagem'" @click="showAgent = !showAgent; showMode = false; showEffort = false; showUsage = false; showPlus = false">
            {{ agentChip }}
          </button>
          <div v-if="showAgent" class="popover left">
            <div class="popover-title">Agente desta sessao</div>
            <button class="mode-option" :class="{ active: chosenAgent === 'auto' }" @click="pickAgent('auto')">
              <span class="mode-name">Auto</span>
              <span class="mode-detail">O harness escolhe a cada mensagem por regra, classificador ou padrao</span>
            </button>
            <button v-for="a in sessions.agents" :key="a.name" class="mode-option" :class="{ active: chosenAgent === a.name }" @click="pickAgent(a.name)">
              <span class="mode-name">{{ a.name }}</span>
              <span class="mode-detail">{{ a.provider }}/{{ a.model }}, {{ a.description }}</span>
            </button>
          </div>
        </div>
        <button class="chip-button" :class="{ auto: improve }" title="Um modelo barato reescreve seu pedido para o agente escolhido; o original fica registrado" @click="toggleImprove">
          {{ improve ? 'Melhorar prompt: on' : 'Melhorar prompt: off' }}
        </button>
        <span v-if="run?.phase" class="chip">fase {{ run.phase }}</span>
        <span class="spacer"></span>
        <div class="popover-anchor">
          <button class="chip-button" @click="showEffort = !showEffort; showUsage = false; showMode = false">Esforco {{ effortLabel }}</button>
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
          <button class="chip-button" @click="showUsage = !showUsage; showEffort = false; showMode = false">
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
        <button class="primary" :disabled="running || (!text.trim() && !attachments.length)" @click="submit">Enviar</button>
      </div>
    </div>
  </footer>
</template>
