<script setup lang="ts">
import type { DeviceSummary } from '@agent-hub/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { disablePush, enablePush, pushState, testPush, type PushState } from '../push'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import InstallHelp from '../components/InstallHelp.vue'
import { client } from '../daemon/client'
import { isDesktop } from '../daemon/native-dialog'
import { useConnection } from '../stores/connection'
import { useSessions } from '../stores/sessions'
import { avisar, confirmar } from '../ui/feedback'

const connection = useConnection()
const sessions = useSessions()
const router = useRouter()
const route = useRoute()
const busy = ref(false)
const error = ref('')
const push = ref<PushState>('off')
const tentandoAuto = ref(true)
const manualAberto = ref<boolean | null>(null)

/** Sem escolha sua, o formulario manual aparece so quando nao estamos conectados. */
const manual = computed(() => manualAberto.value ?? connection.status !== 'online')

/** Dentro das configuracoes esta tela e um painel: mostra o estado e nao leva voce para lugar nenhum. */
const comoPainel = computed(() => route.path.startsWith('/settings'))

onMounted(async () => {
  void pushState().then((s) => (push.value = s))
  if (comoPainel.value || connection.status === 'online') {
    tentandoAuto.value = false
  } else {
    await conectarSozinho()
  }
  await carregarDispositivos()
})

const semDaemon = ref(false)
let procura: ReturnType<typeof setInterval> | undefined

onUnmounted(() => clearInterval(procura))

