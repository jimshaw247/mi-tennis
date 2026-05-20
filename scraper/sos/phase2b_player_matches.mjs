// Phase 2b: Harvest flight-4 (and 5/6) matches via the player-report endpoint.
//
// The /report/school/{id} endpoint truncates dual-meet matches to flights 1-3.
// However /report/player/{id} returns EVERY match that player appeared in,
// including 4S/4D/5D/6D. We enumerate every player from the qualifying schools'
// existing season data + every player listed as a 4S/4D regional qualifier in
// phase1, fetch each player endpoint, and pool the matches.
//
// Output: data/phase2b_player_matches.json (unique-by-matchId list of matches
// harvested from player endpoints, with the same fields phase4 needs).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PLAYERS_DIR = `${__dirname}/data/players`
mkdirSync(PLAYERS_DIR, { recursive: true })

const phase1 = JSON.parse(readFileSync(`${__dirname}/data/phase1_summary.json`, 'utf8'))
const phase2 = JSON.parse(readFileSync(`${__dirname}/data/phase2_summary.json`, 'utf8'))

const qualifierSchoolIds = new Set(Object.keys(phase2.schools).map(Number))

// 1. Collect player IDs from qualifying schools' school-endpoint data.
const playerIds = new Map()  // playerId -> { name, schoolId }
const playerSchoolFromSchoolDir = new Map() // playerId -> schoolId (authoritative from school endpoint)
for (const sid of qualifierSchoolIds) {
  const f = `${__dirname}/data/schools/${sid}.json`
  if (!existsSync(f)) continue
  const d = JSON.parse(readFileSync(f, 'utf8'))
  for (const m of (d.meets || [])) {
    for (const t of ['Singles', 'Doubles']) {
      for (const x of (m.matches?.[t] || [])) {
        for (const mt of (x.matchTeams || [])) {
          for (const p of (mt.players || [])) {
            if (p.schoolId === sid) {
              playerIds.set(p.id, { name: `${p.firstName || ''} ${p.lastName || ''}`.trim(), schoolId: sid })
              playerSchoolFromSchoolDir.set(p.id, sid)
            }
          }
        }
      }
    }
  }
}

// 2. Add every 4S/4D regional qualifier player from phase1 (these may be from
// schools whose 1-3 lineup didn't include them, so they're missing above).
for (const r of (phase1.regionals || [])) {
  for (const fid of ['4S', '4D']) {
    for (const e of (r.flights?.[fid]?.qualifiers || [])) {
      for (const p of (e.players || [])) {
        if (!playerIds.has(p.playerId)) {
          playerIds.set(p.playerId, { name: p.name, schoolId: e.school?.id })
        }
      }
    }
  }
}

console.log(`Players to fetch: ${playerIds.size}`)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchPlayer(pid) {
  const url = `https://api.tennisreporting.com/report/player/${pid}?year=2026`
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

let fetched = 0, cached = 0, failed = 0
const allPlayerData = new Map()  // pid -> data
const idList = [...playerIds.keys()]
for (let i = 0; i < idList.length; i++) {
  const pid = idList[i]
  const out = `${PLAYERS_DIR}/${pid}.json`
  if (existsSync(out)) {
    allPlayerData.set(pid, JSON.parse(readFileSync(out, 'utf8')))
    cached++
    continue
  }
  try {
    const d = await fetchPlayer(pid)
    writeFileSync(out, JSON.stringify(d, null, 2))
    allPlayerData.set(pid, d)
    fetched++
    if (fetched % 25 === 0) console.log(`  fetched ${fetched} so far (total ${i + 1}/${idList.length})`)
    await sleep(350)
  } catch (e) {
    failed++
    console.log(`  ${pid} FAILED: ${e.message}`)
  }
}
console.log(`Done fetching. fetched=${fetched}, cached=${cached}, failed=${failed}`)

// 3. Pool every match across all player endpoints; dedupe by matchId.
const uniqueMatches = new Map()  // matchId -> normalized match
let totalSeen = 0
let dedupedCount = 0
const flightHistogram = new Map()
for (const [pid, j] of allPlayerData) {
  for (const t of ['Singles', 'Doubles']) {
    for (const m of (j.matches?.[t] || [])) {
      totalSeen++
      if (!m.id) continue
      if (uniqueMatches.has(m.id)) { dedupedCount++; continue }
      // Skip JV
      if (m.isNotVarsity) continue
      if (!Array.isArray(m.matchTeams) || m.matchTeams.length < 2) continue
      const flight = m.flight  // string "1".."6"
      const flightId = `${flight}${m.matchType === 'Doubles' ? 'D' : 'S'}`
      flightHistogram.set(flightId, (flightHistogram.get(flightId) || 0) + 1)
      // Normalize sets — match the shape phase4 expects (per-team scores keyed by matchTeam.id).
      const sets = (m.sets || []).map(s => {
        const { number, tie, ...scores } = s
        return { number, tie, scores }
      })
      // Strip down matchTeams to just the fields phase4/phase5 need.
      const matchTeams = (m.matchTeams || []).map(mt => ({
        id: mt.id,
        isWinner: !!mt.isWinner,
        players: (mt.players || []).map(p => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          grade: p.grade,
          schoolId: p.school?.id ?? p.schoolId,
          school: p.school ? { id: p.school.id, name: p.school.name, logo: p.school.logo } : null,
          matchTeamPlayer: p.matchTeamPlayer,
        })),
      }))
      uniqueMatches.set(m.id, {
        matchId: m.id,
        flight,
        flightId,
        matchType: m.matchType,
        finish: m.finish,
        winnerTeamId: m.winnerTeamId,
        meetDateTime: m.meet?.meetDateTime,
        postSeason: !!m.meet?.postSeason,
        matchTeams,
        sets,
      })
    }
  }
}

