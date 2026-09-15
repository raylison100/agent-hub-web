<script setup lang="ts">
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import { Marked } from 'marked'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { client } from '../daemon/client'
import { useSessions } from '../stores/sessions'
import { enderecoDoArquivo, pareceArquivoVisualizavel, relativoAoWorkspace, useVisualizacao } from '../stores/visualizacao'

const props = defineProps<{ text: string }>()
const copiado = ref('')
const route = useRoute()
const sessions = useSessions()
const visualizacao = useVisualizacao()

const marked = new Marked({ gfm: true, breaks: true })
const imagensCarregadas = new Map<string, string>()

marked.use({
  renderer: {
    codespan({ text }: { text: string }) {
      const bruto = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      if (!pareceArquivoVisualizavel(bruto)) return `<code>${text}</code>`
      return `<code class="arquivo-link" data-arquivo="${escapar(bruto)}" title="Abrir ao lado">${text}</code>`
    },
    image({ href, text }: { href: string; text: string }) {
      if (/^(https?:|data:|blob:)/i.test(href)) return `<img src="${escapar(href)}" alt="${escapar(text)}">`
      return `<img class="arquivo-imagem" data-arquivo="${escapar(href)}" alt="${escapar(text)}" title="${escapar(text || href)}">`
    },
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

const html = computed(() => DOMPurify.sanitize(marked.parse(props.text) as string, { ADD_ATTR: ['data-code', 'data-arquivo', 'target'] }))

/** Abre no painel ao lado o arquivo citado na resposta, resolvido dentro do workspace da sessao. */
function abrirArquivo(caminho: string): void {
  const sessionId = String(route.params.id ?? '')
  const workspace = sessions.sessions.find((s) => s.id === sessionId)?.workspace
  if (!sessionId || !workspace) return
  const relativo = relativoAoWorkspace(caminho, workspace)
  if (relativo === null) return
  visualizacao.abrir(sessionId, relativo, enderecoDoArquivo(sessionId, relativo))
}

const raiz = ref<HTMLElement | null>(null)

/** Carrega pelo protocolo as imagens citadas por caminho do workspace, que o navegador nao consegue abrir direto. */
async function carregarImagens(): Promise<void> {
  await nextTick()
  const sessionId = String(route.params.id ?? '')
  const workspace = sessions.sessions.find((s) => s.id === sessionId)?.workspace
  if (!raiz.value || !sessionId || !workspace) return
  for (const img of raiz.value.querySelectorAll<HTMLImageElement>('img.arquivo-imagem[data-arquivo]')) {
    if (img.src) continue
    const relativo = relativoAoWorkspace(img.dataset.arquivo ?? '', workspace)
    if (relativo === null) continue
    const chave = `${sessionId}:${relativo}`
    const pronta = imagensCarregadas.get(chave)
    if (pronta) {
      img.src = pronta
      continue
    }
    void client
      .request({ type: 'arquivo.ler', session_id: sessionId, path: relativo }, 'arquivo.conteudo', 60000)
      .then((lido) => {
        if (!lido.media_type.startsWith('image/')) return
        const src = `data:${lido.media_type};base64,${lido.data}`
        imagensCarregadas.set(chave, src)
        img.src = src
      })
      .catch(() => img.classList.add('arquivo-imagem-falhou'))
  }
}

watch(html, () => void carregarImagens())
onMounted(() => void carregarImagens())

/** Copia o bloco de codigo clicado ou abre o arquivo citado, sem depender de biblioteca extra. */
async function onClick(e: MouseEvent): Promise<void> {
  const alvo = e.target as HTMLElement
  const arquivo = alvo.closest('.arquivo-link, .arquivo-imagem') as HTMLElement | null
  if (arquivo?.dataset.arquivo) {
    abrirArquivo(arquivo.dataset.arquivo)
    return
  }
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
  <div ref="raiz" class="markdown" @click="onClick" v-html="html"></div>
</template>
