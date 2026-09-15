<script setup lang="ts">
import type { AgentSummary, EstadoDoCanal, RoleDetail, ScheduleStatus } from '@agent-hub/core'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { avisar, confirmar, mensagemDeErro } from '../ui/feedback'

const router = useRouter()
const carregando = ref(true)
const falha = ref('')
const papeis = ref<RoleDetail[]>([])
const modelos = ref<AgentSummary[]>([])
const errosDeArquivo = ref<{ file: string; message: string }[]>([])
const rotinas = ref<ScheduleStatus[]>([])
const canais = ref<EstadoDoCanal[]>([])

const provedores: Record<string, string> = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google Gemini', deepseek: 'DeepSeek', ollama: 'Ollama (local)' }

function humanizar(nome: string): string {
  const texto = nome.replace(/-/g, ' ')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

const usoPorPapel = computed(() => {
  const mapa = new Map<string, { rotinas: string[]; canais: string[] }>()
  for (const p of papeis.value) mapa.set(p.name, { rotinas: [], canais: [] })
  for (const r of rotinas.value) if (r.role && mapa.has(r.role)) mapa.get(r.role)!.rotinas.push(humanizar(r.id))
  for (const c of canais.value) if (c.padrao.papel && mapa.has(c.padrao.papel)) mapa.get(c.padrao.papel)!.canais.push(c.nome)
  return mapa
})

async function carregar(): Promise<void> {
  carregando.value = true
  falha.value = ''
  try {
    const lista = await client.request({ type: 'agents.list' }, 'agents.list')
    modelos.value = lista.agents
    errosDeArquivo.value = lista.errors
    const [detalhes, agendamentos, estadoCanais] = await Promise.all([
      Promise.all(lista.roles.map((r) => client.request({ type: 'role.get', name: r.name }, 'role.detail').then((d) => d.role))),
      client.request({ type: 'schedule.list' }, 'schedule.list').catch(() => null),
      client.request({ type: 'canais.estado' }, 'canais.estado').catch(() => null),
    ])
    papeis.value = detalhes.sort((a, b) => a.name.localeCompare(b.name))
    rotinas.value = agendamentos?.schedules ?? []
    canais.value = estadoCanais?.canais ?? []
  } catch (err) {
    falha.value = mensagemDeErro(err)
  } finally {
    carregando.value = false
  }
}

async function apagar(papel: RoleDetail): Promise<void> {
  const ok = await confirmar({
    titulo: `Apagar o agente ${humanizar(papel.name)}?`,
    detalhe: 'As instruções e configurações dele saem junto. Conversas antigas continuam no histórico.',
    botao: 'Apagar agente',
  })
  if (!ok) return
  try {
    await client.request({ type: 'role.delete', name: papel.name }, 'role.deleted')
    avisar(`Agente ${humanizar(papel.name)} apagado.`)
    await carregar()
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  }
}

onMounted(async () => {
  await useConnection().whenOnline().catch(() => undefined)
  await carregar()
})
</script>

<template>
  <div class="ui-page">
    <PageHeader titulo="Agentes" descricao="Cada agente tem uma função, instruções e o que pode usar. Crie um agente para cada tipo de trabalho.">
      <template #acoes>
        <button type="button" class="primary" @click="router.push('/settings/agentes/novo')">Novo agente</button>
      </template>
    </PageHeader>

    <EmptyState v-if="carregando" titulo="Carregando" carregando />
    <EmptyState v-else-if="falha" titulo="Não consegui carregar os agentes" :texto="falha">
      <button type="button" @click="carregar">Tentar de novo</button>
    </EmptyState>

    <template v-else>
      <Card v-if="errosDeArquivo.length" titulo="Arquivos com problema" descricao="Estes arquivos de agente não puderam ser lidos e ficaram de fora." perigo>
        <ul class="ui-lista">
          <li v-for="e in errosDeArquivo" :key="e.file" class="ui-lista-item">
            <span class="ui-lista-item-texto"><strong>{{ e.file.split('/').pop() }}</strong><span class="muted">{{ e.message }}</span></span>
          </li>
        </ul>
      </Card>

      <Card titulo="Seus agentes">
        <EmptyState v-if="papeis.length === 0" titulo="Nenhum agente ainda" texto="Crie um agente com instruções, skills e conectores para um tipo de trabalho.">
          <button type="button" class="primary" @click="router.push('/settings/agentes/novo')">Criar agente</button>
        </EmptyState>
        <ul v-else class="ui-lista">
          <li v-for="p in papeis" :key="p.name" class="ui-lista-item agente-item">
            <span class="ui-lista-item-texto">
              <strong>{{ humanizar(p.name) }}</strong>
              <span class="muted">{{ p.description }}</span>
              <span class="agente-chips">
                <span class="agente-chip">Modelo: {{ p.models.join(', ') }}</span>
                <span class="agente-chip">{{ p.skills.length }} {{ p.skills.length === 1 ? 'skill' : 'skills' }}</span>
                <span class="agente-chip">{{ p.tools.mcp.length }} {{ p.tools.mcp.length === 1 ? 'conector' : 'conectores' }}</span>
                <span v-for="r in usoPorPapel.get(p.name)?.rotinas ?? []" :key="`r-${r}`" class="agente-chip destaque">Rotina: {{ r }}</span>
                <span v-for="c in usoPorPapel.get(p.name)?.canais ?? []" :key="`c-${c}`" class="agente-chip destaque">Canal: {{ c }}</span>
              </span>
            </span>
            <span class="ui-lista-item-acoes">
              <button type="button" class="primary" @click="router.push(`/settings/agentes/${p.name}`)">Editar</button>
              <button type="button" @click="router.push({ path: '/settings/agentes/novo', query: { copiar: p.name } })">Duplicar</button>
              <button type="button" class="danger" @click="apagar(p)">Apagar</button>
            </span>
          </li>
        </ul>
      </Card>

      <Card titulo="Modelos disponíveis" descricao="Os modelos de IA que os agentes podem usar. Por enquanto eles são configurados por arquivo.">
        <ul class="ui-lista">
          <li v-for="m in modelos" :key="m.name" class="ui-lista-item">
            <span class="ui-lista-item-texto">
              <strong>{{ m.name }}</strong>
              <span class="muted">{{ provedores[m.provider] ?? m.provider }} · {{ m.model }}<template v-if="m.description"> · {{ m.description }}</template></span>
            </span>
          </li>
        </ul>
      </Card>
    </template>
  </div>
</template>

<style scoped>
.agente-item {
  align-items: flex-start;
}

.agente-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.agente-chip {
  font-size: var(--fs-small);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-soft);
}

.agente-chip.destaque {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
</style>
