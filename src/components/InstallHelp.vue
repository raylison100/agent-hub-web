<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{ tentando: boolean }>()
defineEmits<{ tentar: [] }>()

const noWindows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)
const pacote = `https://github.com/raylison100/agent-hub/releases/download/v${__VERSAO_DO_PACOTE__}/agent-hub-${__VERSAO_DO_PACOTE__}.tgz`
const wiki = 'https://github.com/raylison100/agent-hub/wiki/Instalacao'
const copiado = ref('')

const passos = computed(() => [
  ...(noWindows
    ? [{ titulo: 'Sem WSL ainda: no PowerShell como administrador, e reinicie o computador depois', comando: 'wsl --install -d Ubuntu' }]
    : []),
  { titulo: `${noWindows ? 'No Ubuntu do WSL, ' : ''}ferramentas de compilacao`, comando: 'sudo apt install -y build-essential python3' },
  { titulo: 'Node 22 ou superior, por exemplo pelo nvm (github.com/nvm-sh/nvm)', comando: 'nvm install 24' },
  { titulo: 'O Agent Hub', comando: `npm install -g ${pacote}` },
  { titulo: 'Configuracao, agentes iniciais e servico que sobe com a maquina', comando: 'agent-hub instalar' },
])

/** Copia um comando para a area de transferencia e marca qual foi copiado. */
async function copiar(comando: string): Promise<void> {
  await navigator.clipboard.writeText(comando).catch(() => undefined)
  copiado.value = comando
  setTimeout(() => {
    if (copiado.value === comando) copiado.value = ''
  }, 2000)
}
</script>

<template>
  <div class="bloco instalar">
    <h2>O daemon nao esta rodando nesta maquina</h2>
    <p class="muted small">
      <template v-if="noWindows">
        O app do Windows e so a janela: quem guarda as conversas, chama os modelos e roda as ferramentas e o daemon, que
        vive no WSL. Instale uma vez e ele passa a subir sozinho.
      </template>
      <template v-else>
        Quem guarda as conversas, chama os modelos e roda as ferramentas e o daemon. Instale uma vez e ele passa a subir
        sozinho.
      </template>
    </p>
    <ol>
      <li v-for="p in passos" :key="p.comando">
        <span class="small">{{ p.titulo }}</span>
        <div class="comando">
          <code>{{ p.comando }}</code>
          <button class="ghost small" type="button" @click="copiar(p.comando)">{{ copiado === p.comando ? 'Copiado' : 'Copiar' }}</button>
        </div>
      </li>
    </ol>
    <p v-if="noWindows" class="muted small">
      Se o <code>agent-hub instalar</code> disser que o systemd esta indisponivel, habilite em <code>/etc/wsl.conf</code>
      com <code>[boot]</code> e <code>systemd=true</code>, rode <code>wsl --shutdown</code> no PowerShell e instale de novo.
    </p>
    <p class="muted small">Passo a passo completo: <code>{{ wiki }}</code></p>
    <div class="row">
      <button class="primary" type="button" :disabled="props.tentando" @click="$emit('tentar')">
        {{ props.tentando ? 'Procurando...' : 'Ja instalei, conectar' }}
      </button>
      <span class="muted small">Esta tela tambem procura sozinha a cada poucos segundos.</span>
    </div>
  </div>
</template>

<style scoped>
.instalar ol {
  margin: 12px 0;
  padding-left: 20px;
  display: grid;
  gap: 10px;
}

.comando {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.comando code {
  flex: 1;
  overflow-x: auto;
  white-space: nowrap;
  padding: 6px 8px;
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--mono);
}
</style>
