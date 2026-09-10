<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

export interface MenuItem {
  id: string
  label: string
  key?: string
  danger?: boolean
  separator?: boolean
  disabled?: boolean
}

const props = defineProps<{ x: number; y: number; items: MenuItem[] }>()
const emit = defineEmits<{ pick: [id: string]; close: [] }>()
const root = ref<HTMLElement | null>(null)

const style = computed(() => {
  const width = 240
  const height = props.items.length * 32 + 16
  const x = Math.min(props.x, window.innerWidth - width - 8)
  const y = Math.min(props.y, window.innerHeight - height - 8)
  return { left: `${Math.max(8, x)}px`, top: `${Math.max(8, y)}px` }
})

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    emit('close')
    return
  }
  const item = props.items.find((i) => !i.separator && !i.disabled && i.key && i.key.toLowerCase() === e.key.toLowerCase())
  if (item) {
    e.preventDefault()
    emit('pick', item.id)
  }
}

function onPointer(e: MouseEvent): void {
  if (root.value && !root.value.contains(e.target as Node)) emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('mousedown', onPointer)
  window.addEventListener('contextmenu', onPointer)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('mousedown', onPointer)
  window.removeEventListener('contextmenu', onPointer)
})
</script>

<template>
  <div ref="root" class="context-menu" :style="style" role="menu">
    <template v-for="item in items" :key="item.id">
      <div v-if="item.separator" class="menu-sep"></div>
      <button v-else class="menu-item" :class="{ danger: item.danger }" :disabled="item.disabled" role="menuitem" @click="$emit('pick', item.id)">
        <span>{{ item.label }}</span>
        <span v-if="item.key" class="menu-key">{{ item.key }}</span>
      </button>
    </template>
  </div>
</template>
