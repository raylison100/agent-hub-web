/** Traducoes dos valores tecnicos do protocolo para textos que a pessoa entende. */

export const rotuloDoRisco: Record<string, string> = {
  read: 'Só leitura',
  write: 'Altera arquivos',
  exec: 'Executa comandos',
}

export const rotuloDoModoDeRotina: Record<string, string> = {
  draft: 'Só planeja, sem mexer em arquivos',
  normal: 'Pode trabalhar de verdade',
}

export const rotuloDaOrigem: Record<string, string> = {
  file: 'Arquivo de configuração',
  db: 'Criada pela interface',
}

export const rotuloDoTipoDeAutomacao: Record<string, string> = {
  schedule: 'Rotina',
  trigger: 'Gatilho',
}

export const rotuloDoFimDoRun: Record<string, string> = {
  end: 'Concluído',
  cancelled: 'Cancelado',
  error: 'Erro',
  budget_exceeded: 'Limite de gasto atingido',
  max_steps: 'Limite de passos atingido',
  max_output: 'Resposta longa demais',
  refusal: 'Recusado pelo modelo',
  tool_call_invalid: 'Ferramenta chamada errado',
}

export function rotulo(mapa: Record<string, string>, valor: string | null | undefined): string {
  if (!valor) return ''
  return mapa[valor] ?? valor
}
