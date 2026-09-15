<script setup lang="ts">
import type { CanalId, EstadoDoCanal, ServerFrame, TipoDeCanalResumo } from '@agent-hub/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Field from '../components/ui/Field.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { imageSrc } from '../stores/sessions'
import { avisar, confirmar } from '../ui/feedback'

const tipos = ref<TipoDeCanalResumo[]>([])
const canais = ref<EstadoDoCanal[]>([])
const selecionado = ref<string>('')
const valores = ref<Record<string, string>>({})
const padrao = ref({ nome: '', agente: '', papel: '', workspace: '' })
const novo = ref<{ tipo: CanalId; nome: string } | null>(null)
const erro = ref('')
const aviso = ref('')
const ocupado = ref(false)
const carregando = ref(true)

const atual = computed(() => canais.value.find((c) => c.id === selecionado.value))

function receber(f: Extract<ServerFrame, { type: 'canais.estado' }>): void {
  tipos.value = f.tipos
  canais.value = f.canais
  if (f.aviso) avisar(f.aviso)
  if (f.criado) selecionado.value = f.criado
  if (!canais.value.some((c) => c.id === selecionado.value)) selecionado.value = canais.value[0]?.id ?? ''
}

async function pedir(frame: Parameters<typeof client.request>[0]): Promise<boolean> {
  erro.value = ''
  aviso.value = ''
  ocupado.value = true
  try {
    receber(await client.request(frame, 'canais.estado', 30000))
    return true
  } catch (err) {
    erro.value = err instanceof Error ? err.message : String(err)
    avisar(erro.value, 'erro')
    return false
  } finally {
    ocupado.value = false
  }
}

async function criar(): Promise<void> {
  if (!novo.value) return
  if (await pedir({ type: 'canal.criar', tipo: novo.value.tipo, nome: novo.value.nome })) novo.value = null
}

async function salvar(): Promise<void> {
  if (!atual.value) return
  const trocandoSegredo = atual.value.campos.some((c) => c.segredo && c.preenchido && valores.value[c.chave]?.trim())
  if (
    trocandoSegredo &&
    atual.value.conta &&
    !(await confirmar({
      titulo: `Trocar o bot do canal ${atual.value.nome}?`,
      detalhe: `Este canal usa ${atual.value.conta}. A credencial nova troca o bot deste canal. Para adicionar outro bot, cancele e use Novo canal.`,
      botao: 'Trocar o bot',
    }))
  )
    return
  if (await pedir({ type: 'canal.salvar', canal: atual.value.id, valores: valores.value })) valores.value = {}
}

async function salvarPadrao(): Promise<void> {
  if (!atual.value) return
  await pedir({ type: 'canal.padrao', canal: atual.value.id, ...padrao.value })
}

async function apagar(): Promise<void> {
  if (!atual.value) return
  const ok = await confirmar({
    titulo: `Apagar o canal ${atual.value.nome}?`,
    detalhe: 'As credenciais e as pessoas permitidas deste canal saem junto. Não dá para desfazer.',
    botao: 'Apagar canal',
  })
  if (ok) void pedir({ type: 'canal.apagar', canal: atual.value.id })
}

async function removerPessoa(pessoa: { id: string; nome?: string; apelido?: string }): Promise<void> {
  if (!atual.value) return
  const ok = await confirmar({ titulo: `Remover ${pessoa.apelido ?? pessoa.nome ?? pessoa.id}?`, detalhe: 'A pessoa deixa de conversar com os agentes por este canal.', botao: 'Remover' })
  if (ok) void pedir({ type: 'canal.remover_pessoa', canal: atual.value.id, pessoa: pessoa.id })
}

function nomeDoTipo(id: CanalId): string {
  return tipos.value.find((t) => t.id === id)?.nome ?? id
}

function quando(ts: number): string {
  return new Date(ts).toLocaleString()
}

type Pessoa = { id: string; nome?: string; apelido?: string; usuario?: string; foto?: string; conversa?: string }

function fotoDe(p: Pessoa): string {
  return p.foto ? imageSrc({ mediaType: 'image/jpeg', ref: p.foto }) : ''
}

function idDe(p: Pessoa): string {
  if (!atual.value) return p.id
  return atual.value.tipo === 'whatsapp' && /^\d+$/.test(p.id) ? `+${p.id}` : p.id
}

const editando = ref<string | null>(null)
const apelido = ref('')

function nomeLegivel(p: Pessoa): string | undefined {
  const nome = p.nome?.trim()
  return nome && /[\p{L}\p{N}]/u.test(nome) ? nome : undefined
}

function tituloDe(p: Pessoa): string {
  return p.apelido ?? nomeLegivel(p) ?? (p.usuario ? `@${p.usuario}` : 'Sem nome no canal')
}

