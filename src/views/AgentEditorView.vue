<script setup lang="ts">
import type { AgentSummary, EstadoDoCanal, RoleDetail, ScheduleStatus } from '@agent-hub/core'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Field from '../components/ui/Field.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { avisar, confirmar, mensagemDeErro } from '../ui/feedback'

const props = defineProps<{ nome: string }>()
const router = useRouter()
const route = useRoute()

interface Conector {
  name: string
  connected: boolean
  enabled: boolean
  tools: number
  error: string | null
}

interface SkillResumo {
  name: string
  description: string
}

const criando = computed(() => props.nome === 'novo')
const carregando = ref(true)
const falha = ref('')
const salvando = ref(false)
const papel = ref<RoleDetail>(vazio())
const original = ref('')
const politicas = ref<string[]>([])
const nativas = ref<string[]>([])
const modelos = ref<AgentSummary[]>([])
const skills = ref<SkillResumo[]>([])
const conectores = ref<Conector[]>([])
const rotinas = ref<ScheduleStatus[]>([])
const canais = ref<EstadoDoCanal[]>([])
const buscaSkill = ref('')
const erros = ref<Record<string, string>>({})
let estadoSalvo = ''

const gruposDeFerramentas: { titulo: string; descricao: string; nomes: string[] }[] = [
  { titulo: 'Ler arquivos e pastas', descricao: 'Abrir, listar e procurar nos arquivos do projeto.', nomes: ['list_dir', 'read_file', 'search'] },
  { titulo: 'Criar e editar arquivos', descricao: 'Escrever arquivos novos e alterar os existentes.', nomes: ['write_file', 'edit_file'] },
  { titulo: 'Rodar comandos no terminal', descricao: 'Executar programas e scripts na máquina.', nomes: ['run_command'] },
  { titulo: 'Usar o git', descricao: 'Ver histórico, criar commits e branches.', nomes: ['git'] },
  { titulo: 'Memória do projeto', descricao: 'Ler e gravar lembretes que valem para próximas conversas.', nomes: ['memory_read', 'memory_write'] },
  { titulo: 'Especificações e decisões', descricao: 'Registrar especificações e decisões do projeto.', nomes: ['spec_write'] },
  { titulo: 'Busca na base de conhecimento', descricao: 'Procurar nos documentos indexados.', nomes: ['knowledge_search'] },
]

const descricaoDaPolitica: Record<string, { titulo: string; texto: string }> = {
  padrao: { titulo: 'Pedir aprovação', texto: 'Lê à vontade e pede sua aprovação antes de alterar arquivos ou rodar comandos.' },
  'somente-leitura': { titulo: 'Só leitura', texto: 'Só lê. Não altera arquivos nem roda comandos.' },
  'pesquisa-e-anotacao': { titulo: 'Escrever sem pedir', texto: 'Lê e escreve arquivos sem pedir aprovação. Não roda comandos. Bom para rotinas automáticas.' },
}

function vazio(): RoleDetail {
  return { name: '', description: '', models: [], tools: { native: [], mcp: [] }, skills: [], policy: 'padrao', max_steps: null, budget: {}, prompt: '' }
}

function humanizar(nome: string): string {
  const texto = nome.replace(/-/g, ' ')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const outrasNativas = computed(() => {
  const agrupadas = new Set(gruposDeFerramentas.flatMap((g) => g.nomes))
  return nativas.value.filter((n) => !agrupadas.has(n) && n !== 'load_skill')
})

const gruposVisiveis = computed(() => gruposDeFerramentas.map((g) => ({ ...g, nomes: g.nomes.filter((n) => nativas.value.includes(n)) })).filter((g) => g.nomes.length))

const skillsFiltradas = computed(() => {
  const termo = buscaSkill.value.trim().toLowerCase()
  const lista = [...skills.value].sort((a, b) => Number(papel.value.skills.includes(b.name)) - Number(papel.value.skills.includes(a.name)) || a.name.localeCompare(b.name))
  return termo ? lista.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(termo)) : lista
})

const uso = computed(() => ({
  rotinas: rotinas.value.filter((r) => r.role === original.value && original.value).map((r) => humanizar(r.id)),
  canais: canais.value.filter((c) => c.padrao.papel === original.value && original.value).map((c) => c.nome),
}))

const mudou = computed(() => JSON.stringify(papel.value) !== estadoSalvo)

function grupoMarcado(nomes: string[]): boolean {
  return nomes.every((n) => papel.value.tools.native.includes(n))
}

function alternarGrupo(nomes: string[], ligado: boolean): void {
  const atual = new Set(papel.value.tools.native)
  for (const n of nomes) {
    if (ligado) atual.add(n)
    else atual.delete(n)
  }
  papel.value.tools.native = nativas.value.filter((n) => atual.has(n))
}

