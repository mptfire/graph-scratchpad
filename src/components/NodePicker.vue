<script setup lang="ts">
// Full-screen picker. Link mode: search, tap a result to pick it. Move and
// send modes: browse like folders (tapping a row opens it; search results
// open too) and confirm with "Move into …" / "Send to …", so nothing happens
// by surprise.
//
// From the keyboard: ↑ ↓ (or Ctrl-N Ctrl-P) go through whatever could be
// tapped, Enter does what the tap would, Esc cancels. Browsing, → (or Tab)
// opens the picked list and ← (or Backspace in the empty box) goes back up,
// so typing a name, Enter, Enter moves a line there.

import { computed, nextTick, ref, watch } from 'vue'
import Icon from './Icon.vue'
import KindIcon from './KindIcon.vue'
import { api } from '@/db/api'
import type { BrowseRow, Crumb, Kind, SearchResult } from '@/db/types'
import { closePicker, pickerState, reportError, type PickResult } from '@/state/ui'
import { resultContext } from '@/lib/kinds'
import { readyForKeys } from '@/lib/shortcuts'
import { categoryById } from '@/state/categories'

const q = ref('')
const results = ref<SearchResult[]>([])
const highlight = ref(0)
const input = ref<HTMLInputElement>()
const root = ref<HTMLElement>()
/** Ready for keys: the box has focus and a choice is picked (opened from the keyboard, or on a computer). */
const keys = ref(false)
let seq = 0

// Move-mode browsing: the trail of nodes opened so far (empty = all pads).
const trail = ref<Crumb[]>([])
const rows = ref<BrowseRow[]>([])
const browseLoading = ref(false)
let browseSeq = 0

const req = pickerState
const trimmed = computed(() => q.value.trim())
const isMove = computed(() => req.value?.mode === 'move' || req.value?.mode === 'send')
const isSend = computed(() => req.value?.mode === 'send')
const browsing = computed(() => isMove.value && !trimmed.value)
const excluded = computed(() => new Set(req.value?.excludeIds ?? []))
const here = computed(() => trail.value.at(-1) ?? null)

/** What ↑ ↓ go through while browsing: "Move into …" (inside a list), then the lists here, not the one being moved. */
type Target = { kind: 'here' } | { kind: 'row'; row: BrowseRow }
const targets = computed<Target[]>(() => [
  ...(here.value ? [{ kind: 'here' as const }] : []),
  ...rows.value.filter((r) => !excluded.value.has(r.id)).map((row) => ({ kind: 'row' as const, row })),
])
const browseHl = ref(0)
const picked = computed(() => (keys.value ? targets.value[browseHl.value] : undefined))

const CREATE_LABELS: Partial<Record<Kind, (t: string) => string>> = {
  place: (t) => `New place “${t}”`,
  person: (t) => `New person “${t}”`,
  item: (t) => `New item “${t}” in Inbox`,
  relation: (t) => `New relation “${t}”`,
}

const creates = computed(() => {
  if (!req.value?.allowCreate || !trimmed.value) return []
  const exact = results.value.some((r) => r.label.toLowerCase() === trimmed.value.toLowerCase())
  if (exact && results.value.length) return []
  if (req.value.createOptions) {
    return req.value.createOptions.map((o) => ({ kind: o.kind, key: o.key, label: o.label(trimmed.value), make: o.create }))
  }
  return (req.value.createKinds ?? (['place', 'person', 'item'] as Kind[])).map((kind) => ({
    kind,
    key: kind as string,
    label: CREATE_LABELS[kind]?.(trimmed.value) ?? trimmed.value,
    make: undefined as ((text: string, id: string) => Promise<unknown>) | undefined,
  }))
})

watch(req, async (r) => {
  if (!r) return
  q.value = r.initialQuery ?? ''
  results.value = []
  highlight.value = 0
  trail.value = []
  rows.value = []
  keys.value = readyForKeys()
  if (r.mode === 'move' || r.mode === 'send') {
    if (keys.value) void nextTick(() => input.value?.focus())
    // Start next to the node being moved: its siblings are the likeliest targets.
    if (r.startNear) {
      try {
        trail.value = await api.getAncestors(r.startNear)
      } catch {
        trail.value = []
      }
    }
    await browse()
  } else {
    void search()
    // Words already typed are selected, so typing something else replaces them.
    void nextTick(() => (r.initialQuery ? input.value?.select() : input.value?.focus()))
  }
})

