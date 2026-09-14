<script setup lang="ts">
import type { AgentSummary, PluginDoClaudeCode, PluginResumo } from '@agent-hub/core'
import { computed, onMounted, ref } from 'vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { useSessions } from '../stores/sessions'

const connection = useConnection()
const sessions = useSessions()
const plugins = ref<PluginResumo[]>([])
const doClaudeCode = ref<PluginDoClaudeCode[]>([])
const agentes = ref<AgentSummary[]>([])
const erro = ref('')
const aviso = ref('')
const ocupado = ref('')
const origem = ref('')
const ref_ = ref('')
const remover = ref<PluginResumo | null>(null)
const papelDe = ref<string | null>(null)
const modelos = ref<string[]>([])

const paraImportar = computed(() => doClaudeCode.value.filter((p) => !p.ja_adicionado))
const ehGit = computed(() => /^(https:\/\/|git@|ssh:\/\/)/.test(origem.value.trim()))

onMounted(async () => {
  await connection.whenOnline().catch(() => undefined)
  await carregar()
})

async function carregar(): Promise<void> {
  erro.value = ''
  try {
    plugins.value = (await client.request({ type: 'plugins.list' }, 'plugins.list')).plugins
    doClaudeCode.value = (await client.request({ type: 'plugins.claude_code' }, 'plugins.claude_code')).plugins
    agentes.value = (await client.request({ type: 'agents.list' }, 'agents.list')).agents
  } catch (err) {
    erro.value = mensagem(err)
  }
}

async function executar(rotulo: string, acao: () => Promise<void>): Promise<void> {
  erro.value = ''
  aviso.value = ''
  ocupado.value = rotulo
  try {
    await acao()
    await sessions.loadAgents().catch(() => undefined)
    doClaudeCode.value = (await client.request({ type: 'plugins.claude_code' }, 'plugins.claude_code')).plugins
  } catch (err) {
    erro.value = mensagem(err)
  } finally {
    ocupado.value = ''
  }
}

function adicionarPasta(pasta: string): Promise<void> {
  return executar(pasta, async () => {
    plugins.value = (await client.request({ type: 'plugins.adicionar', path: pasta }, 'plugins.list', 60000)).plugins
    aviso.value = 'Plugin adicionado. Confira abaixo se falta alguma chave e crie um papel para usar as skills.'
  })
}

function adicionarOrigem(): Promise<void> {
  const valor = origem.value.trim()
  const pedido = ehGit.value ? { type: 'plugins.adicionar' as const, git: valor, ref: ref_.value.trim() || undefined } : { type: 'plugins.adicionar' as const, path: valor }
  return executar('origem', async () => {
    plugins.value = (await client.request(pedido, 'plugins.list', 120000)).plugins
    origem.value = ''
    ref_.value = ''
    aviso.value = 'Plugin adicionado.'
  })
}

function alternar(p: PluginResumo): Promise<void> {
  return executar(p.chave, async () => {
    plugins.value = (await client.request({ type: 'plugins.alternar', chave: p.chave, enabled: !p.enabled }, 'plugins.list')).plugins
  })
}

async function confirmarRemover(): Promise<void> {
  const alvo = remover.value
  remover.value = null
  if (!alvo) return
  await executar(alvo.chave, async () => {
    plugins.value = (await client.request({ type: 'plugins.remover', chave: alvo.chave }, 'plugins.list')).plugins
  })
}

function abrirPapel(p: PluginResumo): void {
  papelDe.value = p.name
  const candidatos = agentes.value.filter((a) => a.provider !== 'ollama' && a.tools.includes('write_file') && !a.name.includes('-'))
  modelos.value = candidatos.slice(0, 2).map((a) => a.name)
}

function criarPapel(): Promise<void> {
  const plugin = papelDe.value
  if (!plugin) return Promise.resolve()
  return executar(`papel-${plugin}`, async () => {
    const criado = await client.request({ type: 'plugins.papel', plugin, modelos: modelos.value }, 'plugins.papel_criado')
    plugins.value = (await client.request({ type: 'plugins.list' }, 'plugins.list')).plugins
    papelDe.value = null
    aviso.value = `Papel ${criado.papel} criado. Numa sessao nova, escolha o papel ${criado.papel} no botao de papel abaixo da caixa de texto.`
  })
}

