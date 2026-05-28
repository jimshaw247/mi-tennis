// Vercel cron handler. Scrapes tennisreporting.com for all 4 MHSAA state-
// finals divisions and merges into Supabase. TR is the source of truth: if
// admin tap and TR disagree, TR wins. If TR is silent on a match the admin
// already tapped, the admin tap stays (admin is ahead of TR).
//
// Schedule (vercel.json):
//   "*/5 12-23 27-30 5 *"  — every 5 min, 8 AM-7:55 PM EDT, May 27-30
//                             (D4: May 27-28, D1: May 29-30)
//   "*/5 12-23 3-6 6 *"    — every 5 min, 8 AM-7:55 PM EDT, June 3-6
//                             (D2: June 3-4, D3: June 5-6)
// Outside those windows the cron does not fire. Each run handles all 4
// divisions; rows for divisions not yet playing simply no-op.
import { createClient } from '@supabase/supabase-js'

const EVENT_ID = 787
const DIVISIONS = {
  D1: { rowId: 1, divisionId: 1266, hostId: 3624 },
  D2: { rowId: 2, divisionId: 1267, hostId: 3625 },
  D3: { rowId: 3, divisionId: 1268, hostId: 3626 },
  D4: { rowId: 4, divisionId: 1269, hostId: 3627 },
}
const FLIGHTS = ['1S', '2S', '3S', '4S', '1D', '2D', '3D', '4D']
const FLIGHT_SIZE = 32

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

function slug(s) { return (s || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_') }

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${url} ${res.status}`)
  return res.json()
}

function flightSpec(id) {
  return { matchType: id.endsWith('D') ? 'Doubles' : 'Singles', flight: parseInt(id[0], 10) }
}

function buildPlayerSchoolMap(seedList) {
  const map = new Map()
  for (const seed of seedList) {
    for (const p of (seed.players || [])) {
      const pl = p.player
      if (pl?.id != null) {
        map.set(pl.id, {
          schoolName: pl.school?.name,
          firstName: pl.firstName,
          lastName: pl.lastName,
        })
      }
    }
  }
  return map
}

function buildFlight(flightId, bracket, seedList) {
  const isDoubles = flightId.endsWith('D')
  const playerMap = buildPlayerSchoolMap(seedList)
  const items = bracket?.configuration?.bracketItems || []

  const entries = Array.from({ length: FLIGHT_SIZE }, (_, i) => ({
    pos: i, teamId: null, seed: null, name: '', partner: '',
  }))
  const winners = {}
  const scores = {}
  const ROUND_ID = { 1: 'R1', 2: 'R2', 3: 'R3', 4: 'SF', 5: 'F' }

  for (const item of items) {
    const roundId = ROUND_ID[item.round]
    if (!roundId) continue
    const idx = item.position - 1
    const matchKey = `${roundId}m${idx}`

    const winSide = item.teams?.findIndex(t => t.isWinner)
    if (winSide === 0) winners[matchKey] = 'top'
    else if (winSide === 1) winners[matchKey] = 'bot'
    if (item.score) scores[matchKey] = item.score

    if (roundId === 'R1') {
      for (let s = 0; s < 2; s++) {
        const team = item.teams?.[s]
        if (!team || team.isEmpty || !team.items?.length) continue
        const pos = 2 * idx + s
        const players = team.items.map(it => playerMap.get(it.id)).filter(Boolean)
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

async function fetchFlight(flightId, conf) {
  const spec = flightSpec(flightId)
  const body = { isConsolation: false, matchType: spec.matchType, flight: spec.flight, host: conf.hostId }
  const [bracket, seedList] = await Promise.all([
    postJson(`https://api.tennisreporting.com/event/${EVENT_ID}/host/${conf.hostId}/bracket/get`, body),
    postJson(`https://api.tennisreporting.com/event/${EVENT_ID}/seed_list_by_params`, { ...body, division: conf.divisionId }),
  ])
  return buildFlight(flightId, bracket, seedList)
}

async function scrapeDivision(conf) {
  const flights = await Promise.all(FLIGHTS.map(f => fetchFlight(f, conf)))
  return flights
}

// Per user: TR is the authoritative source. If admin tap and TR disagree, TR
// wins. If TR has no winner yet but admin tapped one (admin is ahead of TR),
// keep the admin tap. Same rule for scores.
function hardMerge(scrapedFlights, localState) {
  const localById = Object.fromEntries((localState?.flights || []).map(f => [f.id, f]))
  const nowIso = new Date().toISOString()
  return {
    flights: scrapedFlights.map(scraped => {
      const local = localById[scraped.id] || { entries: [], winners: {}, scores: {}, decidedAt: {} }
      const mergedWinners = { ...(local.winners || {}) }
      const mergedDecidedAt = { ...(local.decidedAt || {}) }
      for (const [mid, val] of Object.entries(scraped.winners || {})) {
        const isNew = mergedWinners[mid] !== val
        mergedWinners[mid] = val
        if (isNew) mergedDecidedAt[mid] = nowIso
      }
      const mergedScores = { ...(local.scores || {}) }
      for (const [mid, val] of Object.entries(scraped.scores || {})) {
        mergedScores[mid] = val
      }
      return {
        id: scraped.id,
        entries: scraped.entries,
        winners: mergedWinners,
        scores: mergedScores,
        decidedAt: mergedDecidedAt,
      }
    }),
    meta: { source: 'live' },
  }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

async function syncDivision(divCode) {
  const conf = DIVISIONS[divCode]
  const { data: row, error: readErr } = await supabase
    .from('tennis_state')
    .select('data')
    .eq('id', conf.rowId)
    .maybeSingle()
  if (readErr) throw new Error(`read row ${conf.rowId}: ${readErr.message}`)
  const localState = row?.data || { flights: [] }

  const scraped = await scrapeDivision(conf)
  const merged = hardMerge(scraped, localState)

  // Skip the upsert (and skip firing a realtime event for nothing) when the
  // merged state is byte-identical to what's already in Supabase.
  if (deepEqual(merged, localState)) {
    return { division: divCode, changed: false }
  }

  // Compute a tiny summary of what shifted for the cron log.
  const addedWinners = []
  for (let i = 0; i < merged.flights.length; i++) {
    const m = merged.flights[i]
    const l = localState.flights?.find(x => x.id === m.id) || { winners: {} }
    for (const k of Object.keys(m.winners)) {
      if (l.winners?.[k] == null && m.winners[k] != null) addedWinners.push(`${m.id} ${k}`)
    }
  }

  const { error: writeErr } = await supabase
    .from('tennis_state')
    .upsert({ id: conf.rowId, data: merged, updated_at: new Date().toISOString() })
  if (writeErr) throw new Error(`write row ${conf.rowId}: ${writeErr.message}`)

  return { division: divCode, changed: true, addedWinners }
}

export default async function handler(req, res) {
  // Vercel cron sets Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.authorization || ''
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const started = Date.now()
  const results = []
  for (const div of Object.keys(DIVISIONS)) {
    try {
      results.push(await syncDivision(div))
    } catch (e) {
      results.push({ division: div, error: e.message })
    }
  }
  const took = Date.now() - started
  console.log('cron sync done in', took, 'ms', JSON.stringify(results))
  res.status(200).json({ ok: true, tookMs: took, results })
}
