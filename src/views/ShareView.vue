<script setup lang="ts">
import type { ConvidadoResumo, RecebidoResumo } from '@agent-hub/core'
import { computed, onMounted, ref } from 'vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { useSessions } from '../stores/sessions'

const sessions = useSessions()
const erro = ref('')
const relayConfigurado = ref(false)
const modelosLocais = ref<string[]>([])
const convidados = ref<ConvidadoResumo[]>([])
const recebidos = ref<RecebidoResumo[]>([])

const nome = ref('')
const escolhidos = ref<string[]>([])
const limite = ref(200000)
const janela = ref(8192)
const conviteGerado = ref('')
const copiado = ref(false)

const textoConvite = ref('')
const noRoteamento = ref(true)
const testes = ref(new Map<string, string>())
const revogar = ref<ConvidadoResumo | null>(null)
const remover = ref<RecebidoResumo | null>(null)

const ativos = computed(() => convidados.value.filter((c) => c.revogado_em === null))

async function carregar(): Promise<void> {
  erro.value = ''
  try {
    const lista = await client.request({ type: 'compartilhar.listar' }, 'compartilhar.lista')
    relayConfigurado.value = lista.relay_configurado
    modelosLocais.value = lista.modelos_locais
    convidados.value = lista.convidados
    recebidos.value = (await client.request({ type: 'recebidos.listar' }, 'recebidos.lista')).recebidos
  } catch (err) {
    erro.value = err instanceof Error ? err.message : String(err)
  }
}

onMounted(async () => {
  await useConnection().whenOnline().catch(() => undefined)
  await carregar()
})

async function criarConvite(): Promise<void> {
  erro.value = ''
  conviteGerado.value = ''
  try {
    const res = await client.request(
      { type: 'compartilhar.criar', nome: nome.value, modelos: escolhidos.value, limite_tokens_dia: Number(limite.value), janela: Number(janela.value) },
      'compartilhar.criado',
    )
    conviteGerado.value = res.convite
    nome.value = ''
    escolhidos.value = []
    await carregar()
  } catch (err) {
    erro.value = err instanceof Error ? err.message : String(err)
  }
}

async function copiarConvite(): Promise<void> {
  await navigator.clipboard.writeText(conviteGerado.value).catch(() => undefined)
  copiado.value = true
  setTimeout(() => (copiado.value = false), 2000)
}

async function confirmarRevogar(): Promise<void> {
  const alvo = revogar.value
  revogar.value = null
  if (!alvo) return
  try {
    const lista = await client.request({ type: 'compartilhar.revogar', id: alvo.id }, 'compartilhar.lista')
    convidados.value = lista.convidados
  } catch (err) {
    erro.value = err instanceof Error ? err.message : String(err)
  }
}

async function adicionarConvite(): Promise<void> {
  erro.value = ''
  try {
    recebidos.value = (await client.request({ type: 'recebidos.adicionar', convite: textoConvite.value, no_roteamento: noRoteamento.value }, 'recebidos.lista')).recebidos
    textoConvite.value = ''
    await sessions.loadAgents()
  } catch (err) {
    erro.value = err instanceof Error ? err.message : String(err)
  }
}

async function testar(r: RecebidoResumo): Promise<void> {
  testes.value.set(r.id, 'testando...')
  try {
    const t = await client.request({ type: 'recebidos.testar', id: r.id }, 'recebidos.teste', 30000)
    testes.value.set(r.id, `${t.ok ? 'ok' : 'falhou'} em ${t.ms} ms: ${t.detalhe}`)
  } catch (err) {
    testes.value.set(r.id, err instanceof Error ? err.message : String(err))
  }
}

async function confirmarRemover(): Promise<void> {
  const alvo = remover.value
  remover.value = null
  if (!alvo) return
  try {
    recebidos.value = (await client.request({ type: 'recebidos.remover', id: alvo.id }, 'recebidos.lista')).recebidos
    await sessions.loadAgents()
  } catch (err) {
    erro.value = err instanceof Error ? err.message : String(err)
  }
}

function formatar(n: number): string {
  return n.toLocaleString('pt-BR')
}
</script>

