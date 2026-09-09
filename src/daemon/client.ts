import type { ClientFrame, ClientToRelay, RelayDevice, RelayToClient, ServerFrame } from '@agent-hub/core'

export type Listener = (frame: ServerFrame) => void
export type Status = 'offline' | 'connecting' | 'devices' | 'online' | 'error'

export interface ConnectOptions {
  url: string
  token: string
  accountToken?: string
  deviceId?: string
}

const protocolVersion = 1
const backoffMs = [2000, 5000, 10000, 20000]

/** Cliente WebSocket do daemon, direto ou pelo relay, com correlacao de respostas por tipo e reconexao. */
export class DaemonClient {
  private socket: WebSocket | null = null
  private listeners = new Set<Listener>()
  private statusListeners = new Set<(s: Status, detail?: string) => void>()
  private waiters: { type: ServerFrame['type']; resolve: (f: ServerFrame) => void; reject: (e: Error) => void }[] = []
  private lastOpts: ConnectOptions | null = null
  private attempts = 0
  private wanted = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  status: Status = 'offline'
  device = ''
  devices: RelayDevice[] = []

  onStatus(fn: (s: Status, detail?: string) => void): () => void {
    this.statusListeners.add(fn)
    return () => this.statusListeners.delete(fn)
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Conecta e resolve com `online`, ou com `devices` quando o relay listou dispositivos e nenhum foi escolhido. */
  connect(opts: ConnectOptions): Promise<'online' | 'devices'> {
    this.close()
    this.lastOpts = opts
    this.wanted = true
    this.setStatus('connecting')
    return new Promise((resolve, reject) => {
      let settled = false
      const done = (value: 'online' | 'devices') => {
        if (settled) return
        settled = true
        resolve(value)
      }
      const fail = (message: string) => {
        this.setStatus('error', message)
        if (settled) return
        settled = true
        reject(new Error(message))
      }
      let socket: WebSocket
      try {
        socket = new WebSocket(relayAware(opts))
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err))
        return
      }
      this.socket = socket
      socket.onopen = () => {
        if (opts.accountToken) this.raw({ type: 'relay.auth', account_token: opts.accountToken, client: 'web' })
        else this.raw({ type: 'auth', token: opts.token, protocol_version: protocolVersion, client: 'web' })
      }
      socket.onmessage = (ev) => {
        const frame = JSON.parse(String(ev.data)) as RelayToClient
        switch (frame.type) {
          case 'relay.devices':
            this.devices = frame.devices
            if (opts.deviceId && frame.devices.some((d) => d.id === opts.deviceId)) this.raw({ type: 'relay.attach', device_id: opts.deviceId })
            else {
              this.setStatus('devices')
              done('devices')
            }
            return
          case 'relay.attached':
            this.raw({ type: 'auth', token: opts.token, protocol_version: protocolVersion, client: 'web' })
            return
          case 'relay.detached':
            this.setStatus('offline', frame.reason)
            socket.close()
            return
          case 'relay.error':
            fail(frame.message)
            socket.close()
            return
          case 'auth.ok':
            this.device = frame.device
            this.attempts = 0
            this.setStatus('online')
            done('online')
            return
          case 'auth.error':
            this.wanted = false
            fail(frame.message)
            socket.close()
            return
          default:
            this.dispatch(frame)
        }
      }
      socket.onerror = () => fail('falha na conexao')
      socket.onclose = () => {
        for (const w of this.waiters.splice(0)) w.reject(new Error('conexao encerrada'))
        if (this.status !== 'error') this.setStatus('offline')
        if (!settled) fail('conexao encerrada')
        this.scheduleReconnect()
      }
    })
  }

  close(): void {
    this.wanted = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    const socket = this.socket
    this.socket = null
    socket?.close()
  }

  send(frame: ClientFrame): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.status !== 'online') throw new Error('daemon desconectado')
    this.raw(frame)
  }

  /** Envia um quadro e espera o proximo quadro do tipo indicado, ou um `error`. */
  request<T extends ServerFrame['type']>(frame: ClientFrame, type: T, timeoutMs = 15000): Promise<Extract<ServerFrame, { type: T }>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter)
        reject(new Error(`sem resposta para ${frame.type}`))
      }, timeoutMs)
      const waiter = {
        type,
        resolve: (f: ServerFrame) => {
          clearTimeout(timer)
          resolve(f as Extract<ServerFrame, { type: T }>)
        },
        reject: (e: Error) => {
          clearTimeout(timer)
          reject(e)
        },
      }
      this.waiters.push(waiter)
      try {
        this.send(frame)
      } catch (err) {
        clearTimeout(timer)
        this.waiters = this.waiters.filter((w) => w !== waiter)
        reject(err as Error)
      }
    })
  }

  private scheduleReconnect(): void {
    if (!this.wanted || !this.lastOpts || this.reconnectTimer) return
    const delay = backoffMs[Math.min(this.attempts, backoffMs.length - 1)]!
    this.attempts += 1
    const opts = this.lastOpts
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.wanted) void this.connect(opts).catch(() => undefined)
    }, delay)
  }

  private raw(frame: ClientToRelay): void {
    this.socket?.send(JSON.stringify(frame))
  }

  private dispatch(frame: ServerFrame): void {
    if (frame.type === 'error') {
      const w = this.waiters.shift()
      if (w) w.reject(new Error(frame.message))
    } else {
      const i = this.waiters.findIndex((w) => w.type === frame.type)
      if (i >= 0) this.waiters.splice(i, 1)[0]!.resolve(frame)
    }
    for (const l of this.listeners) l(frame)
  }

  private setStatus(s: Status, detail?: string): void {
    this.status = s
    for (const l of this.statusListeners) l(s, detail)
  }
}

function relayAware(opts: ConnectOptions): string {
  if (!opts.accountToken) return opts.url
  const url = new URL(opts.url)
  if (!url.pathname.endsWith('/client')) url.pathname = url.pathname.replace(/\/$/, '') + '/client'
  return url.toString()
}

export const client = new DaemonClient()
