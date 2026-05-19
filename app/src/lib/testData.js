// Synthetic state generators for UI testing during the tournament.
//
// Both datasets use the real 2025 D1 entries (player names + positions)
// but pick winners at random so we can preview what the leaderboard +
// brackets look like at different points in a tournament.

import seed2025 from '../data/seed2025.json'
import { MATCH_DEFS, describeMatches } from './bracket.js'

function coin() { return Math.random() < 0.5 ? 'top' : 'bot' }

// Walk all matches in MATCH_DEFS order. For each match in `roundIds`:
//   - if both sides have real entries (not byes), pick a winner with `picker(matchId)`
//   - if `picker` returns null, skip (leave undecided)
// Byes auto-resolve in the bracket logic — no need to record a winner for them.
function fillWinners(entries, roundIds, picker, baseWinners = {}) {
  const winners = { ...baseWinners }
  const flight = { id: 'tmp', entries, winners }
  for (const def of MATCH_DEFS) {
    if (!roundIds.includes(def.round)) continue
    const ms = describeMatches(flight)
    const m = ms.find(x => x.id === def.id)
    if (!m) continue
    if (m.topEmpty || m.botEmpty) continue
    if (m.topPending || m.botPending) continue
    const pick = picker(def.id)
    if (pick === 'top' || pick === 'bot') winners[def.id] = pick
  }
  return winners
}

// Test Data A: All R1 matches resolved; 75% of R2 matches resolved.
export function generateTestA() {
  const flights = seed2025.flights.map(f => {
    const r1Winners = fillWinners(f.entries, ['R1'], () => coin())
    const r2Ids = MATCH_DEFS.filter(d => d.round === 'R2').map(d => d.id)
    const shuffled = [...r2Ids].sort(() => Math.random() - 0.5)
    const r2Pick = new Set(shuffled.slice(0, Math.floor(r2Ids.length * 0.75)))
    const winners = fillWinners(f.entries, ['R2'], (id) => r2Pick.has(id) ? coin() : null, r1Winners)
    return { id: f.id, entries: f.entries, winners }
  })
  return { flights, meta: { source: 'test' } }
}

// Test Data B: All rounds complete except the championship (F).
export function generateTestB() {
  const flights = seed2025.flights.map(f => {
    let winners = fillWinners(f.entries, ['R1'], () => coin())
    winners = fillWinners(f.entries, ['R2'], () => coin(), winners)
    winners = fillWinners(f.entries, ['R3'], () => coin(), winners)
    winners = fillWinners(f.entries, ['SF'], () => coin(), winners)
    return { id: f.id, entries: f.entries, winners }
  })
  return { flights, meta: { source: 'test' } }
}
