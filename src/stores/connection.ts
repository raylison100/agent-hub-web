import { defineStore } from 'pinia'
import { ref } from 'vue'
import { client, type Status } from '../daemon/client'

const urlKey = 'agent-hub.daemon.url'
const tokenKey = 'agent-hub.daemon.token'

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

export const useConnection = defineStore('connection', () => {
  const url = ref(stored(urlKey, 'ws://127.0.0.1:47311/ws'))
  const token = ref(stored(tokenKey, ''))
  const status = ref<Status>('offline')
  const detail = ref('')
  const device = ref('')

  client.onStatus((s, d) => {
    status.value = s
    detail.value = d ?? ''
    device.value = client.device
  })

  async function connect(): Promise<void> {
    remember(urlKey, url.value)
    remember(tokenKey, token.value)
    await client.connect(url.value, token.value)
  }

  function disconnect(): void {
    client.close()
  }

  return { url, token, status, detail, device, connect, disconnect }
})
