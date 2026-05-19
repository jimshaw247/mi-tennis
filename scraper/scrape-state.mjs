// Scrape MHSAA D1 Girls State Finals 2025 brackets — all 8 flights.
// Output: scraper/state-2025.json with parsed bracket data per flight.
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Per-year, per-division constants. Usage:
//   node scrape-state.mjs                # defaults: 2025 D1
//   node scrape-state.mjs D2             # 2025 D2 (needs DIVISIONS[D2] filled in)
//
// Event 611 = MHSAA Finals Tournament-2025.
// Division 995/996/997/998 = D1/D2/D3/D4 (verify per-year — these are 2025 values).
// Host 2951 = State Finals-D1 (host IDs differ per division).
const EVENT_ID = 611
const DIVISIONS = {
  D1: { division: 995, host: 2951 },
  D2: { division: 996, host: 2952 },
  D3: { division: 997, host: 2953 },
  D4: { division: 998, host: 2954 },
}
const TARGET = (process.argv[2] || 'D1').toUpperCase()
const conf = DIVISIONS[TARGET]
if (!conf?.division || !conf?.host) {
  console.error(`No URL config for ${TARGET}. Update DIVISIONS in scrape-state.mjs.`)
  process.exit(1)
}
const BASE = `https://tennisreporting.com/event/brackets/${EVENT_ID}?division=${conf.division}&host=${conf.host}`
const OUT_SUFFIX = TARGET.toLowerCase()

const FLIGHTS = [
  ...[1, 2, 3, 4].map(f => ({ id: `${f}S`, type: 'Singles', flight: f })),
  ...[1, 2, 3, 4].map(f => ({ id: `${f}D`, type: 'Doubles', flight: f })),
]

function urlFor(f) {
  return `${BASE}&matchType=${f.type}&flight=${f.flight}`
}

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
})

mkdirSync(`${__dirname}/raw-state-${OUT_SUFFIX}`, { recursive: true })

const all = {}
for (const f of FLIGHTS) {
  const page = await ctx.newPage()
  const url = urlFor(f)
  console.log(`[${f.id}] ${url}`)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(1200)
  // The page only shows 3 of 5 round columns at a time. Toggle the SF and
  // Championship nav buttons on so their data appears in the DOM. The page
  // also auto-deactivates earlier rounds when later ones are activated; we
  // scrape rounds round-by-round to capture all 5.
  const allRounds = ['Round 1', 'Round 2', 'Round 3', 'Semifinals', 'Championship']
  const combinedRounds = []
  for (const target of allRounds) {
    await page.evaluate((targetLabel) => {
      // Click the target nav button if not already active.
      const navs = [...document.querySelectorAll('.bracket-navbar .nav-btn')]
      const btn = navs.find(n => n.textContent.trim() === targetLabel)
      if (btn && !btn.classList.contains('active')) btn.click()
    }, target)
    await page.waitForTimeout(300)
    const roundData = await page.evaluate((targetLabel) => {
      function textOf(el) { return (el?.textContent || '').trim() }
      function isDateOrTime(t) {
        return /^\d{2}\/\d{2}\/\d{4}$/.test(t) || /\d{1,2}:\d{2}\s*(am|pm)/i.test(t) || /@/.test(t) || /^Date:/i.test(t)
      }
      function parseLi(li) {
        const sides = []
        let cur = null
        function flush() { if (cur) { sides.push(cur); cur = null } }
        const walker = document.createTreeWalker(li, NodeFilter.SHOW_ELEMENT)
        let node = walker.nextNode()
        while (node) {
          const hasElementChild = node.querySelector('*') != null
          if (hasElementChild) { node = walker.nextNode(); continue }
          const tag = node.tagName
          const t = textOf(node)
          if (!t) { node = walker.nextNode(); continue }
          if (isDateOrTime(t)) { node = walker.nextNode(); continue }
          if (tag === 'A' && /\/reports\/player\//.test(node.getAttribute('href') || '')) {
            if (!cur) cur = { type: 'players', players: [], school: '' }
            const href = node.getAttribute('href') || ''
            const pid = href.match(/player\/(\d+)/)?.[1] || null
            cur.players.push({ name: t, playerId: pid })
          } else if (/^BYE$/i.test(t)) {
            flush()
            sides.push({ type: 'bye' })
          } else if (cur && cur.players.length > 0 && !cur.school) {
            cur.school = t
            flush()
          }
          node = walker.nextNode()
        }
        flush()
        // Detect winner: tennisreporting tags the winning side's team-info
        // with .winner-team. Iterate the two team-item containers in order.
        const sideContainers = [...li.querySelectorAll('.tournament-bracket__team-item')]
        let winner = null
        for (let i = 0; i < sideContainers.length && i < 2; i++) {
          if (sideContainers[i].querySelector('.winner-team')) {
            winner = i === 0 ? 'top' : 'bot'
          }
        }
        // Set scores: the .score-bracket element carries the score in its
        // data-after attribute (e.g. "6 - 2 / 7 - 5"). "VS" means undecided.
        const scoreEl = li.querySelector('.score-bracket')
        const rawScore = scoreEl?.getAttribute('data-after')?.trim() || ''
        const score = (rawScore && rawScore !== 'VS') ? rawScore.replace(/\s+/g, ' ') : null
        return { sides, winner, score, raw: textOf(li).replace(/\s+/g, ' ') }
      }
      const round = [...document.querySelectorAll('.tournament-bracket__round')]
        .find(r => textOf(r.querySelector('.tournament-bracket__round-title')) === targetLabel)
      if (!round) return null
      const lis = [...round.querySelectorAll(':scope > ul > li')]
      return { heading: targetLabel, matches: lis.map(parseLi) }
    }, target)
    if (roundData) combinedRounds.push(roundData)
  }
  const parsed = { rounds: combinedRounds }
  all[f.id] = { flight: f, url, ...parsed }
  // Save raw HTML for debugging.
  const html = await page.content()
  writeFileSync(`${__dirname}/raw-state-${OUT_SUFFIX}/${f.id}.html`, html)
  console.log(`[${f.id}] rounds: ${parsed.rounds.map(r => `${r.heading}=${r.matches.length}`).join(', ')}`)
  await page.close()
}

await browser.close()
writeFileSync(`${__dirname}/state-2025-${OUT_SUFFIX}.json`, JSON.stringify(all, null, 2))
console.log(`Wrote scraper/state-2025-${OUT_SUFFIX}.json`)
