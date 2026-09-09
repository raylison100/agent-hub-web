<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConnection } from '../stores/connection'
import { useSessions } from '../stores/sessions'

const connection = useConnection()
const sessions = useSessions()
const router = useRouter()
const busy = ref(false)
const error = ref('')

async function connect(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await connection.connect()
    await Promise.all([sessions.refresh(), sessions.loadAgents()])
    await router.push({ name: 'sessions' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="panel narrow">
    <h1>Conectar ao daemon</h1>
    <p class="muted">
      No desktop, use o endereco local. No celular ou fora da rede, use a URL do relay ou o endereco pela VPN.
      O token vem de <code>agent-hub-daemon pair</code>.
    </p>
    <form @submit.prevent="connect">
      <label>
        URL
        <input v-model="connection.url" type="text" autocomplete="off" spellcheck="false" />
      </label>
      <label>
        Token
        <input v-model="connection.token" type="password" autocomplete="off" />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-else-if="connection.status === 'error'" class="error">{{ connection.detail }}</p>
      <div class="row">
        <button class="primary" type="submit" :disabled="busy">Conectar</button>
        <button type="button" @click="connection.disconnect()">Desconectar</button>
      </div>
    </form>
  </section>
</template>
