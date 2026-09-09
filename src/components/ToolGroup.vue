<script setup lang="ts">
import { computed, ref } from 'vue'
import { diffStats, type ToolItem } from '../stores/sessions'
import ToolCard from './ToolCard.vue'

const props = defineProps<{ items: ToolItem[] }>()
const open = ref(false)

const summary = computed(() => {
  const edited = new Set<string>()
  const read = new Set<string>()
  let commands = 0
  let others = 0
  let plus = 0
  let minus = 0
  let errors = 0
  let pending = 0
  for (const item of props.items) {
    const args = (item.args ?? {}) as Record<string, unknown>
    const path = typeof args.path === 'string' ? args.path : ''
    if (item.name === 'edit_file' || item.name === 'write_file') edited.add(path)
    else if (item.name === 'read_file' || item.name === 'list_dir' || item.name === 'search') read.add(path || item.name)
    else if (item.name === 'run_command' || item.name === 'git') commands += 1
    else others += 1
    const d = diffStats(item)
    plus += d.plus
    minus += d.minus
    if (item.isError) errors += 1
    if (item.result === undefined && item.decision !== 'deny') pending += 1
  }
  const parts: string[] = []
  if (edited.size) parts.push(`${edited.size === 1 ? 'Editou' : 'Editou'} ${edited.size} arquivo${edited.size > 1 ? 's' : ''}`)
  if (read.size) parts.push(`leu ${read.size} ${read.size > 1 ? 'itens' : 'item'}`)
  if (commands) parts.push(`executou ${commands} comando${commands > 1 ? 's' : ''}`)
  if (others) parts.push(`${others} outra${others > 1 ? 's' : ''} ferramenta${others > 1 ? 's' : ''}`)
  const text = parts.join(', ')
  return { text: text ? text.charAt(0).toUpperCase() + text.slice(1) : `${props.items.length} ferramentas`, plus, minus, errors, pending }
})
</script>

<template>
  <div class="tool-group" :class="{ open }">
    <button class="tool-group-head" @click="open = !open">
      <span class="tool-group-text">{{ summary.text }}</span>
      <span v-if="summary.plus" class="plus">+{{ summary.plus }}</span>
      <span v-if="summary.minus" class="minus">-{{ summary.minus }}</span>
      <span v-if="summary.errors" class="tag error-tag">{{ summary.errors }} erro{{ summary.errors > 1 ? 's' : '' }}</span>
      <span v-if="summary.pending" class="muted small">em andamento</span>
      <span class="chevron">{{ open ? 'v' : '>' }}</span>
    </button>
    <div v-if="open" class="tool-group-body">
      <ToolCard v-for="item in items" :key="item.callId" :item="item" />
    </div>
  </div>
</template>
