<script setup lang="ts">
// A menu of actions (a line's ⋯, a page's ⋯…). With a keyboard: ↑ ↓ (or
// Ctrl-N Ctrl-P) pick, Enter chooses, Esc closes. Focus stays where it was
// (in the line, say), so the keys are caught here first while it's open.
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { closeSheet, sheetState, type SheetAction } from '@/state/ui'
import { isMenuKey, usedKeyboard } from '@/lib/shortcuts'

/** The action Enter chooses; -1 for none (opened with a tap, until an arrow key). */
const hl = ref(-1)
const sheet = ref<HTMLElement>()

function run(a: SheetAction) {
  closeSheet()
  a.run()
}

function move(by: number) {
  const n = sheetState.value?.actions.length ?? 0
  if (!n) return
  hl.value = hl.value < 0 ? 0 : Math.max(0, Math.min(n - 1, hl.value + by))
  void nextTick(() => sheet.value?.querySelector('.sheet-action.hl')?.scrollIntoView({ block: 'nearest' }))
}

function onKey(e: KeyboardEvent) {
  const s = sheetState.value
  if (!s || e.isComposing) return
  const ctrl = e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
  const k = e.key.toLowerCase()
  if (e.key === 'ArrowDown' || (ctrl && k === 'n')) move(1)
  else if (e.key === 'ArrowUp' || (ctrl && k === 'p')) move(-1)
  else if (e.key === 'Enter') {
    const a = s.actions[hl.value]
    if (a) run(a)
  } else if (e.key === 'Escape' || isMenuKey(e)) closeSheet()
  // Other shortcuts (the browser's own) go on; plain keys don't type into the line behind.
  else if (e.ctrlKey || e.metaKey) return
  e.preventDefault()
  e.stopPropagation()
}

// Opened from the keyboard: its first action picked.
watch(sheetState, (s) => {
  hl.value = s && usedKeyboard() ? 0 : -1
})

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div v-if="sheetState" class="sheet-backdrop" @mousedown.prevent @click.self="closeSheet">
      <div ref="sheet" class="sheet" role="menu" @mousedown.prevent>
        <div v-if="sheetState.title" class="sheet-title">{{ sheetState.title }}</div>
        <button
          v-for="(a, i) in sheetState.actions"
          :key="a.label"
          type="button"
          class="sheet-action"
          :class="{ danger: a.danger, hl: i === hl }"
          role="menuitem"
          @click="run(a)"
        >
          <Icon v-if="a.icon" :name="a.icon" :size="20" />
          <span>{{ a.label }}</span>
        </button>
        <button type="button" class="sheet-action cancel" @click="closeSheet">Cancel</button>
      </div>
    </div>
  </Teleport>
</template>
