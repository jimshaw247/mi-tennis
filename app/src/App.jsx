import { useEffect, useState, useMemo, useRef } from 'react'
import { FLIGHTS } from './data/teams.js'
import { DIVISIONS, DIVISION_BY_ID, readDivisionFromUrl, writeDivisionToUrl, isDay2 } from './data/divisions.js'
import { FLIGHT_SIZE, MATCH_DEFS } from './lib/bracket.js'
import { loadState, saveState, defaultState, normalizeMeta } from './lib/storage.js'
import { generateTestA, generateTestB } from './lib/testData.js'
import final2025 from './data/final2025.json'
import { pullState, subscribeState, pushState, supabaseConfigured } from './lib/sync.js'
import Bracket from './components/Bracket.jsx'
import Leaderboard from './components/Leaderboard.jsx'
import DrawSetup from './components/DrawSetup.jsx'
import Gate, { isAdmin } from './components/Gate.jsx'
import SOSTab from './components/SOSTab.jsx'
import SyncButton from './components/SyncButton.jsx'
import MatchLog from './components/MatchLog.jsx'

const TABS = [
  { id: 'board', label: 'Board' },
  { id: 'flights', label: 'Flights' },
  { id: 'setup', label: 'Draws' },
  { id: 'sos', label: 'SOS' },
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
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem('mitennis-admin-tab') || 'board' } catch { return 'board' }
  })
  useEffect(() => { try { localStorage.setItem('mitennis-admin-tab', tab) } catch {} }, [tab])
  const [activeFlight, setActiveFlight] = useState('1S')
  const [setupOpen, setSetupOpen] = useState(false)
  // Day-2 toggle: when on, the Bracket renders only SF + F (compact view for
  // mobile on the closing day). Defaults to ON once the division's day-2
  // date has arrived. Re-evaluates when the division changes.
  const [day2View, setDay2View] = useState(() => isDay2(division))
  useEffect(() => { setDay2View(isDay2(division)) }, [divisionId])
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
      if (res?.state?.flights) setState({ flights: res.state.flights, meta: normalizeMeta(res.state.meta) })
      setSyncStatus('connected')
    }).catch(() => setSyncStatus('error'))
    const unsub = subscribeState(division.stateRowId, ({ state: remote }) => {
      if (remote?.flights) setState({ flights: remote.flights, meta: normalizeMeta(remote.meta) })
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
      setSyncStatus('connected')
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
  const loadTest = (label, generator) => {
    if (!confirm(`Replace current ${divisionId} state with ${label}? Uses 2025 D1 entries with randomized winners.`)) return
    if (divisionId !== 'D1') setDivisionId('D1')
    commit(generator())
  }
  const load2025Final = () => {
    if (!confirm('Replace current D1 state with the 2025 final results? Any unsaved test data or live picks will be lost.')) return
    if (divisionId !== 'D1') setDivisionId('D1')
    commit({ flights: final2025.flights, meta: { source: '2025' } })
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-10 bg-slate-950/95 border-b border-slate-800 backdrop-blur">
        <div className="px-3 py-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold tracking-tight">MHSAA {divisionId} Girls State Finals</div>
            <div className="text-[10px] text-slate-400 flex items-center gap-2">
              <span>32-draw · 8 flights</span>
              <SourceBadge source={state.meta?.source} syncStatus={syncStatus} />
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
            <MatchLog flights={state.flights} />
          </>
        )}

        {tab === 'flights' && flight && (
          <>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">
                {FLIGHTS.find(f => f.id === activeFlight)?.label}
              </h2>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setDay2View(v => !v)}
                  className={['text-xs px-2 py-1 rounded border',
                    day2View ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'].join(' ')}
                  title="Toggle between full bracket and SF/F only"
                >{day2View ? 'Full bracket' : 'Day 2 only'}</button>
                <button
                  onClick={() => setSetupOpen(o => !o)}
                  className="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700"
                >{setupOpen ? 'Hide draw' : 'Edit draw'}</button>
              </div>
            </div>
            {setupOpen && (
              <div className="rounded-xl border border-slate-700 p-3 bg-slate-900/40">
                <DrawSetup flight={flight} onUpdate={updateFlight} />
              </div>
            )}
            <Bracket flight={flight} onUpdate={updateFlight} day2Only={day2View} />
            <Leaderboard flights={state.flights} compact />
          </>
        )}

        {tab === 'setup' && (
          <SetupTab state={state} setTab={setTab} updateFlight={updateFlight} />
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

      <footer className="p-3 border-t border-slate-800 flex flex-wrap gap-2 text-xs items-center">
        <SyncButton currentState={state} onApply={commit} divisionId={divisionId} />
        <button onClick={resetResults} className="px-2 py-1 rounded bg-slate-800 border border-slate-700">Reset results</button>
        <button onClick={resetAll} className="px-2 py-1 rounded bg-red-900/40 border border-red-700/60 text-red-200">Reset all</button>
        <button onClick={() => loadTest('Test Data A (75% of R2 done)', generateTestA)}
          className="px-2 py-1 rounded bg-purple-900/40 border border-purple-700/60 text-purple-200">Load Test A</button>
        <button onClick={() => loadTest('Test Data B (everything but F done)', generateTestB)}
          className="px-2 py-1 rounded bg-purple-900/40 border border-purple-700/60 text-purple-200">Load Test B</button>
        <button onClick={load2025Final}
          className="px-2 py-1 rounded bg-sky-900/40 border border-sky-700/60 text-sky-200">Load 2025 Final</button>
      </footer>
    </div>
  )
}

// Three-state data-source indicator. Color and label reflect WHERE the visible
// data came from. Sync status (push errors / offline) is shown as a tiny
// secondary glyph so it doesn't drown out the source.
function SourceBadge({ source, syncStatus }) {
  const sources = {
    live: { cls: 'bg-emerald-900/50 border-emerald-700 text-emerald-300',  dot: 'bg-emerald-400', label: 'Live' },
    '2025': { cls: 'bg-sky-900/40 border-sky-800 text-sky-300',            dot: 'bg-sky-400',     label: '2025 Final Ranking' },
    test: { cls: 'bg-amber-900/40 border-amber-700 text-amber-200',       dot: 'bg-amber-400',   label: 'Test Data' },
  }
  const v = sources[source] || sources['2025']
  const syncMap = {
    error: { c: 'text-red-400', g: '!', t: 'sync error' },
    pushing: { c: 'text-blue-300', g: '↑', t: 'syncing' },
    offline: { c: 'text-amber-300', g: '○', t: 'local only' },
    loading: { c: 'text-slate-400', g: '…', t: 'loading' },
  }
  const s = syncMap[syncStatus]
  return (
    <span className={['inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', v.cls].join(' ')}>
      <span className={['inline-block w-1.5 h-1.5 rounded-full', v.dot].join(' ')} />
      <span>{v.label}</span>
      {s && <span className={s.c} title={s.t}>· {s.g}</span>}
    </span>
  )
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
