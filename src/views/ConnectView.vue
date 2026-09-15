<script setup lang="ts">
import type { DeviceSummary } from '@agent-hub/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InstallHelp from '../components/InstallHelp.vue'
import ConexaoManual from '../components/conexao/ConexaoManual.vue'
import NotificacoesCard from '../components/conexao/NotificacoesCard.vue'
import ServicoCard from '../components/conexao/ServicoCard.vue'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Field from '../components/ui/Field.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { client } from '../daemon/client'
import { isDesktop } from '../daemon/native-dialog'
import { useConnection } from '../stores/connection'
import { useSessions } from '../stores/sessions'
import { avisar, confirmar, mensagemDeErro, useAcao } from '../ui/feedback'

type Aba = 'maquina' | 'aparelhos' | 'notificacoes'

const abas: { valor: Aba; rotulo: string }[] = [
  { valor: 'maquina', rotulo: 'Esta máquina' },
  { valor: 'aparelhos', rotulo: 'Celular e outros aparelhos' },
  { valor: 'notificacoes', rotulo: 'Notificações' },
]

const connection = useConnection()
const sessions = useSessions()
const router = useRouter()
const route = useRoute()
const busy = ref(false)
const error = ref('')
const tentandoAuto = ref(true)
const manualAberto = ref<boolean | null>(null)
const versao = __VERSAO_DO_PACOTE__

/** Sem escolha sua, o formulario manual aparece so quando nao estamos conectados. */
const manual = computed(() => manualAberto.value ?? connection.status !== 'online')

/** Dentro das configuracoes esta tela e um painel: mostra o estado e nao leva voce para lugar nenhum. */
const comoPainel = computed(() => route.path.startsWith('/settings'))

const online = computed(() => connection.status === 'online')

const aba = computed<Aba>(() => {
  const q = route.query.aba
  return abas.some((a) => a.valor === q) ? (q as Aba) : 'maquina'
})

const seloDaConexao = computed<{ estado: 'ok' | 'erro' | 'desligado'; texto: string }>(() => {
  if (connection.status === 'online') return { estado: 'ok', texto: 'Conectado' }
  if (connection.status === 'error') return { estado: 'erro', texto: 'Com erro' }
  return { estado: 'desligado', texto: 'Desconectado' }
})

/** Troca a aba ativa guardando a escolha no endereço. */
function irPara(destino: Aba): void {
  if (destino === aba.value) return
  void router.replace({ query: { ...route.query, aba: destino } })
}

onMounted(async () => {
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

const dispositivos = ref<DeviceSummary[]>([])
const senhaDefinida = ref(false)
const novaSenha = ref('')
const erroDispositivos = ref('')
const carregandoDispositivos = ref(false)
const acaoSenha = useAcao()
const acaoRevogar = useAcao()
const revogando = ref('')

async function carregarDispositivos(): Promise<void> {
  if (connection.status !== 'online') return
  erroDispositivos.value = ''
  carregandoDispositivos.value = true
  try {
    const res = await client.request({ type: 'auth.devices' }, 'auth.devices')
    dispositivos.value = res.devices
    senhaDefinida.value = res.senha_definida
  } catch (err) {
    dispositivos.value = []
    erroDispositivos.value = mensagemDeErro(err)
  } finally {
    carregandoDispositivos.value = false
  }
}

watch(
  () => connection.status,
  (status, anterior) => {
    if (status === 'online' && anterior !== 'online') void carregarDispositivos()
  },
)

/** Entra com senha num daemon que nao e o desta maquina; a credencial devolvida fica guardada aqui. */
async function entrarComSenha(senha: string, nome: string, limpar: () => void): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await connection.loginComSenha(senha, nome)
    limpar()
    await Promise.all([sessions.refresh(), sessions.loadAgents()])
    if (!comoPainel.value) await router.push({ name: 'sessions' })
  } catch (err) {
    error.value = mensagemDeErro(err)
  } finally {
    busy.value = false
  }
}

/** Define ou troca a senha usada pelos outros aparelhos para entrar. */
async function definirSenha(): Promise<void> {
  const trocando = senhaDefinida.value
  const res = await acaoSenha.executar(
    () => client.request({ type: 'auth.password', password: novaSenha.value }, 'auth.devices'),
    trocando ? 'Senha trocada.' : 'Senha definida. Agora outros aparelhos já podem entrar.',
  )
  if (!res) return
  dispositivos.value = res.devices
  senhaDefinida.value = res.senha_definida
  novaSenha.value = ''
}

/** Tira o acesso de um aparelho depois de confirmar. */
async function revogar(alvo: DeviceSummary): Promise<void> {
  const ok = await confirmar({
    titulo: `Revogar o acesso de ${alvo.name}?`,
    detalhe: 'Esse aparelho sai da conta na hora e só volta a entrar se alguém digitar a senha de novo nele.',
    botao: 'Revogar acesso',
    perigo: true,
  })
  if (!ok) return
  revogando.value = alvo.id
  const res = await acaoRevogar.executar(
    () => client.request({ type: 'auth.revoke', device_id: alvo.id }, 'auth.devices'),
    `Acesso de ${alvo.name} revogado.`,
  )
  revogando.value = ''
  if (res) dispositivos.value = res.devices
}

