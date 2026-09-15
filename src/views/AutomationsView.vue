<script setup lang="ts">
import type { AutomationRun, EstadoDoCanal, HookCatalogItem, ScheduleSpec, ScheduleStatus, ServerFrame, WorkflowRunState } from '@agent-hub/core'
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { avisar, confirmar, mensagemDeErro } from '../ui/feedback'
import { descreverHorario, nomeDaRotina } from '../ui/horarios'

const router = useRouter()
const schedules = ref<ScheduleStatus[]>([])
const runs = ref<AutomationRun[]>([])
const canais = ref<EstadoDoCanal[]>([])
const paused = ref(false)
const error = ref('')
const carregando = ref(true)
const alternando = ref<string | null>(null)

const ganchos = ref<HookCatalogItem[]>([])
const extras = ref(0)
const parados = ref<WorkflowRunState[]>([])

async function loadGanchos(): Promise<void> {
  try {
    const res = await client.request({ type: 'hooks.list' }, 'hooks.list')
    ganchos.value = res.catalog
    extras.value = res.extras
  } catch {
    ganchos.value = []
  }
}

async function ligarGancho(id: string, enabled: boolean): Promise<void> {
  try {
    const res = await client.request({ type: 'hooks.toggle', id, enabled }, 'hooks.list')
    ganchos.value = res.catalog
    extras.value = res.extras
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  }
}

async function loadParados(): Promise<void> {
  try {
    parados.value = (await client.request({ type: 'workflow.list' }, 'workflow.list')).pending
  } catch {
    parados.value = []
  }
}

async function loadCanais(): Promise<void> {
  try {
    canais.value = (await client.request({ type: 'canais.estado' }, 'canais.estado')).canais
  } catch {
    canais.value = []
  }
}

function continuar(runId: string): void {
  client.send({ type: 'workflow.resume', run_id: runId })
  parados.value = parados.value.filter((p) => p.runId !== runId)
}

async function load(): Promise<void> {
  error.value = ''
  try {
    const res = await client.request({ type: 'schedule.list' }, 'schedule.list')
    schedules.value = res.schedules
    paused.value = res.paused
    const r = await client.request({ type: 'automation.runs', limit: 30 }, 'automation.runs')
    runs.value = r.runs
  } catch (err) {
    error.value = mensagemDeErro(err)
  } finally {
    carregando.value = false
  }
}

function paraSpec(s: ScheduleStatus): ScheduleSpec {
  const { source: _source, lastRunAt: _last, nextRunAt: _next, running: _running, todayUsd: _today, ...spec } = s
  return spec
}

function runNow(s: ScheduleStatus): void {
  try {
    client.send({ type: 'schedule.run_now', id: s.id })
    avisar(`Rotina "${nomeDaRotina(s.id)}" iniciada. O resultado aparece nas conversas e no canal de aviso.`, 'info')
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  }
}

async function alternarRotina(s: ScheduleStatus): Promise<void> {
  alternando.value = s.id
  try {
    await client.request({ type: 'schedule.upsert', schedule: { ...paraSpec(s), enabled: !s.enabled } }, 'schedule.saved')
    avisar(s.enabled ? `Rotina "${nomeDaRotina(s.id)}" desligada.` : `Rotina "${nomeDaRotina(s.id)}" ligada.`)
    await load()
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  } finally {
    alternando.value = null
  }
}

async function remove(s: ScheduleStatus): Promise<void> {
  const ok = await confirmar({
    titulo: `Apagar a rotina "${nomeDaRotina(s.id)}"?`,
    detalhe: 'Ela deixa de rodar. As conversas que ela já criou continuam.',
    botao: 'Apagar rotina',
    perigo: true,
  })
  if (!ok) return
  try {
    await client.request({ type: 'schedule.delete', id: s.id }, 'schedule.deleted')
    avisar(`Rotina "${nomeDaRotina(s.id)}" apagada.`)
    await load()
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  }
}

function toggle(): void {
  client.send({ type: paused.value ? 'automation.resume' : 'automation.pause' })
}

function when(ts: number | null): string {
  return ts ? new Date(ts).toLocaleString('pt-BR') : 'nunca'
}

