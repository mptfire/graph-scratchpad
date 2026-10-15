<script setup lang="ts">
// Every to-do in a line (or a page) and everything inside it, however deep,
// grouped under where each one sits, and checkable right here (from the ⋯
// menus: "To-dos inside"). Ticked here, a to-do stays in the list, struck
// through, until you leave, so the list doesn't jump while you work.
// Keys: ↑ ↓ (or Ctrl-N Ctrl-P; j k with Vim keys) pick, Space or Ctrl-Enter
// checks it off, Enter goes to the line in its list, Esc goes back.
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import TextView from '@/components/TextView.vue'
import { api } from '@/db/api'
import type { TreeNode } from '@/db/types'
import { useLoader } from '@/composables/useLoader'
import { mergeRefs, refCache } from '@/state/refs'
import { labelize } from '@/lib/tokens'
import { todosIn, type TodoEntry } from '@/lib/todos'
import { goBack } from '@/lib/vimJumps'
import { inTextField, overlayOpen, readyForKeys } from '@/lib/shortcuts'
import { prefs } from '@/state/prefs'
import { reportError } from '@/state/ui'
import { vim } from '@/state/vim'

const props = defineProps<{ id: string }>()
const router = useRouter()
const { data, error } = useLoader(() => api.getNodeView(props.id))

const label = (n: TreeNode) => labelize(n.text, (id) => refCache[id]?.label).trim() || 'Untitled'

// Checked or unchecked here, before the reload says so.
const local = reactive(new Map<string, boolean>())
const tickedHere = reactive(new Set<string>())
watch(
  data,
  (d) => {
    if (!d) return
    mergeRefs(d.refs)
    local.clear()
  },
  { flush: 'sync' },
)

const all = computed(() => (data.value ? todosIn(data.value.tree, label).map((t) => ({ ...t, done: local.get(t.id) ?? t.done })) : []))
const openCount = computed(() => all.value.filter((t) => !t.done).length)
const doneCount = computed(() => all.value.length - openCount.value)
const showDone = ref(prefs.showDoneTodos)
const shown = computed(() => all.value.filter((t) => showDone.value || !t.done || tickedHere.has(t.id)))

/** Runs of to-dos that sit in the same place, under that place's path (the page's own name for its own lines). */
const groups = computed(() => {
  const out: { path: string; items: { t: TodoEntry; i: number }[] }[] = []
  const top = data.value ? label(data.value.tree) : ''
  shown.value.forEach((t, i) => {
    const path = t.path.length ? t.path.join(' › ') : top
    const last = out.at(-1)
    if (last && last.path === path) last.items.push({ t, i })
    else out.push({ path, items: [{ t, i }] })
  })
  return out
})

/** The to-do the keys act on; -1 for none (on a phone, until an arrow key). */
const hl = ref(readyForKeys() ? 0 : -1)
const list = ref<HTMLElement>()
watch(shown, (s) => {
  if (hl.value >= s.length) hl.value = s.length - 1
})

function setShowDone(v: boolean) {
  showDone.value = v
  prefs.showDoneTodos = v
}

function toggle(t: TodoEntry) {
  const next = !t.done
  local.set(t.id, next)
  if (next) tickedHere.add(t.id)
  api.setDone(t.id, next).catch(reportError)
}

/** To the line in its list (its folded lines opened to show it). */
function jump(t: TodoEntry) {
  if (t.lineId === props.id) return void router.push(`/n/${props.id}`)
  void router.push({ path: `/n/${props.id}`, query: { focus: t.lineId } })
}

function back() {
  goBack(`/n/${props.id}`)
}

function onKey(e: KeyboardEvent) {
  const a = document.activeElement as HTMLElement | null
  if (e.defaultPrevented || e.isComposing || overlayOpen() || inTextField() || a?.isContentEditable) return
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey
  const ctrl = e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
  const k = e.key
  const by =
    k === 'ArrowDown' || (ctrl && k.toLowerCase() === 'n') || (vim.enabled && plain && k === 'j')
      ? 1
      : k === 'ArrowUp' || (ctrl && k.toLowerCase() === 'p') || (vim.enabled && plain && k === 'k')
        ? -1
        : 0
  if (by) {
    e.preventDefault()
    if (!shown.value.length) return
    hl.value = hl.value < 0 ? 0 : Math.max(0, Math.min(shown.value.length - 1, hl.value + by))
    void nextTick(() => list.value?.querySelector('.todo.hl')?.scrollIntoView({ block: 'nearest' }))
    return
  }
  const t = shown.value[hl.value]
  if ((k === ' ' && plain) || (k === 'Enter' && (e.ctrlKey || e.metaKey))) {
    e.preventDefault()
    if (t) toggle(t)
  } else if (k === 'Enter' && plain) {
    e.preventDefault()
    if (t) jump(t)
  } else if (k === 'Escape') {
    e.preventDefault()
    back()
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="page todos-page">
    <header class="topbar">
      <a class="back" href="#" @click.prevent="back">
        <Icon name="chevron-left" />
        <span class="back-label">{{ data ? label(data.tree) : 'Back' }}</span>
      </a>
    </header>

    <p v-if="error && !data" class="empty-state">This item doesn’t exist. It may have been deleted for good.</p>
    <template v-else-if="data">
      <h1 class="page-title standalone">To-dos inside</h1>
      <p class="todos-sub">
        <template v-if="all.length">{{ openCount }} open · {{ doneCount }} done</template>
        <template v-else>No to-dos inside “{{ label(data.tree) }}” yet.</template>
      </p>

      <div ref="list" class="todos">
        <section v-for="g in groups" :key="g.items[0].t.lineId" class="todo-group">
          <h2 v-if="g.path" class="todo-where">{{ g.path }}</h2>
          <ul class="todo-list">
            <li v-for="{ t, i } in g.items" :key="t.lineId" class="todo" :class="{ done: t.done, hl: i === hl }">
              <button
                type="button"
                class="check"
                role="checkbox"
                :aria-checked="t.done"
                aria-label="Done"
                @mousedown.prevent
                @click="toggle(t)"
              >
                <span class="box"><Icon v-if="t.done" name="check" :size="15" :stroke="3" /></span>
              </button>
              <div class="todo-text" @click="jump(t)"><TextView :text="t.text" /></div>
            </li>
          </ul>
        </section>
      </div>

      <p v-if="all.length && !openCount && !showDone" class="todos-sub">All done.</p>
      <button v-if="doneCount" type="button" class="link-btn todos-done" @click="setShowDone(!showDone)">
        {{ showDone ? 'Hide' : 'Show' }} {{ doneCount }} done
      </button>
    </template>
  </div>
</template>
