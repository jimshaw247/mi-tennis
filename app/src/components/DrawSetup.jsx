import { TEAMS } from '../data/teams.js'

// Bracket positions in display order (top of bracket -> bottom).
const POS_LABELS = [
  '1 (top, faces play-in winner)',
  '2 (bottom half top)',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8 (play-in A)',
  '9 (play-in B)',
]

export default function DrawSetup({ flight, onUpdate }) {
  const set = (pos, patch) => {
    const entries = flight.entries.map((e, i) => i === pos ? { ...e, ...patch } : e)
    onUpdate({ ...flight, entries })
  }

  const usedTeams = new Set(flight.entries.map(e => e.teamId).filter(Boolean))

  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-400 mb-2">
        Enter 9 entries in bracket order (top to bottom). Positions 8 & 9 play the play-in; winner faces position 1 in QF.
      </div>
      {flight.entries.map((e, i) => (
        <div key={i} className="rounded-lg border border-slate-700 p-2 bg-slate-900/40">
          <div className="text-[11px] text-slate-400 mb-1">Pos {POS_LABELS[i]}</div>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={16}
              placeholder="seed"
              value={e.seed ?? ''}
              onChange={ev => set(i, { seed: ev.target.value === '' ? null : Number(ev.target.value) })}
              className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
            />
            <select
              value={e.teamId ?? ''}
              onChange={ev => set(i, { teamId: ev.target.value || null })}
              className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
            >
              <option value="">— team —</option>
              {TEAMS.map(t => (
                <option key={t.id} value={t.id} disabled={usedTeams.has(t.id) && t.id !== e.teamId}>
                  {t.name}{usedTeams.has(t.id) && t.id !== e.teamId ? ' (used)' : ''}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="player or pair (optional)"
            value={e.name ?? ''}
            onChange={ev => set(i, { name: ev.target.value })}
            className="mt-2 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
          />
        </div>
      ))}
    </div>
  )
}
