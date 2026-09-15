<script setup lang="ts">
import { computed, ref } from 'vue'
import { client } from '../daemon/client'
import { aberto, alternar, fechar } from '../popover'
import { isDesktop, nomeDePastaEscolhida, pickFolder, temSeletorDePasta, toDaemonPath, toNativePath } from '../daemon/native-dialog'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = aberto('workspace')
const path = ref<string | null>(null)
const roots = ref<string[]>([])
const dirs = ref<string[]>([])
const repo = ref(true)
const repos = ref<string[]>([])
const error = ref('')
const wslDistro = ref<string | null>(null)
const desktop = isDesktop()
const navegadorComSeletor = !desktop && temSeletorDePasta()
const candidatos = ref<string[]>([])

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
  alternar('workspace')
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
    repo.value = res.repo
    repos.value = res.repos
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
    const picked = await pickFolder('Escolher a pasta da sessão', base ? toNativePath(base, wslDistro.value) : undefined)
    if (picked === null) return
    const dir = toDaemonPath(picked)
    await client.request({ type: 'workspace.list', path: dir }, 'workspace.list')
    choose(dir)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    error.value = /workspace n(?:ã|a)o permitido/.test(message)
      ? `${message}`
      : message
  }
}

/** No navegador: abre o seletor do sistema, pega o nome da pasta e pede ao daemon o caminho dentro das raizes. */
async function browseNoNavegador(): Promise<void> {
  error.value = ''
  candidatos.value = []
  const nome = await nomeDePastaEscolhida()
  if (!nome) return
  try {
    const res = await client.request({ type: 'workspace.find', name: nome }, 'workspace.find', 30000)
    if (res.paths.length === 1) {
      choose(res.paths[0]!)
      return
    }
    if (res.paths.length === 0) {
      error.value = `A pasta "${nome}" não está dentro das raízes permitidas. Ajuste workspaces no config.toml.`
      return
    }
    candidatos.value = res.paths
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

function choose(dir: string): void {
  emit('update:modelValue', dir)
  remember(dir)
  fechar('workspace')
}
</script>

<template>
  <div class="popover-anchor ws-picker">
    <button class="chip" :title="modelValue || 'Escolher a pasta da sessão'" @click="toggle">{{ label }}</button>
    <div v-if="open" class="popover left ws-panel">
      <button v-if="desktop" class="primary small ws-browse" @click="browseNative">Procurar no computador...</button>
      <button v-else-if="navegadorComSeletor" class="primary small ws-browse" @click="browseNoNavegador">Procurar no computador...</button>
      <template v-if="candidatos.length">
        <div class="ws-section">Qual delas?</div>
        <button v-for="c in candidatos" :key="c" class="ws-row" @click="choose(c)">
          <span class="ws-name">{{ c.split('/').filter(Boolean).pop() }}</span>
          <span class="ws-path">{{ c }}</span>
        </button>
      </template>
      <template v-if="path === null">
        <div class="popover-title">Pasta da sessão</div>
        <template v-if="recents().length > 0">
          <div class="ws-section">Recentes</div>
          <button v-for="r in recents()" :key="r" class="ws-row" @click="choose(r)">
            <span class="ws-name">{{ r.split('/').filter(Boolean).pop() }}</span>
            <span class="ws-path">{{ r }}</span>
          </button>
        </template>
        <div class="ws-section">Raízes permitidas</div>
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
        <p v-if="!repo" class="ws-nota muted small">Esta pasta não é um repositório git. A ferramenta git não funciona aqui; entre na pasta do repositório.</p>
        <button class="primary small ws-use" @click="choose(path)">Usar esta pasta</button>
        <div class="ws-list">
          <button v-for="d in dirs" :key="d" class="ws-row" @click="enter(`${path}/${d}`)">
            <span class="ws-linha">
              <span class="ws-name">{{ d }}</span>
              <span v-if="repos.includes(d)" class="ws-git">git</span>
            </span>
          </button>
          <p v-if="dirs.length === 0" class="muted small">Sem subpastas.</p>
        </div>
      </template>
      <p v-if="error" class="error small">{{ error }}</p>
    </div>
  </div>
</template>
