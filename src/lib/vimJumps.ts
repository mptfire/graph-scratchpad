// Where the cursor goes when you change pages. With Vim keys on, Ctrl-O and
// Ctrl-I go back and forward through pages, like vim's jump list, and land
// on the line you were on (in normal mode); gx goes through here too, so the
// page it opens starts on its title; and any page you arrive on has a cursor
// (the line you were last on there, or the title), so j and k work at once.
// Esc from Search goes back here too, Vim keys or not.

import type { CaretTarget } from './editorDom'
import { overlayOpen } from './shortcuts'
import { router } from '@/router'
import { editing, getEditor } from '@/state/focus'
import { vim } from '@/state/vim'
import { toast } from '@/state/ui'

/** The line you were on, per page. */
const spots = new Map<string, { key: string; at: CaretTarget }>()
const MAX_SPOTS = 50
let jumping = false

/** Something is taking typing: a line, a search box, a dialog or menu. */
function typingElsewhere(): boolean {
  const a = document.activeElement as HTMLElement | null
  if (overlayOpen()) return true
  return !!a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')
}

/**
 * Focus an editor once its page has loaded and it has mounted (or give up).
 * `unlessBusy`: not if something else has taken focus by then (a new pad's
 * name, say). Starts after the old page is gone, so none of its lines is
 * taken for the new one's.
 */
function focusWhenReady(key: string, at: CaretTarget, { unlessBusy = false, ms = 2000 } = {}) {
  const until = Date.now() + ms
  const tick = () => {
    const ed = getEditor(key)
    if (ed) {
      if (unlessBusy && typingElsewhere()) return
      if (vim.enabled) vim.mode = 'normal'
      return ed.focus(at)
    }
    if (Date.now() < until) setTimeout(tick, 50)
  }
  setTimeout(tick, 0)
}

/** A page's cursor: where you were on it, or its title. */
function cursorFor(path: string, id: unknown): { key: string; at: CaretTarget } | null {
  return spots.get(path) ?? (typeof id === 'string' ? { key: `title:${id}`, at: 'start' } : null)
}

/** gx: open a page, starting on its title in normal mode. */
export function vimOpen(path: string): void {
  jumping = true
  vim.mode = 'normal'
  void router.push(path)
}

/** Back to the page before, on the line you were on (Esc from Search, To-dos inside); with none before, to `fallback`. */
export function goBack(fallback = '/'): void {
  const state = window.history.state as { back?: string | null } | null
  jumping = true
  if (state?.back) router.back()
  else void router.push(fallback)
}

function jump(dir: 'back' | 'forward') {
  const state = window.history.state as { back?: string | null; forward?: string | null } | null
  if (!(dir === 'back' ? state?.back : state?.forward)) return toast(dir === 'back' ? 'Nothing to go back to' : 'Nothing to go forward to')
  jumping = true
  vim.mode = 'normal'
  if (dir === 'back') router.back()
  else router.forward()
}

export function startVimJumps(): void {
  router.beforeEach((_to, from) => {
    const key = editing.key
    if (!key) return
    spots.delete(from.fullPath)
    spots.set(from.fullPath, { key, at: getEditor(key)?.caret() ?? 'start' })
    if (spots.size > MAX_SPOTS) spots.delete(spots.keys().next().value!)
  })
  router.afterEach((to) => {
    editing.last = null
    const jumped = jumping
    jumping = false
    // Without Vim keys, only a way back (Esc from Search) puts the cursor back, and only where it was.
    if (!vim.enabled) {
      const spot = jumped ? spots.get(to.fullPath) : undefined
      if (spot) focusWhenReady(spot.key, spot.at)
      return
    }
    const c = cursorFor(to.fullPath, to.params.id)
    if (!c) return
    // A page asking for its title to be typed into (a new pad) keeps that.
    if (jumped) focusWhenReady(c.key, c.at)
    else if (!to.query.focus) focusWhenReady(c.key, c.at, { unlessBusy: true })
  })
  window.addEventListener('keydown', (e) => {
    if (!vim.enabled || e.metaKey || e.altKey) return
    const t = e.target as HTMLElement | null
    const field = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')
    // j or k with no cursor (after a click elsewhere, a menu): the cursor comes back, where it was.
    if (!e.ctrlKey && (e.key === 'j' || e.key === 'k') && !e.shiftKey) {
      if (e.defaultPrevented || typingElsewhere()) return
      const route = router.currentRoute.value
      const last = editing.last && getEditor(editing.last) ? { key: editing.last, at: 'start' as const } : null
      const c = last ?? cursorFor(route.fullPath, route.params.id)
      const ed = c && getEditor(c.key)
      if (!c || !ed) return
      e.preventDefault()
      vim.mode = 'normal'
      ed.focus(c.at)
      return
    }
    if (!e.ctrlKey || e.shiftKey) return
    const k = e.key.toLowerCase()
    if (k !== 'o' && k !== 'i') return
    // Search boxes and dialogs keep their keys.
    if (field) return
    e.preventDefault()
    jump(k === 'o' ? 'back' : 'forward')
  })
}
