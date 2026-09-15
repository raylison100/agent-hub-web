<script setup lang="ts">
import type { ContextFile } from '@agent-hub/core'
import { onMounted, ref } from 'vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import WorkspacePicker from '../components/WorkspacePicker.vue'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import { useConnection } from '../stores/connection'
import { client } from '../daemon/client'
import { avisar, mensagemDeErro } from '../ui/feedback'

const workspace = ref(recente())
const memories = ref<ContextFile[]>([])
const specs = ref<ContextFile[]>([])
const decisions = ref<ContextFile[]>([])
const error = ref('')
const carregando = ref(false)
const apagar = ref<ContextFile | null>(null)

function recente(): string {
  try {
    return (JSON.parse(localStorage.getItem('agent-hub.recent-workspaces') ?? '[]') as string[])[0] ?? ''
  } catch {
    return ''
  }
}

onMounted(async () => {
  await useConnection().whenOnline().catch(() => undefined)
  if (workspace.value) void carregar()
})

async function carregar(): Promise<void> {
  if (!workspace.value) return
  carregando.value = true
  error.value = ''
  try {
    const res = await client.request({ type: 'context.list', workspace: workspace.value }, 'context.list')
    memories.value = res.memories
    specs.value = res.specs
    decisions.value = res.decisions
  } catch (err) {
    error.value = mensagemDeErro(err)
  } finally {
    carregando.value = false
  }
}

async function confirmarApagar(): Promise<void> {
  const alvo = apagar.value
  apagar.value = null
  if (!alvo) return
  try {
    const res = await client.request({ type: 'context.delete', workspace: workspace.value, file: alvo.file }, 'context.list')
    memories.value = res.memories
    specs.value = res.specs
    decisions.value = res.decisions
    avisar(`${alvo.name} apagado.`)
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  }
}

function escolher(dir: string): void {
  workspace.value = dir
  void carregar()
}
</script>

<template>
  <div class="ui-page">
    <PageHeader titulo="Memória do projeto" descricao="O que os agentes anotaram sobre este projeto para lembrar nas próximas conversas. Apague o que estiver errado." />

    <Card titulo="Projeto" descricao="Escolha a pasta do projeto. As anotações ficam na pasta .agent-hub dentro dela.">
      <div class="row">
        <WorkspacePicker :model-value="workspace" @update:model-value="escolher" />
        <button class="ghost small" :disabled="!workspace || carregando" @click="carregar">Recarregar</button>
      </div>
    </Card>

    <EmptyState v-if="!workspace" titulo="Nenhum projeto escolhido" texto="Escolha a pasta de um projeto acima para ver o que os agentes gravaram nele." />
    <EmptyState v-else-if="carregando" titulo="Carregando" carregando />
    <EmptyState v-else-if="error" titulo="Não consegui carregar a memória do projeto" :texto="error">
      <button @click="carregar">Tentar de novo</button>
    </EmptyState>

    <template v-else>
      <Card
        :titulo="`Memória (${memories.length})`"
        descricao="Entra no início de cada conversa quando a regra de ativação combina com o pedido. Memória errada atrapalha as respostas: apague sem dó."
      >
        <EmptyState v-if="!memories.length" titulo="Nada gravado ainda" texto="Os agentes gravam com a ferramenta memory_write." />
        <ul v-else class="ui-lista">
          <li v-for="m in memories" :key="m.file" class="ui-lista-item">
            <span class="ui-lista-item-texto">
              <span class="ctx-topo">
                <strong>{{ m.name }}</strong>
                <span v-if="m.data" class="chip">{{ m.data }}</span>
                <span v-if="!m.activate" class="chip auto">carrega sempre</span>
              </span>
              <span class="muted">{{ m.description || 'sem descrição' }}</span>
              <span v-if="m.activate" class="muted">Ativa com: <code>{{ m.activate }}</code></span>
              <span class="muted">{{ m.bytes }} bytes<span v-if="m.run">, run {{ m.run.slice(0, 8) }}</span></span>
            </span>
            <button class="danger small" @click="apagar = m">Apagar</button>
          </li>
        </ul>
      </Card>

      <Card :titulo="`Especificações (${specs.length})`" descricao="Planos escritos pelos agentes antes de tarefas grandes. Ficam no disco e são lidos quando preciso.">
        <EmptyState v-if="!specs.length" titulo="Nenhuma especificação" texto="Um agente escreve com spec_write antes de executar uma tarefa grande." />
        <ul v-else class="ui-lista">
          <li v-for="s in specs" :key="s.file" class="ui-lista-item">
            <span class="ui-lista-item-texto">
              <strong>{{ s.name }}</strong>
              <span class="muted">{{ s.file }}, {{ s.bytes }} bytes</span>
            </span>
            <button class="danger small" @click="apagar = s">Apagar</button>
          </li>
        </ul>
      </Card>

      <Card :titulo="`Decisões (${decisions.length})`" descricao="Escolhas registradas pelos agentes durante o trabalho.">
        <EmptyState v-if="!decisions.length" titulo="Nenhuma decisão registrada" />
        <ul v-else class="ui-lista">
          <li v-for="d in decisions" :key="d.file" class="ui-lista-item">
            <span class="ui-lista-item-texto">
              <strong>{{ d.name }}</strong>
              <span class="muted">{{ d.file }}, {{ d.bytes }} bytes</span>
            </span>
            <button class="danger small" @click="apagar = d">Apagar</button>
          </li>
        </ul>
      </Card>
    </template>

    <ConfirmDialog
      v-if="apagar"
      title="Apagar do contexto"
      :detail="`Apagar ${apagar.file} do disco? Isso não volta.`"
      confirm-label="Apagar"
      @confirm="confirmarApagar"
      @cancel="apagar = null"
    />
  </div>
</template>
