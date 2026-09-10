<script setup lang="ts">
import { computed, ref } from 'vue'
import { diffStats, type ToolItem } from '../stores/sessions'
import ToolCard from './ToolCard.vue'

const props = defineProps<{ items: ToolItem[] }>()
const open = ref(false)

const readTools = new Set(['read_file', 'list_dir', 'search'])
const commandTools = new Set(['run_command', 'git'])

function plural(n: number, singular: string, many: string): string {
  return `${n} ${n === 1 ? singular : many}`
}

const summary = computed(() => {
  const created = new Set<string>()
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
    const path = typeof args.path === 'string' ? args.path : item.callId
    if (item.name === 'write_file') created.add(path)
    else if (item.name === 'edit_file') edited.add(path)
    else if (readTools.has(item.name)) read.add(path)
    else if (commandTools.has(item.name)) commands += 1
    else others += 1
    const d = diffStats(item)
    plus += d.plus
    minus += d.minus
    if (item.isError) errors += 1
    if (item.result === undefined && item.decision !== 'deny') pending += 1
  }
  const parts: string[] = []
  if (created.size) parts.push(`criado ${plural(created.size, 'arquivo', 'arquivos')}`)
  if (edited.size) parts.push(`editado ${plural(edited.size, 'arquivo', 'arquivos')}`)
  if (read.size) parts.push(`lido ${plural(read.size, 'item', 'itens')}`)
  if (commands) parts.push(`executado ${plural(commands, 'comando', 'comandos')}`)
  if (others) parts.push(`usado ${plural(others, 'ferramenta', 'ferramentas')}`)
  const text = parts.join(', ') || `${plural(props.items.length, 'ferramenta', 'ferramentas')}`
  const touched = created.size + edited.size > 0
  return { text: text.charAt(0).toUpperCase() + text.slice(1), plus, minus, touched, errors, pending }
})
</script>

<template>
  <div class="tool-group" :class="{ open }">
    <button class="tool-group-head" @click="open = !open">
      <span class="tool-group-text">{{ summary.text }}</span>
      <span v-if="summary.touched" class="plus">+{{ summary.plus }}</span>
      <span v-if="summary.touched" class="minus">-{{ summary.minus }}</span>
      <span v-if="summary.errors" class="tag error-tag">{{ summary.errors === 1 ? '1 erro' : `${summary.errors} erros` }}</span>
      <span v-if="summary.pending" class="muted small">em andamento</span>
      <span class="chevron" :class="{ open }">&rsaquo;</span>
    </button>
    <div v-if="open" class="tool-group-body">
      <ToolCard v-for="item in items" :key="item.callId" :item="item" />
    </div>
  </div>
</template>
