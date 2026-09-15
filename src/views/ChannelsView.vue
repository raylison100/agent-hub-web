<script setup lang="ts">
import type { CanalId, EstadoDoCanal, ServerFrame } from '@agent-hub/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'

interface CanalPlanejado {
  id: CanalId
  nome: string
  descricao: string
}

const planejados: CanalPlanejado[] = [
  { id: 'slack', nome: 'Slack', descricao: 'Bot no workspace do Slack, por Socket Mode, sem endereco publico.' },
  { id: 'discord', nome: 'Discord', descricao: 'Bot num servidor do Discord, por mensagem direta ou canal.' },
  { id: 'whatsapp', nome: 'WhatsApp por API', descricao: 'Numero de WhatsApp de um provedor com API HTTP (envio e webhook).' },
]

const canais = ref<EstadoDoCanal[]>([])
const selecionado = ref<CanalId>('telegram')
const valores = ref<Record<string, string>>({})
const erro = ref('')
const aviso = ref('')
const ocupado = ref(false)

const atual = computed(() => canais.value.find((c) => c.id === selecionado.value))
const planejado = computed(() => planejados.find((p) => p.id === selecionado.value && !canais.value.some((c) => c.id === p.id)))

function receber(f: Extract<ServerFrame, { type: 'canais.estado' }>): void {
  canais.value = f.canais
  if (f.aviso) aviso.value = f.aviso
}

async function pedir(frame: Parameters<typeof client.request>[0]): Promise<void> {
  erro.value = ''
  aviso.value = ''
  ocupado.value = true
  try {
    receber(await client.request(frame, 'canais.estado', 30000))
  } catch (err) {
    erro.value = err instanceof Error ? err.message : String(err)
  } finally {
    ocupado.value = false
  }
}

async function salvar(): Promise<void> {
  if (!atual.value) return
  await pedir({ type: 'canal.salvar', canal: atual.value.id, valores: valores.value })
  if (!erro.value) valores.value = {}
}

function quando(ts: number): string {
  return new Date(ts).toLocaleString()
}

function nomeDe(p: { id: string; nome?: string; usuario?: string }): string {
  return [p.nome, p.usuario ? `@${p.usuario}` : ''].filter(Boolean).join(' ') || p.id
}

watch(selecionado, () => {
  valores.value = {}
  erro.value = ''
  aviso.value = ''
})

let desligar: (() => void) | null = null

onMounted(async () => {
  desligar = client.on((f) => {
    if (f.type === 'canais.estado') canais.value = f.canais
  })
  await useConnection().whenOnline().catch(() => undefined)
  await pedir({ type: 'canais.estado' })
})

onUnmounted(() => desligar?.())
</script>

