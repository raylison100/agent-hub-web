<script setup lang="ts">
import type { AgentSummary, EstadoDoCanal, RoleSummary, ScheduleSpec } from '@agent-hub/core'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Field from '../components/ui/Field.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import WorkspacePicker from '../components/WorkspacePicker.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { avisar, confirmar, mensagemDeErro, useAcao } from '../ui/feedback'
import {
  DIAS_DA_SEMANA,
  INTERVALOS,
  PADRAO_DO_ID,
  formatarExecucao,
  frequenciaPadrao,
  frequenciaParaAt,
  frequenciaParaCron,
  lerFrequencia,
  nomeDaRotina,
  sugerirId,
  type Frequencia,
  type TipoDeFrequencia,
} from '../ui/horarios'

const props = defineProps<{ id: string }>()
const router = useRouter()
const criando = computed(() => props.id === 'nova')
const { ocupado, executar } = useAcao()

const FUSO_PADRAO = 'America/Sao_Paulo'
const fusoDoNavegador = Intl.DateTimeFormat().resolvedOptions().timeZone

const TIPOS: { valor: TipoDeFrequencia; rotulo: string }[] = [
  { valor: 'diario', rotulo: 'Todo dia' },
  { valor: 'semanal', rotulo: 'Dias da semana' },
  { valor: 'intervalo', rotulo: 'A cada X minutos/horas' },
  { valor: 'uma_vez', rotulo: 'Uma vez' },
  { valor: 'personalizado', rotulo: 'Personalizado' },
]
const HORAS = Array.from({ length: 24 }, (_, h) => h)

interface Formulario {
  nome: string
  id: string
  role: string
  agent: string
  prompt: string
  workspace: string
  freq: Frequencia
  timezone: string
  notify: string[]
  mode: 'normal' | 'draft'
  run_usd: number | string
  day_usd: number | string
  overlap: 'skip' | 'queue'
  missed: 'skip' | 'run_once'
  enabled: boolean
}

function formularioVazio(): Formulario {
  return {
    nome: '',
    id: '',
    role: '',
    agent: '',
    prompt: '',
    workspace: '',
    freq: frequenciaPadrao(),
    timezone: FUSO_PADRAO,
    notify: [],
    mode: 'draft',
    run_usd: 0.2,
    day_usd: 0.5,
    overlap: 'skip',
    missed: 'skip',
    enabled: true,
  }
}

const form = reactive<Formulario>(formularioVazio())
const carregando = ref(true)
const erroDeCarga = ref('')
const naoEncontrada = ref(false)
const origem = ref<'file' | 'db' | null>(null)
const idSegueNome = ref(true)
const avancadoAberto = ref(false)
const erros = reactive<Record<string, string>>({})
const agentes = ref<AgentSummary[]>([])
const papeis = ref<RoleSummary[]>([])
const canais = ref<EstadoDoCanal[]>([])
const raizes = ref<string[]>([])
const previa = reactive<{ proximas: number[]; erro: string; carregando: boolean }>({ proximas: [], erro: '', carregando: false })
const retrato = ref('')
const liberarSaida = ref(false)
const topo = ref<HTMLElement | null>(null)

const sujo = computed(() => !carregando.value && retrato.value !== '' && JSON.stringify(form) !== retrato.value)
const papelEscolhido = computed(() => papeis.value.find((p) => p.name === form.role) ?? null)
const cronAtual = computed(() => frequenciaParaCron(form.freq))
const atAtual = computed(() => frequenciaParaAt(form.freq))
const fusos = computed(() => [...new Set([FUSO_PADRAO, 'UTC', fusoDoNavegador, form.timezone].filter(Boolean))])
const notifySelecionado = computed({
  get: () => (form.notify.length > 1 ? '__varios' : (form.notify[0] ?? '')),
  set: (valor: string) => {
    if (valor === '__varios') return
    form.notify = valor ? [valor] : []
  },
})
const notifyOriginal = ref<string[]>([])

function nomeDoCanal(id: string): string {
  return canais.value.find((c) => c.id === id)?.nome ?? id
}

function descreverCanal(c: EstadoDoCanal): string {
  return c.conta ? `${c.nome} — ${c.tipo} · ${c.conta}` : `${c.nome} — ${c.tipo}`
}

