<script setup lang="ts">
defineProps<{ titulo: string; descricao?: string }>()
</script>

<template>
  <header class="ui-page-header">
    <div class="ui-page-header-texto">
      <h1>{{ titulo }}</h1>
      <p v-if="descricao" class="muted">{{ descricao }}</p>
      <slot name="descricao" />
    </div>
    <div v-if="$slots.acoes" class="ui-page-header-acoes">
      <slot name="acoes" />
    </div>
  </header>
</template>
