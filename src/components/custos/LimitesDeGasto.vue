<script setup lang="ts">
import type { LimitesDeGasto } from '@agent-hub/core'
import { computed, ref, watch } from 'vue'
import { client } from '../../daemon/client'
import { avisar, useAcao } from '../../ui/feedback'
import Card from '../ui/Card.vue'
import EmptyState from '../ui/EmptyState.vue'
import Field from '../ui/Field.vue'
import { lerValor, paraCampo, usd, type StatusDeGasto } from './formato'

const props = defineProps<{ status: StatusDeGasto | null; agentes: string[] }>()
const emit = defineEmits<{ salvo: [status: StatusDeGasto]; sujo: [sujo: boolean] }>()

interface Formulario {
  global: string
  automacao: string
  agentes: Record<string, string>
}

const form = ref<Formulario>(montar())
const base = ref(JSON.stringify(form.value))
const erros = ref<Record<string, string>>({})
const { ocupado, executar } = useAcao()

const nomes = computed(() => [...new Set([...props.agentes, ...Object.keys(props.status?.agents ?? {})])].sort((a, b) => a.localeCompare(b)))
const mudou = computed(() => JSON.stringify(form.value) !== base.value)

/** Monta o formulário a partir dos limites atuais. */
function montar(): Formulario {
  const s = props.status
  const agentes: Record<string, string> = {}
  for (const nome of new Set([...props.agentes, ...Object.keys(s?.agents ?? {})])) agentes[nome] = paraCampo(s?.agents[nome]?.day_limit_usd)
  return { global: paraCampo(s?.global_month_limit_usd), automacao: paraCampo(s?.automation_month_limit_usd), agentes }
}

/** Volta o formulário para os valores gravados. */
function descartar(): void {
  form.value = montar()
  base.value = JSON.stringify(form.value)
  erros.value = {}
}

/** Valida um campo e devolve o número, null para sem limite ou undefined se inválido. */
function validarCampo(chave: string, texto: string, e: Record<string, string>): number | null | undefined {
  const v = lerValor(texto)
  if (v !== null && (Number.isNaN(v) || v < 0)) {
    e[chave] = 'Use um valor em dólares, zero ou maior. Deixe vazio para não ter limite.'
    return undefined
  }
  return v
}

/** Grava os limites no daemon. */
async function salvar(): Promise<void> {
  const e: Record<string, string> = {}
  const limites: LimitesDeGasto = {
    global_month_usd: validarCampo('global', form.value.global, e) ?? null,
    automation_month_usd: validarCampo('automacao', form.value.automacao, e) ?? null,
    agents: {},
  }
  for (const nome of nomes.value) limites.agents[nome] = validarCampo(`agente:${nome}`, form.value.agentes[nome] ?? '', e) ?? null
  erros.value = e
  if (Object.keys(e).length) {
    avisar('Confira os campos marcados.', 'erro')
    return
  }
  const novo = await executar(() => client.request({ type: 'budgets.save', limites }, 'cost.status'), 'Limites salvos.')
  if (!novo) return
  base.value = JSON.stringify(form.value)
  emit('salvo', novo)
}

/** Diz se o texto digitado é exatamente zero. */
function ehZero(texto: string | undefined): boolean {
  return lerValor(texto ?? '') === 0
}

watch(
  () => [props.status, props.agentes],
  () => {
    if (!mudou.value) descartar()
  },
)

watch(mudou, (v) => emit('sujo', v), { immediate: true })
</script>

