<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import { useSessions } from '../stores/sessions'
import { useConnection } from '../stores/connection'

const sessions = useSessions()
const carregando = ref(true)
onMounted(async () => {
  await useConnection().whenOnline().catch(() => undefined)
  await sessions.loadAgents().catch(() => undefined)
  carregando.value = false
})
</script>

<template>
  <div class="ui-page">
    <PageHeader titulo="Agentes" descricao="Os assistentes disponíveis, com o modelo que cada um usa, o limite de gasto e as ferramentas que pode usar." />

    <Card v-if="sessions.agentErrors.length" titulo="Arquivos com problema" descricao="Estes agentes não foram carregados. Corrija o arquivo indicado." perigo>
      <ul class="ui-lista">
        <li v-for="e in sessions.agentErrors" :key="e.file" class="ui-lista-item">
          <span class="ui-lista-item-texto">
            <strong>{{ e.file }}</strong>
            <span class="error small">{{ e.message }}</span>
          </span>
        </li>
      </ul>
    </Card>

    <EmptyState v-if="carregando && !sessions.agents.length" titulo="Carregando" carregando />

    <Card v-else titulo="Agentes cadastrados">
      <EmptyState v-if="!sessions.agents.length" titulo="Nenhum agente encontrado" texto="Os agentes aparecem aqui quando existem arquivos de agente no projeto." />
      <ul v-else class="ui-lista">
        <li v-for="a in sessions.agents" :key="a.name" class="ui-lista-item">
          <span class="ui-lista-item-texto">
            <strong>{{ a.name }}</strong>
            <span class="muted">{{ a.description }}</span>
            <span class="list-meta">
              <span class="tag">{{ a.provider }}/{{ a.model }}</span>
              <span class="tag">raciocínio {{ a.reasoning }}</span>
              <span v-if="a.budget.run_usd !== undefined" class="tag">run {{ a.budget.run_usd }} USD</span>
              <span v-if="a.budget.session_usd !== undefined" class="tag">sessão {{ a.budget.session_usd }} USD</span>
            </span>
            <span class="muted small">{{ a.tools.join(', ') }}</span>
          </span>
        </li>
      </ul>
    </Card>
  </div>
</template>
