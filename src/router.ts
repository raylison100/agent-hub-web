import { createRouter, createWebHistory } from 'vue-router'
import AgentsView from './views/AgentsView.vue'
import AppearanceView from './views/AppearanceView.vue'
import AutomationsView from './views/AutomationsView.vue'
import ChannelsView from './views/ChannelsView.vue'
import ChatView from './views/ChatView.vue'
import ConnectView from './views/ConnectView.vue'
import ContextView from './views/ContextView.vue'
import ConnectorsView from './views/ConnectorsView.vue'
import CostView from './views/CostView.vue'
import OverviewView from './views/OverviewView.vue'
import PluginsView from './views/PluginsView.vue'
import SecretsView from './views/SecretsView.vue'
import ShareView from './views/ShareView.vue'
import UpdatesView from './views/UpdatesView.vue'
import SessionsView from './views/SessionsView.vue'
import SettingsView from './views/SettingsView.vue'
import SkillsView from './views/SkillsView.vue'

/** Ultima tela fora das configuracoes, para o botao de voltar cair onde o usuario estava. */
export const ultimaTela = { path: '/' }

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'sessions', component: SessionsView },
    { path: '/connect', name: 'connect', component: ConnectView },
    { path: '/session/:id', name: 'chat', component: ChatView, props: true },
    {
      path: '/settings',
      component: SettingsView,
      children: [
        { path: '', redirect: '/settings/geral' },
        { path: 'geral', name: 'overview', component: OverviewView },
        { path: 'aparencia', name: 'appearance', component: AppearanceView },
        { path: 'custos', name: 'costs', component: CostView },
        { path: 'automacoes', name: 'automations', component: AutomationsView },
        { path: 'agentes', name: 'agents', component: AgentsView },
        { path: 'conectores', name: 'connectors', component: ConnectorsView },
        { path: 'contexto', name: 'context', component: ContextView },
        { path: 'skills', name: 'skills', component: SkillsView },
        { path: 'plugins', name: 'plugins', component: PluginsView },
        { path: 'chaves', name: 'secrets', component: SecretsView },
        { path: 'canais', name: 'channels', component: ChannelsView },
        { path: 'compartilhar', name: 'share', component: ShareView },
        { path: 'conexao', name: 'settings-connect', component: ConnectView },
        { path: 'atualizacoes', name: 'updates', component: UpdatesView },
      ],
    },
    { path: '/costs', redirect: '/settings/custos' },
    { path: '/agents', redirect: '/settings/agentes' },
    { path: '/automations', redirect: '/settings/automacoes' },
    { path: '/secrets', redirect: '/settings/chaves' },
    { path: '/connectors', redirect: '/settings/conectores' },
  ],
})

router.beforeEach((to, from) => {
  if (!from.path.startsWith('/settings') && from.path !== '/connect' && from.matched.length > 0) ultimaTela.path = from.fullPath
  return true
})
