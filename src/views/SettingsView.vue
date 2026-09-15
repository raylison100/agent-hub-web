<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ultimaTela } from '../router'

const router = useRouter()

const grupos: { titulo: string; itens: { nome: string; rota: string }[] }[] = [
  {
    titulo: '',
    itens: [{ nome: 'Visão geral', rota: '/settings/geral' }],
  },
  {
    titulo: 'Agentes e rotinas',
    itens: [
      { nome: 'Agentes', rota: '/settings/agentes' },
      { nome: 'Rotinas', rota: '/settings/automacoes' },
      { nome: 'Memória do projeto', rota: '/settings/contexto' },
    ],
  },
  {
    titulo: 'Canais',
    itens: [{ nome: 'Telegram e WhatsApp', rota: '/settings/canais' }],
  },
  {
    titulo: 'Modelos e gastos',
    itens: [
      { nome: 'Chaves de acesso', rota: '/settings/chaves' },
      { nome: 'Gastos', rota: '/settings/custos' },
      { nome: 'Modelos compartilhados', rota: '/settings/compartilhar' },
    ],
  },
  {
    titulo: 'Integrações',
    itens: [
      { nome: 'Conectores', rota: '/settings/conectores' },
      { nome: 'Plugins', rota: '/settings/plugins' },
      { nome: 'Skills', rota: '/settings/skills' },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      { nome: 'Aparência', rota: '/settings/aparencia' },
      { nome: 'Conexão e dispositivos', rota: '/settings/conexao' },
      { nome: 'Atualizações', rota: '/settings/atualizacoes' },
    ],
  },
]

function fechar(): void {
  void router.push(ultimaTela.path)
}

function onKey(e: KeyboardEvent): void {
  const alvo = e.target as HTMLElement | null
  if (e.key !== 'Escape' || alvo?.closest('input, textarea, select, .modal')) return
  fechar()
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <section class="settings">
    <aside class="settings-nav">
      <button class="settings-back" @click="fechar">&lsaquo; Voltar</button>
      <div class="settings-title">Configurações</div>
      <template v-for="g in grupos" :key="g.titulo || 'inicio'">
        <div v-if="g.titulo" class="settings-group">{{ g.titulo }}</div>
        <RouterLink v-for="i in g.itens" :key="i.rota" :to="i.rota" class="settings-link">{{ i.nome }}</RouterLink>
      </template>
    </aside>
    <div class="settings-body">
      <button class="settings-close" title="Fechar configurações (Esc)" aria-label="Fechar configurações" @click="fechar">×</button>
      <RouterView />
    </div>
  </section>
</template>
