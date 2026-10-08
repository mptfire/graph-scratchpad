// Keyboard shortcuts for the whole app (a line's own keys are in EditableText).
// Ctrl-K (⌘K on a Mac) opens Search, for now; one day a box over the page.
// Shift-Ctrl-K opens the ⋯ menu of the line you're on (EditableText, Outline)
// or of the page (NodeView). ? shows the list of shortcuts (KeysHelp).

import { ref } from 'vue'
import { router } from '@/router'
import { vim } from '@/state/vim'

/** What the Ctrl key is called here: ⌘ on a Mac (and an iPad's keyboard). */
export const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl'

/** The list of shortcuts is showing. */
export const keysHelp = ref(false)

/** Show the list of shortcuts (?, or the button in Settings). */
export function showKeys(): void {
  keysHelp.value = true
}

/** Something open over the page (the link picker, a question, a menu, this list) that keeps the keys. */
export function overlayOpen(): boolean {
  return !!document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')
}

/** A box being typed into (not a line: those are contenteditable). */
export function inTextField(): boolean {
  const a = document.activeElement as HTMLElement | null
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')
}

/** Shift-Ctrl-K, or Shift-⌘K. */
export function isMenuKey(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k'
}

export function startShortcuts(): void {
  window.addEventListener('keydown', (e) => {
    if (e.isComposing) return
    // ?, when it wouldn't type: no line being edited, or one in Vim's normal mode.
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (overlayOpen() || inTextField()) return
      const a = document.activeElement as HTMLElement | null
      if (a?.isContentEditable && !(vim.enabled && vim.mode === 'normal')) return
      e.preventDefault()
      keysHelp.value = true
      return
    }
    if (e.key.toLowerCase() !== 'k' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
    if (overlayOpen()) return
    e.preventDefault()
    // Already there: back to the box, ready to type over.
    if (router.currentRoute.value.path === '/search') window.dispatchEvent(new Event('gp:search'))
    else void router.push('/search')
  })
}
