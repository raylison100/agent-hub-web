<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { avisar, confirmar, mensagemDeErro } from '../ui/feedback'

interface SecretRow {
  name: string
  hint: string
  length: number
  updated_at: number
  source: 'db' | 'env'
}

const rows = ref<SecretRow[]>([])
const name = ref('')
const value = ref('')
const error = ref('')
const saved = ref('')

async function load(): Promise<void> {
  try {
    rows.value = (await client.request({ type: 'secrets.list' }, 'secrets.list')).secrets
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function save(target?: string): Promise<void> {
  error.value = ''
  saved.value = ''
  const n = (target ?? name.value).trim().toUpperCase()
  if (!n || !value.value.trim()) {
    error.value = 'informe nome e valor'
    return
  }
  try {
    rows.value = (await client.request({ type: 'secrets.set', name: n, value: value.value }, 'secrets.list')).secrets
    saved.value = `${n} salva`
    avisar(`Chave ${n} salva.`)
    value.value = ''
    if (!target) name.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function remove(n: string): Promise<void> {
  const ok = await confirmar({ titulo: `Apagar a chave ${n}?`, detalhe: 'O que usa essa chave para de funcionar até você cadastrar outra.', botao: 'Apagar chave' })
  if (!ok) return
  try {
    rows.value = (await client.request({ type: 'secrets.delete', name: n }, 'secrets.list')).secrets
    avisar(`Chave ${n} apagada.`)
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  }
}

function fill(n: string): void {
  name.value = n
  const el = document.getElementById('secret-value')
  el?.focus()
}

function when(ts: number): string {
  return ts ? new Date(ts).toLocaleString() : 'do ambiente'
}

onMounted(async () => {
  await useConnection().whenOnline().catch(() => undefined)
  await load()
})
</script>

<template>
  <section class="settings-page">
    <h1>Chaves e segredos</h1>
    <p class="muted small">
      Guardadas no SQLite do daemon, cifradas com uma chave local em <code>~/.agent-hub/secrets.key</code>. A interface nunca recebe o valor de volta,
      so o tamanho e os ultimos quatro caracteres. Variaveis ja definidas no ambiente do daemon tem prioridade.
    </p>
    <form class="secret-form" @submit.prevent="save()">
      <label>
        Nome
        <input v-model="name" type="text" placeholder="ANTHROPIC_API_KEY" spellcheck="false" autocomplete="off" />
      </label>
      <label>
        Valor
        <input id="secret-value" v-model="value" type="password" placeholder="cole a chave" autocomplete="off" />
      </label>
      <div class="row">
        <button class="primary" type="submit">Salvar</button>
        <span v-if="saved" class="muted small">{{ saved }}</span>
        <span v-if="error" class="error small">{{ error }}</span>
      </div>
    </form>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>nome</th>
            <th>estado</th>
            <th>origem</th>
            <th>atualizada</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.name">
            <td><code>{{ r.name }}</code></td>
            <td>
              <span v-if="r.length" class="muted">{{ r.length }} caracteres, termina em <code>{{ r.hint }}</code></span>
              <span v-else class="error">ausente</span>
            </td>
            <td>{{ r.source === 'db' ? 'banco' : 'ambiente' }}</td>
            <td class="muted small">{{ when(r.updated_at) }}</td>
            <td class="row">
              <button type="button" @click="fill(r.name)">{{ r.length ? 'Trocar' : 'Definir' }}</button>
              <button v-if="r.source === 'db'" type="button" @click="remove(r.name)">Apagar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
