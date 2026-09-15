<script setup lang="ts">
import type { RunMode } from '@agent-hub/core'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const sentFirst = new Set<string>()
import Composer from '../components/Composer.vue'
import Timeline from '../components/Timeline.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { useSessions, type ImageAttachment, type Reasoning } from '../stores/sessions'

const props = defineProps<{ id: string }>()
const sessions = useSessions()
const connection = useConnection()
const route = useRoute()
const router = useRouter()
const error = ref('')
const scroller = ref<HTMLElement | null>(null)

const session = computed(() => sessions.sessions.find((s) => s.id === props.id))
const agent = computed(() => sessions.agents.find((a) => a.name === session.value?.agent))
const items = computed(() => sessions.timeline(props.id))
const run = computed(() => sessions.runs.get(props.id))
const running = computed(() => Boolean(run.value && !run.value.finished))
const composerRef = ref<InstanceType<typeof Composer> | null>(null)
/** So vale a pena oferecer retomada quando sobrou trabalho: sessao concluida e sem pendencia nao vira cartaz. */
const retomada = computed(() => {
  const r = running.value ? null : sessions.resume(props.id)
  if (!r) return null
  return r.resume.status === 'concluida' && r.resume.pendencias.length === 0 ? null : r
})
const mostrarRetomada = ref(true)

watch(
  () => props.id,
  () => {
    mostrarRetomada.value = true
  },
)

/** Continua de onde parou: joga o proximo passo no composer, sem enviar, para voce ajustar antes. */
function continuar(): void {
  const r = retomada.value
  if (!r) return
  const passo = r.resume.proximo_passo || r.resume.pendencias[0] || ''
  composerRef.value?.inserir(passo ? `Continue de onde paramos: ${passo}` : 'Continue de onde paramos.')
  mostrarRetomada.value = false
}

onMounted(load)
watch(() => props.id, load)
watch(items, () => void nextTick(scrollDown), { deep: true })

