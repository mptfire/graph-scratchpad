// To-dos inside: every to-do in a line or a page, however deep, in one list,
// grouped under where each sits; checked off right there; Enter (or a tap) goes
// to the line, opening the folded lines above it; and all of it from the keys.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, watchConsole, shot, activeRowText, assert, BASE, sleep } from './lib.mjs'

const { ctx, close } = await launch({ userDataDir: mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'gs-todos-inside-')) })
const page = ctx.pages()[0] ?? (await ctx.newPage())
const errors = watchConsole(page)
const keys = async (...ks) => {
  for (const k of ks) await page.keyboard.press(k)
  await sleep(150)
}
const paste = (text) =>
  page.evaluate((t) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', t)
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, text)
/** The list as shown: "where: text", with [x] for done ones. */
const listed = () =>
  page.$$eval('.todo-group', (gs) =>
    gs.flatMap((g) =>
      [...g.querySelectorAll('.todo')].map((t) => {
        const where = g.querySelector('.todo-where')?.textContent.trim() ?? ''
        return `${where ? where + ': ' : ''}${t.classList.contains('done') ? '[x] ' : ''}${t.querySelector('.todo-text').textContent.trim()}`
      }),
    ),
  )
const picked = () => page.evaluate(() => document.querySelector('.todo.hl .todo-text')?.textContent.trim() ?? null)
const sub = () => page.innerText('.todos-sub')
const sheetItems = () => page.$$eval('.sheet-action:not(.cancel)', (bs) => bs.map((b) => b.textContent.trim()))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

await page.goto(BASE + '/')
await page.waitForSelector('.outline .row')

// A pad with to-dos at every depth, and a folded line.
await page.goto(BASE + '/#/pads')
await page.tap('text=New pad')
await page.waitForSelector('.editable.title')
await sleep(200)
await page.keyboard.type('Bathroom')
await page.keyboard.press('Enter')
await sleep(150)
await paste(
  [
    '- Plumbing',
    '  - [ ] Buy elbows',
    '  - Shower',
    '    - [x] Pick a valve',
    '    - [ ] Seal the drain',
    '    - a note',
    '- Tile',
    '  - [ ] Order grout',
    '- [ ] Call the inspector',
  ].join('\n'),
)
await sleep(600)
const pad = await page.evaluate(() => location.hash)
await page.tap('.row:has-text("Plumbing") .row-text')
await sleep(150)
await keys('Control+ArrowUp')
await sleep(400)
assert(!(await page.isVisible('.row:has-text("Seal the drain")')), 'Plumbing is folded')

// The page's menu: "To-dos inside (4 open)".
await page.evaluate(() => document.activeElement?.blur())
await page.tap('[aria-label="More"]')
await page.waitForSelector('.sheet')
assert((await sheetItems()).includes('To-dos inside (4 open)'), 'the page menu offers them, with the open count: ' + JSON.stringify(await sheetItems()))
await page.tap('.sheet-action:has-text("To-dos inside")')
await page.waitForSelector('.todo')
await sleep(300)
assert(same(await listed(), ['Plumbing: Buy elbows', 'Plumbing › Shower: Seal the drain', 'Tile: Order grout', 'Bathroom: Call the inspector']),
  'every open to-do, folded ones too, under where it sits: ' + JSON.stringify(await listed()))
assert((await sub()) === '4 open · 1 done', 'with how many: ' + (await sub()))
assert((await page.innerText('.back-label')) === 'Bathroom', 'back to the page')
await shot(page, 'todos-inside')

// Show done, and hide it again.
await page.tap('.todos-done')
assert(same(await listed(), ['Plumbing: Buy elbows', 'Plumbing › Shower: [x] Pick a valve', 'Plumbing › Shower: Seal the drain', 'Tile: Order grout', 'Bathroom: Call the inspector']),
  'Show done: the finished one, in its place: ' + JSON.stringify(await listed()))
await page.tap('.todos-done')
assert((await listed()).length === 4, 'Hide done')

// Checking one off: it stays, struck through, until you leave.
await page.tap('.todo:has-text("Order grout") .check')
await sleep(500)
assert((await listed()).includes('Tile: [x] Order grout'), 'checked off, still in the list: ' + JSON.stringify(await listed()))
assert((await sub()) === '3 open · 2 done', 'and counted: ' + (await sub()))

// From the keys: ↑ ↓ Ctrl-N Ctrl-P move; Space checks off and back. (On a computer the first is
// picked from the start, on a phone after the first arrow key; headless Chromium can say either.)
await keys('ArrowUp')
assert((await picked()) === 'Buy elbows', '↑: the first to-do')
await keys('ArrowDown')
assert((await picked()) === 'Seal the drain', '↓')
await keys('Control+n', 'Control+p')
assert((await picked()) === 'Seal the drain', 'Ctrl-N, Ctrl-P')
await keys('Space')
await sleep(400)
assert((await listed()).includes('Plumbing › Shower: [x] Seal the drain'), 'Space checks it off')
await keys('Space')
await sleep(400)
assert((await listed()).includes('Plumbing › Shower: Seal the drain'), 'and Space again unchecks it')

// Enter goes to the line in its list: the folded line above it opens, and the cursor is on it.
await keys('Enter')
await page.waitForFunction((p) => location.hash === p, pad)
await page.waitForSelector('.row:has-text("Seal the drain")')
await sleep(500)
assert((await activeRowText(page)) === 'Seal the drain', 'Enter: on the line, its folded lines opened: ' + (await activeRowText(page)))

// The line's menu: only for a line with to-dos inside; Esc goes back.
await page.tap('.row:has-text("Tile") .row-text')
await sleep(200)
await keys('Control+Shift+K')
assert((await sheetItems()).includes('To-dos inside (1 open)') || (await sheetItems()).includes('To-dos inside (all done)'), 'a line’s menu offers its to-dos: ' + JSON.stringify(await sheetItems()))
await keys('Escape')
await page.tap('.row:has-text("a note") .row-text')
await sleep(200)
await keys('Control+Shift+K')
assert(!(await sheetItems()).some((s) => s.startsWith('To-dos inside')), 'and not for a line with none inside')
await keys('Escape')
await page.tap('.row:has-text("Plumbing") .row-text')
await sleep(200)
await keys('Control+Shift+K')
await page.tap('.sheet-action:has-text("To-dos inside")')
await page.waitForSelector('.todo')
await sleep(300)
assert(same(await listed(), ['Plumbing: Buy elbows', 'Shower: Seal the drain']), 'a line’s own to-dos: ' + JSON.stringify(await listed()))
await keys('Escape')
await page.waitForFunction((p) => location.hash === p, pad)
assert(true, 'Esc goes back')

console.log('console errors:', errors.length ? errors : 'none')
await close()
if (errors.length) process.exit(1)
