// Lanes in the graph view: offered only on a page with two or more numbered
// lists side by side; a band per list, its bullets in outline order, columns
// on a phone and rows on a wide screen; on and off kept in the URL, so back
// brings them back.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, watchConsole, shot, assert, BASE, sleep } from './lib.mjs'

const { ctx, close } = await launch({ userDataDir: mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'gs-lanes-')) })
const page = ctx.pages()[0] ?? (await ctx.newPage())
const errors = watchConsole(page)
const paste = (text) =>
  page.evaluate((t) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', t)
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, text)
/** Where each labelled node is, by its label. */
const where = () =>
  page.$$eval('.gnode', (gs) =>
    Object.fromEntries(
      gs.map((g) => {
        const [x, y] = g.getAttribute('transform').match(/-?[\d.]+/g).map(Number)
        return [g.querySelector('text.label').textContent, { x, y }]
      }),
    ),
  )
const bands = () =>
  page.$$eval('.lane-band', (bs) =>
    bs.map((b) => {
      const r = b.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }),
  )
/** Every band on screen, inside the graph. */
const allInView = () =>
  page.evaluate(() => {
    const s = document.querySelector('svg.graph').getBoundingClientRect()
    return [...document.querySelectorAll('.lane-band')].every((b) => {
      const r = b.getBoundingClientRect()
      return r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1
    })
  })
/** Labels that run into each other (pairs of texts). */
const overlapping = () =>
  page.$$eval('svg.graph .gnode text.label', (ls) => {
    const boxes = ls.map((l) => ({ t: l.textContent, r: l.getBoundingClientRect() }))
    const out = []
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r
        const b = boxes[j].r
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.push([boxes[i].t, boxes[j].t])
      }
    return out
  })
const visibleChildLines = () =>
  page.$$eval('svg.graph .edge-child', (l) => l.filter((x) => getComputedStyle(x).display !== 'none').length)

await page.goto(BASE + '/')
await page.waitForSelector('.outline .row')

// The welcome pad has one numbered list among notes: no lanes, in the menu or the graph.
await page.tap('[aria-label="More"]')
await page.waitForSelector('.sheet-action')
assert(!(await page.isVisible('.sheet-action:has-text("Show as lanes")')), 'the welcome pad isn’t offered lanes')
await page.tap('.sheet-action:has-text("Show graph")')
await page.waitForSelector('.gnode.center')
await sleep(500)
assert(!(await page.isVisible('.lanes-toggle')), 'nor is its graph')

// A process with three parties: a numbered list each.
await page.goto(BASE + '/#/pads')
await page.tap('text=New pad')
await page.waitForSelector('.editable.title')
await sleep(200)
await page.keyboard.type('Online order')
await page.keyboard.press('Enter')
await sleep(150)
await paste(
  [
    '# Customer',
    '1. Place the order',
    '2. Pay',
    '3. Get the parcel',
    '# Shop',
    '1. Check stock',
    '2. Take payment',
    '# Warehouse',
    '1. Pick and pack',
    '2. Hand it to the courier',
  ].join('\n'),
)
await sleep(700)
await page.tap('[aria-label="Hide keyboard"]')
await sleep(300)

// The menu offers lanes, and they open as a band per list.
await page.tap('[aria-label="More"]')
await page.tap('.sheet-action:has-text("Show as lanes")')
await page.waitForSelector('.lane-band')
await sleep(800)
assert(page.url().includes('lanes=1'), 'lanes are in the URL: ' + page.url())
assert((await bands()).length === 3, 'a band per list: ' + (await bands()).length)
assert((await page.getAttribute('.lanes-toggle', 'aria-pressed')) === 'true', 'the Lanes button shows they’re on')
assert(!(await page.isVisible('.segmented')), 'steps don’t apply to lanes')
assert((await visibleChildLines()) === 0, 'the band stands for the lines from a list to its bullets')
assert(await allInView(), 'all the lanes fit the screen')

// On a phone held upright, lanes are columns: side by side, each list's bullets going down in order.
let at = await where()
assert(at.Customer.x < at.Shop.x && at.Shop.x < at.Warehouse.x, 'columns, in outline order: ' + JSON.stringify(at))
assert(at['Place the order'].y < at.Pay.y && at.Pay.y < at['Get the parcel'].y, 'a list goes down in order')
assert(Math.abs(at['Check stock'].x - at.Shop.x) < 40, 'and stays in its lane')
assert((await bands()).every((b) => b.h > b.w), 'the bands are columns')
assert((await overlapping()).length === 0, 'no labels run into each other: ' + JSON.stringify(await overlapping()))
await shot(page, 'lanes-columns')

// Tap a bullet: the card shows it, and lanes stay on.
await page.tap('.gnode:has(text.label:text-is("Shop"))')
await sleep(600)
assert((await page.textContent('.focus-card .focus-label')) === 'Shop', 'the card shows what you tapped')
assert((await bands()).length === 3, 'still lanes after a tap')

// Off: the ordinary graph, with its steps; back brings the lanes back (it's in the URL).
await page.tap('.lanes-toggle')
await page.waitForSelector('.lane-band', { state: 'detached' })
await sleep(500)
assert(!page.url().includes('lanes=1'), 'off leaves the URL: ' + page.url())
assert(await page.isVisible('.segmented'), 'the steps are back')
assert((await visibleChildLines()) > 0, 'and the lines to the bullets')
await page.goBack()
await page.waitForSelector('.lane-band')
await sleep(500)
assert((await bands()).length === 3, 'back brings the lanes back')

// Turned on its side (a wide screen): rows, stacked in order, each list's bullets going right.
await page.setViewportSize({ width: 900, height: 420 })
await sleep(1000)
at = await where()
assert(at.Customer.y < at.Shop.y && at.Shop.y < at.Warehouse.y, 'rows, in outline order: ' + JSON.stringify(at))
assert(at['Place the order'].x < at.Pay.x && at.Pay.x < at['Get the parcel'].x, 'a list goes right in order')
assert((await bands()).every((b) => b.w > b.h), 'the bands are rows')
assert(await allInView(), 'and they fit the screen too')
// A short screen shows the lanes small; labels keep a readable size, and the spacing makes room for them.
assert((await overlapping()).length === 0, 'no labels run into each other: ' + JSON.stringify(await overlapping()))
await shot(page, 'lanes-rows')

console.log('console errors:', errors.length ? errors : 'none')
await close()
if (errors.length) process.exit(1)
