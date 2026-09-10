<script setup lang="ts">
import { computed, ref } from 'vue'
import { client } from '../daemon/client'
import { isDesktop, pickFolder, toDaemonPath, toNativePath } from '../daemon/native-dialog'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const path = ref<string | null>(null)
const roots = ref<string[]>([])
const dirs = ref<string[]>([])
const error = ref('')
const wslDistro = ref<string | null>(null)
const desktop = isDesktop()

const recentsKey = 'agent-hub.recent-workspaces'

const label = computed(() => {
  const v = props.modelValue
  return v ? (v.split('/').filter(Boolean).pop() ?? v) : 'escolher pasta'
})

function recents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(recentsKey) ?? '[]') as string[]
  } catch {
    return []
  }
}

function remember(dir: string): void {
  try {
    const list = [dir, ...recents().filter((r) => r !== dir)].slice(0, 6)
    localStorage.setItem(recentsKey, JSON.stringify(list))
  } catch {
    return
  }
}

async function toggle(): Promise<void> {
  open.value = !open.value
  if (!open.value) return
  error.value = ''
  path.value = null
  try {
    const res = await client.request({ type: 'workspace.roots' }, 'workspace.roots')
    roots.value = res.roots
    wslDistro.value = res.wsl_distro
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function enter(dir: string): Promise<void> {
  error.value = ''
  try {
    const res = await client.request({ type: 'workspace.list', path: dir }, 'workspace.list')
    path.value = res.path
    dirs.value = res.dirs
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

function back(): void {
  if (path.value === null) return
  const current = path.value.replace(/\/+$/, '')
  if (roots.value.some((r) => r.replace(/\/+$/, '') === current)) {
    path.value = null
    return
  }
  const parent = current.split('/').slice(0, -1).join('/') || '/'
  void enter(parent)
}

/** Dialogo nativo do sistema. O caminho escolhido e traduzido e validado no daemon antes de virar workspace. */
async function browseNative(): Promise<void> {
  error.value = ''
  try {
    const base = path.value ?? props.modelValue ?? roots.value[0] ?? ''
    const picked = await pickFolder('Escolher a pasta da sessao', base ? toNativePath(base, wslDistro.value) : undefined)
    if (picked === null) return
    const dir = toDaemonPath(picked)
    await client.request({ type: 'workspace.list', path: dir }, 'workspace.list')
    choose(dir)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    error.value = message.includes('workspace nao permitido')
      ? `${message}`
      : message
  }
}

function choose(dir: string): void {
  emit('update:modelValue', dir)
  remember(dir)
  open.value = false
}
</script>

<template>
  <div class="popover-anchor ws-picker">
    <button class="chip" :title="modelValue || 'Escolher a pasta da sessao'" @click="toggle">{{ label }}</button>
    <div v-if="open" class="popover left ws-panel">
      <button v-if="desktop" class="primary small ws-browse" @click="browseNative">Procurar no computador...</button>
      <template v-if="path === null">
        <div class="popover-title">Pasta da sessao</div>
        <template v-if="recents().length > 0">
          <div class="ws-section">Recentes</div>
          <button v-for="r in recents()" :key="r" class="ws-row" @click="choose(r)">
            <span class="ws-name">{{ r.split('/').filter(Boolean).pop() }}</span>
            <span class="ws-path">{{ r }}</span>
          </button>
        </template>
        <div class="ws-section">Raizes permitidas</div>
        <button v-for="r in roots" :key="r" class="ws-row" @click="enter(r)">
          <span class="ws-name">{{ r.split('/').filter(Boolean).pop() }}</span>
          <span class="ws-path">{{ r }}</span>
        </button>
      </template>
      <template v-else>
        <div class="ws-head">
          <button class="ghost small" @click="back">Voltar</button>
          <span class="ws-current" :title="path">{{ path }}</span>
        </div>
        <button class="primary small ws-use" @click="choose(path)">Usar esta pasta</button>
        <div class="ws-list">
          <button v-for="d in dirs" :key="d" class="ws-row" @click="enter(`${path}/${d}`)">
            <span class="ws-name">{{ d }}</span>
          </button>
          <p v-if="dirs.length === 0" class="muted small">Sem subpastas.</p>
        </div>
      </template>
      <p v-if="error" class="error small">{{ error }}</p>
    </div>
  </div>
</template>
