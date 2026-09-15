<script setup lang="ts">
import type { EstadoDaVersao, EstadoDoCanal, HealthItem, ScheduleStatus, ServerFrame } from '@agent-hub/core'
import { computed, onMounted, ref } from 'vue'
import { client } from '../daemon/client'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { useConnection } from '../stores/connection'
import { mensagemDeErro } from '../ui/feedback'

type Custo = Extract<ServerFrame, { type: 'cost.status' }>

const carregando = ref(true)
const alertas = ref<HealthItem[]>([])
const canais = ref<EstadoDoCanal[]>([])
const rotinas = ref<ScheduleStatus[]>([])
const rotinasPausadas = ref(false)
const custo = ref<Custo | null>(null)
const versao = ref<EstadoDaVersao | null>(null)
const falhas = ref<string[]>([])

const problemas = computed(() => alertas.value.filter((a) => a.level !== 'ok'))
const pedidosDeAcesso = computed(() => canais.value.reduce((n, c) => n + c.pedidos.length, 0))
const rotinasAtivas = computed(() => rotinas.value.filter((r) => r.enabled))
const proxima = computed(() =>
  rotinasAtivas.value.filter((r) => r.nextRunAt).sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0))[0],
)

function reais(usd: number): string {
  return `US$ ${usd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function quando(ts: number | null | undefined): string {
  if (!ts) return 'sem horário'
  return new Date(ts).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function tentar<T>(nome: string, acao: () => Promise<T>): Promise<T | undefined> {
  try {
    return await acao()
  } catch (err) {
    falhas.value.push(`${nome}: ${mensagemDeErro(err)}`)
    return undefined
  }
}

onMounted(async () => {
  await useConnection().whenOnline().catch(() => undefined)
  await Promise.all([
    tentar('alertas', async () => (alertas.value = (await client.request({ type: 'health.list' }, 'health.list')).items)),
    tentar('canais', async () => (canais.value = (await client.request({ type: 'canais.estado' }, 'canais.estado')).canais)),
    tentar('rotinas', async () => {
      const r = await client.request({ type: 'schedule.list' }, 'schedule.list')
      rotinas.value = r.schedules
      rotinasPausadas.value = r.paused
    }),
    tentar('gastos', async () => (custo.value = await client.request({ type: 'cost.status' }, 'cost.status'))),
    tentar('versão', async () => (versao.value = (await client.request({ type: 'versao.consultar' }, 'versao.estado', 30000)).estado)),
  ])
  carregando.value = false
})
</script>

<template>
  <div class="ui-page">
    <PageHeader titulo="Visão geral" descricao="O que precisa da sua atenção e como estão agentes, canais, gastos e o sistema." />

    <EmptyState v-if="carregando" titulo="Carregando" carregando />

    <template v-else>
      <Card titulo="Precisa de atenção">
        <EmptyState v-if="problemas.length === 0 && falhas.length === 0" titulo="Tudo certo" texto="Nenhum aviso no momento." />
        <ul v-else class="ui-lista">
          <li v-for="a in problemas" :key="a.title" class="ui-lista-item">
            <StatusBadge :estado="a.level === 'erro' ? 'erro' : 'atencao'" :texto="a.level === 'erro' ? 'Erro' : 'Aviso'" />
            <span class="ui-lista-item-texto">
              <strong>{{ a.title }}</strong>
              <span class="muted ui-duas-linhas" :title="a.detail">{{ a.detail }}</span>
            </span>
            <RouterLink v-if="a.route" :to="a.route" class="ui-link-botao">{{ a.action || 'Resolver' }}</RouterLink>
          </li>
          <li v-for="f in falhas" :key="f" class="ui-lista-item">
            <StatusBadge estado="erro" texto="Falha" />
            <span class="ui-lista-item-texto"><span class="muted">Não consegui carregar {{ f }}</span></span>
          </li>
        </ul>
      </Card>

      <div class="ui-grade">
        <Card titulo="Canais" descricao="Bots do Telegram e WhatsApp.">
          <p class="ui-numero">{{ canais.filter((c) => c.rodando).length }} <span class="muted">de {{ canais.length }} ligados</span></p>
          <StatusBadge v-if="pedidosDeAcesso" estado="atencao" :texto="`${pedidosDeAcesso} pedido(s) de acesso`" />
          <template #acoes><RouterLink to="/settings/canais" class="ui-link-botao">Abrir</RouterLink></template>
        </Card>

        <Card titulo="Rotinas" descricao="Agentes que rodam sozinhos em horários definidos.">
          <p class="ui-numero">{{ rotinasAtivas.length }} <span class="muted">ativas</span></p>
          <StatusBadge v-if="rotinasPausadas" estado="atencao" texto="Todas pausadas" />
          <p v-else-if="proxima" class="muted small">Próxima: {{ proxima.id }}, {{ quando(proxima.nextRunAt) }}</p>
          <template #acoes><RouterLink to="/settings/automacoes" class="ui-link-botao">Abrir</RouterLink></template>
        </Card>

        <Card titulo="Gastos" descricao="Uso dos modelos pagos.">
          <template v-if="custo">
            <p class="ui-numero">{{ reais(custo.today_usd) }} <span class="muted">hoje</span></p>
            <p class="muted small">
              {{ reais(custo.month_usd) }} no mês<template v-if="custo.global_month_limit_usd"> de {{ reais(custo.global_month_limit_usd) }}</template>
            </p>
          </template>
          <template #acoes><RouterLink to="/settings/custos" class="ui-link-botao">Abrir</RouterLink></template>
        </Card>

        <Card titulo="Versão" descricao="Atualizações do Agent Hub.">
          <template v-if="versao">
            <p class="ui-numero">{{ versao.atual }}</p>
            <StatusBadge v-if="versao.disponivel" estado="atencao" :texto="`Nova versão ${versao.ultima}`" />
            <StatusBadge v-else estado="ok" texto="Em dia" />
          </template>
          <template #acoes><RouterLink to="/settings/atualizacoes" class="ui-link-botao">Abrir</RouterLink></template>
        </Card>
      </div>
    </template>
  </div>
</template>
