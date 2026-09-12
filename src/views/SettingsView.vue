<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ultimaTela } from '../router'

const router = useRouter()

const grupos: { titulo: string; itens: { nome: string; rota: string }[] }[] = [
  {
    titulo: 'Interface',
    itens: [{ nome: 'Aparencia', rota: '/settings/aparencia' }],
  },
  {
    titulo: 'Uso',
    itens: [
      { nome: 'Custos', rota: '/settings/custos' },
      { nome: 'Automacoes', rota: '/settings/automacoes' },
    ],
  },
  {
    titulo: 'Personalizar',
    itens: [
      { nome: 'Agentes', rota: '/settings/agentes' },
      { nome: 'Conectores', rota: '/settings/conectores' },
      { nome: 'Contexto do projeto', rota: '/settings/contexto' },
      { nome: 'Skills', rota: '/settings/skills' },
      { nome: 'Plugins', rota: '/settings/plugins' },
    ],
  },
  {
    titulo: 'Conta',
    itens: [
      { nome: 'Chaves', rota: '/settings/chaves' },
      { nome: 'Conexao', rota: '/settings/conexao' },
    ],
  },
]

function fechar(): void {
  void router.push(ultimaTela.path)
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') fechar()
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <section class="settings">
    <aside class="settings-nav">
      <button class="settings-back" @click="fechar">&lsaquo; Voltar</button>
      <div class="settings-title">Configuracoes</div>
      <template v-for="g in grupos" :key="g.titulo">
        <div class="settings-group">{{ g.titulo }}</div>
        <RouterLink v-for="i in g.itens" :key="i.rota" :to="i.rota" class="settings-link">{{ i.nome }}</RouterLink>
      </template>
    </aside>
    <div class="settings-body">
      <button class="settings-close" title="Fechar configuracoes, tecla Esc" @click="fechar">x</button>
      <RouterView />
    </div>
  </section>
</template>
