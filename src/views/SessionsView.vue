<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessions } from '../stores/sessions'

const sessions = useSessions()
const router = useRouter()
const workspace = ref('')
const agent = ref('')
const firstMessage = ref('')
const error = ref('')

async function create(): Promise<void> {
  error.value = ''
  try {
    const s = await sessions.create(workspace.value, agent.value || undefined, firstMessage.value || undefined)
    await router.push({ name: 'chat', params: { id: s.id }, query: firstMessage.value ? { first: firstMessage.value } : {} })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

function usd(v: number): string {
  return v.toFixed(4)
}
</script>

<template>
  <section class="two-col">
    <div class="panel">
      <h1>Nova sessao</h1>
      <form @submit.prevent="create">
        <label>
          Workspace
          <input v-model="workspace" type="text" placeholder="/home/usuario/Projects/meu-projeto" spellcheck="false" />
        </label>
        <label>
          Agente
          <select v-model="agent">
            <option value="">Roteamento por regra (usa a primeira mensagem)</option>
            <option v-for="a in sessions.agents" :key="a.name" :value="a.name">{{ a.name }} ({{ a.provider }}/{{ a.model }})</option>
          </select>
        </label>
        <label>
          Primeira mensagem
          <textarea v-model="firstMessage" rows="3" placeholder="Opcional. Necessaria quando o agente vem do roteamento."></textarea>
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" type="submit">Criar</button>
      </form>
    </div>
    <div class="panel">
      <h1>Sessoes</h1>
      <p v-if="!sessions.sessions.length" class="muted">Nenhuma sessao ainda.</p>
      <ul class="list">
        <li v-for="s in sessions.sessions" :key="s.id">
          <RouterLink :to="{ name: 'chat', params: { id: s.id } }">
            <div class="list-title">{{ s.title }}</div>
            <div class="list-meta">
              <span class="tag">{{ s.agent }}</span>
              <span class="muted">{{ s.workspace }}</span>
              <span class="cost">{{ usd(s.costUsd) }} USD</span>
            </div>
          </RouterLink>
        </li>
      </ul>
    </div>
  </section>
</template>
