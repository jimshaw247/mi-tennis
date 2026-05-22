import { useEffect, useState } from 'react'
import { FLIGHTS } from './data/teams.js'
import { DIVISIONS, DIVISION_BY_ID, readDivisionFromUrl, writeDivisionToUrl } from './data/divisions.js'
import { defaultState, normalizeMeta } from './lib/storage.js'
import { pullState, subscribeState, supabaseConfigured } from './lib/sync.js'
import Bracket from './components/Bracket.jsx'
import Leaderboard from './components/Leaderboard.jsx'
import SOSTab from './components/SOSTab.jsx'

// Read-only viewer. Subscribes to Supabase realtime for live updates.
// No editing controls. No localStorage write.
export default function Viewer() {
  const [divisionId, setDivisionId] = useState(() => readDivisionFromUrl())
  const division = DIVISION_BY_ID[divisionId]
  const [state, setState] = useState(defaultState())
  const [updatedAt, setUpdatedAt] = useState(null)
  const [activeFlight, setActiveFlight] = useState('1S')
  const [status, setStatus] = useState(supabaseConfigured ? 'loading' : 'no-backend')

  useEffect(() => { writeDivisionToUrl(divisionId) }, [divisionId])

  useEffect(() => {
    setState(defaultState())
    setStatus(supabaseConfigured ? 'loading' : 'no-backend')
    if (!supabaseConfigured) return
    let alive = true
    pullState(division.stateRowId).then(res => {
      if (!alive) return
      if (res) {
        setState({ flights: res.state.flights || res.state, meta: normalizeMeta(res.state.meta) })
        setUpdatedAt(res.updatedAt)
        setStatus('live')
      } else {
        setStatus('empty')
      }
    })
    const unsub = subscribeState(division.stateRowId, ({ state, updatedAt }) => {
      setState({ flights: state.flights || state, meta: normalizeMeta(state.meta) })
      setUpdatedAt(updatedAt)
      setStatus('live')
    })
    return () => { alive = false; unsub() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionId])

  const flight = state.flights.find(f => f.id === activeFlight)
  const [tab, setTab] = useState('board')

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-10 bg-slate-950/95 border-b border-slate-800 backdrop-blur">
        <div className="px-3 py-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold tracking-tight">MHSAA {divisionId} Girls State Finals</div>
            <div className="text-[10px] text-slate-400 flex items-center gap-2">
              <ViewerSourceBadge source={state.meta?.source} />
              {status === 'live' && updatedAt && <UpdatedAtLabel ts={updatedAt} />}
              {status === 'loading' && <span>Connecting…</span>}
              {status === 'empty' && <span>{division.available ? 'Waiting for admin' : 'Not configured'}</span>}
              {status === 'no-backend' && <span>Backend not configured</span>}
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setTab('board')}
              className={`px-3 py-1.5 rounded text-xs font-semibold uppercase ${tab==='board' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Board</button>
            <button onClick={() => setTab('flights')}
              className={`px-3 py-1.5 rounded text-xs font-semibold uppercase ${tab==='flights' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Flights</button>
            <button onClick={() => setTab('sos')}
              className={`px-3 py-1.5 rounded text-xs font-semibold uppercase ${tab==='sos' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>SOS</button>
          </div>
        </div>
        <div className="px-2 pb-2 flex gap-1">
          {DIVISIONS.map(d => (
            <button
              key={d.id}
              onClick={() => setDivisionId(d.id)}
              className={[
                'px-2.5 py-1 rounded text-[11px] font-semibold uppercase tracking-wider',
                divisionId === d.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300',
                !d.available ? 'opacity-60' : '',
              ].join(' ')}
              title={d.available ? '' : 'Bracket URL not yet configured for this division'}
            >{d.label}{!d.available && ' •'}</button>
          ))}
        </div>
        {tab === 'flights' && (
          <div className="px-2 pb-2 grid grid-cols-4 gap-1">
            {FLIGHTS.map(f => (
              <button
                key={f.id}
                onClick={() => setActiveFlight(f.id)}
                className={`px-2 py-1.5 rounded text-xs font-semibold ${activeFlight===f.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}
              >{f.label}</button>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 p-3 space-y-4">
        {tab === 'board' && <Leaderboard flights={state.flights} />}
        {tab === 'flights' && flight && (
          <>
            <h2 className="text-lg font-bold">{FLIGHTS.find(f => f.id === activeFlight)?.label}</h2>
            <Bracket flight={flight} readonly />
            <Leaderboard flights={state.flights} compact />
          </>
        )}
        {tab === 'sos' && (divisionId === 'D1' ? <SOSTab liveState={state} /> : (
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300 leading-relaxed">
            <div className="font-semibold text-slate-100 mb-1">SOS available for D1 only</div>
            Strength-of-schedule, Bradley-Terry ratings, and lineup-watch analysis are currently built only
            for Division 1. Switch to <span className="text-blue-300 font-semibold">D1</span> at the top of
            the page to view it.
          </div>
        ))}
      </main>

      <footer className="p-3 border-t border-slate-800 text-[10px] text-slate-500 text-center">
        Read-only view · auto-updates
      </footer>
    </div>
  )
}

// Render the "Updated …" stamp with both date and time. A stale timestamp
// (e.g. yesterday's date showing today) is the user's signal that the
// sync pipeline has stopped working.
function UpdatedAtLabel({ ts }) {
  const d = new Date(ts)
  const date = `${d.getMonth() + 1}/${d.getDate()}`
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  // Color the date amber if it's older than today (a visible "this isn't live" cue).
  const today = new Date()
  const isToday = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
  return (
    <span>
      Updated <span className={isToday ? '' : 'text-amber-300 font-semibold'}>{date}</span> {time}
    </span>
  )
}

function ViewerSourceBadge({ source }) {
  const sources = {
    live: { cls: 'bg-emerald-900/50 border-emerald-700 text-emerald-300', dot: 'bg-emerald-400', label: 'Live' },
    '2025': { cls: 'bg-sky-900/40 border-sky-800 text-sky-300',          dot: 'bg-sky-400',     label: '2025 Final Ranking' },
    test: { cls: 'bg-amber-900/40 border-amber-700 text-amber-200',     dot: 'bg-amber-400',   label: 'Test Data' },
  }
  const v = sources[source] || sources['2025']
  return (
    <span className={['inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', v.cls].join(' ')}>
      <span className={['inline-block w-1.5 h-1.5 rounded-full', v.dot].join(' ')} />
      <span>{v.label}</span>
    </span>
  )
}