function proximaExecucao(s: ScheduleStatus): string {
  if (!s.enabled) return 'não roda enquanto estiver desligada'
  if (!s.nextRunAt) return 'sem próxima execução'
  return new Date(s.nextRunAt).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function avisos(s: ScheduleStatus): string {
  const ids = s.notify ?? []
  if (!ids.length) return 'Só no Agent Hub'
  const nomes = ids.map((id) => canais.value.find((c) => c.id === id)?.nome ?? id)
  return `Avisa em: ${nomes.join(', ')}`
}

function status(s: ScheduleStatus): { estado: 'ok' | 'desligado' | 'atencao' | 'andamento'; texto: string } {
  if (s.running) return { estado: 'andamento', texto: 'Rodando agora' }
  if (!s.enabled) return { estado: 'desligado', texto: 'Desligada' }
  if (paused.value) return { estado: 'atencao', texto: 'Todas pausadas' }
  return { estado: 'ok', texto: 'Ativa' }
}

function dolares(usd: number): string {
  return `US$ ${usd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: usd > 0 && usd < 0.01 ? 4 : 2 })}`
}

function onFrame(f: ServerFrame): void {
  if (f.type === 'automation.state') paused.value = f.paused
  if (f.type === 'automation.started' || f.type === 'automation.finished' || f.type === 'schedule.saved' || f.type === 'schedule.deleted') void load()
  if (f.type === 'automation.error') avisar(`Rotina "${nomeDaRotina(f.id)}": ${f.message}`, 'erro')
}

let off: (() => void) | null = null
onMounted(async () => {
  off = client.on(onFrame)
  await useConnection().whenOnline().catch(() => undefined)
  void load()
  void loadCanais()
  void loadGanchos()
  void loadParados()
})
onUnmounted(() => off?.())
</script>

<template>
  <div class="ui-page">
    <PageHeader titulo="Rotinas" descricao="Agentes que trabalham sozinhos em horários definidos.">
      <template #acoes>
        <button :class="{ primary: paused }" @click="toggle">{{ paused ? 'Retomar todas' : 'Pausar todas' }}</button>
        <button class="primary" @click="router.push('/settings/automacoes/nova')">Nova rotina</button>
      </template>
    </PageHeader>

    <Card titulo="Suas rotinas" descricao="O que cada agente faz sozinho e quando.">
      <EmptyState v-if="carregando" titulo="Carregando" carregando />
      <EmptyState v-else-if="error" titulo="Não consegui carregar as rotinas" :texto="error">
        <button @click="load">Tentar de novo</button>
      </EmptyState>
      <EmptyState v-else-if="!schedules.length" titulo="Nenhuma rotina ainda" texto="Uma rotina faz um agente trabalhar sozinho no horário que você escolher.">
        <button class="primary" @click="router.push('/settings/automacoes/nova')">Criar rotina</button>
      </EmptyState>
      <ul v-else class="ui-lista">
        <li v-for="s in schedules" :key="s.id" class="ui-lista-item rotina-item">
          <span class="ui-lista-item-texto">
            <span class="rotina-titulo">
              <strong>{{ nomeDaRotina(s.id) }}</strong>
              <StatusBadge :estado="status(s).estado" :texto="status(s).texto" />
            </span>
            <span class="rotina-horario">{{ descreverHorario(s) }}</span>
            <span class="muted">{{ s.role || s.agent }} · {{ avisos(s) }}</span>
            <span class="muted">Próxima: {{ proximaExecucao(s) }} · Gasto hoje: {{ dolares(s.todayUsd) }} de {{ dolares(s.budget.day_usd) }}</span>
          </span>
          <span class="ui-lista-item-acoes">
            <RouterLink :to="`/settings/automacoes/${encodeURIComponent(s.id)}`" class="ui-link-botao">Editar</RouterLink>
            <button @click="runNow(s)">Rodar agora</button>
            <button
              type="button"
              role="switch"
              :aria-checked="s.enabled"
              :class="['ui-interruptor', { ligado: s.enabled }]"
              :disabled="alternando === s.id"
              :title="s.enabled ? 'Desligar rotina' : 'Ligar rotina'"
              @click="alternarRotina(s)"
            >
              <span class="ui-interruptor-trilho" aria-hidden="true"><span class="ui-interruptor-bola"></span></span>
              {{ s.enabled ? 'Ligada' : 'Desligada' }}
            </button>
            <button class="danger" @click="remove(s)">Apagar</button>
          </span>
        </li>
      </ul>
    </Card>

    <Card v-if="parados.length" titulo="Workflows parados no meio" descricao="Execuções que pararam antes de terminar e podem continuar de onde pararam.">
      <ul class="ui-lista">
        <li v-for="p in parados" :key="p.runId" class="ui-lista-item">
          <span class="tag">{{ p.status }}</span>
          <span class="ui-lista-item-texto">
            <strong>{{ p.name }}</strong>
            <span class="muted">próxima etapa {{ p.nextStep ?? '-' }}, já gastou {{ dolares(p.costUsd) }}</span>
          </span>
          <button class="primary small" @click="continuar(p.runId)">Continuar</button>
        </li>
      </ul>
    </Card>

    <Card
      titulo="Ganchos prontos"
      :descricao="`Ações que o Agent Hub dispara sozinho em volta das ferramentas dos agentes. ${extras} gancho(s) seu(s) fora deste catálogo continuam como estão.`"
    >
      <EmptyState v-if="!ganchos.length" titulo="Nenhum gancho disponível" />
      <ul v-else class="ui-lista">
        <li v-for="g in ganchos" :key="g.id" class="ui-lista-item">
          <span class="ui-lista-item-texto">
            <span class="hook-linha">
              <strong>{{ g.title }}</strong>
              <span class="tag">{{ g.event }}</span>
              <span v-if="g.tool" class="tag">{{ g.tool }}</span>
            </span>
            <span class="muted">{{ g.detail }}</span>
          </span>
          <button :class="{ primary: !g.enabled }" @click="ligarGancho(g.id, !g.enabled)">{{ g.enabled ? 'Desligar' : 'Ligar' }}</button>
        </li>
      </ul>
    </Card>

    <Card titulo="Últimas execuções" descricao="O que as rotinas rodaram recentemente. Clique para abrir a conversa.">
      <EmptyState v-if="!runs.length" titulo="Nada rodou ainda" texto="Quando uma rotina rodar, ela aparece aqui." />
      <ul v-else class="ui-lista">
        <li v-for="r in runs" :key="r.id" class="ui-lista-item">
          <RouterLink :to="{ name: 'chat', params: { id: r.sessionId } }">
            <span class="tag">{{ r.kind === 'schedule' ? 'Rotina' : 'Gatilho' }}</span> {{ nomeDaRotina(r.automationId) }}
            <span class="muted small">{{ when(r.startedAt) }}</span>
            <span class="tag">{{ r.status }}</span>
            <span class="cost">{{ dolares(r.costUsd) }}</span>
          </RouterLink>
        </li>
      </ul>
    </Card>
  </div>
</template>
