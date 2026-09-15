<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import LimitesDeGasto from '../components/custos/LimitesDeGasto.vue'
import PrecosDeModelos from '../components/custos/PrecosDeModelos.vue'
import RelatorioDeGastos from '../components/custos/RelatorioDeGastos.vue'
import ResumoDeGastos from '../components/custos/ResumoDeGastos.vue'
import type { Aba, StatusDeGasto, TabelaDePrecos } from '../components/custos/formato'
import Card from '../components/ui/Card.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import { client } from '../daemon/client'
import { useConnection } from '../stores/connection'
import { confirmar, mensagemDeErro } from '../ui/feedback'

const route = useRoute()
const router = useRouter()

const abas: { valor: Aba; rotulo: string }[] = [
  { valor: 'resumo', rotulo: 'Resumo' },
  { valor: 'limites', rotulo: 'Limites' },
  { valor: 'precos', rotulo: 'Preços' },
  { valor: 'relatorio', rotulo: 'Relatório' },
]

const carregando = ref(true)
const falhas = ref<string[]>([])
const status = ref<StatusDeGasto | null>(null)
const precos = ref<TabelaDePrecos | null>(null)
const agentes = ref<string[]>([])
const sujo = ref<Record<'limites' | 'precos', boolean>>({ limites: false, precos: false })
const relatorio = ref<InstanceType<typeof RelatorioDeGastos> | null>(null)

const aba = computed<Aba>(() => {
  const q = route.query.aba
  return abas.some((a) => a.valor === q) ? (q as Aba) : 'resumo'
})

/** Troca a aba ativa guardando a escolha no endereço. */
function irPara(destino: Aba): void {
  if (destino === aba.value) return
  void router.replace({ query: { ...route.query, aba: destino } })
}

/** Executa uma leitura guardando a falha para mostrar na tela. */
async function tentar(nome: string, acao: () => Promise<void>): Promise<void> {
  try {
    await acao()
  } catch (err) {
    falhas.value.push(`${nome}: ${mensagemDeErro(err)}`)
  }
}

/** Carrega gastos, preços e agentes do daemon. */
async function carregar(): Promise<void> {
  falhas.value = []
  await Promise.all([
    tentar('gastos', async () => {
      status.value = await client.request({ type: 'cost.status' }, 'cost.status')
    }),
    tentar('preços', async () => {
      precos.value = await client.request({ type: 'pricing.get' }, 'pricing')
    }),
    tentar('agentes', async () => {
      agentes.value = (await client.request({ type: 'agents.list' }, 'agents.list')).agents.map((a) => a.name)
    }),
  ])
  carregando.value = false
}

/** Atualiza todos os dados da página, avisando se houver alterações não salvas. */
async function atualizar(): Promise<void> {
  if ((sujo.value.limites || sujo.value.precos) && !(await confirmar({ titulo: 'Atualizar mesmo assim?', detalhe: 'As alterações não salvas continuam no formulário; os valores gravados podem ter mudado.', botao: 'Atualizar' }))) return
  await Promise.all([carregar(), aba.value === 'relatorio' ? relatorio.value?.carregar() : Promise.resolve()])
}

/** Recebe a tabela de preços gravada e recarrega o resumo de gastos. */
async function precosSalvos(novo: TabelaDePrecos): Promise<void> {
  precos.value = novo
  await tentar('gastos', async () => {
    status.value = await client.request({ type: 'cost.status' }, 'cost.status')
  })
}

onBeforeRouteLeave(async () => {
  if (!sujo.value.limites && !sujo.value.precos) return true
  return confirmar({ titulo: 'Sair sem salvar?', detalhe: 'Você mudou limites ou preços e ainda não salvou.', botao: 'Sair sem salvar', perigo: true })
})

onMounted(async () => {
  await useConnection().whenOnline().catch(() => undefined)
  await carregar()
})
</script>

<template>
  <div class="ui-page">
    <PageHeader titulo="Gastos" descricao="Quanto foi gasto com os modelos de IA, os limites de cada agente e a tabela de preços usada nas contas.">
      <template #acoes>
        <button type="button" @click="atualizar">Atualizar</button>
      </template>
    </PageHeader>

    <div class="ui-segmentos custos-abas" role="tablist" aria-label="Seções de gastos">
      <button
        v-for="a in abas"
        :key="a.valor"
        type="button"
        role="tab"
        :aria-selected="aba === a.valor"
        :class="['ui-segmento', { ativo: aba === a.valor }]"
        @click="irPara(a.valor)"
      >
        {{ a.rotulo }}
        <span v-if="(a.valor === 'limites' || a.valor === 'precos') && sujo[a.valor]" class="custos-marca" title="Alterações não salvas">não salvo</span>
        <span v-else-if="a.valor === 'precos' && precos?.sem_preco.length" class="custos-marca perigo" title="Modelos sem preço">{{ precos.sem_preco.length }}</span>
      </button>
    </div>

    <EmptyState v-if="carregando" titulo="Carregando" carregando />

    <template v-else>
      <Card v-if="falhas.length" perigo titulo="Algumas informações não carregaram">
        <ul class="ui-lista">
          <li v-for="f in falhas" :key="f" class="ui-lista-item">
            <span class="ui-lista-item-texto"><span class="muted">Não consegui carregar {{ f }}</span></span>
          </li>
        </ul>
        <template #acoes>
          <button type="button" @click="carregar">Tentar de novo</button>
        </template>
      </Card>

      <div v-show="aba === 'resumo'" role="tabpanel">
        <ResumoDeGastos :status="status" :precos="precos" @ir="irPara" />
      </div>
      <div v-show="aba === 'limites'" role="tabpanel">
        <LimitesDeGasto :status="status" :agentes="agentes" @salvo="status = $event" @sujo="sujo.limites = $event" />
      </div>
      <div v-show="aba === 'precos'" role="tabpanel">
        <PrecosDeModelos :precos="precos" @salvo="precosSalvos" @sujo="sujo.precos = $event" />
      </div>
      <div v-show="aba === 'relatorio'" role="tabpanel">
        <RelatorioDeGastos ref="relatorio" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.custos-abas .ui-segmento {
  gap: 6px;
}

.custos-marca {
  font-size: var(--fs-small);
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--warn) 55%, var(--border));
  color: var(--warn);
}

.custos-marca.perigo {
  border-color: color-mix(in srgb, var(--error) 55%, var(--border));
  color: var(--error);
}
</style>