function quando(ts: number | null): string {
  return ts ? new Date(ts).toLocaleString('pt-BR') : 'nunca'
}

watch(error, (texto) => {
  if (texto) avisar(texto, 'erro')
})

async function connect(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const result = await connection.connect()
    if (result === 'devices') {
      manualAberto.value = true
      if (connection.devices.length === 0) error.value = 'Nenhum computador disponível nesta conta de acesso remoto.'
      return
    }
    await Promise.all([sessions.refresh(), sessions.loadAgents()])
    if (!comoPainel.value) await router.push({ name: 'sessions' })
  } catch (err) {
    manualAberto.value = true
    error.value = mensagemDeErro(err)
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
  <div v-if="!comoPainel" class="ui-page" :style="{ maxWidth: '560px' }">
    <PageHeader titulo="Conectar ao Agent Hub" descricao="Ligue esta tela ao serviço do Agent Hub que roda os agentes." />

    <Card titulo="Estado da conexão">
      <template v-if="!tentandoAuto" #acoes>
        <StatusBadge :estado="seloDaConexao.estado" :texto="seloDaConexao.texto" />
      </template>
      <EmptyState v-if="tentandoAuto" titulo="Procurando o Agent Hub nesta máquina" carregando />
      <template v-else>
        <p v-if="online" class="muted">
          Conectado em <strong>{{ connection.device || 'este computador' }}</strong> por <code>{{ connection.url }}</code>. Nesta máquina a conexão é
          automática.
        </p>
        <InstallHelp v-else-if="semDaemon" :tentando="tentandoAuto" @tentar="conectarSozinho" />
        <p v-else class="muted">
          No computador onde o Agent Hub está instalado, a conexão é automática: abra <code>http://127.0.0.1:47311</code> e pronto. Os campos abaixo
          servem para entrar de outro aparelho, do celular ou pelo acesso remoto.
        </p>
        <div class="row">
          <button v-if="!online && !semDaemon" class="primary" type="button" :disabled="busy" @click="conectarSozinho">
            Tentar de novo nesta máquina
          </button>
          <button type="button" @click="manualAberto = !manual">
            {{ manual ? 'Esconder conexão manual' : semDaemon ? 'Conectar a um Agent Hub de outro computador' : 'Conectar de outro jeito' }}
          </button>
          <RouterLink v-if="online" to="/settings/conexao" class="small">Ver conexão e dispositivos</RouterLink>
        </div>
      </template>
    </Card>

    <ConexaoManual v-if="manual" :ocupado="busy" :com-erro="Boolean(error)" @conectar="connect" @entrar="entrarComSenha" @escolher="pick" />
  </div>

  <div v-else class="ui-page">
    <PageHeader
      titulo="Conexão e dispositivos"
      descricao="Como esta tela se liga ao Agent Hub, quais aparelhos podem entrar de fora e os avisos no celular ou no navegador."
    />

    <div class="ui-segmentos" role="tablist" aria-label="Seções de conexão">
      <button
        v-for="a in abas"
        :key="a.valor"
        type="button"
        role="tab"
        :aria-selected="aba === a.valor"
        :class="['ui-segmento', { ativo: aba === a.valor }]"
        @click="irPara(a.valor)"
      >
        {{ a.rotulo }}<span v-if="a.valor === 'aparelhos' && dispositivos.length" class="aba-contagem">{{ dispositivos.length }}</span>
      </button>
    </div>

    <template v-if="aba === 'maquina'">
      <Card titulo="Estado da conexão">
        <template #acoes>
          <StatusBadge :estado="seloDaConexao.estado" :texto="seloDaConexao.texto" />
        </template>
        <dl class="resumo">
          <div>
            <dt>Computador</dt>
            <dd>{{ online ? connection.device || 'Este computador' : 'Nenhum' }}</dd>
          </div>
          <div v-if="online && connection.url">
            <dt>Endereço</dt>
            <dd><code>{{ connection.url }}</code></dd>
          </div>
          <div v-if="versao">
            <dt>Versão desta tela</dt>
            <dd>{{ versao }}</dd>
          </div>
        </dl>
        <template v-if="!online">
          <p v-if="connection.detail" class="error" role="alert">{{ connection.detail }}</p>
          <p class="muted">
            Esta tela não está falando com o serviço do Agent Hub. Tente conectar de novo; se o serviço estiver em outro computador, use a conexão
            manual na aba "Celular e outros aparelhos".
          </p>
          <div class="row">
            <button class="primary" type="button" :disabled="busy || tentandoAuto" @click="conectarSozinho">
              {{ busy || tentandoAuto ? 'Conectando...' : 'Tentar conectar de novo' }}
            </button>
            <button type="button" @click="irPara('aparelhos')">Conectar manualmente</button>
          </div>
        </template>
      </Card>

      <ServicoCard v-if="online" @reconectou="carregarDispositivos" />
    </template>

    <template v-else-if="aba === 'aparelhos'">
      <template v-if="online">
        <Card titulo="Acesso remoto">
          <template #acoes>
            <StatusBadge :estado="senhaDefinida ? 'ok' : 'desligado'" :texto="senhaDefinida ? 'Senha definida' : 'Sem senha'" />
          </template>
          <div class="explicacao">
            <p>Com o acesso remoto você usa o Agent Hub pelo celular ou por outro computador, sem precisar estar nesta máquina.</p>
            <ol>
              <li>Defina uma senha abaixo.</li>
              <li>No outro aparelho, abra o endereço do Agent Hub e escolha entrar com senha.</li>
              <li>Pronto: o aparelho aparece na lista de autorizados e você pode tirar o acesso quando quiser.</li>
            </ol>
            <p v-if="!senhaDefinida" class="muted small">Enquanto não houver senha, nenhum aparelho de fora consegue entrar.</p>
          </div>
          <form class="ui-form" @submit.prevent="definirSenha">
            <Field
              :rotulo="senhaDefinida ? 'Nova senha de acesso' : 'Senha de acesso'"
              ajuda="Use pelo menos oito caracteres. Trocar a senha não desconecta os aparelhos que já entraram."
            >
              <input v-model="novaSenha" type="password" autocomplete="new-password" />
            </Field>
            <div class="ui-form-acoes">
              <button class="primary" type="submit" :disabled="novaSenha.length < 8 || acaoSenha.ocupado.value">
                {{ acaoSenha.ocupado.value ? 'Salvando...' : senhaDefinida ? 'Trocar senha' : 'Definir senha' }}
              </button>
            </div>
          </form>
        </Card>

        <Card titulo="Aparelhos autorizados" descricao="Celulares e computadores que entraram com a senha. Revogue o acesso dos que você não usa mais.">
          <EmptyState v-if="carregandoDispositivos && !dispositivos.length" titulo="Carregando" carregando />
          <EmptyState v-else-if="erroDispositivos" titulo="Não consegui carregar a lista de aparelhos" :texto="erroDispositivos">
            <button type="button" @click="carregarDispositivos">Tentar de novo</button>
          </EmptyState>
          <EmptyState
            v-else-if="!dispositivos.length"
            titulo="Nenhum aparelho autorizado"
            texto="Quando alguém entrar com a senha, o aparelho aparece aqui. Esta máquina não precisa de autorização."
          />
          <ul v-else class="ui-lista">
            <li v-for="d in dispositivos" :key="d.id" class="ui-lista-item">
              <span class="ui-lista-item-texto">
                <strong>{{ d.name }}</strong>
                <span class="muted small">Entrou em {{ quando(d.createdAt) }} · Último uso: {{ quando(d.lastSeen) }}</span>
              </span>
              <span class="ui-lista-item-acoes">
                <button type="button" class="danger" :disabled="acaoRevogar.ocupado.value" @click="revogar(d)">
                  {{ revogando === d.id ? 'Revogando...' : 'Revogar acesso' }}
                </button>
              </span>
            </li>
          </ul>
        </Card>
      </template>
      <EmptyState
        v-else
        titulo="Sem conexão com o serviço do Agent Hub"
        texto="A senha e a lista de aparelhos aparecem quando esta tela estiver conectada. Tente conectar de novo ou use a conexão manual abaixo."
      >
        <button type="button" :disabled="busy || tentandoAuto" @click="conectarSozinho">Tentar conectar de novo</button>
      </EmptyState>

      <details class="manual" :open="!online">
        <summary>Conectar manualmente a outro Agent Hub</summary>
        <p class="muted small">
          Só é preciso quando o Agent Hub que você quer usar roda em outro computador. Trocar a conexão aqui muda o que esta tela mostra.
        </p>
        <div class="manual-corpo">
          <ConexaoManual :ocupado="busy" :com-erro="Boolean(error)" @conectar="connect" @entrar="entrarComSenha" @escolher="pick" />
        </div>
      </details>
    </template>

    <template v-else>
      <NotificacoesCard v-if="online" />
      <EmptyState
        v-else
        titulo="Sem conexão com o serviço do Agent Hub"
        texto="As notificações só podem ser ativadas com esta tela conectada."
      >
        <button type="button" @click="irPara('maquina')">Ver estado da conexão</button>
      </EmptyState>
    </template>
  </div>
</template>

<style scoped>
.aba-contagem {
  margin-left: 6px;
  font-size: var(--fs-small);
  color: var(--text-soft);
}

.resumo {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  margin: 0 0 var(--space-3);
}

.resumo dt {
  font-size: var(--fs-small);
  color: var(--text-soft);
}

.resumo dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.explicacao {
  margin-bottom: var(--space-3);
}

.explicacao p {
  margin: 0 0 var(--space-2);
}

.explicacao ol {
  margin: 0 0 var(--space-2);
  padding-left: 1.25rem;
}

.manual {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: var(--space-3);
}

.manual summary {
  cursor: pointer;
  font-weight: 600;
}

.manual > p {
  margin: var(--space-2) 0;
}

.manual-corpo {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
