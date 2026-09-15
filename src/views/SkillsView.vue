<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { avisar, mensagemDeErro } from '../ui/feedback'

interface Skill {
  name: string
  description: string
  source: string
}

const connection = useConnection()
const skills = ref<Skill[]>([])
const busca = ref('')
const error = ref('')
const carregando = ref(true)
const aberta = ref<string | null>(null)
const corpo = ref('')

const filtradas = computed(() => {
  const termo = busca.value.trim().toLowerCase()
  if (!termo) return skills.value
  return skills.value.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(termo))
})

onMounted(async () => {
  await connection.whenOnline()
  await load()
})

async function load(): Promise<void> {
  error.value = ''
  try {
    skills.value = (await client.request({ type: 'skills.list' }, 'skills.list')).skills
  } catch (err) {
    error.value = mensagemDeErro(err)
  } finally {
    carregando.value = false
  }
}

async function abrir(s: Skill): Promise<void> {
  if (aberta.value === s.name) {
    aberta.value = null
    return
  }
  try {
    const res = await client.request({ type: 'skill.get', name: s.name }, 'skill.get', 20000)
    corpo.value = res.body
    aberta.value = s.name
  } catch (err) {
    avisar(mensagemDeErro(err), 'erro')
  }
}
</script>

<template>
  <div class="ui-page">
    <PageHeader titulo="Skills" descricao="Instruções prontas que os agentes carregam quando o pedido combina com elas. Clique numa skill para ler o conteúdo.">
      <template #acoes>
        <input v-model="busca" type="search" placeholder="Buscar skill" style="min-width: 220px" />
      </template>
    </PageHeader>

    <EmptyState v-if="carregando" titulo="Carregando" carregando />
    <EmptyState v-else-if="error" titulo="Não consegui carregar as skills" :texto="error">
      <button @click="load">Tentar de novo</button>
    </EmptyState>

    <Card v-else titulo="Skills disponíveis" descricao="Vêm da pasta agents/skills e dos plugins instalados. Cada agente lista as que pode carregar.">
      <div v-if="filtradas.length" class="master">
        <template v-for="s in filtradas" :key="s.name">
          <button class="master-item" @click="abrir(s)">
            <span>
              <span class="skill-name">{{ s.name }}</span>
              <span class="muted small"> {{ s.description }}</span>
            </span>
            <span class="tag">{{ s.source }}</span>
          </button>
          <pre v-if="aberta === s.name" class="skill-body">{{ corpo }}</pre>
        </template>
      </div>
      <EmptyState v-else-if="busca.trim()" titulo="Nenhuma skill encontrada" texto="Tente buscar por outra palavra.">
        <button @click="busca = ''">Limpar busca</button>
      </EmptyState>
      <EmptyState v-else titulo="Nenhuma skill instalada" texto="Coloque skills na pasta agents/skills ou instale um plugin que traga skills.">
        <RouterLink to="/settings/plugins" class="ui-link-botao">Ver plugins</RouterLink>
      </EmptyState>
    </Card>
  </div>
</template>
