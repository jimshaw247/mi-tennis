// Pull unique school names from the 2025 state finals scrape across all flights.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(readFileSync(`${__dirname}/state-2025.json`, 'utf8'))

const schools = new Map()
for (const [, fdata] of Object.entries(data)) {
  for (const round of fdata.rounds) {
    for (const m of round.matches) {
      for (const side of m.sides || []) {
        if (side.type === 'players' && side.school) {
          schools.set(side.school, (schools.get(side.school) || 0) + 1)
        }
      }
    }
  }
}

const sorted = [...schools.entries()].sort((a, b) => a[0].localeCompare(b[0]))
console.log(`Unique schools: ${sorted.length}`)
for (const [name, count] of sorted) {
  console.log(`  ${count.toString().padStart(3)}  ${name}`)
}

function slug(name) {
  return name.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_').replace(/^_+|_+$/g, '')
}

const COLORS = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#a855f7',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#8b5cf6',
  '#14b8a6', '#eab308', '#d946ef', '#22c55e', '#0ea5e9',
  '#f43f5e', '#6366f1', '#fb923c', '#a3e635', '#fde047',
]

const teams = sorted.map(([name], i) => ({
  id: slug(name),
  name,
  short: name.split(/\s+/).map(w => w[0]).join('').slice(0, 4).toUpperCase(),
  color: COLORS[i % COLORS.length],
}))

writeFileSync(`${__dirname}/teams-2025.json`, JSON.stringify(teams, null, 2))
console.log(`Wrote scraper/teams-2025.json (${teams.length} teams)`)
