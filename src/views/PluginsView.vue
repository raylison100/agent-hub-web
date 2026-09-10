<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'

interface Plugin {
  name: string
  dir: string
  skills: number
  agents: number
  mcp: number
  hooks: number
}

const connection = useConnection()
const plugins = ref<Plugin[]>([])
const error = ref('')

onMounted(async () => {
  await connection.whenOnline()
  await load()
})

async function load(): Promise<void> {
  try {
    plugins.value = (await client.request({ type: 'plugins.list' }, 'plugins.list')).plugins
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div>
        <h1>Plugins</h1>
        <p class="muted small">
          Pacotes no formato do Claude Code, declarados em agents/plugins.json por caminho local ou repositorio git. Cada plugin traz skills, agentes, servidores MCP e hooks.
        </p>
      </div>
    </div>

    <p v-if="error" class="error small">{{ error }}</p>

    <table v-if="plugins.length" class="grid">
      <thead>
        <tr><th>Plugin</th><th>Skills</th><th>Agentes</th><th>MCP</th><th>Hooks</th><th>Pasta</th></tr>
      </thead>
      <tbody>
        <tr v-for="p in plugins" :key="p.name">
          <td>{{ p.name }}</td>
          <td>{{ p.skills }}</td>
          <td>{{ p.agents }}</td>
          <td>{{ p.mcp }}</td>
          <td>{{ p.hooks }}</td>
          <td class="mono small break">{{ p.dir }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="muted small">Nenhum plugin em agents/plugins.json. Rode agent-hub-daemon plugins sync depois de declarar um repositorio git.</p>
  </section>
</template>
