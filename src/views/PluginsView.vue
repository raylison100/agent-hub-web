<script setup lang="ts">
import type { AgentSummary, PluginDoClaudeCode, PluginResumo, RequisitoDePlugin } from '@agent-hub/core'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Markdown from '../components/Markdown.vue'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { useSessions } from '../stores/sessions'
import { avisar, confirmar, mensagemDeErro } from '../ui/feedback'

interface Skill {
  name: string
  description: string
  source: string
}

type Aba = 'plugins' | 'skills'

const route = useRoute()
const router = useRouter()
const connection = useConnection()
const sessions = useSessions()

const plugins = ref<PluginResumo[]>([])
const doClaudeCode = ref<PluginDoClaudeCode[]>([])
const agentes = ref<AgentSummary[]>([])
const erro = ref('')
const carregando = ref(true)
const ocupado = ref('')
const origem = ref('')
const ref_ = ref('')
const mostrarAdicionar = ref(false)
const papelDe = ref<string | null>(null)
const modelos = ref<string[]>([])
const chaveEditada = ref<string | null>(null)
const valorDaChave = ref('')

const skills = ref<Skill[]>([])
const erroSkills = ref('')
const carregandoSkills = ref(true)
const busca = ref('')
const aberta = ref<{ nome: string; corpo: string } | null>(null)
const abrindo = ref('')

const aba = computed<Aba>(() => (route.query.aba === 'skills' ? 'skills' : 'plugins'))
const paraImportar = computed(() => doClaudeCode.value.filter((p) => !p.ja_adicionado))
const ehGit = computed(() => /^(https:\/\/|git@|ssh:\/\/)/.test(origem.value.trim()))
const exibirAdicionar = computed(() => mostrarAdicionar.value || (!carregando.value && !erro.value && plugins.value.length === 0))

const skillsFiltradas = computed(() => {
  const termo = busca.value.trim().toLowerCase()
  if (!termo) return skills.value
  return skills.value.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(termo))
})

const suasSkills = computed(() => skillsFiltradas.value.filter((s) => s.source !== 'plugin'))

const skillsDePlugins = computed(() => {
  const grupos = new Map<string, Skill[]>()
  for (const s of skillsFiltradas.value.filter((x) => x.source === 'plugin')) {
    const prefixo = s.name.includes(':') ? s.name.slice(0, s.name.indexOf(':')) : ''
    grupos.set(prefixo, [...(grupos.get(prefixo) ?? []), s])
  }
  return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([plugin, lista]) => ({ plugin, lista }))
})

/** Troca a aba visível guardando a escolha no endereço. */
function trocarAba(nova: Aba): void {
  void router.replace({ query: { ...route.query, aba: nova } })
}

/** Plural simples em português. */
function contar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/** Resumo em palavras do que o plugin traz. */
function conteudo(p: PluginResumo): string {
  const partes = [
    p.skills ? contar(p.skills, 'skill', 'skills') : '',
    p.mcp ? contar(p.mcp, 'conector', 'conectores') : '',
    p.agents ? contar(p.agents, 'agente', 'agentes') : '',
    p.hooks ? contar(p.hooks, 'ação automática', 'ações automáticas') : '',
  ].filter(Boolean)
  return partes.length ? partes.join(', ') : 'Não traz skills nem conectores'
}

/** Estado exibido no selo do plugin. */
function status(p: PluginResumo): {
  estado: 'ok' | 'erro' | 'desligado'
  texto: string
} {
  if (!p.enabled) return { estado: 'desligado', texto: 'Desligado' }
  if (p.erros.length) return { estado: 'erro', texto: 'Com erro' }
  return { estado: 'ok', texto: 'Ligado' }
}

/** Nome da skill sem o prefixo do plugin. */
function nomeCurto(nome: string): string {
  return nome.includes(':') ? nome.slice(nome.indexOf(':') + 1) : nome
}

async function recarregarPlugins(): Promise<void> {
  plugins.value = (await client.request({ type: 'plugins.list' }, 'plugins.list')).plugins
}

