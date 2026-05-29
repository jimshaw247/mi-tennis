// 32-slot single-elimination bracket used for MHSAA D1 State Finals.
// Each of the 8 flights has 32 bracket positions (0..31), with byes filling
// unused slots. The bracket has 5 rounds:
//
//   R1 (16 matches): pairs of adjacent positions (0,1), (2,3), ..., (30,31)
//   R2  (8 matches): pairs of R1 winners
//   R3  (4 matches): pairs of R2 winners (quarterfinals)
//   SF  (2 matches): pairs of R3 winners (semifinals)
//   F   (1 match):   SF winners (championship)
//
// An R1 match where one side is empty (entry.teamId == null) is a BYE — the
// other side auto-advances and the round is not "an actual match" for scoring.
//
// Scoring: 1 point per match win. A bye is worth 1 point IF AND ONLY IF the
// entry wins its first actual match. (Two consecutive byes both pay out on
// the next win, by the same rule.) Each entry caps at 5 points (5 rounds).

export const FLIGHT_SIZE = 32

export const ROUND_DEFS = [
  { id: 'R1', label: 'Round 1',      count: 16 },
  { id: 'R2', label: 'Round 2',      count: 8 },
  { id: 'R3', label: 'Round 3',      count: 4 },
  { id: 'SF', label: 'Semifinals',   count: 2 },
  { id: 'F',  label: 'Championship', count: 1 },
]

// All match definitions, in round order. Sources are either a position number
// (0..31) for R1, or a match id string ('R1m0'..) for later rounds.
export const MATCH_DEFS = (() => {
  const defs = []
  // R1
  for (let i = 0; i < 16; i++) {
    defs.push({ id: `R1m${i}`, round: 'R1', top: 2 * i, bot: 2 * i + 1 })
  }
  // R2..F: each match consumes two consecutive prior-round match winners.
  const later = [
    { round: 'R2', count: 8,  prev: 'R1' },
    { round: 'R3', count: 4,  prev: 'R2' },
    { round: 'SF', count: 2,  prev: 'R3' },
    { round: 'F',  count: 1,  prev: 'SF' },
  ]
  for (const { round, count, prev } of later) {
    for (let i = 0; i < count; i++) {
      defs.push({ id: `${round}m${i}`, round, top: `${prev}m${2 * i}`, bot: `${prev}m${2 * i + 1}` })
    }
  }
  return defs
})()

const DEFS_BY_ID = Object.fromEntries(MATCH_DEFS.map(m => [m.id, m]))

export function emptyFlight(id) {
  return {
    id,
    entries: Array.from({ length: FLIGHT_SIZE }, (_, i) => ({
      pos: i, teamId: null, seed: null, name: '', partner: '',
    })),
    winners: {},   // matchId -> 'top' | 'bot'
    scores: {},    // matchId -> ["6 - 1", "6 - 2"] (raw set strings)
    decidedAt: {}, // matchId -> ISO timestamp (when the pick was recorded)
    notes: {},     // matchId -> "Match #50 fifth available court" (raw TR note)
  }
}

