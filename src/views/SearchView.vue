<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import KindIcon from '@/components/KindIcon.vue'
import { api } from '@/db/api'
import type { SearchResult } from '@/db/types'
import { reportError } from '@/state/ui'
import { resultContext } from '@/lib/kinds'
import { goBack } from '@/lib/vimJumps'
import { categoryById } from '@/state/categories'

const router = useRouter()
const q = ref('')
const results = ref<SearchResult[]>([])
const input = ref<HTMLInputElement>()
const list = ref<HTMLUListElement>()
/** The result Enter opens. Shown with a keyboard and mouse from the start; on a touch screen once the arrow keys are used. */
const highlight = ref(0)
const picking = ref(window.matchMedia?.('(pointer: fine)').matches ?? false)
let seq = 0

async function run() {
  const my = ++seq
  try {
    const r = await api.search(q.value, { limit: 50 })
    if (my === seq) {
      results.value = r
      highlight.value = 0
    }
  } catch (e) {
    reportError(e)
  }
}

function move(by: number) {
  if (!results.value.length) return
  // The first press on a touch screen shows where the highlight is.
  if (picking.value) highlight.value = Math.max(0, Math.min(results.value.length - 1, highlight.value + by))
  picking.value = true
  void nextTick(() => list.value?.querySelector('.hl')?.scrollIntoView({ block: 'nearest' }))
}

/** ↑ ↓ (or Ctrl-P Ctrl-N, as in Vim's menus) pick a result, Enter opens it, Esc goes back. */
function onKey(e: KeyboardEvent) {
  if (e.isComposing) return
  const ctrl = e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
  if (e.key === 'ArrowDown' || (ctrl && e.key.toLowerCase() === 'n')) {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp' || (ctrl && e.key.toLowerCase() === 'p')) {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const r = results.value[highlight.value]
    // On a touch screen, the keyboard's Search key just puts the keyboard away.
    if (picking.value && r) void router.push(`/n/${r.id}`)
    else input.value?.blur()
  } else if (e.key === 'Escape') {
    // Rather than clearing the box (the browser's way).
    e.preventDefault()
    goBack()
  }
}

/** Ctrl-K while already here: back to the box, ready to type over. */
function refocus() {
  input.value?.focus()
  input.value?.select()
}

watch(q, run)
onMounted(() => {
  void run()
  input.value?.focus()
  window.addEventListener('gp:search', refocus)
})
onUnmounted(() => window.removeEventListener('gp:search', refocus))
</script>

<template>
  <div class="page">
    <header class="topbar">
      <h1 class="page-title">Search</h1>
    </header>
    <input
      ref="input"
      v-model="q"
      class="text-input search-input"
      type="search"
      enterkeyhint="search"
      placeholder="Search everything"
      aria-label="Search"
      aria-controls="search-results"
      :aria-activedescendant="picking && results.length ? `result-${highlight}` : undefined"
      @keydown="onKey"
    />
    <p v-if="!q.trim() && results.length" class="hint">Recently edited</p>
    <ul id="search-results" ref="list" class="list" role="listbox" aria-label="Results">
      <li v-for="(r, i) in results" :id="`result-${i}`" :key="r.id" class="list-item" role="option" :aria-selected="picking && i === highlight">
        <RouterLink :to="`/n/${r.id}`" class="list-main" :class="{ done: r.done, hl: picking && i === highlight }">
          <KindIcon :kind="r.kind" :category="r.category" />
          <span class="list-text">
            <span class="list-label">{{ r.label || 'Untitled' }}</span>
            <span v-if="resultContext(r, categoryById(r.category)?.name)" class="list-context">{{
              resultContext(r, categoryById(r.category)?.name)
            }}</span>
          </span>
        </RouterLink>
      </li>
    </ul>
    <p v-if="q.trim() && !results.length" class="empty-state">Nothing matches “{{ q.trim() }}”.</p>
  </div>
</template>
