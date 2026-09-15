<script setup lang="ts">
import { reactive, watch } from 'vue'
import Card from '../components/ui/Card.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import { acentos, aplicar, carregar, fontes, salvar, type Densidade, type Tamanho, type Tema } from '../theme'

const a = reactive(carregar())

const temas: { valor: Tema; nome: string; detalhe: string }[] = [
  { valor: 'sistema', nome: 'Sistema', detalhe: 'Segue o tema do seu computador' },
  { valor: 'escuro', nome: 'Escuro', detalhe: 'Fundo escuro sempre' },
  { valor: 'claro', nome: 'Claro', detalhe: 'Fundo claro sempre' },
]

const tamanhos: { valor: Tamanho; nome: string }[] = [
  { valor: 'pequena', nome: 'Pequena' },
  { valor: 'media', nome: 'Média' },
  { valor: 'grande', nome: 'Grande' },
]

const densidades: { valor: Densidade; nome: string; detalhe: string }[] = [
  { valor: 'confortavel', nome: 'Confortável', detalhe: 'Mais respiro entre os itens' },
  { valor: 'compacta', nome: 'Compacta', detalhe: 'Cabe mais coisa na tela' },
]

watch(
  a,
  (valor) => {
    aplicar(valor)
    salvar({ ...valor })
  },
  { deep: true },
)
</script>

<template>
  <div class="ui-page">
    <PageHeader titulo="Aparência" descricao="Tema, cores e tamanho do texto neste dispositivo. As mudanças valem na hora." />

    <Card titulo="Tema">
      <div class="opcoes">
        <button v-for="t in temas" :key="t.valor" class="opcao" :class="{ ativa: a.tema === t.valor }" @click="a.tema = t.valor">
          <span class="opcao-nome">{{ t.nome }}</span>
          <span class="opcao-detalhe">{{ t.detalhe }}</span>
        </button>
      </div>
    </Card>

    <Card titulo="Cor de destaque">
      <div class="cores">
        <button
          v-for="c in acentos"
          :key="c.valor"
          class="cor"
          :class="{ ativa: a.acento === c.valor }"
          :style="{ background: c.valor }"
          :title="c.nome"
          @click="a.acento = c.valor"
        ></button>
        <label class="cor-custom" title="Escolher outra cor">
          <input type="color" :value="a.acento" @input="a.acento = ($event.target as HTMLInputElement).value" />
        </label>
      </div>
    </Card>

    <Card titulo="Tamanho do texto">
      <div class="opcoes">
        <button v-for="t in tamanhos" :key="t.valor" class="opcao" :class="{ ativa: a.tamanho === t.valor }" @click="a.tamanho = t.valor">
          <span class="opcao-nome">{{ t.nome }}</span>
        </button>
      </div>
    </Card>

    <Card titulo="Densidade">
      <div class="opcoes">
        <button v-for="d in densidades" :key="d.valor" class="opcao" :class="{ ativa: a.densidade === d.valor }" @click="a.densidade = d.valor">
          <span class="opcao-nome">{{ d.nome }}</span>
          <span class="opcao-detalhe">{{ d.detalhe }}</span>
        </button>
      </div>
    </Card>

    <Card titulo="Fonte da interface">
      <div class="opcoes">
        <button
          v-for="f in fontes"
          :key="f.nome"
          class="opcao"
          :class="{ ativa: a.fonte === f.valor }"
          :style="{ fontFamily: f.valor }"
          @click="a.fonte = f.valor"
        >
          <span class="opcao-nome">{{ f.nome }}</span>
        </button>
      </div>
    </Card>

    <Card titulo="Prévia" descricao="Como as mensagens ficam com as escolhas acima.">
      <div class="previa">
        <div class="bubble user"><pre>Como fica uma mensagem minha</pre></div>
        <div class="assistant-text">
          <div class="markdown">
            <p>Resposta com <strong>negrito</strong>, <code>código curto</code> e link.</p>
            <ul>
              <li>Item de lista</li>
              <li>Outro item</li>
            </ul>
            <figure class="code-block">
              <figcaption><span>ts</span><button type="button" class="code-copy">copiar</button></figcaption>
              <pre><code class="hljs"><span class="hljs-keyword">const</span> <span class="hljs-title">soma</span> = (a, b) =&gt; a + b</code></pre>
            </figure>
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>
