import { computed, ref, type ComputedRef } from 'vue'

export type PopoverId = 'plus' | 'modo' | 'agente' | 'esforco' | 'uso' | 'workspace'

const ativo = ref<PopoverId | null>(null)

/** Um popover por vez: abrir um fecha o que estiver aberto. */
export function alternar(id: PopoverId): void {
  ativo.value = ativo.value === id ? null : id
}

export function fechar(id?: PopoverId): void {
  if (id === undefined || ativo.value === id) ativo.value = null
}

export function aberto(id: PopoverId): ComputedRef<boolean> {
  return computed(() => ativo.value === id)
}

if (typeof window !== 'undefined') {
  window.addEventListener('mousedown', (e) => {
    const alvo = e.target as HTMLElement | null
    if (!alvo) return
    if (alvo.closest('.popover') || alvo.closest('.popover-anchor') || alvo.closest('.ws-picker')) return
    ativo.value = null
  })
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ativo.value = null
  })
}