<template>
  <section class="settings-page">
    <h1>Compartilhar modelos</h1>
    <p class="muted">
      Pessoas de confianca usam os modelos do Ollama umas das outras pelo relay. So a chamada ao modelo atravessa: as
      ferramentas, os arquivos e as aprovacoes ficam na maquina de quem usa. Quem compartilha ve os pedidos, porque e a
      placa dele que processa.
    </p>
    <p v-if="erro" class="error">{{ erro }}</p>

    <div class="bloco">
      <h2>Compartilhar os meus</h2>
      <p v-if="!relayConfigurado" class="muted small">
        Precisa de um relay: configure <code>relay_url</code> no <code>config.toml</code> e reinicie o daemon.
      </p>
      <form v-else @submit.prevent="criarConvite">
        <label>
          Para quem
          <input v-model="nome" type="text" autocomplete="off" placeholder="nome da pessoa" />
        </label>
        <fieldset>
          <legend class="small">Modelos liberados</legend>
          <p v-if="!modelosLocais.length" class="muted small">Nenhum modelo encontrado no Ollama desta maquina.</p>
          <label v-for="m in modelosLocais" :key="m" class="opcao">
            <input v-model="escolhidos" type="checkbox" :value="m" />
            <code>{{ m }}</code>
          </label>
        </fieldset>
        <div class="row">
          <label>
            Limite de tokens por dia
            <input v-model="limite" type="number" min="1000" step="1000" />
          </label>
          <label>
            Janela de contexto
            <input v-model="janela" type="number" min="1024" step="1024" />
          </label>
        </div>
        <button class="primary" type="submit" :disabled="!nome.trim() || !escolhidos.length">Gerar convite</button>
      </form>
      <div v-if="conviteGerado" class="convite">
        <p class="small">Mande este convite so para essa pessoa, por um canal privado. Quem tem o convite usa os modelos liberados.</p>
        <code class="texto">{{ conviteGerado }}</code>
        <button type="button" @click="copiarConvite">{{ copiado ? 'Copiado' : 'Copiar convite' }}</button>
      </div>
      <h2>Convites emitidos</h2>
      <p v-if="!convidados.length" class="muted small">Nenhum.</p>
      <ul class="list">
        <li v-for="c in convidados" :key="c.id">
          <strong>{{ c.nome }}</strong>
          <span class="muted small">{{ c.modelos.join(', ') }}</span>
          <span class="muted small">
            {{ c.revogado_em ? 'revogado' : `${formatar(c.uso_hoje)} de ${formatar(c.limite_tokens_dia)} tokens hoje, ${c.conectado ? 'sala no ar' : 'sala fora do ar'}` }}
          </span>
          <span class="spacer"></span>
          <button v-if="!c.revogado_em" class="ghost small" type="button" @click="revogar = c">Revogar</button>
        </li>
      </ul>
      <p v-if="ativos.length" class="muted small">{{ ativos.length }} convite(s) ativo(s).</p>
    </div>

    <div class="bloco">
      <h2>Modelos que recebi</h2>
      <form @submit.prevent="adicionarConvite">
        <label>
          Convite
          <textarea v-model="textoConvite" rows="3" spellcheck="false" placeholder="agenthub-convite-1..."></textarea>
        </label>
        <label class="opcao">
          <input v-model="noRoteamento" type="checkbox" />
          Usar so quando eu escolher o agente (fora do roteamento automatico)
        </label>
        <button class="primary" type="submit" :disabled="!textoConvite.trim()">Adicionar</button>
      </form>
      <p v-if="!recebidos.length" class="muted small">Nenhum convite recebido.</p>
      <ul class="list">
        <li v-for="r in recebidos" :key="r.id" class="recebido">
          <div>
            <strong>{{ r.anfitriao }}</strong>
            <span class="muted small">agentes: {{ r.agentes.join(', ') }}</span>
            <span class="muted small">{{ r.no_roteamento ? 'so quando escolhido' : 'entra no roteamento automatico' }}, ate {{ formatar(r.limite_tokens_dia) }} tokens por dia</span>
            <span v-if="testes.get(r.id)" class="small">{{ testes.get(r.id) }}</span>
          </div>
          <span class="spacer"></span>
          <button class="ghost small" type="button" @click="testar(r)">Testar</button>
          <button class="ghost small" type="button" @click="remover = r">Remover</button>
        </li>
      </ul>
    </div>

    <ConfirmDialog
      v-if="revogar"
      title="Revogar convite"
      :detail="`${revogar.nome} deixa de usar os seus modelos na hora. Para voltar, gere um convite novo.`"
      confirm-label="Revogar"
      @confirm="confirmarRevogar"
      @cancel="revogar = null"
    />
    <ConfirmDialog
      v-if="remover"
      title="Remover convite recebido"
      :detail="`Os agentes de ${remover.anfitriao} somem desta maquina.`"
      confirm-label="Remover"
      @confirm="confirmarRemover"
      @cancel="remover = null"
    />
  </section>
</template>

<style scoped>
fieldset {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  display: grid;
  gap: 6px;
}

.opcao {
  display: flex;
  align-items: center;
  gap: 8px;
}

.convite {
  display: grid;
  gap: 8px;
  margin: 12px 0;
}

.convite .texto {
  word-break: break-all;
  padding: 8px;
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--mono);
}

.recebido div {
  display: grid;
  gap: 2px;
}

textarea {
  width: 100%;
  font-family: var(--mono);
}
</style>
