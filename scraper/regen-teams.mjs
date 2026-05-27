// Add any missing schools from the 2026 D1-D4 scraped brackets to
// app/src/data/teams.js. Preserves existing entries (id, name, short,
// color). Assigns auto colors + initials to new entries.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEAMS_PATH = join(__dirname, '..', 'app', 'src', 'data', 'teams.js')

function slug(s) { return (s || '').trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_').replace(/^_+|_+$/g, '') }
function initials(s) {
  const words = (s || '').split(/\s+/).filter(Boolean)
  if (words.length >= 3) return words.map(w => w[0]).join('').toUpperCase().slice(0, 4)
  if (words.length === 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (s || '').slice(0, 2).toUpperCase()
}

// Curated palette for new auto-assigned teams (Tailwind-ish hexes).
const PALETTE = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#06b6d4',
  '#ec4899', '#84cc16', '#0ea5e9', '#f97316', '#14b8a6', '#6366f1',
  '#22c55e', '#eab308', '#d946ef', '#0891b2', '#dc2626', '#7c3aed',
]
function hashColor(slugStr) {
  let h = 0
  for (let i = 0; i < slugStr.length; i++) h = ((h << 5) - h) + slugStr.charCodeAt(i) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

// Parse existing teams.js by extracting the TEAMS array literal.
const src = readFileSync(TEAMS_PATH, 'utf8')
// Locate "export const TEAMS = [" and find the matching closing bracket.
const startIdx = src.indexOf('export const TEAMS = [')
if (startIdx < 0) { console.error('Could not find TEAMS array'); process.exit(1) }
const arrayStart = src.indexOf('[', startIdx)
// Walk forward tracking bracket depth (ignoring strings).
let depth = 0, inStr = false, escape = false
let arrayEnd = -1
for (let i = arrayStart; i < src.length; i++) {
  const c = src[i]
  if (escape) { escape = false; continue }
  if (inStr) {
    if (c === '\\') escape = true
    else if (c === '"') inStr = false
    continue
  }
  if (c === '"') { inStr = true; continue }
  if (c === '[') depth++
  else if (c === ']') {
    depth--
    if (depth === 0) { arrayEnd = i; break }
  }
}
if (arrayEnd < 0) { console.error('Unbalanced brackets in TEAMS array'); process.exit(1) }
const existing = JSON.parse(src.slice(arrayStart, arrayEnd + 1))
const existingById = new Map(existing.map(t => [t.id, t]))

// Gather all unique school names from all 4 division scrapes.
const schools = new Map() // slug -> displayName
for (const div of ['d1', 'd2', 'd3', 'd4']) {
  const f = join(__dirname, `state-2026-${div}.json`)
  const d = JSON.parse(readFileSync(f, 'utf8'))
  for (const fid of Object.keys(d)) {
    const r1 = d[fid]?.rounds?.find(r => r.heading === 'Round 1')
    if (!r1) continue
    for (const m of r1.matches) {
      for (const s of (m.sides || [])) {
        if (s.type === 'bye' || !s.school) continue
        const id = slug(s.school)
        if (!schools.has(id)) schools.set(id, s.school)
      }
    }
  }
}

// Find missing schools and append.
let added = 0
for (const [id, name] of schools) {
  if (existingById.has(id)) continue
  existing.push({ id, name, short: initials(name), color: hashColor(id) })
  added++
  console.log('  + adding', id, '(' + name + ', ' + initials(name) + ', ' + hashColor(id) + ')')
}

if (added === 0) {
  console.log('No missing schools — teams.js is already complete.')
  process.exit(0)
}

// Sort alphabetically by id to match the existing convention.
existing.sort((a, b) => a.id.localeCompare(b.id))

// Re-serialize. Use the same 2-space format the file uses.
const teamsJson = JSON.stringify(existing, null, 2)
const newSrc = src.slice(0, arrayStart) + teamsJson + src.slice(arrayEnd + 1)
writeFileSync(TEAMS_PATH, newSrc)
console.log(`Added ${added} schools, wrote ${TEAMS_PATH}`)