async function carregar(): Promise<void> {
  erro.value = ''
  try {
    await recarregarPlugins()
    doClaudeCode.value = (await client.request({ type: 'plugins.claude_code' }, 'plugins.claude_code')).plugins
    agentes.value = (await client.request({ type: 'agents.list' }, 'agents.list')).agents
  } catch (err) {
    erro.value = mensagemDeErro(err)
  } finally {
    carregando.value = false
  }
}

async function carregarSkills(): Promise<void> {
  erroSkills.value = ''
  try {
    skills.value = (await client.request({ type: 'skills.list' }, 'skills.list')).skills
  } catch (err) {
    erroSkills.value = mensagemDeErro(err)
  } finally {
    carregandoSkills.value = false
  }
}

/** Roda uma ação de plugin com estado de ocupado e atualiza o que depende dela. */
async function executar(rotulo: string, acao: () => Promise<void>): Promise<boolean> {
  ocupado.value = rotulo
  try {
    await acao()
    await sessions.loadAgents().catch(() => undefined)
    doClaudeCode.value = (await client.request({ type: 'plugins.claude_code' }, 'plugins.claude_code')).plugins
    void carregarSkills()
    return true
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
    return false
  } finally {
    ocupado.value = ''
  }
}

function adicionarPasta(pasta: string): Promise<boolean> {
  return executar(pasta, async () => {
    plugins.value = (await client.request({ type: 'plugins.adicionar', path: pasta }, 'plugins.list', 60000)).plugins
    avisar('Plugin adicionado. Confira se falta alguma chave e crie um agente para usar as skills.')
  })
}

async function adicionarOrigem(): Promise<void> {
  const valor = origem.value.trim()
  const pedido = ehGit.value
    ? {
        type: 'plugins.adicionar' as const,
        git: valor,
        ref: ref_.value.trim() || undefined,
      }
    : { type: 'plugins.adicionar' as const, path: valor }
  const ok = await executar('origem', async () => {
    plugins.value = (await client.request(pedido, 'plugins.list', 120000)).plugins
    origem.value = ''
    ref_.value = ''
    avisar('Plugin adicionado.')
  })
  if (ok) mostrarAdicionar.value = false
}

function alternar(p: PluginResumo): Promise<boolean> {
  return executar(p.chave, async () => {
    plugins.value = (await client.request({ type: 'plugins.alternar', chave: p.chave, enabled: !p.enabled }, 'plugins.list')).plugins
    avisar(p.enabled ? `Plugin ${p.name} desligado.` : `Plugin ${p.name} ligado.`)
  })
}

async function remover(p: PluginResumo): Promise<void> {
  const ok = await confirmar({
    titulo: `Remover o plugin ${p.name}?`,
    detalhe: 'Ele sai da lista e as skills e conectores dele somem dos agentes. A pasta do plugin não é apagada.',
    botao: 'Remover plugin',
  })
  if (!ok) return
  await executar(p.chave, async () => {
    plugins.value = (await client.request({ type: 'plugins.remover', chave: p.chave }, 'plugins.list')).plugins
    avisar(`Plugin ${p.name} removido.`)
  })
}

function abrirPapel(p: PluginResumo): void {
  papelDe.value = p.name
  const candidatos = agentes.value.filter((a) => a.provider !== 'ollama' && a.tools.includes('write_file') && !a.name.includes('-'))
  modelos.value = candidatos.slice(0, 2).map((a) => a.name)
}

function criarPapel(): Promise<boolean> {
  const plugin = papelDe.value
  if (!plugin) return Promise.resolve(false)
  return executar(`papel-${plugin}`, async () => {
    const criado = await client.request({ type: 'plugins.papel', plugin, modelos: modelos.value }, 'plugins.papel_criado')
    await recarregarPlugins()
    papelDe.value = null
    avisar(`Agente ${criado.papel} criado. Numa conversa nova, escolha ${criado.papel} no botão de papel abaixo da caixa de texto.`)
  })
}

