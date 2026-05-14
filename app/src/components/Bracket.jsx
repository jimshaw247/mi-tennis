import { describeMatches, setWinner } from '../lib/bracket.js'
import { TEAM_BY_ID, HIGHLIGHT_TEAM } from '../data/teams.js'

function MatchCard({ match, onPick, readonly }) {
  const sides = ['top', 'bot'].map(side => {
    const entry = side === 'top' ? match.topEntry : match.botEntry
    const team = entry?.teamId ? TEAM_BY_ID[entry.teamId] : null
    const winner = match.winner === side
    const loser = match.winner && match.winner !== side
    const empty = !entry
    return { side, entry, team, winner, loser, empty }
  })
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 overflow-hidden">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 px-2 pt-1">{match.label}</div>
      {sides.map(s => (
        <button
          key={s.side}
          disabled={s.empty || !match.ready || readonly}
          onClick={() => !readonly && onPick(match.id, match.winner === s.side ? null : s.side)}
          className={[
            'w-full text-left px-2 py-2 flex items-center gap-2 border-t border-slate-800',
            s.winner ? 'bg-emerald-700/40' : '',
            s.loser ? 'opacity-40 line-through' : '',
            !s.empty && match.ready && !readonly ? 'active:bg-slate-700' : '',
            s.empty ? 'text-slate-500 italic' : '',
          ].join(' ')}
        >
          {s.team && (
            <span
              className="inline-block w-2 h-6 rounded-sm flex-shrink-0"
              style={{ background: s.team.color }}
            />
          )}
          <span className="flex-1 min-w-0">
            <div className={[
              'text-[13px] leading-tight break-words',
              s.team?.id === HIGHLIGHT_TEAM ? 'font-bold' : '',
            ].join(' ')}>
              {s.entry?.seed != null && <span className="text-slate-400 mr-1">({s.entry.seed})</span>}
              {s.entry?.name || (s.team?.name) || (s.empty ? 'TBD' : '—')}
            </div>
            {s.team && s.entry?.name && (
              <div className="text-[10px] text-slate-400 leading-tight">{s.team.name}</div>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}

// Group matches by round for a column-per-round layout.
function byRound(matches) {
  const cols = { P: [], Q: [], S: [], F: [] }
  for (const m of matches) cols[m.round].push(m)
  return cols
}

export default function Bracket({ flight, onUpdate, readonly }) {
  const matches = describeMatches(flight)
  const cols = byRound(matches)
  const pick = (id, side) => onUpdate && onUpdate(setWinner(flight, id, side))
  return (
    <div className="flex gap-2 overflow-x-auto pb-3">
      {cols.P.length > 0 && (
        <div className="min-w-[200px] flex-1 flex flex-col gap-3 justify-around">
          <div className="text-xs uppercase text-slate-400 font-semibold">Play-in</div>
          {cols.P.map(m => <MatchCard key={m.id} match={m} onPick={pick} readonly={readonly} />)}
        </div>
      )}
      <div className="min-w-[200px] flex-1 flex flex-col gap-3 justify-around">
        <div className="text-xs uppercase text-slate-400 font-semibold">Quarterfinals</div>
        {cols.Q.map(m => <MatchCard key={m.id} match={m} onPick={pick} readonly={readonly} />)}
      </div>
      <div className="min-w-[200px] flex-1 flex flex-col gap-3 justify-around">
        <div className="text-xs uppercase text-slate-400 font-semibold">Semifinals</div>
        {cols.S.map(m => <MatchCard key={m.id} match={m} onPick={pick} readonly={readonly} />)}
      </div>
      <div className="min-w-[200px] flex-1 flex flex-col gap-3 justify-around">
        <div className="text-xs uppercase text-slate-400 font-semibold">Final</div>
        {cols.F.map(m => <MatchCard key={m.id} match={m} onPick={pick} readonly={readonly} />)}
      </div>
    </div>
  )
}
