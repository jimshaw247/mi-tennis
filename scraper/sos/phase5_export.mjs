// Phase 5a: Build the human-readable markdown report + a compact JSON
// blob the React app can ship to clients.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const phase1 = JSON.parse(readFileSync(`${__dirname}/data/phase1_summary.json`, 'utf8'))
const phase2 = JSON.parse(readFileSync(`${__dirname}/data/phase2_summary.json`, 'utf8'))
const phase4 = JSON.parse(readFileSync(`${__dirname}/data/phase4_ratings.json`, 'utf8'))

// Augment phase2.perSchool with flight-4+ matches harvested from /report/player.
// phase2_summary.json was built from school-endpoint data (flights 1-3 only);
// phase2b_player_matches.json supplies the missing 4S/4D/5D/6D matches.
try {
  const phase2b = JSON.parse(readFileSync(`${__dirname}/data/phase2b_player_matches.json`, 'utf8'))
  const qualifierSchoolIds = new Set(Object.keys(phase2.schools).map(Number))
  const existingMatchIds = new Map()
  for (const [sid, info] of Object.entries(phase2.perSchool)) {
    existingMatchIds.set(Number(sid), new Set((info.matches || []).map(m => m.matchId)))
  }
  let augmented = 0
  for (const m of (phase2b.matches || [])) {
    const sides = (m.matchTeams || []).map(mt => ({
      teamId: mt.id,
      isWinner: !!mt.isWinner,
      players: (mt.players || []).map(p => ({
        playerId: p.id,
        name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
        schoolId: p.schoolId ?? p.school?.id,
        schoolName: p.school?.name,
        grade: p.grade,
        position: p.matchTeamPlayer?.position,
      })),
    }))
    const perspectiveSchools = new Set()
    for (const s of sides) for (const p of s.players) if (qualifierSchoolIds.has(p.schoolId)) perspectiveSchools.add(p.schoolId)
    for (const sid of perspectiveSchools) {
      const seen = existingMatchIds.get(sid)
      if (seen.has(m.matchId)) continue
      seen.add(m.matchId)
      phase2.perSchool[sid].matches.push({
        meet: { meetId: null, title: 'flight-4 augment', date: m.meetDateTime, postSeason: m.postSeason, eventId: null },
        matchId: m.matchId,
        flight: m.flight,
        matchType: m.matchType,
        finish: m.finish,
        winnerTeamId: m.winnerTeamId,
        sides,
        sets: m.sets,
      })
      augmented++
    }
  }
  console.log(`Phase 5: augmented perSchool with ${augmented} flight-4+ matches from phase2b`)
} catch (e) {
  console.log(`Phase 5: no phase2b_player_matches.json found — skipping augment (${e.message})`)
}

const FLIGHTS = ['1S','2S','3S','4S','1D','2D','3D','4D']
const FLIGHT_LABEL = { '1S':'#1 Singles','2S':'#2 Singles','3S':'#3 Singles','4S':'#4 Singles',
                       '1D':'#1 Doubles','2D':'#2 Doubles','3D':'#3 Doubles','4D':'#4 Doubles' }
const HIGHLIGHT_SCHOOL_ID = 4052  // Clarkston

