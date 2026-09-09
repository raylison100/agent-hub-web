import type { ClientFrame, ServerFrame } from '@agent-hub/core'

export type Listener = (frame: ServerFrame) => void
export type Status = 'offline' | 'connecting' | 'online' | 'error'

const protocolVersion = 1

/** Cliente WebSocket do daemon: autentica, correlaciona respostas por tipo e reconecta. */
export class DaemonClient {
  private socket: WebSocket | null = null
  private listeners = new Set<Listener>()
  private waiters: { type: ServerFrame['type']; resolve: (f: ServerFrame) => void; reject: (e: Error) => void }[] = []
  private statusListeners = new Set<(s: Status, detail?: string) => void>()
  status: Status = 'offline'
  device = ''

  onStatus(fn: (s: Status, detail?: string) => void): () => void {
    this.statusListeners.add(fn)
    return () => this.statusListeners.delete(fn)
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  connect(url: string, token: string): Promise<void> {
    this.close()
    this.setStatus('connecting')
    return new Promise((resolve, reject) => {
      let socket: WebSocket
      try {
        socket = new WebSocket(url)
      } catch (err) {
        this.setStatus('error', String(err))
        reject(err as Error)
        return
      }
      this.socket = socket
      socket.onopen = () => this.raw({ type: 'auth', token, protocol_version: protocolVersion, client: 'web' })
      socket.onmessage = (ev) => {
        const frame = JSON.parse(String(ev.data)) as ServerFrame
        if (frame.type === 'auth.ok') {
          this.device = frame.device
          this.setStatus('online')
          resolve()
        }
        if (frame.type === 'auth.error') {
          this.setStatus('error', frame.message)
          reject(new Error(frame.message))
          socket.close()
        }
        this.dispatch(frame)
      }
      socket.onerror = () => this.setStatus('error', 'falha na conexao')
      socket.onclose = () => {
        if (this.status !== 'error') this.setStatus('offline')
        for (const w of this.waiters.splice(0)) w.reject(new Error('conexao encerrada'))
      }
    })
  }

  close(): void {
    this.socket?.close()
    this.socket = null
  }

  send(frame: ClientFrame): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('daemon desconectado')
    this.raw(frame)
  }

  /** Envia um quadro e espera o proximo quadro do tipo indicado, ou um `error`. */
  request<T extends ServerFrame['type']>(frame: ClientFrame, type: T, timeoutMs = 15000): Promise<Extract<ServerFrame, { type: T }>> {
    return new Promise((resolve, reject) => {
      const waiter = { type, resolve: (f: ServerFrame) => resolve(f as Extract<ServerFrame, { type: T }>), reject }
      this.waiters.push(waiter)
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter)
        reject(new Error(`sem resposta para ${frame.type}`))
      }, timeoutMs)
      const original = waiter.resolve
      waiter.resolve = (f) => {
        clearTimeout(timer)
        original(f)
      }
      const originalReject = waiter.reject
      waiter.reject = (e) => {
        clearTimeout(timer)
        originalReject(e)
      }
      try {
        this.send(frame)
      } catch (err) {
        clearTimeout(timer)
        this.waiters = this.waiters.filter((w) => w !== waiter)
        reject(err as Error)
      }
    })
  }

  private raw(frame: ClientFrame): void {
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

export const client = new DaemonClient()
