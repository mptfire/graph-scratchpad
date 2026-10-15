// The changelog (CHANGELOG.md, built into the app as __CHANGELOG__) as
// versions, for the What's new page. Released versions only: what's under
// "Unreleased" isn't in anyone's app yet.

export interface Release {
  version: string
  /** YYYY-MM-DD, as written. */
  date: string | null
  /** Paragraphs under the version, before its sections. */
  notes: string[]
  sections: { title: string; items: string[] }[]
}

/** Markdown inside a line, as plain text: a link keeps its words; ** and ` go. */
const plain = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()

export function parseChangelog(md: string): Release[] {
  const out: Release[] = []
  let release: Release | null = null
  let section: Release['sections'][number] | null = null
  let last: 'note' | 'item' | null = null
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd()
    const v = /^## \[?([^\]\s]+)\]?(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?/.exec(line)
    if (v) {
      release = v[1].toLowerCase() === 'unreleased' ? null : { version: v[1], date: v[2] ?? null, notes: [], sections: [] }
      if (release) out.push(release)
      section = null
      last = null
      continue
    }
    if (!release) continue
    const heading = /^### (.+)/.exec(line)
    const item = /^[-*] (.+)/.exec(line)
    if (heading) {
      section = { title: plain(heading[1]), items: [] }
      release.sections.push(section)
      last = null
    } else if (item) {
      if (!section) release.sections.push((section = { title: '', items: [] }))
      section.items.push(plain(item[1]))
      last = 'item'
    } else if (!line.trim()) {
      last = null
    } else if (last === 'item' && /^\s/.test(raw) && section) {
      // A bullet that goes on over the next line.
      section.items[section.items.length - 1] += ' ' + plain(line)
    } else if (!section) {
      if (last === 'note') release.notes[release.notes.length - 1] += ' ' + plain(line)
      else release.notes.push(plain(line))
      last = 'note'
    }
  }
  return out
}
