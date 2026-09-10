<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const grupos: { titulo: string; itens: { nome: string; rota: string }[] }[] = [
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
  void router.push({ name: 'sessions' })
}
</script>

<template>
  <section class="settings">
    <aside class="settings-nav">
      <div class="settings-title">Configuracoes</div>
      <template v-for="g in grupos" :key="g.titulo">
        <div class="settings-group">{{ g.titulo }}</div>
        <RouterLink v-for="i in g.itens" :key="i.rota" :to="i.rota" class="settings-link">{{ i.nome }}</RouterLink>
      </template>
    </aside>
    <div class="settings-body">
      <button class="settings-close" title="Voltar para as sessoes" @click="fechar">x</button>
      <RouterView />
    </div>
  </section>
</template>
