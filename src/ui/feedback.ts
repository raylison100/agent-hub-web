import { reactive, ref } from 'vue'

export type TipoDeAviso = 'sucesso' | 'erro' | 'info'

export interface Aviso {
  id: number
  tipo: TipoDeAviso
  texto: string
}

export interface PedidoDeConfirmacao {
  titulo: string
  detalhe?: string
  botao?: string
  perigo?: boolean
  resolver: (ok: boolean) => void
}

export const feedback = reactive<{ avisos: Aviso[]; confirmacao: PedidoDeConfirmacao | null }>({ avisos: [], confirmacao: null })

let proximo = 1

/** Mostra um aviso no canto da tela; erro fica mais tempo. */
export function avisar(texto: string, tipo: TipoDeAviso = 'sucesso'): void {
  const id = proximo++
  feedback.avisos.push({ id, tipo, texto })
  setTimeout(() => fecharAviso(id), tipo === 'erro' ? 9000 : 3500)
}

export function fecharAviso(id: number): void {
  const i = feedback.avisos.findIndex((a) => a.id === id)
  if (i >= 0) feedback.avisos.splice(i, 1)
}

/** Pede confirmacao num dialogo proprio (window.confirm nao existe no app de desktop). */
export function confirmar(opcoes: { titulo: string; detalhe?: string; botao?: string; perigo?: boolean }): Promise<boolean> {
  return new Promise((resolver) => {
    feedback.confirmacao?.resolver(false)
    feedback.confirmacao = { ...opcoes, resolver }
  })
}

export function responderConfirmacao(ok: boolean): void {
  const pedido = feedback.confirmacao
  feedback.confirmacao = null
  pedido?.resolver(ok)
}

export function mensagemDeErro(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Executa uma acao com estado de ocupado, aviso de sucesso opcional e erro sempre visivel. */
export function useAcao() {
  const ocupado = ref(false)
  async function executar<T>(acao: () => Promise<T>, sucesso?: string): Promise<T | undefined> {
    ocupado.value = true
    try {
      const resultado = await acao()
      if (sucesso) avisar(sucesso, 'sucesso')
      return resultado
    } catch (err) {
      avisar(mensagemDeErro(err), 'erro')
      return undefined
    } finally {
      ocupado.value = false
    }
  }
  return { ocupado, executar }
}
