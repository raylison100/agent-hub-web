import type { ServerFrame } from '@agent-hub/core'

export type StatusDeGasto = Extract<ServerFrame, { type: 'cost.status' }>
export type TabelaDePrecos = Extract<ServerFrame, { type: 'pricing' }>
export type Aba = 'resumo' | 'limites' | 'precos' | 'relatorio'

const dolar2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dolar4 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 })
const decimal1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/** Formata um valor em dólares no padrão brasileiro, com mais casas para valores muito pequenos. */
export function usd(valor: number): string {
  const texto = valor > 0 && valor < 0.01 ? dolar4.format(valor) : dolar2.format(valor)
  return texto.replace(/ /g, ' ')
}

/** Abrevia quantidades de tokens: 12,3 mil, 1,2 mi. */
export function tokens(valor: number): string {
  if (valor >= 1_000_000) return `${decimal1.format(valor / 1_000_000)} mi`
  if (valor >= 1_000) return `${decimal1.format(valor / 1_000)} mil`
  return inteiro.format(valor)
}

/** Formata um número inteiro com separador de milhar. */
export function numeroInteiro(valor: number): string {
  return inteiro.format(valor)
}

/** Converte uma data aaaa-mm-dd em dd/mm/aaaa. */
export function dataCompleta(texto: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : texto
}

/** Converte uma data aaaa-mm-dd em dd/mm. */
export function diaEMes(texto: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto)
  return m ? `${m[3]}/${m[2]}` : texto
}

/** Lê um valor digitado em dólares: vazio vira null, texto inválido vira NaN. */
export function lerValor(texto: string): number | null {
  const limpo = texto.trim()
  if (limpo === '') return null
  const n = Number(limpo.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

/** Mostra um número guardado como texto editável, com vírgula decimal. */
export function paraCampo(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '' : String(valor).replace('.', ',')
}

/** Percentual de uso de um limite, entre 0 e 100 ou mais. */
export function percentual(valor: number, limite: number | null | undefined): number {
  if (limite === null || limite === undefined) return 0
  if (limite <= 0) return valor > 0 ? 100 : 0
  return (valor / limite) * 100
}
