<script setup lang="ts">
// What's new: the changelog built into the app (CHANGELOG.md), newest first,
// so it works offline. From Settings → About, and from the note after an update.
import { onMounted, onUnmounted } from 'vue'
import Icon from '@/components/Icon.vue'
import { parseChangelog } from '@/lib/changelog'
import { APP_NAME } from '@/lib/appName'
import { goBack } from '@/lib/vimJumps'
import { inTextField, overlayOpen } from '@/lib/shortcuts'

const version = __APP_VERSION__
const releases = parseChangelog(__CHANGELOG__)
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' })

function back() {
  goBack('/settings?tab=about')
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || overlayOpen() || inTextField()) return
  e.preventDefault()
  back()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="page changes-page">
    <header class="topbar">
      <a class="back" href="#" @click.prevent="back">
        <Icon name="chevron-left" />
        <span class="back-label">Back</span>
      </a>
    </header>
    <h1 class="page-title standalone">What’s new</h1>
    <p class="note">You have {{ APP_NAME }} {{ version }}.</p>
    <section v-for="r in releases" :key="r.version" class="release">
      <h2 class="release-title">
        {{ r.version }}<span v-if="r.date" class="release-date">{{ day(r.date) }}</span>
      </h2>
      <p v-for="(n, i) in r.notes" :key="i" class="note">{{ n }}</p>
      <template v-for="(s, i) in r.sections" :key="i">
        <h3 v-if="s.title" class="release-section">{{ s.title }}</h3>
        <ul class="release-items">
          <li v-for="(item, j) in s.items" :key="j">{{ item }}</li>
        </ul>
      </template>
    </section>
  </div>
</template>
