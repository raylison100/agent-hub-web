import type { EstadoDaVersao } from '@agent-hub/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { client } from '../daemon/client'
import { isDesktop } from '../daemon/native-dialog'
import { useConnection } from './connection'

interface VersaoDoApp {
  versao: string
  notas: string
  data: string
}

interface UpdateDoTauri {
  version: string
  body?: string
  date?: string
  downloadAndInstall(onEvent?: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void): Promise<void>
}

let pendente: UpdateDoTauri | null = null

/** Estado das versoes do app de desktop e do daemon, com a busca e a instalacao de cada um. */
export const useAtualizacoes = defineStore('atualizacoes', () => {
  const desktop = isDesktop()
  const appNoWindows = desktop && /Windows/i.test(navigator.userAgent)
  const appAtual = ref('')
  const appNova = ref<VersaoDoApp | null>(null)
  const appErro = ref('')
  const appBaixando = ref(false)
  const appProgresso = ref(0)
  const daemon = ref<EstadoDaVersao | null>(null)
  const daemonErro = ref('')
  const verificando = ref(false)

  const temNovidade = computed(() => Boolean(appNova.value) || Boolean(daemon.value?.disponivel))

  async function verificarApp(): Promise<void> {
    if (!desktop) return
    appErro.value = ''
    try {
      const { getVersion } = await import('@tauri-apps/api/app')
      appAtual.value = await getVersion()
      if (!appNoWindows) return
      const { check } = await import('@tauri-apps/plugin-updater')
      const achada = (await check()) as UpdateDoTauri | null
      pendente = achada
      appNova.value = achada ? { versao: achada.version, notas: achada.body ?? '', data: achada.date ?? '' } : null
    } catch (err) {
      appErro.value = err instanceof Error ? err.message : String(err)
    }
  }

  async function verificarDaemon(forcar: boolean): Promise<void> {
    daemonErro.value = ''
    try {
      await useConnection().whenOnline()
      daemon.value = (await client.request({ type: 'versao.consultar', forcar }, 'versao.estado', 20000)).estado
    } catch (err) {
      daemonErro.value = err instanceof Error ? err.message : String(err)
    }
  }

  async function verificar(forcar = false): Promise<void> {
    verificando.value = true
    await Promise.all([verificarApp(), verificarDaemon(forcar)])
    verificando.value = false
  }

  async function instalarApp(): Promise<void> {
    if (!pendente) return
    appErro.value = ''
    appBaixando.value = true
    appProgresso.value = 0
    let total = 0
    let baixado = 0
    try {
      await pendente.downloadAndInstall((e) => {
        if (e.event === 'Started') total = e.data?.contentLength ?? 0
        if (e.event === 'Progress') {
          baixado += e.data?.chunkLength ?? 0
          appProgresso.value = total ? Math.min(100, Math.round((baixado / total) * 100)) : 0
        }
      })
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (err) {
      appErro.value = err instanceof Error ? err.message : String(err)
    } finally {
      appBaixando.value = false
    }
  }

  async function atualizarDaemon(): Promise<void> {
    daemonErro.value = ''
    try {
      daemon.value = (await client.request({ type: 'versao.atualizar' }, 'versao.estado', 30000)).estado
    } catch (err) {
      daemonErro.value = err instanceof Error ? err.message : String(err)
    }
  }

  return {
    desktop,
    appNoWindows,
    appAtual,
    appNova,
    appErro,
    appBaixando,
    appProgresso,
    daemon,
    daemonErro,
    verificando,
    temNovidade,
    verificar,
    verificarDaemon,
    instalarApp,
    atualizarDaemon,
  }
})
