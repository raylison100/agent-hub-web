import { reactive } from 'vue'

interface EstadoDeLeitura {
  inicio: number
  vistas: Record<string, number>
}

const chave = 'agent-hub.lidas'

function carregar(): EstadoDeLeitura {
  try {
    const salvo = JSON.parse(localStorage.getItem(chave) ?? 'null') as EstadoDeLeitura | null
    if (salvo && typeof salvo.inicio === 'number' && salvo.vistas) return salvo
  } catch {
    return { inicio: Date.now(), vistas: {} }
  }
  return { inicio: Date.now(), vistas: {} }
}

const estado = reactive<EstadoDeLeitura>(carregar())

function gravar(): void {
  try {
    localStorage.setItem(chave, JSON.stringify(estado))
  } catch {
    return
  }
}

gravar()

/** Marca a conversa como vista agora neste aparelho. */
export function marcarComoLida(id: string, quando: number = Date.now()): void {
  if ((estado.vistas[id] ?? 0) >= quando) return
  estado.vistas[id] = quando
  gravar()
}

/** Conversa com atividade depois da ultima vez que foi aberta neste aparelho. */
export function naoLida(id: string, atualizadaEm: number): boolean {
  return atualizadaEm > (estado.vistas[id] ?? estado.inicio)
}

/** Esquece as marcas de conversas que nao existem mais. */
export function limparLidas(existentes: string[]): void {
  const manter = new Set(existentes)
  let mudou = false
  for (const id of Object.keys(estado.vistas)) {
    if (!manter.has(id)) {
      delete estado.vistas[id]
      mudou = true
    }
  }
  if (mudou) gravar()
}
