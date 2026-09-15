import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import { isDesktop } from './daemon/native-dialog'
import { instalarLinksExternos } from './links-externos'
import { router } from './router'
import { aplicar, carregar } from './theme'
import './styles.css'
import './ui.css'

/** No desktop os arquivos ja vem no instalador; um service worker so serviria para servir versao velha depois de atualizar o app. */
async function dropServiceWorker(): Promise<void> {
  const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? []
  await Promise.all(registrations.map((r) => r.unregister()))
  const keys = (await caches?.keys()) ?? []
  await Promise.all(keys.map((k) => caches.delete(k)))
  if (registrations.length > 0) location.reload()
}

if (isDesktop()) void dropServiceWorker().catch(() => undefined)
else registerSW({ immediate: true })

instalarLinksExternos()
aplicar(carregar())
createApp(App).use(createPinia()).use(router).mount('#app')
