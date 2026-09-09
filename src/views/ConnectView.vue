<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { disablePush, enablePush, pushState, testPush, type PushState } from '../push'
import { useConnection } from '../stores/connection'
import { useSessions } from '../stores/sessions'

const connection = useConnection()
const sessions = useSessions()
const router = useRouter()
const busy = ref(false)
const error = ref('')
const push = ref<PushState>('off')

onMounted(() => void pushState().then((s) => (push.value = s)))

async function togglePush(): Promise<void> {
  error.value = ''
  try {
    push.value = push.value === 'on' ? await disablePush() : await enablePush()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

interface PairPayload {
  mode?: 'direct' | 'relay'
  url?: string
  token?: string
  account?: string
  device?: string
}

onMounted(() => {
  const match = /#pair=([A-Za-z0-9_-]+)/.exec(window.location.hash)
  if (!match) return
  try {
    const payload = JSON.parse(atob(match[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as PairPayload
    if (payload.mode) connection.mode = payload.mode
    if (payload.url) connection.url = payload.url
    if (payload.token) connection.token = payload.token
    if (payload.account) connection.accountToken = payload.account
    if (payload.device) connection.deviceId = payload.device
    history.replaceState(null, '', window.location.pathname)
    void connect()
  } catch {
    error.value = 'link de emparelhamento invalido'
  }
})

async function connect(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const result = await connection.connect()
    if (result === 'devices') {
      if (connection.devices.length === 0) error.value = 'nenhum dispositivo online nesta conta'
      return
    }
    await Promise.all([sessions.refresh(), sessions.loadAgents()])
    await router.push({ name: 'sessions' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function pick(id: string): void {
  connection.deviceId = id
  void connect()
}
</script>

<template>
  <section class="panel narrow">
    <h1>Conectar ao daemon</h1>
    <p class="muted">
      No desktop, use o endereco local. No celular ou fora da rede, use o relay com o token de conta.
      Os valores vem de <code>agent-hub-daemon pair</code>.
    </p>
    <form @submit.prevent="connect">
      <label>
        Modo
        <select v-model="connection.mode">
          <option value="direct">direto (local ou VPN)</option>
          <option value="relay">pelo relay</option>
        </select>
      </label>
      <label>
        {{ connection.mode === 'relay' ? 'URL do relay' : 'URL do daemon' }}
        <input v-model="connection.url" type="text" autocomplete="off" spellcheck="false" :placeholder="connection.mode === 'relay' ? 'wss://relay.exemplo.com' : 'ws://127.0.0.1:47311/ws'" />
      </label>
      <label v-if="connection.mode === 'relay'">
        Token de conta
        <input v-model="connection.accountToken" type="password" autocomplete="off" />
      </label>
      <label>
        Token do daemon
        <input v-model="connection.token" type="password" autocomplete="off" />
      </label>
      <div v-if="connection.mode === 'relay' && connection.devices.length" class="devices">
        <p class="muted small">Dispositivos online</p>
        <button v-for="d in connection.devices" :key="d.id" type="button" :class="{ primary: d.id === connection.deviceId }" @click="pick(d.id)">
          {{ d.name }}
        </button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-else-if="connection.status === 'error'" class="error">{{ connection.detail }}</p>
      <div class="row">
        <button class="primary" type="submit" :disabled="busy">{{ connection.mode === 'relay' && !connection.deviceId ? 'Listar dispositivos' : 'Conectar' }}</button>
        <button type="button" @click="connection.disconnect()">Desconectar</button>
      </div>
    </form>
    <div v-if="connection.status === 'online'" class="push">
      <p class="muted small">Notificacoes push para aprovacoes e fim de run. Funcionam em localhost e em HTTPS.</p>
      <div class="row">
        <button type="button" :disabled="push === 'unsupported' || push === 'denied'" @click="togglePush">
          {{ push === 'on' ? 'Desativar notificacoes' : push === 'unsupported' ? 'Sem suporte neste navegador' : push === 'denied' ? 'Permissao negada' : 'Ativar notificacoes' }}
        </button>
        <button v-if="push === 'on'" type="button" @click="testPush">Testar</button>
      </div>
    </div>
  </section>
</template>