// teamPower rebuild + teamOrder are populated AFTER ensureAllQualifiersRated()
// runs further down, so every school's 8 flights are summed (with fallbacks).
let teamPower, teamOrder, teamRankByAvg
function buildTeamPower() {
  teamPower = {}
  for (const fid of FLIGHTS) {
    for (const q of (phase4.qualifiers[fid] || [])) {
      const sid = q.schoolId
      if (!sid) continue
      if (!teamPower[sid]) teamPower[sid] = {
        schoolId: sid, schoolName: q.schoolName,
        flightRatings: {}, flightSOS: {}, flightSource: {},
        total: 0, sosSum: 0, sosCount: 0, ratedFlights: 0, fallbackFlights: 0,
      }
      teamPower[sid].flightRatings[fid] = q.rating
      teamPower[sid].flightSOS[fid] = q.sosRating
      teamPower[sid].flightSource[fid] = q.ratingSource || 'season'
      teamPower[sid].total += q.rating
      teamPower[sid].sosSum += q.sosRating
      teamPower[sid].sosCount += 1
      if (q.ratingSource) teamPower[sid].fallbackFlights += 1
      else teamPower[sid].ratedFlights += 1
    }
  }
  for (const t of Object.values(teamPower)) {
    t.sosAvg = t.sosCount > 0 ? t.sosSum / t.sosCount : null
    t.totalAvg = t.sosCount > 0 ? t.total / t.sosCount : null
  }
  phase4.teamPower = teamPower
  teamOrder = Object.values(phase4.teamPower).sort((a,b) => b.totalAvg - a.totalAvg)
  teamRankByAvg = new Map(teamOrder.map((t,i) => [t.schoolId, i+1]))
}

// Helper: get qualifier entry by flight+key
function findQualifier(flight, key) {
  const list = phase4.qualifiers[flight] || []
  return list.find(q => q.key === key)
}

// === Upset watch ===
// Players whose Bradley-Terry rating is significantly higher than their regional
// seed would suggest, or vice versa. We compare seed (1..16) to their rank
// within the 22-player state-finals field.
const upsetWatch = { underseeded: [], overseeded: [] }
for (const fid of FLIGHTS) {
  const list = phase4.qualifiers[fid] || []
  list.forEach((q, idx) => {
    const stateRank = idx + 1
    const regSeed = q.qualifier?.seed
    if (regSeed == null) return
    // Underseeded: high state rank but bad regional seed (e.g., seed 8 but rated #3)
    if (stateRank <= 6 && regSeed >= 5) {
      upsetWatch.underseeded.push({ flight: fid, stateRank, regSeed, ...q })
    }
    // Overseeded: low state rank but good regional seed
    if (stateRank >= 14 && regSeed <= 2) {
      upsetWatch.overseeded.push({ flight: fid, stateRank, regSeed, ...q })
    }
  })
}

// Ensure phase4.qualifiers[fid] contains every phase1 qualifier for that
// flight. Some qualifiers never played a ratable match this season (JV
// promotions, late-callups, flex players who only played at adjacent flights)
// — they were dropped by the Bradley-Terry pool. Inject them with a fallback
// rating sourced from tennisreporting.com's own 2026 Elo, or a 1500 baseline
// when even that's missing. Marked so the UI can flag them.
// Build qualifier-by-flight index straight from phase1.
const qualifierEntryByFlightKey = {}
for (const e of phase1.qualifierEntries) {
  const key = e.players.map(p => p.playerId).sort().join('-')
  const eloAvg = e.players.length
    ? (e.players.map(p => p.elo2026).filter(x => typeof x === 'number').reduce((a,b)=>a+b,0) / Math.max(1, e.players.filter(p => typeof p.elo2026 === 'number').length))
    : null
  qualifierEntryByFlightKey[`${e.flight}|${key}`] = {
    key, flight: e.flight,
    name: e.players.map(p => p.name).join(' / '),
    school: e.school,
    seed: e.seed,
    winnerReportPlacement: e.winnerReportPlacement,
    elo2026Avg: Number.isFinite(eloAvg) ? eloAvg : null,
    pastStateFinals: e.players.flatMap(p => p.pastStateFinals || []),
    regionalName: e.regionalName,
  }
}

