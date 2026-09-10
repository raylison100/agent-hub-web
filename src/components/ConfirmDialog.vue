<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

defineProps<{ title: string; detail?: string; confirmLabel?: string }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('cancel')
  if (e.key === 'Enter') emit('confirm')
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('cancel')">
    <div class="modal">
      <h2>{{ title }}</h2>
      <p v-if="detail" class="muted small">{{ detail }}</p>
      <div class="modal-actions">
        <button class="ghost" @click="emit('cancel')">Cancelar</button>
        <button class="danger" autofocus @click="emit('confirm')">{{ confirmLabel ?? 'Confirmar' }}</button>
      </div>
    </div>
  </div>
</template>
