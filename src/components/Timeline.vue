<script setup lang="ts">
import { computed } from 'vue'
import { imageSrc, useSessions, type TimelineItem, type ToolItem } from '../stores/sessions'
import Markdown from './Markdown.vue'
import SubagentCard from './SubagentCard.vue'
import ToolGroup from './ToolGroup.vue'

const props = defineProps<{ items: TimelineItem[]; nested?: boolean; sessionId?: string }>()
const sessions = useSessions()

function vote(runId: string, verdict: 'good' | 'bad'): void {
  if (!props.sessionId) return
  const current = sessions.feedback.get(runId)
  sessions.setFeedback(props.sessionId, runId, current === verdict ? 'none' : verdict)
}

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
      <div v-if="block.item.kind === 'user'" class="bubble user">
        <div v-if="block.item.images?.length" class="image-strip">
          <img v-for="(img, i) in block.item.images" :key="i" class="sent-image" :src="imageSrc(img)" :alt="img.name ?? 'imagem'" />
        </div>
        <pre>{{ block.item.text }}</pre>
      </div>
      <div v-else-if="block.item.kind === 'assistant'" class="assistant-text" :class="{ live: block.item.live }">
        <Markdown :text="block.item.text" />
        <div v-if="sessionId && block.item.runId && !block.item.live" class="feedback-row">
          <button class="feedback-btn" :class="{ active: sessions.feedback.get(block.item.runId) === 'good' }" title="Boa resposta: sobe a capacidade aprendida do agente" @click="vote(block.item.runId, 'good')">Boa</button>
          <button class="feedback-btn" :class="{ active: sessions.feedback.get(block.item.runId) === 'bad' }" title="Resposta ruim: desce a capacidade aprendida do agente" @click="vote(block.item.runId, 'bad')">Ruim</button>
        </div>
      </div>
      <SubagentCard v-else-if="block.item.kind === 'subagent'" :item="block.item" />
      <details v-else-if="block.item.kind === 'improved'" class="improved">
        <summary>Prompt reescrito por {{ block.item.by }}<span v-if="block.item.costUsd" class="muted small"> ({{ block.item.costUsd.toFixed(5) }} USD)</span></summary>
        <pre>{{ block.item.improved }}</pre>
      </details>
      <div v-else-if="block.item.kind === 'info'" class="info" :data-tone="block.item.tone">{{ block.item.text }}</div>
    </template>
  </template>
</template>
