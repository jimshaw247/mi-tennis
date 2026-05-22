// Convert scraper/state-2026-{div}.json -> app state -> push via /api/state.
// Usage: ADMIN_PASS=... node push-state-2026.mjs [D1|D2|D3|D4] [--url=https://mitennis.vercel.app]
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DIVISION = (process.argv.find(a => /^D[1-4]$/i.test(a)) || 'D1').toUpperCase()
const ROW_BY_DIVISION = { D1: 1, D2: 2, D3: 3, D4: 4 }
const ROW_ID = ROW_BY_DIVISION[DIVISION]
const TARGET = (process.argv.find(a => a.startsWith('--url=')) || '--url=https://mitennis.vercel.app').split('=')[1]
const ADMIN_PASS = process.env.ADMIN_PASS
if (!ADMIN_PASS) { console.error('Set ADMIN_PASS env var first'); process.exit(1) }

const scrape = JSON.parse(readFileSync(join(__dirname, `state-2026-${DIVISION.toLowerCase()}.json`), 'utf8'))

const FLIGHT_SIZE = 32
const FLIGHT_IDS = ['1S', '2S', '3S', '4S', '1D', '2D', '3D', '4D']

function slug(name) {
  return name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_')
}

function buildFlight(flightId, fdata) {
  const isDoubles = flightId.endsWith('D')
  const roundsByName = Object.fromEntries(fdata.rounds.map(r => [r.heading, r.matches]))
  const r1 = roundsByName['Round 1'] || []
  const r2 = roundsByName['Round 2'] || []
  const r3 = roundsByName['Round 3'] || []
  const sf = roundsByName['Semifinals'] || []
  const f  = roundsByName['Championship'] || []

  const entries = Array.from({ length: FLIGHT_SIZE }, (_, i) => ({
    pos: i, teamId: null, seed: null, name: '', partner: '',
  }))
  for (let i = 0; i < Math.min(r1.length, 16); i++) {
    const m = r1[i]
    const sides = m.sides || []
    for (let s = 0; s < 2; s++) {
      const pos = 2 * i + s
      const side = sides[s]
      if (!side || side.type === 'bye') continue
      const players = side.players || []
      entries[pos] = {
        pos,
        teamId: side.school ? slug(side.school) : null,
        seed: null,
        name: players[0]?.name?.trim().replace(/\s+/g, ' ') || '',
        partner: isDoubles ? (players[1]?.name?.trim().replace(/\s+/g, ' ') || '') : '',
      }
    }
  }

  const winners = {}
  const scores = {}
  function recordExplicit(roundMatches, roundId) {
    for (let i = 0; i < roundMatches.length; i++) {
      const m = roundMatches[i]
      if (m?.winner) winners[`${roundId}m${i}`] = m.winner
      if (m?.score) scores[`${roundId}m${i}`] = m.score
    }
  }
  recordExplicit(r1, 'R1')
  recordExplicit(r2, 'R2')
  recordExplicit(r3, 'R3')
  recordExplicit(sf, 'SF')
  recordExplicit(f,  'F')

  return { id: flightId, entries, winners, scores }
}

const flights = FLIGHT_IDS.map(id => buildFlight(id, scrape[id]))
const state = { flights, meta: { source: 'live' } }

console.log(`Built ${DIVISION} state — ${flights.length} flights:`)
for (const f of flights) {
  const filled = f.entries.filter(e => e.teamId).length
  console.log(`  ${f.id}: ${filled}/32 entries, ${Object.keys(f.winners).length} winners`)
}

console.log(`\nPushing to ${TARGET}/api/state (row id=${ROW_ID})...`)
const res = await fetch(`${TARGET}/api/state`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PASS },
  body: JSON.stringify({ stateRowId: ROW_ID, state }),
})
if (!res.ok) {
  console.error(`Push failed: ${res.status} ${res.statusText}`)
  console.error(await res.text())
  process.exit(1)
}
const body = await res.json()
console.log(`OK — updatedAt: ${body.updatedAt}`)
