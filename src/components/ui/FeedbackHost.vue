<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { feedback, fecharAviso, responderConfirmacao } from '../../ui/feedback'

function tecla(e: KeyboardEvent): void {
  if (!feedback.confirmacao) return
  if (e.key === 'Escape') responderConfirmacao(false)
  if (e.key === 'Enter') responderConfirmacao(true)
}

onMounted(() => window.addEventListener('keydown', tecla))
onUnmounted(() => window.removeEventListener('keydown', tecla))
</script>

<template>
  <div class="ui-avisos" aria-live="polite">
    <div v-for="a in feedback.avisos" :key="a.id" :class="['ui-aviso', a.tipo]" role="status">
      <span class="ui-aviso-marca" aria-hidden="true"></span>
      <span class="ui-aviso-texto">{{ a.texto }}</span>
      <button class="ui-aviso-fechar" type="button" aria-label="Fechar aviso" @click="fecharAviso(a.id)">×</button>
    </div>
  </div>
  <div v-if="feedback.confirmacao" class="modal-backdrop" @click.self="responderConfirmacao(false)">
    <div class="modal" role="dialog" aria-modal="true">
      <h2>{{ feedback.confirmacao.titulo }}</h2>
      <p v-if="feedback.confirmacao.detalhe" class="muted">{{ feedback.confirmacao.detalhe }}</p>
      <div class="modal-actions">
        <button type="button" class="ghost" @click="responderConfirmacao(false)">Cancelar</button>
        <button type="button" :class="feedback.confirmacao.perigo === false ? 'primary' : 'danger'" autofocus @click="responderConfirmacao(true)">
          {{ feedback.confirmacao.botao ?? 'Confirmar' }}
        </button>
      </div>
    </div>
  </div>
</template>