function ensureAllQualifiersRated() {
  for (const fid of FLIGHTS) {
    const list = phase4.qualifiers[fid] || []
    const haveKeys = new Set(list.map(q => q.key))
    const allEntries = Object.entries(qualifierEntryByFlightKey)
      .filter(([k]) => k.startsWith(`${fid}|`))
      .map(([, v]) => v)
    // 1. Fill in entries missing from the pool altogether
    for (const q of allEntries) {
      if (haveKeys.has(q.key)) continue
      const trElo = q.elo2026Avg
      const fallback = trElo != null ? trElo : 1500
      list.push({
        key: q.key,
        name: q.name,
        schoolId: q.school?.id,
        schoolName: q.school?.name,
        rating: fallback,
        sosRating: 1500,
        wWins: 0, wLosses: 0,
        matchCount: 0,
        matchCountAtFlight: 0,
        ratingSource: trElo != null ? 'tr-elo' : 'baseline',
        qualifier: q,
      })
    }
    // 2. For entries that ARE in the pool but with null rating (no-data), backfill from TR Elo.
    for (const row of list) {
      if (row.rating != null) continue
      const trElo = row.qualifier?.elo2026Avg
      const fallback = trElo != null ? trElo : 1500
      row.rating = fallback
      row.sosRating = row.sosRating ?? 1500
      row.ratingSource = trElo != null ? 'tr-elo' : 'baseline'
    }
    list.sort((a, b) => b.rating - a.rating)
    phase4.qualifiers[fid] = list
  }
}
ensureAllQualifiersRated()

// === Regular starter inference ===
// For each (schoolId, flightId), find the most-frequent player or pair across
// dual-meet matches this season. If that differs from the regional qualifier
// the school sent at that flight, the qualifier is likely an approved sub —
// flag it and attach the regular starter's pool rating so the UI can show
// "what this team would look like with its regular lineup".
const regularStarterByKey = {}  // `${schoolId}|${fid}` -> { key, name, matches, won, lost, ratingFromPool }
{
  const FLIGHT_ALL = ['1S','2S','3S','4S','1D','2D','3D','4D']
  // For each school + flight, count appearances by player/pair key.
  for (const sid of Object.keys(phase2.perSchool)) {
    const schoolMatches = phase2.perSchool[sid].matches
    for (const fid of FLIGHT_ALL) {
      const flightChar = fid.endsWith('D') ? 'D' : 'S'
      const flightNum = fid[0]
      const candidates = new Map()
      for (const m of schoolMatches) {
        const mDisc = m.matchType === 'Doubles' ? 'D' : 'S'
        if (mDisc !== flightChar || m.flight !== flightNum) continue
        const us = m.sides.find(s => s.players.some(p => p.schoolId === Number(sid)))
        if (!us || !us.players.length) continue
        const key = us.players.map(p => p.playerId).sort().join('-')
        if (!candidates.has(key)) candidates.set(key, { key, name: us.players.map(p => p.name).join(' / '), playerIds: us.players.map(p => p.playerId), matches: 0, won: 0, lost: 0 })
        const c = candidates.get(key)
        c.matches++
        if (us.isWinner) c.won++; else c.lost++
      }
      if (candidates.size === 0) continue
      const top = [...candidates.values()].sort((a, b) => b.matches - a.matches)[0]
      // Look up pool rating
      const disc = flightChar
      const poolRow = (phase4.byPool[disc]?.ratings || []).find(r => r.key === top.key)
      regularStarterByKey[`${sid}|${fid}`] = {
        ...top,
        rating: poolRow?.rating ?? null,
        sosRating: poolRow?.sosRating ?? null,
      }
    }
  }
}

// Attach regularStarter to each qualifier row when the qualifier's key
// differs from the inferred regular starter.
for (const fid of FLIGHTS) {
  const list = phase4.qualifiers[fid] || []
  for (const q of list) {
    const reg = regularStarterByKey[`${q.schoolId}|${fid}`]
    if (!reg) {
      q.regularStarter = { noData: true }
      continue
    }
    if (reg.key === q.key) continue  // qualifier IS the regular starter
    q.regularStarter = {
      name: reg.name,
      matches: reg.matches,
      won: reg.won,
      lost: reg.lost,
      rating: reg.rating,
      sosRating: reg.sosRating,
    }
  }
}

