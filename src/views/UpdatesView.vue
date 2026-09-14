<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useAtualizacoes } from '../stores/atualizacoes'

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
  <section class="settings-page">
    <h1>Atualizacoes</h1>
    <p class="muted">
      O Agent Hub tem duas partes com a mesma versao: o app que voce abre e o daemon que roda os agentes. As duas procuram a
      ultima versao publicada no GitHub.
    </p>
    <button type="button" :disabled="at.verificando" @click="at.verificar(true)">{{ at.verificando ? 'Procurando...' : 'Procurar agora' }}</button>

    <div v-if="at.desktop" class="bloco">
      <h2>App de desktop</h2>
      <p class="small">Versao instalada: <code>{{ at.appAtual || '...' }}</code></p>
      <template v-if="at.appNoWindows">
        <div v-if="at.appNova" class="nova">
          <p class="small">
            A versao <code>{{ at.appNova.versao }}</code> saiu{{ data(at.appNova.data) ? ` em ${data(at.appNova.data)}` : '' }}. O
            instalador e conferido pela assinatura antes de rodar, e o app reabre sozinho.
          </p>
          <button class="primary" type="button" :disabled="at.appBaixando" @click="at.instalarApp()">
            {{ at.appBaixando ? `Baixando ${at.appProgresso}%` : 'Instalar e reabrir' }}
          </button>
        </div>
        <p v-else-if="!at.appErro && !at.verificando" class="muted small">Esta e a versao mais recente.</p>
      </template>
      <p v-else class="muted small">
        No Linux o app atualiza pelo pacote: baixe o <code>.deb</code> ou o <code>.rpm</code> da
        <a :href="releases" target="_blank" rel="noopener">ultima Release</a>.
      </p>
      <p v-if="at.appErro" class="error">{{ at.appErro }}</p>
    </div>

    <div class="bloco">
      <h2>Daemon</h2>
      <template v-if="at.daemon">
        <p class="small">
          Versao em execucao: <code>{{ at.daemon.atual }}</code>
          <span v-if="at.daemon.ultima" class="muted">, ultima publicada <code>{{ at.daemon.ultima }}</code>{{ data(at.daemon.publicada_em) ? ` em ${data(at.daemon.publicada_em)}` : '' }}</span>
        </p>
        <p class="small">{{ at.daemon.detalhe }}</p>
        <button v-if="at.daemon.pode_atualizar" class="primary" type="button" @click="atualizarDaemon">Atualizar o daemon</button>
        <a v-if="at.daemon.disponivel && at.daemon.endereco_da_versao" class="small" :href="at.daemon.endereco_da_versao" target="_blank" rel="noopener">O que mudou nesta versao</a>
      </template>
      <p v-else-if="!at.daemonErro" class="muted small">Consultando...</p>
      <p v-if="at.daemonErro" class="error">{{ at.daemonErro }}</p>
    </div>
  </section>
</template>

<style scoped>
.nova {
  display: grid;
  gap: 8px;
  justify-items: start;
}

.bloco a {
  display: inline-block;
  margin-left: 12px;
}
</style>