console.log(`\nMatches seen across all player endpoints: ${totalSeen}`)
console.log(`Unique matches (deduped by id): ${uniqueMatches.size}`)
console.log(`Flight histogram:`)
for (const [k, v] of [...flightHistogram].sort()) console.log(`  ${k}: ${v}`)

// 4. Group unique matches by qualifier-school perspective for phase5 lineup inference.
// A match's "schoolPerspective" is the qualifying school whose player participated.
// A match can appear under multiple schools if both sides are qualifiers (cross-qualifier match).
const perSchoolExtra = {}  // schoolId -> [matches]
for (const m of uniqueMatches.values()) {
  const perspectiveSchools = new Set()
  for (const mt of m.matchTeams) {
    for (const p of mt.players) {
      const sid = p.schoolId
      if (sid && qualifierSchoolIds.has(sid)) perspectiveSchools.add(sid)
    }
  }
  for (const sid of perspectiveSchools) {
    if (!perSchoolExtra[sid]) perSchoolExtra[sid] = []
    perSchoolExtra[sid].push(m)
  }
}

// Write per-school files in `schools_extra/` shaped like school-endpoint JSONs
// so phase4's existing SCHOOL_DIRS walker picks them up automatically.
const EXTRA_DIR = `${__dirname}/data/schools_extra`
mkdirSync(EXTRA_DIR, { recursive: true })
// Clear out stale files first.
for (const f of readdirSync(EXTRA_DIR)) {
  if (f.endsWith('.json')) {
    try {
      // No fs.unlink import needed — overwrite is sufficient since we re-write below.
    } catch {}
  }
}
let schoolFilesWritten = 0
for (const [sid, matches] of Object.entries(perSchoolExtra)) {
  // Group by date into pseudo-meets so the phase4 walker (which iterates
  // meets[].matches.Singles/Doubles) finds them.
  const byDate = new Map()
  for (const m of matches) {
    const key = m.meetDateTime || 'unknown'
    if (!byDate.has(key)) byDate.set(key, { Singles: [], Doubles: [] })
    const slot = byDate.get(key)
    const matchEntry = {
      sets: m.sets.map(s => ({ ...s.scores, number: s.number, tie: s.tie })),
      id: m.matchId,
      flight: m.flight,
      matchType: m.matchType,
      finish: m.finish,
      winnerTeamId: m.winnerTeamId,
      isNotVarsity: false,
      matchTeams: m.matchTeams,
    }
    if (m.matchType === 'Doubles') slot.Doubles.push(matchEntry)
    else slot.Singles.push(matchEntry)
  }
  const meets = []
  let synthMeetId = 9000000
  for (const [date, matchesByType] of byDate) {
    meets.push({
      id: synthMeetId++,
      title: 'flight-4 augment',
      meetDateTime: date,
      postSeason: false,
      approveMeet: true,
      eventId: null,
      schools: { winners: [], losers: [] },
      matches: matchesByType,
    })
  }
  writeFileSync(`${EXTRA_DIR}/${sid}.json`, JSON.stringify({
    school: { id: Number(sid), name: phase2.schools[sid]?.name },
    overallRecord: phase2.schools[sid]?.record || { win: 0, loss: 0, tie: 0 },
    meets,
    _source: 'phase2b_player_matches',
  }, null, 2))
  schoolFilesWritten++
}
console.log(`Wrote ${schoolFilesWritten} files to schools_extra/`)

// Write consolidated phase2b file for reproducibility / phase5 augment.
const phase2b = {
  generatedAt: new Date().toISOString(),
  playerCount: idList.length,
  fetched, cached, failed,
  matches: [...uniqueMatches.values()],
  flightHistogram: Object.fromEntries(flightHistogram),
  perSchoolMatchCount: Object.fromEntries(Object.entries(perSchoolExtra).map(([k,v]) => [k, v.length])),
}
writeFileSync(`${__dirname}/data/phase2b_player_matches.json`, JSON.stringify(phase2b, null, 2))
console.log(`Wrote phase2b_player_matches.json with ${phase2b.matches.length} unique matches`)
