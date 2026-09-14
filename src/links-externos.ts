import { isDesktop } from './daemon/native-dialog'

/** Diz se o endereco leva para fora da propria interface. */
export function ehExterno(href: string): boolean {
  try {
    const url = new URL(href, location.href)
    return /^(https?|mailto):$/.test(url.protocol) && url.origin !== location.origin
  } catch {
    return false
  }
}

/** Abre um endereco externo no navegador do sistema, no desktop, ou numa aba nova, no navegador. */
export async function abrirExterno(href: string): Promise<void> {
  if (isDesktop()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(href)
    return
  }
  window.open(href, '_blank', 'noopener')
}

/** Faz todo link externo abrir fora da janela do Agent Hub, para o chat nunca ser substituido pela pagina. */
export function instalarLinksExternos(): void {
  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0) return
      const link = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || !ehExterno(link.href)) return
      e.preventDefault()
      void abrirExterno(link.href).catch(() => undefined)
    },
    true,
  )
  if (!isDesktop()) return
  const original = window.open.bind(window)
  window.open = (url?: string | URL, target?: string, features?: string) => {
    const href = url?.toString() ?? ''
    if (href && ehExterno(href)) {
      void abrirExterno(new URL(href, location.href).toString()).catch(() => undefined)
      return null
    }
    return original(url, target, features)
  }
}
