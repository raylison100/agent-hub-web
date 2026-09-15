<script setup lang="ts">
import type { ServerFrame } from '@agent-hub/core'
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { avisar, confirmar, mensagemDeErro, useAcao } from '../ui/feedback'

type Servidor = Extract<ServerFrame, { type: 'mcp.servers' }>['servers'][number]
type Estado = 'ok' | 'desligado' | 'erro' | 'atencao' | 'andamento'

const router = useRouter()
const servidores = ref<Servidor[]>([])
const deArquivo = ref<Set<string>>(new Set())
const carregando = ref(true)
const falha = ref('')
const colado = ref('')
const faltamChaves = ref<string[]>([])
const emAndamento = ref<string | null>(null)
const { ocupado, executar } = useAcao()
let desligar: (() => void) | null = null

const exemplo = `{
  "mcpServers": {
    "meu-conector": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"]
    }
  }
}`

/** Traduz o estado técnico do conector em um rótulo simples. */
function estado(s: Servidor): { estado: Estado; texto: string } {
  if (!s.enabled) return { estado: 'desligado', texto: 'Desligado' }
  if (s.oauth === 'pendente') return { estado: 'atencao', texto: 'Aguardando autorização' }
  if (s.error) return { estado: 'erro', texto: 'Com erro' }
  if (s.connected) return { estado: 'ok', texto: 'Conectado' }
  return { estado: 'atencao', texto: 'Não conectado ainda' }
}

function tipo(s: Servidor): string {
  return s.transport === 'http' ? 'Serviço na internet' : 'Programa nesta máquina'
}

async function descobrirEditaveis(lista: Servidor[]): Promise<void> {
  const resultados = await Promise.all(
    lista.map((s) =>
      client
        .request({ type: 'mcp.get', name: s.name }, 'mcp.detail')
        .then(() => s.name)
        .catch(() => null),
    ),
  )
  deArquivo.value = new Set(resultados.filter((n): n is string => n !== null))
}

async function carregar(): Promise<void> {
  falha.value = ''
  try {
    const res = await client.request({ type: 'mcp.servers' }, 'mcp.servers')
    servidores.value = res.servers
    await descobrirEditaveis(res.servers)
  } catch (err) {
    falha.value = mensagemDeErro(err)
  } finally {
    carregando.value = false
  }
}

async function testar(s: Servidor): Promise<void> {
  emAndamento.value = s.name
  const ok = await executar(async () => {
    await client.request({ type: 'mcp.connect', name: s.name }, 'mcp.saved', 90000)
    return true
  })
  emAndamento.value = null
  if (!ok) return
  const res = await client.request({ type: 'mcp.servers' }, 'mcp.servers').catch(() => null)
  if (res) servidores.value = res.servers
  const atual = servidores.value.find((x) => x.name === s.name)
  avisar(`Conectou: ${atual?.tools ?? 0} ${atual?.tools === 1 ? 'ferramenta' : 'ferramentas'}`)
}

async function alternar(s: Servidor): Promise<void> {
  emAndamento.value = s.name
  await executar(async () => {
    await client.request({ type: 'mcp.toggle', name: s.name, enabled: !s.enabled }, 'mcp.saved', 90000)
  }, s.enabled ? `Conector ${s.name} desligado.` : `Conector ${s.name} ligado.`)
  emAndamento.value = null
  await carregar()
}

async function apagar(s: Servidor): Promise<void> {
  const ok = await confirmar({
    titulo: `Apagar o conector ${s.name}?`,
    detalhe: 'Os agentes deixam de usar este conector. As chaves secretas guardadas continuam no cofre.',
    botao: 'Apagar conector',
    perigo: true,
  })
  if (!ok) return
  await executar(async () => {
    await client.request({ type: 'mcp.remove', name: s.name }, 'mcp.saved', 30000)
  }, `Conector ${s.name} apagado.`)
  await carregar()
}

/** Abre a autorização do serviço no navegador; o daemon guarda o acesso quando o serviço responde. */
function autorizar(nome: string): void {
  const base = window.location.origin.startsWith('http') ? window.location.origin : 'http://127.0.0.1:47311'
  window.open(`${base}/oauth/start?server=${encodeURIComponent(nome)}`, '_blank', 'noopener')
}

async function colar(): Promise<void> {
  if (!colado.value.trim()) return
  const res = await executar(() => client.request({ type: 'mcp.add', text: colado.value }, 'mcp.saved', 30000))
  if (!res) return
  colado.value = ''
  faltamChaves.value = res.secrets
  avisar(res.added.length ? `Adicionado: ${res.added.join(', ')}` : 'Nada novo para adicionar.')
  await carregar()
}

async function importar(): Promise<void> {
  const res = await executar(() => client.request({ type: 'mcp.import', source: 'claude-code' }, 'mcp.saved', 30000))
  if (!res) return
  faltamChaves.value = res.secrets
  avisar(res.added.length ? `Importado: ${res.added.join(', ')}` : 'Nada novo para importar.')
  await carregar()
}

