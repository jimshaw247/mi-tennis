import { describeMatches, setWinner, ROUND_DEFS } from '../lib/bracket.js'
import { TEAM_BY_ID, HIGHLIGHT_TEAM } from '../data/teams.js'

// Round id -> 1-based column number. R1=1, R2=2, R3=3, SF=4, F=5.
const ROUND_INDEX = Object.fromEntries(ROUND_DEFS.map((r, i) => [r.id, i + 1]))
// Row span doubles each round. R1 spans 2, R2 spans 4, R3 spans 8, SF spans 16, F spans 32.
const TOTAL_ROWS = 32

function matchIdxInRound(matchId) {
  const m = matchId.match(/m(\d+)$/)
  return m ? parseInt(m[1], 10) : 0
}

function gridPosFor(match) {
  const col = ROUND_INDEX[match.round]
  if (!col) return null
  const span = 2 ** col
  const idx = matchIdxInRound(match.id)
  const start = 1 + idx * span
  return { gridColumn: col, gridRow: `${start} / span ${span}` }
}

function SideLabel({ entry, empty, highlight, score }) {
  if (empty) return <span className="text-slate-500 italic">BYE</span>
  if (!entry) return <span className="text-slate-500 italic">TBD</span>
  const team = entry.teamId ? TEAM_BY_ID[entry.teamId] : null
  const personLabel = entry.name
    ? (entry.partner ? `${entry.name} / ${entry.partner}` : entry.name)
    : null
  return (
    <span className="flex items-center gap-2 min-w-0 w-full">
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
      {score && (
        <span className="text-[13px] text-slate-300 font-mono flex-shrink-0 ml-1">{score}</span>
      )}
    </span>
  )
}

function MatchCard({ match, score, onPick, readonly }) {
  if (match.topEmpty && match.botEmpty) {
    return (
      <div className="w-full rounded border border-dashed border-slate-800/70 px-2 py-1 text-[10px] italic text-slate-700 text-center">
        —
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
    <div className={['w-full rounded-lg border bg-slate-900/60 overflow-hidden',
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
          <SideLabel entry={s.entry} empty={s.empty} highlight={isHi(s.entry)} score={s.winner ? score : null} />
        </button>
      ))}
    </div>
  )
}

export default function Bracket({ flight, onUpdate, readonly }) {
  const matches = describeMatches(flight)
  const pick = (id, side) => onUpdate && onUpdate(setWinner(flight, id, side))
  const colCount = ROUND_DEFS.length
  const colTemplate = `repeat(${colCount}, minmax(180px, 1fr))`

  return (
    <div className="overflow-x-auto border border-slate-800 rounded-lg bg-slate-950">
      <div style={{ minWidth: `${colCount * 200}px` }}>
        <div
          className="grid gap-x-2 border-b border-slate-800 px-2 bg-slate-950"
          style={{ gridTemplateColumns: colTemplate }}
        >
          {ROUND_DEFS.map(r => (
            <div key={r.id} className="py-2 text-[11px] uppercase text-slate-300 font-semibold tracking-wider">
              {r.label}
            </div>
          ))}
        </div>
        <div
          className="grid gap-x-2 gap-y-2 px-2 py-2"
          style={{
            gridTemplateColumns: colTemplate,
            gridTemplateRows: `repeat(${TOTAL_ROWS}, minmax(34px, 1fr))`,
          }}
        >
          {matches.map(m => {
            const pos = gridPosFor(m)
            if (!pos) return null
            return (
              <div key={m.id} style={{ ...pos, display: 'flex', alignItems: 'center' }}>
                <MatchCard match={m} score={flight.scores?.[m.id]} onPick={pick} readonly={readonly} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
