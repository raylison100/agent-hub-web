<script setup lang="ts">
import type { AgentSummary, RunMode, SessionSummary } from '@agent-hub/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useSessions, type ImageAttachment, type Reasoning, type RunState } from '../stores/sessions'
import PlusMenu, { type Attachment, type ImagemAnexada } from './PlusMenu.vue'
import WorkspacePicker from './WorkspacePicker.vue'
import Icone from './ui/Icone.vue'
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
  override: [limit: number, scope: 'run' | 'session' | 'agent' | 'global']
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

const showAjustes = aberto('agente')

function pickAgent(name: string): void {
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

const roleChip = computed(() => chosenRole.value ?? 'Sem agente')

const chosenAgent = computed(() => (props.session ? props.session.agent : pendingAgent.value || autoAgent))

const sessions = useSessions()
const text = ref('')
const reasoning = ref<'' | Reasoning>('')
const showUsage = aberto('uso')
const showMode = aberto('modo')
const overrideValue = ref('')

const modes: { value: RunMode; label: string; detail: string }[] = [
  { value: 'auto_approve', label: 'Automático', detail: 'Faz tudo sozinho; só pergunta antes de algo que apaga ou não tem volta' },
  { value: 'normal', label: 'Manual', detail: 'Pergunta antes de alterar arquivos ou rodar comandos' },
  { value: 'accept_edits', label: 'Aceitar edições', detail: 'Altera arquivos sem perguntar; comandos ainda pedem aprovação' },
  { value: 'draft', label: 'Planejar', detail: 'Só lê e propõe um plano; não altera nada' },
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
  { value: 'low', label: 'Mais rápido' },
  { value: 'medium', label: 'Médio' },
  { value: 'high', label: 'Alto' },
  { value: 'max', label: 'Mais inteligente' },
]

const effortLabel = computed(() => {
  const current = reasoning.value || props.agent?.reasoning || 'medium'
  return levels.find((l) => l.value === current)?.label ?? current
})

const defaultEffortLabel = computed(() => {
  const current = props.agent?.reasoning ?? 'medium'
  return levels.find((l) => l.value === current)?.label ?? current
})

/** Resumo do que esta fora do padrao nos ajustes, para mostrar no proprio botao. */
const ajustesResumo = computed(() => {
  const partes: string[] = []
  if (chosenAgent.value !== autoAgent) partes.push(chosenAgent.value)
  if (reasoning.value) partes.push(effortLabel.value)
  if (!improve.value) partes.push('sem melhorar')
  return partes.join(', ')
})

const contextPct = computed(() => {
  const window = props.agent?.context_window ?? 0
  const used = props.run?.lastInputTokens ?? 0
  return window > 0 ? Math.min(100, Math.round((used / window) * 100)) : 0
})

const bars = computed(() => {
  const out: { label: string; value: number; limit: number | null; unit: 'tokens' | 'USD' }[] = []
  const window = props.agent?.context_window ?? 0
  out.push({ label: 'Memória da conversa', value: props.run?.lastInputTokens ?? 0, limit: window || null, unit: 'tokens' })
  out.push({ label: 'Esta tarefa', value: props.run?.costUsd ?? 0, limit: props.agent?.budget.run_usd ?? null, unit: 'USD' })
  out.push({ label: 'Esta conversa', value: props.session?.costUsd ?? 0, limit: props.agent?.budget.session_usd ?? null, unit: 'USD' })
  const status = sessions.costStatus
  const agentStatus = props.agent ? status?.agents[props.agent.name] : undefined
  out.push({ label: 'Hoje neste modelo', value: agentStatus?.todayUsd ?? 0, limit: agentStatus?.dayLimit ?? null, unit: 'USD' })
  out.push({ label: 'Mês, todos os agentes', value: status?.monthUsd ?? 0, limit: status?.globalMonthLimit ?? null, unit: 'USD' })
  return out
})

function pct(value: number, limit: number | null): number {
  return limit && limit > 0 ? Math.min(100, Math.round((value / limit) * 100)) : 0
}

function fmt(value: number, unit: 'tokens' | 'USD'): string {
  return unit === 'tokens' ? compact(value) : usd(value)
}

/** Valor em dolar no formato brasileiro, com 4 casas para centavos fracionados. */
function usd(value: number): string {
  const casas = value > 0 && value < 0.01 ? 4 : 2
  return `US$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (n >= 1000) return `${Math.round(n / 1000)} mil`
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

type EscopoDeLimite = 'run' | 'session' | 'agent' | 'global'

const escopoDoLimite = computed<EscopoDeLimite>(() => {
  const achado = /Or(?:ç|c)amento de (run|session|agent|global) excedido/.exec(props.run?.error ?? '')
  return (achado?.[1] as EscopoDeLimite | undefined) ?? 'run'
})

const nomeDoLimite = computed(() => ({ run: 'limite de gasto por tarefa', session: 'limite de gasto da conversa', agent: 'limite diário deste modelo', global: 'limite de gasto do mês' })[escopoDoLimite.value])

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
  emit('override', v, escopoDoLimite.value)
}

defineExpose({ inserir: insert })
</script>

<template>
  <footer class="composer">
    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="run?.stop === 'budget_exceeded' && !running" class="row limite-row">
      <span class="small muted">A tarefa parou porque chegou ao {{ nomeDoLimite }}{{ limiteAtual ? ` (${usd(limiteAtual)})` : '' }}. Para continuar só desta vez, use um limite de US$</span>
      <input v-model="overrideValue" type="number" step="0.1" min="0.1" :placeholder="limiteSugerido.toFixed(2)" aria-label="Novo limite em dólares" />
      <button :disabled="!limiteValido" @click="override">Continuar</button>
    </div>
    <div class="composer-box">
      <div v-if="attachments.length" class="attachments">
        <span v-for="(a, i) in attachments" :key="i" class="chip attachment" :title="a.text.slice(0, 200)">
          {{ a.label }}
          <button class="chip-x" type="button" title="Remover" aria-label="Remover" @click="removeAttachment(i)"><Icone nome="fechar" :tamanho="12" /></button>
        </span>
      </div>
      <div v-if="images.length" class="image-strip">
        <span v-for="(img, i) in images" :key="i" class="image-thumb">
          <img :src="preview(img)" :alt="img.name ?? 'imagem'" />
          <button class="chip-x" type="button" title="Remover" aria-label="Remover" @click="removeImage(i)"><Icone nome="fechar" :tamanho="12" /></button>
        </span>
      </div>
      <p v-if="imageError" class="error small">{{ imageError }}</p>
      <textarea
        ref="textarea"
        v-model="text"
        rows="3"
        placeholder="Escreva o que você precisa. Enter envia, Shift+Enter quebra linha"
        @keydown="onKey"
        @paste="onPaste"
        @drop="onDrop"
        @dragover.prevent
      ></textarea>
      <div class="composer-bar">
        <div class="bar-grupo bar-esquerda">
          <WorkspacePicker v-if="!session" :model-value="workspace ?? ''" @update:model-value="(v: string) => emit('update:workspace', v)" />
          <div class="popover-anchor">
            <button class="chip-button plus" :disabled="!session && !workspace" title="Anexar arquivos, comandos e conectores" @click="alternar('plus')">+</button>
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
            <button class="chip-button" :class="{ auto: chosenRole !== null }" title="Agente: qual agente responde" @click="alternar('papel')">
              {{ roleChip }}
            </button>
            <div v-if="showRole" class="popover left">
              <div class="popover-title">Qual agente responde</div>
              <button class="mode-option" :class="{ active: chosenRole === null }" @click="pickRole(null)">
                <span class="mode-name">Sem agente <span v-if="chosenRole === null" class="check"><Icone nome="check" :tamanho="12" /></span></span>
                <span class="mode-detail">Usa só o modelo, sem instruções extras</span>
              </button>
              <button v-for="r in sessions.roles" :key="r.name" class="mode-option" :class="{ active: chosenRole === r.name }" @click="pickRole(r.name)">
                <span class="mode-name">{{ r.name }} <span v-if="chosenRole === r.name" class="check"><Icone nome="check" :tamanho="12" /></span></span>
                <span v-if="r.description" class="mode-detail">{{ r.description }}</span>
              </button>
              <p v-if="sessions.roles.length === 0" class="muted small pad">
                Você ainda não tem agentes. <RouterLink to="/settings/agentes/novo" class="link" @click="fechar('papel')">Criar agente</RouterLink>
              </p>
            </div>
          </div>
          <div class="popover-anchor">
            <button class="chip-button mode-button" :data-mode="mode" title="Modo: quanta liberdade o agente tem" @click="alternar('modo')">{{ modeLabel }}</button>
            <div v-if="showMode" class="popover left">
              <div class="popover-title">Modo</div>
              <button v-for="(m, i) in modes" :key="m.value" class="mode-option" :class="{ active: m.value === mode }" @click="pickMode(m.value)">
                <span class="mode-name">{{ m.label }} <span v-if="m.value === mode" class="check"><Icone nome="check" :tamanho="12" /></span></span>
                <span class="mode-detail">{{ m.detail }}</span>
                <span class="menu-key">{{ i + 1 }}</span>
              </button>
            </div>
          </div>
          <div class="popover-anchor">
            <button class="chip-button" :class="{ auto: ajustesResumo !== '' }" title="Modelo, esforço e melhoria do pedido" @click="alternar('agente')">
              <Icone nome="config" :tamanho="13" />
              <span class="ajustes-texto">{{ ajustesResumo ? `Ajustes: ${ajustesResumo}` : 'Ajustes' }}</span>
            </button>
            <div v-if="showAjustes" class="popover left ajustes">
              <div class="popover-title">Modelo</div>
              <button class="mode-option" :class="{ active: chosenAgent === autoAgent }" @click="pickAgent(autoAgent)">
                <span class="mode-name">Automático <span v-if="chosenAgent === autoAgent" class="check"><Icone nome="check" :tamanho="12" /></span></span>
                <span class="mode-detail">Escolhe o melhor modelo a cada mensagem<template v-if="chosenAgent === autoAgent && run?.model">. Última escolha: {{ run.model }}</template></span>
              </button>
              <button v-for="a in sessions.agents" :key="a.name" class="mode-option" :class="{ active: chosenAgent === a.name }" @click="pickAgent(a.name)">
                <span class="mode-name">{{ a.name }} <span class="modelo-tecnico">{{ a.provider }}/{{ a.model }}</span> <span v-if="chosenAgent === a.name" class="check"><Icone nome="check" :tamanho="12" /></span></span>
                <span v-if="a.description" class="mode-detail">{{ a.description }}</span>
              </button>

              <div class="popover-title secao">Esforço</div>
              <div class="effort-scale">
                <button v-for="l in levels" :key="l.value" class="effort-step" :class="{ active: (reasoning || agent?.reasoning) === l.value }" @click="reasoning = l.value">
                  {{ l.label }}
                </button>
              </div>
              <button class="link" :class="{ ativo: reasoning === '' }" @click="reasoning = ''">Usar o padrão do modelo ({{ defaultEffortLabel }})</button>

              <div class="secao melhorar">
                <button type="button" role="switch" :aria-checked="improve" :class="['ui-interruptor', { ligado: improve }]" @click="toggleImprove">
                  <span class="ui-interruptor-trilho" aria-hidden="true"><span class="ui-interruptor-bola"></span></span>
                  <span>Melhorar meu pedido antes de enviar</span>
                </button>
                <p class="mode-detail">Um modelo barato reescreve seu pedido com mais clareza; o texto original fica guardado</p>
              </div>
            </div>
          </div>
          <span v-if="run?.phase" class="chip">Etapa: {{ run.phase }}</span>
        </div>
        <div class="bar-grupo bar-direita">
          <div class="popover-anchor">
            <button class="chip-button" title="Quanto da memória da conversa já foi usado" @click="alternar('uso')">
              <span class="ring" :style="{ '--pct': contextPct + '%' }"></span>
              {{ contextPct }}%
            </button>
            <div v-if="showUsage" class="popover wide">
              <div v-for="b in bars" :key="b.label" class="bar-row">
                <div class="bar-head">
                  <span>{{ b.label }}</span>
                  <span class="muted">{{ fmt(b.value, b.unit) }}<template v-if="b.limit !== null"> de {{ fmt(b.limit, b.unit) }} ({{ pct(b.value, b.limit) }}%)</template></span>
                </div>
                <div class="bar"><div class="bar-fill" :class="{ warn: pct(b.value, b.limit) >= 80 }" :style="{ width: pct(b.value, b.limit) + '%' }"></div></div>
              </div>
              <RouterLink to="/settings/custos" class="link" @click="fechar('uso')">Ver gastos</RouterLink>
            </div>
          </div>
          <button v-if="running" class="ghost" @click="$emit('cancel')">Parar</button>
          <button
            class="primary"
            :disabled="!text.trim() && !attachments.length && !images.length"
            :title="running ? 'Entra na fila e vai sozinha quando a tarefa atual terminar' : ''"
            @click="submit"
          >
            {{ running ? 'Enfileirar' : 'Enviar' }}
          </button>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.composer-box {
  position: relative;
}

.bar-grupo {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.bar-esquerda {
  flex: 1 1 auto;
}

.bar-direita {
  margin-left: auto;
  flex-wrap: nowrap;
}

.ajustes-texto {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.composer-bar :deep(.popover) {
  max-width: calc(100vw - 32px);
  max-height: min(70vh, 520px);
  overflow-y: auto;
}

.ajustes {
  min-width: 380px;
}

.secao {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.modelo-tecnico {
  font-weight: 400;
  font-size: 11px;
  color: var(--muted);
  font-family: var(--mono);
  margin-left: 4px;
}

.link.ativo {
  font-weight: 600;
}

.melhorar .ui-interruptor {
  border: 0;
  background: transparent;
  padding: 0;
  font-size: 12px;
  font-weight: 600;
  white-space: normal;
  text-align: left;
}

.melhorar .mode-detail {
  margin: 4px 0 0 38px;
}

.chip-x {
  display: inline-flex;
  align-items: center;
}

@media (max-width: 639px) {
  .bar-esquerda {
    flex-basis: 100%;
  }

  .composer-bar .popover-anchor {
    position: static;
  }

  .composer-bar :deep(.popover) {
    left: 0;
    right: 0;
    min-width: 0;
    max-width: none;
    bottom: calc(100% + 8px);
  }

  .ajustes-texto {
    max-width: 150px;
  }
}
</style>
