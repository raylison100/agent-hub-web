/** Conversao entre o construtor de horarios da interface e expressoes cron, e descricao do horario em palavras. */

export type TipoDeFrequencia = 'diario' | 'semanal' | 'intervalo' | 'uma_vez' | 'personalizado'

export interface Frequencia {
  tipo: TipoDeFrequencia
  hora: string
  dias: number[]
  intervalo: number
  janela: boolean
  janelaInicio: number
  janelaFim: number
  data: string
  cron: string
}

export const INTERVALOS: { minutos: number; rotulo: string }[] = [
  { minutos: 15, rotulo: '15 minutos' },
  { minutos: 20, rotulo: '20 minutos' },
  { minutos: 30, rotulo: '30 minutos' },
  { minutos: 60, rotulo: '1 hora' },
  { minutos: 120, rotulo: '2 horas' },
  { minutos: 180, rotulo: '3 horas' },
  { minutos: 360, rotulo: '6 horas' },
]

export const DIAS_DA_SEMANA: { valor: number; curto: string; nome: string; plural: string }[] = [
  { valor: 1, curto: 'Seg', nome: 'segunda', plural: 'segundas' },
  { valor: 2, curto: 'Ter', nome: 'terça', plural: 'terças' },
  { valor: 3, curto: 'Qua', nome: 'quarta', plural: 'quartas' },
  { valor: 4, curto: 'Qui', nome: 'quinta', plural: 'quintas' },
  { valor: 5, curto: 'Sex', nome: 'sexta', plural: 'sextas' },
  { valor: 6, curto: 'Sáb', nome: 'sábado', plural: 'sábados' },
  { valor: 0, curto: 'Dom', nome: 'domingo', plural: 'domingos' },
]

const MINUTOS_DE_INTERVALO = [15, 20, 30]
const HORAS_DE_INTERVALO = [2, 3, 6]

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0')
}

function hoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`
}

/** Frequencia inicial para uma rotina nova: todo dia as 08:00. */
export function frequenciaPadrao(): Frequencia {
  return { tipo: 'diario', hora: '08:00', dias: [1, 2, 3, 4, 5], intervalo: 60, janela: false, janelaInicio: 9, janelaFim: 18, data: hoje(), cron: '0 8 * * *' }
}

function inteiro(texto: string, min: number, max: number): number | null {
  if (!/^\d{1,2}$/.test(texto)) return null
  const n = Number(texto)
  return n >= min && n <= max ? n : null
}

function faixaDeHoras(texto: string): [number, number] | null {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(texto)
  if (!m) return null
  const a = inteiro(m[1]!, 0, 23)
  const b = inteiro(m[2]!, 0, 23)
  return a !== null && b !== null && a < b ? [a, b] : null
}

/** Le a lista de dias da semana do cron (aceita listas, faixas e 7 como domingo). */
export function lerDias(texto: string): number[] | null {
  const dias = new Set<number>()
  for (const parte of texto.split(',')) {
    const faixa = /^(\d)-(\d)$/.exec(parte)
    if (faixa) {
      const a = Number(faixa[1])
      const b = Number(faixa[2])
      if (a > b || b > 7) return null
      for (let d = a; d <= b; d++) dias.add(d % 7)
      continue
    }
    const n = inteiro(parte, 0, 7)
    if (n === null) return null
    dias.add(n % 7)
  }
  return dias.size ? [...dias].sort((x, y) => x - y) : null
}

/** Escreve os dias da semana no cron, juntando sequencias de tres ou mais dias em faixas. */
export function escreverDias(dias: number[]): string {
  const ordenados = [...new Set(dias.map((d) => d % 7))].sort((a, b) => a - b)
  const partes: string[] = []
  let i = 0
  while (i < ordenados.length) {
    let j = i
    while (j + 1 < ordenados.length && ordenados[j + 1] === ordenados[j]! + 1) j++
    if (j - i >= 2) partes.push(`${ordenados[i]}-${ordenados[j]}`)
    else for (let k = i; k <= j; k++) partes.push(String(ordenados[k]))
    i = j + 1
  }
  return partes.join(',')
}

function lerHora(hora: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora)
  if (!m) return null
  const h = inteiro(m[1]!, 0, 23)
  const min = inteiro(m[2]!, 0, 59)
  return h !== null && min !== null ? [h, min] : null
}

/** Converte a frequencia do construtor em cron. Retorna null para "uma vez" ou horario invalido. */
export function frequenciaParaCron(f: Frequencia): string | null {
  if (f.tipo === 'personalizado') return f.cron.trim() || null
  if (f.tipo === 'uma_vez') return null
  if (f.tipo === 'intervalo') {
    const janela = f.janela ? `${f.janelaInicio}-${f.janelaFim}` : '*'
    if (f.janela && !(f.janelaInicio < f.janelaFim)) return null
    if (f.intervalo < 60) return `*/${f.intervalo} ${janela} * * *`
    if (f.intervalo === 60) return `0 ${janela} * * *`
    return `0 ${janela}/${f.intervalo / 60} * * *`
  }
  const hm = lerHora(f.hora)
  if (!hm) return null
  if (f.tipo === 'diario') return `${hm[1]} ${hm[0]} * * *`
  if (!f.dias.length) return null
  return `${hm[1]} ${hm[0]} * * ${escreverDias(f.dias)}`
}

/** Converte a data e hora de "uma vez" em epoch ms no horario local do navegador. */
export function frequenciaParaAt(f: Frequencia): number | null {
  if (f.tipo !== 'uma_vez' || !/^\d{4}-\d{2}-\d{2}$/.test(f.data) || !lerHora(f.hora)) return null
  const ts = new Date(`${f.data}T${f.hora}:00`).getTime()
  return Number.isNaN(ts) ? null : ts
}

/** Monta a frequencia do construtor a partir de um cron ou at; cai em personalizado quando o formato nao e reconhecido. */
export function lerFrequencia(horario: { cron?: string; at?: number }): Frequencia {
  const base = frequenciaPadrao()
  if (horario.at !== undefined && horario.at !== null) {
    const d = new Date(horario.at)
    return {
      ...base,
      tipo: 'uma_vez',
      data: `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`,
      hora: `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`,
      cron: '',
    }
  }
  const cron = (horario.cron ?? '').trim()
  const personalizado: Frequencia = { ...base, tipo: 'personalizado', cron }
  const campos = cron.split(/\s+/)
  if (campos.length !== 5) return personalizado
  const [min, hora, diaDoMes, mes, diaDaSemana] = campos as [string, string, string, string, string]
  if (diaDoMes !== '*' || mes !== '*') return personalizado

  const m = inteiro(min, 0, 59)
  const h = inteiro(hora, 0, 23)
  if (m !== null && h !== null) {
    const horaTexto = `${doisDigitos(h)}:${doisDigitos(m)}`
    if (diaDaSemana === '*') return { ...base, tipo: 'diario', hora: horaTexto, cron }
    const dias = lerDias(diaDaSemana)
    if (!dias) return personalizado
    return { ...base, tipo: 'semanal', hora: horaTexto, dias, cron }
  }
  if (diaDaSemana !== '*') return personalizado

  const cadaMinuto = /^\*\/(\d+)$/.exec(min)
  if (cadaMinuto && MINUTOS_DE_INTERVALO.includes(Number(cadaMinuto[1]))) {
    const intervalo = Number(cadaMinuto[1])
    if (hora === '*') return { ...base, tipo: 'intervalo', intervalo, janela: false, cron }
    const faixa = faixaDeHoras(hora)
    if (faixa) return { ...base, tipo: 'intervalo', intervalo, janela: true, janelaInicio: faixa[0], janelaFim: faixa[1], cron }
    return personalizado
  }
  if (min !== '0') return personalizado
  if (hora === '*') return { ...base, tipo: 'intervalo', intervalo: 60, janela: false, cron }
  const faixaSimples = faixaDeHoras(hora)
  if (faixaSimples) return { ...base, tipo: 'intervalo', intervalo: 60, janela: true, janelaInicio: faixaSimples[0], janelaFim: faixaSimples[1], cron }
  const cadaHora = /^(\*|\d{1,2}-\d{1,2})\/(\d+)$/.exec(hora)
  if (cadaHora && HORAS_DE_INTERVALO.includes(Number(cadaHora[2]))) {
    const intervalo = Number(cadaHora[2]) * 60
    if (cadaHora[1] === '*') return { ...base, tipo: 'intervalo', intervalo, janela: false, cron }
    const faixa = faixaDeHoras(cadaHora[1]!)
    if (faixa) return { ...base, tipo: 'intervalo', intervalo, janela: true, janelaInicio: faixa[0], janelaFim: faixa[1], cron }
  }
  return personalizado
}

function juntar(itens: string[]): string {
  if (itens.length <= 1) return itens.join('')
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

function descreverDias(dias: number[]): string {
  const chave = dias.join(',')
  if (dias.length === 7) return 'Todo dia'
  if (chave === '1,2,3,4,5') return 'De segunda a sexta'
  if (chave === '1,2,3,4,5,6') return 'De segunda a sábado'
  if (chave === '0,6') return 'Aos sábados e domingos'
  const nomes = DIAS_DA_SEMANA.filter((d) => dias.includes(d.valor))
  if (nomes.length === 1) {
    const d = nomes[0]!
    return d.valor === 0 || d.valor === 6 ? `Todo ${d.nome}` : `Toda ${d.nome}`
  }
  return `Às ${juntar(nomes.map((d) => d.plural))}`
}

function descreverIntervalo(minutos: number): string {
  if (minutos < 60) return `A cada ${minutos} minutos`
  if (minutos === 60) return 'A cada hora'
  return `A cada ${minutos / 60} horas`
}

/** Descreve o horario de uma rotina em palavras, por exemplo "Todo dia às 11:00". */
export function descreverHorario(horario: { cron?: string; at?: number }): string {
  const f = lerFrequencia(horario)
  if (f.tipo === 'uma_vez') {
    const d = new Date(horario.at!)
    const ano = d.getFullYear() !== new Date().getFullYear() ? `/${d.getFullYear()}` : ''
    return `Uma vez em ${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}${ano} às ${f.hora}`
  }
  if (f.tipo === 'diario') return `Todo dia às ${f.hora}`
  if (f.tipo === 'semanal') return `${descreverDias(f.dias)} às ${f.hora}`
  if (f.tipo === 'intervalo') {
    const texto = descreverIntervalo(f.intervalo)
    return f.janela ? `${texto}, das ${f.janelaInicio}h às ${f.janelaFim}h` : texto
  }
  const mensal = /^(\d{1,2}) (\d{1,2}) (\d{1,2}) \* \*$/.exec(horario.cron?.trim() ?? '')
  if (mensal) return `Todo mês no dia ${Number(mensal[3])} às ${doisDigitos(Number(mensal[2]))}:${doisDigitos(Number(mensal[1]))}`
  return 'Horário personalizado'
}

/** Transforma o id de uma rotina em nome legivel: troca hifens por espacos e poe a primeira letra maiuscula. */
export function nomeDaRotina(id: string): string {
  const texto = id.replace(/-+/g, ' ').trim()
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : id
}

/** Sugere um id valido a partir de um nome livre: sem acentos, minusculo e com hifens. */
export function sugerirId(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
}

export const PADRAO_DO_ID = /^[a-z0-9][a-z0-9-]*$/

/** Formata um instante como "qua 16/09 11:00". */
export function formatarExecucao(ts: number): string {
  const d = new Date(ts)
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return `${dia} ${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)} ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`
}
