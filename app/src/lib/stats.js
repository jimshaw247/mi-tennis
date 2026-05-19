import { TEAMS } from '../data/teams.js'
import { aggregate } from './bracket.js'

// Sorted leaderboard for state finals: rank, points, max possible, alive entries,
// and conservative best/worst finish bounds.
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

  for (const r of rows) {
    r.bestRank = 1 + rows.filter(o => o.team.id !== r.team.id && o.points > r.maxPossible).length
    r.worstRank = 1 + rows.filter(o => o.team.id !== r.team.id && o.maxPossible > r.points).length
  }

  rows.sort((a, b) =>
    b.points - a.points
    || b.maxPossible - a.maxPossible
    || a.team.name.localeCompare(b.team.name)
  )
  // Rank by points only (the tournament's tiebreak in the live UI). Two
  // teams with equal points share a rank; both get a tied flag so the UI
  // can prefix "T-".
  let rankCursor = 0
  let lastPts = null
  rows.forEach((r, i) => {
    if (r.points !== lastPts) { rankCursor = i + 1; lastPts = r.points }
    r.displayRank = rankCursor
  })
  for (const r of rows) {
    r.tied = rows.some(o => o.team.id !== r.team.id && o.displayRank === r.displayRank)
  }

  for (const r of rows) {
    r.clinchedTop3 = r.worstRank <= 3
    r.eliminatedTop3 = r.bestRank > 3
    r.clinchedFirst = r.worstRank === 1
    r.eliminatedAll = r.maxPossible === 0 && r.points === 0
  }

  return rows
}