async function abrirChave(r: RequisitoDePlugin, p: PluginResumo): Promise<void> {
  chaveEditada.value = `${p.chave}|${r.campo}`
  valorDaChave.value = ''
  await nextTick()
  document.getElementById(`req-${p.chave}-${r.campo}`)?.focus()
}

async function salvarChave(r: RequisitoDePlugin, p: PluginResumo): Promise<void> {
  if (!valorDaChave.value.trim()) {
    avisar('Cole o valor da chave antes de salvar.', 'erro')
    return
  }
  const valor = valorDaChave.value
  const ok = await executar(`chave-${p.chave}-${r.campo}`, async () => {
    await client.request({ type: 'secrets.set', name: r.variavel, value: valor }, 'secrets.list')
    await recarregarPlugins()
    avisar(`Chave de ${r.titulo} salva.`)
  })
  if (ok) {
    chaveEditada.value = null
    valorDaChave.value = ''
  }
}

async function verSkill(s: Skill): Promise<void> {
  abrindo.value = s.name
  try {
    const res = await client.request({ type: 'skill.get', name: s.name }, 'skill.get', 20000)
    aberta.value = { nome: res.name, corpo: res.body }
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  } finally {
    abrindo.value = ''
  }
}

function tecla(e: KeyboardEvent): void {
  if (e.key === 'Escape' && aberta.value) aberta.value = null
}

onMounted(async () => {
  window.addEventListener('keydown', tecla)
  await connection.whenOnline().catch(() => undefined)
  await Promise.all([carregar(), carregarSkills()])
})

onUnmounted(() => window.removeEventListener('keydown', tecla))
</script>

