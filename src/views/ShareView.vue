<script setup lang="ts">
import type { ConvidadoResumo, RecebidoResumo } from '@agent-hub/core'
import { computed, onMounted, ref } from 'vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Field from '../components/ui/Field.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { useSessions } from '../stores/sessions'
import { avisar, mensagemDeErro } from '../ui/feedback'

const sessions = useSessions()
const erro = ref('')
const carregando = ref(true)
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
    erro.value = mensagemDeErro(err)
  } finally {
    carregando.value = false
  }
}

onMounted(async () => {
  await useConnection().whenOnline().catch(() => undefined)
  await carregar()
})

async function criarConvite(): Promise<void> {
  conviteGerado.value = ''
  try {
    const res = await client.request(
      { type: 'compartilhar.criar', nome: nome.value, modelos: escolhidos.value, limite_tokens_dia: Number(limite.value), janela: Number(janela.value) },
      'compartilhar.criado',
    )
    conviteGerado.value = res.convite
    nome.value = ''
    escolhidos.value = []
    avisar('Convite gerado.')
    await carregar()
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
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
    avisar(`Convite de ${alvo.nome} revogado.`)
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  }
}

async function adicionarConvite(): Promise<void> {
  try {
    recebidos.value = (await client.request({ type: 'recebidos.adicionar', convite: textoConvite.value, no_roteamento: noRoteamento.value }, 'recebidos.lista')).recebidos
    textoConvite.value = ''
    avisar('Convite adicionado.')
    await sessions.loadAgents()
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
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
    avisar(mensagemDeErro(err), 'erro')
  }
}

function formatar(n: number): string {
  return n.toLocaleString('pt-BR')
}
</script>

<template>
  <div class="ui-page">
    <PageHeader
      titulo="Modelos compartilhados"
      descricao="Use os modelos do Ollama de pessoas de confiança, ou libere os seus para elas. Arquivos e ferramentas continuam na máquina de quem usa."
    />

    <EmptyState v-if="carregando" titulo="Carregando" carregando />
    <EmptyState v-else-if="erro" titulo="Não consegui carregar os compartilhamentos" :texto="erro">
      <button @click="carregar">Tentar de novo</button>
    </EmptyState>

    <template v-else>
      <Card
        titulo="Compartilhar os meus"
        descricao="Gere um convite para alguém usar os modelos desta máquina. Quem compartilha vê os pedidos, porque é a placa dele que processa."
      >
        <EmptyState v-if="!relayConfigurado" titulo="Falta configurar o relay">
          <p class="muted small">Configure <code>relay_url</code> no <code>config.toml</code> e reinicie o daemon.</p>
        </EmptyState>
        <form v-else class="ui-form duas-colunas" @submit.prevent="criarConvite">
          <Field rotulo="Para quem" obrigatorio style="grid-column: 1 / -1">
            <input v-model="nome" type="text" autocomplete="off" placeholder="nome da pessoa" />
          </Field>
          <fieldset style="grid-column: 1 / -1">
            <legend class="small">Modelos liberados</legend>
            <p v-if="!modelosLocais.length" class="muted small">Nenhum modelo encontrado no Ollama desta máquina.</p>
            <label v-for="m in modelosLocais" :key="m" class="opcao">
              <input v-model="escolhidos" type="checkbox" :value="m" />
              <code>{{ m }}</code>
            </label>
          </fieldset>
          <Field rotulo="Limite de tokens por dia">
            <input v-model="limite" type="number" min="1000" step="1000" />
          </Field>
          <Field rotulo="Janela de contexto">
            <input v-model="janela" type="number" min="1024" step="1024" />
          </Field>
          <div class="ui-form-acoes">
            <button class="primary" type="submit" :disabled="!nome.trim() || !escolhidos.length">Gerar convite</button>
          </div>
        </form>
        <div v-if="conviteGerado" class="convite">
          <p class="small">Mande este convite só para essa pessoa, por um canal privado. Quem tem o convite usa os modelos liberados.</p>
          <code class="texto">{{ conviteGerado }}</code>
          <button type="button" @click="copiarConvite">{{ copiado ? 'Copiado' : 'Copiar convite' }}</button>
        </div>
      </Card>

      <Card titulo="Convites emitidos" :descricao="ativos.length ? `${ativos.length} convite(s) ativo(s).` : 'Quem pode usar os seus modelos.'">
        <EmptyState v-if="!convidados.length" titulo="Nenhum convite emitido" texto="Gere um convite no quadro acima para liberar os seus modelos." />
        <ul v-else class="ui-lista">
          <li v-for="c in convidados" :key="c.id" class="ui-lista-item">
            <span class="ui-lista-item-texto">
              <strong>{{ c.nome }}</strong>
              <span class="muted">{{ c.modelos.join(', ') }}</span>
              <span class="muted">
                {{ c.revogado_em ? 'revogado' : `${formatar(c.uso_hoje)} de ${formatar(c.limite_tokens_dia)} tokens hoje, ${c.conectado ? 'sala no ar' : 'sala fora do ar'}` }}
              </span>
            </span>
            <button v-if="!c.revogado_em" class="danger small" type="button" @click="revogar = c">Revogar</button>
          </li>
        </ul>
      </Card>

      <Card titulo="Modelos que recebi" descricao="Cole aqui o convite que alguém mandou para usar os modelos dessa pessoa.">
        <form class="ui-form" @submit.prevent="adicionarConvite">
          <Field rotulo="Convite">
            <textarea v-model="textoConvite" rows="3" spellcheck="false" placeholder="agenthub-convite-1..."></textarea>
          </Field>
          <label class="opcao">
            <input v-model="noRoteamento" type="checkbox" />
            Usar só quando eu escolher o agente (fora do roteamento automático)
          </label>
          <div class="ui-form-acoes">
            <button class="primary" type="submit" :disabled="!textoConvite.trim()">Adicionar</button>
          </div>
        </form>
        <EmptyState v-if="!recebidos.length" titulo="Nenhum convite recebido" />
        <ul v-else class="ui-lista">
          <li v-for="r in recebidos" :key="r.id" class="ui-lista-item">
            <span class="ui-lista-item-texto">
              <strong>{{ r.anfitriao }}</strong>
              <span class="muted">agentes: {{ r.agentes.join(', ') }}</span>
              <span class="muted">{{ r.no_roteamento ? 'só quando escolhido' : 'entra no roteamento automático' }}, até {{ formatar(r.limite_tokens_dia) }} tokens por dia</span>
              <span v-if="testes.get(r.id)" class="small">{{ testes.get(r.id) }}</span>
            </span>
            <span class="ui-lista-item-acoes">
              <button class="ghost small" type="button" @click="testar(r)">Testar</button>
              <button class="danger small" type="button" @click="remover = r">Remover</button>
            </span>
          </li>
        </ul>
      </Card>
    </template>

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
      :detail="`Os agentes de ${remover.anfitriao} somem desta máquina.`"
      confirm-label="Remover"
      @confirm="confirmarRemover"
      @cancel="remover = null"
    />
  </div>
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

textarea {
  width: 100%;
  font-family: var(--mono);
}
</style>
