<script setup lang="ts">
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import { Marked } from 'marked'
import { computed, ref } from 'vue'

const props = defineProps<{ text: string }>()
const copiado = ref('')

const marked = new Marked({ gfm: true, breaks: true })

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const idioma = lang && hljs.getLanguage(lang) ? lang : ''
      const corpo = idioma ? hljs.highlight(text, { language: idioma }).value : escapar(text)
      const rotulo = idioma || 'texto'
      return `<figure class="code-block" data-code="${escapar(text)}"><figcaption><span>${rotulo}</span><button type="button" class="code-copy">copiar</button></figcaption><pre><code class="hljs">${corpo}</code></pre></figure>`
    },
  },
})

function escapar(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const html = computed(() => DOMPurify.sanitize(marked.parse(props.text) as string, { ADD_ATTR: ['data-code', 'target'] }))

/** Copia o bloco de codigo clicado, sem depender de biblioteca extra. */
async function onClick(e: MouseEvent): Promise<void> {
  const alvo = e.target as HTMLElement
  if (!alvo.classList.contains('code-copy')) return
  const bloco = alvo.closest('.code-block') as HTMLElement | null
  const texto = bloco?.dataset.code ?? ''
  if (!texto) return
  await navigator.clipboard.writeText(texto).catch(() => undefined)
  copiado.value = texto
  alvo.textContent = 'copiado'
  setTimeout(() => {
    alvo.textContent = 'copiar'
  }, 1500)
}
</script>

<template>
  <div class="markdown" @click="onClick" v-html="html"></div>
</template>
