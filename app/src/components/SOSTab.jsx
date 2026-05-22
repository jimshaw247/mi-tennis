import { useEffect, useMemo, useState } from 'react'
import { describeMatches, entryStanding, ROUND_DEFS, MATCH_DEFS } from '../lib/bracket.js'
import { TEAM_BY_ID } from '../data/teams.js'

const MATCH_DEF_BY_ID = Object.fromEntries(MATCH_DEFS.map(m => [m.id, m]))

const FLIGHTS = ['1S','2S','3S','4S','1D','2D','3D','4D']
const FLIGHT_LABEL = { '1S':'#1 Singles','2S':'#2 Singles','3S':'#3 Singles','4S':'#4 Singles',
                       '1D':'#1 Doubles','2D':'#2 Doubles','3D':'#3 Doubles','4D':'#4 Doubles' }
const ROUND_LABEL = Object.fromEntries(ROUND_DEFS.map(r => [r.id, r.label]))
const HIGHLIGHT = 4052 // Clarkston

function pct(p) { return p == null ? '—' : (p * 100).toFixed(0) + '%' }

function teamIdForSchool(schoolName) {
  return (schoolName || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_')
}

// Locate a sos.json qualifier's bracket entry. Matches by school slug + first-
// player name to disambiguate the (rare) case of a school with multiple entries.
function findEntryPos(flight, qualifier) {
  if (!flight?.entries || !qualifier) return -1
  const targetSlug = teamIdForSchool(qualifier.schoolName)
  const firstName = qualifier.name.split(' / ')[0].trim()
  let idx = flight.entries.findIndex(e => e.teamId === targetSlug && e.name === firstName)
  if (idx >= 0) return idx
  return flight.entries.findIndex(e => e.teamId === targetSlug)
}

function entryDisplayName(entry) {
  if (!entry?.teamId) return null
  return entry.partner ? `${entry.name} / ${entry.partner}` : entry.name
}

function entrySchoolName(entry) {
  if (!entry?.teamId) return null
  return TEAM_BY_ID[entry.teamId]?.name || entry.teamId
}

// Walk a bracket source (R1 position or higher-round match id) and return the
// list of entries that can currently occupy that slot.
//   - Numeric src (R1 pos): one entry if the slot has a teamId, else [] (true bye).
//   - Match-id src: if the match has a winner (user-picked or auto-bye), recurse
//     into the winning source. Else recurse into BOTH sources and concat.
// Returns [] for fully empty bye chains, 1 for resolved slots (incl. bye-cascade),
// 2 when the immediate parent match is undecided, 4 when two prior matches are
// both undecided.
function potentialOpponentEntries(flight, src, matchesByPos) {
  if (typeof src === 'number') {
    const e = flight.entries[src]
    return e?.teamId ? [{ pos: src, entry: e }] : []
  }
  const def = MATCH_DEF_BY_ID[src]
  if (!def) return []
  const m = matchesByPos[src]
  if (!m) return []
  if (m.winner) {
    const winSrc = m.winner === 'top' ? def.top : def.bot
    return potentialOpponentEntries(flight, winSrc, matchesByPos)
  }
  return [
    ...potentialOpponentEntries(flight, def.top, matchesByPos),
    ...potentialOpponentEntries(flight, def.bot, matchesByPos),
  ]
}

// For a player at bracket position `pos`, walk forward through rounds and
// classify their state:
//   - 'known'      : exactly one possible next opponent (single entry)
//   - 'pending'    : 2+ possible next opponents (waiting on upstream match[es])
//   - 'r1-bye'     : true R1 bye (opposing slot is empty)
//   - 'eliminated' : they lost a prior round
//   - 'champion'   : won all 5 rounds
function nextMatchFor(flight, pos) {
  if (!flight || pos < 0) return null
  const matches = describeMatches(flight)
  const byId = Object.fromEntries(matches.map(m => [m.id, m]))
  for (const r of ROUND_DEFS) {
    const m = matches.find(mm => mm.round === r.id && (mm.topPos === pos || mm.botPos === pos))
    if (!m) return null
    if (!m.winner) {
      const def = MATCH_DEF_BY_ID[m.id]
      const ourSide = m.topPos === pos ? 'top' : 'bot'
      const oppSrc = ourSide === 'top' ? def.bot : def.top
      const opponents = potentialOpponentEntries(flight, oppSrc, byId)
      if (opponents.length === 0) {
        if (r.id === 'R1') return { round: r.id, state: 'r1-bye', opponents: [] }
        // Shouldn't happen for higher rounds but degrade gracefully
        return { round: r.id, state: 'pending', opponents: [] }
      }
      if (opponents.length === 1) return { round: r.id, state: 'known', opponents }
      return { round: r.id, state: 'pending', opponents }
    }
    if (m.winnerPos !== pos) {
      const eliminator = m.winnerPos != null ? flight.entries[m.winnerPos] : null
      return { round: r.id, state: 'eliminated', opponents: [], eliminatedBy: eliminator }
    }
    // We won this round; continue scanning forward
  }
  return { state: 'champion', opponents: [] }
}

// Build a rating lookup keyed by `${teamSlug}|${firstPlayerName}` so we can
// score live bracket entries against sos.json ratings.
function buildRatingMap(qualifiers) {
  const map = new Map()
  for (const q of (qualifiers || [])) {
    const slug = teamIdForSchool(q.schoolName)
    const firstName = q.name.split(' / ')[0].trim()
    map.set(`${slug}|${firstName}`, q)
  }
  return map
}

function lookupQualifier(map, entry) {
  if (!entry?.teamId || !entry.name) return null
  return map.get(`${entry.teamId}|${entry.name}`) || null
}

// All bracket entries still alive at this flight, excluding `excludePos`.
function aliveOpponents(flight, excludePos) {
  if (!flight?.entries) return []
  const out = []
  for (let pos = 0; pos < flight.entries.length; pos++) {
    if (pos === excludePos) continue
    const e = flight.entries[pos]
    if (!e?.teamId) continue
    if (entryStanding(flight, pos).eliminated) continue
    out.push({ pos, entry: e })
  }
  return out
}

export default function SOSTab({ liveState = null }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [view, setView] = useState('teams') // 'teams' | 'flight' | 'clarkston' | 'upsets'
  const [flight, setFlight] = useState('1S')
  const [sortKey, setSortKey] = useState('rank')
  const [sortAsc, setSortAsc] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/sos.json').then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData).catch(e => setErr(String(e)))
  }, [])

  if (err) return <div className="p-4 text-red-300">Failed to load SOS data: {err}</div>
  if (!data) return <div className="p-4 text-slate-400">Loading SOS data…</div>

  return (
    <div className="space-y-3">
      <div className="text-[10px] text-slate-400 leading-relaxed">
        Bradley-Terry pooled rating (one universe for Singles, one for Doubles) · 28-day recency half-life · MOV-weighted · generated {data.generatedAt?.slice(0,10)}.{' '}
        Pooling all 4 singles flights into one rating universe means a player who flexed between 1S/2S/3S during the season is rated from <i>all</i> her matches; MHSAA flight-stay rules anchor her to her regional flight at state finals.
      </div>
      <div className="flex flex-wrap gap-1">
        {[['teams','Team Power'],['flight','Flight Rankings'],['form','Form'],['clarkston','Clarkston'],['lineup','Lineup Watch'],['upsets','Upset Watch']].map(([k, label]) => (
          <button key={k} onClick={() => setView(k)}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold uppercase tracking-wider ${view===k ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {view === 'teams' && <TeamsView data={data} sortKey={sortKey} setSortKey={setSortKey} sortAsc={sortAsc} setSortAsc={setSortAsc} q={q} setQ={setQ} />}
      {view === 'flight' && <FlightView data={data} flight={flight} setFlight={setFlight} q={q} setQ={setQ} />}
      {view === 'form' && <FormView data={data} flight={flight} setFlight={setFlight} liveState={liveState} />}
      {view === 'clarkston' && <ClarkstonView data={data} liveState={liveState} />}
      {view === 'lineup' && <LineupWatchView data={data} />}
      {view === 'upsets' && <UpsetsView data={data} liveState={liveState} />}
    </div>
  )
}

function HelpDot({ active, onClick }) {
  // Tap target is the whole 32x32 button; the visible circle is smaller and
  // sits inside generous padding so fat-finger taps don't bleed into the
  // adjacent sort label.
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      aria-label="Show column explanation"
      className="ml-1 -my-1 inline-flex items-center justify-center align-middle w-8 h-8 p-0 bg-transparent"
    >
      <span className={`flex items-center justify-center w-5 h-5 rounded-full border text-[10px] leading-none font-semibold ${active ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-500 text-slate-300 bg-slate-800'}`}>?</span>
    </button>
  )
}

function HelpRow({ helpKey, helpDict, colSpan }) {
  if (!helpKey) return null
  return (
    <tr className="bg-slate-950/80">
      <td colSpan={colSpan} className="px-3 py-2 text-[11px] text-slate-300 leading-relaxed border-t border-blue-900/40">
        <span className="text-blue-300 font-semibold mr-1.5">{helpDict[helpKey]?.title}:</span>
        {helpDict[helpKey]?.body}
      </td>
    </tr>
  )
}

function SortHeader({ id, label, current, asc, setKey, setAsc, helpKey, helpOpen, setHelpOpen, align = 'left' }) {
  const active = current === id
  const helpActive = helpKey != null && helpOpen === helpKey
  return (
    <th className={`px-1.5 py-1 text-${align} text-[10px] uppercase tracking-wider text-slate-400 select-none whitespace-nowrap`}>
      <span
        onClick={() => { if (active) setAsc(!asc); else { setKey(id); setAsc(false) } }}
        className="cursor-pointer"
        title={helpKey ? 'Tap label to sort, ? for definition' : ''}
      >
        {label}{active ? (asc ? ' ↑' : ' ↓') : ''}
      </span>
      {helpKey && <HelpDot active={helpActive} onClick={() => setHelpOpen(helpActive ? null : helpKey)} />}
    </th>
  )
}

function PlainHeader({ label, helpKey, helpOpen, setHelpOpen, align = 'left' }) {
  const helpActive = helpKey != null && helpOpen === helpKey
  return (
    <th className={`px-1.5 py-1 text-${align} text-[10px] uppercase text-slate-400 whitespace-nowrap`}>
      <span>{label}</span>
      {helpKey && <HelpDot active={helpActive} onClick={() => setHelpOpen(helpActive ? null : helpKey)} />}
    </th>
  )
}

function RatingCell({ rating, source }) {
  const flag = source && source !== 'season'
  return (
    <span className="font-mono">
      {rating}
      {flag && <span className="ml-0.5 text-amber-400 text-[9px]" title={`Rating source: ${source} (no/few season matches)`}>*</span>}
    </span>
  )
}

const TEAM_HELP = {
  rank: { title: '#', body: "Position in the team power rankings. Default sort is by Avg (average qualifier rating). Tap any other column header to re-sort." },
  schoolName: { title: 'School', body: "Team name. Clarkston is highlighted in blue. Every state-finals D1 team fields all 8 flights (1S–4S, 1D–4D) and every qualifier now has real season-match data." },
  total: { title: 'Total', body: "Sum of qualifier Bradley-Terry ratings across all 8 flights. Higher = stronger overall team." },
  totalAvg: { title: 'Avg', body: "Average rating per qualifier (Total ÷ 8). Default sort." },
  sosAvg: { title: 'SOS', body: "Strength of schedule, averaged across this school's qualifiers. Higher = they faced tougher opponents during the season. Independent of W/L — measures who they played, not how they did." },
}

function TeamsView({ data, sortKey, setSortKey, sortAsc, setSortAsc, q, setQ }) {
  const [helpOpen, setHelpOpen] = useState(null)
  const rows = useMemo(() => {
    let arr = [...(data.teamRanking || [])]
    if (q.trim()) {
      const needle = q.toLowerCase()
      arr = arr.filter(t => t.schoolName.toLowerCase().includes(needle))
    }
    arr.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortAsc ? cmp : -cmp
    })
    return arr
  }, [data, sortKey, sortAsc, q])
  const hdr = (id, label) => (
    <SortHeader id={id} label={label} current={sortKey} asc={sortAsc} setKey={setSortKey} setAsc={setSortAsc}
      helpKey={id} helpOpen={helpOpen} setHelpOpen={setHelpOpen} />
  )
  return (
    <div className="space-y-2">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter schools…"
        className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-sm" />
      <div className="text-[10px] text-slate-500">Tap a column's <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-slate-600 text-[8px]">?</span> for what it means.</div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              {hdr('rank', '#')}
              {hdr('schoolName', 'School')}
              {hdr('total', 'Total')}
              {hdr('totalAvg', 'Avg')}
              {hdr('sosAvg', 'SOS')}
            </tr>
          </thead>
          <tbody>
            <HelpRow helpKey={helpOpen} helpDict={TEAM_HELP} colSpan={5} />
            {rows.map(t => (
              <tr key={t.schoolId} className={`border-t border-slate-800 ${t.schoolId === HIGHLIGHT ? 'bg-blue-900/30' : ''}`}>
                <td className="px-1.5 py-1.5">{t.rank}</td>
                <td className="px-1.5 py-1.5 font-medium">{t.schoolName}</td>
                <td className="px-1.5 py-1.5 font-mono">{t.total}</td>
                <td className="px-1.5 py-1.5 font-mono">{t.totalAvg}</td>
                <td className="px-1.5 py-1.5 font-mono text-slate-400">{t.sosAvg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const FLIGHT_HELP = {
  rank: { title: '#', body: "State-finals rank at this flight — 1 is the highest Bradley-Terry rating in the field, 22 is the lowest." },
  player: { title: 'Player(s)', body: "Player (or doubles pair) who qualified at this flight through their regional. An amber '↔ regular' note below the name means this entry isn't the school's most-frequent dual-meet starter — possibly an approved sub." },
  school: { title: 'School', body: "The qualifier's school." },
  rating: { title: 'Rating', body: "Bradley-Terry rating. We pool every singles match into one universe and every doubles match into another, then iterate until each player's rating reflects head-to-head outcomes weighted by recency (28-day half-life) and margin of victory. A * suffix means the rating is a fallback from TennisReporting's 2026 Elo because the player had no ratable season matches." },
  sos: { title: 'SOS', body: "Strength of schedule — the average rating of opponents this player faced during the season, recency-weighted. Higher SOS = tougher schedule. SOS only measures who you played, not how you did against them." },
  matAtFlt: { title: 'M@flt', body: "Matches at this exact flight ÷ total varsity matches in the season pool (singles or doubles). A 4S player who also flexed up to 3S during the season will show a smaller numerator than denominator. The Bradley-Terry rating uses the full pool, not just same-flight matches." },
  regSeed: { title: 'Reg seed', body: "Seed at the regional tournament (1 = top seed). Comparing seed to state-finals rank is what powers the Upset Watch tab — under-seeded players are upset candidates." },
}

function FlightView({ data, flight, setFlight, q, setQ }) {
  const [helpOpen, setHelpOpen] = useState(null)
  const fd = data.flights?.[flight]
  if (!fd) return <div className="text-slate-400">No data for {flight}</div>
  let rows = fd.qualifiers
  if (q.trim()) {
    const n = q.toLowerCase()
    rows = rows.filter(r => r.name.toLowerCase().includes(n) || r.schoolName.toLowerCase().includes(n))
  }
  const hdr = (key, label, align) => (
    <PlainHeader label={label} helpKey={key} helpOpen={helpOpen} setHelpOpen={setHelpOpen} align={align} />
  )
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {FLIGHTS.map(f => (
          <button key={f} onClick={() => setFlight(f)}
            className={`px-2 py-1 rounded text-[11px] font-semibold ${flight===f ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{f}</button>
        ))}
      </div>
      <div className="text-[11px] text-slate-400">{fd.label} · {fd.matchCount} season matches</div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter players or schools…"
        className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-sm" />
      <div className="text-[10px] text-slate-500">Tap a column's <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-slate-600 text-[8px]">?</span> for what it means.</div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              {hdr('rank', '#', 'left')}
              {hdr('player', 'Player(s)', 'left')}
              {hdr('school', 'School', 'left')}
              {hdr('rating', 'Rating', 'right')}
              {hdr('sos', 'SOS', 'right')}
              {hdr('matAtFlt', 'M@flt', 'right')}
              {hdr('regSeed', 'Reg seed', 'right')}
            </tr>
          </thead>
          <tbody>
            <HelpRow helpKey={helpOpen} helpDict={FLIGHT_HELP} colSpan={7} />
            {rows.map(r => {
              const swap = r.regularStarter && !r.regularStarter.noData
              return (
                <tr key={r.name + r.schoolId} className={`border-t border-slate-800 ${r.schoolId === HIGHLIGHT ? 'bg-blue-900/30' : ''}`}>
                  <td className="px-1.5 py-1.5 align-top">{r.rank}</td>
                  <td className="px-1.5 py-1.5 align-top">
                    <div>{r.name}</div>
                    {swap && (
                      <div className="text-[10px] text-amber-300 mt-0.5" title="Regular dual-meet starter differs from regional qualifier">
                        ↔ regular: {r.regularStarter.name} ({r.regularStarter.rating}, {r.regularStarter.matches}x {r.regularStarter.record})
                      </div>
                    )}
                  </td>
                  <td className="px-1.5 py-1.5 text-slate-300 align-top">{r.schoolName}</td>
                  <td className="px-1.5 py-1.5 text-right align-top"><RatingCell rating={r.rating} source={r.ratingSource} /></td>
                  <td className="px-1.5 py-1.5 font-mono text-right text-slate-400 align-top">{r.sosRating}</td>
                  <td className="px-1.5 py-1.5 font-mono text-right text-slate-400 align-top">{r.matchCountAtFlight ?? '—'}<span className="text-slate-600">/{r.matchCount ?? 0}</span></td>
                  <td className="px-1.5 py-1.5 font-mono text-right text-slate-400 align-top">{r.regionalSeed ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const FORM_HELP = {
  ourRank: { title: '#', body: "Position within this flight by our recency-weighted Bradley-Terry rating. Default sort is by Δ rank — biggest disagreement with TR first." },
  player: { title: 'Player(s)', body: "Regional qualifier at this flight." },
  school: { title: 'School', body: "Player's school." },
  trRank: { title: 'TR', body: "TennisReporting's ELO rank within this flight. TRPR is a flat-weight ELO across every sanctioned match this season — early-season results carry the same weight as last week's." },
  delta: { title: 'Δ', body: "TR rank minus our rank. Positive (green) = we rank them higher than TR does → they're playing better lately than their season average suggests. Negative (amber) = TR rank is anchored by good early-season results that recent form doesn't support." },
  rating: { title: 'Ratings', body: "Raw numbers: TR's ELO and our Bradley-Terry rating. The scales aren't directly comparable (different baselines and K-factors) — that's why Δ is shown in rank positions, not rating points." },
  l14: { title: 'L14', body: "Wins and losses in the last 14 days of sanctioned matches (through 2026-05-19). Strong corroborating signal: a +5 Δ rank with a 4-0 L14 is a real form spike, not noise." },
}

function FormView({ data, flight, setFlight, liveState }) {
  const [helpOpen, setHelpOpen] = useState(null)
  const fd = data.flights?.[flight]
  if (!fd) return <div className="text-slate-400">No data for {flight}</div>
  const liveFlight = liveState?.flights?.find(f => f.id === flight) || null
  const rows = useMemo(() => {
    const qs = fd.qualifiers || []
    const byOurRating = [...qs].sort((a, b) => b.rating - a.rating)
    const byTr = [...qs].sort((a, b) => (b.elo2026Avg ?? -1) - (a.elo2026Avg ?? -1))
    const ourRk = new Map(byOurRating.map((q, i) => [q.name + q.schoolId, i + 1]))
    const trRk  = new Map(byTr.map((q, i) => [q.name + q.schoolId, i + 1]))
    return qs.map(q => {
      const k = q.name + q.schoolId
      // R1 opponent lookup from live bracket
      let r1 = null
      if (liveFlight) {
        const pos = findEntryPos(liveFlight, q)
        if (pos >= 0) {
          const oppPos = pos ^ 1
          const opp = liveFlight.entries[oppPos]
          if (!opp?.teamId) r1 = { bye: true }
          else r1 = { school: entrySchoolName(opp), name: entryDisplayName(opp) }
        }
      }
      return { ...q, ourRank: ourRk.get(k), trRank: trRk.get(k), deltaRank: trRk.get(k) - ourRk.get(k), r1 }
    }).sort((a, b) => b.deltaRank - a.deltaRank)
  }, [fd, liveFlight])
  const hdr = (key, label, align) => (
    <PlainHeader label={label} helpKey={key} helpOpen={helpOpen} setHelpOpen={setHelpOpen} align={align} />
  )
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {FLIGHTS.map(f => (
          <button key={f} onClick={() => setFlight(f)}
            className={`px-2 py-1 rounded text-[11px] font-semibold ${flight===f ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{f}</button>
        ))}
      </div>
      <div className="text-[11px] text-slate-300 leading-relaxed bg-slate-900/40 border border-slate-700 rounded p-2">
        Comparing TR's flat-weight ELO (the official seeding input) to our 28-day recency-weighted rating.
        Players sorted by <span className="text-emerald-300">biggest positive Δ first</span> — those are
        candidates that recent form rates well above where MHSAA's seeding ranks them.
        Verify with the L14 column: real form spikes have a strong recent W-L.
      </div>
      <div className="text-[10px] text-slate-500">Tap a column's <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-slate-600 text-[8px]">?</span> for what it means.</div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              {hdr('ourRank', '#', 'left')}
              {hdr('player', 'Player', 'left')}
              {hdr('school', 'School', 'left')}
              {hdr('trRank', 'TR rk', 'right')}
              {hdr('delta', 'Δ', 'right')}
              {hdr('rating', 'TR / Us', 'right')}
              {hdr('l14', 'L14', 'right')}
            </tr>
          </thead>
          <tbody>
            <HelpRow helpKey={helpOpen} helpDict={FORM_HELP} colSpan={7} />
            {rows.map(r => {
              const d = r.deltaRank
              const deltaCls = d > 0 ? 'text-emerald-300' : d < 0 ? 'text-amber-300' : 'text-slate-500'
              const l14 = r.recent14 || { w: 0, l: 0 }
              return (
                <tr key={r.name + r.schoolId} className={`border-t border-slate-800 ${r.schoolId === HIGHLIGHT ? 'bg-blue-900/30' : ''}`}>
                  <td className="px-1.5 py-1.5 align-top">{r.ourRank}</td>
                  <td className="px-1.5 py-1.5 align-top">
                    <div>{r.name}</div>
                    {r.r1 && (
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {r.r1.bye ? 'R1 bye' : `R1 vs ${r.r1.school} — ${r.r1.name}`}
                      </div>
                    )}
                  </td>
                  <td className="px-1.5 py-1.5 text-slate-300 align-top">{r.schoolName}</td>
                  <td className="px-1.5 py-1.5 font-mono text-right text-slate-400 align-top">{r.trRank}</td>
                  <td className={`px-1.5 py-1.5 font-mono text-right font-semibold align-top ${deltaCls}`}>{d > 0 ? '+' : ''}{d}</td>
                  <td className="px-1.5 py-1.5 font-mono text-right text-slate-400 align-top">{r.elo2026Avg ?? '—'}<span className="text-slate-600"> / </span><span className="text-slate-200">{r.rating}</span></td>
                  <td className="px-1.5 py-1.5 font-mono text-right text-slate-400 align-top">{l14.w}-{l14.l}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function OpponentInfoCard({ qualifier, ourRating, tint }) {
  const r14 = qualifier.recent14 || { w: 0, l: 0 }
  const winProb = ourRating != null && qualifier.rating != null
    ? 1 / (1 + Math.pow(10, (qualifier.rating - ourRating) / 400)) : null
  const probCls = winProb == null ? 'text-slate-400'
    : winProb >= 0.6 ? 'text-emerald-300'
    : winProb >= 0.4 ? 'text-slate-300'
    : 'text-amber-300'
  const borderCls = tint === 'amber' ? 'border-amber-700/40 bg-amber-900/10'
    : tint === 'emerald' ? 'border-emerald-700/40 bg-emerald-900/10'
    : 'border-slate-700 bg-slate-900/40'
  return (
    <div className={`rounded border ${borderCls} px-2 py-1.5 text-[12px]`}>
      <div className="flex justify-between items-baseline gap-2">
        <span className="font-medium">{qualifier.name}</span>
        <span className={`font-mono font-semibold ${probCls}`}>{pct(winProb)}</span>
      </div>
      <div className="text-[11px] text-slate-400 flex justify-between">
        <span>{qualifier.schoolName}</span>
        <span className="font-mono">rated {qualifier.rating} · L14 {r14.w}-{r14.l}</span>
      </div>
    </div>
  )
}

function ClarkstonView({ data, liveState }) {
  const c = data.clarkston
  if (!c) return null
  return (
    <div className="space-y-3">
      {c.seasonRecord && (
        <div className="rounded-lg border border-blue-700/40 bg-blue-900/20 p-2 text-sm">
          <span className="font-semibold">Clarkston season record:</span>{' '}
          {c.seasonRecord.win}–{c.seasonRecord.loss}–{c.seasonRecord.tie}
        </div>
      )}
      <div className="text-[10px] text-slate-500 leading-relaxed">
        Per-flight: Clarkston's player, status, and the <span className="text-emerald-300">next match</span>{' '}
        with strength/form details on the possible opponent(s).
        When the next opponent isn't decided yet, both R1 candidates are shown side-by-side.
      </div>
      <div className="space-y-2">
        {c.flights.map(f => {
          const fdata = data.flights?.[f.flight]
          const ours = fdata?.qualifiers?.find(q => q.schoolId === HIGHLIGHT)
          const noLineup = ours?.regularStarter?.noData
          const liveFlight = liveState?.flights?.find(fl => fl.id === f.flight) || null

          let live = null
          if (liveFlight && ours) {
            const ourPos = findEntryPos(liveFlight, ours)
            if (ourPos >= 0) {
              const standing = entryStanding(liveFlight, ourPos)
              const next = nextMatchFor(liveFlight, ourPos)
              const ratingMap = buildRatingMap(fdata?.qualifiers)
              // Hydrate each opponent entry with its sos.json qualifier (rating, L14, etc.)
              const opponents = (next?.opponents || []).map(({ pos, entry }) => ({
                pos, entry, qualifier: lookupQualifier(ratingMap, entry),
              })).filter(o => o.qualifier)
              live = { ourPos, standing, next, opponents }
            }
          }

          return (
          <div key={f.flight} className="rounded-lg border border-slate-700 bg-slate-900/40 p-2">
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-semibold">{f.flightLabel} · {f.flight}</div>
              {f.ours ? (
                <div className="text-[11px] text-slate-300">
                  {f.ours.name} · rated {f.ours.rating} · rank {f.stateRank}/{f.fieldSize}
                  {live?.standing && (
                    live.standing.eliminated
                      ? <span className="ml-1 text-red-400">· eliminated</span>
                      : <span className="ml-1 text-emerald-400">· {live.standing.wins}W</span>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 italic">no Clarkston qualifier</div>
              )}
            </div>

            {/* Eliminated */}
            {live?.next?.state === 'eliminated' && live.next.eliminatedBy && (
              <div className="mt-1 text-[11px] bg-red-900/20 border border-red-700/40 rounded px-2 py-1">
                <span className="text-red-300 font-semibold">Eliminated</span> ({ROUND_LABEL[live.next.round]}) by{' '}
                {entryDisplayName(live.next.eliminatedBy)} <span className="text-slate-400">({entrySchoolName(live.next.eliminatedBy)})</span>
              </div>
            )}

            {/* Champion */}
            {live?.next?.state === 'champion' && (
              <div className="mt-1 text-[11px] bg-emerald-900/20 border border-emerald-700/40 rounded px-2 py-1">
                <span className="text-emerald-300 font-semibold">🏆 Champion</span>
              </div>
            )}

            {/* True R1 bye */}
            {live?.next?.state === 'r1-bye' && (
              <div className="mt-1 text-[11px] bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-slate-300">
                <span className="font-semibold">Next:</span> R1 bye → advances to Round 2
              </div>
            )}

            {/* Known single opponent */}
            {live?.next?.state === 'known' && live.opponents.length === 1 && (
              <div className="mt-2">
                <div className="text-[11px] text-blue-300 font-semibold mb-1">
                  Next ({ROUND_LABEL[live.next.round]}): vs {live.opponents[0].qualifier.name}{' '}
                  <span className="text-slate-400 font-normal">({live.opponents[0].qualifier.schoolName})</span>
                </div>
                <OpponentInfoCard qualifier={live.opponents[0].qualifier} ourRating={f.ours?.rating} tint={null} />
              </div>
            )}

            {/* Pending — 2 or more possible opponents */}
            {live?.next?.state === 'pending' && live.opponents.length >= 1 && (() => {
              // Sort by rating desc so harder=first, easier=last. Tint extremes when exactly 2 opponents.
              const sorted = [...live.opponents].sort((a, b) =>
                (b.qualifier.rating ?? 0) - (a.qualifier.rating ?? 0))
              const useTint = sorted.length === 2
              return (
                <div className="mt-2">
                  <div className="text-[11px] text-blue-300 font-semibold mb-1">
                    Next ({ROUND_LABEL[live.next.round]}): Winner of{' '}
                    {sorted.map((o, i) => (
                      <span key={i}>
                        {i > 0 && <span className="text-slate-400 font-normal"> vs </span>}
                        <span className="font-normal">{o.qualifier.name}</span>
                      </span>
                    ))}
                  </div>
                  <div className={`grid grid-cols-1 ${sorted.length === 1 ? 'md:grid-cols-1' : 'md:grid-cols-2'} gap-2`}>
                    {sorted.map((o, i) => (
                      <OpponentInfoCard
                        key={i}
                        qualifier={o.qualifier}
                        ourRating={f.ours?.rating}
                        tint={useTint ? (i === 0 ? 'amber' : 'emerald') : null}
                      />
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Pending but couldn't hydrate any qualifier (data gap) */}
            {live?.next?.state === 'pending' && live.opponents.length === 0 && (
              <div className="mt-1 text-[11px] bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-slate-400">
                <span className="font-semibold">Next ({ROUND_LABEL[live.next.round]}):</span> opponent TBD
              </div>
            )}

            {noLineup && (
              <div className="mt-1 text-[11px] bg-slate-900/40 border border-slate-700 rounded px-2 py-1 text-slate-400">
                No dual-meet matches at {f.flight} for this entry — they may be a JV call-up or only played postseason. The rating shown is a fallback (TennisReporting's 2026 Elo) and should be treated as low-confidence.
              </div>
            )}
          </div>
        )})}
      </div>

      {(c.bestWins?.length || c.worstLosses?.length) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase text-emerald-400 font-semibold mb-1">Best wins (vs opponent rating)</div>
            <div className="rounded-lg border border-emerald-900/40 bg-emerald-900/10 p-2 text-[12px] space-y-1">
              {(c.bestWins || []).map((w, i) => (
                <div key={i} className="border-t border-slate-800 first:border-t-0 pt-1 first:pt-0">
                  <div>{w.ours} beat <span className="font-semibold">{w.opp}</span></div>
                  <div className="text-slate-400 text-[11px]">{w.flight} · {w.oppSchool} · rated {Math.round(w.oppRating)} · {w.date?.slice(0,10)}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-red-400 font-semibold mb-1">Worst losses</div>
            <div className="rounded-lg border border-red-900/40 bg-red-900/10 p-2 text-[12px] space-y-1">
              {(c.worstLosses || []).map((l, i) => (
                <div key={i} className="border-t border-slate-800 first:border-t-0 pt-1 first:pt-0">
                  <div>{l.ours} lost to <span className="font-semibold">{l.opp}</span></div>
                  <div className="text-slate-400 text-[11px]">{l.flight} · {l.oppSchool} · rated {Math.round(l.oppRating)} · {l.date?.slice(0,10)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const LINEUP_HELP = {
  flt: { title: 'Flt', body: "State-finals flight (1S–4D). Each row is a school + flight where the regional qualifier isn't the regular dual-meet starter." },
  school: { title: 'School', body: "The school with a possible lineup question." },
  qual: { title: 'Regional qualifier', body: "Player(s) who actually qualified at this flight through their regional. MHSAA expects them to play at state finals unless a substitution is approved." },
  qualRating: { title: 'Qual rating', body: "Bradley-Terry rating of the regional qualifier." },
  regular: { title: 'Regular starter', body: "The school's most-frequent dual-meet starter at this flight during the season (with their record). When this differs from the regional qualifier, you're looking at a potential approved sub or a regional-day lineup quirk." },
  regRating: { title: 'Reg rating', body: "Bradley-Terry rating of the regular starter." },
  delta: { title: 'Δ', body: "Reg rating minus Qual rating. Green/positive = the regular starter is stronger than the qualifier, so a sub would make this team's flight tougher. Amber/negative = the regional qualifier is actually the stronger player." },
}

function LineupWatchView({ data }) {
  const [helpOpen, setHelpOpen] = useState(null)
  const mismatches = []
  for (const fid of Object.keys(data.flights || {})) {
    for (const q of data.flights[fid].qualifiers) {
      if (q.regularStarter && !q.regularStarter.noData) {
        mismatches.push({ flight: fid, ...q })
      }
    }
  }
  mismatches.sort((a, b) => {
    // Biggest swap by rating delta first.
    const dA = Math.abs((a.regularStarter.rating ?? 0) - a.rating)
    const dB = Math.abs((b.regularStarter.rating ?? 0) - b.rating)
    return dB - dA
  })
  const hdr = (key, label, align) => (
    <PlainHeader label={label} helpKey={key} helpOpen={helpOpen} setHelpOpen={setHelpOpen} align={align} />
  )
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-slate-300 leading-relaxed bg-slate-900/40 border border-slate-700 rounded p-2">
        Players who qualified through regionals but aren't their team's regular dual-meet starter at that flight.
        These are <span className="text-amber-300">candidates for approved subs</span> — the regional entry will
        play state finals unless MHSAA grants a substitution. <span className="text-emerald-300">The "regular" rating
        shows what the field would look like if this team fielded its normal lineup.</span> When the seeded draw is
        posted (~ May 25) these should reconcile.
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-slate-400">{mismatches.length} mismatches found in flights with sufficient dual-meet data.</div>
        <div className="text-[10px] text-slate-500">Tap a column's <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-slate-600 text-[8px]">?</span> for details.</div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              {hdr('flt', 'Flt', 'left')}
              {hdr('school', 'School', 'left')}
              {hdr('qual', 'Regional qualifier', 'left')}
              {hdr('qualRating', 'Qual rating', 'right')}
              {hdr('regular', 'Regular starter', 'left')}
              {hdr('regRating', 'Reg rating', 'right')}
              {hdr('delta', 'Δ', 'right')}
            </tr>
          </thead>
          <tbody>
            <HelpRow helpKey={helpOpen} helpDict={LINEUP_HELP} colSpan={7} />
            {mismatches.map((m, i) => {
              const delta = (m.regularStarter.rating ?? 0) - m.rating
              return (
                <tr key={i} className={`border-t border-slate-800 ${m.schoolId === HIGHLIGHT ? 'bg-blue-900/30' : ''}`}>
                  <td className="px-1.5 py-1.5 font-mono">{m.flight}</td>
                  <td className="px-1.5 py-1.5">{m.schoolName}</td>
                  <td className="px-1.5 py-1.5">{m.name}</td>
                  <td className="px-1.5 py-1.5 font-mono text-right">{m.rating}</td>
                  <td className="px-1.5 py-1.5 text-emerald-200">
                    {m.regularStarter.name}
                    <span className="text-slate-500 text-[11px]"> · {m.regularStarter.matches}x {m.regularStarter.record}</span>
                  </td>
                  <td className="px-1.5 py-1.5 font-mono text-right text-emerald-200">{m.regularStarter.rating}</td>
                  <td className={`px-1.5 py-1.5 font-mono text-right ${delta > 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {delta > 0 ? '+' : ''}{delta}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Tag each upset row with the Clarkston matchup context from live bracket, if any.
// Looks up Clarkston's position in this flight, walks forward, and returns the
// round where Clarkston meets this upset candidate (if they meet at all).
function clarkstonMatchInfo(liveState, fid, candidate) {
  const flight = liveState?.flights?.find(f => f.id === fid)
  if (!flight) return null
  // Find Clarkston entry
  const cPos = flight.entries.findIndex(e => e?.teamId === 'clarkston')
  if (cPos < 0) return null
  // Find candidate entry by name + school slug
  const candSlug = teamIdForSchool(candidate.schoolName)
  const candFirst = candidate.name.split(' / ')[0].trim()
  const candPos = flight.entries.findIndex(e =>
    e?.teamId === candSlug && (e.name === candFirst || !candFirst))
  if (candPos < 0) return null
  if (candPos === cPos) return null  // candidate IS Clarkston

  const cStanding = entryStanding(flight, cPos)
  const candStanding = entryStanding(flight, candPos)

  // The round in which they can first meet: determined by how their bracket
  // sub-trees intersect. Pair size doubles each round: R1=2, R2=4, R3=8, SF=16, F=32.
  // They meet in the smallest round whose pair contains both positions.
  const ROUNDS = ['R1', 'R2', 'R3', 'SF', 'F']
  const PAIR_SIZE = [2, 4, 8, 16, 32]
  let meetRound = null
  for (let i = 0; i < PAIR_SIZE.length; i++) {
    const sz = PAIR_SIZE[i]
    if (Math.floor(cPos / sz) === Math.floor(candPos / sz)) { meetRound = ROUNDS[i]; break }
  }
  return {
    meetRound,
    bothAlive: !cStanding.eliminated && !candStanding.eliminated,
    candAlive: !candStanding.eliminated,
    cAlive: !cStanding.eliminated,
  }
}

function UpsetsView({ data, liveState }) {
  const u = data.upsetWatch || { underseeded: [], overseeded: [] }

  // Annotate each row with Clarkston-meet info; surface those to the top.
  function annotate(rows) {
    return rows.map(r => ({ ...r, _clark: clarkstonMatchInfo(liveState, r.flight, r) }))
      .sort((a, b) => {
        // Live Clarkston matchups first, then by relevance
        const aClark = a._clark?.bothAlive ? 0 : (a._clark ? 1 : 2)
        const bClark = b._clark?.bothAlive ? 0 : (b._clark ? 1 : 2)
        return aClark - bClark
      })
  }
  const under = annotate(u.underseeded)
  const over  = annotate(u.overseeded)

  return (
    <div className="space-y-3">
      {liveState && (
        <div className="text-[10px] text-slate-500 leading-relaxed">
          Rows with a Clarkston matchup tag bubble to the top of each list.
          The tag shows the earliest round in which Clarkston could meet that entry.
        </div>
      )}
      <Section title="Underseeded — high BT rating despite mediocre regional seed" tone="emerald">
        {under.length === 0 ? <Empty /> : under.map((r, i) => (
          <UpsetRow key={i} r={r} dir="up" />
        ))}
      </Section>
      <Section title="Overseeded — top regional seed but bottom-of-field BT rating" tone="amber">
        {over.length === 0 ? <Empty /> : over.map((r, i) => (
          <UpsetRow key={i} r={r} dir="down" />
        ))}
      </Section>
    </div>
  )
}
function Section({ title, tone, children }) {
  const cls = tone === 'emerald' ? 'border-emerald-900/40 bg-emerald-900/10' : 'border-amber-900/40 bg-amber-900/10'
  return (
    <div className={`rounded-lg border ${cls} p-2`}>
      <div className="text-[10px] uppercase font-semibold mb-1">{title}</div>
      <div className="space-y-1 text-[12px]">{children}</div>
    </div>
  )
}
function Empty() { return <div className="text-slate-500 italic text-center py-2">No candidates fit the threshold.</div> }
function UpsetRow({ r, dir }) {
  const clark = r._clark
  return (
    <div className="border-t border-slate-800 first:border-t-0 pt-1 first:pt-0">
      <div className="flex justify-between gap-2">
        <div>
          <span className="font-mono mr-1">{r.flight}</span>
          {r.name} <span className="text-slate-400">({r.schoolName})</span>
        </div>
        <div className="text-slate-400">
          rated <span className="text-white font-mono">{Math.round(r.rating)}</span> · state rank #{r.stateRank} · seed {r.regSeed}
        </div>
      </div>
      {clark && (
        <div className="text-[10px] mt-0.5">
          {!clark.candAlive && <span className="text-slate-500">Eliminated · no longer a Clarkston concern.</span>}
          {clark.candAlive && !clark.cAlive && <span className="text-slate-500">Clarkston already out at this flight.</span>}
          {clark.bothAlive && clark.meetRound === 'R1' && (
            <span className="text-blue-300 font-semibold">⚔ Clarkston R1 opponent — direct first-round match.</span>
          )}
          {clark.bothAlive && clark.meetRound !== 'R1' && (
            <span className="text-blue-300">
              ⚔ Could meet Clarkston in <span className="font-semibold">{ROUND_LABEL[clark.meetRound]}</span> if both advance.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
