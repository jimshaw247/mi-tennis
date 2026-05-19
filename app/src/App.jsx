import { useEffect, useState, useMemo, useRef } from 'react'
import { FLIGHTS } from './data/teams.js'
import { DIVISIONS, DIVISION_BY_ID, readDivisionFromUrl, writeDivisionToUrl } from './data/divisions.js'
import { FLIGHT_SIZE, MATCH_DEFS } from './lib/bracket.js'
import { loadState, saveState, defaultState } from './lib/storage.js'
import { pullState, subscribeState, pushState, supabaseConfigured } from './lib/sync.js'
import Bracket from './components/Bracket.jsx'
import Leaderboard from './components/Leaderboard.jsx'
import DrawSetup from './components/DrawSetup.jsx'
import Gate, { isAdmin, logout } from './components/Gate.jsx'
import SyncButton from './components/SyncButton.jsx'

const TABS = [
  { id: 'board', label: 'Board' },
  { id: 'flights', label: 'Flights' },
  { id: 'setup', label: 'Draws' },
]

export default function App() {
  const [unlocked, setUnlocked] = useState(() => isAdmin())
  if (!unlocked) return <Gate onUnlock={() => setUnlocked(true)} />
  return <AdminApp />
}

function AdminApp() {
  const [divisionId, setDivisionId] = useState(() => readDivisionFromUrl())
  const division = DIVISION_BY_ID[divisionId]
  // Server is canonical. localStorage is a display-only cache so the screen
  // isn't blank while the network round-trip runs. We never auto-push local
  // state back; only explicit user actions (commit) push.
  const [state, setState] = useState(() => loadState(divisionId))
  const [tab, setTab] = useState('board')
  const [activeFlight, setActiveFlight] = useState('1S')
  const [setupOpen, setSetupOpen] = useState(false)
  const [syncStatus, setSyncStatus] = useState(supabaseConfigured ? 'loading' : 'offline')

  // Persist division choice in the URL hash so reloads + sharing work.
  useEffect(() => { writeDivisionToUrl(divisionId) }, [divisionId])

  // Passive cache: every render writes the current state to localStorage.
  // Used as a display fallback on the next mount before pullState resolves.
  useEffect(() => { saveState(state, divisionId) }, [state, divisionId])

  // On mount / division change: pull from server and subscribe to realtime
  // updates. No pushes happen automatically.
  useEffect(() => {
    setState(loadState(divisionId)) // show cached view immediately
    if (!supabaseConfigured) { setSyncStatus('offline'); return }
    let cancelled = false
    setSyncStatus('loading')
    pullState(division.stateRowId).then(res => {
      if (cancelled) return
      if (res?.state?.flights) setState({ flights: res.state.flights })
      setSyncStatus('live')
    }).catch(() => setSyncStatus('error'))
    const unsub = subscribeState(division.stateRowId, ({ state: remote }) => {
      if (remote?.flights) setState({ flights: remote.flights })
    })
    return () => { cancelled = true; unsub() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionId])

  // The single write path. Updates local state and immediately pushes to
  // server. If push fails, the local update stays (so the user sees their
  // click), but the badge flips to 'error' until next successful action.
  async function commit(nextState) {
    setState(nextState)
    if (!supabaseConfigured) return
    try {
      setSyncStatus('pushing')
      await pushState(division.stateRowId, nextState)
      setSyncStatus('live')
    } catch (e) {
      console.warn('push failed', e)
      setSyncStatus('error')
    }
  }

  const updateFlight = (next) => {
    commit({ ...state, flights: state.flights.map(f => f.id === next.id ? next : f) })
  }

  const flight = state.flights.find(f => f.id === activeFlight)
  const allEmpty = useMemo(
    () => state.flights.every(f => f.entries.every(e => !e.teamId)),
    [state.flights]
  )

  const resetAll = () => {
    if (!confirm('Reset all match results AND draws? This cannot be undone.')) return
    commit(defaultState())
  }
  const resetResults = () => {
    if (!confirm('Reset all match results? Draws stay.')) return
    commit({ ...state, flights: state.flights.map(f => ({ ...f, winners: {} })) })
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-10 bg-slate-950/95 border-b border-slate-800 backdrop-blur">
        <div className="px-3 py-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold tracking-tight">MHSAA {divisionId} Girls State Finals</div>
            <div className="text-[10px] text-slate-400 flex items-center gap-2">
              <span>32-draw · 8 flights</span>
              <SyncBadge status={syncStatus} />
            </div>
          </div>
          <div className="flex gap-1">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={[
                  'px-3 py-1.5 rounded text-xs font-semibold uppercase',
                  tab === t.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300',
                ].join(' ')}
              >{t.label}</button>
            ))}
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
                className={[
                  'px-2 py-1.5 rounded text-xs font-semibold',
                  activeFlight === f.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300',
                ].join(' ')}
              >{f.label}</button>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 p-3 space-y-4">
        {allEmpty && tab !== 'setup' && (
          <div className="rounded-lg border border-amber-700/60 bg-amber-900/30 p-3 text-sm">
            <div className="font-semibold mb-1">No draws entered yet</div>
            <div className="text-amber-200/80 text-xs">
              Go to the <button onClick={() => setTab('setup')} className="underline">Draws</button> tab to enter
              each flight's draw (up to {FLIGHT_SIZE} slots per flight; leave empty slots for byes). The bracket and
              leaderboard update automatically.
            </div>
          </div>
        )}

        {tab === 'board' && (
          <>
            <Leaderboard flights={state.flights} />
            <FlightSummary flights={state.flights} onJump={(id) => { setActiveFlight(id); setTab('flights') }} />
          </>
        )}

        {tab === 'flights' && flight && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {FLIGHTS.find(f => f.id === activeFlight)?.label}
              </h2>
              <button
                onClick={() => setSetupOpen(o => !o)}
                className="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700"
              >{setupOpen ? 'Hide draw' : 'Edit draw'}</button>
            </div>
            {setupOpen && (
              <div className="rounded-xl border border-slate-700 p-3 bg-slate-900/40">
                <DrawSetup flight={flight} onUpdate={updateFlight} />
              </div>
            )}
            <Bracket flight={flight} onUpdate={updateFlight} />
            <Leaderboard flights={state.flights} compact />
          </>
        )}

        {tab === 'setup' && (
          <SetupTab state={state} setTab={setTab} updateFlight={updateFlight} />
        )}
      </main>

      <footer className="p-3 border-t border-slate-800 flex flex-wrap gap-2 text-xs">
        <button onClick={resetResults} className="px-2 py-1 rounded bg-slate-800 border border-slate-700">Reset results</button>
        <button onClick={resetAll} className="px-2 py-1 rounded bg-red-900/40 border border-red-700/60 text-red-200">Reset all</button>
        <SyncButton currentState={state} onApply={(merged) => commit(merged)} />
        <button onClick={logout} className="ml-auto px-2 py-1 rounded bg-slate-800 border border-slate-700">Lock</button>
      </footer>
    </div>
  )
}