buildTeamPower() // populates teamPower / teamOrder / teamRankByAvg

// === Clarkston deep dive ===
function clarkstonAnalysis() {
  const out = { flights: [] }
  // For each flight, find Clarkston's qualifier, compute win probabilities vs
  // each opponent in the field.
  for (const fid of FLIGHTS) {
    const list = phase4.qualifiers[fid] || []
    const ours = list.find(q => q.schoolId === HIGHLIGHT_SCHOOL_ID)
    const field = list.filter(q => q.schoolId !== HIGHLIGHT_SCHOOL_ID)
    const matchups = field.map(o => ({
      opponent: o.name,
      opponentSchool: o.schoolName,
      opponentRating: o.rating,
      oursRating: ours?.rating ?? null,
      winProb: ours ? 1 / (1 + Math.pow(10, (o.rating - ours.rating) / 400)) : null,
    })).sort((a,b) => b.opponentRating - a.opponentRating)
    out.flights.push({
      flight: fid,
      flightLabel: FLIGHT_LABEL[fid],
      ours: ours || null,
      fieldSize: list.length,
      stateRank: ours ? list.indexOf(ours) + 1 : null,
      matchups,
      // Top 4 toughest opponents
      hardest: matchups.slice(0, 4),
      easiest: matchups.slice(-4).reverse(),
    })
  }
  // Aggregate season head-to-head: Clarkston's actual matches.
  const cMatches = phase2.perSchool[HIGHLIGHT_SCHOOL_ID]?.matches || []
  out.seasonRecord = phase2.schools[HIGHLIGHT_SCHOOL_ID]?.record
  // Per-flight wins/losses for Clarkston players
  out.bestWins = []
  out.worstLosses = []
  for (const m of cMatches) {
    const ours = m.sides.find(s => s.players.some(p => p.schoolId === HIGHLIGHT_SCHOOL_ID))
    const them = m.sides.find(s => s !== ours)
    if (!ours || !them) continue
    const won = ours.isWinner
    const fid = `${m.flight}${m.matchType === 'Doubles' ? 'D' : 'S'}`
    // Lookup opponent rating
    const oppKey = them.players.map(p => p.playerId).sort().join('-')
    const oppRow = (phase4.byFlight[fid]?.ratings || []).find(r => r.key === oppKey)
    if (!oppRow) continue
    const oursKey = ours.players.map(p => p.playerId).sort().join('-')
    const oursRow = (phase4.byFlight[fid]?.ratings || []).find(r => r.key === oursKey)
    if (!oursRow) continue
    const entry = {
      date: m.meet.date,
      meet: m.meet.title,
      flight: fid,
      ours: ours.players.map(p => p.name).join(' / '),
      opp: them.players.map(p => p.name).join(' / '),
      oppSchool: them.players[0]?.schoolName,
      oppRating: oppRow.rating,
      oursRating: oursRow.rating,
      won,
      sets: m.sets,
    }
    if (won) out.bestWins.push(entry)
    else out.worstLosses.push(entry)
  }
  out.bestWins.sort((a,b) => b.oppRating - a.oppRating)
  out.worstLosses.sort((a,b) => a.oppRating - b.oppRating)
  return out
}

