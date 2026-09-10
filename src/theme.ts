export type Tema = 'sistema' | 'claro' | 'escuro'
export type Densidade = 'confortavel' | 'compacta'
export type Tamanho = 'pequena' | 'media' | 'grande'

export interface Aparencia {
  tema: Tema
  acento: string
  tamanho: Tamanho
  densidade: Densidade
  fonte: string
}

export const acentos: { nome: string; valor: string }[] = [
  { nome: 'Azul', valor: '#4f86f7' },
  { nome: 'Violeta', valor: '#8b7cf6' },
  { nome: 'Verde', valor: '#3ccf91' },
  { nome: 'Laranja', valor: '#e07a4f' },
  { nome: 'Rosa', valor: '#e0679f' },
]

export const fontes: { nome: string; valor: string }[] = [
  { nome: 'Sistema', valor: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' },
  { nome: 'Serifada', valor: 'Georgia, Cambria, "Times New Roman", serif' },
  { nome: 'Monoespacada', valor: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
]

export const padrao: Aparencia = {
  tema: 'sistema',
  acento: acentos[0]!.valor,
  tamanho: 'media',
  densidade: 'confortavel',
  fonte: fontes[0]!.valor,
}

const chave = 'agent-hub.aparencia'

export function carregar(): Aparencia {
  try {
    const salvo = localStorage.getItem(chave)
    return salvo ? { ...padrao, ...(JSON.parse(salvo) as Partial<Aparencia>) } : { ...padrao }
  } catch {
    return { ...padrao }
  }
}

export function salvar(a: Aparencia): void {
  try {
    localStorage.setItem(chave, JSON.stringify(a))
  } catch {
    return
  }
}

/** Aplica a aparencia no elemento raiz, de onde todo o CSS le os tokens. */
export function aplicar(a: Aparencia): void {
  const raiz = document.documentElement
  raiz.dataset.tema = a.tema
  raiz.classList.toggle('tema-claro', a.tema === 'claro')
  raiz.classList.toggle('tema-escuro', a.tema === 'escuro')
  raiz.dataset.densidade = a.densidade
  raiz.dataset.tamanho = a.tamanho
  raiz.style.setProperty('--accent', a.acento)
  raiz.style.setProperty('--font-ui', a.fonte)
}
