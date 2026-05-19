// Convert scraper/state-2025.json -> app-shaped state.json, then push to
// Supabase so the live app shows the real 2025 D1 State Finals brackets.
// Pull env from app/.env.local (vercel env pull --environment=production).

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Usage: node seed-2025.mjs [D1|D2|D3|D4]
const DIVISION = (process.argv[2] || 'D1').toUpperCase()
const ROW_BY_DIVISION = { D1: 1, D2: 2, D3: 3, D4: 4 }
const ROW_ID = ROW_BY_DIVISION[DIVISION]
if (!ROW_ID) { console.error(`Unknown division ${DIVISION}`); process.exit(1) }

const scrape = JSON.parse(readFileSync(join(__dirname, `state-2025-${DIVISION.toLowerCase()}.json`), 'utf8'))

const FLIGHT_SIZE = 32
const FLIGHT_IDS = ['1S', '2S', '3S', '4S', '1D', '2D', '3D', '4D']

function slug(name) {
  return name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_')
}

// Match definitions, mirroring app/src/lib/bracket.js.
const MATCH_DEFS = (() => {
  const defs = []
  for (let i = 0; i < 16; i++) defs.push({ id: `R1m${i}`, round: 'R1', top: 2 * i, bot: 2 * i + 1 })
  const later = [
    { round: 'R2', count: 8, prev: 'R1' },
    { round: 'R3', count: 4, prev: 'R2' },
    { round: 'SF', count: 2, prev: 'R3' },
    { round: 'F',  count: 1, prev: 'SF' },
  ]
  for (const { round, count, prev } of later) {
    for (let i = 0; i < count; i++) defs.push({ id: `${round}m${i}`, round, top: `${prev}m${2 * i}`, bot: `${prev}m${2 * i + 1}` })
  }
  return defs
})()

// Build one flight's { entries, winners } from the scrape rounds.
function buildFlight(flightId, fdata) {
  const isDoubles = flightId.endsWith('D')
  const roundsByName = Object.fromEntries(fdata.rounds.map(r => [r.heading, r.matches]))
  const r1 = roundsByName['Round 1'] || []
  const r2 = roundsByName['Round 2'] || []
  const r3 = roundsByName['Round 3'] || []
  const sf = roundsByName['Semifinals'] || []
  const f  = roundsByName['Championship'] || []

  // ---- entries[0..31] from R1 listitems ----
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

  // ---- winners derived from later rounds ----
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
const state = { flights }

const outFile = join(__dirname, `state-2025-app-${DIVISION.toLowerCase()}.json`)
writeFileSync(outFile, JSON.stringify(state, null, 2))
console.log(`Wrote ${outFile}`)
for (const f of flights) {
  const filled = f.entries.filter(e => e.teamId).length
  const wins = Object.keys(f.winners).length
  console.log(`  ${f.id}: ${filled} entries, ${wins} winners recorded`)
}

// ---- push to Supabase ----
const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
if (!URL || !ANON) {
  console.log('\nNo Supabase creds in env — skipping push. State file above can be Imported manually.')
  process.exit(0)
}

const supabase = createClient(URL, ANON)
const { error } = await supabase
  .from('tennis_state')
  .upsert({ id: ROW_ID, data: state, updated_at: new Date().toISOString() })
if (error) {
  console.error('Push failed:', error.message)
  process.exit(1)
}
console.log(`\nPushed 2025 ${DIVISION} state finals to Supabase row id=${ROW_ID}.`)