function mensagem(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
</script>

<template>
  <section class="settings-page">
    <h1>Plugins</h1>
    <p class="muted">
      Pacotes no formato do Claude Code com skills, agentes, servidores MCP e hooks. Um plugin roda comandos na sua maquina
      (servidores MCP, hooks e scripts das skills): adicione so os de origem confiavel.
    </p>
    <p v-if="erro" class="error">{{ erro }}</p>
    <p v-if="aviso" class="small">{{ aviso }}</p>

    <div v-if="paraImportar.length" class="bloco">
      <h2>Instalados no Claude Code</h2>
      <ul class="list">
        <li v-for="p in paraImportar" :key="p.id" class="linha">
          <div class="info">
            <strong>{{ p.nome }}</strong>
            <span v-if="p.versao" class="muted small">versao {{ p.versao }}</span>
            <span class="muted small descricao">{{ p.descricao }}</span>
            <code class="small">{{ p.pasta }}</code>
          </div>
          <button class="primary" type="button" :disabled="Boolean(ocupado)" @click="adicionarPasta(p.pasta)">
            {{ ocupado === p.pasta ? 'Adicionando...' : 'Adicionar' }}
          </button>
        </li>
      </ul>
    </div>

    <div class="bloco">
      <h2>Adicionar por pasta ou git</h2>
      <form class="origem" @submit.prevent="adicionarOrigem">
        <input v-model="origem" type="text" spellcheck="false" autocomplete="off" placeholder="/caminho/do/plugin ou https://github.com/dono/plugin.git" />
        <input v-if="ehGit" v-model="ref_" type="text" spellcheck="false" autocomplete="off" placeholder="branch ou tag (opcional)" class="ref" />
        <button class="primary" type="submit" :disabled="!origem.trim() || Boolean(ocupado)">{{ ocupado === 'origem' ? 'Adicionando...' : 'Adicionar' }}</button>
      </form>
    </div>

    <div class="bloco">
      <h2>Na sua lista</h2>
      <p v-if="!plugins.length" class="muted small">Nenhum plugin ainda.</p>
      <ul class="list">
        <li v-for="p in plugins" :key="p.chave" class="plugin">
          <div class="linha">
            <div class="info">
              <strong>{{ p.name }}</strong>
              <span class="list-meta">
                <span v-if="p.versao" class="muted">versao {{ p.versao }}</span>
                <span class="tag" :data-state="p.enabled ? (p.erros.length ? 'error' : 'on') : 'off'">{{ p.enabled ? (p.erros.length ? 'com erro' : 'ligado') : 'desligado' }}</span>
                <span v-if="p.enabled" class="muted">{{ p.skills }} skills, {{ p.mcp }} MCP, {{ p.agents }} agentes, {{ p.hooks }} hooks</span>
              </span>
              <span v-if="p.descricao" class="muted small descricao">{{ p.descricao }}</span>
            </div>
            <button class="ghost small" type="button" :disabled="Boolean(ocupado)" @click="alternar(p)">{{ p.enabled ? 'Desligar' : 'Ligar' }}</button>
            <button class="ghost small" type="button" :disabled="Boolean(ocupado)" @click="remover = p">Remover</button>
          </div>

          <p v-for="e in p.erros" :key="e" class="error small">{{ e }}</p>
          <p v-if="p.enabled && p.hooks" class="small aviso-hook">Este plugin tem {{ p.hooks }} hook(s): comandos que rodam sozinhos em eventos dos agentes.</p>

          <div v-for="r in p.requisitos" :key="r.campo" class="small requisito">
            <span class="tag" :data-state="r.definida ? 'on' : r.obrigatorio ? 'error' : 'off'">{{ r.definida ? 'chave cadastrada' : 'falta a chave' }}</span>
            {{ r.titulo }}: <code>{{ r.variavel }}</code>
            <RouterLink v-if="!r.definida" to="/settings/chaves">cadastrar em Chaves</RouterLink>
          </div>

          <div v-if="p.enabled && (p.skills || p.mcp)" class="small papel">
            <template v-if="p.papel">Papel <code>{{ p.papel }}</code> pronto: escolha-o numa sessao nova.</template>
            <template v-else-if="papelDe === p.name">
              <span>Modelos que o papel pode usar:</span>
              <label v-for="a in agentes.filter((x) => !x.name.includes('-'))" :key="a.name" class="opcao">
                <input v-model="modelos" type="checkbox" :value="a.name" />
                {{ a.name }}
              </label>
              <button class="primary small" type="button" :disabled="!modelos.length || Boolean(ocupado)" @click="criarPapel">Criar papel</button>
              <button class="ghost small" type="button" @click="papelDe = null">Cancelar</button>
            </template>
            <template v-else>
              <button class="ghost small" type="button" @click="abrirPapel(p)">Criar papel com as skills</button>
              <span class="muted">um papel junta as skills, os servidores MCP e as ferramentas de escrita para voce escolher na sessao</span>
            </template>
          </div>
        </li>
      </ul>
    </div>

    <ConfirmDialog
      v-if="remover"
      title="Remover plugin"
      :detail="`${remover.name} sai da lista e as skills dele somem dos agentes. A pasta do plugin nao e apagada.`"
      confirm-label="Remover"
      @confirm="confirmarRemover"
      @cancel="remover = null"
    />
  </section>
</template>

<style scoped>
.linha {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.info {
  display: grid;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.descricao {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.info code {
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
  display: grid;
  gap: 6px;
}

.requisito,
.papel {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.opcao {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.aviso-hook {
  color: var(--muted);
}
</style>
