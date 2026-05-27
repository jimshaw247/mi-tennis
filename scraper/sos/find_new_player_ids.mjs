// Look up TR playerIds for the 8 bracket-substituted players. Scans cached
// school endpoint data — these players have been playing all season, just
// weren't the regional qualifier for this state-finals flight.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHOOLS_DIR = `${__dirname}/data/schools`

// (flight, schoolName, newPlayerName) — flips Clarkston 2S to Lana Sloan etc.
// For doubles, "Player / Partner" format; we look up the leading name.
const SUBS = [
  { flight: '1S', school: 'Utica Eisenhower', oldName: 'Madison LeBel', newName: 'Gabriella Sadowski' },
  { flight: '2S', school: 'Clarkston', oldName: 'Laine Jones', newName: 'Lana Sloan' },
  { flight: '4S', school: 'West Bloomfield', oldName: 'Emmaline Strange', newName: 'Puja Ravi' },
  { flight: '4S', school: 'Portage Central', oldName: 'Claire Mouw', newName: 'Nina Shaye' },
  { flight: '1D', school: 'Portage Central', oldNames: ['Maya Gutshall','Julia Rypma'], newNames: ['Claire Mouw','Maya Gutshall'] },
  { flight: '1D', school: 'Farmington', oldNames: ['Gabriela Stakvel','Aubrey Wods'], newNames: ['Gabriela Stakvel','Sonali Shah'] },
  { flight: '3D', school: 'Farmington', oldNames: ['Gaia DeMeester','Danya Asmar'], newNames: ['Gaia DeMeester','Aubrey Wods'] },
  { flight: '4D', school: 'Farmington', oldNames: ['Eleanor Tipton','Paige Alexsander'], newNames: ['Eleanor Tipton','Isabella Acosta-Rubio'] },
]

function normName(s) {
  return String(s||'').toLowerCase().replace(/[^a-z]/g,'')
}

// Index every school by name → schoolId, and collect player rosters
const schoolFiles = readdirSync(SCHOOLS_DIR).filter(f => f.endsWith('.json'))
const rosterBySchool = new Map()  // schoolName → Map(normalizedName → {pid, name, count})
for (const f of schoolFiles) {
  const sid = Number(f.replace('.json',''))
  const d = JSON.parse(readFileSync(`${SCHOOLS_DIR}/${f}`,'utf8'))
  const sname = d.school?.name
  if (!sname) continue
  const roster = new Map()
  for (const m of (d.meets || [])) {
    for (const t of ['Singles','Doubles']) {
      for (const x of (m.matches?.[t] || [])) {
        for (const mt of (x.matchTeams || [])) {
          for (const p of (mt.players || [])) {
            if (p.schoolId === sid) {
              const k = normName(`${p.firstName||''} ${p.lastName||''}`)
              if (!roster.has(k)) roster.set(k, { pid: p.id, name: `${p.firstName||''} ${p.lastName||''}`.trim(), count: 0 })
              roster.get(k).count++
            }
          }
        }
      }
    }
  }
  rosterBySchool.set(sname, { sid, roster })
}

console.log('=== Player ID lookups for bracket substitutions ===\n')
const resolved = []
for (const sub of SUBS) {
  const s = rosterBySchool.get(sub.school)
  if (!s) { console.log(`MISS school: ${sub.school}`); continue }
  if (sub.newName) {
    // singles
    const k = normName(sub.newName)
    const hit = s.roster.get(k)
    if (hit) {
      console.log(`${sub.flight} ${sub.school}: ${sub.oldName} → ${sub.newName}  pid=${hit.pid} (${hit.count} matches)`)
      resolved.push({ ...sub, schoolId: s.sid, newPlayers: [{ playerId: hit.pid, name: hit.name }] })
    } else {
      console.log(`${sub.flight} ${sub.school}: MISS new player "${sub.newName}". Roster has:`)
      ;[...s.roster.values()].sort((a,b)=>b.count-a.count).forEach(p => console.log(`   ${p.name} (${p.count})`))
    }
  } else {
    // doubles
    const pids = []
    for (const n of sub.newNames) {
      const k = normName(n)
      const hit = s.roster.get(k)
      if (!hit) { console.log(`${sub.flight} ${sub.school}: MISS new partner "${n}"`); pids.push(null); continue }
      pids.push({ playerId: hit.pid, name: hit.name })
    }
    if (pids.every(Boolean)) {
      console.log(`${sub.flight} ${sub.school}: ${sub.oldNames.join('/')} → ${sub.newNames.join('/')}  pids=${pids.map(p=>p.playerId).join(',')}`)
      resolved.push({ ...sub, schoolId: s.sid, newPlayers: pids })
    }
  }
}

console.log('\n--- JSON for overrides ---')
console.log(JSON.stringify(resolved, null, 2))
