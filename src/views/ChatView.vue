<script setup lang="ts">
import type { RunMode } from '@agent-hub/core'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const sentFirst = new Set<string>()
import Composer from '../components/Composer.vue'
import Timeline from '../components/Timeline.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { useSessions, type Reasoning } from '../stores/sessions'

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

async function send(value: string, reasoning: Reasoning | undefined, mode?: RunMode, agent?: string, improve?: boolean): Promise<void> {
  error.value = ''
  try {
    await sessions.start(props.id, await expand(value), reasoning, mode, agent, improve)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

/** Atalhos: `/skill texto` prefixa a skill; `/servidor:prompt chave=valor` vira o prompt MCP; `/anexar servidor uri` anexa o recurso. */
async function expand(value: string): Promise<string> {
  const skill = /^\/([a-z0-9][a-z0-9:_-]*)\s*([\s\S]*)$/i.exec(value)
  if (skill && !skill[1]!.includes(':') && skill[1] !== 'anexar') {
    const res = await client.request({ type: 'skill.get', name: skill[1]! }, 'skill.get').catch(() => null)
    if (res) return `${skill[2]!.trim() || 'Aplique estas instrucoes ao contexto atual.'}\n\n<skill name="${res.name}">\n${res.body}\n</skill>`
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
      <strong>{{ session?.title ?? 'Sessao' }}</strong>
      <span class="chip">{{ session?.agent }}</span>
      <span class="muted small path">{{ session?.workspace }}</span>
      <span class="spacer"></span>
      <span class="muted small">sessao {{ (session?.costUsd ?? 0).toFixed(4) }} USD</span>
      <span v-if="run" class="muted small">run {{ run.costUsd.toFixed(4) }} USD, {{ run.steps }} passos</span>
    </div>
    <div ref="scroller" class="timeline">
      <Timeline :items="items" />
      <div v-if="running" class="working"><span class="pulse" data-status="running"></span> trabalhando</div>
    </div>
    <Composer
      :session="session"
      :agent="agent"
      :run="run"
      :running="running"
      :error="error"
      @send="send"
      @cancel="sessions.cancel(props.id)"
      @override="(v) => sessions.override(props.id, 'run', v)"
    />
  </section>
</template>
