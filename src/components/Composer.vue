<script setup lang="ts">
import type { AgentSummary, RunMode, SessionSummary } from '@agent-hub/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useSessions, type ImageAttachment, type Reasoning, type RunState } from '../stores/sessions'
import PlusMenu, { type Attachment, type ImagemAnexada } from './PlusMenu.vue'
import WorkspacePicker from './WorkspacePicker.vue'
import { aberto, alternar, fechar } from '../popover'

const showPlus = aberto('plus')
const attachments = ref<Attachment[]>([])
const images = ref<ImageAttachment[]>([])
const imageError = ref('')
const maxImageBytes = 5_000_000

/** Le uma imagem colada, arrastada ou escolhida e guarda em base64 para enviar ao modelo. */
async function addImage(file: File): Promise<void> {
  imageError.value = ''
  if (!file.type.startsWith('image/')) return
  if (file.size > maxImageBytes) {
    imageError.value = `Imagem acima de ${Math.round(maxImageBytes / 1_000_000)} MB`
    return
  }
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('falha ao ler a imagem'))
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.readAsDataURL(file)
  })
  images.value.push({ mediaType: file.type, data, name: file.name || 'imagem' })
}

function onPaste(e: ClipboardEvent): void {
  const files = [...(e.clipboardData?.items ?? [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile())
  const found = files.filter((f): f is File => f !== null && f.type.startsWith('image/'))
  if (found.length === 0) return
  e.preventDefault()
  for (const f of found) void addImage(f)
}

function onDrop(e: DragEvent): void {
  const found = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'))
  if (found.length === 0) return
  e.preventDefault()
  for (const f of found) void addImage(f)
}

function removeImage(i: number): void {
  images.value.splice(i, 1)
}

function preview(img: ImageAttachment): string {
  return `data:${img.mediaType};base64,${img.data}`
}
const textarea = ref<HTMLTextAreaElement | null>(null)

function insert(snippet: string): void {
  text.value = text.value ? `${text.value.replace(/\s*$/, '')} ${snippet}` : snippet
  fechar('plus')
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
  send: [text: string, reasoning: Reasoning | undefined, mode: RunMode, agent: string | undefined, improve: boolean, images: ImageAttachment[], role: string | undefined]
  cancel: []
  override: [limit: number]
  'update:workspace': [value: string]
}>()

const pendingAgent = ref('')
const pendingRole = ref('')

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

const showAgent = aberto('agente')

function pickAgent(name: string): void {
  fechar('agente')
  if (!props.session) {
    pendingAgent.value = name === autoAgent ? '' : name
    return
  }
  void sessions.update(props.session.id, { agent: name })
}

const autoAgent = 'auto'

const showRole = aberto('papel')

function pickRole(name: string | null): void {
  fechar('papel')
  if (!props.session) {
    pendingRole.value = name ?? ''
    return
  }
  void sessions.update(props.session.id, { role: name })
}

const chosenRole = computed(() => (props.session ? props.session.role : pendingRole.value || null))

const roleChip = computed(() => chosenRole.value ?? 'Sem papel')

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
const showUsage = aberto('uso')
const showEffort = aberto('esforco')
const showMode = aberto('modo')
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
  fechar('modo')
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
  if (e.key === 'Escape') fechar('modo')
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
  if (!value && attachments.value.length === 0 && images.value.length === 0) return
  const blocks = attachments.value.map((a) => a.text)
  const full = [value || 'Considere os anexos.', ...blocks].join('\n\n')
  const sent = images.value
  text.value = ''
  attachments.value = []
  images.value = []
  emit('send', full, reasoning.value || undefined, mode.value, props.session ? undefined : pendingAgent.value || undefined, improve.value, sent, props.session ? undefined : pendingRole.value || undefined)
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submit()
  }
}

const limiteAtual = computed(() => {
  const achado = /de\s+([\d.]+)\s+USD/.exec(props.run?.error ?? '')
  return achado ? Number(achado[1]) : null
})

const limiteSugerido = computed(() => (limiteAtual.value ? Math.ceil(limiteAtual.value * 2 * 10) / 10 : 3))

const limiteValido = computed(() => {
  const v = Number(overrideValue.value || limiteSugerido.value)
  return Number.isFinite(v) && v > 0
})

/** Abre um run novo na sessao com o limite escolhido, pedindo para continuar de onde o anterior parou. */
function override(): void {
  const v = Number(overrideValue.value || limiteSugerido.value)
  if (!Number.isFinite(v) || v <= 0) return
  overrideValue.value = ''
  emit('override', v)
}

defineExpose({ inserir: insert })
</script>

