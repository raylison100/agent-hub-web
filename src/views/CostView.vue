<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { client } from '../daemon/client'

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

async function load(): Promise<void> {
  error.value = ''
  try {
    const res = await client.request({ type: 'cost.report', group: group.value, since: since() }, 'cost.report')
    rows.value = res.rows
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
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

function cacheRate(r: Row): string {
  const denom = r.input + r.cacheRead
  return denom === 0 ? '0%' : `${Math.round((r.cacheRead / denom) * 100)}%`
}

onMounted(load)
</script>

<template>
  <section class="panel">
    <h1>Custos</h1>
    <div class="row">
      <select v-model="group" @change="load">
        <option value="agent">por agente</option>
        <option value="model">por modelo</option>
        <option value="session">por sessao</option>
        <option value="day">por dia</option>
      </select>
      <select v-model="period" @change="load">
        <option value="today">hoje</option>
        <option value="week">7 dias</option>
        <option value="month">este mes</option>
        <option value="all">tudo</option>
      </select>
      <button @click="load">Atualizar</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="!rows.length" class="muted">Sem registros no periodo.</p>
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
            <th class="num">saida</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.key">
            <td>{{ r.key }}</td>
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
  </section>
</template>
