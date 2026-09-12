<script setup lang="ts">
import type { ContextFile } from '@agent-hub/core'
import { onMounted, ref } from 'vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import WorkspacePicker from '../components/WorkspacePicker.vue'
import { useConnection } from '../stores/connection'
import { client } from '../daemon/client'

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
    error.value = err instanceof Error ? err.message : String(err)
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
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

function escolher(dir: string): void {
  workspace.value = dir
  void carregar()
}
</script>

<template>
  <section class="settings-page">
    <h1>Contexto do projeto</h1>
    <p class="muted">
      O que os agentes gravaram na pasta <code>.agent-hub</code> deste workspace. A memoria entra no inicio de cada
      conversa quando a regra de ativacao casa com o pedido; especificacoes e decisoes ficam no disco e sao lidas sob
      demanda. Memoria errada envenena resposta: apague sem dó.
    </p>
    <div class="row">
      <WorkspacePicker :model-value="workspace" @update:model-value="escolher" />
      <button class="ghost small" :disabled="!workspace || carregando" @click="carregar">Recarregar</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>

    <h2>Memoria <span class="muted small">{{ memories.length }} itens</span></h2>
    <p v-if="!memories.length" class="muted small">Nada gravado ainda. Os agentes gravam com a ferramenta memory_write.</p>
    <div v-for="m in memories" :key="m.file" class="ctx-item">
      <div class="ctx-topo">
        <strong>{{ m.name }}</strong>
        <span v-if="m.data" class="chip">{{ m.data }}</span>
        <span v-if="!m.activate" class="chip auto">carrega sempre</span>
        <span class="spacer"></span>
        <button class="ghost small" @click="apagar = m">Apagar</button>
      </div>
      <p class="muted small">{{ m.description || 'sem descricao' }}</p>
      <p v-if="m.activate" class="muted small">Ativa com: <code>{{ m.activate }}</code></p>
      <p class="muted small">{{ m.bytes }} bytes<span v-if="m.run">, run {{ m.run.slice(0, 8) }}</span></p>
    </div>

    <h2>Especificacoes <span class="muted small">{{ specs.length }}</span></h2>
    <p v-if="!specs.length" class="muted small">Nenhuma. Um agente escreve com spec_write antes de executar tarefa grande.</p>
    <div v-for="s in specs" :key="s.file" class="ctx-item">
      <div class="ctx-topo">
        <strong>{{ s.name }}</strong>
        <span class="spacer"></span>
        <button class="ghost small" @click="apagar = s">Apagar</button>
      </div>
      <p class="muted small">{{ s.file }}, {{ s.bytes }} bytes</p>
    </div>

    <h2>Decisoes <span class="muted small">{{ decisions.length }}</span></h2>
    <p v-if="!decisions.length" class="muted small">Nenhuma registrada.</p>
    <div v-for="d in decisions" :key="d.file" class="ctx-item">
      <div class="ctx-topo">
        <strong>{{ d.name }}</strong>
        <span class="spacer"></span>
        <button class="ghost small" @click="apagar = d">Apagar</button>
      </div>
      <p class="muted small">{{ d.file }}, {{ d.bytes }} bytes</p>
    </div>

    <ConfirmDialog
      v-if="apagar"
      title="Apagar do contexto"
      :detail="`Apagar ${apagar.file} do disco? Isso nao volta.`"
      confirm-label="Apagar"
      @confirm="confirmarApagar"
      @cancel="apagar = null"
    />
  </section>
</template>