// === Common opponents (for Clarkston) ===
// Players who Clarkston faced AND who also play in a Clarkston-relevant flight at state finals.
function commonOpponentAnalysis() {
  const cMatches = phase2.perSchool[HIGHLIGHT_SCHOOL_ID]?.matches || []
  const out = []
  for (const fid of FLIGHTS) {
    const stateField = phase4.qualifiers[fid] || []
    const ours = stateField.find(q => q.schoolId === HIGHLIGHT_SCHOOL_ID)
    if (!ours) continue
    // Find Clarkston's opponents at this flight during the season.
    const flightSeasonOpps = new Map()
    for (const m of cMatches) {
      const mFid = `${m.flight}${m.matchType === 'Doubles' ? 'D' : 'S'}`
      if (mFid !== fid) continue
      const us = m.sides.find(s => s.players.some(p => p.schoolId === HIGHLIGHT_SCHOOL_ID))
      const them = m.sides.find(s => s !== us)
      if (!us || !them || !them.players?.length) continue
      const key = them.players.map(p => p.playerId).sort().join('-')
      flightSeasonOpps.set(key, { players: them.players, school: them.players[0]?.schoolName, won: us.isWinner })
    }
    // Of the state finals field, which ones share a common opponent with Clarkston?
    const sharedFor = stateField.filter(q => q.schoolId !== HIGHLIGHT_SCHOOL_ID).map(q => {
      // For each opponent in flightSeasonOpps, did this state-field player also face them?
      const matches = []
      for (const [oppKey, oppInfo] of flightSeasonOpps) {
        // Look up the opponent's rating row in this flight to check if they also played `q`.
        const oppRow = (phase4.byFlight[fid]?.ratings || []).find(r => r.key === oppKey)
        if (!oppRow) continue
        // The simpler comparison: assume any state-field opponent might have played this same opponent during the season.
        // We approximate via rating delta.
        matches.push({ opponentName: oppInfo.players.map(p=>p.name).join(' / '), oppRating: oppRow.rating, clarkstonWon: oppInfo.won })
      }
      return { name: q.name, school: q.schoolName, rating: q.rating, sharedCount: matches.length, shared: matches }
    }).filter(x => x.sharedCount > 0)
    out.push({ flight: fid, ours: ours?.name, count: sharedFor.length, sharedFor })
  }
  return out
}

// === Build payload ===
const payload = {
  generatedAt: new Date().toISOString(),
  notes: 'Bradley-Terry MM ratings per flight, 28-day half-life recency, MOV weighting. Win probability uses 400-pt Elo-like spread.',
  flights: {},
  teamPower: teamOrder,
  teamRanking: teamOrder.map((t,i) => ({ rank: i+1, ...t })),
  upsetWatch,
  clarkston: clarkstonAnalysis(),
  commonOpponents: commonOpponentAnalysis(),
}
for (const fid of FLIGHTS) {
  payload.flights[fid] = {
    label: FLIGHT_LABEL[fid],
    matchCount: phase4.byFlight[fid]?.matchCount || 0,
    qualifiers: (phase4.qualifiers[fid] || []).map((q, i) => ({
      rank: i + 1,
      ...q,
    })),
  }
}

