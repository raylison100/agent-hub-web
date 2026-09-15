<script setup lang="ts">
import { computed, ref } from 'vue'
import { aprovacaoLegivel } from '../../ui/aprovacoes'

const props = defineProps<{ ferramenta: string; args: unknown; risco: string }>()
const emit = defineEmits<{ aprovar: []; negar: [] }>()
const detalhes = ref(false)
const resumo = computed(() => aprovacaoLegivel(props.ferramenta, props.args, props.risco))
</script>

<template>
  <div class="ui-aprovacao">
    <div class="ui-aprovacao-topo">
      <strong>O agente quer: {{ resumo.titulo }}</strong>
      <span :class="['ui-aprovacao-risco', risco]">{{ resumo.risco }}</span>
    </div>
    <dl v-if="resumo.itens.length" class="ui-aprovacao-itens">
      <template v-for="item in resumo.itens" :key="item.rotulo">
        <dt>{{ item.rotulo }}</dt>
        <dd><code v-if="item.codigo">{{ item.valor }}</code><template v-else>{{ item.valor }}</template></dd>
      </template>
    </dl>
    <pre v-if="resumo.previa" class="ui-aprovacao-previa">{{ resumo.previa }}</pre>
    <button type="button" class="link" @click="detalhes = !detalhes">{{ detalhes ? 'Esconder detalhes técnicos' : 'Ver detalhes técnicos' }}</button>
    <pre v-if="detalhes" class="args">{{ ferramenta }}
{{ JSON.stringify(args, null, 2) }}</pre>
    <div class="approval-actions">
      <button type="button" class="primary" @click="emit('aprovar')">Aprovar</button>
      <button type="button" @click="emit('negar')">Negar</button>
    </div>
  </div>
</template>
