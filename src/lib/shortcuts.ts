// Keyboard shortcuts for the whole app (a line's own keys are in EditableText).
// Ctrl-K (⌘K on a Mac) opens Search, for now; one day a box over the page.

import { router } from '@/router'

/** Something open over the page (the link picker, a question, a line's menu) that keeps the keys. */
export function overlayOpen(): boolean {
  return !!document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')
}

export function startShortcuts(): void {
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'k' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.isComposing) return
    if (overlayOpen()) return
    e.preventDefault()
    // Already there: back to the box, ready to type over.
    if (router.currentRoute.value.path === '/search') window.dispatchEvent(new Event('gp:search'))
    else void router.push('/search')
  })
}
