<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { avisar, mensagemDeErro } from '../ui/feedback'

type Group = 'agent' | 'model' | 'session' | 'day'
interface Row {
  key: string
  costUsd: number
  calls: number
  input: number
  output: number
  cacheRead: number
}

const group = ref<Group>('agent')
const period = ref<'today' | 'week' | 'month' | 'all'>('month')
const rows = ref<Row[]>([])
const error = ref('')
const carregando = ref(true)

async function load(): Promise<void> {
  error.value = ''
  try {
    const res = await client.request({ type: 'cost.report', group: group.value, since: since() }, 'cost.report')
    rows.value = res.rows
  } catch (err) {
    error.value = mensagemDeErro(err)
  } finally {
    carregando.value = false
  }
}

function since(): number | undefined {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (period.value === 'today') return d.getTime()
  if (period.value === 'week') return d.getTime() - 6 * 86400000
  if (period.value === 'month') {
    d.setDate(1)
    return d.getTime()
  }
  return undefined
}

function total(): number {
  return rows.value.reduce((a, r) => a + r.costUsd, 0)
}

async function exportCsv(): Promise<void> {
  try {
    const res = await client.request({ type: 'cost.export', since: since() }, 'cost.export', 60000)
    const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agent-hub-ledger-${period.value}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  }
}

function cacheRate(r: Row): string {
  const denom = r.input + r.cacheRead
  return denom === 0 ? '0%' : `${Math.round((r.cacheRead / denom) * 100)}%`
}

onMounted(async () => {
  await useConnection().whenOnline().catch(() => undefined)
  await load()
})
</script>

<template>
  <div class="ui-page">
    <PageHeader titulo="Gastos" descricao="Quanto foi gasto com os modelos de IA, separado por agente, modelo, conversa ou dia.">
      <template #acoes>
        <button @click="load">Atualizar</button>
        <button @click="exportCsv">Exportar CSV</button>
      </template>
    </PageHeader>

    <Card titulo="Relatório" descricao="Escolha como agrupar e o período.">
      <div class="row">
        <select v-model="group" @change="load">
          <option value="agent">por agente</option>
          <option value="model">por modelo</option>
          <option value="session">por sessão</option>
          <option value="day">por dia</option>
        </select>
        <select v-model="period" @change="load">
          <option value="today">hoje</option>
          <option value="week">7 dias</option>
          <option value="month">este mês</option>
          <option value="all">tudo</option>
        </select>
      </div>
      <EmptyState v-if="carregando" titulo="Carregando" carregando />
      <EmptyState v-else-if="error" titulo="Não consegui carregar os gastos" :texto="error">
        <button @click="load">Tentar de novo</button>
      </EmptyState>
      <EmptyState v-else-if="!rows.length" titulo="Sem registros no período" texto="Nada foi gasto neste período. Tente escolher um período maior." />
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>chave</th>
              <th class="num">USD</th>
              <th class="num">chamadas</th>
              <th class="num">entrada</th>
              <th class="num">cache</th>
              <th class="num">taxa cache</th>
              <th class="num">saída</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.key">
              <td>
                <RouterLink v-if="group === 'session' && r.key !== 'roteamento'" :to="{ name: 'chat', params: { id: r.key } }">{{ r.key.slice(0, 8) }}</RouterLink>
                <span v-else>{{ r.key }}</span>
              </td>
              <td class="num">{{ r.costUsd.toFixed(4) }}</td>
              <td class="num">{{ r.calls }}</td>
              <td class="num">{{ r.input }}</td>
              <td class="num">{{ r.cacheRead }}</td>
              <td class="num">{{ cacheRate(r) }}</td>
              <td class="num">{{ r.output }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>total</td>
              <td class="num">{{ total().toFixed(4) }}</td>
              <td colspan="5"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  </div>
</template>
