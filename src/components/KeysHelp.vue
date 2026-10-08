<script setup lang="ts">
// The keyboard shortcuts, on ? (or Settings → Keyboard). Vim's keys are
// described in Settings instead. Focus stays where it was; while this is
// open, keys only close it.
import { onMounted, onUnmounted } from 'vue'
import { keysHelp, MOD } from '@/lib/shortcuts'
import { vim } from '@/state/vim'

const ALT = MOD === '⌘' ? '⌥' : 'Alt'

const groups: { title: string; rows: { keys: string[][]; what: string; plain?: boolean }[] }[] = [
  {
    title: 'Anywhere',
    rows: [
      { keys: [[MOD, 'K']], what: 'Search' },
      { keys: [['⇧', MOD, 'K']], what: 'The menu of the line you’re on (Move to…, Copy…), or of the page' },
      { keys: [['?']], what: 'These shortcuts' },
    ],
  },
  {
    title: 'In Search and menus',
    rows: [
      { keys: [['↑'], ['↓']], what: 'Pick' },
      { keys: [['Ctrl', 'P'], ['Ctrl', 'N']], what: 'Pick, as in Vim’s menus' },
      { keys: [['Enter']], what: 'Open it, or do it' },
      { keys: [['Esc']], what: 'Go back, or close the menu' },
    ],
  },
  {
    title: 'In a line',
    rows: [
      { keys: [['Enter']], what: 'A new line (splits the line at the cursor)' },
      { keys: [['Tab'], ['⇧', 'Tab']], what: 'Indent, outdent' },
      { keys: [[ALT, '⇧', '↑'], [ALT, '⇧', '↓']], what: 'Move the line up or down' },
      { keys: [[MOD, '↑'], [MOD, '↓']], what: 'Collapse or expand' },
      { keys: [[MOD, 'Enter']], what: 'Check off' },
      { keys: [['⇧', MOD, 'Enter']], what: 'Switch between to-do and note' },
      { keys: [['@']], what: 'Link to an item, place or person' },
      { keys: [['Backspace']], what: 'At the start of a line: join it to the line above' },
      { keys: [['Esc']], what: 'Stop editing', plain: true },
    ],
  },
]

function close() {
  keysHelp.value = false
}

function onKey(e: KeyboardEvent) {
  if (!keysHelp.value) return
  if (e.key === 'Escape' || e.key === '?' || e.key === 'Enter') close()
  // The browser's own shortcuts go on; nothing else reaches the page behind.
  else if (e.ctrlKey || e.metaKey) return
  e.preventDefault()
  e.stopPropagation()
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div v-if="keysHelp" class="sheet-backdrop center" @mousedown.prevent @click.self="close">
      <div class="dialog keys-help" role="dialog" aria-label="Keyboard shortcuts" @mousedown.prevent>
        <h2 class="dialog-title">Keyboard shortcuts</h2>
        <section v-for="g in groups" :key="g.title">
          <h3 class="keys-group">{{ g.title }}</h3>
          <dl class="keys-list">
            <template v-for="r in g.rows" :key="r.what">
              <template v-if="!r.plain || !vim.enabled">
                <dt>
                  <span v-for="(combo, i) in r.keys" :key="i" class="keys-combo">
                    <kbd v-for="k in combo" :key="k">{{ k }}</kbd>
                  </span>
                </dt>
                <dd>{{ r.what }}</dd>
              </template>
            </template>
          </dl>
        </section>
        <p class="dialog-msg">Vim keys: Settings → Keyboard.</p>
        <div class="dialog-actions">
          <button type="button" class="btn" @click="close">Close</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
