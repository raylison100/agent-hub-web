<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'

interface Skill {
  name: string
  description: string
  source: string
}

const connection = useConnection()
const skills = ref<Skill[]>([])
const busca = ref('')
const error = ref('')
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
  try {
    skills.value = (await client.request({ type: 'skills.list' }, 'skills.list')).skills
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function abrir(s: Skill): Promise<void> {
  if (aberta.value === s.name) {
    aberta.value = null
    return
  }
  error.value = ''
  try {
    const res = await client.request({ type: 'skill.get', name: s.name }, 'skill.get', 20000)
    corpo.value = res.body
    aberta.value = s.name
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <section class="settings-page">
    <div class="page-head">
      <div>
        <h1>Skills</h1>
        <p class="muted small">Instruções reutilizáveis em agents/skills e nos plugins. Cada perfil lista as que pode carregar, e o roteador ativa por regra.</p>
      </div>
      <input v-model="busca" type="search" placeholder="Buscar skill" />
    </div>

    <p v-if="error" class="error small">{{ error }}</p>

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
    <p v-else class="muted small">Nenhuma skill encontrada.</p>
  </section>
</template>
