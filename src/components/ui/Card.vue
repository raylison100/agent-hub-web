<script setup lang="ts">
defineProps<{ titulo?: string; descricao?: string; perigo?: boolean }>()
</script>

<template>
  <section :class="['ui-card', { perigo }]">
    <header v-if="titulo || $slots.acoes" class="ui-card-header">
      <div>
        <h2 v-if="titulo">{{ titulo }}</h2>
        <p v-if="descricao" class="muted">{{ descricao }}</p>
      </div>
      <div v-if="$slots.acoes" class="ui-card-acoes"><slot name="acoes" /></div>
    </header>
    <slot />
  </section>
</template>
