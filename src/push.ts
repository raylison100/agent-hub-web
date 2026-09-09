import { client } from './daemon/client'

export type PushState = 'unsupported' | 'denied' | 'off' | 'on'

/** Estado atual das notificacoes push neste navegador. */
export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

/** Pede permissao, assina no navegador e registra a assinatura no daemon. */
export async function enablePush(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const vapid = await client.request({ type: 'push.vapid' }, 'push.vapid')
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(vapid.public_key) }))
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('assinatura push incompleta')
  await client.request(
    { type: 'push.subscribe', subscription: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }, expirationTime: json.expirationTime } },
    'push.subscribed',
  )
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    try {
      client.send({ type: 'push.unsubscribe', endpoint: sub.endpoint })
    } catch {
      return 'off'
    }
    await sub.unsubscribe()
  }
  return 'off'
}

export function testPush(): void {
  client.send({ type: 'push.test' })
}

function toKey(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