<template>
  <section class="settings-page canais">
    <h1>Canais</h1>
    <p class="muted small">
      Converse com os agentes fora da interface, receba as respostas das automacoes e aprove ferramentas pelo celular. Credenciais ficam cifradas no
      daemon, como as chaves.
    </p>

    <div class="canais-abas">
      <button
        v-for="c in canais"
        :key="c.id"
        type="button"
        :class="['canal-aba', { ativo: selecionado === c.id }]"
        @click="selecionado = c.id"
      >
        {{ c.nome }}
        <span v-if="c.rodando" class="badge">ligado</span>
        <span v-else-if="c.configurado" class="badge muted-badge">desligado</span>
      </button>
      <button
        v-for="p in planejados.filter((p) => !canais.some((c) => c.id === p.id))"
        :key="p.id"
        type="button"
        :class="['canal-aba', { ativo: selecionado === p.id }]"
        @click="selecionado = p.id"
      >
        {{ p.nome }} <span class="badge muted-badge">em breve</span>
      </button>
    </div>

    <div v-if="planejado" class="canal-bloco">
      <h2>{{ planejado.nome }}</h2>
      <p class="muted">{{ planejado.descricao }}</p>
      <p class="muted small">Ainda nao disponivel nesta versao.</p>
    </div>

    <template v-if="atual">
      <div class="canal-bloco">
        <h2>{{ atual.nome }}</h2>
        <p class="muted">{{ atual.descricao }}</p>
        <ol class="canal-passos">
          <li v-for="(passo, i) in atual.passos" :key="i">{{ passo }}</li>
        </ol>
      </div>

      <form class="canal-bloco secret-form" @submit.prevent="salvar()">
        <h2>Credenciais</h2>
        <label v-for="campo in atual.campos" :key="campo.chave">
          {{ campo.rotulo }}
          <input
            v-model="valores[campo.chave]"
            :type="campo.segredo ? 'password' : 'text'"
            :placeholder="campo.preenchido ? (campo.segredo ? `salvo, ${campo.dica}; cole outro para trocar` : campo.dica) : (campo.exemplo ?? '')"
            autocomplete="off"
            spellcheck="false"
          />
          <span v-if="campo.ajuda" class="muted small">{{ campo.ajuda }}</span>
        </label>
        <div class="row">
          <button class="primary" type="submit" :disabled="ocupado">{{ atual.configurado ? 'Salvar e conferir' : 'Conferir e salvar' }}</button>
          <span v-if="atual.conta" class="muted small">conta: <strong>{{ atual.conta }}</strong></span>
        </div>
      </form>

      <div v-if="atual.configurado" class="canal-bloco">
        <h2>Funcionamento</h2>
        <div class="row">
          <button v-if="!atual.ligado" class="primary" type="button" :disabled="ocupado" @click="pedir({ type: 'canal.ligar', canal: atual.id, ligado: true })">
            Ligar
          </button>
          <button v-else type="button" :disabled="ocupado" @click="pedir({ type: 'canal.ligar', canal: atual.id, ligado: false })">Desligar</button>
          <button type="button" :disabled="ocupado || !atual.rodando" @click="pedir({ type: 'canal.testar', canal: atual.id })">Enviar mensagem de teste</button>
          <span class="muted small">{{ atual.rodando ? 'recebendo mensagens' : 'parado' }}</span>
        </div>
        <p v-if="atual.erro" class="error small">{{ atual.erro }}</p>
      </div>

      <div v-if="atual.configurado" class="canal-bloco">
        <h2>Pediram acesso</h2>
        <p class="muted small">Quem manda mensagem para o bot e ainda nao tem acesso aparece aqui. So pessoas permitidas conversam com os agentes.</p>
        <p v-if="atual.pedidos.length === 0" class="muted small">
          {{ atual.rodando ? 'Ninguem ainda. Mande uma mensagem para o bot.' : 'Ligue o canal e mande uma mensagem para o bot.' }}
        </p>
        <ul class="canal-pessoas">
          <li v-for="p in atual.pedidos" :key="p.id">
            <span>{{ nomeDe(p) }} <span class="muted small">id {{ p.id }}, {{ quando(p.em) }}</span></span>
            <span class="row">
              <button class="primary" type="button" @click="pedir({ type: 'canal.permitir', canal: atual.id, pessoa: p.id })">Permitir</button>
              <button type="button" @click="pedir({ type: 'canal.remover_pessoa', canal: atual.id, pessoa: p.id })">Ignorar</button>
            </span>
          </li>
        </ul>
      </div>

      <div v-if="atual.configurado" class="canal-bloco">
        <h2>Pessoas permitidas</h2>
        <p class="muted small">A primeira pessoa da lista recebe as respostas das automacoes que avisam neste canal.</p>
        <p v-if="atual.permitidos.length === 0" class="muted small">Nenhuma ainda.</p>
        <ul class="canal-pessoas">
          <li v-for="p in atual.permitidos" :key="p.id">
            <span>{{ nomeDe(p) }} <span class="muted small">id {{ p.id }}{{ p.conversa ? '' : ', ainda nao falou com o bot' }}</span></span>
            <button type="button" @click="pedir({ type: 'canal.remover_pessoa', canal: atual.id, pessoa: p.id })">Remover</button>
          </li>
        </ul>
      </div>

      <div v-if="atual.configurado" class="canal-bloco">
        <button type="button" :disabled="ocupado" @click="pedir({ type: 'canal.apagar', canal: atual.id })">Apagar configuracao deste canal</button>
      </div>
    </template>

    <p v-if="aviso" class="muted small">{{ aviso }}</p>
    <p v-if="erro" class="error small">{{ erro }}</p>
  </section>
</template>
