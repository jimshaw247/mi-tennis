// Apply bracket_overrides.json to phase1 + phase2b, then re-run phase4 + phase5.
//
// Why this exists: the state-finals bracket gets last-minute substitutions
// (e.g., Lana Sloan replacing Laine Jones at Clarkston 2S) after phase1
// scraped the regional qualifier lists. Rather than re-scrape all of TR, we
// apply a small overrides file to the phase1 cache + inject any missing
// match history into phase2b, then let phase4/5 recompute from there.
//
// Outputs: backups (*.bak), patched phase1_summary.json, patched
// phase2b_player_matches.json, fresh sos_report.{md,json} + sos_app.json,
// and a copy at app/public/sos.json so the deployed app picks it up.
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = `${__dirname}/data`
const APP_PUBLIC = resolve(__dirname, '../../app/public/sos.json')

const overrides = JSON.parse(readFileSync(`${DATA}/bracket_overrides.json`, 'utf8'))
const subs = overrides.subs

function backup(path) {
  if (existsSync(path) && !existsSync(`${path}.bak`)) {
    copyFileSync(path, `${path}.bak`)
    console.log(`backup: ${path}.bak`)
  }
}

function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z]/g, '')
}

// ---- 1. Patch phase1_summary.json ----
const phase1Path = `${DATA}/phase1_summary.json`
backup(phase1Path)
const phase1 = JSON.parse(readFileSync(phase1Path, 'utf8'))

let patched = 0, missed = 0
for (const sub of subs) {
  let hit = false
  for (const reg of phase1.regionals) {
    const fdata = reg.flights?.[sub.flight]
    if (!fdata) continue
    for (const q of (fdata.qualifiers || [])) {
      if (q.school?.id !== sub.schoolId) continue
      // Match the entry by old player names. For singles, single name. For
      // doubles, both names must overlap (order-independent).
      const qNames = new Set(q.players.map(p => normName(p.name)))
      const oldNames = new Set(sub.oldPlayers.map(p => normName(p.name)))
      const overlap = [...oldNames].filter(n => qNames.has(n)).length
      if (overlap < sub.oldPlayers.length) continue
      // Replace players array with the new lineup. Preserve any non-name
      // fields from the original entry shape (elo2026, grade, etc.) only
      // where the playerId is unchanged; otherwise insert fresh records.
      const byOldPid = Object.fromEntries(q.players.map(p => [normName(p.name), p]))
      q.players = sub.newPlayers.map(np => {
        const prior = byOldPid[normName(np.name)]
        return {
          playerId: np.playerId,
          name: np.name,
          grade: prior?.grade ?? null,
          elo2026: prior?.playerId === np.playerId ? prior.elo2026 : null,
          pastStateFinals: prior?.playerId === np.playerId ? prior.pastStateFinals : [],
        }
      })
      console.log(`patched phase1: ${sub.flight} ${sub.school} → ${sub.newPlayers.map(p=>p.name).join('/')}`)
      patched++; hit = true
      break
    }
    if (hit) break
  }
  if (!hit) {
    console.warn(`MISSED phase1 patch for ${sub.flight} ${sub.school} (${sub.oldPlayers.map(p=>p.name).join('/')})`)
    missed++
  }
}
writeFileSync(phase1Path, JSON.stringify(phase1, null, 2))
console.log(`phase1: ${patched} patched, ${missed} missed`)

// Also patch phase1.qualifierEntries (the flat denormalized list)
for (const sub of subs) {
  const target = phase1.qualifierEntries?.find(e =>
    e.flight === sub.flight &&
    e.school?.id === sub.schoolId &&
    e.players.some(p => sub.oldPlayers.some(op => normName(op.name) === normName(p.name)))
  )
  if (!target) continue
  target.players = sub.newPlayers.map(np => ({
    playerId: np.playerId,
    name: np.name,
    grade: null,
    elo2026: null,
    pastStateFinals: [],
  }))
}
writeFileSync(phase1Path, JSON.stringify(phase1, null, 2))

// ---- 2. Inject Puja Ravi's matches into both phase2b AND the school JSON ----
// phase4 reads pool matches from school JSONs only; phase5 augments from
// phase2b. So players not in their school's match data (JV bumps,
// substitutes) need to land in both files to get a rating + show up.
const phase2bPath = `${DATA}/phase2b_player_matches.json`
backup(phase2bPath)
const phase2b = JSON.parse(readFileSync(phase2bPath, 'utf8'))