/** Se ha um daemon respondendo na porta local desta maquina. */
async function daemonNoAr(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:47311/health', { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

/** Primeira tentativa e sempre automatica: na propria maquina o daemon entrega o token e a tela nem aparece. */
async function conectarSozinho(): Promise<void> {
  tentandoAuto.value = true
  try {
    if (await connection.pairLocal()) {
      await connect()
      if (connection.status === 'online') {
        pararProcura()
        return
      }
    }
  } catch {
    error.value = ''
  } finally {
    tentandoAuto.value = false
  }
  semDaemon.value = isDesktop() && !(await daemonNoAr())
  manualAberto.value = !semDaemon.value
  if (semDaemon.value) {
    error.value = ''
    iniciarProcura()
  }
}

/** No app de desktop sem daemon, confere a porta local de tempos em tempos e conecta assim que ele subir. */
function iniciarProcura(): void {
  if (procura) return
  procura = setInterval(() => {
    if (tentandoAuto.value || busy.value) return
    void daemonNoAr().then((ok) => {
      if (ok) void conectarSozinho()
    })
  }, 5000)
}

function pararProcura(): void {
  clearInterval(procura)
  procura = undefined
  semDaemon.value = false
}

const senha = ref('')
const nomeDoDispositivo = ref(typeof navigator === 'undefined' ? 'dispositivo' : navigator.platform || 'dispositivo')
const dispositivos = ref<DeviceSummary[]>([])
const senhaDefinida = ref(false)
const novaSenha = ref('')
const revogar = ref<DeviceSummary | null>(null)

async function carregarDispositivos(): Promise<void> {
  if (connection.status !== 'online') return
  try {
    const res = await client.request({ type: 'auth.devices' }, 'auth.devices')
    dispositivos.value = res.devices
    senhaDefinida.value = res.senha_definida
  } catch {
    dispositivos.value = []
  }
}

/** Entra com senha num daemon que nao e o desta maquina; a credencial devolvida fica guardada aqui. */
async function entrarComSenha(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await connection.loginComSenha(senha.value, nomeDoDispositivo.value)
    senha.value = ''
    await Promise.all([sessions.refresh(), sessions.loadAgents()])
    if (!comoPainel.value) await router.push({ name: 'sessions' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function definirSenha(): Promise<void> {
  error.value = ''
  try {
    const res = await client.request({ type: 'auth.password', password: novaSenha.value }, 'auth.devices')
    dispositivos.value = res.devices
    senhaDefinida.value = res.senha_definida
    novaSenha.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function confirmarRevogar(): Promise<void> {
  const alvo = revogar.value
  revogar.value = null
  if (!alvo) return
  try {
    const res = await client.request({ type: 'auth.revoke', device_id: alvo.id }, 'auth.devices')
    dispositivos.value = res.devices
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

function quando(ts: number | null): string {
  return ts ? new Date(ts).toLocaleString('pt-BR') : 'nunca'
}

const daemonAviso = ref('')

watch(error, (texto) => {
  if (texto) avisar(texto, 'erro')
})

watch(daemonAviso, (texto) => {
  if (texto) avisar(texto, 'info')
})
const reiniciando = ref(false)

/** Recarrega perfis, papeis, precos e conectores sem derrubar o processo: resolve quase toda mudanca de configuracao. */
async function recarregar(): Promise<void> {
  daemonAviso.value = ''
  try {
    const res = await client.request({ type: 'daemon.reload' }, 'daemon.status')
    daemonAviso.value = res.detalhe
  } catch (err) {
    daemonAviso.value = err instanceof Error ? err.message : String(err)
  }
}

/** Reinicio de verdade, para quando o codigo do daemon mudou. Com o servico instalado, ele volta sozinho. */
async function reiniciarDaemon(): Promise<void> {
  const ok = await confirmar({
    titulo: 'Reiniciar o serviço do Agent Hub?',
    detalhe: 'As conversas e rotinas em andamento são interrompidas. A tela reconecta sozinha em alguns segundos.',
    botao: 'Reiniciar',
  })
  if (!ok) return
  daemonAviso.value = ''
  reiniciando.value = true
  try {
    const res = await client.request({ type: 'daemon.restart' }, 'daemon.status')
    daemonAviso.value = res.detalhe
    setTimeout(() => {
      reiniciando.value = false
      void connection.connect().then(carregarDispositivos)
    }, 6000)
  } catch (err) {
    reiniciando.value = false
    daemonAviso.value = err instanceof Error ? err.message : String(err)
  }
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
      manualAberto.value = true
      if (connection.devices.length === 0) error.value = 'nenhum dispositivo online nesta conta'
      return
    }
    await Promise.all([sessions.refresh(), sessions.loadAgents()])
    if (!comoPainel.value) await router.push({ name: 'sessions' })
  } catch (err) {
    manualAberto.value = true
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
  <section class="settings-page" :class="{ centralizada: !comoPainel }">
    <h1>{{ comoPainel ? 'Conexao' : 'Conectar ao daemon' }}</h1>
    <p v-if="tentandoAuto" class="muted">Procurando o daemon nesta maquina...</p>
    <template v-else>
      <p v-if="connection.status === 'online'" class="muted">
        Conectado em <strong>{{ connection.device || 'este computador' }}</strong> por <code>{{ connection.url }}</code>.
        Nesta maquina a conexao e automatica: o daemon serve a interface e entrega a credencial sozinho.
      </p>
      <InstallHelp v-else-if="semDaemon" :tentando="tentandoAuto" @tentar="conectarSozinho" />
      <p v-else class="muted">
        Na propria maquina a conexao e automatica: abra <code>http://127.0.0.1:47311</code> e o daemon entrega a
        credencial sozinho. Os campos abaixo servem para outro dispositivo, celular ou acesso pelo relay.
      </p>
      <div class="row">
        <button v-if="connection.status !== 'online' && !semDaemon" class="primary" type="button" :disabled="busy" @click="conectarSozinho">
          Tentar de novo nesta maquina
        </button>
        <button type="button" @click="manualAberto = !manual">{{ manual ? 'Esconder conexao manual' : semDaemon ? 'Conectar a um daemon de outra maquina' : 'Conectar outro dispositivo' }}</button>
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
    <div v-if="manual" class="bloco">
        <h2>Entrar com senha</h2>
        <p class="muted small">
          Para um daemon que nao e o desta maquina. Voce digita a senha uma vez e este dispositivo guarda uma
          credencial propria, que voce revoga quando quiser, sem trocar a senha dos outros.
        </p>
        <form @submit.prevent="entrarComSenha">
          <label>
            Nome deste dispositivo
            <input v-model="nomeDoDispositivo" type="text" autocomplete="off" />
          </label>
          <label>
            Senha
            <input v-model="senha" type="password" autocomplete="current-password" />
          </label>
          <button class="primary" type="submit" :disabled="busy || !senha">Entrar e guardar credencial</button>
        </form>
      </div>

    <div v-if="connection.status === 'online'" class="bloco">
      <h2>Daemon</h2>
      <p class="muted small">
        Mudou perfil, papel, preco ou conector: recarregar basta, e nada cai. Mudou o codigo do daemon: precisa
        reiniciar. Com o servico do systemd instalado (<code>make servico</code>) ele volta sozinho e sobe junto com a
        maquina; sem o servico, o daemon deixa um processo novo no lugar antes de sair.
      </p>
      <div class="row">
        <button type="button" :disabled="reiniciando" @click="recarregar">Recarregar configuracao</button>
        <button type="button" :disabled="reiniciando" @click="reiniciarDaemon">{{ reiniciando ? 'Reiniciando...' : 'Reiniciar daemon' }}</button>
      </div>
      <p v-if="daemonAviso" class="muted small">{{ daemonAviso }}</p>
    </div>

    <div v-if="connection.status === 'online'" class="bloco">
        <h2>Acesso remoto</h2>
        <p class="muted small">
          {{ senhaDefinida ? 'Ha uma senha definida neste daemon.' : 'Sem senha definida: nenhum dispositivo de fora consegue entrar.' }}
          Minimo de oito caracteres.
        </p>
        <form @submit.prevent="definirSenha">
          <label>
            {{ senhaDefinida ? 'Trocar a senha' : 'Definir a senha' }}
            <input v-model="novaSenha" type="password" autocomplete="new-password" />
          </label>
          <button type="submit" :disabled="novaSenha.length < 8">{{ senhaDefinida ? 'Trocar' : 'Definir' }}</button>
        </form>
        <h2>Dispositivos autorizados</h2>
        <p v-if="!dispositivos.length" class="muted small">Nenhum. Esta maquina nao precisa de credencial.</p>
        <ul class="list">
          <li v-for="d in dispositivos" :key="d.id">
            <strong>{{ d.name }}</strong>
            <span class="muted small">ultimo acesso {{ quando(d.lastSeen) }}</span>
            <span class="spacer"></span>
            <button class="ghost small" @click="revogar = d">Revogar</button>
          </li>
        </ul>
      </div>

    <div v-if="connection.status === 'online'" class="push">
      <p class="muted small">Notificacoes push para aprovacoes e fim de run. Funcionam em localhost e em HTTPS.</p>
      <div class="row">
        <button type="button" :disabled="push === 'unsupported' || push === 'denied'" @click="togglePush">
          {{ push === 'on' ? 'Desativar notificacoes' : push === 'unsupported' ? 'Sem suporte neste navegador' : push === 'denied' ? 'Permissao negada' : 'Ativar notificacoes' }}
        </button>
        <button v-if="push === 'on'" type="button" @click="testPush">Testar</button>
      </div>
    </div>
    <ConfirmDialog
      v-if="revogar"
      title="Revogar dispositivo"
      :detail="`O dispositivo ${revogar.name} vai precisar entrar com a senha de novo.`"
      confirm-label="Revogar"
      @confirm="confirmarRevogar"
      @cancel="revogar = null"
    />
  </section>
</template>
