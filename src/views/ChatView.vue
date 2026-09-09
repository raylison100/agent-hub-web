<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import ToolCard from '../components/ToolCard.vue'
import { client } from '../daemon/client'
import { useSessions } from '../stores/sessions'

const props = defineProps<{ id: string }>()
const sessions = useSessions()
const route = useRoute()
const text = ref('')
const error = ref('')
const scroller = ref<HTMLElement | null>(null)
const overrideValue = ref('')

const session = computed(() => sessions.sessions.find((s) => s.id === props.id))
const items = computed(() => sessions.timeline(props.id))
const run = computed(() => sessions.runs.get(props.id))
const running = computed(() => Boolean(run.value && !run.value.finished))

onMounted(async () => {
  try {
    await sessions.open(props.id)
    const first = route.query.first
    if (typeof first === 'string' && first) await send(first)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
})

watch(items, () => void nextTick(scrollDown), { deep: true })

async function submit(): Promise<void> {
  const value = text.value.trim()
  if (!value || running.value) return
  text.value = ''
  try {
    await send(await expand(value))
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

/** Atalhos MCP: `/servidor:prompt chave=valor` vira o texto do prompt; `/anexar servidor uri` anexa o recurso ao fim da mensagem. */
async function expand(value: string): Promise<string> {
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

async function send(value: string): Promise<void> {
  error.value = ''
  try {
    await sessions.start(props.id, value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

function override(): void {
  const v = Number(overrideValue.value)
  if (Number.isFinite(v) && v > 0) sessions.override(props.id, 'run', v)
}

function scrollDown(): void {
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void submit()
  }
}
</script>

<template>
  <section class="chat">
    <header class="chat-head">
      <div>
        <strong>{{ session?.title ?? 'Sessao' }}</strong>
        <div class="muted small">
          <span class="tag">{{ session?.agent }}</span>
          {{ session?.workspace }}
        </div>
      </div>
      <div class="chat-cost">
        <div>sessao <strong>{{ (session?.costUsd ?? 0).toFixed(4) }}</strong> USD</div>
        <div v-if="run">run <strong>{{ run.costUsd.toFixed(4) }}</strong> USD, {{ run.steps }} passos</div>
      </div>
    </header>

    <div ref="scroller" class="timeline">
      <template v-for="(item, i) in items" :key="i">
        <div v-if="item.kind === 'user'" class="bubble user"><pre>{{ item.text }}</pre></div>
        <div v-else-if="item.kind === 'assistant'" class="bubble assistant" :class="{ live: item.live }"><pre>{{ item.text }}</pre></div>
        <ToolCard v-else-if="item.kind === 'tool'" :item="item" />
        <div v-else class="info">{{ item.text }}</div>
      </template>
      <div v-if="running" class="info">executando...</div>
    </div>

    <footer class="composer">
      <p v-if="error" class="error">{{ error }}</p>
      <div v-if="run?.stop === 'budget_exceeded'" class="row">
        <input v-model="overrideValue" type="number" step="0.1" min="0" placeholder="novo limite do run em USD" />
        <button @click="override">Subir limite</button>
      </div>
      <textarea
        v-model="text"
        rows="3"
        placeholder="Mensagem. Enter envia, Shift+Enter quebra linha. Atalhos: /servidor:prompt chave=valor, /anexar servidor uri"
        @keydown="onKey"
      ></textarea>
      <div class="row">
        <button class="primary" :disabled="running" @click="submit">Enviar</button>
        <button v-if="running" @click="sessions.cancel(props.id)">Cancelar</button>
      </div>
    </footer>
  </section>
</template>
