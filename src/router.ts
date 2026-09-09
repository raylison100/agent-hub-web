import { createRouter, createWebHistory } from 'vue-router'
import AgentsView from './views/AgentsView.vue'
import ChatView from './views/ChatView.vue'
import ConnectView from './views/ConnectView.vue'
import CostView from './views/CostView.vue'
import SessionsView from './views/SessionsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'sessions', component: SessionsView },
    { path: '/connect', name: 'connect', component: ConnectView },
    { path: '/session/:id', name: 'chat', component: ChatView, props: true },
    { path: '/costs', name: 'costs', component: CostView },
    { path: '/agents', name: 'agents', component: AgentsView },
  ],
})