function detalhesDe(p: Pessoa): { rotulo: string; valor: string }[] {
  const itens: { rotulo: string; valor: string }[] = []
  if (p.apelido && nomeLegivel(p)) itens.push({ rotulo: 'Nome no canal', valor: nomeLegivel(p)! })
  if (!nomeLegivel(p) && p.nome) itens.push({ rotulo: 'Nome no canal', valor: `${p.nome} (sem letras)` })
  if (p.usuario) itens.push({ rotulo: 'Usuário', valor: `@${p.usuario}` })
  itens.push({ rotulo: atual.value?.rotuloDoId ?? 'ID', valor: idDe(p) })
  return itens
}

function iniciais(p: Pessoa): string {
  const base = p.apelido ?? nomeLegivel(p) ?? p.usuario
  if (!base) return '?'
  return base
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('')
}

function editar(p: Pessoa): void {
  editando.value = p.id
  apelido.value = p.apelido ?? nomeLegivel(p) ?? ''
}

async function salvarApelido(pessoa: string): Promise<void> {
  if (!atual.value) return
  if (await pedir({ type: 'canal.apelidar', canal: atual.value.id, pessoa, apelido: apelido.value })) editando.value = null
}

watch(
  () => atual.value?.id,
  () => {
    valores.value = {}
  },
)

watch(
  () => (atual.value ? `${atual.value.id}|${atual.value.nome}|${JSON.stringify(atual.value.padrao)}` : ''),
  () => {
    const c = atual.value
    padrao.value = { nome: c?.nome ?? '', agente: c?.padrao.agente ?? '', papel: c?.padrao.papel ?? '', workspace: c?.padrao.workspace ?? '' }
  },
  { immediate: true },
)

let desligar: (() => void) | null = null

onMounted(async () => {
  desligar = client.on((f) => {
    if (f.type === 'canais.estado') receber({ ...f, aviso: undefined, criado: undefined })
  })
  await useConnection().whenOnline().catch(() => undefined)
  await pedir({ type: 'canais.estado' })
  carregando.value = false
})

onUnmounted(() => desligar?.())
</script>

