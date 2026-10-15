// Versions: Settings → About shows the version with What's new (the changelog,
// built in); after an update, a note says so once, with What's new.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, watchConsole, shot, assert, BASE, sleep } from './lib.mjs'

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const { ctx, close } = await launch({ userDataDir: mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'gs-changes-')) })
const page = ctx.pages()[0] ?? (await ctx.newPage())
const errors = watchConsole(page)
const updatedNote = () => page.isVisible(`.toast:has-text("Updated to ${version}")`)

// The first run: nothing to say.
await page.goto(BASE + '/')
await page.waitForSelector('.outline .row')
await sleep(800)
assert(!(await updatedNote()), 'a first run says nothing about updates')

// About: the version, and What's new.
await page.goto(BASE + '/#/settings?tab=about')
await page.waitForSelector('.whats-new')
assert((await page.innerText('.facts')).includes(version), 'About shows the version: ' + version)
await page.tap('.whats-new')
await page.waitForSelector('.release')
assert((await page.innerText('.page-title')).includes('What’s new'), 'What’s new opens')
assert((await page.innerText('.changes-page')).includes(`You have Graph Paper ${version}`), 'saying which version you have')
const first = (await page.innerText('.release-title')).trim()
assert(first.startsWith(version), 'newest first, starting with this one: ' + first)
assert((await page.$$('.release-items li')).length > 3, 'with what’s in it')
await shot(page, 'changes')
await page.keyboard.press('Escape')
await page.waitForFunction(() => location.hash.startsWith('#/settings'))
assert(true, 'Esc goes back to Settings')

// After an update (the version this device last opened was older): "Updated to …", once.
await page.evaluate(() => localStorage.setItem('gs.lastVersion', '0.9.0'))
await page.reload()
await page.waitForSelector(`.toast:has-text("Updated to ${version}")`)
assert(true, 'after an update: "Updated to ' + version + '"')
await page.tap('.toast-action:has-text("What’s new")')
await page.waitForFunction(() => location.hash === '#/changes')
assert(true, 'and its button opens What’s new')
await page.goto(BASE + '/')
await page.reload()
await page.waitForSelector('.outline .row')
await sleep(800)
assert(!(await updatedNote()), 'only once')

console.log('console errors:', errors.length ? errors : 'none')
await close()
if (errors.length) process.exit(1)