async function load(): Promise<void> {
  error.value = ''
  try {
    await connection.whenOnline()
    if (!sessions.agents.length) await sessions.loadAgents()
    if (!sessions.sessions.length) await sessions.refresh()
    await sessions.open(props.id)
    await nextTick(scrollDown)
    const first = route.query.first
    if (typeof first === 'string' && first && !sentFirst.has(props.id)) {
      sentFirst.add(props.id)
      await router.replace({ name: 'chat', params: { id: props.id } })
      await send(first, undefined)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

interface Pendente {
  value: string
  reasoning?: Reasoning
  mode?: RunMode
  agent?: string
  improve?: boolean
  images?: ImageAttachment[]
}

const filas = new Map<string, Pendente[]>()
const versaoDaFila = ref(0)
const fila = computed(() => {
  void versaoDaFila.value
  return filas.get(props.id) ?? []
})

/** Guarda a mensagem enviada durante um run e manda quando ele terminar, na ordem. */
function enfileirar(p: Pendente): void {
  filas.set(props.id, [...(filas.get(props.id) ?? []), p])
  versaoDaFila.value++
}

function tirarDaFila(i: number): void {
  const atual = [...(filas.get(props.id) ?? [])]
  atual.splice(i, 1)
  filas.set(props.id, atual)
  versaoDaFila.value++
}

watch(running, async (agora) => {
  if (agora) return
  const atual = filas.get(props.id) ?? []
  const proxima = atual[0]
  if (!proxima) return
  filas.set(props.id, atual.slice(1))
  versaoDaFila.value++
  await send(proxima.value, proxima.reasoning, proxima.mode, proxima.agent, proxima.improve, proxima.images)
})

/** Retoma o trabalho que parou no limite de gasto com um run novo e o limite escolhido. */
async function continuarComLimite(limiteUsd: number, escopo: 'run' | 'session' | 'agent' | 'global'): Promise<void> {
  error.value = ''
  try {
    await sessions.start(props.id, 'Continue de onde o run anterior parou no limite de gasto, sem refazer o que já está pronto.', undefined, session.value?.mode, undefined, false, undefined, limiteUsd, escopo)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function send(value: string, reasoning: Reasoning | undefined, mode?: RunMode, agent?: string, improve?: boolean, images?: ImageAttachment[]): Promise<void> {
  error.value = ''
  if (running.value) {
    enfileirar({ value, reasoning, mode, agent, improve, images })
    return
  }
  try {
    await sessions.start(props.id, await expand(value), reasoning, mode, agent, improve, images)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

/** Atalhos: `/skill texto` prefixa a skill; `/servidor:prompt chave=valor` vira o prompt MCP; `/anexar servidor uri` anexa o recurso. */
async function expand(value: string): Promise<string> {
  const skill = /^\/([a-z0-9][a-z0-9:_-]*)\s*([\s\S]*)$/i.exec(value)
  if (skill && !skill[1]!.includes(':') && skill[1] !== 'anexar') {
    const res = await client.request({ type: 'skill.get', name: skill[1]! }, 'skill.get').catch(() => null)
    if (res) return `${skill[2]!.trim() || 'Aplique estas instruções ao contexto atual.'}\n\n<skill name="${res.name}">\n${res.body}\n</skill>`
  }
  const prompt = /^\/([a-z0-9_-]+):([a-z0-9_.-]+)\s*(.*)$/is.exec(value)
  if (prompt) {
    const args: Record<string, string> = {}
    for (const m of prompt[3]!.matchAll(/(\w+)=("([^"]*)"|\S+)/g)) args[m[1]!] = m[3] ?? m[2]!
    const res = await client.request({ type: 'mcp.prompt.get', server: prompt[1]!, name: prompt[2]!, args }, 'mcp.prompt.get', 30000)
    return res.text
  }
  const attach = /^\/anexar\s+(\S+)\s+(\S+)\s*([\s\S]*)$/i.exec(value)
  if (attach) {
    const res = await client.request({ type: 'mcp.resource.read', server: attach[1]!, uri: attach[2]! }, 'mcp.resource.read', 30000)
    return `${attach[3]!.trim() || 'Considere o recurso anexado.'}\n\n<recurso uri="${attach[2]!}">\n${res.text}\n</recurso>`
  }
  return value
}

function scrollDown(): void {
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}
</script>

<template>
  <section class="chat">
    <div class="chat-title">
      <strong>{{ session?.title ?? 'Sessão' }}</strong>
      <span class="chip">{{ session?.agent }}</span>
      <span class="muted small path">{{ session?.workspace }}</span>
      <span class="spacer"></span>
      <span class="muted small">sessão {{ (session?.costUsd ?? 0).toFixed(4) }} USD</span>
      <span v-if="run" class="muted small">run {{ run.costUsd.toFixed(4) }} USD, {{ run.steps }} passos</span>
    </div>
    <div ref="scroller" class="timeline">
      <Timeline :items="items" :session-id="id" />
      <div v-if="running" class="working"><span class="pulse" data-status="running"></span> trabalhando</div>
    </div>
    <div v-if="retomada && mostrarRetomada" class="retomada">
      <div class="retomada-topo">
        <span class="retomada-titulo">De onde paramos</span>
        <span class="chip" :class="{ auto: retomada.resume.status === 'concluida' }">{{ retomada.resume.status }}</span>
        <span class="spacer"></span>
        <button class="ghost small" @click="mostrarRetomada = false">Esconder</button>
      </div>
      <p class="retomada-tarefa">{{ retomada.resume.tarefa }}</p>
      <p v-if="retomada.resume.proximo_passo" class="muted small">Próximo passo: {{ retomada.resume.proximo_passo }}</p>
      <ul v-if="retomada.resume.pendencias.length" class="retomada-lista">
        <li v-for="p in retomada.resume.pendencias" :key="p">{{ p }}</li>
      </ul>
      <p v-if="retomada.resume.arquivos.length" class="muted small">Arquivos: {{ retomada.resume.arquivos.join(', ') }}</p>
      <div class="row">
        <button class="primary small" @click="continuar">Continuar de onde parou</button>
      </div>
    </div>
    <div v-if="fila.length" class="fila-de-envio">
      <div v-for="(p, i) in fila" :key="i" class="fila-item small">
        <span class="muted">Na fila, vai quando o run terminar:</span>
        <span class="fila-texto">{{ p.value }}</span>
        <button class="ghost small" type="button" title="Tirar da fila" @click="tirarDaFila(i)">x</button>
      </div>
    </div>
    <Composer
      ref="composerRef"
      :session="session"
      :agent="agent"
      :run="run"
      :running="running"
      :error="error"
      @send="send"
      @cancel="sessions.cancel(props.id)"
      @override="continuarComLimite"
    />
  </section>
</template>
