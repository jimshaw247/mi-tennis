import { useEffect, useState } from 'react'
import { FLIGHTS } from './data/teams.js'
import { DIVISIONS, DIVISION_BY_ID, readDivisionFromUrl, writeDivisionToUrl } from './data/divisions.js'
import { defaultState } from './lib/storage.js'
import { pullState, subscribeState, supabaseConfigured } from './lib/sync.js'
import Bracket from './components/Bracket.jsx'
import Leaderboard from './components/Leaderboard.jsx'

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
        setState({ flights: res.state.flights || res.state })
        setUpdatedAt(res.updatedAt)
        setStatus('live')
      } else {
        setStatus('empty')
      }
    })
    const unsub = subscribeState(division.stateRowId, ({ state, updatedAt }) => {
      setState({ flights: state.flights || state })
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
            <div className="text-sm font-bold tracking-tight">MHSAA {divisionId} Girls State Finals — Live</div>
            <div className="text-[10px] text-slate-400">
              {status === 'live' && updatedAt && `Updated ${new Date(updatedAt).toLocaleTimeString()}`}
              {status === 'loading' && 'Connecting…'}
              {status === 'empty' && (division.available ? 'Waiting for admin to start the tournament' : 'Bracket URL not yet configured for this division')}
              {status === 'no-backend' && 'Backend not configured'}
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setTab('board')}
              className={`px-3 py-1.5 rounded text-xs font-semibold uppercase ${tab==='board' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Board</button>
            <button onClick={() => setTab('flights')}
              className={`px-3 py-1.5 rounded text-xs font-semibold uppercase ${tab==='flights' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Flights</button>
          </div>
        </div>
        <div className="px-2 pb-2 flex gap-1">
          {DIVISIONS.map(d => (
            <button
              key={d.id}
              onClick={() => setDivisionId(d.id)}
              className={[
                'px-2.5 py-1 rounded text-[11px] font-semibold uppercase tracking-wider',
                divisionId === d.id ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300',
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
      </main>

      <footer className="p-3 border-t border-slate-800 text-[10px] text-slate-500 text-center">
        Read-only view · auto-updates
      </footer>
    </div>
  )
}
