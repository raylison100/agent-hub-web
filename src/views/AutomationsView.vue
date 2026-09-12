<script setup lang="ts">
import type { AutomationRun, HookCatalogItem, ScheduleStatus, ServerFrame, WorkflowRunState } from '@agent-hub/core'
import { onMounted, onUnmounted, ref } from 'vue'
import { client } from '../daemon/client'
import { useSessions } from '../stores/sessions'

const sessions = useSessions()
const schedules = ref<ScheduleStatus[]>([])
const runs = ref<AutomationRun[]>([])
const paused = ref(false)
const error = ref('')
const form = ref({
  id: '',
  cron: '0 8 * * 1-5',
  timezone: 'America/Sao_Paulo',
  agent: '',
  workspace: '',
  prompt: '',
  mode: 'draft' as 'draft' | 'normal',
  run_usd: 0.2,
  day_usd: 0.5,
})


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
  error.value = ''
  try {
    const res = await client.request({ type: 'hooks.toggle', id, enabled }, 'hooks.list')
    ganchos.value = res.catalog
    extras.value = res.extras
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function loadParados(): Promise<void> {
  try {
    parados.value = (await client.request({ type: 'workflow.list' }, 'workflow.list')).pending
  } catch {
    parados.value = []
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
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function save(): Promise<void> {
  error.value = ''
  try {
    await client.request(
      {
        type: 'schedule.upsert',
        schedule: {
          id: form.value.id,
          cron: form.value.cron,
          timezone: form.value.timezone,
          agent: form.value.agent,
          workspace: form.value.workspace,
          prompt: form.value.prompt,
          mode: form.value.mode,
          budget: { run_usd: Number(form.value.run_usd), day_usd: Number(form.value.day_usd) },
          overlap: 'skip',
          missed: 'skip',
          enabled: true,
        },
      },
      'schedule.saved',
    )
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

function runNow(id: string): void {
  client.send({ type: 'schedule.run_now', id })
}

async function remove(id: string): Promise<void> {
  await client.request({ type: 'schedule.delete', id }, 'schedule.deleted')
  await load()
}

function toggle(): void {
  client.send({ type: paused.value ? 'automation.resume' : 'automation.pause' })
}

function when(ts: number | null): string {
  return ts ? new Date(ts).toLocaleString() : 'nunca'
}

function onFrame(f: ServerFrame): void {
  if (f.type === 'automation.state') paused.value = f.paused
  if (f.type === 'automation.started' || f.type === 'automation.finished' || f.type === 'schedule.saved' || f.type === 'schedule.deleted') void load()
  if (f.type === 'automation.error') error.value = `${f.id}: ${f.message}`
}

let off: (() => void) | null = null
onMounted(() => {
  off = client.on(onFrame)
  void load()
  void loadGanchos()
  void loadParados()
})
onUnmounted(() => off?.())
</script>

<template>
  <section class="two-col">
    <div class="panel">
      <h1>Novo agendamento</h1>
      <form @submit.prevent="save">
        <label>Id <input v-model="form.id" type="text" placeholder="resumo-diario" spellcheck="false" /></label>
        <label>Cron <input v-model="form.cron" type="text" spellcheck="false" /></label>
        <label>Fuso <input v-model="form.timezone" type="text" spellcheck="false" /></label>
        <label>
          Agente
          <select v-model="form.agent">
            <option v-for="a in sessions.agents" :key="a.name" :value="a.name">{{ a.name }}</option>
          </select>
        </label>
        <label>Workspace <input v-model="form.workspace" type="text" spellcheck="false" /></label>
        <label>Prompt <textarea v-model="form.prompt" rows="3"></textarea></label>
        <label>
          Modo
          <select v-model="form.mode">
            <option value="draft">rascunho (sem escrita nem execucao)</option>
            <option value="normal">normal (politica do perfil)</option>
          </select>
        </label>
        <div class="row">
          <label>Por run USD <input v-model="form.run_usd" type="number" step="0.01" min="0" /></label>
          <label>Por dia USD <input v-model="form.day_usd" type="number" step="0.01" min="0" /></label>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" type="submit">Salvar</button>
      </form>
    </div>
    <div class="panel">
      <div class="row" style="justify-content: space-between">
        <h1>Automacoes</h1>
        <button :class="{ primary: paused }" @click="toggle">{{ paused ? 'Retomar tudo' : 'Pausar tudo' }}</button>
      </div>
      <p v-if="!schedules.length" class="muted">Nenhum agendamento.</p>
      <ul class="list">
        <li v-for="s in schedules" :key="s.id">
          <div class="list-title">{{ s.id }} <span class="tag">{{ s.source }}</span> <span v-if="s.running" class="tag">rodando</span></div>
          <div class="muted small">{{ s.cron ?? `em ${when(s.at ?? null)}` }} ({{ s.timezone }}), {{ s.agent }}, {{ s.mode }}</div>
          <div class="muted small">proximo {{ when(s.nextRunAt) }}, ultimo {{ when(s.lastRunAt) }}, hoje {{ s.todayUsd.toFixed(4) }} de {{ s.budget.day_usd }} USD</div>
          <div class="row" style="margin-top: 6px">
            <button @click="runNow(s.id)">Rodar agora</button>
            <button @click="remove(s.id)">Apagar</button>
          </div>
        </li>
      </ul>
      <div v-if="parados.length" class="bloco">
        <h1 style="margin-top: 16px">Workflows parados no meio</h1>
        <ul class="list">
          <li v-for="p in parados" :key="p.runId">
            <span class="tag">{{ p.status }}</span>
            <strong>{{ p.name }}</strong>
            <span class="muted small">proxima etapa {{ p.nextStep ?? '-' }}, ja gastou {{ p.costUsd.toFixed(4) }} USD</span>
            <button class="primary small" @click="continuar(p.runId)">Continuar</button>
          </li>
        </ul>
      </div>

      <h1 style="margin-top: 16px">Ganchos prontos</h1>
      <p class="muted small">
        Comandos que o harness dispara sozinho em volta das ferramentas. Ligar escreve em agents/hooks.json;
        desligar tira de la. {{ extras }} gancho(s) seu(s) fora deste catalogo continuam como estao.
      </p>
      <ul class="list">
        <li v-for="g in ganchos" :key="g.id">
          <div class="hook-linha">
            <strong>{{ g.title }}</strong>
            <span class="tag">{{ g.event }}</span>
            <span v-if="g.tool" class="tag">{{ g.tool }}</span>
            <span class="spacer"></span>
            <button :class="{ primary: !g.enabled }" @click="ligarGancho(g.id, !g.enabled)">{{ g.enabled ? 'Desligar' : 'Ligar' }}</button>
          </div>
          <p class="muted small">{{ g.detail }}</p>
        </li>
      </ul>

      <h1 style="margin-top: 16px">Ultimas execucoes</h1>
      <ul class="list">
        <li v-for="r in runs" :key="r.id">
          <RouterLink :to="{ name: 'chat', params: { id: r.sessionId } }">
            <span class="tag">{{ r.kind }}</span> {{ r.automationId }}
            <span class="muted small">{{ when(r.startedAt) }}</span>
            <span class="tag">{{ r.status }}</span>
            <span class="cost">{{ r.costUsd.toFixed(4) }} USD</span>
          </RouterLink>
        </li>
      </ul>
    </div>
  </section>
</template>
