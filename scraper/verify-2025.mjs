import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leaderboard } from '../app/src/lib/stats.js'
import { TEAMS } from '../app/src/data/teams.js'
import { entryStanding } from '../app/src/lib/bracket.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const state = JSON.parse(readFileSync(join(__dirname, 'state-2025-app.json'), 'utf8'))
const rows = leaderboard(state.flights)

console.log('2025 D1 State Finals — computed leaderboard:')
console.log('Rank  Team                                Pts  Max  Alive')
for (const r of rows) {
  console.log(`  ${String(r.displayRank).padStart(2)}  ${r.team.name.padEnd(34)}  ${String(r.points).padStart(3)}  ${String(r.maxPossible).padStart(3)}  ${r.alive}`)
}

console.log('\nClarkston entries breakdown:')
for (const f of state.flights) {
  for (let pos = 0; pos < 32; pos++) {
    const e = f.entries[pos]
    if (e.teamId !== 'clarkston') continue
    const s = entryStanding(f, pos)
    const name = e.name + (e.partner ? ` / ${e.partner}` : '')
    console.log(`  ${f.id} pos ${pos}: ${name}  → ${s.wins} pts (alive=${s.alive}, pending byes=${s.pendingByes})`)
  }
}