<template>
  <div class="ui-page">
    <PageHeader
      titulo="Plugins e skills"
      descricao="Plugins são pacotes que trazem novas skills e conectores. Skills são instruções prontas que os agentes seguem quando o pedido combina com elas."
    >
      <template #acoes>
        <button v-if="aba === 'plugins' && plugins.length" type="button" :class="{ primary: !mostrarAdicionar }" @click="mostrarAdicionar = !mostrarAdicionar">
          {{ mostrarAdicionar ? 'Fechar' : 'Adicionar plugin' }}
        </button>
      </template>
    </PageHeader>

    <div class="ui-segmentos" role="tablist" aria-label="Seções">
      <button type="button" role="tab" :aria-selected="aba === 'plugins'" :class="['ui-segmento', { ativo: aba === 'plugins' }]" @click="trocarAba('plugins')">
        Plugins<span v-if="plugins.length" class="aba-contagem">{{ plugins.length }}</span>
      </button>
      <button type="button" role="tab" :aria-selected="aba === 'skills'" :class="['ui-segmento', { ativo: aba === 'skills' }]" @click="trocarAba('skills')">
        Skills<span v-if="skills.length" class="aba-contagem">{{ skills.length }}</span>
      </button>
    </div>

    <template v-if="aba === 'plugins'">
      <Card v-if="exibirAdicionar" titulo="Adicionar plugin" descricao="Plugins rodam comandos na sua máquina. Adicione só os de origem confiável.">
        <div class="adicionar">
          <section v-if="paraImportar.length" class="adicionar-bloco">
            <h3>Trazer do Claude Code</h3>
            <p class="muted small">Plugins que você já usa no Claude Code e ainda não estão aqui.</p>
            <ul class="ui-lista">
              <li v-for="p in paraImportar" :key="p.id" class="ui-lista-item">
                <span class="ui-lista-item-texto">
                  <strong
                    >{{ p.nome }}<span v-if="p.versao" class="muted small"> · versão {{ p.versao }}</span></strong
                  >
                  <span v-if="p.descricao" class="muted descricao">{{ p.descricao }}</span>
                  <code class="small caminho">{{ p.pasta }}</code>
                </span>
                <span class="ui-lista-item-acoes">
                  <button class="primary" type="button" :disabled="Boolean(ocupado)" @click="adicionarPasta(p.pasta)">
                    {{ ocupado === p.pasta ? 'Adicionando...' : 'Adicionar' }}
                  </button>
                </span>
              </li>
            </ul>
          </section>

          <section class="adicionar-bloco">
            <h3>Por pasta ou endereço git</h3>
            <p class="muted small">Informe a pasta do plugin nesta máquina ou o endereço de um repositório git.</p>
            <form class="origem" @submit.prevent="adicionarOrigem">
              <input
                v-model="origem"
                type="text"
                spellcheck="false"
                autocomplete="off"
                placeholder="/caminho/do/plugin ou https://github.com/dono/plugin.git"
              />
              <input v-if="ehGit" v-model="ref_" type="text" spellcheck="false" autocomplete="off" placeholder="branch ou tag (opcional)" class="ref" />
              <button class="primary" type="submit" :disabled="!origem.trim() || Boolean(ocupado)">
                {{ ocupado === 'origem' ? 'Adicionando...' : 'Adicionar' }}
              </button>
            </form>
          </section>
        </div>
      </Card>

      <EmptyState v-if="carregando" titulo="Carregando" carregando />
      <EmptyState v-else-if="erro" titulo="Não consegui carregar os plugins" :texto="erro">
        <button type="button" @click="carregar">Tentar de novo</button>
      </EmptyState>
      <EmptyState
        v-else-if="!plugins.length"
        titulo="Nenhum plugin ainda"
        texto="Adicione um plugin pelo quadro acima para dar novas skills e conectores aos agentes."
      />

      <template v-else>
        <Card v-for="p in plugins" :key="p.chave">
          <div class="plugin">
            <div class="plugin-topo">
              <span class="ui-lista-item-texto">
                <span class="plugin-nome">
                  <strong>{{ p.name }}</strong>
                  <span v-if="p.versao" class="muted small">versão {{ p.versao }}</span>
                  <StatusBadge :estado="status(p).estado" :texto="status(p).texto" />
                </span>
                <span v-if="p.descricao" class="muted">{{ p.descricao }}</span>
                <span class="small">{{ conteudo(p) }}</span>
              </span>
              <span class="ui-lista-item-acoes">
                <button type="button" :disabled="Boolean(ocupado)" @click="alternar(p)">
                  {{ ocupado === p.chave ? 'Aguarde...' : p.enabled ? 'Desligar' : 'Ligar' }}
                </button>
                <button type="button" class="danger" :disabled="Boolean(ocupado)" @click="remover(p)">Remover</button>
              </span>
            </div>

            <div v-if="p.erros.length" class="plugin-erros">
              <strong class="small">Problemas encontrados</strong>
              <p v-for="e in p.erros" :key="e" class="small">{{ e }}</p>
            </div>

            <p v-if="p.enabled && p.hooks" class="muted small">
              Este plugin tem
              {{ contar(p.hooks, 'ação automática', 'ações automáticas') }}: comandos que rodam sozinhos quando os agentes fazem certas coisas.
            </p>

            <div v-if="p.requisitos.length" class="plugin-secao">
              <strong class="small">Chaves que ele pede</strong>
              <ul class="requisitos">
                <li v-for="r in p.requisitos" :key="r.campo" class="requisito">
                  <div class="requisito-topo">
                    <span class="ui-lista-item-texto">
                      <span class="plugin-nome">
                        <span>{{ r.titulo }}</span>
                        <code class="small">{{ r.variavel }}</code>
                        <StatusBadge
                          :estado="r.definida ? 'ok' : r.obrigatorio ? 'erro' : 'atencao'"
                          :texto="r.definida ? 'Cadastrada' : r.obrigatorio ? 'Faltando (obrigatória)' : 'Faltando (opcional)'"
                        />
                      </span>
                      <span v-if="r.descricao" class="muted">{{ r.descricao }}</span>
                    </span>
                    <span v-if="chaveEditada !== `${p.chave}|${r.campo}`" class="ui-lista-item-acoes">
                      <button type="button" :class="{ primary: !r.definida }" :disabled="Boolean(ocupado)" @click="abrirChave(r, p)">
                        {{ r.definida ? 'Trocar chave' : 'Cadastrar chave' }}
                      </button>
                    </span>
                  </div>
                  <form v-if="chaveEditada === `${p.chave}|${r.campo}`" class="requisito-edicao" @submit.prevent="salvarChave(r, p)">
                    <input
                      :id="`req-${p.chave}-${r.campo}`"
                      v-model="valorDaChave"
                      type="password"
                      placeholder="Cole a chave aqui"
                      autocomplete="new-password"
                      @keydown.esc="chaveEditada = null"
                    />
                    <button class="primary" type="submit" :disabled="Boolean(ocupado)">
                      {{ ocupado === `chave-${p.chave}-${r.campo}` ? 'Salvando...' : 'Salvar' }}
                    </button>
                    <button type="button" @click="chaveEditada = null">Cancelar</button>
                    <RouterLink to="/settings/chaves" class="small">Ver todas as chaves</RouterLink>
                  </form>
                </li>
              </ul>
            </div>

            <details v-if="p.nomes_skills.length || p.nomes_mcp.length" class="plugin-detalhes">
              <summary class="small">Ver o que vem neste plugin</summary>
              <div v-if="p.nomes_skills.length" class="plugin-chips">
                <span class="muted small">Skills:</span>
                <span v-for="s in p.nomes_skills" :key="s" class="plugin-chip">{{ nomeCurto(s) }}</span>
              </div>
              <div v-if="p.nomes_mcp.length" class="plugin-chips">
                <span class="muted small">Conectores:</span>
                <span v-for="m in p.nomes_mcp" :key="m" class="plugin-chip">{{ m }}</span>
              </div>
            </details>

            <div v-if="p.enabled && (p.skills || p.mcp)" class="plugin-secao papel">
              <template v-if="p.papel">
                <span class="small"
                  >Agente <code>{{ p.papel }}</code> pronto para usar. Escolha-o numa conversa nova.</span
                >
              </template>
              <template v-else-if="papelDe === p.name">
                <strong class="small">Quais modelos de IA esse agente pode usar?</strong>
                <div class="papel-modelos">
                  <label v-for="a in agentes.filter((x) => !x.name.includes('-'))" :key="a.name" class="ui-opcao">
                    <input v-model="modelos" type="checkbox" :value="a.name" />
                    <span>{{ a.name }}</span>
                  </label>
                </div>
                <div class="row">
                  <button class="primary" type="button" :disabled="!modelos.length || Boolean(ocupado)" @click="criarPapel">
                    {{ ocupado === `papel-${p.name}` ? 'Criando...' : 'Criar agente' }}
                  </button>
                  <button type="button" @click="papelDe = null">Cancelar</button>
                </div>
              </template>
              <template v-else>
                <div class="row">
                  <button type="button" :disabled="Boolean(ocupado)" @click="abrirPapel(p)">Criar agente com as skills</button>
                </div>
                <span class="muted small">Cria um agente que já vem com as skills, os conectores e a permissão de escrever arquivos deste plugin.</span>
              </template>
            </div>
          </div>
        </Card>
      </template>
    </template>

    <template v-else>
      <EmptyState v-if="carregandoSkills" titulo="Carregando" carregando />
      <EmptyState v-else-if="erroSkills" titulo="Não consegui carregar as skills" :texto="erroSkills">
        <button type="button" @click="carregarSkills">Tentar de novo</button>
      </EmptyState>
      <EmptyState
        v-else-if="!skills.length"
        titulo="Nenhuma skill ainda"
        texto="Coloque skills na pasta de skills dos agentes ou adicione um plugin que traga skills."
      >
        <button type="button" class="primary" @click="trocarAba('plugins')">Ver plugins</button>
      </EmptyState>

      <template v-else>
        <input v-model="busca" type="search" class="busca" placeholder="Buscar skill pelo nome ou descrição" aria-label="Buscar skill" />

        <EmptyState v-if="!skillsFiltradas.length" titulo="Nenhuma skill encontrada" texto="Tente buscar por outra palavra.">
          <button type="button" @click="busca = ''">Limpar busca</button>
        </EmptyState>

        <Card v-if="suasSkills.length" titulo="Suas skills" descricao="Skills guardadas junto com os seus agentes.">
          <ul class="ui-lista">
            <li v-for="s in suasSkills" :key="s.name" class="ui-lista-item">
              <span class="ui-lista-item-texto">
                <strong>{{ s.name }}</strong>
                <span v-if="s.description" class="muted descricao">{{ s.description }}</span>
              </span>
              <span class="ui-lista-item-acoes">
                <button type="button" :disabled="abrindo === s.name" @click="verSkill(s)">
                  {{ abrindo === s.name ? 'Abrindo...' : 'Ver' }}
                </button>
              </span>
            </li>
          </ul>
        </Card>

        <Card v-if="skillsDePlugins.length" titulo="De plugins" descricao="Skills que vieram com os plugins instalados.">
          <div class="grupos">
            <section v-for="g in skillsDePlugins" :key="g.plugin">
              <h3 class="grupo-titulo">
                {{ g.plugin ? `Plugin ${g.plugin}` : 'Sem plugin identificado' }}
              </h3>
              <ul class="ui-lista">
                <li v-for="s in g.lista" :key="s.name" class="ui-lista-item">
                  <span class="ui-lista-item-texto">
                    <span class="plugin-nome">
                      <strong>{{ nomeCurto(s.name) }}</strong>
                      <code class="small">{{ s.name }}</code>
                    </span>
                    <span v-if="s.description" class="muted descricao">{{ s.description }}</span>
                  </span>
                  <span class="ui-lista-item-acoes">
                    <button type="button" :disabled="abrindo === s.name" @click="verSkill(s)">
                      {{ abrindo === s.name ? 'Abrindo...' : 'Ver' }}
                    </button>
                  </span>
                </li>
              </ul>
            </section>
          </div>
        </Card>
      </template>
    </template>

    <div v-if="aberta" class="modal-backdrop" @click.self="aberta = null">
      <div class="modal skill-modal" role="dialog" aria-modal="true" :aria-label="`Skill ${aberta.nome}`">
        <header class="skill-modal-topo">
          <h2>{{ nomeCurto(aberta.nome) }}</h2>
          <button type="button" @click="aberta = null">Fechar</button>
        </header>
        <div class="skill-modal-corpo">
          <Markdown v-if="aberta.corpo.trim()" :text="aberta.corpo" />
          <p v-else class="muted">Esta skill não tem conteúdo.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.aba-contagem {
  margin-left: 6px;
  font-size: var(--fs-small);
  color: var(--text-soft);
}

