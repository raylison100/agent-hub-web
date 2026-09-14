<script setup lang="ts">
import type { BackgroundTask } from '@agent-hub/core'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { client } from '../daemon/client'
import { abrirExterno } from '../links-externos'
import { useSessions } from '../stores/sessions'
import { enderecoDoArquivo, useVisualizacao } from '../stores/visualizacao'
import TerminalPane from './TerminalPane.vue'
import Timeline from './Timeline.vue'

const props = defineProps<{ sessionId: string }>()
const sessions = useSessions()
const visualizacao = useVisualizacao()
const tab = ref<'visualizar' | 'subagents' | 'tarefas' | 'saidas' | 'terminal'>('subagents')
const arquivo = computed(() => (visualizacao.alvo && visualizacao.alvo.sessionId === props.sessionId ? visualizacao.alvo : null))
const conteudo = reactive<{ carregando: boolean; erro: string; imagem: string; html: string | null; pdf: string }>({ carregando: false, erro: '', imagem: '', html: null, pdf: '' })

/** Busca o arquivo pelo canal do protocolo e monta a origem que o painel mostra, sem depender de o cliente alcancar o daemon por HTTP. */
async function carregarArquivo(): Promise<void> {
  const alvo = arquivo.value
  if (conteudo.pdf) URL.revokeObjectURL(conteudo.pdf)
  Object.assign(conteudo, { carregando: Boolean(alvo), erro: '', imagem: '', html: null, pdf: '' })
  if (!alvo) return
  try {
    const lido = await client.request({ type: 'arquivo.ler', session_id: alvo.sessionId, path: alvo.caminho }, 'arquivo.conteudo', 60000)
    if (arquivo.value !== alvo) return
    if (lido.media_type.startsWith('image/') && !lido.media_type.includes('svg')) {
      conteudo.imagem = `data:${lido.media_type};base64,${lido.data}`
    } else if (lido.media_type === 'application/pdf') {
      const bytes = Uint8Array.from(atob(lido.data), (c) => c.charCodeAt(0))
      conteudo.pdf = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    } else {
      const texto = new TextDecoder().decode(Uint8Array.from(atob(lido.data), (c) => c.charCodeAt(0)))
      const pasta = alvo.caminho.includes('/') ? alvo.caminho.slice(0, alvo.caminho.lastIndexOf('/') + 1) : ''
      const base = `<base href="${enderecoDoArquivo(alvo.sessionId, pasta)}">`
      conteudo.html = /<head[^>]*>/i.test(texto) ? texto.replace(/<head[^>]*>/i, (h) => `${h}${base}`) : `${base}${texto}`
    }
  } catch (err) {
    conteudo.erro = err instanceof Error ? err.message : String(err)
  } finally {
    conteudo.carregando = false
  }
}

watch(
  () => visualizacao.versao,
  () => {
    if (arquivo.value) tab.value = 'visualizar'
    void carregarArquivo()
  },
  { immediate: true },
)

function abrirFora(): void {
  if (arquivo.value) void abrirExterno(arquivo.value.url).catch(() => undefined)
}

function fecharVisualizacao(): void {
  visualizacao.fechar()
  tab.value = 'subagents'
}
const tarefas = ref<BackgroundTask[]>([])
let timer: number | null = null

const subagents = computed(() => sessions.subagents(props.sessionId))
const running = computed(() => subagents.value.filter((s) => s.status === 'running').length)
const entries = computed(() => sessions.terminal.get(props.sessionId) ?? [])
const rodando = computed(() => tarefas.value.filter((t) => t.status === 'rodando').length)

async function carregarTarefas(): Promise<void> {
  try {
    tarefas.value = (await client.request({ type: 'tasks.list', session_id: props.sessionId }, 'tasks.list', 15000)).tasks
  } catch {
    return
  }
}

function sairDaTelaCheia(e: KeyboardEvent): void {
  if (e.key === 'Escape' && visualizacao.telaCheia) visualizacao.alternarTelaCheia()
}

onMounted(() => window.addEventListener('keydown', sairDaTelaCheia))
onBeforeUnmount(() => window.removeEventListener('keydown', sairDaTelaCheia))

onMounted(() => {
  void carregarTarefas()
  timer = window.setInterval(() => void carregarTarefas(), 5000)
})

onBeforeUnmount(() => {
  if (timer !== null) window.clearInterval(timer)
})

watch(() => props.sessionId, () => void carregarTarefas())

function quando(ts: number): string {
  const segundos = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (segundos < 60) return `${segundos}s`
  if (segundos < 3600) return `${Math.round(segundos / 60)}min`
  return `${Math.round(segundos / 3600)}h`
}
</script>

