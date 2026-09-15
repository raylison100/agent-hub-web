<script setup lang="ts">
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { client } from '../daemon/client'

const props = defineProps<{ sessionId: string }>()

const caixa = ref<HTMLElement | null>(null)
const erro = ref('')
const cwd = ref('')
let term: Terminal | null = null
let fit: FitAddon | null = null
let termId = ''
let solto: (() => void) | null = null
let observer: ResizeObserver | null = null

const guardados = new Map<string, string>()

function cores(): Record<string, string> {
  const estilo = getComputedStyle(document.documentElement)
  const ler = (nome: string, alternativa: string) => estilo.getPropertyValue(nome).trim() || alternativa
  return {
    background: ler('--code-bg', '#0f0f12'),
    foreground: ler('--text', '#e8e8ec'),
    cursor: ler('--accent', '#4f86f7'),
    selectionBackground: ler('--accent-soft', 'rgba(79,134,247,0.25)'),
  }
}

async function abrir(): Promise<void> {
  if (!caixa.value) return
  erro.value = ''
  term?.dispose()
  term = new Terminal({
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'monospace',
    fontSize: 12,
    cursorBlink: true,
    theme: cores(),
    scrollback: 5000,
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(caixa.value)
  fit.fit()
  term.onData((data) => {
    if (termId) client.send({ type: 'term.input', term_id: termId, data })
  })
  try {
    const res = await client.request(
      { type: 'term.open', session_id: props.sessionId, cols: term.cols, rows: term.rows, term_id: guardados.get(props.sessionId) },
      'term.opened',
      20000,
    )
    termId = res.term_id
    cwd.value = res.cwd
    guardados.set(props.sessionId, res.term_id)
    if (res.buffer) term.write(res.buffer)
  } catch (err) {
    erro.value = err instanceof Error ? err.message : String(err)
  }
}

function ajustar(): void {
  if (!fit || !term || !termId) return
  fit.fit()
  client.send({ type: 'term.resize', term_id: termId, cols: term.cols, rows: term.rows })
}

onMounted(async () => {
  solto = client.on((frame) => {
    if (frame.type === 'term.data' && frame.term_id === termId) term?.write(frame.data)
    if (frame.type === 'term.exit' && frame.term_id === termId) {
      term?.writeln(`\r\n[shell encerrado com código ${frame.code}]`)
      guardados.delete(props.sessionId)
      termId = ''
    }
  })
  await abrir()
  observer = new ResizeObserver(() => ajustar())
  if (caixa.value) observer.observe(caixa.value)
})

onBeforeUnmount(() => {
  solto?.()
  observer?.disconnect()
  term?.dispose()
  term = null
})

watch(
  () => props.sessionId,
  async () => {
    termId = ''
    await abrir()
  },
)

function reiniciar(): void {
  if (termId) client.send({ type: 'term.close', term_id: termId })
  guardados.delete(props.sessionId)
  termId = ''
  void abrir()
}
</script>

<template>
  <div class="terminal-pane">
    <div class="terminal-head">
      <span class="mono small" :title="cwd">{{ cwd || 'terminal' }}</span>
      <span class="spacer"></span>
      <button class="ghost small" title="Novo shell nesta pasta" @click="reiniciar">Reiniciar</button>
    </div>
    <p v-if="erro" class="error small pad">{{ erro }}</p>
    <div ref="caixa" class="terminal-box"></div>
  </div>
</template>
