<script setup lang="ts">
defineProps<{ titulo: string; texto?: string; carregando?: boolean }>()
</script>

<template>
  <div :class="['ui-empty', { carregando }]">
    <span v-if="carregando" class="ui-spinner" aria-hidden="true"></span>
    <strong>{{ titulo }}</strong>
    <p v-if="texto" class="muted">{{ texto }}</p>
    <div v-if="$slots.default" class="ui-empty-acao"><slot /></div>
  </div>
</template>