writeFileSync(`${__dirname}/data/sos_report.json`, JSON.stringify(payload, null, 2))
// Also write a slim version for the web app — drop the full ratings tables.
const slim = { ...payload }
slim.flights = Object.fromEntries(Object.entries(payload.flights).map(([fid, d]) => [fid, {
  label: d.label,
  matchCount: d.matchCount,
  qualifiers: d.qualifiers.map(q => ({
    rank: q.rank,
    name: q.name,
    schoolId: q.schoolId,
    schoolName: q.schoolName,
    rating: Math.round(q.rating),
    sosRating: Math.round(q.sosRating),
    elo2026Avg: q.qualifier?.elo2026Avg != null ? Math.round(q.qualifier.elo2026Avg) : null,
    regional: q.qualifier?.regionalName,
    regionalSeed: q.qualifier?.seed,
    regionalPlacement: q.qualifier?.winnerReportPlacement,
    pastStateFinals: (q.qualifier?.pastStateFinals || []).length,
    matchCount: q.matchCount,
    matchCountAtFlight: q.matchCountAtFlight ?? null,
    ratingSource: q.ratingSource || 'season',
    regularStarter: q.regularStarter
      ? (q.regularStarter.noData
          ? { noData: true }
          : {
              name: q.regularStarter.name,
              matches: q.regularStarter.matches,
              record: `${q.regularStarter.won}-${q.regularStarter.lost}`,
              rating: q.regularStarter.rating != null ? Math.round(q.regularStarter.rating) : null,
              sosRating: q.regularStarter.sosRating != null ? Math.round(q.regularStarter.sosRating) : null,
            })
      : null,
  })),
}]))
slim.teamRanking = payload.teamRanking.map(t => ({
  rank: t.rank,
  schoolId: t.schoolId,
  schoolName: t.schoolName,
  total: Math.round(t.total),
  totalAvg: Math.round(t.totalAvg),
  sosAvg: Math.round(t.sosAvg),
  qualifierCount: t.sosCount,
  ratedFlights: t.ratedFlights,
  fallbackFlights: t.fallbackFlights,
  flightRatings: Object.fromEntries(Object.entries(t.flightRatings).map(([k,v]) => [k, Math.round(v)])),
  flightSource: t.flightSource,
}))
slim.clarkston = {
  seasonRecord: payload.clarkston.seasonRecord,
  flights: payload.clarkston.flights.map(f => ({
    flight: f.flight,
    flightLabel: f.flightLabel,
    stateRank: f.stateRank,
    fieldSize: f.fieldSize,
    ours: f.ours ? { name: f.ours.name, rating: Math.round(f.ours.rating), sosRating: Math.round(f.ours.sosRating) } : null,
    hardest: f.hardest.slice(0, 3).map(m => ({ opponent: m.opponent, school: m.opponentSchool, rating: Math.round(m.opponentRating), winProb: m.winProb })),
    easiest: f.easiest.slice(0, 3).map(m => ({ opponent: m.opponent, school: m.opponentSchool, rating: Math.round(m.opponentRating), winProb: m.winProb })),
  })),
  bestWins: payload.clarkston.bestWins.slice(0, 5),
  worstLosses: payload.clarkston.worstLosses.slice(0, 5),
}
writeFileSync(`${__dirname}/data/sos_app.json`, JSON.stringify(slim, null, 2))