// Parse a TR-style note like "Match #50 fifth available court" → useful
// pieces for display: { matchNum, court } where court is the integer ordinal
// or null if not assigned. Leaves the raw string available for tooltips.
const ORDINAL_WORDS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16,
}
export function parseMatchNote(note) {
  if (!note) return null
  const matchNum = note.match(/Match\s*#?(\d+)/i)?.[1] || null
  const ordinalWord = note.toLowerCase().match(/(\w+)\s+available\s+court/)?.[1]
  const courtNum = ordinalWord ? ORDINAL_WORDS[ordinalWord] || null : null
  return { matchNum: matchNum ? Number(matchNum) : null, court: courtNum, raw: note }
}

// Resolve which entry "is on" this side of a match. Returns:
//   { pos, empty: false } — a real entry occupies this side
//   { pos, empty: true  } — this side is a bye (no team — pos is identifiable
//                            so we can still display "BYE" anchored to a slot)
//   null                   — undecided (upstream match needs a pick)
function resolveSource(flight, src) {
  if (typeof src === 'number') {
    const e = flight.entries[src]
    return { pos: src, empty: !e?.teamId }
  }
  const def = DEFS_BY_ID[src]
  if (!def) return null
  const top = resolveSource(flight, def.top)
  const bot = resolveSource(flight, def.bot)
  const userWinner = flight.winners[src]
  if (userWinner === 'top') return top
  if (userWinner === 'bot') return bot
  // No explicit pick — try to auto-resolve.
  const topReal = top && !top.empty
  const botReal = bot && !bot.empty
  if (topReal && !botReal && bot) return top    // bot side empty (or empty chain) → top auto-wins
  if (botReal && !topReal && top) return bot    // mirror
  if (top && bot && !topReal && !botReal) {
    // Both subtrees are byes → propagate an empty placeholder (pick top arbitrarily).
    return { pos: top.pos, empty: true }
  }
  return null // both real, undecided — caller treats as pending
}

// Auto-winner for visualization: same rule as resolveSource's auto branch.
// Returns 'top' | 'bot' | null.
function autoWinnerOf(top, bot) {
  const topReal = top && !top.empty
  const botReal = bot && !bot.empty
  if (topReal && !botReal && bot) return 'top'
  if (botReal && !topReal && top) return 'bot'
  return null
}

function describeOne(flight, def) {
  const top = resolveSource(flight, def.top)
  const bot = resolveSource(flight, def.bot)
  const userWinner = flight.winners[def.id]
  const auto = autoWinnerOf(top, bot)
  const winner = userWinner || auto
  const winnerPos = winner ? (winner === 'top' ? top?.pos : bot?.pos) : null

  // "Empty" only when this side has resolved to a bye (no team). "Pending"
  // (top/bot is null) is a third state — neither real nor empty.
  const topEmpty = !!top && top.empty
  const botEmpty = !!bot && bot.empty
  const topPending = !top
  const botPending = !bot

  return {
    ...def,
    topPos: top?.pos ?? null,
    botPos: bot?.pos ?? null,
    topEntry: top && !top.empty ? flight.entries[top.pos] : null,
    botEntry: bot && !bot.empty ? flight.entries[bot.pos] : null,
    topEmpty,
    botEmpty,
    topPending,
    botPending,
    ready: !topPending && !botPending && !(topEmpty && botEmpty),
    winner,
    winnerPos,
    isBye: !!auto && !userWinner,
    bothEmpty: topEmpty && botEmpty,
  }
}

export function describeMatches(flight) {
  return MATCH_DEFS.map(d => describeOne(flight, d))
}

// All later matches that depend (transitively) on the given match.
function downstream(matchId) {
  const out = []
  const queue = [matchId]
  while (queue.length) {
    const cur = queue.shift()
    for (const m of MATCH_DEFS) {
      if (m.top === cur || m.bot === cur) {
        if (!out.includes(m.id)) { out.push(m.id); queue.push(m.id) }
      }
    }
  }
  return out
}

// Set or clear a user-picked winner. Clears downstream picks since the path
// may have changed. `at` is an optional ISO timestamp — caller usually passes
// `new Date().toISOString()` for live clicks, or TR's match completion time
// for scraped picks.
export function setWinner(flight, matchId, sideOrNull, at = null) {
  const next = {
    ...flight,
    winners: { ...flight.winners },
    decidedAt: { ...(flight.decidedAt || {}) },
  }
  if (sideOrNull == null) {
    delete next.winners[matchId]
    delete next.decidedAt[matchId]
  } else {
    next.winners[matchId] = sideOrNull
    next.decidedAt[matchId] = at || new Date().toISOString()
  }
  for (const d of downstream(matchId)) {
    delete next.winners[d]
    delete next.decidedAt[d]
  }
  return next
}

// Per-entry standing: how many points it has and how many more it could earn.
// Implements the bye-point rule: pending byes pay out on the next actual win.
export function entryStanding(flight, pos) {
  const e = flight.entries[pos]
  if (!e?.teamId) return { wins: 0, maxRemaining: 0, alive: false, eliminated: true, startingMax: 0 }

  const matchesInOrder = MATCH_DEFS.map(d => describeOne(flight, d))
  let wins = 0
  let pendingByes = 0
  let alive = true
  const currentPos = pos

  for (const roundDef of ROUND_DEFS) {
    const m = matchesInOrder.find(mm => mm.round === roundDef.id && (mm.topPos === currentPos || mm.botPos === currentPos))
    if (!m) break
    const ourSide = m.topPos === currentPos ? 'top' : 'bot'
    const otherEmpty = ourSide === 'top' ? m.botEmpty : m.topEmpty
    if (otherEmpty) { pendingByes++; continue }
    if (!m.winner) break
    if (m.winner === ourSide) {
      wins += 1 + pendingByes
      pendingByes = 0
    } else {
      alive = false
      break
    }
  }

  const cap = ROUND_DEFS.length
  return {
    wins,
    maxRemaining: alive ? (cap - wins) : 0,
    alive,
    eliminated: !alive,
    startingMax: cap,
    pendingByes,
  }
}

// Per-team aggregation across all 8 flights.
export function aggregate(flights) {
  const points = {}
  const remaining = {}
  const alive = {}
  for (const f of flights) {
    for (let pos = 0; pos < FLIGHT_SIZE; pos++) {
      const e = f.entries[pos]
      if (!e?.teamId) continue
      const s = entryStanding(f, pos)
      points[e.teamId] = (points[e.teamId] || 0) + s.wins
      remaining[e.teamId] = (remaining[e.teamId] || 0) + s.maxRemaining
      if (s.alive && s.maxRemaining > 0) alive[e.teamId] = (alive[e.teamId] || 0) + 1
    }
  }
  return { points, remaining, alive }
}

// Per-team points within a single flight (used by FlightSummary).
export function flightTeamPoints(flight) {
  const out = {}
  for (let pos = 0; pos < FLIGHT_SIZE; pos++) {
    const e = flight.entries[pos]
    if (!e?.teamId) continue
    const s = entryStanding(flight, pos)
    if (s.wins > 0) out[e.teamId] = (out[e.teamId] || 0) + s.wins
  }
  return out
}
