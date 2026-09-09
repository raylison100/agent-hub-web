<script setup lang="ts">
import { ref } from 'vue'
import type { TimelineItem } from '../stores/sessions'

defineProps<{ item: Extract<TimelineItem, { kind: 'tool' }> }>()
const open = ref(false)
</script>

<template>
  <div class="tool" :class="{ error: item.isError }">
    <button class="tool-head" @click="open = !open">
      <span class="tool-name">{{ item.name }}</span>
      <span class="tag" :data-decision="item.decision">{{ item.decision }}</span>
      <span v-if="item.ms !== undefined" class="muted small">{{ item.ms }} ms</span>
      <span v-if="item.result === undefined && item.decision !== 'deny'" class="muted small">aguardando</span>
      <span class="muted small">{{ open ? 'ocultar' : 'detalhes' }}</span>
    </button>
    <div v-if="open" class="tool-body">
      <pre class="args">{{ JSON.stringify(item.args, null, 2) }}</pre>
      <pre v-if="item.result !== undefined" class="result">{{ item.result }}</pre>
    </div>
  </div>
</template>
