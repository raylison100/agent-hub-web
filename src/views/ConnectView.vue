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
const tentandoAuto = ref(true)
const manual = ref(false)

onMounted(async () => {
  void pushState().then((s) => (push.value = s))
  await conectarSozinho()
})

/** Primeira tentativa e sempre automatica: na propria maquina o daemon entrega o token e a tela nem aparece. */
async function conectarSozinho(): Promise<void> {
  tentandoAuto.value = true
  try {
    if (await connection.pairLocal()) {
      await connect()
      return
    }
  } catch {
    error.value = ''
  } finally {
    tentandoAuto.value = false
  }
  manual.value = true
}

async function togglePush(): Promise<void> {
  error.value = ''
  try {
    push.value = push.value === 'on' ? await disablePush() : await enablePush()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function connect(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const result = await connection.connect()
    if (result === 'devices') {
      manual.value = true
      if (connection.devices.length === 0) error.value = 'nenhum dispositivo online nesta conta'
      return
    }
    await Promise.all([sessions.refresh(), sessions.loadAgents()])
    await router.push({ name: 'sessions' })
  } catch (err) {
    manual.value = true
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
    <p v-if="tentandoAuto" class="muted">Procurando o daemon nesta maquina...</p>
    <template v-else>
      <p class="muted">
        Na propria maquina a conexao e automatica: abra <code>http://127.0.0.1:47311</code> e o daemon entrega a
        credencial sozinho. Este formulario serve para outro dispositivo, celular ou acesso pelo relay.
      </p>
      <div class="row">
        <button class="primary" type="button" :disabled="busy" @click="conectarSozinho">Tentar de novo nesta maquina</button>
        <button type="button" @click="manual = !manual">{{ manual ? 'Esconder conexao manual' : 'Conectar outro dispositivo' }}</button>
      </div>
    </template>

    <form v-if="manual" @submit.prevent="connect">
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
      <p class="muted small">O link pronto com esses valores sai de <code>make token</code> ou <code>agent-hub-daemon pair</code>.</p>
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