function alternar(lista: string[], item: string, ligado: boolean): string[] {
  return ligado ? [...lista.filter((i) => i !== item), item] : lista.filter((i) => i !== item)
}

function numero(valor: string): number | undefined {
  if (valor.trim() === '') return undefined
  const n = Number(valor.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

function validar(): boolean {
  const e: Record<string, string> = {}
  if (!/^[a-z0-9][a-z0-9-]*$/.test(papel.value.name)) e.name = 'Use letras minúsculas, números e hífen, começando por letra ou número.'
  if (!papel.value.description.trim()) e.description = 'Diga em uma frase o que este agente faz.'
  if (papel.value.models.length === 0) e.models = 'Escolha pelo menos um modelo.'
  if (!papel.value.prompt.trim()) e.prompt = 'Escreva as instruções do agente.'
  if (papel.value.max_steps !== null && (!Number.isInteger(papel.value.max_steps) || papel.value.max_steps <= 0)) e.max_steps = 'Use um número inteiro maior que zero.'
  for (const chave of ['run_usd', 'session_usd'] as const) {
    const v = papel.value.budget[chave]
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) e[chave] = 'Use um valor em dólares, zero ou maior.'
  }
  erros.value = e
  return Object.keys(e).length === 0
}

async function salvar(): Promise<void> {
  if (!validar()) {
    avisar('Confira os campos marcados.', 'erro')
    return
  }
  salvando.value = true
  try {
    await client.request({ type: 'role.save', role: papel.value, original: criando.value ? undefined : original.value }, 'role.saved')
    estadoSalvo = JSON.stringify(papel.value)
    avisar(`Agente ${humanizar(papel.value.name)} salvo.`)
    await router.push('/settings/agentes')
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  } finally {
    salvando.value = false
  }
}

async function sair(): Promise<void> {
  if (mudou.value && !(await confirmar({ titulo: 'Descartar alterações?', detalhe: 'O que você mudou neste agente não foi salvo.', botao: 'Descartar' }))) return
  estadoSalvo = JSON.stringify(papel.value)
  await router.push('/settings/agentes')
}

async function apagar(): Promise<void> {
  const ok = await confirmar({ titulo: `Apagar o agente ${humanizar(original.value)}?`, detalhe: 'As instruções e configurações dele saem junto.', botao: 'Apagar agente' })
  if (!ok) return
  try {
    await client.request({ type: 'role.delete', name: original.value }, 'role.deleted')
    estadoSalvo = JSON.stringify(papel.value)
    avisar('Agente apagado.')
    await router.push('/settings/agentes')
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  }
}

onMounted(async () => {
  await useConnection().whenOnline().catch(() => undefined)
  try {
    const copiar = typeof route.query.copiar === 'string' ? route.query.copiar : ''
    const alvo = criando.value ? copiar : props.nome
    const [detalhe, lista, listaSkills, servidores, agendamentos, estadoCanais] = await Promise.all([
      client.request({ type: 'role.get', name: alvo }, 'role.detail'),
      client.request({ type: 'agents.list' }, 'agents.list'),
      client.request({ type: 'skills.list' }, 'skills.list'),
      client.request({ type: 'mcp.servers' }, 'mcp.servers'),
      client.request({ type: 'schedule.list' }, 'schedule.list').catch(() => null),
      client.request({ type: 'canais.estado' }, 'canais.estado').catch(() => null),
    ])
    papel.value = { ...detalhe.role, tools: { ...detalhe.role.tools }, budget: { ...detalhe.role.budget } }
    if (criando.value && copiar) {
      papel.value.name = `${copiar}-copia`
      papel.value.description = detalhe.role.description
    }
    original.value = criando.value ? '' : detalhe.role.name
    politicas.value = detalhe.policies
    nativas.value = detalhe.native_tools
    modelos.value = lista.agents
    skills.value = listaSkills.skills
    conectores.value = servidores.servers
    rotinas.value = agendamentos?.schedules ?? []
    canais.value = estadoCanais?.canais ?? []
    if (criando.value && !copiar) {
      papel.value.tools.native = nativas.value.filter((n) => ['list_dir', 'read_file', 'search'].includes(n))
    }
    estadoSalvo = JSON.stringify(papel.value)
  } catch (err) {
    falha.value = mensagemDeErro(err)
  } finally {
    carregando.value = false
  }
})
</script>

<template>
  <div class="ui-page">
    <PageHeader :titulo="criando ? 'Novo agente' : `Editar agente: ${humanizar(original)}`" descricao="Defina a função do agente, as instruções que ele segue e o que ele pode usar.">
      <template #acoes>
        <button type="button" @click="sair">Voltar</button>
      </template>
    </PageHeader>

    <EmptyState v-if="carregando" titulo="Carregando" carregando />
    <EmptyState v-else-if="falha" titulo="Não consegui abrir o agente" :texto="falha">
      <button type="button" @click="router.push('/settings/agentes')">Voltar para a lista</button>
    </EmptyState>

    <form v-else class="editor-agente" novalidate @submit.prevent="salvar">
      <Card titulo="Identidade">
        <div class="ui-form duas-colunas">
          <Field rotulo="Nome" obrigatorio :erro="erros.name" ajuda="Usado para escolher o agente em canais e rotinas. Letras minúsculas e hífen.">
            <input v-model="papel.name" type="text" spellcheck="false" placeholder="ex.: social-media" @blur="papel.name = slug(papel.name)" />
          </Field>
          <Field rotulo="O que ele faz" obrigatorio :erro="erros.description" ajuda="Uma frase curta. Aparece na lista e ajuda o roteamento.">
            <input v-model="papel.description" type="text" placeholder="ex.: Propõe ideias de post para o Instagram" />
          </Field>
        </div>
      </Card>

      <Card titulo="Instruções" descricao="Como o agente deve pensar e trabalhar. Ele lê isto em toda conversa.">
        <Field rotulo="Instruções do agente" obrigatorio :erro="erros.prompt">
          <textarea v-model="papel.prompt" rows="14" placeholder="Você é o agente de... Como trabalhar: ..."></textarea>
        </Field>
      </Card>

      <Card titulo="Modelo de IA" descricao="Qual modelo roda este agente. Com mais de um, o primeiro marcado tem preferência.">
        <p v-if="erros.models" class="ui-field-erro">{{ erros.models }}</p>
        <ul class="ui-lista">
          <li v-for="m in modelos" :key="m.name" class="ui-lista-item">
            <label class="opcao-linha">
              <input type="checkbox" :checked="papel.models.includes(m.name)" @change="papel.models = alternar(papel.models, m.name, ($event.target as HTMLInputElement).checked)" />
              <span class="ui-lista-item-texto">
                <strong>{{ m.name }} <span v-if="papel.models.indexOf(m.name) === 0" class="agente-marca">preferido</span></strong>
                <span class="muted">{{ m.provider }} · {{ m.model }}</span>
              </span>
            </label>
          </li>
        </ul>
      </Card>

      <Card titulo="Skills" :descricao="`Conhecimentos e fluxos prontos que o agente pode carregar. ${papel.skills.length} marcada(s).`">
        <input v-model="buscaSkill" type="search" placeholder="Procurar skill" />
        <EmptyState v-if="skills.length === 0" titulo="Nenhuma skill instalada" texto="Skills chegam pelos plugins." />
        <ul v-else class="ui-lista lista-rolagem">
          <li v-for="s in skillsFiltradas" :key="s.name" class="ui-lista-item">
            <label class="opcao-linha">
              <input type="checkbox" :checked="papel.skills.includes(s.name)" @change="papel.skills = alternar(papel.skills, s.name, ($event.target as HTMLInputElement).checked)" />
              <span class="ui-lista-item-texto">
                <strong>{{ s.name }}</strong>
                <span class="muted ui-duas-linhas">{{ s.description }}</span>
              </span>
            </label>
          </li>
        </ul>
      </Card>

      <Card titulo="Conectores" descricao="Serviços externos que o agente pode usar, como gerar imagens ou navegar em sites.">
        <EmptyState v-if="conectores.length === 0" titulo="Nenhum conector configurado" texto="Adicione conectores em Integrações > Conectores." />
        <ul v-else class="ui-lista">
          <li v-for="c in conectores" :key="c.name" class="ui-lista-item">
            <label class="opcao-linha">
              <input
                type="checkbox"
                :checked="papel.tools.mcp.includes(c.name)"
                @change="papel.tools.mcp = alternar(papel.tools.mcp, c.name, ($event.target as HTMLInputElement).checked)"
              />
              <span class="ui-lista-item-texto">
                <strong>{{ c.name }}</strong>
                <span class="muted">{{ c.tools }} ferramenta(s)</span>
              </span>
              <StatusBadge v-if="c.error" estado="erro" texto="Com erro" />
              <StatusBadge v-else-if="!c.enabled" estado="desligado" texto="Desligado" />
              <StatusBadge v-else-if="c.connected" estado="ok" texto="Conectado" />
              <StatusBadge v-else estado="atencao" texto="Conecta ao usar" />
            </label>
          </li>
        </ul>
      </Card>

      <Card titulo="Ferramentas básicas" descricao="O que o agente pode fazer na máquina. As permissões abaixo definem se ele pede aprovação.">
        <ul class="ui-lista">
          <li v-for="g in gruposVisiveis" :key="g.titulo" class="ui-lista-item">
            <label class="opcao-linha">
              <input type="checkbox" :checked="grupoMarcado(g.nomes)" @change="alternarGrupo(g.nomes, ($event.target as HTMLInputElement).checked)" />
              <span class="ui-lista-item-texto">
                <strong>{{ g.titulo }}</strong>
                <span class="muted">{{ g.descricao }}</span>
              </span>
            </label>
          </li>
          <li v-for="n in outrasNativas" :key="n" class="ui-lista-item">
            <label class="opcao-linha">
              <input type="checkbox" :checked="papel.tools.native.includes(n)" @change="alternarGrupo([n], ($event.target as HTMLInputElement).checked)" />
              <span class="ui-lista-item-texto"><strong>{{ n }}</strong></span>
            </label>
          </li>
        </ul>
      </Card>

      <Card titulo="Permissões" descricao="Quanto o agente pode agir sozinho.">
        <ul class="ui-lista">
          <li v-for="p in politicas" :key="p" class="ui-lista-item">
            <label class="opcao-linha">
              <input v-model="papel.policy" type="radio" name="politica" :value="p" />
              <span class="ui-lista-item-texto">
                <strong>{{ descricaoDaPolitica[p]?.titulo ?? humanizar(p) }}</strong>
                <span class="muted">{{ descricaoDaPolitica[p]?.texto ?? `Política ${p}` }}</span>
              </span>
            </label>
          </li>
        </ul>
      </Card>

      <Card titulo="Limites" descricao="Deixe em branco para usar o padrão do modelo.">
        <div class="ui-form duas-colunas">
          <Field rotulo="Passos por tarefa" :erro="erros.max_steps" ajuda="Quantas ações o agente faz antes de parar.">
            <input
              :value="papel.max_steps ?? ''"
              type="number"
              min="1"
              step="1"
              placeholder="padrão do modelo"
              @input="papel.max_steps = ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value)"
            />
          </Field>
          <Field rotulo="Gasto máximo por tarefa (US$)" :erro="erros.run_usd">
            <input :value="papel.budget.run_usd ?? ''" type="number" min="0" step="0.1" placeholder="sem limite próprio" @input="papel.budget.run_usd = numero(($event.target as HTMLInputElement).value)" />
          </Field>
          <Field rotulo="Gasto máximo por conversa (US$)" :erro="erros.session_usd">
            <input :value="papel.budget.session_usd ?? ''" type="number" min="0" step="0.1" placeholder="sem limite próprio" @input="papel.budget.session_usd = numero(($event.target as HTMLInputElement).value)" />
          </Field>
        </div>
      </Card>

      <Card v-if="!criando" titulo="Onde este agente é usado">
        <p v-if="!uso.rotinas.length && !uso.canais.length" class="muted">Nenhuma rotina ou canal usa este agente ainda.</p>
        <ul v-else class="ui-lista">
          <li v-for="r in uso.rotinas" :key="`r-${r}`" class="ui-lista-item">
            <span class="ui-lista-item-texto"><strong>Rotina: {{ r }}</strong></span>
            <RouterLink to="/settings/automacoes" class="ui-link-botao">Ver rotinas</RouterLink>
          </li>
          <li v-for="c in uso.canais" :key="`c-${c}`" class="ui-lista-item">
            <span class="ui-lista-item-texto"><strong>Canal: {{ c }}</strong></span>
            <RouterLink to="/settings/canais" class="ui-link-botao">Ver canais</RouterLink>
          </li>
        </ul>
      </Card>

      <div class="editor-acoes">
        <button type="submit" class="primary" :disabled="salvando">{{ salvando ? 'Salvando...' : 'Salvar agente' }}</button>
        <button type="button" @click="sair">Cancelar</button>
        <span class="spacer"></span>
        <span v-if="mudou" class="muted small">Alterações não salvas</span>
        <button v-if="!criando" type="button" class="danger" @click="apagar">Apagar agente</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.editor-agente {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.opcao-linha {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  margin: 0;
  color: var(--text);
  font-size: var(--fs-base);
  cursor: pointer;
}

.opcao-linha input[type='checkbox'],
.opcao-linha input[type='radio'] {
  width: auto;
  margin-top: 3px;
  flex: none;
}

.lista-rolagem {
  max-height: 360px;
  overflow: auto;
}

.agente-marca {
  font-size: var(--fs-small);
  font-weight: 400;
  color: var(--accent);
  margin-left: 6px;
}

.editor-acoes {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow);
}
</style>