<template>
  <form class="limites" novalidate @submit.prevent="salvar">
    <Card titulo="Como os limites funcionam">
      <p class="limites-texto">
        Um limite é o máximo que pode ser gasto no período. Quando o valor é atingido, o agente para e pede sua confirmação para continuar.
        Deixe o campo vazio para não ter limite. Os valores são em dólares (US$).
      </p>
    </Card>

    <Card titulo="Limites do mês">
      <EmptyState v-if="!status" titulo="Limites indisponíveis" texto="Não consegui carregar os limites atuais. Tente atualizar a página." />
      <div v-else class="ui-form duas-colunas">
        <Field
          rotulo="Limite do mês (todos os agentes)"
          :erro="erros.global"
          :ajuda="ehZero(form.global) ? 'Com zero, nenhum agente pode gastar nada neste mês.' : `Gasto neste mês: ${usd(status.month_usd)}.`"
        >
          <div class="limites-campo">
            <span class="limites-moeda">US$</span>
            <input v-model="form.global" type="text" inputmode="decimal" placeholder="sem limite" />
            <button type="button" :disabled="form.global === ''" @click="form.global = ''">Sem limite</button>
          </div>
        </Field>
        <Field
          rotulo="Limite do mês para rotinas automáticas"
          :erro="erros.automacao"
          :ajuda="
            ehZero(form.automacao)
              ? 'Com zero, as rotinas automáticas não podem gastar nada neste mês.'
              : 'Vale só para agentes que rodam sozinhos em horários definidos.'
          "
        >
          <div class="limites-campo">
            <span class="limites-moeda">US$</span>
            <input v-model="form.automacao" type="text" inputmode="decimal" placeholder="sem limite" />
            <button type="button" :disabled="form.automacao === ''" @click="form.automacao = ''">Sem limite</button>
          </div>
        </Field>
      </div>
    </Card>

    <Card titulo="Limite por dia de cada modelo" descricao="Cada modelo (Claude, Gemini, OpenAI...) tem um teto diário somado entre todos os agentes que usam ele. O gasto de hoje aparece ao lado.">
      <EmptyState v-if="nomes.length === 0" titulo="Nenhum modelo encontrado" texto="Quando houver modelos configurados, eles aparecem aqui." />
      <div v-else class="table-wrap">
        <table class="limites-tabela">
          <thead>
            <tr>
              <th>Modelo</th>
              <th class="num">Gasto hoje</th>
              <th>Limite por dia</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="nome in nomes" :key="nome">
              <td>
                <strong>{{ nome }}</strong>
              </td>
              <td class="num">{{ usd(status?.agents[nome]?.today_usd ?? 0) }}</td>
              <td>
                <div class="limites-campo">
                  <span class="limites-moeda">US$</span>
                  <input
                    v-model="form.agentes[nome]"
                    type="text"
                    inputmode="decimal"
                    placeholder="sem limite"
                    :class="{ 'com-erro': erros[`agente:${nome}`] }"
                    :aria-label="`Limite por dia de ${nome}`"
                  />
                  <button type="button" :disabled="!form.agentes[nome]" @click="form.agentes[nome] = ''">Sem limite</button>
                </div>
                <p v-if="erros[`agente:${nome}`]" class="ui-field-erro limites-nota">{{ erros[`agente:${nome}`] }}</p>
                <p v-else-if="ehZero(form.agentes[nome])" class="ui-field-ajuda limites-nota">Com zero, este modelo não pode ser usado.</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>

    <div class="limites-acoes">
      <button type="submit" class="primary" :disabled="ocupado || !mudou">{{ ocupado ? 'Salvando...' : 'Salvar' }}</button>
      <button type="button" :disabled="ocupado || !mudou" @click="descartar">Descartar alterações</button>
      <span class="spacer"></span>
      <span v-if="mudou" class="limites-sujo">Alterações não salvas</span>
    </div>
  </form>
</template>

<style scoped>
.limites {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.limites-texto {
  margin: 0;
  color: var(--text-soft);
}

.limites-campo {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.limites-campo input {
  flex: 1;
  min-width: 80px;
  margin-top: 0;
}

.limites-campo input.com-erro {
  border-color: var(--error);
}

.limites-campo button {
  white-space: nowrap;
}

.limites-moeda {
  color: var(--muted);
  font-size: var(--fs-small);
}

.limites-tabela td {
  vertical-align: top;
}

.limites-tabela td:last-child {
  min-width: 260px;
}

.limites-nota {
  display: block;
  margin: 4px 0 0;
}

.limites-acoes {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow);
}

.limites-sujo {
  color: var(--warn);
  font-size: var(--fs-small);
}
</style>
