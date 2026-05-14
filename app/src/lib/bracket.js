// 9-draw single-elimination bracket structure used for every MHSAA flight.
// Positions 0..8 map onto a fixed bracket:
//   Play-in  : pos 7 vs pos 8           -> winner = PI
//   QF1      : pos 0 vs PI              -> winner = QF1
//   QF2      : pos 3 vs pos 4           -> winner = QF2
//   QF3      : pos 2 vs pos 5           -> winner = QF3
//   QF4      : pos 1 vs pos 6           -> winner = QF4
//   SF1      : QF1 vs QF2               -> winner = SF1
//   SF2      : QF3 vs QF4               -> winner = SF2
//   F        : SF1 vs SF2               -> champion
//
// "Source" refs are either a position number (0..8) or a match id string.

export const MATCH_DEFS = [
  { id: 'PI',  round: 'P', label: 'Play-in', top: 7, bot: 8 },
  { id: 'QF1', round: 'Q', label: 'QF',      top: 0, bot: 'PI' },
  { id: 'QF2', round: 'Q', label: 'QF',      top: 3, bot: 4 },
  { id: 'QF3', round: 'Q', label: 'QF',      top: 2, bot: 5 },
  { id: 'QF4', round: 'Q', label: 'QF',      top: 1, bot: 6 },
  { id: 'SF1', round: 'S', label: 'SF',      top: 'QF1', bot: 'QF2' },
  { id: 'SF2', round: 'S', label: 'SF',      top: 'QF3', bot: 'QF4' },
  { id: 'F',   round: 'F', label: 'Final',   top: 'SF1', bot: 'SF2' },
]

export const ROUNDS = ['P', 'Q', 'S', 'F']
export const ROUND_LABEL = { P: 'Play-in', Q: 'Quarterfinal', S: 'Semifinal', F: 'Final' }

// Max remaining wins available to the entry at each starting position, by round currently to play.
// E.g. entry at pos 7 or 8 still in play-in can win 4 matches. Entry at pos 0 with bye to QF can win 3.
const STARTING_WINS = { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 4, 8: 4 }

export function emptyFlight(id) {
  return {
    id,
    entries: Array.from({ length: 9 }, (_, i) => ({ pos: i, teamId: null, seed: null, name: '' })),
    winners: {}, // matchId -> 'top' | 'bot'
  }
}

// Resolve the entry (by position 0..8) at one side of a match, given winners so far.
// Returns the position number, or null if not yet determined.
function resolveSource(src, winners) {
  if (typeof src === 'number') return src
  const w = winners[src]
  if (!w) return null
  const def = MATCH_DEFS.find(m => m.id === src)
  return resolveSource(w === 'top' ? def.top : def.bot, winners)
}

// All matches with their resolved entry positions and current winner pos (if any).
export function describeMatches(flight) {
  return MATCH_DEFS.map(def => {
    const topPos = resolveSource(def.top, flight.winners)
    const botPos = resolveSource(def.bot, flight.winners)
    const w = flight.winners[def.id]
    const winnerPos = w ? (w === 'top' ? topPos : botPos) : null
    return {
      ...def,
      topPos, botPos,
      topEntry: topPos != null ? flight.entries[topPos] : null,
      botEntry: botPos != null ? flight.entries[botPos] : null,
      winner: w,
      winnerPos,
      ready: topPos != null && botPos != null,
    }
  })
}

// Wins per team for a single flight (1 point per match won).
export function flightTeamPoints(flight) {
  const out = {}
  for (const m of describeMatches(flight)) {
    if (!m.winner) continue
    const e = m.winner === 'top' ? m.topEntry : m.botEntry
    if (!e || !e.teamId) continue
    out[e.teamId] = (out[e.teamId] || 0) + 1
  }
  return out
}

// Walk forward from a given match in match-tree order. Returns the list of
// later match IDs that this match feeds into (for clearing downstream winners).
function downstream(matchId) {
  const result = []
  const queue = [matchId]
  while (queue.length) {
    const cur = queue.shift()
    for (const m of MATCH_DEFS) {
      if (m.top === cur || m.bot === cur) {
        if (!result.includes(m.id)) {
          result.push(m.id)
          queue.push(m.id)
        }
      }
    }
  }
  return result
}

// Set or clear the winner of a match. If clearing or overriding, removes any
// downstream winners that depended on the now-undetermined entry.
export function setWinner(flight, matchId, sideOrNull) {
  const next = { ...flight, winners: { ...flight.winners } }
  if (sideOrNull == null) {
    delete next.winners[matchId]
  } else {
    next.winners[matchId] = sideOrNull
  }
  for (const d of downstream(matchId)) delete next.winners[d]
  return next
}

// For a given entry position, how many wins it has already and how many it could still earn
// assuming it wins out. Once an entry advances, downstream describeMatches() resolves the
// new top/bot to the original position number, so we walk forward by re-scanning for any
// match the original position participates in that we haven't already counted.
export function entryStanding(flight, pos) {
  const matches = describeMatches(flight)
  let wins = 0
  let alive = true
  const seen = new Set()
  while (alive) {
    const m = matches.find(mm => (mm.topPos === pos || mm.botPos === pos) && !seen.has(mm.id))
    if (!m || !m.ready || m.winner == null) break
    seen.add(m.id)
    const side = m.topPos === pos ? 'top' : 'bot'
    if (m.winner === side) {
      wins++
    } else {
      alive = false
    }
  }
  const start = STARTING_WINS[pos]
  return {
    wins,
    maxRemaining: alive ? (start - wins) : 0,
    alive,
    eliminated: !alive,
    startingMax: start,
  }
}

// Aggregate per-team current points and remaining-potential points across all 8 flights.
// Also returns aliveCount: how many entries still alive per team.
export function aggregate(flights) {
  const points = {}
  const remaining = {}
  const alive = {}
  for (const f of flights) {
    for (let pos = 0; pos < 9; pos++) {
      const e = f.entries[pos]
      if (!e.teamId) continue
      const s = entryStanding(f, pos)
      points[e.teamId] = (points[e.teamId] || 0) + s.wins
      remaining[e.teamId] = (remaining[e.teamId] || 0) + s.maxRemaining
      if (s.alive && s.maxRemaining > 0) alive[e.teamId] = (alive[e.teamId] || 0) + 1
    }
  }
  return { points, remaining, alive }
}
