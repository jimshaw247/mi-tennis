// Orphan calibration page: compares pre-match Bradley-Terry odds to actual
// results. Not linked from anywhere in the app. Reach it at /upsets.
//
// Data sources:
//   - sos.json: per-flight qualifier ratings (D1 only — SOS isn't built for
//     D2/D3/D4 yet).
//   - tennis_state row 1: live D1 bracket with winners + scores.
//
// Per match: find both sides via describeMatches, look up each player's
// rating, compute the pre-match P(side that actually won), classify as
// upset if that probability was < 0.5. Brier-style accuracy on the side.
import { useEffect, useMemo, useState } from 'react'
import { describeMatches, ROUND_DEFS } from './lib/bracket.js'
import { pullState, subscribeState, supabaseConfigured } from './lib/sync.js'
import { TEAM_BY_ID } from './data/teams.js'

const ROUND_LABEL = Object.fromEntries(ROUND_DEFS.map(r => [r.id, r.label]))
const ROUND_ORDER = Object.fromEntries(ROUND_DEFS.map((r, i) => [r.id, i]))

function teamIdForSchool(schoolName) {
  return (schoolName || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_')
}

function buildRatingMap(qualifiers) {
  const map = new Map()
  for (const q of (qualifiers || [])) {
    const slug = teamIdForSchool(q.schoolName)
    const names = (q.name || '').split(' / ').map(s => s.trim()).filter(Boolean)
    for (const n of names) map.set(`${slug}|${n}`, q)
  }
  return map
}

function lookupRating(map, entry) {
  if (!entry?.teamId || !entry.name) return null
  const q = map.get(`${entry.teamId}|${entry.name}`)
    || (entry.partner ? map.get(`${entry.teamId}|${entry.partner}`) : null)
  return q?.rating ?? null
}

function entryLabel(entry) {
  if (!entry?.teamId) return '—'
  return entry.partner ? `${entry.name} / ${entry.partner}` : entry.name
}

function schoolShort(entry) {
  if (!entry?.teamId) return ''
  return TEAM_BY_ID[entry.teamId]?.short || TEAM_BY_ID[entry.teamId]?.name || entry.teamId
}

function formatScore(score) {
  if (!score) return ''
  const sets = Array.isArray(score) ? score : [score]
  return sets.map(s => String(s).replace(/\s*-\s*/g, '-')).join(', ')
}

// Bradley-Terry / Elo: P(A beats B) = 1 / (1 + 10^((rB - rA) / 400))
function winProb(rA, rB) {
  if (rA == null || rB == null) return null
  return 1 / (1 + Math.pow(10, (rB - rA) / 400))
}

function pct(p) { return p == null ? '—' : `${(p * 100).toFixed(0)}%` }

function buildRows(state, sosData) {
  if (!state?.flights || !sosData?.flights) return []
  const rows = []
  for (const flight of state.flights) {
    const fdata = sosData.flights[flight.id]
    if (!fdata) continue
    const ratingMap = buildRatingMap(fdata.qualifiers)
    const matches = describeMatches(flight)
    for (const m of matches) {
      // Only decided matches with both sides real and a user-/scrape-picked
      // winner. Auto-byes (m.isBye) don't count — no information.
      if (!m.winner || m.isBye) continue
      if (m.topEmpty || m.botEmpty) continue
      const winSide = m.winner
      const winEntry = winSide === 'top' ? m.topEntry : m.botEntry
      const lossEntry = winSide === 'top' ? m.botEntry : m.topEntry
      if (!winEntry?.teamId || !lossEntry?.teamId) continue
      const wRating = lookupRating(ratingMap, winEntry)
      const lRating = lookupRating(ratingMap, lossEntry)
      const pWinner = winProb(wRating, lRating)
      rows.push({
        key: `${flight.id}-${m.id}`,
        flight: flight.id,
        round: m.round,
        roundOrder: ROUND_ORDER[m.round] ?? 99,
        winEntry,
        lossEntry,
        wRating,
        lRating,
        pWinner,
        upset: pWinner != null ? pWinner < 0.5 : null,
        magnitude: pWinner != null ? 1 - pWinner : null,
        score: flight.scores?.[m.id],
        decidedAt: flight.decidedAt?.[m.id] || null,
      })
    }
  }
  return rows
}

function summarize(rows) {
  const rated = rows.filter(r => r.pWinner != null)
  const upsets = rated.filter(r => r.upset)
  // Brier score: mean( (1 - P(actual winner))^2 ). 0 = perfect, 0.25 = random.
  const brier = rated.length
    ? rated.reduce((s, r) => s + Math.pow(1 - r.pWinner, 2), 0) / rated.length
    : null
  // Average confidence on correct picks
  const avgPCorrect = rated.length
    ? rated.reduce((s, r) => s + r.pWinner, 0) / rated.length
    : null
  return {
    total: rows.length,
    rated: rated.length,
    upsets: upsets.length,
    upsetRate: rated.length ? upsets.length / rated.length : null,
    brier,
    avgPCorrect,
  }
}

export default function Upsets() {
  const [state, setState] = useState(null)
  const [sos, setSos] = useState(null)
  const [err, setErr] = useState(null)
  const [sortMode, setSortMode] = useState('biggestUpset')

  useEffect(() => {
    fetch('/sos.json').then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setSos).catch(e => setErr(`sos.json: ${e}`))
  }, [])

  useEffect(() => {
    if (!supabaseConfigured) { setErr('Supabase not configured'); return }
    let alive = true
    pullState(1).then(res => { if (alive) setState(res?.state || null) })
    const unsub = subscribeState(1, ({ state: next }) => { setState(next) })
    return () => { alive = false; unsub() }
  }, [])

  const rows = useMemo(() => buildRows(state, sos), [state, sos])
  const sortedRows = useMemo(() => {
    const r = [...rows]
    if (sortMode === 'biggestUpset') {
      // Upsets first (descending magnitude), then chalk descending P(winner)
      r.sort((a, b) => {
        if (a.upset && !b.upset) return -1
        if (!a.upset && b.upset) return 1
        if (a.upset && b.upset) return (b.magnitude ?? 0) - (a.magnitude ?? 0)
        return (a.pWinner ?? 1) - (b.pWinner ?? 1)
      })
    } else if (sortMode === 'chrono') {
      r.sort((a, b) => {
        if (!a.decidedAt && !b.decidedAt) return 0
        if (!a.decidedAt) return 1
        if (!b.decidedAt) return -1
        return b.decidedAt.localeCompare(a.decidedAt)
      })
    } else if (sortMode === 'bracket') {
      r.sort((a, b) => a.flight.localeCompare(b.flight) || a.roundOrder - b.roundOrder)
    }
    return r
  }, [rows, sortMode])

  const stats = useMemo(() => summarize(rows), [rows])

  if (err) return <div className="p-4 text-sm text-red-300">Error: {err}</div>
  if (!state || !sos) return <div className="p-4 text-sm text-slate-400">Loading…</div>

  return (
    <div className="min-h-full p-3 max-w-5xl mx-auto space-y-3">
      <header className="border-b border-slate-800 pb-2">
        <div className="text-lg font-bold">D1 model calibration</div>
        <div className="text-xs text-slate-400">
          Pre-match Bradley-Terry win probability vs actual result. Decided matches only.
          Auto-byes excluded. Not linked from the app — orphan page.
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[12px]">
        <Stat label="Decided" value={stats.total} />
        <Stat label="Rated" value={stats.rated} sub="both sides have ratings" />
        <Stat label="Upsets" value={stats.upsets} sub={stats.upsetRate != null ? pct(stats.upsetRate) : null} tone={stats.upsets > 0 ? 'amber' : null} />
        <Stat label="Avg P(winner)" value={pct(stats.avgPCorrect)} sub="0.5 = coin flip" />
        <Stat label="Brier" value={stats.brier != null ? stats.brier.toFixed(3) : '—'} sub="0 = perfect, 0.25 = random" />
      </div>

      <div className="flex gap-2 text-xs">
        <SortBtn current={sortMode} val="biggestUpset" set={setSortMode}>Biggest upsets first</SortBtn>
        <SortBtn current={sortMode} val="chrono" set={setSortMode}>Most recent first</SortBtn>
        <SortBtn current={sortMode} val="bracket" set={setSortMode}>Bracket order</SortBtn>
      </div>

      <div className="overflow-x-auto rounded border border-slate-800">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider">
            <tr>
              <th className="px-2 py-1.5 text-left">Flight · Round</th>
              <th className="px-2 py-1.5 text-left">Winner (rating)</th>
              <th className="px-2 py-1.5 text-left">Loser (rating)</th>
              <th className="px-2 py-1.5 text-right">P(winner) pre</th>
              <th className="px-2 py-1.5 text-left">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {sortedRows.length === 0 && (
              <tr><td colSpan="5" className="px-2 py-4 text-center text-slate-500 italic">No decided matches yet.</td></tr>
            )}
            {sortedRows.map(r => (
              <tr key={r.key} className={r.upset ? 'bg-amber-900/15' : ''}>
                <td className="px-2 py-1.5 font-mono text-slate-400 whitespace-nowrap">
                  {r.flight} · {r.round}
                </td>
                <td className="px-2 py-1.5">
                  <div className="text-slate-100 font-semibold">{entryLabel(r.winEntry)}</div>
                  <div className="text-[10px] text-slate-400">{schoolShort(r.winEntry)} · {r.wRating != null ? Math.round(r.wRating) : 'no rating'}</div>
                </td>
                <td className="px-2 py-1.5">
                  <div className="text-slate-300">{entryLabel(r.lossEntry)}</div>
                  <div className="text-[10px] text-slate-500">{schoolShort(r.lossEntry)} · {r.lRating != null ? Math.round(r.lRating) : 'no rating'}</div>
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {r.pWinner == null ? <span className="text-slate-500">—</span> : (
                    <span className={r.upset ? 'text-amber-300 font-semibold' : 'text-slate-300'}>
                      {pct(r.pWinner)}
                    </span>
                  )}
                  {r.upset && <span className="ml-1 text-[9px] text-amber-400">UPSET</span>}
                </td>
                <td className="px-2 py-1.5 font-mono text-slate-400">{formatScore(r.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-slate-500 leading-relaxed">
        Bradley-Terry win probability: <code>1 / (1 + 10^((rL - rW) / 400))</code>.
        Upset = P(winner) was &lt; 50% before the match. Brier score is the mean squared error
        of P(winner)=1 against the model's prediction; a perfect oracle scores 0,
        a coin-flip-on-everything scores 0.25.
      </div>
    </div>
  )
}

function Stat({ label, value, sub, tone }) {
  const toneCls = tone === 'amber' ? 'border-amber-700/60 bg-amber-900/20' : 'border-slate-800 bg-slate-900/40'
  return (
    <div className={`rounded border ${toneCls} px-2 py-1.5`}>
      <div className="text-[10px] uppercase text-slate-400 tracking-wider">{label}</div>
      <div className="text-base font-bold text-slate-100 leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  )
}

function SortBtn({ current, val, set, children }) {
  const active = current === val
  return (
    <button
      onClick={() => set(val)}
      className={`px-2 py-1 rounded border ${active ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}
    >{children}</button>
  )
}
