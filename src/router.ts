import { createRouter, createWebHistory } from 'vue-router'
import AgentsView from './views/AgentsView.vue'
import AutomationsView from './views/AutomationsView.vue'
import ChatView from './views/ChatView.vue'
import ConnectView from './views/ConnectView.vue'
import ConnectorsView from './views/ConnectorsView.vue'
import CostView from './views/CostView.vue'
import PluginsView from './views/PluginsView.vue'
import SecretsView from './views/SecretsView.vue'
import SessionsView from './views/SessionsView.vue'
import SettingsView from './views/SettingsView.vue'
import SkillsView from './views/SkillsView.vue'

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
        { path: '', redirect: '/settings/custos' },
        { path: 'custos', name: 'costs', component: CostView },
        { path: 'automacoes', name: 'automations', component: AutomationsView },
        { path: 'agentes', name: 'agents', component: AgentsView },
        { path: 'conectores', name: 'connectors', component: ConnectorsView },
        { path: 'skills', name: 'skills', component: SkillsView },
        { path: 'plugins', name: 'plugins', component: PluginsView },
        { path: 'chaves', name: 'secrets', component: SecretsView },
        { path: 'conexao', name: 'settings-connect', component: ConnectView },
      ],
    },
    { path: '/costs', redirect: '/settings/custos' },
    { path: '/agents', redirect: '/settings/agentes' },
    { path: '/automations', redirect: '/settings/automacoes' },
    { path: '/secrets', redirect: '/settings/chaves' },
    { path: '/connectors', redirect: '/settings/conectores' },
  ],
})
