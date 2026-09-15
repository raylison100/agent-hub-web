<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Card from '../ui/Card.vue'
import StatusBadge from '../ui/StatusBadge.vue'
import { disablePush, enablePush, pushState, testPush, type PushState } from '../../push'
import { avisar, useAcao } from '../../ui/feedback'

const push = ref<PushState>('off')
const alternancia = useAcao()
const teste = useAcao()

const selo = computed<{ estado: 'ok' | 'desligado' | 'erro' | 'atencao'; texto: string }>(() => {
  if (push.value === 'on') return { estado: 'ok', texto: 'Ativas' }
  if (push.value === 'unsupported') return { estado: 'atencao', texto: 'Não suportadas' }
  if (push.value === 'denied') return { estado: 'erro', texto: 'Bloqueadas' }
  return { estado: 'desligado', texto: 'Desativadas' }
})

onMounted(() => {
  void pushState().then((s) => (push.value = s))
})

/** Liga ou desliga as notificações neste navegador. */
async function alternar(): Promise<void> {
  const ligar = push.value !== 'on'
  const novo = await alternancia.executar(() => (ligar ? enablePush() : disablePush()))
  if (!novo) return
  push.value = novo
  if (novo === 'on') avisar('Notificações ativadas neste aparelho.')
  else if (novo === 'off') avisar('Notificações desativadas neste aparelho.', 'info')
  else if (novo === 'denied') avisar('O navegador bloqueou as notificações. Libere nas configurações do navegador.', 'erro')
}

/** Pede ao serviço uma notificação de teste para este aparelho. */
function testar(): void {
  void teste.executar(async () => testPush(), 'Notificação de teste enviada. Ela deve aparecer em alguns segundos.')
}
</script>

<template>
  <Card
    titulo="Notificações"
    descricao="Receba um aviso no celular ou no computador quando um agente precisar da sua aprovação ou terminar uma tarefa, mesmo com esta tela fechada."
  >
    <template #acoes>
      <StatusBadge :estado="selo.estado" :texto="selo.texto" />
    </template>
    <p v-if="push === 'unsupported'" class="error">
      Este navegador não aceita notificações. Tente outro navegador ou abra o Agent Hub por um endereço seguro (que começa com https).
    </p>
    <p v-else-if="push === 'denied'" class="error">
      As notificações foram bloqueadas para este site. Libere nas configurações do navegador e volte aqui para ativar.
    </p>
    <p v-else class="muted small">A configuração vale só para este aparelho. Repita em cada celular ou navegador onde quiser receber os avisos.</p>
    <div class="row">
      <button
        type="button"
        :class="{ primary: push === 'off' }"
        :disabled="push === 'unsupported' || push === 'denied' || alternancia.ocupado.value"
        @click="alternar"
      >
        {{ alternancia.ocupado.value ? 'Aguarde...' : push === 'on' ? 'Desativar notificações' : 'Ativar notificações' }}
      </button>
      <button v-if="push === 'on'" type="button" :disabled="teste.ocupado.value" @click="testar">Enviar notificação de teste</button>
    </div>
  </Card>
</template>
