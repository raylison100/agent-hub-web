<script setup lang="ts">
import { ref } from 'vue'
import Card from '../ui/Card.vue'
import Field from '../ui/Field.vue'
import { useConnection } from '../../stores/connection'

defineProps<{ ocupado: boolean; comErro: boolean }>()
const emit = defineEmits<{ conectar: []; entrar: [senha: string, nome: string, limpar: () => void]; escolher: [id: string] }>()

const connection = useConnection()
const senha = ref('')
const nomeDoDispositivo = ref(typeof navigator === 'undefined' ? 'dispositivo' : navigator.platform || 'dispositivo')

/** Envia a senha para quem cuida do login e limpa o campo quando der certo. */
function entrar(): void {
  emit('entrar', senha.value, nomeDoDispositivo.value, () => (senha.value = ''))
}
</script>

<template>
  <Card titulo="Conexão manual" descricao="Para ligar esta tela a um Agent Hub que roda em outro computador, direto pela rede ou pelo acesso remoto.">
    <form class="ui-form" @submit.prevent="emit('conectar')">
      <Field rotulo="Como conectar">
        <select v-model="connection.mode">
          <option value="direct">Direto (mesma rede ou VPN)</option>
          <option value="relay">Pelo acesso remoto</option>
        </select>
      </Field>
      <Field :rotulo="connection.mode === 'relay' ? 'Endereço do acesso remoto' : 'Endereço do serviço do Agent Hub'">
        <input
          v-model="connection.url"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :placeholder="connection.mode === 'relay' ? 'wss://acesso.exemplo.com' : 'ws://127.0.0.1:47311/ws'"
        />
      </Field>
      <Field v-if="connection.mode === 'relay'" rotulo="Código de acesso da conta">
        <input v-model="connection.accountToken" type="password" autocomplete="off" />
      </Field>
      <Field rotulo="Código de acesso do serviço">
        <input v-model="connection.token" type="password" autocomplete="off" />
      </Field>
      <p class="muted small">
        No computador onde o Agent Hub está instalado, o comando <code>agent-hub-daemon pair</code> (ou <code>make token</code>) gera um link pronto
        com esses valores.
      </p>
      <div v-if="connection.mode === 'relay' && connection.devices.length" class="aparelhos">
        <p class="muted small">Computadores disponíveis</p>
        <button
          v-for="d in connection.devices"
          :key="d.id"
          type="button"
          :class="{ primary: d.id === connection.deviceId }"
          @click="emit('escolher', d.id)"
        >
          {{ d.name }}
        </button>
      </div>
      <p v-if="!comErro && connection.status === 'error'" class="error" role="alert">{{ connection.detail }}</p>
      <div class="ui-form-acoes">
        <button class="primary" type="submit" :disabled="ocupado">
          {{ ocupado ? 'Conectando...' : connection.mode === 'relay' && !connection.deviceId ? 'Listar computadores' : 'Conectar' }}
        </button>
        <button type="button" @click="connection.disconnect()">Desconectar</button>
      </div>
    </form>
  </Card>

  <Card
    titulo="Entrar com senha"
    descricao="Para um Agent Hub de outro computador que já tem senha definida. Você digita a senha uma vez e este aparelho fica autorizado até alguém revogar o acesso."
  >
    <form class="ui-form" @submit.prevent="entrar">
      <Field rotulo="Nome deste aparelho" ajuda="Aparece na lista de aparelhos autorizados, para você reconhecer depois.">
        <input v-model="nomeDoDispositivo" type="text" autocomplete="off" />
      </Field>
      <Field rotulo="Senha">
        <input v-model="senha" type="password" autocomplete="current-password" />
      </Field>
      <div class="ui-form-acoes">
        <button class="primary" type="submit" :disabled="ocupado || !senha">{{ ocupado ? 'Entrando...' : 'Entrar' }}</button>
      </div>
    </form>
  </Card>
</template>

<style scoped>
.aparelhos {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.aparelhos p {
  flex-basis: 100%;
  margin: 0;
}
</style>
