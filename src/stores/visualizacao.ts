import { defineStore } from 'pinia'
import { ref } from 'vue'

export const extensoesVisualizaveis = ['html', 'htm', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf']

const padraoDeArquivo = new RegExp(`^(?:\\.{0,2}/)?[\\w@~.\\-/ ]+\\.(${extensoesVisualizaveis.join('|')})$`, 'i')

/** Diz se o texto parece o caminho de um arquivo que o painel consegue mostrar. */
export function pareceArquivoVisualizavel(texto: string): boolean {
  const limpo = texto.trim()
  return limpo.length < 400 && !/^[a-z]+:\/\//i.test(limpo) && padraoDeArquivo.test(limpo)
}

/** Caminho relativo ao workspace, aceitando caminho absoluto que comeca no proprio workspace. */
export function relativoAoWorkspace(caminho: string, workspace: string): string | null {
  const limpo = caminho.trim().replace(/\\/g, '/')
  if (!limpo.startsWith('/')) return limpo.replace(/^\.\//, '')
  const base = workspace.replace(/\/+$/, '')
  return limpo.startsWith(`${base}/`) ? limpo.slice(base.length + 1) : null
}

/** Endereco do daemon que serve o arquivo da sessao. */
export function enderecoDoArquivo(sessionId: string, relativo: string): string {
  const base = typeof window !== 'undefined' && window.location.origin.startsWith('http') ? window.location.origin : 'http://127.0.0.1:47311'
  return `${base}/arquivos/${sessionId}/${relativo.split('/').map(encodeURIComponent).join('/')}`
}

/** Arquivo aberto no painel de visualizacao ao lado do chat. */
export const useVisualizacao = defineStore('visualizacao', () => {
  const alvo = ref<{ sessionId: string; caminho: string; url: string } | null>(null)
  const versao = ref(0)
  const telaCheia = ref(false)

  function abrir(sessionId: string, caminho: string, url: string): void {
    alvo.value = { sessionId, caminho, url }
    versao.value++
  }

  function alternarTelaCheia(): void {
    telaCheia.value = !telaCheia.value
  }

  function recarregar(): void {
    versao.value++
  }

  function fechar(): void {
    alvo.value = null
    telaCheia.value = false
  }

  return { alvo, versao, telaCheia, abrir, recarregar, alternarTelaCheia, fechar }
})
