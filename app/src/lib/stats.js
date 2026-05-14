import { TEAMS } from '../data/teams.js'
import { aggregate } from './bracket.js'

// Build a sorted leaderboard with finish bounds and qualification status.
// Top 3 auto-qualify; any team with 18+ points also qualifies.
export function leaderboard(flights) {
  const { points, remaining, alive } = aggregate(flights)
  const rows = TEAMS.map(t => {
    const cur = points[t.id] || 0
    const rem = remaining[t.id] || 0
    return {
      team: t,
      points: cur,
      maxPossible: cur + rem,
      remaining: rem,
      alive: alive[t.id] || 0,
    }
  })

  // Conservative bounds. Best rank = 1 + count of teams whose CURRENT > this.MAX.
  // Worst rank = 1 + count of teams whose MAX > this.CURRENT.
  for (const r of rows) {
    r.bestRank = 1 + rows.filter(o => o.team.id !== r.team.id && o.points > r.maxPossible).length
    r.worstRank = 1 + rows.filter(o => o.team.id !== r.team.id && o.maxPossible > r.points).length
  }

  // Display order: by current points desc, then by max possible desc, then by name.
  rows.sort((a, b) =>
    b.points - a.points
    || b.maxPossible - a.maxPossible
    || a.team.name.localeCompare(b.team.name)
  )
  rows.forEach((r, i) => { r.displayRank = i + 1 })

  // Qualification flags.
  // Eighteen-point threshold matches what the prompt calls "draw of 16 threshold".
  for (const r of rows) {
    r.clinchedTop3 = r.worstRank <= 3
    r.eliminatedTop3 = r.bestRank > 3
    r.clinched18 = r.points >= 18
    r.eliminated18 = r.maxPossible < 18
    r.qualified = r.clinchedTop3 || r.clinched18
    r.eliminatedAll = r.eliminatedTop3 && r.eliminated18
  }

  return rows
}