.adicionar {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.adicionar-bloco h3,
.grupo-titulo {
  margin: 0 0 2px;
  font-size: var(--fs-base);
}

.adicionar-bloco > p {
  margin: 0 0 var(--space-2);
}

.descricao {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.caminho {
  word-break: break-all;
}

.origem {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.origem input {
  flex: 1;
  min-width: 220px;
  font-family: var(--mono);
}

.origem .ref {
  flex: 0 1 180px;
  min-width: 140px;
}

.plugin {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.plugin-topo,
.requisito-topo {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.plugin-nome {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.plugin-erros {
  padding: var(--space-2) var(--space-3);
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--error) 45%, var(--border));
  color: var(--error);
}

.plugin-erros p {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
}

.plugin-secao {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.requisitos {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.requisito {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.requisito-edicao {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.requisito-edicao input {
  flex: 1;
  min-width: 200px;
}

.plugin-detalhes summary {
  cursor: pointer;
  color: var(--text-soft);
}

.plugin-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: var(--space-2);
}

.plugin-chip {
  font-size: var(--fs-small);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-soft);
}

.papel-modelos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}

.busca {
  width: 100%;
}

.grupos {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.skill-modal {
  width: min(760px, calc(100% - 32px));
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
}

.skill-modal-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
}

.skill-modal-topo h2 {
  margin: 0;
}

.skill-modal-corpo {
  overflow: auto;
  padding-top: var(--space-3);
}
</style>
