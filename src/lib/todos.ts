// Every to-do in a line and everything inside it, however deep, for the
// "To-dos inside" page and its menu item. Built from the tree a page already
// loaded: no query of its own.

import type { TreeNode } from '@/db/types'

export interface TodoEntry {
  /** What gets checked off: for a line that's only a link, the item it links to. */
  id: string
  /** The line itself, in this list (what "go to it" shows). */
  lineId: string
  text: string
  done: boolean
  /** Where it sits: the lines above it, below the list's own line (empty for that line itself). */
  path: string[]
  /** The ids of those lines, for unfolding them to show it. */
  pathIds: string[]
}

const isTodo = (n: TreeNode) => n.kind === 'item' && n.task

/**
 * The to-dos in `root` and everything inside it, in reading order (folded
 * lines included). A line that's only a link stands for the to-do it links
 * to, so it counts as that to-do; one to-do on several lines is listed once.
 */
export function todosIn(root: TreeNode, label: (n: TreeNode) => string): TodoEntry[] {
  const out: TodoEntry[] = []
  const seen = new Set<string>()
  const visit = (n: TreeNode, path: string[], pathIds: string[]) => {
    const id = n.ref ?? n.id
    if (isTodo(n) && !seen.has(id)) {
      seen.add(id)
      out.push({ id, lineId: n.id, text: n.text, done: n.done, path, pathIds })
    }
    const below = n === root ? [] : [...path, label(n)]
    const belowIds = n === root ? [] : [...pathIds, n.id]
    for (const c of n.children) visit(c, below, belowIds)
  }
  visit(root, [], [])
  return out
}

/** The ⋯ menu item. */
export const todosLabel = (c: { open: number }) => (c.open ? `To-dos inside (${c.open} open)` : 'To-dos inside (all done)')

/** How many to-dos are inside a line (not counting the line itself), and how many of all are open. For the menu item. */
export function todoCounts(root: TreeNode): { inside: number; open: number } {
  const all = todosIn(root, () => '')
  const inside = all.filter((t) => t.lineId !== root.id).length
  return { inside, open: all.filter((t) => !t.done).length }
}
