import type { RelayDevice } from '@agent-hub/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'
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

  function disconnect(): void {
    client.close()
  }

  return { mode, url, token, accountToken, deviceId, devices, status, detail, device, connect, disconnect }
})
