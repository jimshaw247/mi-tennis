// Combine schools across all 4 division scrapes into one master teams list.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schools = new Map() // name -> first-seen division
for (const div of ['d1', 'd2', 'd3', 'd4']) {
  const data = JSON.parse(readFileSync(join(__dirname, `state-2025-${div}.json`), 'utf8'))
  for (const [, fdata] of Object.entries(data)) {
    for (const round of fdata.rounds || []) {
      for (const m of round.matches || []) {
        for (const side of m.sides || []) {
          if (side.type === 'players' && side.school) {
            if (!schools.has(side.school)) schools.set(side.school, div.toUpperCase())
          }
        }
      }
    }
  }
}

const sorted = [...schools.entries()].sort((a, b) => a[0].localeCompare(b[0]))
console.log(`Unique schools across all 4 divisions: ${sorted.length}`)

function slug(name) {
  return name.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_').replace(/^_+|_+$/g, '')
}

const COLORS = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16',
  '#f97316', '#8b5cf6', '#14b8a6', '#eab308', '#d946ef', '#22c55e', '#0ea5e9', '#f43f5e',
  '#6366f1', '#fb923c', '#a3e635', '#fde047', '#dc2626', '#2563eb', '#059669', '#d97706',
  '#9333ea', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#7c3aed', '#0d9488', '#ca8a04',
  '#c026d3', '#16a34a', '#0284c7', '#e11d48', '#4f46e5', '#f59e0b', '#84cc16', '#f97316',
]

const teams = sorted.map(([name], i) => ({
  id: slug(name),
  name,
  short: name.split(/\s+/).map(w => w[0]).join('').slice(0, 4).toUpperCase(),
  color: COLORS[i % COLORS.length],
}))

const out = `export const TEAMS = ${JSON.stringify(teams, null, 2)}\n\nexport const TEAM_BY_ID = Object.fromEntries(TEAMS.map(t => [t.id, t]))\n`
writeFileSync(join(__dirname, '..', 'app', 'src', 'data', 'teams.generated.js'), out)
console.log(`Wrote app/src/data/teams.generated.js (${teams.length} teams)`)
