<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { useAtualizacoes } from '../stores/atualizacoes'
import { confirmar } from '../ui/feedback'

const at = useAtualizacoes()
const releases = 'https://github.com/raylison100/agent-hub/releases/latest'
const versaoAntes = ref('')
let espera: ReturnType<typeof setInterval> | null = null

onMounted(() => void at.verificar())
onUnmounted(() => pararEspera())

function pararEspera(): void {
  if (espera) clearInterval(espera)
  espera = null
}

async function atualizarDaemon(): Promise<void> {
  const ok = await confirmar({
    titulo: 'Atualizar o serviço do Agent Hub agora?',
    detalhe: 'O serviço reinicia no fim e interrompe as conversas e rotinas em andamento.',
    botao: 'Atualizar',
    perigo: false,
  })
  if (!ok) return
  versaoAntes.value = at.daemon?.atual ?? ''
  await at.atualizarDaemon()
  if (!at.daemon?.atualizando) return
  const limite = Date.now() + 5 * 60 * 1000
  pararEspera()
  espera = setInterval(async () => {
    await at.verificarDaemon(true)
    const trocou = at.daemon && !at.daemon.atualizando && at.daemon.atual !== versaoAntes.value
    if (trocou || Date.now() > limite) pararEspera()
  }, 4000)
}

function data(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR')
}
</script>

<template>
  <div class="ui-page">
    <PageHeader titulo="Atualizações" descricao="Veja se há uma versão nova do Agent Hub e instale. O app e o serviço que roda os agentes usam a mesma versão.">
      <template #acoes>
        <button type="button" :disabled="at.verificando" @click="at.verificar(true)">{{ at.verificando ? 'Procurando...' : 'Procurar agora' }}</button>
      </template>
    </PageHeader>

    <Card v-if="at.desktop" titulo="App de desktop" descricao="O programa que você abre neste computador.">
      <p class="small">Versão instalada: <code>{{ at.appAtual || '...' }}</code></p>
      <template v-if="at.appNoWindows">
        <div v-if="at.appNova" class="nova">
          <p class="small">
            A versão <code>{{ at.appNova.versao }}</code> saiu{{ data(at.appNova.data) ? ` em ${data(at.appNova.data)}` : '' }}. O
            instalador é conferido pela assinatura antes de rodar, e o app reabre sozinho.
          </p>
          <button class="primary" type="button" :disabled="at.appBaixando" @click="at.instalarApp()">
            {{ at.appBaixando ? `Baixando ${at.appProgresso}%` : 'Instalar e reabrir' }}
          </button>
        </div>
        <StatusBadge v-else-if="!at.appErro && !at.verificando" estado="ok" texto="Esta é a versão mais recente" />
      </template>
      <p v-else class="muted small">
        No Linux o app atualiza pelo pacote: baixe o <code>.deb</code> ou o <code>.rpm</code> da
        <a :href="releases" target="_blank" rel="noopener">última Release</a>.
      </p>
      <p v-if="at.appErro" class="error">{{ at.appErro }}</p>
    </Card>

    <Card titulo="Daemon" descricao="O serviço que roda os agentes nesta máquina.">
      <template v-if="at.daemon" #acoes>
        <StatusBadge v-if="at.daemon.atualizando" estado="andamento" texto="Atualizando" />
        <StatusBadge v-else-if="at.daemon.disponivel" estado="atencao" :texto="`Nova versão ${at.daemon.ultima}`" />
        <StatusBadge v-else estado="ok" texto="Em dia" />
      </template>
      <template v-if="at.daemon">
        <p class="small">
          Versão em execução: <code>{{ at.daemon.atual }}</code>
          <span v-if="at.daemon.ultima" class="muted">, última publicada <code>{{ at.daemon.ultima }}</code>{{ data(at.daemon.publicada_em) ? ` em ${data(at.daemon.publicada_em)}` : '' }}</span>
        </p>
        <p class="small">{{ at.daemon.detalhe }}</p>
        <div class="row">
          <button v-if="at.daemon.pode_atualizar" class="primary" type="button" @click="atualizarDaemon">Atualizar o daemon</button>
          <a v-if="at.daemon.disponivel && at.daemon.endereco_da_versao" class="small" :href="at.daemon.endereco_da_versao" target="_blank" rel="noopener">O que mudou nesta versão</a>
        </div>
      </template>
      <EmptyState v-else-if="!at.daemonErro" titulo="Consultando" carregando />
      <p v-if="at.daemonErro" class="error">{{ at.daemonErro }}</p>
    </Card>
  </div>
</template>

<style scoped>
.nova {
  display: grid;
  gap: 8px;
  justify-items: start;
}
</style>
