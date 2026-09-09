<script setup lang="ts">
import { computed, ref } from 'vue'
import { diffStats, type ToolItem } from '../stores/sessions'

const props = defineProps<{ item: ToolItem }>()
const open = ref(false)

const label = computed(() => {
  const args = (props.item.args ?? {}) as Record<string, unknown>
  if (typeof args.path === 'string') return args.path
  if (typeof args.command === 'string') return args.command.slice(0, 80)
  if (typeof args.pattern === 'string') return args.pattern
  if (Array.isArray(args.args)) return `git ${args.args.join(' ')}`.slice(0, 80)
  if (typeof args.agent === 'string') return args.agent
  if (typeof args.name === 'string') return args.name
  return ''
})

const stats = computed(() => diffStats(props.item))
</script>

<template>
  <div class="tool" :class="{ error: item.isError }">
    <button class="tool-head" @click="open = !open">
      <span class="tool-name">{{ item.name }}</span>
      <span class="tool-label">{{ label }}</span>
      <span v-if="stats.plus" class="plus">+{{ stats.plus }}</span>
      <span v-if="stats.minus" class="minus">-{{ stats.minus }}</span>
      <span class="tag" :data-decision="item.decision">{{ item.decision }}</span>
      <span v-if="item.ms !== undefined" class="muted small">{{ item.ms }} ms</span>
      <span v-if="item.result === undefined && item.decision !== 'deny'" class="muted small">aguardando</span>
    </button>
    <div v-if="open" class="tool-body">
      <pre class="args">{{ JSON.stringify(item.args, null, 2) }}</pre>
      <pre v-if="item.result !== undefined" class="result">{{ item.result }}</pre>
    </div>
  </div>
</template>