function erroDoHorarioLocal(): string {
  const f = form.freq
  if (f.tipo === 'uma_vez') {
    if (atAtual.value === null) return 'Escolha a data e a hora.'
    if (atAtual.value <= Date.now()) return 'Escolha uma data e hora no futuro.'
    return ''
  }
  if (f.tipo === 'semanal' && !f.dias.length) return 'Escolha pelo menos um dia.'
  if (f.tipo === 'intervalo' && f.janela && !(f.janelaInicio < f.janelaFim)) return 'O horário de início precisa ser antes do fim.'
  if (f.tipo === 'personalizado' && !f.cron.trim()) return 'Escreva o horário no formato avançado.'
  if (cronAtual.value === null) return 'Escolha um horário válido.'
  return ''
}

let temporizadorDaPrevia: ReturnType<typeof setTimeout> | null = null
let pedidoDaPrevia = 0

/** Pede ao daemon as proximas execucoes do horario atual, com espera curta entre alteracoes. */
function agendarPrevia(): void {
  if (temporizadorDaPrevia) clearTimeout(temporizadorDaPrevia)
  const local = erroDoHorarioLocal()
  if (local) {
    previa.proximas = []
    previa.erro = local
    previa.carregando = false
    return
  }
  previa.carregando = true
  temporizadorDaPrevia = setTimeout(async () => {
    const numero = ++pedidoDaPrevia
    const frame = form.freq.tipo === 'uma_vez'
      ? ({ type: 'schedule.preview', at: atAtual.value!, timezone: form.timezone } as const)
      : ({ type: 'schedule.preview', cron: cronAtual.value!, timezone: form.timezone } as const)
    try {
      const res = await client.request(frame, 'schedule.preview')
      if (numero !== pedidoDaPrevia) return
      previa.proximas = res.next
      previa.erro = res.erro ?? ''
    } catch (err) {
      if (numero !== pedidoDaPrevia) return
      previa.proximas = []
      previa.erro = mensagemDeErro(err)
    } finally {
      if (numero === pedidoDaPrevia) previa.carregando = false
    }
  }, 400)
}

watch(() => [JSON.stringify(form.freq), form.timezone], agendarPrevia)

watch(
  () => form.nome,
  (nome) => {
    if (idSegueNome.value) form.id = sugerirId(nome)
  },
)

function aoDigitarNome(): void {
  if (!idSegueNome.value && !criando.value) idSegueNome.value = true
}

function aoEditarId(): void {
  idSegueNome.value = false
}

function aoEscolherPapel(): void {
  const papel = papelEscolhido.value
  if (!papel) return
  const modelo = papel.models.find((m) => agentes.value.some((a) => a.name === m))
  if (modelo) form.agent = modelo
}

function aoEscolherTipo(tipo: TipoDeFrequencia): void {
  if (tipo === 'personalizado' && !form.freq.cron.trim() && cronAtual.value) form.freq.cron = cronAtual.value
  form.freq.tipo = tipo
}

function alternarDia(dia: number): void {
  const dias = form.freq.dias
  form.freq.dias = dias.includes(dia) ? dias.filter((d) => d !== dia) : [...dias, dia].sort((a, b) => a - b)
}

function preencher(s: ScheduleSpec): void {
  Object.assign(form, {
    nome: nomeDaRotina(s.id),
    id: s.id,
    role: s.role ?? '',
    agent: s.agent,
    prompt: s.prompt,
    workspace: s.workspace,
    freq: lerFrequencia(s),
    timezone: s.timezone || FUSO_PADRAO,
    notify: [...(s.notify ?? [])],
    mode: s.mode,
    run_usd: s.budget.run_usd,
    day_usd: s.budget.day_usd,
    overlap: s.overlap,
    missed: s.missed,
    enabled: s.enabled,
  })
  notifyOriginal.value = [...(s.notify ?? [])]
}

async function carregarApoio(): Promise<void> {
  await Promise.all([
    client
      .request({ type: 'agents.list' }, 'agents.list')
      .then((r) => {
        agentes.value = r.agents
        papeis.value = r.roles
      })
      .catch(() => undefined),
    client
      .request({ type: 'canais.estado' }, 'canais.estado')
      .then((r) => (canais.value = r.canais))
      .catch(() => undefined),
    client
      .request({ type: 'workspace.roots' }, 'workspace.roots')
      .then((r) => (raizes.value = r.roots))
      .catch(() => undefined),
  ])
}

