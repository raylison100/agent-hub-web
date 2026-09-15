<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Field from '../components/ui/Field.vue'
import PageHeader from '../components/ui/PageHeader.vue'
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
const carregando = ref(true)

async function load(): Promise<void> {
  try {
    rows.value = (await client.request({ type: 'secrets.list' }, 'secrets.list')).secrets
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  } finally {
    carregando.value = false
  }
}

async function save(target?: string): Promise<void> {
  error.value = ''
  const n = (target ?? name.value).trim().toUpperCase()
  if (!n || !value.value.trim()) {
    error.value = 'Informe nome e valor.'
    return
  }
  try {
    rows.value = (await client.request({ type: 'secrets.set', name: n, value: value.value }, 'secrets.list')).secrets
    avisar(`Chave ${n} salva.`)
    value.value = ''
    if (!target) name.value = ''
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
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
  <div class="ui-page">
    <PageHeader titulo="Chaves de acesso" descricao="Chaves das empresas de IA e de outros serviços que os agentes usam. Ficam guardadas cifradas nesta máquina." />

    <Card
      titulo="Cadastrar ou trocar chave"
      descricao="Depois de salva, a chave não é mostrada de novo: aparecem só o tamanho e os últimos quatro caracteres."
    >
      <form class="ui-form duas-colunas" @submit.prevent="save()">
        <Field rotulo="Nome" obrigatorio>
          <input v-model="name" type="text" placeholder="ANTHROPIC_API_KEY" spellcheck="false" autocomplete="off" />
        </Field>
        <Field rotulo="Valor" obrigatorio>
          <input id="secret-value" v-model="value" type="password" placeholder="cole a chave" autocomplete="off" />
        </Field>
        <div class="ui-form-acoes">
          <button class="primary" type="submit">Salvar</button>
          <span v-if="error" class="error small">{{ error }}</span>
        </div>
      </form>
    </Card>

    <Card
      titulo="Chaves cadastradas"
      descricao="Cifradas com a chave local em ~/.agent-hub/secrets.key. Variáveis já definidas no ambiente do daemon têm prioridade."
    >
      <EmptyState v-if="carregando" titulo="Carregando" carregando />
      <EmptyState v-else-if="!rows.length" titulo="Nenhuma chave cadastrada" texto="Cadastre a chave de uma empresa de IA no formulário acima para os agentes começarem a funcionar." />
      <div v-else class="table-wrap">
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
                <button v-if="r.source === 'db'" type="button" class="danger" @click="remove(r.name)">Apagar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  </div>
</template>