for (const sub of subs.filter(s => s.needsPhase2bInject)) {
  // 2a. School JSON inject — append a synthetic meet containing the new
  // player's matches so phase4's pool picks them up.
  const schoolFile = `${DATA}/schools/${sub.schoolId}.json`
  backup(schoolFile)
  const schoolJson = JSON.parse(readFileSync(schoolFile, 'utf8'))
  const schoolSeenIds = new Set()
  for (const meet of (schoolJson.meets || [])) {
    for (const t of ['Singles', 'Doubles']) {
      for (const m of (meet.matches?.[t] || [])) schoolSeenIds.add(m.id)
    }
  }
  const injectMeet = {
    meetId: null,
    title: `bracket-override inject for ${sub.newPlayers.map(p => p.name).join('/')}`,
    date: new Date().toISOString(),
    postSeason: false,
    matches: { Singles: [], Doubles: [] },
  }

  for (const np of sub.newPlayers) {
    const playerFile = `${DATA}/players/${np.playerId}.json`
    if (!existsSync(playerFile)) {
      console.warn(`SKIP inject for ${np.name}: ${playerFile} missing.`)
      continue
    }
    const pdata = JSON.parse(readFileSync(playerFile, 'utf8'))
    const phase2bSeen = new Set(phase2b.matches.map(m => m.matchId))
    let p2bAdded = 0, schoolAdded = 0
    for (const t of ['Singles', 'Doubles']) {
      for (const m of (pdata.matches?.[t] || [])) {
        // School JSON inject (phase4 pool)
        if (!schoolSeenIds.has(m.id)) {
          schoolSeenIds.add(m.id)
          injectMeet.matches[t].push({
            sets: m.sets,
            id: m.id,
            flight: m.flight,
            matchType: t,
            finish: m.finish,
            winnerTeamId: m.winnerTeamId,
            genderId: m.genderId,
            isNotVarsity: !!m.isNotVarsity,
            matchTeams: (m.matchTeams || []).map(mt => ({
              id: mt.id,
              isWinner: !!mt.isWinner,
              players: (mt.players || []).map(p => ({
                id: p.id,
                firstName: p.firstName,
                lastName: p.lastName,
                grade: p.grade,
                genderId: p.genderId,
                schoolId: p.schoolId ?? p.school?.id,
                school: p.school,
                matchTeamPlayer: p.matchTeamPlayer,
              })),
            })),
          })
          schoolAdded++
        }
        // phase2b inject (phase5 augment)
        if (!phase2bSeen.has(m.id)) {
          phase2bSeen.add(m.id)
          phase2b.matches.push({
            matchId: m.id,
            flight: m.flight,
            flightId: `${m.flight}${t === 'Singles' ? 'S' : 'D'}`,
            matchType: t,
            finish: m.finish,
            winnerTeamId: m.winnerTeamId,
            meetDateTime: m.meet?.meetDateTime,
            postSeason: !!m.meet?.postSeason,
            matchTeams: (m.matchTeams || []).map(mt => ({
              id: mt.id,
              isWinner: !!mt.isWinner,
              players: (mt.players || []).map(p => ({
                id: p.id,
                firstName: p.firstName,
                lastName: p.lastName,
                grade: p.grade,
                schoolId: p.schoolId ?? p.school?.id,
                school: p.school,
                matchTeamPlayer: p.matchTeamPlayer,
              })),
            })),
            sets: m.sets,
          })
          p2bAdded++
        }
      }
    }
    console.log(`injected ${np.name} (pid ${np.playerId}): ${schoolAdded} school matches, ${p2bAdded} phase2b matches`)
  }

  // Only add the synthetic meet if it has at least one match.
  if (injectMeet.matches.Singles.length + injectMeet.matches.Doubles.length > 0) {
    schoolJson.meets.push(injectMeet)
    writeFileSync(schoolFile, JSON.stringify(schoolJson, null, 2))
    console.log(`wrote ${schoolFile}`)
  }
}
phase2b.matches.sort((a, b) => (a.matchId || 0) - (b.matchId || 0))
phase2b.generatedAt = new Date().toISOString()
writeFileSync(phase2bPath, JSON.stringify(phase2b, null, 2))

// ---- 3. Re-run phase4 + phase5 ----
console.log('\n=== running phase4 ===')
execSync(`node ${__dirname}/phase4_ratings.mjs`, { stdio: 'inherit' })
console.log('\n=== running phase5 ===')
execSync(`node ${__dirname}/phase5_export.mjs`, { stdio: 'inherit' })

// ---- 4. Copy sos_app.json to app/public/sos.json ----
copyFileSync(`${DATA}/sos_app.json`, APP_PUBLIC)
console.log(`\nCopied sos_app.json → ${APP_PUBLIC}`)