async function carregar(): Promise<void> {
  carregando.value = true
  erroDeCarga.value = ''
  naoEncontrada.value = false
  try {
    await useConnection().whenOnline().catch(() => undefined)
    const apoio = carregarApoio()
    if (criando.value) {
      Object.assign(form, formularioVazio())
      idSegueNome.value = true
      await apoio
    } else {
      const [lista] = await Promise.all([client.request({ type: 'schedule.list' }, 'schedule.list'), apoio])
      const rotina = lista.schedules.find((s) => s.id === props.id)
      if (!rotina) {
        naoEncontrada.value = true
        return
      }
      origem.value = rotina.source
      idSegueNome.value = false
      preencher(rotina)
    }
    await nextTick()
    retrato.value = JSON.stringify(form)
    agendarPrevia()
  } catch (err) {
    erroDeCarga.value = mensagemDeErro(err)
  } finally {
    carregando.value = false
  }
}

function numeroValido(valor: number | string): boolean {
  if (valor === '' || valor === null) return false
  const n = Number(valor)
  return Number.isFinite(n) && n >= 0
}

function validar(): boolean {
  for (const chave of Object.keys(erros)) delete erros[chave]
  if (!form.id) erros.nome = 'Dê um nome para a rotina.'
  else if (!PADRAO_DO_ID.test(form.id)) {
    erros.nome = 'O identificador só pode ter letras minúsculas sem acento, números e hífens, começando por letra ou número.'
    erros.id = erros.nome
  }
  if (!form.agent) erros.agent = 'Escolha o modelo que o agente vai usar.'
  if (!form.prompt.trim()) erros.prompt = 'Escreva o que o agente deve fazer.'
  if (!form.workspace.trim()) erros.workspace = 'Escolha a pasta do projeto.'
  const horario = erroDoHorarioLocal()
  if (horario) erros.horario = horario
  if (!numeroValido(form.run_usd)) erros.run_usd = 'Informe um valor igual ou maior que zero.'
  if (!numeroValido(form.day_usd)) erros.day_usd = 'Informe um valor igual ou maior que zero.'
  if (!form.timezone) erros.timezone = 'Escolha o fuso horário.'
  return Object.keys(erros).length === 0
}

async function focarPrimeiroErro(): Promise<void> {
  if (erros.timezone || (erros.id && !erros.nome)) avancadoAberto.value = true
  await nextTick()
  const campo = topo.value?.querySelector<HTMLElement>('.ui-field.com-erro')
  if (!campo) return
  campo.scrollIntoView({ behavior: 'smooth', block: 'center' })
  campo.querySelector<HTMLElement>('input, select, textarea, button')?.focus({ preventScroll: true })
}

function montarSpec(): ScheduleSpec {
  const spec: ScheduleSpec = {
    id: form.id,
    timezone: form.timezone,
    agent: form.agent,
    workspace: form.workspace.trim(),
    prompt: form.prompt,
    mode: form.mode,
    budget: { run_usd: Number(form.run_usd), day_usd: Number(form.day_usd) },
    overlap: form.overlap,
    missed: form.missed,
    notify: [...form.notify],
    enabled: form.enabled,
  }
  if (form.role) spec.role = form.role
  if (form.freq.tipo === 'uma_vez') spec.at = atAtual.value!
  else spec.cron = cronAtual.value!
  return spec
}

async function salvar(): Promise<void> {
  if (!validar()) {
    avisar('Confira os campos destacados.', 'erro')
    await focarPrimeiroErro()
    return
  }
  const spec = montarSpec()
  const original = !criando.value && props.id !== spec.id ? props.id : undefined
  const ok = await executar(async () => {
    await client.request({ type: 'schedule.upsert', schedule: spec, ...(original ? { original } : {}) }, 'schedule.saved')
    return true
  }, 'Rotina salva.')
  if (!ok) return
  liberarSaida.value = true
  await router.push('/settings/automacoes')
}

function rodarAgora(): void {
  try {
    client.send({ type: 'schedule.run_now', id: props.id })
    avisar(
      sujo.value
        ? 'Rotina iniciada com a versão salva. Salve para que as alterações valham nas próximas execuções.'
        : 'Rotina iniciada. O resultado aparece nas conversas e no canal de aviso.',
      'info',
    )
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  }
}

async function apagar(): Promise<void> {
  const ok = await confirmar({
    titulo: `Apagar a rotina "${nomeDaRotina(props.id)}"?`,
    detalhe: 'Ela deixa de rodar. As conversas que ela já criou continuam.',
    botao: 'Apagar rotina',
    perigo: true,
  })
  if (!ok) return
  const feito = await executar(async () => {
    await client.request({ type: 'schedule.delete', id: props.id }, 'schedule.deleted')
    return true
  }, 'Rotina apagada.')
  if (!feito) return
  liberarSaida.value = true
  await router.push('/settings/automacoes')
}

