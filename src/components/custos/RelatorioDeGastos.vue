<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { client } from '../../daemon/client'
import { useConnection } from '../../stores/connection'
import { avisar, mensagemDeErro } from '../../ui/feedback'
import Card from '../ui/Card.vue'
import EmptyState from '../ui/EmptyState.vue'
import { diaEMes, numeroInteiro, tokens, usd } from './formato'

type Grupo = 'agent' | 'model' | 'session' | 'day'
type Periodo = 'today' | 'week' | 'month' | 'all'

interface Linha {
  key: string
  costUsd: number
  calls: number
  input: number
  output: number
  cacheRead: number
}

const grupos: { valor: Grupo; rotulo: string; coluna: string }[] = [
  { valor: 'agent', rotulo: 'Por modelo', coluna: 'Modelo' },
  { valor: 'model', rotulo: 'Por versão do modelo', coluna: 'Versão do modelo' },
  { valor: 'session', rotulo: 'Por conversa', coluna: 'Conversa' },
  { valor: 'day', rotulo: 'Por dia', coluna: 'Dia' },
]

const periodos: { valor: Periodo; rotulo: string }[] = [
  { valor: 'today', rotulo: 'Hoje' },
  { valor: 'week', rotulo: 'Últimos 7 dias' },
  { valor: 'month', rotulo: 'Este mês' },
  { valor: 'all', rotulo: 'Tudo' },
]

const grupo = ref<Grupo>('agent')
const periodo = ref<Periodo>('month')
const linhas = ref<Linha[]>([])
const falha = ref('')
const carregando = ref(true)
const exportando = ref(false)

const colunaChave = computed(() => grupos.find((g) => g.valor === grupo.value)?.coluna ?? 'Item')
const total = computed(() =>
  linhas.value.reduce(
    (t, r) => ({ costUsd: t.costUsd + r.costUsd, calls: t.calls + r.calls, input: t.input + r.input, output: t.output + r.output, cacheRead: t.cacheRead + r.cacheRead }),
    { costUsd: 0, calls: 0, input: 0, output: 0, cacheRead: 0 },
  ),
)

/** Busca o relatório no daemon com o agrupamento e período escolhidos. */
async function carregar(): Promise<void> {
  carregando.value = true
  falha.value = ''
  try {
    const res = await client.request({ type: 'cost.report', group: grupo.value, since: desde() }, 'cost.report')
    linhas.value = res.rows
  } catch (err) {
    falha.value = mensagemDeErro(err)
  } finally {
    carregando.value = false
  }
}

/** Início do período escolhido, em milissegundos. */
function desde(): number | undefined {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (periodo.value === 'today') return d.getTime()
  if (periodo.value === 'week') return d.getTime() - 6 * 86400000
  if (periodo.value === 'month') {
    d.setDate(1)
    return d.getTime()
  }
  return undefined
}

/** Baixa todos os registros do período como planilha CSV. */
async function exportarCsv(): Promise<void> {
  exportando.value = true
  try {
    const res = await client.request({ type: 'cost.export', since: desde() }, 'cost.export', 60000)
    const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agent-hub-ledger-${periodo.value}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  } finally {
    exportando.value = false
  }
}

/** Parte da entrada que veio do cache, em texto. */
function cache(r: { input: number; cacheRead: number }): string {
  const denominador = r.input + r.cacheRead
  const pct = denominador === 0 ? 0 : Math.round((r.cacheRead / denominador) * 100)
  return `${tokens(r.cacheRead)} (${pct}%)`
}

/** Nome exibido para a linha conforme o agrupamento. */
function rotulo(chave: string): string {
  if (grupo.value === 'day') return diaEMes(chave)
  if (grupo.value === 'session' && chave === 'roteamento') return 'Escolha automática do agente'
  return chave
}

defineExpose({ carregar })

onMounted(async () => {
  await useConnection().whenOnline().catch(() => undefined)
  await carregar()
})
</script>

<template>
  <Card titulo="Relatório" descricao="Escolha como agrupar e o período. Os números de tokens mostram o tamanho do texto enviado e recebido.">
    <template #acoes>
      <button type="button" :disabled="exportando" @click="exportarCsv">{{ exportando ? 'Exportando...' : 'Exportar CSV' }}</button>
    </template>

    <div class="relatorio-filtros">
      <label class="relatorio-filtro">
        <span>Agrupar</span>
        <select v-model="grupo" @change="carregar">
          <option v-for="g in grupos" :key="g.valor" :value="g.valor">{{ g.rotulo }}</option>
        </select>
      </label>
      <label class="relatorio-filtro">
        <span>Período</span>
        <select v-model="periodo" @change="carregar">
          <option v-for="p in periodos" :key="p.valor" :value="p.valor">{{ p.rotulo }}</option>
        </select>
      </label>
    </div>

    <EmptyState v-if="carregando" titulo="Carregando" carregando />
    <EmptyState v-else-if="falha" titulo="Não consegui carregar os gastos" :texto="falha">
      <button type="button" @click="carregar">Tentar de novo</button>
    </EmptyState>
    <EmptyState v-else-if="!linhas.length" titulo="Sem registros no período" texto="Nada foi gasto neste período. Tente escolher um período maior." />
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ colunaChave }}</th>
            <th class="num">Gasto</th>
            <th class="num">Chamadas</th>
            <th class="num">Tokens de entrada</th>
            <th class="num">Aproveitado do cache</th>
            <th class="num">Tokens de saída</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in linhas" :key="r.key">
            <td class="relatorio-chave">
              <RouterLink v-if="grupo === 'session' && r.key !== 'roteamento'" :to="{ name: 'chat', params: { id: r.key } }" :title="r.key">{{ r.key.slice(0, 8) }}</RouterLink>
              <span v-else>{{ rotulo(r.key) }}</span>
            </td>
            <td class="num">{{ usd(r.costUsd) }}</td>
            <td class="num">{{ numeroInteiro(r.calls) }}</td>
            <td class="num">{{ tokens(r.input) }}</td>
            <td class="num">{{ cache(r) }}</td>
            <td class="num">{{ tokens(r.output) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td class="num">{{ usd(total.costUsd) }}</td>
            <td class="num">{{ numeroInteiro(total.calls) }}</td>
            <td class="num">{{ tokens(total.input) }}</td>
            <td class="num">{{ cache(total) }}</td>
            <td class="num">{{ tokens(total.output) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </Card>
</template>

<style scoped>
.relatorio-filtros {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.relatorio-filtro {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  min-width: 180px;
}

.relatorio-filtro span {
  font-weight: 600;
  color: var(--text-soft);
}

.relatorio-filtro select {
  margin-top: 0;
}

.relatorio-chave {
  overflow-wrap: anywhere;
}

td.num,
th.num {
  white-space: nowrap;
}
</style>
