<script setup lang="ts">
import { computed } from 'vue'
import Card from '../ui/Card.vue'
import EmptyState from '../ui/EmptyState.vue'
import Icone from '../ui/Icone.vue'
import StatusBadge from '../ui/StatusBadge.vue'
import BarraDeUso from './BarraDeUso.vue'
import { percentual, usd, type Aba, type StatusDeGasto, type TabelaDePrecos } from './formato'

const props = defineProps<{ status: StatusDeGasto | null; precos: TabelaDePrecos | null }>()
const emit = defineEmits<{ ir: [aba: Aba] }>()

const agentes = computed(() =>
  Object.entries(props.status?.agents ?? {})
    .map(([nome, a]) => ({ nome, ...a }))
    .sort((a, b) => b.today_usd - a.today_usd || a.nome.localeCompare(b.nome)),
)

const tabelaAntiga = computed(() => (props.precos?.idade_dias ?? 0) > 30)

/** Texto do uso contra um limite, ou null quando não há limite. */
function textoDoLimite(valor: number, limite: number | null | undefined): string | null {
  if (limite === null || limite === undefined) return null
  return `${usd(valor)} de ${usd(limite)} (${Math.round(percentual(valor, limite))}%)`
}
</script>

<template>
  <div class="resumo">
    <Card v-if="precos && precos.sem_preco.length" perigo titulo="Modelos sem preço">
      <div class="resumo-alerta">
        <span class="resumo-alerta-icone"><Icone nome="alerta" /></span>
        <p>
          Estes modelos estão sem preço e os agentes que usam ficam parados: <strong>{{ precos.sem_preco.join(', ') }}</strong>.
          Informe o preço para eles voltarem a funcionar.
        </p>
      </div>
      <template #acoes>
        <button type="button" class="primary" @click="emit('ir', 'precos')">Preencher preços</button>
      </template>
    </Card>

    <Card v-if="precos && tabelaAntiga" titulo="Preços podem estar desatualizados">
      <div class="resumo-alerta">
        <StatusBadge estado="atencao" :texto="`${precos.idade_dias} dias`" />
        <p>Tabela de preços com {{ precos.idade_dias }} dias: confira nos sites das empresas.</p>
      </div>
      <template #acoes>
        <button type="button" @click="emit('ir', 'precos')">Ver preços</button>
      </template>
    </Card>

    <EmptyState v-if="!status" titulo="Resumo indisponível" texto="Não consegui carregar os gastos agora. Tente atualizar a página." />

    <template v-else>
      <div class="ui-grade">
        <Card titulo="Hoje">
          <p class="resumo-valor">{{ usd(status.today_usd) }}</p>
          <p class="muted small">Soma de todos os agentes desde a meia-noite.</p>
        </Card>
        <Card titulo="Este mês">
          <p class="resumo-valor">{{ usd(status.month_usd) }}</p>
          <template v-if="status.global_month_limit_usd !== null">
            <BarraDeUso :valor="status.month_usd" :limite="status.global_month_limit_usd" />
            <p class="muted small">{{ textoDoLimite(status.month_usd, status.global_month_limit_usd) }}</p>
          </template>
          <p v-else class="muted small">
            Sem limite mensal.
            <button type="button" class="link" @click="emit('ir', 'limites')">Definir um limite</button>
          </p>
        </Card>
      </div>

      <Card
        v-if="status.automation_month_limit_usd !== undefined && status.automation_month_limit_usd !== null"
        titulo="Rotinas automáticas neste mês"
        descricao="Gasto dos agentes que rodam sozinhos em horários definidos."
      >
        <BarraDeUso :valor="status.automation_month_usd ?? 0" :limite="status.automation_month_limit_usd" />
        <p class="muted small">{{ textoDoLimite(status.automation_month_usd ?? 0, status.automation_month_limit_usd) }}</p>
      </Card>

      <Card titulo="Por modelo hoje" descricao="Quanto cada modelo gastou hoje e o limite diário dele.">
        <template #acoes>
          <button type="button" @click="emit('ir', 'limites')">Ajustar limites</button>
        </template>
        <EmptyState v-if="agentes.length === 0" titulo="Nenhum gasto por agente" texto="Quando algum agente usar um modelo pago, ele aparece aqui." />
        <ul v-else class="ui-lista">
          <li v-for="a in agentes" :key="a.nome" class="ui-lista-item resumo-agente">
            <span class="ui-lista-item-texto">
              <strong>{{ a.nome }}</strong>
              <span class="muted">
                {{ usd(a.today_usd) }} hoje
                <template v-if="a.day_limit_usd !== null"> de {{ usd(a.day_limit_usd) }} por dia</template>
                <template v-else> · sem limite diário</template>
              </span>
            </span>
            <span class="resumo-agente-barra">
              <BarraDeUso v-if="a.day_limit_usd !== null" pequena :valor="a.today_usd" :limite="a.day_limit_usd" />
            </span>
          </li>
        </ul>
      </Card>
    </template>
  </div>
</template>

<style scoped>
.resumo {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.resumo-valor {
  margin: 0;
  font-size: 30px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.resumo-alerta {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.resumo-alerta p {
  margin: 0;
  overflow-wrap: anywhere;
}

.resumo-alerta-icone {
  color: var(--error);
}

.resumo-agente {
  flex-wrap: wrap;
}

.resumo-agente-barra {
  flex: 0 1 200px;
  min-width: 120px;
}
</style>
