// Keyboard: Ctrl-K opens Search; ↑ ↓ (or Ctrl-N Ctrl-P) pick a result, Enter
// opens it, Esc goes back to the line you were on. With Vim keys, a page you
// arrive on has a cursor already, so j and k work without a click first.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, watchConsole, shot, outline, activeRowText, assert, BASE, sleep } from './lib.mjs'

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

// Shift-Ctrl-K: the line's menu, its first action picked; ↑ ↓ Ctrl-N Ctrl-P pick, Esc closes.
const picked = () => page.evaluate(() => document.querySelector('.sheet-action.hl')?.textContent?.trim() ?? null)
const sheetTitle = async () => ((await page.isVisible('.sheet')) ? (await page.innerText('.sheet-title')).trim() : null)
await keys('Control+Shift+K')
assert((await sheetTitle()) === 'plain line', 'Shift-Ctrl-K opens the menu of the line you’re on')
const actions = await page.$$eval('.sheet-action:not(.cancel)', (bs) => bs.map((b) => b.textContent.trim()))
assert((await picked()) === actions[0] && actions[0] === 'Open', 'its first action picked: ' + (await picked()))
await keys('ArrowDown')
assert((await picked()) === actions[1], '↓: the next')
await keys('Control+n')
assert((await picked()) === actions[2], 'Ctrl-N: the next')
await keys('Control+p', 'ArrowUp')
assert((await picked()) === actions[0], 'Ctrl-P and ↑: back up')
await shot(page, 'keys-menu')
// While it's open, keys don't reach the line.
await keys('x', 'Escape')
assert((await sheetTitle()) === null, 'Esc closes it')
assert((await activeRowText(page)) === 'plain line', 'still on the line, nothing typed: ' + (await activeRowText(page)))
// Enter does the picked one.
await keys('Control+Shift+K', 'Enter')
await page.waitForFunction((p) => location.hash !== p, pad)
await page.waitForSelector('.editable.title')
await sleep(300)
assert((await page.innerText('.editable.title')).replace(/​/g, '').trim() === 'plain line', 'Enter: Open')
await page.goBack()
await page.waitForFunction((p) => location.hash === p, pad)
await page.waitForSelector('.outline .row')
await sleep(300)

// On the title, or with no line being edited: the page's menu (the ⋯ at the top).
await page.tap('.editable.title')
await sleep(200)
await keys('Control+Shift+K')
assert((await sheetTitle()) === 'Keys', 'on the title: the page’s menu')
await keys('Escape')
await page.evaluate(() => document.activeElement?.blur())
await keys('Control+Shift+K')
assert((await sheetTitle()) === 'Keys', 'with no line being edited: the page’s menu too')
await keys('Escape')

// ?: the shortcuts, unless you're typing.
const helpOpen = () => page.isVisible('.keys-help')
await page.tap('.row:has-text("plain line") .row-text')
await sleep(200)
await keys('End')
await page.keyboard.type('?')
await sleep(150)
assert((await activeRowText(page)) === 'plain line?' && !(await helpOpen()), '? types into a line being edited')
await keys('Backspace')
await page.evaluate(() => document.activeElement?.blur())
await keys('?')
assert(await helpOpen(), '? with no line being edited: the shortcuts')
assert(await page.isVisible('.keys-help >> text=Stop editing'), 'Esc to stop editing is listed (Vim keys are off)')
await shot(page, 'keys-help')
await keys('Escape')
assert(!(await helpOpen()), 'Esc closes them')

// Move to…, all from the keyboard: the box has the cursor, ↑ ↓ Ctrl-N Ctrl-P pick, → opens a
// list, ← goes back up, and typing a name then Enter, Enter moves the line there.
const pickerPicked = () =>
  page.evaluate(() => {
    const el = document.querySelector('.picker .picker-here.hl, .picker .picker-results .hl')
    return el ? (el.classList.contains('picker-here') ? 'here' : el.querySelector('.picker-label')?.textContent?.trim()) : null
  })
const trailNow = () => page.$$eval('.picker-trail button', (bs) => bs.map((b) => b.textContent.trim()).join(' › '))
await page.tap('.row:has-text("plain line") .row-text')
await sleep(200)
await keys('Control+Shift+K', 'ArrowDown')
assert((await picked()) === 'Move to…', 'the menu, on Move to…')
await keys('Enter')
await page.waitForSelector('.picker-here')
await sleep(300)
assert(await page.evaluate(() => document.activeElement?.classList.contains('picker-input')), 'Move to… opens with the cursor in its box')
assert((await pickerPicked()) === 'here', 'picked: "Move into" where the line is now')
await keys('Control+n')
assert((await pickerPicked()) === 'Zebra crossing', 'Ctrl-N: the first list here (not the line being moved)')
await keys('ArrowDown', 'Control+p')
assert((await pickerPicked()) === 'Zebra crossing', '↓ then Ctrl-P: back')
await keys('ArrowRight')
await page.waitForFunction(() => document.querySelector('.picker-here')?.textContent.includes('Zebra crossing'))
assert((await trailNow()).endsWith('Keys › Zebra crossing'), '→ opens it: ' + (await trailNow()))
assert((await pickerPicked()) === 'here', 'with "Move into" picked')
await keys('ArrowLeft')
await page.waitForFunction(() => document.querySelector('.picker-here')?.textContent.includes('Keys'))
assert((await trailNow()).endsWith('Keys'), '← goes back up: ' + (await trailNow()))
await page.keyboard.type('mussel')
await page.waitForSelector('.picker-results .hl:has-text("Zebra mussel")')
await shot(page, 'keys-move-search')
await keys('Enter')
await page.waitForFunction(() => document.querySelector('.picker-here')?.textContent.includes('Zebra mussel'))
assert(await page.evaluate(() => document.activeElement?.classList.contains('picker-input')), 'Enter on a result opens it, the cursor still in the box')
assert((await pickerPicked()) === 'here', 'with "Move into “Zebra mussel”" picked')
await keys('Enter')
await page.waitForSelector('.picker', { state: 'detached' })
await sleep(500)
const moved = await outline(page)
assert(moved.indexOf('  plain line') === moved.indexOf('Zebra mussel') + 1, 'and Enter moves the line into it: ' + JSON.stringify(moved))

// With Vim keys: a page you arrive on has a cursor, on the line you were last on there.
await page.goto(BASE + '/#/settings')
// (Settings has a button for the shortcuts too.)
await page.tap('button:has-text("Keyboard shortcuts")')
assert(await helpOpen(), 'Settings → Keyboard shortcuts')
await page.tap('.keys-help button:has-text("Close")')
assert(!(await helpOpen()), 'and Close')
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

// In normal mode, ? shows the shortcuts (not Vim's), and the line keeps its cursor.
await keys('?')
assert(await helpOpen(), '? in normal mode: the shortcuts')
assert(!(await page.isVisible('.keys-help >> text=Stop editing')), 'without Esc to stop editing (it’s normal mode here)')
await keys('j', 'Escape')
assert(!(await helpOpen()), 'Esc closes them')
assert((await activeRowText(page)) === 'Zebra finch' && (await mode()) === 'Normal', 'the line and mode as they were (j didn’t move)')
// Shift-Ctrl-K in normal mode: the line's menu; Esc leaves normal mode alone.
await keys('Control+Shift+K')
assert((await sheetTitle()) === 'Zebra finch', 'Shift-Ctrl-K in normal mode: the line’s menu')
await keys('Escape')
assert((await sheetTitle()) === null && (await mode()) === 'Normal', 'Esc closes it, still in normal mode')

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