<template>
  <aside class="panel-right">
    <div class="tabs">
      <button v-if="arquivo" :class="{ active: tab === 'visualizar' }" @click="tab = 'visualizar'">Visualizar</button>
      <button :class="{ active: tab === 'subagents' }" @click="tab = 'subagents'">
        Subagentes <span v-if="running" class="badge">{{ running }}</span>
      </button>
      <button :class="{ active: tab === 'tarefas' }" @click="tab = 'tarefas'">
        Tarefas <span v-if="rodando" class="badge">{{ rodando }}</span>
      </button>
      <button :class="{ active: tab === 'terminal' }" @click="tab = 'terminal'">Terminal</button>
      <button :class="{ active: tab === 'saidas' }" @click="tab = 'saidas'">
        Saidas <span v-if="entries.length" class="badge muted-badge">{{ entries.length }}</span>
      </button>
    </div>

    <div v-if="tab === 'subagents'" class="panel-scroll">
      <p v-if="!subagents.length" class="muted small pad">Nenhum subagente nesta sessao. Perfis com <code>delegates</code> mostram aqui cada delegacao ao vivo.</p>
      <div v-for="(s, i) in subagents" :key="i" class="panel-sub">
        <div class="panel-sub-head">
          <span class="pulse" :data-status="s.status"></span>
          <strong>{{ s.agent }}</strong>
          <span class="cost">{{ s.costUsd.toFixed(4) }} USD</span>
        </div>
        <div class="muted small">{{ s.task }}</div>
        <Timeline :items="s.items" nested />
      </div>
    </div>

    <div v-else-if="tab === 'tarefas'" class="panel-scroll">
      <div class="panel-head-row">
        <span class="muted small">Subagentes em segundo plano desta sessao</span>
        <button class="ghost small" @click="carregarTarefas">Atualizar</button>
      </div>
      <p v-if="!tarefas.length" class="muted small pad">Nada rodando em segundo plano. A ferramenta <code>spawn</code> cria tarefas assim.</p>
      <div v-for="t in tarefas" :key="t.task_id" class="panel-sub">
        <div class="panel-sub-head">
          <span class="pulse" :data-status="t.status === 'rodando' ? 'running' : 'done'"></span>
          <strong>{{ t.agent }}</strong>
          <span class="tag" :data-state="t.status === 'rodando' ? 'idle' : t.status === 'erro' ? 'error' : 'on'">{{ t.status }}</span>
          <span class="cost">{{ t.cost_usd.toFixed(4) }} USD</span>
        </div>
        <div class="muted small">{{ t.task }}</div>
        <div class="muted small">ha {{ quando(t.started_at) }}<span v-if="t.collected">, ja recolhida pelo agente</span></div>
      </div>
    </div>

    <div v-else-if="tab === 'visualizar'" class="visualizar">
      <template v-if="arquivo">
        <div class="visualizar-barra">
          <code class="small visualizar-caminho" :title="arquivo.caminho">{{ arquivo.caminho }}</code>
          <button class="ghost small" type="button" title="Recarregar" @click="visualizacao.recarregar()">Recarregar</button>
          <button class="ghost small" type="button" :title="visualizacao.telaCheia ? 'Voltar para o painel lateral' : 'Ver em tela cheia'" @click="visualizacao.alternarTelaCheia()">
            {{ visualizacao.telaCheia ? 'Reduzir' : 'Ampliar' }}
          </button>
          <button class="ghost small" type="button" title="Abrir no navegador" @click="abrirFora">Abrir fora</button>
          <button class="ghost small" type="button" title="Fechar" @click="fecharVisualizacao">x</button>
        </div>
        <p v-if="conteudo.erro" class="error small pad">{{ conteudo.erro }}</p>
        <p v-else-if="conteudo.carregando" class="muted small pad">Carregando...</p>
        <img v-else-if="conteudo.imagem" class="visualizar-imagem" :src="conteudo.imagem" :alt="arquivo.caminho" />
        <iframe
          v-else-if="conteudo.html !== null"
          :key="`h${visualizacao.versao}`"
          class="visualizar-quadro"
          :srcdoc="conteudo.html"
          sandbox="allow-scripts allow-downloads allow-popups allow-modals allow-forms"
          referrerpolicy="no-referrer"
          :title="arquivo.caminho"
        ></iframe>
        <iframe v-else-if="conteudo.pdf" :key="`p${visualizacao.versao}`" class="visualizar-quadro" :src="conteudo.pdf" :title="arquivo.caminho"></iframe>
      </template>
      <p v-else class="muted small pad">Clique num arquivo citado na conversa (HTML, imagem, SVG ou PDF) para ver aqui.</p>
    </div>

    <TerminalPane v-else-if="tab === 'terminal'" :session-id="sessionId" />

    <div v-else class="panel-scroll terminal">
      <p v-if="!entries.length" class="muted small pad">Saidas de run_command e git aparecem aqui.</p>
      <div v-for="(e, i) in entries" :key="i" class="term-entry">
        <div class="term-cmd">$ {{ e.command }}</div>
        <pre class="term-out">{{ e.output }}</pre>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.visualizar {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.visualizar-barra {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
}

.visualizar-caminho {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visualizar-quadro {
  flex: 1;
  width: 100%;
  border: 0;
  background: #fff;
}

.visualizar-imagem {
  display: block;
  max-width: 100%;
  margin: 8px auto;
  object-fit: contain;
}
</style>
