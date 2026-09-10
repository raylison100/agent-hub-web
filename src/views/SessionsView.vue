<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessions } from '../stores/sessions'

const sessions = useSessions()
const router = useRouter()
const workspace = ref(lastWorkspace())
const agent = ref('')
const firstMessage = ref('')
const error = ref('')

function lastWorkspace(): string {
  try {
    return localStorage.getItem('agent-hub.last-workspace') ?? ''
  } catch {
    return ''
  }
}

async function create(): Promise<void> {
  error.value = ''
  try {
    const s = await sessions.create(workspace.value, agent.value || undefined, firstMessage.value || undefined)
    try {
      localStorage.setItem('agent-hub.last-workspace', workspace.value)
    } catch {
      void 0
    }
    await router.push({ name: 'chat', params: { id: s.id }, query: firstMessage.value ? { first: firstMessage.value } : {} })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void create()
}
</script>

<template>
  <section class="new-session-view">
    <div class="new-card">
      <h1>Nova sessao</h1>
      <label>
        Workspace
        <input v-model="workspace" type="text" placeholder="/home/usuario/Projects/meu-projeto" spellcheck="false" />
      </label>
      <label>
        Agente
        <select v-model="agent">
          <option value="">Auto: o harness escolhe o agente a cada mensagem</option>
          <option v-for="a in sessions.agents" :key="a.name" :value="a.name">{{ a.name }} ({{ a.provider }}/{{ a.model }})</option>
        </select>
      </label>
      <label>
        Primeira mensagem
        <textarea v-model="firstMessage" rows="5" placeholder="Opcional. Ctrl+Enter cria e envia." @keydown="onKey"></textarea>
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="row">
        <button class="primary" @click="create">Criar</button>
        <span class="muted small">{{ sessions.agents.length }} agentes carregados</span>
      </div>
    </div>
  </section>
</template>
