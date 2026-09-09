<script setup lang="ts">
import { ref } from 'vue'
import type { SubagentItem } from '../stores/sessions'
import Timeline from './Timeline.vue'

defineProps<{ item: SubagentItem }>()
const open = ref(true)
</script>

<template>
  <div class="subagent" :class="{ running: item.status === 'running' }">
    <button class="subagent-head" @click="open = !open">
      <span class="pulse" :data-status="item.status"></span>
      <span class="subagent-agent">{{ item.agent }}</span>
      <span class="subagent-task">{{ item.task }}</span>
      <span class="muted small">{{ item.steps }} passos</span>
      <span class="cost">{{ item.costUsd.toFixed(4) }} USD</span>
      <span v-if="item.stop && item.stop !== 'end'" class="tag error-tag">{{ item.stop }}</span>
      <span class="chevron">{{ open ? 'v' : '>' }}</span>
    </button>
    <div v-if="open" class="subagent-body">
      <Timeline :items="item.items" nested />
      <p v-if="!item.items.length" class="muted small">{{ item.status === 'running' ? 'trabalhando...' : 'sem eventos' }}</p>
    </div>
  </div>
</template>