watch(q, () => {
  if (!isMove.value || trimmed.value) void search()
})

async function browse() {
  const my = ++browseSeq
  browseLoading.value = true
  try {
    const r = await api.listBrowse(here.value?.id ?? null)
    if (my === browseSeq) {
      rows.value = r
      browseHl.value = 0
    }
  } catch (e) {
    reportError(e)
  } finally {
    if (my === browseSeq) browseLoading.value = false
  }
}

function open(row: { id: string; kind: Kind; label: string }) {
  if (excluded.value.has(row.id)) return
  trail.value = [...trail.value, { id: row.id, kind: row.kind, label: row.label }]
  void browse()
}

function goTo(index: number) {
  trail.value = trail.value.slice(0, index + 1)
  void browse()
}

async function openResult(r: SearchResult) {
  try {
    const crumbs = await api.getAncestors(r.id)
    trail.value = [...crumbs, { id: r.id, kind: r.kind, label: r.label }]
  } catch (e) {
    reportError(e)
    return
  }
  q.value = ''
  // On a phone, put the keyboard away to show the list; with keys, keep typing.
  if (!keys.value) input.value?.blur()
  void browse()
}

async function search() {
  const r = req.value
  if (!r) return
  const my = ++seq
  const query = q.value
  try {
    const res = await api.search(query, {
      limit: 30,
      excludeIds: r.excludeIds,
      kinds: r.kinds ?? (!query.trim() && r.emptyKinds ? r.emptyKinds : undefined),
    })
    if (my !== seq) return
    results.value = res
    highlight.value = 0
  } catch (e) {
    reportError(e)
  }
}

function finish(p: PickResult) {
  const r = req.value
  closePicker()
  r?.onPick(p)
}

function pick(res: SearchResult) {
  if (isMove.value) void openResult(res)
  else finish({ id: res.id, kind: res.kind, label: res.label })
}

function moveHere() {
  const h = here.value
  if (h) finish({ id: h.id, kind: h.kind, label: h.label })
}

function create(c: (typeof creates.value)[number]) {
  const kind = c.kind
  const text = kind === 'relation' ? trimmed.value.toLowerCase() : trimmed.value
  const id = crypto.randomUUID()
  const p = c.make ? c.make(text, id) : kind === 'item' ? api.createInInbox({ text, id }) : api.createNode(kind, text, id)
  p.catch(reportError)
  finish({ id, kind, label: text })
}

function cancel() {
  const r = req.value
  closePicker()
  r?.onCancel?.()
}

function scrollToPicked() {
  void nextTick(() => root.value?.querySelector('.picker-results .hl, .picker-here.hl')?.scrollIntoView({ block: 'nearest' }))
}

function onKey(e: KeyboardEvent) {
  if (e.isComposing) return
  const ctrl = e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
  const k = e.key.toLowerCase()
  const by = e.key === 'ArrowDown' || (ctrl && k === 'n') ? 1 : e.key === 'ArrowUp' || (ctrl && k === 'p') ? -1 : 0
  if (e.key === 'Escape') {
    e.preventDefault()
    return cancel()
  }
  if (browsing.value) return onBrowseKey(e, by)
  const total = results.value.length + creates.value.length
  if (by) {
    e.preventDefault()
    highlight.value = Math.max(0, Math.min(total - 1, highlight.value + by))
    scrollToPicked()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const i = highlight.value
    if (i < results.value.length) pick(results.value[i])
    else if (creates.value[i - results.value.length]) create(creates.value[i - results.value.length])
  }
}

