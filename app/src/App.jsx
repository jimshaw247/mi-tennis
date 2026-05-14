import { useEffect, useState, useMemo, useRef } from 'react'
import { FLIGHTS } from './data/teams.js'
import { loadState, saveState, defaultState, exportJson, importJson } from './lib/storage.js'
import { pullState, subscribeState, pushState, supabaseConfigured } from './lib/sync.js'
import Bracket from './components/Bracket.jsx'
import Leaderboard from './components/Leaderboard.jsx'
import DrawSetup from './components/DrawSetup.jsx'
import Gate, { isAdmin, logout } from './components/Gate.jsx'

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
  const [state, setState] = useState(() => loadState())
  const [tab, setTab] = useState('board')
  const [activeFlight, setActiveFlight] = useState('1S')
  const [setupOpen, setSetupOpen] = useState(false)
  const [syncStatus, setSyncStatus] = useState(supabaseConfigured ? 'idle' : 'offline')
  const pushTimer = useRef(null)
  const skipNextPush = useRef(false)

  // Always save to localStorage as offline buffer.
  useEffect(() => { saveState(state) }, [state])

  // Initial pull: if server has newer data than local, use it. Otherwise push
  // local up (e.g. fresh seed) to seed the backend.
  useEffect(() => {
    if (!supabaseConfigured) return
    let cancelled = false
    pullState().then(res => {
      if (cancelled) return
      if (res?.state?.flights) {
        skipNextPush.current = true
        setState({ flights: res.state.flights })
        setSyncStatus('live')
      } else {
        // backend empty; push current state up so /view has something to show
        scheduleAdminPush(state)
        setSyncStatus('live')
      }
    }).catch(() => setSyncStatus('error'))
    const unsub = subscribeState(({ state: remote }) => {
      if (remote?.flights) {
        skipNextPush.current = true
        setState({ flights: remote.flights })
      }
    })
    return () => { cancelled = true; unsub() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced push on every local change (skipping echo from a remote update).
  useEffect(() => {
    if (!supabaseConfigured) return
    if (skipNextPush.current) { skipNextPush.current = false; return }
    scheduleAdminPush(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  function scheduleAdminPush(nextState) {
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(async () => {
      try {
        setSyncStatus('pushing')
        await pushState(nextState)
        setSyncStatus('live')
      } catch (e) {
        console.warn('push failed', e)
        setSyncStatus('error')
      }
    }, 400)
  }

  const updateFlight = (next) => {
    setState(s => ({ ...s, flights: s.flights.map(f => f.id === next.id ? next : f) }))
  }

  const flight = state.flights.find(f => f.id === activeFlight)
  const allEmpty = useMemo(
    () => state.flights.every(f => f.entries.every(e => !e.teamId)),
    [state.flights]
  )

  const resetAll = () => {
    if (!confirm('Reset all match results AND draws? This cannot be undone.')) return
    setState(defaultState())
  }
  const resetResults = () => {
    if (!confirm('Reset all match results? Draws stay.')) return
    setState(s => ({ ...s, flights: s.flights.map(f => ({ ...f, winners: {} })) }))
  }
  const doExport = () => {
    const blob = new Blob([exportJson(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'regional-state.json'
    a.click()
    URL.revokeObjectURL(url)
  }
  const doImport = async (file) => {
    if (!file) return
    try {
      const txt = await file.text()
      setState(importJson(txt))
    } catch (e) {
      alert('Import failed: ' + e.message)
    }
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-10 bg-slate-950/95 border-b border-slate-800 backdrop-blur">
        <div className="px-3 py-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold tracking-tight">MHSAA D1 Girls Regional</div>
            <div className="text-[10px] text-slate-400 flex items-center gap-2">
              <span>9-team · 8 flights</span>
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
        {tab === 'flights' && (
          <div className="px-2 pb-2 flex gap-1 overflow-x-auto">
            {FLIGHTS.map(f => (
              <button
                key={f.id}
                onClick={() => setActiveFlight(f.id)}
                className={[
                  'px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap',
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
              each flight's 9 entries (seeds + schools). The bracket and leaderboard update automatically once draws are in.
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
        <button onClick={doExport} className="px-2 py-1 rounded bg-slate-800 border border-slate-700">Export</button>
        <label className="px-2 py-1 rounded bg-slate-800 border border-slate-700 cursor-pointer">
          Import
          <input type="file" accept="application/json" className="hidden"
            onChange={e => doImport(e.target.files?.[0])} />
        </label>
        <button onClick={resetResults} className="px-2 py-1 rounded bg-slate-800 border border-slate-700">Reset results</button>
        <button onClick={resetAll} className="px-2 py-1 rounded bg-red-900/40 border border-red-700/60 text-red-200">Reset all</button>
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
              {filled}/9 entries · {decided}/8 matches
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
      <div className="flex gap-1 overflow-x-auto">
        {FLIGHTS.map(f => {
          const filled = state.flights.find(x => x.id === f.id).entries.filter(e => e.teamId).length
          return (
            <button
              key={f.id}
              onClick={() => setPicked(f.id)}
              className={[
                'px-2 py-1.5 rounded text-xs font-semibold whitespace-nowrap',
                pickedFlight === f.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300',
              ].join(' ')}
            >{f.id} <span className="opacity-60">{filled}/9</span></button>
          )
        })}
      </div>
      {flight && <DrawSetup flight={flight} onUpdate={updateFlight} />}
      <div className="text-[11px] text-slate-400 pt-2">
        When this flight's 9 entries are in, switch to the next using the chips above. When all 8 are filled, go to{' '}
        <button onClick={() => setTab('flights')} className="underline">Flights</button> to tap winners as matches finish.
      </div>
    </div>
  )
}
