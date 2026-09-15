<script setup lang="ts">
import { ref } from 'vue'
import Card from '../ui/Card.vue'
import { client } from '../../daemon/client'
import { useConnection } from '../../stores/connection'
import { avisar, confirmar, useAcao } from '../../ui/feedback'

const emit = defineEmits<{ reconectou: [] }>()

const connection = useConnection()
const recarga = useAcao()
const reinicio = useAcao()
const reiniciando = ref(false)
const resultado = ref('')

/** Recarrega agentes, preços, conectores e skills sem interromper nada. */
async function recarregar(): Promise<void> {
  resultado.value = ''
  await recarga.executar(async () => {
    const res = await client.request({ type: 'daemon.reload' }, 'daemon.status')
    resultado.value = res.detalhe
    avisar(res.detalhe || 'Configurações recarregadas.', 'sucesso')
  })
}

/** Reinicia o serviço depois de confirmar e reconecta a tela quando ele volta. */
async function reiniciar(): Promise<void> {
  const ok = await confirmar({
    titulo: 'Reiniciar o serviço do Agent Hub?',
    detalhe: 'Conversas e rotinas em andamento são interrompidas. A tela reconecta sozinha em alguns segundos.',
    botao: 'Reiniciar',
    perigo: true,
  })
  if (!ok) return
  resultado.value = ''
  await reinicio.executar(async () => {
    const res = await client.request({ type: 'daemon.restart' }, 'daemon.status')
    resultado.value = res.detalhe
    reiniciando.value = true
    avisar(res.detalhe || 'Reiniciando o serviço.', 'info')
    setTimeout(() => {
      reiniciando.value = false
      void connection.connect().then(() => emit('reconectou'))
    }, 6000)
  })
}
</script>

<template>
  <Card titulo="Serviço do Agent Hub" descricao="O programa que roda os agentes nesta máquina.">
    <ul class="ui-lista">
      <li class="ui-lista-item">
        <span class="ui-lista-item-texto">
          <strong>Recarregar configurações</strong>
          <span class="muted">Use depois de mudar agentes, preços, conectores ou skills. Nada é interrompido.</span>
        </span>
        <span class="ui-lista-item-acoes">
          <button type="button" :disabled="recarga.ocupado.value || reinicio.ocupado.value || reiniciando" @click="recarregar">
            {{ recarga.ocupado.value ? 'Recarregando...' : 'Recarregar' }}
          </button>
        </span>
      </li>
      <li class="ui-lista-item">
        <span class="ui-lista-item-texto">
          <strong>Reiniciar o serviço</strong>
          <span class="muted">Necessário só depois de atualizar o programa. Conversas em andamento são interrompidas.</span>
        </span>
        <span class="ui-lista-item-acoes">
          <button type="button" class="danger" :disabled="recarga.ocupado.value || reinicio.ocupado.value || reiniciando" @click="reiniciar">
            {{ reinicio.ocupado.value || reiniciando ? 'Reiniciando...' : 'Reiniciar' }}
          </button>
        </span>
      </li>
    </ul>
    <p v-if="resultado" class="muted small" role="status">{{ resultado }}</p>
    <details class="detalhes-tecnicos">
      <summary class="small">Detalhes técnicos</summary>
      <p class="muted small">
        Com o serviço instalado (<code>agent-hub instalar</code> ou <code>make servico</code>) ele volta sozinho e sobe junto com a máquina. Sem o
        serviço instalado, o programa deixa um processo novo no lugar antes de sair.
      </p>
    </details>
  </Card>
</template>

<style scoped>
.detalhes-tecnicos {
  margin-top: var(--space-3);
}

.detalhes-tecnicos summary {
  cursor: pointer;
  color: var(--text-soft);
}
</style>
