import type { RelayDevice } from '@agent-hub/core'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { client, type Status } from '../daemon/client'

const keys = {
  mode: 'agent-hub.mode',
  url: 'agent-hub.daemon.url',
  token: 'agent-hub.daemon.token',
  account: 'agent-hub.relay.account',
  device: 'agent-hub.relay.device',
}

function stored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    return
  }
}

interface PairPayload {
  mode?: 'direct' | 'relay'
  url?: string
  token?: string
  account?: string
  device?: string
}

/** Le `#pair=<base64url json>` da URL uma unica vez, antes de qualquer redirecionamento do roteador. */
function pairFromHash(): PairPayload | null {
  const match = /#pair=([A-Za-z0-9_-]+)/.exec(window.location.hash)
  if (!match) return null
  try {
    const payload = JSON.parse(atob(match[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as PairPayload
    history.replaceState(null, '', window.location.pathname)
    return payload
  } catch {
    return null
  }
}

export const useConnection = defineStore('connection', () => {
  const pair = pairFromHash()
  const mode = ref<'direct' | 'relay'>((pair?.mode ?? stored(keys.mode, 'direct')) === 'relay' ? 'relay' : 'direct')
  const url = ref(pair?.url ?? stored(keys.url, 'ws://127.0.0.1:47311/ws'))
  const token = ref(pair?.token ?? stored(keys.token, ''))
  const accountToken = ref(pair?.account ?? stored(keys.account, ''))
  const deviceId = ref(pair?.device ?? stored(keys.device, ''))
  const devices = ref<RelayDevice[]>([])
  const status = ref<Status>('offline')
  const detail = ref('')
  const device = ref('')

  client.onStatus((s, d) => {
    status.value = s
    detail.value = d ?? ''
    device.value = client.device
    devices.value = client.devices
  })

  function persist(): void {
    remember(keys.mode, mode.value)
    remember(keys.url, url.value)
    remember(keys.token, token.value)
    remember(keys.account, accountToken.value)
    remember(keys.device, deviceId.value)
  }

  /** Conecta direto ou pelo relay. Devolve `devices` quando falta escolher o dispositivo. */
  async function connect(): Promise<'online' | 'devices'> {
    persist()
    const result = await client.connect({
      url: url.value,
      token: token.value,
      accountToken: mode.value === 'relay' ? accountToken.value : undefined,
      deviceId: mode.value === 'relay' && deviceId.value ? deviceId.value : undefined,
    })
    devices.value = client.devices
    return result
  }

  /** Pareamento automatico: a interface servida pelo proprio daemon pede o token na mesma origem, sem voce digitar nada. */
  async function pairLocal(): Promise<boolean> {
    if (token.value) return true
    if (typeof window === 'undefined') return false
    const bases = [window.location.origin, 'http://127.0.0.1:47311']
    for (const base of bases) {
      if (base.startsWith('http') === false) continue
      try {
        const res = await fetch(`${base}/pair/local`, { headers: { accept: 'application/json' } })
        if (!res.ok) continue
        const data = (await res.json()) as { url?: string; token?: string }
        if (!data.token || !data.url) continue
        mode.value = 'direct'
        url.value = data.url
        token.value = data.token
        persist()
        return true
      } catch {
        continue
      }
    }
    return false
  }

  function disconnect(): void {
    client.close()
  }

  /** Resolve quando a conexao estiver online, ou rejeita no prazo. Usado por telas abertas direto pela URL. */
  function whenOnline(timeoutMs = 15000): Promise<void> {
    if (status.value === 'online') return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        stop()
        reject(new Error('daemon desconectado'))
      }, timeoutMs)
      const stop = watch(status, (s) => {
        if (s === 'online') {
          clearTimeout(timer)
          stop()
          resolve()
        }
        if (s === 'error') {
          clearTimeout(timer)
          stop()
          reject(new Error(detail.value || 'falha na conexao'))
        }
      })
    })
  }

  return { mode, url, token, accountToken, deviceId, devices, status, detail, device, connect, disconnect, pairLocal, whenOnline }
})