onMounted(async () => {
  desligar = client.on((f) => {
    if (f.type === 'mcp.servers') servidores.value = f.servers
  })
  await useConnection().whenOnline().catch(() => undefined)
  await carregar()
})

onUnmounted(() => desligar?.())
</script>

<template>
  <div class="ui-page">
    <PageHeader titulo="Conectores" descricao="Conectores dão aos agentes acesso a outros programas e serviços, como navegador, GitHub ou banco de dados.">
      <template #acoes>
        <button type="button" class="primary" @click="router.push('/settings/conectores/novo')">Novo conector</button>
      </template>
    </PageHeader>

    <EmptyState v-if="carregando" titulo="Carregando" carregando />
    <EmptyState v-else-if="falha && !servidores.length" titulo="Não consegui carregar os conectores" :texto="falha">
      <button type="button" @click="carregar">Tentar de novo</button>
    </EmptyState>

    <template v-else>
      <Card v-if="faltamChaves.length" titulo="Faltam chaves secretas" descricao="Estes itens precisam de uma chave para o conector funcionar.">
        <p class="small">Cadastre em <RouterLink to="/settings/chaves">Chaves de acesso</RouterLink> ou abra o conector e preencha: {{ faltamChaves.join(', ') }}</p>
      </Card>

      <EmptyState v-if="servidores.length === 0" titulo="Nenhum conector ainda" texto="Crie um conector para dar aos agentes acesso a outro programa ou serviço.">
        <button type="button" class="primary" @click="router.push('/settings/conectores/novo')">Criar conector</button>
      </EmptyState>

      <ul v-else class="ui-lista conector-lista">
        <li v-for="s in servidores" :key="s.name" class="ui-card conector-item">
          <div class="conector-topo">
            <strong class="conector-nome">{{ s.name }}</strong>
            <StatusBadge :estado="estado(s).estado" :texto="estado(s).texto" />
          </div>

          <div class="conector-chips">
            <span class="conector-chip">{{ tipo(s) }}</span>
            <span v-if="s.connected" class="conector-chip">{{ s.tools }} {{ s.tools === 1 ? 'ferramenta' : 'ferramentas' }}</span>
            <span v-if="!deArquivo.has(s.name)" class="conector-chip">Vem de um plugin</span>
          </div>

          <p class="muted small conector-agentes">
            <template v-if="s.agents.length">
              Usado por:
              <span v-for="a in s.agents" :key="a" class="conector-chip destaque">{{ a }}</span>
            </template>
            <template v-else>Nenhum agente usa este conector ainda.</template>
          </p>

          <p v-if="s.error" class="conector-erro small">{{ s.error }}</p>

          <div class="ui-lista-item-acoes conector-acoes">
            <RouterLink v-if="deArquivo.has(s.name)" :to="`/settings/conectores/${encodeURIComponent(s.name)}`" class="ui-link-botao">Editar</RouterLink>
            <button type="button" :disabled="ocupado || !s.enabled" @click="testar(s)">{{ emAndamento === s.name ? 'Testando...' : 'Testar conexão' }}</button>
            <button v-if="s.oauth" type="button" @click="autorizar(s.name)">{{ s.oauth === 'autorizado' ? 'Autorizar de novo' : 'Autorizar' }}</button>
            <button type="button" :disabled="ocupado" @click="alternar(s)">{{ s.enabled ? 'Desligar' : 'Ligar' }}</button>
            <button v-if="deArquivo.has(s.name)" type="button" class="danger" :disabled="ocupado" @click="apagar(s)">Apagar</button>
          </div>
        </li>
      </ul>

      <details class="ui-card conector-avancado">
        <summary>Avançado: colar JSON ou importar do Claude Code</summary>
        <div class="ui-form">
          <p class="muted small">Cole o JSON que a documentação do conector mostra. Aceita o formato com mcpServers, servers ou um conector solto.</p>
          <textarea v-model="colado" rows="8" class="mono" :placeholder="exemplo" spellcheck="false"></textarea>
          <div class="ui-form-acoes">
            <button type="button" class="primary" :disabled="ocupado || !colado.trim()" @click="colar">Adicionar do JSON</button>
            <button type="button" :disabled="ocupado" @click="importar">Importar do Claude Code</button>
          </div>
        </div>
      </details>
    </template>
  </div>
</template>

<style scoped>
.conector-lista {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  border: 0;
}

.conector-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conector-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.conector-nome {
  font-size: 15px;
  overflow-wrap: anywhere;
}

.conector-chips,
.conector-agentes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
}

.conector-chip {
  font-size: var(--fs-small);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-soft);
}

.conector-chip.destaque {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}

.conector-erro {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  color: var(--error);
  background: color-mix(in srgb, var(--error) 8%, transparent);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.conector-acoes {
  flex-wrap: wrap;
  justify-content: flex-start;
}

.conector-avancado summary {
  cursor: pointer;
  font-weight: 600;
}

.conector-avancado[open] summary {
  margin-bottom: var(--space-3);
}
</style>
