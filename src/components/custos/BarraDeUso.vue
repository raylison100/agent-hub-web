<script setup lang="ts">
import { computed } from 'vue'
import { percentual } from './formato'

const props = defineProps<{ valor: number; limite: number | null | undefined; pequena?: boolean }>()

const pct = computed(() => percentual(props.valor, props.limite))
const nivel = computed(() => (pct.value >= 100 ? 'perigo' : pct.value >= 80 ? 'aviso' : 'normal'))
</script>

<template>
  <div
    :class="['barra-uso', nivel, { pequena }]"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="Math.min(100, Math.round(pct))"
  >
    <div class="barra-uso-preenchimento" :style="{ width: `${Math.min(100, pct)}%` }"></div>
  </div>
</template>

<style scoped>
.barra-uso {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  overflow: hidden;
}

.barra-uso.pequena {
  height: 6px;
}

.barra-uso-preenchimento {
  height: 100%;
  background: var(--ok);
  transition: width 0.2s;
}

.barra-uso.aviso .barra-uso-preenchimento {
  background: var(--warn);
}

.barra-uso.perigo .barra-uso-preenchimento {
  background: var(--error);
}
</style>