function voltar(): void {
  void router.push('/settings/automacoes')
}

onBeforeRouteLeave(async () => {
  if (liberarSaida.value || !sujo.value) return true
  return confirmar({ titulo: 'Descartar alterações?', detalhe: 'O que você mudou nesta rotina ainda não foi salvo.', botao: 'Descartar', perigo: true })
})

onMounted(() => void carregar())
onUnmounted(() => {
  if (temporizadorDaPrevia) clearTimeout(temporizadorDaPrevia)
})
</script>

<template>
  <div ref="topo" class="ui-page">
    <PageHeader :titulo="criando ? 'Nova rotina' : 'Editar rotina'" :descricao="criando ? 'Escolha o que o agente faz, quando roda e onde avisa.' : nomeDaRotina(props.id)">
      <template #acoes>
        <RouterLink to="/settings/automacoes" class="ui-link-botao">Voltar</RouterLink>
      </template>
    </PageHeader>

    <EmptyState v-if="carregando" titulo="Carregando" carregando />
    <EmptyState v-else-if="erroDeCarga" titulo="Não consegui carregar a rotina" :texto="erroDeCarga">
      <button @click="carregar">Tentar de novo</button>
    </EmptyState>
    <EmptyState v-else-if="naoEncontrada" titulo="Rotina não encontrada" texto="Ela pode ter sido apagada ou renomeada.">
      <button class="primary" @click="voltar">Ver rotinas</button>
    </EmptyState>

    <form v-else class="rotina-editor" novalidate @submit.prevent="salvar">
      <Card titulo="O que fazer">
        <p v-if="origem === 'file'" class="muted small rotina-nota">Esta rotina vem de um arquivo de configuração.</p>
        <div class="ui-form duas-colunas">
          <Field rotulo="Nome" obrigatorio :erro="erros.nome" :ajuda="form.id ? `Identificador: ${form.id}` : 'Por exemplo: Resumo diário'">
            <input v-model="form.nome" type="text" placeholder="Resumo diário" autocomplete="off" @input="aoDigitarNome" />
          </Field>
          <Field rotulo="Agente" :ajuda="papelEscolhido?.description || 'O papel define como o agente trabalha.'">
            <select v-model="form.role" @change="aoEscolherPapel">
              <option value="">Nenhum em especial</option>
              <option v-for="p in papeis" :key="p.name" :value="p.name">{{ p.description ? `${p.name} — ${p.description}` : p.name }}</option>
            </select>
          </Field>
          <Field rotulo="Modelo" obrigatorio :erro="erros.agent" ajuda="O agente usa este modelo">
            <select v-model="form.agent">
              <option value="" disabled>Escolha um modelo</option>
              <option v-if="form.agent && !agentes.some((a) => a.name === form.agent)" :value="form.agent">{{ form.agent }}</option>
              <option v-for="a in agentes" :key="a.name" :value="a.name">{{ a.description ? `${a.name} — ${a.description}` : a.name }}</option>
            </select>
          </Field>
          <div :class="['ui-field', { 'com-erro': erros.workspace }]">
            <span class="ui-field-rotulo">Pasta do projeto<span class="ui-field-obrigatorio" aria-hidden="true"> *</span></span>
            <div class="rotina-pasta">
              <input v-model="form.workspace" type="text" list="rotina-raizes" placeholder="Escolha ou digite o caminho" spellcheck="false" aria-label="Pasta do projeto" />
              <WorkspacePicker v-model="form.workspace" />
            </div>
            <datalist id="rotina-raizes">
              <option v-for="r in raizes" :key="r" :value="r" />
            </datalist>
            <span v-if="erros.workspace" class="ui-field-erro">{{ erros.workspace }}</span>
            <span v-else class="ui-field-ajuda">Onde o agente trabalha.</span>
          </div>
          <Field class="rotina-largo" rotulo="Instruções para o agente" obrigatorio :erro="erros.prompt" ajuda="O que o agente deve fazer a cada execução.">
            <textarea v-model="form.prompt" rows="8" placeholder="Por exemplo: leia os e-mails não respondidos e me mande um resumo."></textarea>
          </Field>
        </div>
      </Card>

      <Card titulo="Quando rodar">
        <div :class="['ui-field', { 'com-erro': erros.horario }]">
          <div class="ui-segmentos" role="radiogroup" aria-label="Frequência">
            <label v-for="t in TIPOS" :key="t.valor" :class="['ui-segmento', { ativo: form.freq.tipo === t.valor }]">
              <input type="radio" name="rotina-frequencia" :value="t.valor" :checked="form.freq.tipo === t.valor" @change="aoEscolherTipo(t.valor)" />
              {{ t.rotulo }}
            </label>
          </div>

          <div class="rotina-construtor">
            <template v-if="form.freq.tipo === 'diario'">
              <label class="rotina-inline">Às <input v-model="form.freq.hora" type="time" required /></label>
            </template>

            <template v-else-if="form.freq.tipo === 'semanal'">
              <div class="ui-dias" role="group" aria-label="Dias da semana">
                <label v-for="d in DIAS_DA_SEMANA" :key="d.valor" :class="['ui-dia', { ativo: form.freq.dias.includes(d.valor) }]">
                  <input type="checkbox" :checked="form.freq.dias.includes(d.valor)" @change="alternarDia(d.valor)" />
                  {{ d.curto }}
                </label>
              </div>
              <label class="rotina-inline">Às <input v-model="form.freq.hora" type="time" required /></label>
            </template>

            <template v-else-if="form.freq.tipo === 'intervalo'">
              <label class="rotina-inline">
                A cada
                <select v-model.number="form.freq.intervalo">
                  <option v-for="i in INTERVALOS" :key="i.minutos" :value="i.minutos">{{ i.rotulo }}</option>
                </select>
              </label>
              <div class="rotina-inline">
                <label class="rotina-inline"><input v-model="form.freq.janela" type="checkbox" /> Só entre</label>
                <select v-model.number="form.freq.janelaInicio" :disabled="!form.freq.janela" aria-label="Hora de início">
                  <option v-for="h in HORAS" :key="h" :value="h">{{ h }}h</option>
                </select>
                e
                <select v-model.number="form.freq.janelaFim" :disabled="!form.freq.janela" aria-label="Hora de fim">
                  <option v-for="h in HORAS" :key="h" :value="h">{{ h }}h</option>
                </select>
              </div>
            </template>

            <template v-else-if="form.freq.tipo === 'uma_vez'">
              <label class="rotina-inline">Em <input v-model="form.freq.data" type="date" required /></label>
              <label class="rotina-inline">às <input v-model="form.freq.hora" type="time" required /></label>
            </template>

            <template v-else>
              <label class="rotina-inline rotina-largo">
                <input v-model="form.freq.cron" type="text" placeholder="0 8 * * 1-5" spellcheck="false" aria-label="Expressão cron" />
              </label>
              <span class="ui-field-ajuda">Formato avançado (cron): minuto hora dia mês dia-da-semana</span>
            </template>
          </div>

          <span v-if="erros.horario" class="ui-field-erro">{{ erros.horario }}</span>
        </div>

        <p v-if="previa.erro" class="rotina-previa erro">Horário inválido: {{ previa.erro }}</p>
        <p v-else-if="previa.proximas.length" class="rotina-previa">
          Próximas execuções: {{ previa.proximas.slice(0, 3).map(formatarExecucao).join(', ') }}
        </p>
        <p v-else-if="previa.carregando" class="rotina-previa muted">Calculando as próximas execuções...</p>
        <p v-else class="rotina-previa muted">Sem próximas execuções.</p>
      </Card>

      <Card titulo="Avisos">
        <Field rotulo="Avisar o resultado em" ajuda="A resposta final do agente chega nesse canal e você pode responder por lá.">
          <select v-model="notifySelecionado">
            <option value="">Só no Agent Hub</option>
            <option v-if="form.notify.length > 1" value="__varios">{{ form.notify.map(nomeDoCanal).join(', ') }}</option>
            <option v-for="c in canais" :key="c.id" :value="c.id">{{ descreverCanal(c) }}</option>
            <option v-for="id in notifyOriginal.filter((n) => n && !canais.some((c) => c.id === n))" :key="id" :value="id">{{ id }}</option>
          </select>
        </Field>
      </Card>

      <Card titulo="Permissões e limites">
        <div class="ui-field">
          <span class="ui-field-rotulo">O agente pode</span>
          <div class="ui-opcoes" role="radiogroup" aria-label="O agente pode">
            <label class="ui-opcao">
              <input v-model="form.mode" type="radio" name="rotina-modo" value="normal" />
              Trabalhar de verdade (criar e alterar arquivos conforme as permissões do agente)
            </label>
            <label class="ui-opcao">
              <input v-model="form.mode" type="radio" name="rotina-modo" value="draft" />
              Só planejar, sem alterar nada
            </label>
          </div>
        </div>
        <div class="ui-form duas-colunas">
          <Field rotulo="Gasto máximo por execução (US$)" obrigatorio :erro="erros.run_usd">
            <input v-model="form.run_usd" type="number" step="0.1" min="0" required />
          </Field>
          <Field rotulo="Gasto máximo por dia (US$)" obrigatorio :erro="erros.day_usd">
            <input v-model="form.day_usd" type="number" step="0.1" min="0" required />
          </Field>
        </div>
      </Card>

      <Card titulo="Avançado" descricao="Detalhes que quase nunca precisam mudar.">
        <template #acoes>
          <button type="button" class="ghost" :aria-expanded="avancadoAberto" @click="avancadoAberto = !avancadoAberto">
            {{ avancadoAberto ? 'Esconder' : 'Mostrar' }}
          </button>
        </template>
        <div v-if="avancadoAberto" class="ui-form duas-colunas">
          <div class="ui-field">
            <span class="ui-field-rotulo">Se ainda estiver rodando no próximo horário</span>
            <div class="ui-opcoes" role="radiogroup">
              <label class="ui-opcao"><input v-model="form.overlap" type="radio" name="rotina-overlap" value="skip" /> Pular</label>
              <label class="ui-opcao"><input v-model="form.overlap" type="radio" name="rotina-overlap" value="queue" /> Esperar e rodar depois</label>
            </div>
          </div>
          <div class="ui-field">
            <span class="ui-field-rotulo">Se o computador estava desligado no horário</span>
            <div class="ui-opcoes" role="radiogroup">
              <label class="ui-opcao"><input v-model="form.missed" type="radio" name="rotina-missed" value="skip" /> Não rodar</label>
              <label class="ui-opcao"><input v-model="form.missed" type="radio" name="rotina-missed" value="run_once" /> Rodar uma vez ao ligar</label>
            </div>
          </div>
          <Field rotulo="Fuso horário" :erro="erros.timezone">
            <select v-model="form.timezone">
              <option v-for="z in fusos" :key="z" :value="z">{{ z === FUSO_PADRAO ? 'Horário de Brasília' : z === 'UTC' ? 'UTC' : `${z} (este computador)` }}</option>
            </select>
          </Field>
          <Field rotulo="Identificador" :erro="erros.id" ajuda="Usado internamente. Letras minúsculas, números e hífens.">
            <input v-model="form.id" type="text" spellcheck="false" autocomplete="off" @input="aoEditarId" />
          </Field>
          <p class="muted small rotina-largo rotina-tecnico">
            Expressão técnica:
            <code v-if="form.freq.tipo === 'uma_vez'">at {{ atAtual ?? '-' }}</code>
            <code v-else>cron {{ cronAtual ?? '-' }}</code>
          </p>
        </div>
      </Card>

      <Card>
        <div class="rotina-ativa">
          <span class="ui-lista-item-texto">
            <strong>Rotina ativa</strong>
            <span class="muted">Desligada, ela fica salva mas não roda nos horários.</span>
          </span>
          <button
            type="button"
            role="switch"
            :aria-checked="form.enabled"
            :class="['ui-interruptor', { ligado: form.enabled }]"
            @click="form.enabled = !form.enabled"
          >
            <span class="ui-interruptor-trilho" aria-hidden="true"><span class="ui-interruptor-bola"></span></span>
            {{ form.enabled ? 'Ligada' : 'Desligada' }}
          </button>
        </div>
      </Card>

      <div class="rotina-rodape">
        <button type="submit" class="primary" :disabled="ocupado">{{ ocupado ? 'Salvando...' : 'Salvar rotina' }}</button>
        <button type="button" :disabled="ocupado" @click="voltar">Cancelar</button>
        <span class="rotina-rodape-espaco"></span>
        <template v-if="!criando">
          <button type="button" :disabled="ocupado" @click="rodarAgora">Rodar agora</button>
          <button type="button" class="danger" :disabled="ocupado" @click="apagar">Apagar rotina</button>
        </template>
      </div>
    </form>
  </div>
</template>