<template>
  <footer class="composer">
    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="run?.stop === 'budget_exceeded' && !running" class="row limite-row">
      <span class="small muted">O run parou no limite de gasto{{ limiteAtual ? ` de ${limiteAtual.toFixed(2)} USD` : '' }}. Continuar com o limite de</span>
      <input v-model="overrideValue" type="number" step="0.1" min="0.1" :placeholder="limiteSugerido.toFixed(2)" aria-label="novo limite do run em USD" />
      <span class="small muted">USD</span>
      <button :disabled="!limiteValido" @click="override">Continuar</button>
    </div>
    <div class="composer-box">
      <div v-if="attachments.length" class="attachments">
        <span v-for="(a, i) in attachments" :key="i" class="chip attachment" :title="a.text.slice(0, 200)">
          {{ a.label }}
          <button class="chip-x" type="button" @click="removeAttachment(i)">x</button>
        </span>
      </div>
      <div v-if="images.length" class="image-strip">
        <span v-for="(img, i) in images" :key="i" class="image-thumb">
          <img :src="preview(img)" :alt="img.name ?? 'imagem'" />
          <button class="chip-x" type="button" title="Remover" @click="removeImage(i)">x</button>
        </span>
      </div>
      <p v-if="imageError" class="error small">{{ imageError }}</p>
      <textarea
        ref="textarea"
        v-model="text"
        rows="3"
        placeholder="Descreva uma tarefa ou faca uma pergunta"
        @keydown="onKey"
        @paste="onPaste"
        @drop="onDrop"
        @dragover.prevent
      ></textarea>
      <div class="composer-bar">
        <WorkspacePicker v-if="!session" :model-value="workspace ?? ''" @update:model-value="(v: string) => emit('update:workspace', v)" />
        <div class="popover-anchor">
          <button class="chip-button plus" :disabled="!session && !workspace" title="Anexar, comandos, conectores" @click="alternar('plus')">+</button>
          <PlusMenu
            v-if="showPlus"
            :session-id="session?.id"
            :workspace="session ? undefined : workspace"
            :agent="session?.agent ?? (pendingAgent || undefined)"
            @attach="addAttachment"
            @image="(i: ImagemAnexada) => images.push(i)"
            @insert="insert"
            @close="fechar('plus')"
          />
        </div>
        <div class="popover-anchor">
          <button class="chip-button mode-button" :data-mode="mode" @click="alternar('modo')">{{ modeLabel }}</button>
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
          <button class="chip-button" :class="{ auto: chosenAgent === 'auto' }" :title="agent?.description ?? 'o harness escolhe a cada mensagem'" @click="alternar('agente')">
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
        <div class="popover-anchor">
          <button class="chip-button" :class="{ auto: chosenRole !== null }" title="O papel define o prompt, as ferramentas e a politica; o modelo continua sendo escolhido pelo harness" @click="alternar('papel')">
            {{ roleChip }}
          </button>
          <div v-if="showRole" class="popover left">
            <div class="popover-title">Papel desta sessao</div>
            <button class="mode-option" :class="{ active: chosenRole === null }" @click="pickRole(null)">
              <span class="mode-name">Sem papel</span>
              <span class="mode-detail">O agente usa o proprio prompt e as proprias ferramentas</span>
            </button>
            <button v-for="r in sessions.roles" :key="r.name" class="mode-option" :class="{ active: chosenRole === r.name }" @click="pickRole(r.name)">
              <span class="mode-name">{{ r.name }}</span>
              <span class="mode-detail">{{ r.description }}. Modelos: {{ r.models.join(', ') }}</span>
            </button>
            <p v-if="sessions.roles.length === 0" class="muted small pad">Nenhum papel em agents/roles.</p>
          </div>
        </div>
        <button class="chip-button" :class="{ auto: improve }" title="Um modelo barato reescreve seu pedido para o agente escolhido; o original fica registrado" @click="toggleImprove">
          {{ improve ? 'Melhorar prompt: on' : 'Melhorar prompt: off' }}
        </button>
        <span v-if="run?.phase" class="chip">fase {{ run.phase }}</span>
        <span class="spacer"></span>
        <div class="popover-anchor">
          <button class="chip-button" @click="alternar('esforco')">Esforco {{ effortLabel }}</button>
          <div v-if="showEffort" class="popover">
            <div class="popover-title">Esforco de raciocinio</div>
            <div class="effort-scale">
              <button
                v-for="l in levels"
                :key="l.value"
                class="effort-step"
                :class="{ active: (reasoning || agent?.reasoning) === l.value }"
                @click="reasoning = l.value; fechar('esforco')"
              >
                {{ l.label }}
              </button>
            </div>
            <button class="link" @click="reasoning = ''; fechar('esforco')">Usar o padrao do perfil ({{ agent?.reasoning ?? 'medium' }})</button>
          </div>
        </div>
        <div class="popover-anchor">
          <button class="chip-button" @click="alternar('uso')">
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
        <button
          class="primary"
          :disabled="!text.trim() && !attachments.length && !images.length"
          :title="running ? 'Entra na fila e vai sozinha quando o run atual terminar' : ''"
          @click="submit"
        >
          {{ running ? 'Enfileirar' : 'Enviar' }}
        </button>
      </div>
    </div>
  </footer>
</template>
