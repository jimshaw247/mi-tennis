import { TEAMS, HIGHLIGHT_TEAM } from '../data/teams.js'
import { leaderboard } from '../lib/stats.js'

function Badge({ children, color }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider"
          style={{ background: color + '33', color }}>
      {children}
    </span>
  )
}

export default function Leaderboard({ flights, compact = false }) {
  const rows = leaderboard(flights)
  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      <div className="grid grid-cols-[28px_1fr_44px_44px_44px] gap-1 px-2 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 bg-slate-800/80">
        <div>#</div><div>Team</div>
        <div className="text-right">Pts</div>
        <div className="text-right">Max</div>
        <div className="text-right">Alive</div>
      </div>
      {rows.map(r => {
        const isHi = r.team.id === HIGHLIGHT_TEAM
        return (
          <div
            key={r.team.id}
            className={[
              'grid grid-cols-[28px_1fr_44px_44px_44px] gap-1 px-2 py-2 items-center border-t border-slate-800',
              r.displayRank <= 3 ? 'bg-emerald-900/30' : '',
              isHi ? 'ring-1 ring-inset ring-blue-400/60' : '',
            ].join(' ')}
          >
            <div className="text-slate-300 font-semibold">{r.displayRank}</div>
            <div className="min-w-0 flex items-center gap-2">
              <span className="inline-block w-1.5 h-5 rounded-sm flex-shrink-0" style={{ background: r.team.color }} />
              <div className="min-w-0">
                <div className={['text-sm truncate', isHi ? 'font-bold' : ''].join(' ')}>{r.team.name}</div>
                {!compact && (
                  <div className="text-[10px] text-slate-400 flex gap-1 flex-wrap mt-0.5">
                    <span>finish {r.bestRank === r.worstRank ? `#${r.bestRank}` : `#${r.bestRank}–#${r.worstRank}`}</span>
                    {r.clinchedFirst && <Badge color="#fde047">Champ ✓</Badge>}
                    {!r.clinchedFirst && r.clinchedTop3 && <Badge color="#10b981">Top 3 ✓</Badge>}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right font-mono font-bold">{r.points}</div>
            <div className="text-right font-mono text-slate-400">{r.maxPossible}</div>
            <div className="text-right font-mono text-slate-400">{r.alive}</div>
          </div>
        )
      })}
      <div className="px-2 py-1.5 text-[10px] text-slate-500 bg-slate-900/60 border-t border-slate-800">
        Green = top 3. Pts = match wins + earned bye credit. Bounds assume independent flights.
      </div>
    </div>
  )
}
