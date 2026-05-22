// Browser-side scraper for the 2026 MHSAA D1 state-finals brackets via the
// public tennisreporting.com API. CORS is open (we tested), so this runs
// directly from the admin SPA. Output shape mirrors our app state:
// { flights: [{ id, entries[32], winners{}, scores{} }] }

import { FLIGHTS } from '../data/teams.js'

// 2026 D1 girls state finals. /event/787 returned all four divisions
// (1266..1269) and hosts (3624..3627) — we currently only scrape D1.
const EVENT_ID = 787
const HOST_ID = 3624
const DIVISION_ID = 1266
const BRACKET_API = `https://api.tennisreporting.com/event/${EVENT_ID}/host/${HOST_ID}/bracket/get`
const SEEDS_API   = `https://api.tennisreporting.com/event/${EVENT_ID}/seed_list_by_params`

const FLIGHT_SIZE = 32

function slug(name) {
  return (name || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_')
}

function nameOf(p) {
  return `${p?.firstName || ''} ${p?.lastName || ''}`.trim().replace(/\s+/g, ' ')
}

function flightSpec(id) {
  return { id, matchType: id.endsWith('D') ? 'Doubles' : 'Singles', flight: parseInt(id[0], 10) }
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${url} ${res.status}`)
  return res.json()
}

// Build a {playerId -> {schoolName, schoolId}} lookup from the seed list so we
// can attach the player's school to each entry (the bracket endpoint only
// returns player IDs, not their school).
function buildPlayerSchoolMap(seedList) {
  const map = new Map()
  for (const seed of seedList) {
    for (const p of (seed.players || [])) {
      const pl = p.player
      if (pl?.id != null) {
        map.set(pl.id, {
          schoolName: pl.school?.name,
          schoolId: pl.school?.id,
          firstName: pl.firstName,
          lastName: pl.lastName,
        })
      }
    }
  }
  return map
}

// Convert one flight's API response into entries[32] + winners{} + scores{}.
function buildFlight(flightId, bracket, seedList) {
  const isDoubles = flightId.endsWith('D')
  const playerMap = buildPlayerSchoolMap(seedList)
  const items = bracket?.configuration?.bracketItems || []

  const entries = Array.from({ length: FLIGHT_SIZE }, (_, i) => ({
    pos: i, teamId: null, seed: null, name: '', partner: '',
  }))
  const winners = {}
  const scores = {}

  // R1 items have position 1..16; teams[0]=top → pos 2*(position-1), teams[1]=bot → +1.
  // Later rounds: 8/4/2/1 items; their winners feed our winners{} map.
  const ROUND_ID = { 1: 'R1', 2: 'R2', 3: 'R3', 4: 'SF', 5: 'F' }
  for (const item of items) {
    const roundId = ROUND_ID[item.round]
    if (!roundId) continue
    const idx = item.position - 1
    const matchKey = `${roundId}m${idx}`

    // Winner side
    const winSide = item.teams?.findIndex(t => t.isWinner)
    if (winSide === 0) winners[matchKey] = 'top'
    else if (winSide === 1) winners[matchKey] = 'bot'

    if (item.score) scores[matchKey] = item.score

    // For R1, also populate entries from the team items.
    if (roundId === 'R1') {
      for (let s = 0; s < 2; s++) {
        const team = item.teams?.[s]
        if (!team || team.isEmpty || !team.items?.length) continue
        const pos = 2 * idx + s
        const playerIds = team.items.map(it => it.id)
        const players = playerIds.map(id => playerMap.get(id)).filter(Boolean)
        if (!players.length) continue
        const school = players[0].schoolName
        entries[pos] = {
          pos,
          teamId: school ? slug(school) : null,
          seed: null,
          name: `${players[0].firstName || ''} ${players[0].lastName || ''}`.trim(),
          partner: isDoubles && players[1] ? `${players[1].firstName || ''} ${players[1].lastName || ''}`.trim() : '',
        }
      }
    }
  }

  return { id: flightId, entries, winners, scores }
}

async function fetchFlight(flight) {
  const spec = flightSpec(flight.id)
  const body = { isConsolation: false, matchType: spec.matchType, flight: spec.flight, host: HOST_ID }
  const [bracket, seedList] = await Promise.all([
    postJson(BRACKET_API, body),
    postJson(SEEDS_API, { ...body, division: DIVISION_ID }),
  ])
  return buildFlight(flight.id, bracket, seedList)
}

export async function scrapeAllFlights() {
  // Limit concurrency to 4 to avoid hammering.
  const out = []
  for (let i = 0; i < FLIGHTS.length; i += 4) {
    const chunk = FLIGHTS.slice(i, i + 4)
    const results = await Promise.all(chunk.map(fetchFlight))
    out.push(...results)
  }
  return { flights: out }
}
