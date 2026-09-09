<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessions } from '../stores/sessions'
import Timeline from './Timeline.vue'

const props = defineProps<{ sessionId: string }>()
const sessions = useSessions()
const tab = ref<'subagents' | 'terminal'>('subagents')

const subagents = computed(() => sessions.subagents(props.sessionId))
const running = computed(() => subagents.value.filter((s) => s.status === 'running').length)
const entries = computed(() => sessions.terminal.get(props.sessionId) ?? [])
</script>

<template>
  <aside class="panel-right">
    <div class="tabs">
      <button :class="{ active: tab === 'subagents' }" @click="tab = 'subagents'">
        Subagentes <span v-if="running" class="badge">{{ running }}</span>
      </button>
      <button :class="{ active: tab === 'terminal' }" @click="tab = 'terminal'">Terminal <span v-if="entries.length" class="badge muted-badge">{{ entries.length }}</span></button>
    </div>
    <div v-if="tab === 'subagents'" class="panel-scroll">
      <p v-if="!subagents.length" class="muted small pad">Nenhum subagente nesta sessao. Perfis com <code>delegates</code> mostram aqui cada delegacao ao vivo.</p>
      <div v-for="(s, i) in subagents" :key="i" class="panel-sub">
        <div class="panel-sub-head">
          <span class="pulse" :data-status="s.status"></span>
          <strong>{{ s.agent }}</strong>
          <span class="cost">{{ s.costUsd.toFixed(4) }} USD</span>
        </div>
        <div class="muted small">{{ s.task }}</div>
        <Timeline :items="s.items" nested />
      </div>
    </div>
    <div v-else class="panel-scroll terminal">
      <p v-if="!entries.length" class="muted small pad">Saidas de run_command e git aparecem aqui.</p>
      <div v-for="(e, i) in entries" :key="i" class="term-entry">
        <div class="term-cmd">$ {{ e.command }}</div>
        <pre class="term-out">{{ e.output }}</pre>
      </div>
    </div>
  </aside>
</template>
