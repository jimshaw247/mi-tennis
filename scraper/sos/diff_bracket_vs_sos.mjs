// One-off: diff the live D1 bracket entries (Supabase tennis_state row 1)
// against the qualifier names in phase4_ratings.json. Surfaces any roster
// changes the bracket has picked up but SOS hasn't.
//
// The bracket data is pasted inline below (pulled from Supabase via the MCP
// query on 2026-05-27). If re-running, refresh that block.
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const phase4 = JSON.parse(readFileSync(`${__dirname}/data/phase4_ratings.json`, 'utf8'))

// Live bracket entries by flight, keyed by school name. Singles -> player name.
// Doubles -> "Player / Partner". From Supabase tennis_state row 1, 2026-05-27.
const LIVE = JSON.parse(readFileSync(`${__dirname}/data/live_bracket_d1.json`, 'utf8'))

// Map team_id (snake_case) -> display school name as it appears in phase4.
// Phase4 schoolName field uses TR's display name. The bracket team_id
// snake-cases the same display name, so we reverse it.
const TEAM_NAME = {
  ann_arbor_pioneer: 'Ann Arbor Pioneer',
  ann_arbor_skyline: 'Ann Arbor Skyline',
  bloomfield_hills: 'Bloomfield Hills',
  byron_center: 'Byron Center',
  clarkston: 'Clarkston',
  farmington: 'Farmington',
  holland_west_ottawa: 'Holland West Ottawa',
  northville: 'Northville',
  novi: 'Novi',
  okemos: 'Okemos',
  portage_central: 'Portage Central',
  rochester: 'Rochester',
  rochester_adams: 'Rochester Adams',
  rochester_hills_stoney_creek: 'Rochester Hills Stoney Creek',
  rockford: 'Rockford',
  romeo: 'Romeo',
  saline: 'Saline',
  troy: 'Troy',
  troy_athens: 'Troy Athens',
  utica_eisenhower: 'Utica Eisenhower',
  utica_ford: 'Utica Ford',
  west_bloomfield: 'West Bloomfield',
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function bracketLabel(entry) {
  const n = (entry.name || '').trim()
  const p = (entry.partner || '').trim()
  return p ? `${n} / ${p}` : n
}

function sosLabel(q) {
  const n = (q.name || '').trim()
  const p = (q.partner || '').trim()
  return p ? `${n} / ${p}` : n
}

const FLIGHTS = ['1S', '2S', '3S', '4S', '1D', '2D', '3D', '4D']
const diffs = []
const onlySos = []
const onlyBracket = []

for (const fid of FLIGHTS) {
  const sosList = phase4.qualifiers[fid] || []
  const liveList = LIVE[fid] || []

  // Index live by school name
  const liveBySchool = new Map()
  for (const e of liveList) {
    const sn = TEAM_NAME[e.team_id]
    if (!sn) { console.warn(`unmapped team_id: ${e.team_id}`); continue }
    liveBySchool.set(sn, e)
  }
  const sosBySchool = new Map(sosList.map(q => [q.schoolName, q]))

  // Compare for every school present in either side
  const schools = new Set([...liveBySchool.keys(), ...sosBySchool.keys()])
  for (const school of schools) {
    const live = liveBySchool.get(school)
    const sos = sosBySchool.get(school)
    if (live && !sos) {
      onlyBracket.push({ flight: fid, school, bracket: bracketLabel(live) })
      continue
    }
    if (!live && sos) {
      onlySos.push({ flight: fid, school, sos: sosLabel(sos) })
      continue
    }
    const lLabel = bracketLabel(live)
    const sLabel = sosLabel(sos)
    if (norm(lLabel) !== norm(sLabel)) {
      diffs.push({ flight: fid, school, sos: sLabel, bracket: lLabel })
    }
  }
}

console.log('=== Roster differences (SOS vs live bracket) ===\n')
if (diffs.length === 0) {
  console.log('(no name differences)')
} else {
  console.log('Flight | School | SOS has | Bracket has')
  console.log('-------|--------|---------|------------')
  for (const d of diffs) {
    console.log(`  ${d.flight}  | ${d.school.padEnd(32)} | ${d.sos.padEnd(40)} | ${d.bracket}`)
  }
}

if (onlySos.length) {
  console.log('\nSOS has entry, bracket does not:')
  for (const d of onlySos) console.log(`  ${d.flight} ${d.school}: ${d.sos}`)
}
if (onlyBracket.length) {
  console.log('\nBracket has entry, SOS does not:')
  for (const d of onlyBracket) console.log(`  ${d.flight} ${d.school}: ${d.bracket}`)
}

console.log(`\nSummary: ${diffs.length} mismatched names, ${onlySos.length} SOS-only, ${onlyBracket.length} bracket-only`)
