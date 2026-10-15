// Versions and the changelog: cutting a release (scripts/release.mjs) and
// reading the changelog for What's new (src/lib/changelog.ts).
import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cutRelease, nextVersion, unreleased } from '../scripts/release.mjs'
import { parseChangelog } from '../src/lib/changelog'

const script = fileURLToPath(new URL('../scripts/release.mjs', import.meta.url))

const LOG = `# Changelog

Intro.

## [Unreleased]

### New
- **To-dos inside**: every to-do in one list
  however deep.

### Fixed
- The \`Move to…\` box keeps the cursor.

## [1.0.0] - 2026-10-15

The first numbered version.
Everything so far:

### Lists
- Nested bullets, see [the README](https://example.com).
`

describe('cutting a release', () => {
  it('bumps patch, minor or major', () => {
    expect(nextVersion('1.0.0', 'patch')).toBe('1.0.1')
    expect(nextVersion('1.2.3', 'minor')).toBe('1.3.0')
    expect(nextVersion('1.2.3', 'major')).toBe('2.0.0')
    expect(() => nextVersion('1.2', 'patch')).toThrow()
  })

  it('finds what is unreleased', () => {
    expect(unreleased(LOG)).toEqual(['### New', '- **To-dos inside**: every to-do in one list', '  however deep.', '### Fixed', '- The `Move to…` box keeps the cursor.'])
    expect(unreleased(cutRelease(LOG, '1.1.0', '2026-10-16'))).toEqual([])
    expect(unreleased('# Changelog\n')).toEqual([])
  })

  it('moves it under the new version, dated, above the older ones, leaving Unreleased empty', () => {
    const md = cutRelease(LOG, '1.1.0', '2026-10-16')
    expect(md.indexOf('## [Unreleased]')).toBeLessThan(md.indexOf('## [1.1.0] - 2026-10-16'))
    expect(md.indexOf('## [1.1.0] - 2026-10-16')).toBeLessThan(md.indexOf('### New'))
    expect(md.indexOf('### Fixed')).toBeLessThan(md.indexOf('## [1.0.0] - 2026-10-15'))
    expect(md).toContain('## [Unreleased]\n\n## [1.1.0] - 2026-10-16\n\n### New\n')
    expect(parseChangelog(md).map((r) => r.version)).toEqual(['1.1.0', '1.0.0'])
  })
})

describe('npm run release, in a throwaway repo', () => {
  it('refuses to deploy unreleased changes, then releases them: version, changelog, commit, tag', () => {
    const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'gs-release-'))
    const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
    const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, env, encoding: 'utf8' }).trim()
    const release = (...a: string[]) => spawnSync('node', [script, ...a], { cwd: dir, env, encoding: 'utf8' })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }, null, 2) + '\n')
    // Released so far: nothing waiting.
    writeFileSync(join(dir, 'CHANGELOG.md'), LOG.replace(/## \[Unreleased\][\s\S]*?(?=## \[1\.0\.0\])/, '## [Unreleased]\n\n'))
    git('init', '-q')
    git('add', '-A')
    git('commit', '-qm', 'init')
    expect(release('--check').status).toBe(0)

    writeFileSync(join(dir, 'CHANGELOG.md'), LOG)
    git('commit', '-qam', 'a change')
    const check = release('--check')
    expect(check.status).toBe(1)
    expect(check.stderr).toContain('unreleased changes')
    expect(release('minor', '--tag-prefix', 'node-paper-v').status).toBe(0)
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version).toBe('1.1.0')
    expect(parseChangelog(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'))[0].version).toBe('1.1.0')
    expect(git('log', '-1', '--format=%s')).toBe('Release 1.1.0')
    expect(git('tag', '-n')).toMatch(/^node-paper-v1\.1\.0\s+Release 1\.1\.0$/)
    expect(release('--check').status).toBe(0)
    // Nothing left to release.
    expect(release('patch').status).toBe(1)
  })
})

describe('reading the changelog for What’s new', () => {
  it('lists released versions only, newest first, as plain text', () => {
    const [v] = parseChangelog(LOG)
    expect(v).toEqual({
      version: '1.0.0',
      date: '2026-10-15',
      notes: ['The first numbered version. Everything so far:'],
      sections: [{ title: 'Lists', items: ['Nested bullets, see the README.'] }],
    })
    const released = parseChangelog(cutRelease(LOG, '1.1.0', '2026-10-16'))[0]
    expect(released.sections).toEqual([
      { title: 'New', items: ['To-dos inside: every to-do in one list however deep.'] },
      { title: 'Fixed', items: ['The Move to… box keeps the cursor.'] },
    ])
  })

  it('reads the real changelog, which has a version matching package.json', () => {
    const log = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    const releases = parseChangelog(log)
    expect(releases[0].version).toBe(pkg.version)
    expect(releases.every((r) => r.sections.length > 0 && r.date)).toBe(true)
  })
})