<template>
  <div class="ui-page canais">
    <PageHeader
      titulo="Canais"
      descricao="Bots do Telegram e do WhatsApp para conversar com os agentes pelo celular, receber avisos das rotinas e aprovar ações."
    />

    <EmptyState v-if="carregando" titulo="Carregando" carregando />

    <template v-else>
      <Card v-if="canais.length" titulo="Seus canais" descricao="Cada canal tem o seu bot, agente, papel e pasta padrão. Escolha um para configurar.">
        <div class="canais-lista">
          <button
            v-for="c in canais"
            :key="c.id"
            type="button"
            :class="['canal-cartao', { ativo: selecionado === c.id && !novo }]"
            @click="selecionado = c.id; novo = null"
          >
            <span class="canal-cartao-topo">
              <strong>{{ c.nome }}</strong>
              <span :class="['canal-status', c.rodando ? 'ligado' : c.configurado ? 'parado' : 'pendente']">
                {{ c.rodando ? 'ligado' : c.configurado ? 'desligado' : 'sem credencial' }}
              </span>
            </span>
            <span class="canal-cartao-linha">{{ nomeDoTipo(c.tipo) }}{{ c.conta ? ` · ${c.conta}` : '' }}</span>
            <span class="canal-cartao-linha muted">
              {{ c.permitidos.length }} {{ c.permitidos.length === 1 ? 'pessoa' : 'pessoas' }}
              <template v-if="c.pedidos.length"> · {{ c.pedidos.length }} {{ c.pedidos.length === 1 ? 'pedido' : 'pedidos' }} de acesso</template>
              <template v-if="c.padrao.papel"> · papel {{ c.padrao.papel }}</template>
            </span>
            <span class="canal-cartao-linha muted">id nas automações: <code>{{ c.id }}</code></span>
          </button>
          <button type="button" :class="['canal-cartao', 'canal-novo', { ativo: novo }]" @click="novo = { tipo: 'telegram', nome: '' }">
            <strong>+ Novo canal</strong>
            <span class="canal-cartao-linha muted">Outro bot do Telegram, WhatsApp...</span>
          </button>
        </div>
      </Card>

      <Card
        v-if="novo || canais.length === 0"
        titulo="Novo canal"
        :descricao="canais.length === 0 ? 'Nenhum canal ainda. Escolha o tipo e dê um nome para criar o primeiro.' : 'Escolha o tipo e dê um nome para o canal.'"
      >
        <form class="ui-form" @submit.prevent="criar()">
          <div class="canal-tipos">
            <label v-for="t in tipos" :key="t.id" :class="['canal-tipo', { desabilitado: !t.disponivel, ativo: (novo?.tipo ?? 'telegram') === t.id }]">
              <input type="radio" name="tipo" :value="t.id" :disabled="!t.disponivel" :checked="(novo?.tipo ?? 'telegram') === t.id" @change="novo = { tipo: t.id, nome: novo?.nome ?? '' }" />
              <strong>{{ t.nome }}</strong>
              <span v-if="!t.disponivel" class="badge muted-badge">em breve</span>
              <span class="muted small">{{ t.descricao }}</span>
            </label>
          </div>
          <Field rotulo="Nome do canal">
            <input
              :value="novo?.nome ?? ''"
              type="text"
              placeholder="ex.: Social mídia, Dev, Alertas"
              @input="novo = { tipo: novo?.tipo ?? 'telegram', nome: ($event.target as HTMLInputElement).value }"
            />
          </Field>
          <div class="ui-form-acoes">
            <button class="primary" type="submit" :disabled="ocupado">Criar canal</button>
            <button v-if="canais.length" type="button" @click="novo = null">Cancelar</button>
          </div>
        </form>
      </Card>

      <template v-if="atual && !novo">
        <Card :titulo="atual.nome" :descricao="`${nomeDoTipo(atual.tipo)}, id ${atual.id}`">
          <p class="muted">{{ atual.descricao }}</p>
          <ol class="canal-passos">
            <li v-for="(passo, i) in atual.passos" :key="i">{{ passo }}</li>
          </ol>
        </Card>

        <Card titulo="Credenciais" descricao="O token ou os dados de acesso do bot. Ficam guardados cifrados.">
          <form class="ui-form" @submit.prevent="salvar()">
            <p v-if="atual.conta" class="canal-aviso small">
              Este canal usa <strong>{{ atual.conta }}</strong>. Colar outro token troca o bot deste canal. Para usar mais um bot, crie um
              <a href="#" @click.prevent="novo = { tipo: atual.tipo, nome: '' }">canal novo</a>.
            </p>
            <Field v-for="campo in atual.campos" :key="campo.chave" :rotulo="campo.rotulo" :ajuda="campo.ajuda">
              <input
                v-model="valores[campo.chave]"
                :type="campo.segredo ? 'password' : 'text'"
                :placeholder="campo.preenchido ? (campo.segredo ? `salvo, ${campo.dica}; cole outro para trocar` : campo.dica) : (campo.exemplo ?? '')"
                autocomplete="off"
                spellcheck="false"
              />
            </Field>
            <div class="ui-form-acoes">
              <button class="primary" type="submit" :disabled="ocupado">{{ atual.configurado ? 'Salvar e conferir' : 'Conferir e salvar' }}</button>
              <span v-if="atual.conta" class="canal-conta">
                <span class="muted small">conta</span>
                <strong>{{ atual.conta }}</strong>
                <a v-if="atual.link" class="canal-abrir" :href="atual.link" target="_blank" rel="noopener">Abrir o bot</a>
              </span>
            </div>
          </form>
        </Card>

        <Card v-if="atual.configurado" titulo="Funcionamento" descricao="Ligue o bot para ele receber mensagens.">
          <template #acoes>
            <StatusBadge :estado="atual.rodando ? 'ok' : 'desligado'" :texto="atual.rodando ? 'Recebendo mensagens' : 'Parado'" />
          </template>
          <div class="row">
            <button v-if="!atual.ligado" class="primary" type="button" :disabled="ocupado" @click="pedir({ type: 'canal.ligar', canal: atual.id, ligado: true })">Ligar</button>
            <button v-else type="button" :disabled="ocupado" @click="pedir({ type: 'canal.ligar', canal: atual.id, ligado: false })">Desligar</button>
            <button type="button" :disabled="ocupado || !atual.rodando || atual.permitidos.length === 0" @click="pedir({ type: 'canal.testar', canal: atual.id })">
              Enviar mensagem de teste
            </button>
          </div>
          <p v-if="atual.rodando && atual.permitidos.length === 0" class="muted small">
            Próximo passo: <a v-if="atual.link" :href="atual.link" target="_blank" rel="noopener">abra o bot</a><span v-else>abra o bot</span>, mande qualquer
            mensagem e clique em Permitir abaixo.
          </p>
          <p v-if="atual.erro" class="error small">{{ atual.erro }}</p>
        </Card>

        <Card
          v-if="atual.configurado"
          titulo="Pediram acesso"
          descricao="Quem manda mensagem para o bot e ainda não tem acesso aparece aqui, sozinho, sem recarregar a tela."
        >
          <EmptyState
            v-if="atual.pedidos.length === 0"
            :titulo="atual.rodando ? 'Ninguém pediu acesso ainda' : 'Canal desligado'"
            :texto="atual.rodando ? 'Mande o link do bot para quem deve conversar com os agentes.' : 'Ligue o canal primeiro para receber pedidos.'"
          />
          <ul v-else class="pessoas">
            <li v-for="p in atual.pedidos" :key="p.id" class="pessoa pendente">
              <img v-if="fotoDe(p)" class="pessoa-avatar" :src="fotoDe(p)" alt="" />
              <span v-else class="pessoa-avatar">{{ iniciais(p) }}</span>
              <span class="pessoa-info">
                <span class="pessoa-titulo">{{ tituloDe(p) }} <span class="badge muted-badge">aguardando</span></span>
                <span class="pessoa-detalhes">
                  <span v-for="d in detalhesDe(p)" :key="d.rotulo" class="pessoa-detalhe"><span class="muted">{{ d.rotulo }}</span> {{ d.valor }}</span>
                  <span class="pessoa-detalhe"><span class="muted">Pediu em</span> {{ quando(p.em) }}</span>
                </span>
              </span>
              <span class="pessoa-acoes">
                <button class="primary" type="button" @click="pedir({ type: 'canal.permitir', canal: atual.id, pessoa: p.id })">Permitir</button>
                <button type="button" class="danger" @click="pedir({ type: 'canal.remover_pessoa', canal: atual.id, pessoa: p.id })">Ignorar</button>
              </span>
            </li>
          </ul>
        </Card>

        <Card
          v-if="atual.configurado"
          titulo="Pessoas permitidas"
          :descricao="`Para chamar mais gente, mande o link do bot${atual.link ? `: ${atual.link}` : ''}. A primeira pessoa da lista recebe os avisos das rotinas.`"
        >
          <EmptyState v-if="atual.permitidos.length === 0" titulo="Nenhuma pessoa permitida ainda" texto="Quando alguém pedir acesso, clique em Permitir no quadro acima." />
          <ul v-else class="pessoas">
            <li v-for="(p, i) in atual.permitidos" :key="p.id" class="pessoa">
              <img v-if="fotoDe(p)" class="pessoa-avatar" :src="fotoDe(p)" alt="" />
              <span v-else class="pessoa-avatar">{{ iniciais(p) }}</span>
              <span v-if="editando === p.id" class="pessoa-info">
                <form class="pessoa-editar" @submit.prevent="salvarApelido(p.id)">
                  <input v-model="apelido" type="text" placeholder="Como mostrar esta pessoa" autofocus />
                  <button class="primary" type="submit">Salvar</button>
                  <button type="button" @click="editando = null">Cancelar</button>
                </form>
              </span>
              <span v-else class="pessoa-info">
                <span class="pessoa-titulo">
                  {{ tituloDe(p) }}
                  <span v-if="i === 0" class="badge">recebe avisos</span>
                  <span v-if="!p.conversa" class="badge muted-badge">ainda não falou com o bot</span>
                </span>
                <span class="pessoa-detalhes">
                  <span v-for="d in detalhesDe(p)" :key="d.rotulo" class="pessoa-detalhe"><span class="muted">{{ d.rotulo }}</span> {{ d.valor }}</span>
                </span>
              </span>
              <span v-if="editando !== p.id" class="pessoa-acoes">
                <button type="button" @click="editar(p)">Editar nome</button>
                <button type="button" class="danger" @click="removerPessoa(p)">Remover</button>
              </span>
            </li>
          </ul>
        </Card>

        <Card titulo="Nome e padrões das conversas" descricao="Conversas novas neste canal usam esses valores. Vazio usa o roteamento normal.">
          <form class="ui-form duas-colunas" @submit.prevent="salvarPadrao()">
            <p class="muted small" style="grid-column: 1 / -1; margin: 0">
              Para uma rotina avisar aqui, use <code>"notify": ["{{ atual.id }}"]</code> no agendamento.
            </p>
            <Field rotulo="Nome"><input v-model="padrao.nome" type="text" /></Field>
            <Field rotulo="Agente"><input v-model="padrao.agente" type="text" placeholder="ex.: gemini" spellcheck="false" /></Field>
            <Field rotulo="Papel"><input v-model="padrao.papel" type="text" placeholder="ex.: social-media" spellcheck="false" /></Field>
            <Field rotulo="Pasta"><input v-model="padrao.workspace" type="text" placeholder="caminho de um workspace permitido" spellcheck="false" /></Field>
            <div class="ui-form-acoes"><button type="submit" :disabled="ocupado">Salvar padrões</button></div>
          </form>
        </Card>

        <Card titulo="Apagar canal" descricao="As credenciais e as pessoas permitidas deste canal saem junto." perigo>
          <div class="row">
            <button type="button" class="danger" :disabled="ocupado" @click="apagar()">Apagar este canal</button>
          </div>
        </Card>
      </template>
    </template>
  </div>
</template>

<style scoped>
.canal-tipo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
}
</style>