function SyncBadge({ status }) {
  const map = {
    idle:    { c: 'text-slate-400',  d: '•', t: 'idle' },
    live:    { c: 'text-emerald-400', d: '●', t: 'live' },
    pushing: { c: 'text-blue-400',   d: '↑', t: 'sync' },
    error:   { c: 'text-red-400',    d: '!', t: 'sync err' },
    offline: { c: 'text-amber-400',  d: '○', t: 'local only' },
  }
  const v = map[status] || map.idle
  return <span className={v.c} title={status}>{v.d} {v.t}</span>
}

function FlightSummary({ flights, onJump }) {
  const totalMatches = MATCH_DEFS.length
  return (
    <div className="grid grid-cols-2 gap-2">
      {flights.map(f => {
        const filled = f.entries.filter(e => e.teamId).length
        const decided = Object.keys(f.winners).length
        return (
          <button
            key={f.id}
            onClick={() => onJump(f.id)}
            className="rounded-lg border border-slate-700 bg-slate-900/40 p-2 text-left active:bg-slate-800"
          >
            <div className="text-sm font-semibold">{f.id}</div>
            <div className="text-[11px] text-slate-400">
              {filled} entries · {decided}/{totalMatches} picks
            </div>
          </button>
        )
      })}
    </div>
  )
}

function SetupTab({ state, setTab, updateFlight }) {
  const [pickedFlight, setPicked] = useState(state.flights[0].id)
  const flight = state.flights.find(f => f.id === pickedFlight)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1">
        {FLIGHTS.map(f => {
          const filled = state.flights.find(x => x.id === f.id).entries.filter(e => e.teamId).length
          return (
            <button
              key={f.id}
              onClick={() => setPicked(f.id)}
              className={[
                'px-2 py-1.5 rounded text-xs font-semibold',
                pickedFlight === f.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300',
              ].join(' ')}
            >{f.id} <span className="opacity-60">{filled}</span></button>
          )
        })}
      </div>
      {flight && <DrawSetup flight={flight} onUpdate={updateFlight} />}
      <div className="text-[11px] text-slate-400 pt-2">
        Enter each flight's draw in bracket order. Empty slots become byes. When draws are in, go to{' '}
        <button onClick={() => setTab('flights')} className="underline">Flights</button> to tap winners as matches finish.
      </div>
    </div>
  )
}
