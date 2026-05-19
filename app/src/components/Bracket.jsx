import { describeMatches, setWinner, ROUND_DEFS } from '../lib/bracket.js'
import { TEAM_BY_ID, HIGHLIGHT_TEAM } from '../data/teams.js'

function SideLabel({ entry, empty, highlight }) {
  if (empty) return <span className="text-slate-500 italic">BYE</span>
  if (!entry) return <span className="text-slate-500 italic">TBD</span>
  const team = entry.teamId ? TEAM_BY_ID[entry.teamId] : null
  const personLabel = entry.name
    ? (entry.partner ? `${entry.name} / ${entry.partner}` : entry.name)
    : null
  return (
    <span className="flex items-center gap-2 min-w-0">
      {team && (
        <span className="inline-block w-2 h-6 rounded-sm flex-shrink-0" style={{ background: team.color }} />
      )}
      <span className="flex-1 min-w-0">
        <div className={['text-[13px] leading-tight break-words', highlight ? 'font-bold' : ''].join(' ')}>
          {entry.seed != null && <span className="text-slate-400 mr-1">({entry.seed})</span>}
          {personLabel || team?.name || '—'}
        </div>
        {team && personLabel && (
          <div className="text-[10px] text-slate-400 leading-tight">{team.name}</div>
        )}
      </span>
    </span>
  )
}

function MatchCard({ match, score, onPick, readonly }) {
  // Skip rendering matches that have no real entries on either side (deep byes).
  if (match.topEmpty && match.botEmpty) {
    return (
      <div className="rounded-lg border border-dashed border-slate-800 px-2 py-3 text-[11px] italic text-slate-600">
        empty
      </div>
    )
  }

  const sides = ['top', 'bot'].map(side => {
    const entry = side === 'top' ? match.topEntry : match.botEntry
    const empty = side === 'top' ? match.topEmpty : match.botEmpty
    const winner = match.winner === side
    const loser = match.winner && match.winner !== side
    return { side, entry, empty, winner, loser }
  })

  const clickable = !readonly && !match.isBye
  const isHi = (e) => e?.teamId === HIGHLIGHT_TEAM

  return (
    <div className={['rounded-lg border bg-slate-900/60 overflow-hidden',
      match.isBye ? 'border-slate-800' : 'border-slate-700'].join(' ')}>
      {sides.map(s => (
        <button
          key={s.side}
          disabled={!clickable || s.empty}
          onClick={() => clickable && onPick(match.id, match.winner === s.side ? null : s.side)}
          className={[
            'w-full text-left px-2 py-2 flex items-center gap-2 border-t border-slate-800 first:border-t-0',
            s.winner ? 'bg-emerald-700/40' : '',
            s.loser ? 'opacity-40 line-through' : '',
            clickable && !s.empty ? 'active:bg-slate-700' : '',
          ].join(' ')}
        >
          <SideLabel entry={s.entry} empty={s.empty} highlight={isHi(s.entry)} />
        </button>
      ))}
      {score && (
        <div className="px-2 py-1 text-[10px] text-slate-400 font-mono text-center border-t border-slate-800 bg-slate-950/40">
          {score}
        </div>
      )}
    </div>
  )
}

function byRound(matches) {
  const out = Object.fromEntries(ROUND_DEFS.map(r => [r.id, []]))
  for (const m of matches) out[m.round].push(m)
  return out
}

export default function Bracket({ flight, onUpdate, readonly }) {
  const matches = describeMatches(flight)
  const cols = byRound(matches)
  const pick = (id, side) => onUpdate && onUpdate(setWinner(flight, id, side))
  return (
    <div className="flex gap-2 overflow-x-auto pb-3">
      {ROUND_DEFS.map(r => {
        const colMatches = cols[r.id]
        const hasReal = colMatches.some(m => !(m.topEmpty && m.botEmpty))
        if (!hasReal) return null
        return (
          <div key={r.id} className="min-w-[200px] flex-1 flex flex-col gap-3 justify-around">
            <div className="text-xs uppercase text-slate-400 font-semibold">{r.label}</div>
            {colMatches.map(m => <MatchCard key={m.id} match={m} score={flight.scores?.[m.id]} onPick={pick} readonly={readonly} />)}
          </div>
        )
      })}
    </div>
  )
}
