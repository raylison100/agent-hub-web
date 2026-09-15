import { rotuloDoRisco } from './rotulos'

export interface AprovacaoLegivel {
  titulo: string
  risco: string
  itens: { rotulo: string; valor: string; codigo?: boolean }[]
  previa?: string
}

const acoesNativas: Record<string, { titulo: string; campos: Record<string, string> }> = {
  read_file: { titulo: 'Ler um arquivo', campos: { path: 'Arquivo' } },
  list_dir: { titulo: 'Listar uma pasta', campos: { path: 'Pasta' } },
  search: { titulo: 'Procurar nos arquivos', campos: { pattern: 'Busca', path: 'Onde' } },
  write_file: { titulo: 'Criar ou substituir um arquivo', campos: { path: 'Arquivo' } },
  edit_file: { titulo: 'Editar um arquivo', campos: { path: 'Arquivo' } },
  run_command: { titulo: 'Rodar um comando no terminal', campos: { command: 'Comando', cwd: 'Pasta' } },
  git: { titulo: 'Rodar um comando do git', campos: { args: 'Comando', cwd: 'Pasta' } },
  memory_write: { titulo: 'Gravar na memória do projeto', campos: { name: 'Nome', description: 'Descrição' } },
  spec_write: { titulo: 'Gravar uma especificação do projeto', campos: { name: 'Nome' } },
}

function texto(valor: unknown): string {
  if (valor === undefined || valor === null) return ''
  if (typeof valor === 'string') return valor
  if (Array.isArray(valor)) return valor.map(texto).join(' ')
  return JSON.stringify(valor)
}

function legivel(nome: string): string {
  return nome.replace(/^browser_/, '').replace(/[_-]+/g, ' ')
}

/** Transforma o pedido de aprovacao de uma ferramenta num resumo legivel, sem JSON cru. */
export function aprovacaoLegivel(ferramenta: string, args: unknown, risco: string): AprovacaoLegivel {
  const dados = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>
  const nativa = acoesNativas[ferramenta]
  const itens: AprovacaoLegivel['itens'] = []
  let titulo: string
  if (nativa) {
    titulo = nativa.titulo
    for (const [chave, rotulo] of Object.entries(nativa.campos)) {
      const valor = texto(dados[chave])
      if (valor) itens.push({ rotulo, valor, codigo: chave === 'command' || chave === 'args' || chave === 'path' || chave === 'cwd' })
    }
  } else {
    const [servidor, acao] = ferramenta.includes('__') ? ferramenta.split('__', 2) : ['', ferramenta]
    titulo = servidor ? `Usar "${legivel(acao ?? '')}" do conector ${servidor}` : `Usar a ferramenta ${legivel(ferramenta)}`
    for (const [chave, valor] of Object.entries(dados).slice(0, 6)) {
      const t = texto(valor)
      if (t) itens.push({ rotulo: legivel(chave), valor: t.length > 240 ? `${t.slice(0, 240)}...` : t })
    }
  }
  const conteudo = texto(dados.content ?? dados.new_text ?? dados.body)
  return {
    titulo,
    risco: rotuloDoRisco[risco] ?? risco,
    itens,
    previa: conteudo ? conteudo.split('\n').slice(0, 12).join('\n') : undefined,
  }
}
