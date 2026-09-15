<script setup lang="ts">
defineProps<{ rotulo: string; ajuda?: string; erro?: string; obrigatorio?: boolean }>()
</script>

<template>
  <label :class="['ui-field', { 'com-erro': erro }]">
    <span class="ui-field-rotulo">
      {{ rotulo }}<span v-if="obrigatorio" class="ui-field-obrigatorio" aria-hidden="true"> *</span>
    </span>
    <slot />
    <span v-if="erro" class="ui-field-erro">{{ erro }}</span>
    <span v-else-if="ajuda" class="ui-field-ajuda">{{ ajuda }}</span>
  </label>
</template>
