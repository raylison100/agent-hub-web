<script setup lang="ts">
import { computed } from 'vue'
import type { TimelineItem, ToolItem } from '../stores/sessions'
import SubagentCard from './SubagentCard.vue'
import ToolGroup from './ToolGroup.vue'

const props = defineProps<{ items: TimelineItem[]; nested?: boolean }>()

type Block = { kind: 'tools'; items: ToolItem[] } | { kind: 'item'; item: TimelineItem }

const blocks = computed<Block[]>(() => {
  const out: Block[] = []
  for (const item of props.items) {
    if (item.kind === 'tool') {
      const last = out[out.length - 1]
      if (last && last.kind === 'tools') last.items.push(item)
      else out.push({ kind: 'tools', items: [item] })
      continue
    }
    out.push({ kind: 'item', item })
  }
  return out
})
</script>

<template>
  <template v-for="(block, i) in blocks" :key="i">
    <ToolGroup v-if="block.kind === 'tools'" :items="block.items" />
    <template v-else>
      <div v-if="block.item.kind === 'user'" class="bubble user"><pre>{{ block.item.text }}</pre></div>
      <div v-else-if="block.item.kind === 'assistant'" class="assistant-text" :class="{ live: block.item.live }"><pre>{{ block.item.text }}</pre></div>
      <SubagentCard v-else-if="block.item.kind === 'subagent'" :item="block.item" />
      <div v-else-if="block.item.kind === 'info'" class="info" :data-tone="block.item.tone">{{ block.item.text }}</div>
    </template>
  </template>
</template>
