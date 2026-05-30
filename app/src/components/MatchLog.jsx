import { useMemo } from 'react'
import { describeMatches } from '../lib/bracket.js'
import { TEAM_BY_ID, FLIGHTS } from '../data/teams.js'

const FLIGHT_LABEL = Object.fromEntries(FLIGHTS.map(f => [f.id, f.id]))

function entryLabel(entry) {
  if (!entry?.teamId) return null
  const team = TEAM_BY_ID[entry.teamId]
  const player = entry.name?.trim()
    ? (entry.partner?.trim() ? `${entry.name} / ${entry.partner}` : entry.name)
    : null
  const school = team?.name || entry.teamId
  return { player, school, color: team?.color, teamId: entry.teamId }
}

function formatScore(score) {
  if (!score) return null
  const sets = Array.isArray(score) ? score : [score]
  return sets.map(s => String(s).replace(/\s*-\s*/g, '-')).join(', ')
}

function formatTimestamp(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return time
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

// Build the log: walk every flight, every decided match, project the winner +
// loser entries + score + timestamp. Skip auto-byes (bracket already filters
// them — describeMatches returns isBye for those and they won't have an
// explicit `winner` value from a user pick).
export default function MatchLog({ flights }) {
  const rows = useMemo(() => {
    const out = []
    for (const f of flights) {
      const matches = describeMatches(f)
      for (const m of matches) {
        if (!m.winner) continue
        if (m.isBye) continue
        if (m.topEmpty || m.botEmpty) continue
        const winnerEntry = m.winner === 'top' ? m.topEntry : m.botEntry
        const loserEntry = m.winner === 'top' ? m.botEntry : m.topEntry
        const w = entryLabel(winnerEntry)
        const l = entryLabel(loserEntry)
        if (!w || !l) continue
        out.push({
          key: `${f.id}-${m.id}`,
          flightId: f.id,
          matchId: m.id,
          round: m.round,
          winner: w,
          loser: l,
          score: f.scores?.[m.id],
          at: f.decidedAt?.[m.id] || null,
        })
      }
    }
    // Newest first; rows without a timestamp sort to the bottom (older,
    // imported before per-match timestamps existed).
    out.sort((a, b) => {
      if (!a.at && !b.at) return 0
      if (!a.at) return 1
      if (!b.at) return -1
      return b.at.localeCompare(a.at)
    })
    return out
  }, [flights])

  if (rows.length === 0) {
    return (
      <div className="text-[11px] text-slate-500 italic text-center py-3">
        No match results yet.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Match log
        </div>
        <div className="text-[10px] text-slate-500">{rows.length} match{rows.length === 1 ? '' : 'es'}</div>
      </div>
      <ul className="divide-y divide-slate-800">
        {rows.map(r => (
          <li key={r.key} className="px-3 py-2 flex items-start gap-2 text-[12px]">
            <span className="font-mono text-slate-500 text-[10px] pt-0.5 w-12 flex-shrink-0">
              {FLIGHT_LABEL[r.flightId] || r.flightId} {r.round}
            </span>
            <span className="font-mono text-[10px] text-slate-500 flex-shrink-0 pt-0.5 whitespace-nowrap min-w-[3.5rem]" title={r.at || 'no timestamp'}>
              {formatTimestamp(r.at) || '—'}
            </span>
            <span className="flex-1 min-w-0 leading-snug">
              <span className="inline-flex items-center gap-1.5">
                {r.winner.color && (
                  <span className="inline-block w-1.5 h-3 rounded-sm flex-shrink-0" style={{ background: r.winner.color }} />
                )}
                <span className="font-semibold text-slate-100">
                  {r.winner.player || r.winner.school}
                </span>
                {r.winner.player && <span className="text-slate-400 text-[10px]">({r.winner.school})</span>}
              </span>
              <span className="text-slate-500 mx-1">def.</span>
              <span className="inline-flex items-center gap-1.5">
                {r.loser.color && (
                  <span className="inline-block w-1.5 h-3 rounded-sm flex-shrink-0 opacity-50" style={{ background: r.loser.color }} />
                )}
                <span className="text-slate-300">
                  {r.loser.player || r.loser.school}
                </span>
                {r.loser.player && <span className="text-slate-500 text-[10px]">({r.loser.school})</span>}
              </span>
              {r.score && (
                <span className="ml-1.5 font-mono text-slate-400">{formatScore(r.score)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
