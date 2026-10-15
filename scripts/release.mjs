// Cut a release: what's under "## [Unreleased]" in CHANGELOG.md becomes the
// new version, dated today; package.json (and its lock file) get the version;
// then a commit and a tag. Pushing is up to you.
//
//   npm run release -- patch     fixes only (1.0.0 → 1.0.1)
//   npm run release -- minor     something new or changed you'd notice (1.0.0 → 1.1.0)
//   npm run release -- major     something works differently or is gone: the backup
//                                file, syncing with older versions… (1.0.0 → 2.0.0)
//   node scripts/release.mjs --check     fails if there are unreleased changes (deploy:all runs it)
//
// --dir <folder> releases another package.json + CHANGELOG.md (a build of the
// app under its own name keeps its own); --tag-prefix sets the tag ("v" by default).

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const UNRELEASED = /^## \[Unreleased\][^\n]*$/im

/** The lines under "## [Unreleased]", without blank ones. */
export function unreleased(md) {
  const m = UNRELEASED.exec(md)
  if (!m) return []
  const rest = md.slice(m.index + m[0].length)
  const next = rest.search(/^## /m)
  return (next < 0 ? rest : rest.slice(0, next)).split('\n').filter((l) => l.trim())
}

export function nextVersion(version, part) {
  const [major, minor, patch] = version.split('.').map(Number)
  if ([major, minor, patch].some((n) => !Number.isInteger(n))) throw new Error(`Not a version: ${version}`)
  if (part === 'major') return `${major + 1}.0.0`
  if (part === 'minor') return `${major}.${minor + 1}.0`
  if (part === 'patch') return `${major}.${minor}.${patch + 1}`
  throw new Error(`patch, minor or major, not ${part}`)
}

/** The changelog with what's unreleased moved under the new version, and Unreleased left empty above it. */
export function cutRelease(md, version, date) {
  const m = UNRELEASED.exec(md)
  if (!m) throw new Error('No "## [Unreleased]" heading in the changelog')
  const head = md.slice(0, m.index + m[0].length)
  const rest = md.slice(m.index + m[0].length)
  const next = rest.search(/^## /m)
  const body = (next < 0 ? rest : rest.slice(0, next)).trim()
  const after = next < 0 ? '' : rest.slice(next)
  return `${head}\n\n## [${version}] - ${date}\n\n${body}\n${after ? '\n' + after : ''}`
}

function main(args) {
  const opt = (name, fallback) => {
    const i = args.indexOf(name)
    return i >= 0 ? args[i + 1] : fallback
  }
  const dir = opt('--dir', '.')
  const prefix = opt('--tag-prefix', 'v')
  const logPath = join(dir, 'CHANGELOG.md')
  const md = readFileSync(logPath, 'utf8')
  const waiting = unreleased(md)

  if (args.includes('--check')) {
    if (!waiting.length) return
    console.error(
      `${logPath} has unreleased changes:\n${waiting.map((l) => '  ' + l).join('\n')}\n` +
        `Release them first (npm run release -- patch | minor | major${dir === '.' ? '' : ` --dir ${dir}`}), then deploy.`,
    )
    process.exit(1)
  }

  const part = args.find((a) => ['patch', 'minor', 'major'].includes(a))
  if (!part) {
    console.error('Which release? npm run release -- patch | minor | major')
    process.exit(1)
  }
  if (!waiting.length) {
    console.error(`Nothing under "## [Unreleased]" in ${logPath}: write what changed there first.`)
    process.exit(1)
  }
  const git = (...a) => String(execFileSync('git', a, { encoding: 'utf8' })).trim()
  if (git('status', '--porcelain', '--untracked-files=no')) {
    console.error('Commit or put away your changes first: a release commit has only the release in it.')
    process.exit(1)
  }

  const pkgPath = join(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const version = nextVersion(pkg.version ?? '0.0.0', part)
  const d = new Date()
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  writeFileSync(logPath, cutRelease(md, version, date))
  pkg.version = version
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  const files = [logPath, pkgPath]
  const lockPath = join(dir, 'package-lock.json')
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    lock.version = version
    if (lock.packages?.['']) lock.packages[''].version = version
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n')
    files.push(lockPath)
  }
  git('add', ...files)
  git('commit', '-m', `Release ${version}`)
  // Annotated, so `git push --follow-tags` takes it along.
  git('tag', '-a', `${prefix}${version}`, '-m', `Release ${version}`)
  console.log(`Released ${version} (tag ${prefix}${version}). Push it with the tag (git push --follow-tags), then deploy.`)
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2))