function onBrowseKey(e: KeyboardEvent, by: number) {
  const t = picked.value
  if (by) {
    e.preventDefault()
    // The first press, on a phone, shows the pick where it is.
    if (keys.value) browseHl.value = Math.max(0, Math.min(targets.value.length - 1, browseHl.value + by))
    keys.value = true
    scrollToPicked()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (t?.kind === 'row') open(t.row)
    else moveHere()
  } else if ((e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) && t?.kind === 'row') {
    e.preventDefault()
    open(t.row)
  } else if (e.key === 'ArrowLeft' || e.key === 'Backspace' || (e.key === 'Tab' && e.shiftKey)) {
    // Back up a level (the box is empty while browsing, so these have nothing else to do).
    e.preventDefault()
    if (trail.value.length) goTo(trail.value.length - 2)
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="req" ref="root" class="picker" role="dialog" :aria-label="req.title" @keydown="onKey">
      <div class="picker-head">
        <span class="picker-title">{{ req.title }}</span>
        <button type="button" class="icon-btn" aria-label="Cancel" @mousedown.prevent @click="cancel">
          <Icon name="x" />
        </button>
      </div>
      <input
        ref="input"
        v-model="q"
        class="picker-input"
        type="search"
        enterkeyhint="go"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :placeholder="req.placeholder ?? 'Search'"
      />

      <template v-if="browsing">
        <nav class="picker-trail" aria-label="Location">
          <button type="button" :class="{ on: !trail.length }" @mousedown.prevent @click="goTo(-1)">All pads</button>
          <template v-for="(c, i) in trail" :key="c.id">
            <span class="sep">›</span>
            <button type="button" :class="{ on: i === trail.length - 1 }" @mousedown.prevent @click="goTo(i)">
              {{ c.label || 'Untitled' }}
            </button>
          </template>
        </nav>
        <button
          v-if="here"
          type="button"
          class="btn btn-primary picker-here"
          :class="{ hl: picked?.kind === 'here' }"
          @mousedown.prevent
          @click="moveHere"
        >
          <Icon :name="isSend ? 'share' : 'move'" :size="18" />
          <span class="picker-here-label">{{ isSend ? 'Send to' : 'Move into' }} “{{ here.label || 'Untitled' }}”</span>
        </button>
        <ul class="picker-results" role="listbox">
          <li v-for="r in rows" :key="r.id">
            <button
              type="button"
              class="picker-item"
              :class="{ done: r.done, excluded: excluded.has(r.id), hl: picked?.kind === 'row' && picked.row.id === r.id }"
              :disabled="excluded.has(r.id)"
              @mousedown.prevent
              @click="open(r)"
            >
              <KindIcon :kind="r.kind" />
              <span class="picker-text">
                <span class="picker-label">{{ r.label || 'Untitled' }}</span>
                <span v-if="excluded.has(r.id)" class="picker-context">The item you’re {{ isSend ? 'sending' : 'moving' }}</span>
              </span>
              <span v-if="r.childCount && !excluded.has(r.id)" class="picker-count">{{ r.childCount }}</span>
              <Icon v-if="!excluded.has(r.id)" name="chevron-right" :size="18" />
            </button>
          </li>
          <li v-if="!browseLoading && !rows.length" class="picker-empty">
            {{ here ? `Nothing inside yet. ${isSend ? 'Send' : 'Move'} it here to start a list.` : 'No pads yet.' }}
          </li>
        </ul>
      </template>

      <ul v-else class="picker-results" role="listbox">
        <li v-for="(r, i) in results" :key="r.id">
          <button
            type="button"
            class="picker-item"
            :class="{ hl: i === highlight, done: r.done }"
            role="option"
            :aria-selected="i === highlight"
            @mousedown.prevent
            @click="pick(r)"
          >
            <KindIcon :kind="r.kind" :category="r.category" />
            <span class="picker-text">
              <span class="picker-label">{{ r.label || 'Untitled' }}</span>
              <span v-if="resultContext(r, categoryById(r.category)?.name)" class="picker-context">{{
                resultContext(r, categoryById(r.category)?.name)
              }}</span>
            </span>
            <Icon v-if="isMove" name="chevron-right" :size="18" />
          </button>
        </li>
        <li v-for="(c, i) in creates" :key="c.key">
          <button
            type="button"
            class="picker-item create"
            :class="{ hl: i + results.length === highlight }"
            @mousedown.prevent
            @click="create(c)"
          >
            <Icon name="plus" :size="18" />
            <span class="picker-text"><span class="picker-label">{{ c.label }}</span></span>
          </button>
        </li>
        <li v-if="!results.length && !creates.length" class="picker-empty">
          {{ trimmed ? 'Nothing matches.' : 'Type to search.' }}
        </li>
      </ul>
    </div>
  </Teleport>
</template>
