<script setup lang="ts">
import type { AutomationRun, HookCatalogItem, ScheduleStatus, ServerFrame, WorkflowRunState } from '@agent-hub/core'
import { onMounted, onUnmounted, ref } from 'vue'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Field from '../components/ui/Field.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { useSessions } from '../stores/sessions'
import { avisar, confirmar, mensagemDeErro } from '../ui/feedback'

const sessions = useSessions()
const schedules = ref<ScheduleStatus[]>([])
const runs = ref<AutomationRun[]>([])
const paused = ref(false)
const error = ref('')
const carregando = ref(true)
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

async function save(): Promise<void> {
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
    avisar(`Rotina ${form.value.id} salva.`)
    await load()
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  }
}

function runNow(id: string): void {
  try {
    client.send({ type: 'schedule.run_now', id })
    avisar(`Rotina ${id} iniciada. O resultado aparece nas sessões e no canal de aviso.`, 'info')
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  }
}

async function remove(id: string): Promise<void> {
  const ok = await confirmar({ titulo: `Apagar a rotina ${id}?`, detalhe: 'Ela deixa de rodar. As sessões que ela já criou continuam.', botao: 'Apagar rotina' })
  if (!ok) return
  try {
    await client.request({ type: 'schedule.delete', id }, 'schedule.deleted')
    avisar(`Rotina ${id} apagada.`)
    await load()
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  }
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
  if (f.type === 'automation.error') avisar(`Rotina ${f.id}: ${f.message}`, 'erro')
}

let off: (() => void) | null = null
onMounted(async () => {
  off = client.on(onFrame)
  await useConnection().whenOnline().catch(() => undefined)
  void load()
  void loadGanchos()
  void loadParados()
})
onUnmounted(() => off?.())
</script>

<template>
  <div class="ui-page">
    <PageHeader titulo="Rotinas" descricao="Agentes que rodam sozinhos em horários definidos, ações automáticas em volta das ferramentas e o histórico do que já rodou.">
      <template #acoes>
        <button :class="{ primary: paused }" @click="toggle">{{ paused ? 'Retomar tudo' : 'Pausar tudo' }}</button>
      </template>
    </PageHeader>

    <Card titulo="Agendamentos" descricao="Rotinas cadastradas e quando cada uma roda.">
      <EmptyState v-if="carregando" titulo="Carregando" carregando />
      <EmptyState v-else-if="error" titulo="Não consegui carregar as rotinas" :texto="error">
        <button @click="load">Tentar de novo</button>
      </EmptyState>
      <EmptyState v-else-if="!schedules.length" titulo="Nenhuma rotina ainda" texto="Crie a primeira no formulário abaixo." />
      <ul v-else class="ui-lista">
        <li v-for="s in schedules" :key="s.id" class="ui-lista-item">
          <span class="ui-lista-item-texto">
            <strong>{{ s.id }} <span class="tag">{{ s.source }}</span> <span v-if="s.running" class="tag">rodando</span></strong>
            <span class="muted">{{ s.cron ?? `em ${when(s.at ?? null)}` }} ({{ s.timezone }}), {{ s.agent }}, {{ s.mode }}</span>
            <span class="muted">próximo {{ when(s.nextRunAt) }}, último {{ when(s.lastRunAt) }}, hoje {{ s.todayUsd.toFixed(4) }} de {{ s.budget.day_usd }} USD</span>
          </span>
          <span class="ui-lista-item-acoes">
            <button @click="runNow(s.id)">Rodar agora</button>
            <button class="danger" @click="remove(s.id)">Apagar</button>
          </span>
        </li>
      </ul>
    </Card>

    <Card titulo="Nova rotina" descricao="Escolha o agente, o horário e o que ele deve fazer.">
      <form class="ui-form duas-colunas" @submit.prevent="save">
        <Field rotulo="Id"><input v-model="form.id" type="text" placeholder="resumo-diario" spellcheck="false" /></Field>
        <Field rotulo="Agente">
          <select v-model="form.agent">
            <option v-for="a in sessions.agents" :key="a.name" :value="a.name">{{ a.name }}</option>
          </select>
        </Field>
        <Field rotulo="Cron"><input v-model="form.cron" type="text" spellcheck="false" /></Field>
        <Field rotulo="Fuso"><input v-model="form.timezone" type="text" spellcheck="false" /></Field>
        <Field rotulo="Workspace"><input v-model="form.workspace" type="text" spellcheck="false" /></Field>
        <Field rotulo="Modo">
          <select v-model="form.mode">
            <option value="draft">rascunho (sem escrita nem execução)</option>
            <option value="normal">normal (política do perfil)</option>
          </select>
        </Field>
        <Field rotulo="Prompt" style="grid-column: 1 / -1"><textarea v-model="form.prompt" rows="3"></textarea></Field>
        <Field rotulo="Por run USD"><input v-model="form.run_usd" type="number" step="0.01" min="0" /></Field>
        <Field rotulo="Por dia USD"><input v-model="form.day_usd" type="number" step="0.01" min="0" /></Field>
        <div class="ui-form-acoes">
          <button class="primary" type="submit">Salvar</button>
        </div>
      </form>
    </Card>

    <Card v-if="parados.length" titulo="Workflows parados no meio" descricao="Execuções que pararam antes de terminar e podem continuar de onde pararam.">
      <ul class="ui-lista">
        <li v-for="p in parados" :key="p.runId" class="ui-lista-item">
          <span class="tag">{{ p.status }}</span>
          <span class="ui-lista-item-texto">
            <strong>{{ p.name }}</strong>
            <span class="muted">próxima etapa {{ p.nextStep ?? '-' }}, já gastou {{ p.costUsd.toFixed(4) }} USD</span>
          </span>
          <button class="primary small" @click="continuar(p.runId)">Continuar</button>
        </li>
      </ul>
    </Card>

    <Card
      titulo="Ganchos prontos"
      :descricao="`Comandos que o harness dispara sozinho em volta das ferramentas. Ligar escreve em agents/hooks.json; desligar tira de lá. ${extras} gancho(s) seu(s) fora deste catálogo continuam como estão.`"
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
            <span class="tag">{{ r.kind }}</span> {{ r.automationId }}
            <span class="muted small">{{ when(r.startedAt) }}</span>
            <span class="tag">{{ r.status }}</span>
            <span class="cost">{{ r.costUsd.toFixed(4) }} USD</span>
          </RouterLink>
        </li>
      </ul>
    </Card>
  </div>
</template>