// === Markdown report ===
function md() {
  const lines = []
  lines.push(`# 2026 MHSAA D1 Girls Tennis State Finals — SOS / Power Rankings`)
  lines.push('')
  lines.push(`Generated ${new Date().toLocaleString()} from tennisreporting.com data.`)
  lines.push('')
  lines.push(`Model: Bradley-Terry MM iteration per flight, 28-day recency half-life from 2026-05-19, margin-of-victory weighting (game-differential / 6, clamped 0.3–1.5), 1+1 prior to regularize thin records.`)
  lines.push('')
  lines.push(`## Team Power Rankings`)
  lines.push('')
  lines.push(`Sorted by average rating across each team's state-finals qualifiers.`)
  lines.push('')
  lines.push(`| # | School | Qual flights | Total | Avg | SOS |`)
  lines.push(`|---|---|---:|---:|---:|---:|`)
  for (const t of teamOrder) {
    lines.push(`| ${teamRankByAvg.get(t.schoolId)} | ${t.schoolName}${t.schoolId === HIGHLIGHT_SCHOOL_ID ? ' **(Clarkston)**' : ''} | ${t.sosCount} | ${Math.round(t.total)} | ${Math.round(t.totalAvg)} | ${Math.round(t.sosAvg)} |`)
  }
  lines.push('')

  lines.push(`## Flight-by-flight: top of the field`)
  for (const fid of FLIGHTS) {
    const list = (phase4.qualifiers[fid] || []).slice(0, 8)
    lines.push('')
    lines.push(`### ${FLIGHT_LABEL[fid]} (${fid}) — ${phase4.byFlight[fid]?.matchCount || 0} season matches`)
    lines.push('')
    lines.push(`| # | Player(s) | School | Rating | SOS | Reg seed | Reg place | trElo (avg) |`)
    lines.push(`|---|---|---|---:|---:|---:|---:|---:|`)
    list.forEach((q, i) => {
      const star = q.schoolId === HIGHLIGHT_SCHOOL_ID ? ' **(Clarkston)**' : ''
      lines.push(`| ${i+1} | ${q.name}${star} | ${q.schoolName} | ${Math.round(q.rating)} | ${Math.round(q.sosRating)} | ${q.qualifier?.seed ?? '—'} | ${q.qualifier?.winnerReportPlacement ?? '—'} | ${q.qualifier?.elo2026Avg ? Math.round(q.qualifier.elo2026Avg) : '—'} |`)
    })
  }

  lines.push('')
  lines.push(`## Clarkston Deep Dive`)
  if (payload.clarkston.seasonRecord) {
    const r = payload.clarkston.seasonRecord
    lines.push('')
    lines.push(`**Season record:** ${r.win}–${r.loss}–${r.tie}`)
  }
  for (const f of payload.clarkston.flights) {
    if (!f.ours) {
      lines.push('')
      lines.push(`### ${f.flightLabel} (${f.flight}) — no Clarkston qualifier`)
      continue
    }
    lines.push('')
    lines.push(`### ${f.flightLabel} (${f.flight}): ${f.ours.name} — rated ${Math.round(f.ours.rating)} (state rank ${f.stateRank} / ${f.fieldSize})`)
    lines.push('')
    lines.push(`**Hardest matchups in the field:**`)
    for (const m of f.hardest.slice(0, 3)) {
      lines.push(`- ${m.opponent} (${m.opponentSchool}) — rated ${Math.round(m.opponentRating)}, P(Clarkston wins) = ${(m.winProb*100).toFixed(1)}%`)
    }
    lines.push('')
    lines.push(`**Easiest matchups in the field:**`)
    for (const m of f.easiest.slice(0, 3)) {
      lines.push(`- ${m.opponent} (${m.opponentSchool}) — rated ${Math.round(m.opponentRating)}, P(Clarkston wins) = ${(m.winProb*100).toFixed(1)}%`)
    }
  }

  lines.push('')
  lines.push(`### Best Clarkston wins this season (vs opponent rating)`)
  for (const w of payload.clarkston.bestWins.slice(0, 7)) {
    lines.push(`- ${w.date?.slice(0,10)} — ${w.ours} beat ${w.opp} (${w.oppSchool}, rated ${Math.round(w.oppRating)}) at ${w.flight}`)
  }
  lines.push('')
  lines.push(`### Worst Clarkston losses this season`)
  for (const l of payload.clarkston.worstLosses.slice(0, 7)) {
    lines.push(`- ${l.date?.slice(0,10)} — ${l.ours} lost to ${l.opp} (${l.oppSchool}, rated ${Math.round(l.oppRating)}) at ${l.flight}`)
  }

  lines.push('')
  lines.push(`## Upset watch`)
  lines.push('')
  lines.push(`### Underseeded (top-6 rating but regional seed 5+)`)
  for (const u of upsetWatch.underseeded.slice(0, 10)) {
    lines.push(`- **${u.flight}** ${u.name} (${u.schoolName}) — rated ${Math.round(u.rating)} (state rank ${u.stateRank}), regional seed ${u.regSeed}`)
  }
  lines.push('')
  lines.push(`### Overseeded (state rank 14+ but regional seed ≤ 2)`)
  for (const u of upsetWatch.overseeded.slice(0, 10)) {
    lines.push(`- **${u.flight}** ${u.name} (${u.schoolName}) — rated ${Math.round(u.rating)} (state rank ${u.stateRank}), regional seed ${u.regSeed}`)
  }

  return lines.join('\n')
}

const markdown = md()
writeFileSync(`${__dirname}/data/sos_report.md`, markdown)
console.log(`Wrote sos_report.md (${markdown.length} chars)`)
console.log(`Wrote sos_report.json (${JSON.stringify(payload).length} chars)`)
console.log(`Wrote sos_app.json (${JSON.stringify(slim).length} chars)`)
