// Keyboard: Ctrl-K opens Search; ↑ ↓ (or Ctrl-N Ctrl-P) pick a result, Enter
// opens it, Esc goes back to the line you were on. With Vim keys, a page you
// arrive on has a cursor already, so j and k work without a click first.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, watchConsole, shot, activeRowText, assert, BASE, sleep } from './lib.mjs'

const { ctx, close } = await launch({ userDataDir: mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'gs-keys-')) })
const page = ctx.pages()[0] ?? (await ctx.newPage())
const errors = watchConsole(page)
const keys = async (...ks) => {
  for (const k of ks) await page.keyboard.press(k)
  await sleep(150)
}
const highlighted = () => page.evaluate(() => document.querySelector('.list-main.hl .list-label')?.textContent ?? null)
const inSearchBox = () => page.evaluate(() => document.activeElement?.classList.contains('search-input') ?? false)
const onTitle = () => page.evaluate(() => document.activeElement?.classList.contains('title') ?? false)
const mode = () => page.innerText('.edit-toolbar .vim-mode')
const toSearch = async () => {
  await keys('Control+k')
  await page.waitForFunction(() => location.hash === '#/search')
  await sleep(300)
}

await page.goto(BASE + '/')
await page.waitForSelector('.outline .row')

// A pad to search.
await page.goto(BASE + '/#/pads')
await page.tap('text=New pad')
await page.waitForSelector('.editable.title')
await sleep(200)
await page.keyboard.type('Keys')
await page.keyboard.press('Enter')
await page.keyboard.type('Zebra crossing')
await page.keyboard.press('Enter')
await page.keyboard.type('Zebra finch')
await page.keyboard.press('Enter')
await page.keyboard.type('Zebra mussel')
await page.keyboard.press('Enter')
await page.keyboard.type('plain line')
await sleep(300)
const pad = await page.evaluate(() => location.hash)

// Ctrl-K, from a line: Search, ready to type.
await toSearch()
assert(await inSearchBox(), 'Ctrl-K opens Search, in the box')
await page.keyboard.type('zebra')
await page.waitForFunction(() => document.querySelectorAll('#search-results li').length === 3)
await sleep(200)

// (On a touch screen the highlight waits for the first ↑ or ↓, and the keyboard's Search key only
// puts the keyboard away. Headless Chromium says it has a mouse even as a phone, so not tested here.)
const labels = await page.$$eval('#search-results .list-label', (els) => els.map((e) => e.textContent))
await keys('ArrowUp')
assert((await highlighted()) === labels[0], '↑: the first result is highlighted: ' + (await highlighted()))
await keys('Control+n')
assert((await highlighted()) === labels[1], 'Ctrl-N: the next one')
await keys('Control+p')
assert((await highlighted()) === labels[0], 'Ctrl-P: back up')
await keys('ArrowDown', 'ArrowDown', 'ArrowDown')
assert((await highlighted()) === labels[2], '↓ stops at the last result')
await keys('ArrowUp')
const second = labels[1]
assert((await highlighted()) === second, '↑: up again')
await shot(page, 'keys-search')

// Ctrl-K on Search: back in the box, the words selected to type over.
await page.tap('.page-title')
await keys('Control+k')
assert(await inSearchBox(), 'Ctrl-K on Search goes back to the box')
assert((await page.evaluate(() => getSelection()?.toString() || document.activeElement.value.slice(document.activeElement.selectionStart, document.activeElement.selectionEnd))) === 'zebra', 'with the words selected')

// Enter opens the highlighted one (↑ ↓ again first: the tap and Ctrl-K kept it).
assert((await highlighted()) === second, 'the highlight stayed')
await keys('Enter')
await page.waitForFunction(() => location.hash.startsWith('#/n/'))
await page.waitForSelector('.editable.title')
await sleep(300)
assert((await page.innerText('.editable.title')).replace(/​/g, '').trim() === second, 'Enter opens it')

// A menu that's open keeps the keys.
await page.tap('[aria-label="More"]')
await page.waitForSelector('.sheet')
const here = await page.evaluate(() => location.hash)
await keys('Control+k')
await sleep(200)
assert((await page.evaluate(() => location.hash)) === here, 'Ctrl-K with a menu open: the menu stays')
await page.tap('.sheet-backdrop', { position: { x: 10, y: 10 } })
await page.waitForSelector('.sheet', { state: 'detached' })

// Esc from Search: back where you were, on the line you were on.
await page.tap('.topbar .back')
await page.waitForFunction((p) => location.hash === p, pad)
await page.waitForSelector('.row:has-text("plain line")')
await sleep(300)
await page.tap('.row:has-text("plain line") .row-text')
await sleep(200)
await toSearch()
await keys('Escape')
await page.waitForFunction((p) => location.hash === p, pad)
await sleep(500)
assert((await activeRowText(page)) === 'plain line', 'Esc: back on the line you were on: ' + (await activeRowText(page)))

// With Vim keys: a page you arrive on has a cursor, on the line you were last on there.
await page.goto(BASE + '/#/settings')
await page.tap('text=Turn on Vim keys')
await page.waitForSelector('text=Turn off Vim keys')
await page.tap('.bottom-nav >> text=Pads')
await page.waitForSelector('.list-item:has-text("Keys")')
await page.tap('.list-item:has-text("Keys") .list-main')
await page.waitForSelector('.outline .row')
await sleep(500)
assert((await activeRowText(page)) === 'plain line', 'arriving with Vim keys: the cursor is on the line you were on, with no click: ' + (await activeRowText(page)))
assert((await mode()) === 'Normal', 'in normal mode')
await keys('k')
assert((await activeRowText(page)) === 'Zebra mussel', 'k works at once')
await keys('k')
assert((await activeRowText(page)) === 'Zebra finch', 'and on up')

// The cursor lost (a tap elsewhere, a menu): j brings it back, to the same line.
await page.evaluate(() => document.activeElement?.blur())
await sleep(300)
assert((await activeRowText(page)) === null, 'no cursor')
await keys('j')
assert((await activeRowText(page)) === 'Zebra finch', 'j brings it back to the line it was on: ' + (await activeRowText(page)))

// Ctrl-K and Esc with Vim keys: back on the line, in normal mode.
await toSearch()
await keys('Escape')
await page.waitForFunction((p) => location.hash === p, pad)
await sleep(500)
assert((await activeRowText(page)) === 'Zebra finch', 'Esc from Search, Vim keys on: back on the line: ' + (await activeRowText(page)))
assert((await mode()) === 'Normal', 'in normal mode')

// A page you haven't been on: the cursor is on its title. Opening the app on a page, too.
await page.reload()
await page.waitForSelector('.outline .row')
await sleep(800)
assert(await onTitle(), 'after a reload: the cursor is on the title')
await shot(page, 'keys-vim-arrive')
await keys('j')
assert((await activeRowText(page)) === 'Zebra crossing', 'and j goes straight into the list')

console.log('console errors:', errors.length ? errors : 'none')
await close()
if (errors.length) process.exit(1)
