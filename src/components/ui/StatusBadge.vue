<script setup lang="ts">
defineProps<{ estado: 'ok' | 'desligado' | 'erro' | 'atencao' | 'andamento'; texto: string }>()
</script>

<template>
  <span :class="['ui-status', estado]"><span class="ui-status-ponto" aria-hidden="true"></span>{{ texto }}</span>
</template>
