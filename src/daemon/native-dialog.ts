const backslash = /\\/g
const uncPrefix = /^\/\/(?:wsl\.localhost|wsl\$)\/[^/]+(\/.*)$/
const windowsDrive = /^([A-Za-z]):(\/.*)$/

/** Verdadeiro quando a interface roda dentro da casca desktop, onde existe dialogo nativo de pasta. */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function isWindowsHost(): boolean {
  return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)
}

/** Converte o caminho devolvido pelo dialogo nativo para o caminho que o daemon enxerga. */
export function toDaemonPath(picked: string): string {
  const p = picked.replace(backslash, '/').replace(/\/+$/, '')
  const wsl = uncPrefix.exec(p)
  if (wsl) return wsl[1] ?? p
  const drive = windowsDrive.exec(p)
  if (drive) return `/mnt/${drive[1]!.toLowerCase()}${drive[2]}`
  return p || '/'
}

/** Caminho que o dialogo nativo entende, a partir do caminho do daemon. */
export function toNativePath(daemonPath: string, wslDistro: string | null): string {
  if (!isWindowsHost() || !wslDistro || !daemonPath.startsWith('/')) return daemonPath
  const windows = daemonPath.split('/').join('\\')
  return `\\\\wsl.localhost\\${wslDistro}${windows}`
}

/** Abre o seletor de pasta do sistema operacional. Devolve null quando o usuario cancela. */
export async function pickFolder(title: string, defaultPath?: string): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const picked = await open({ directory: true, multiple: false, title, defaultPath })
  return typeof picked === 'string' ? picked : null
}

/** No navegador nao ha dialogo que devolva caminho absoluto, mas o Chromium abre o seletor de pastas e informa o nome. */
export function temSeletorDePasta(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export async function nomeDePastaEscolhida(): Promise<string | null> {
  const escolher = (window as unknown as { showDirectoryPicker?: () => Promise<{ name: string }> }).showDirectoryPicker
  if (!escolher) return null
  try {
    const handle = await escolher()
    return handle.name
  } catch {
    return null
  }
}
