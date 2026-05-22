import { useState } from 'react'
import { scrapeAllFlights, SCRAPABLE_DIVISIONS } from '../lib/scrapeTennisReporting.js'
import { diffFlights, mergeState } from '../lib/diffState.js'

function fmtEntry(e) {
  if (!e || !e.teamId) return '(empty)'
  const parts = [e.name, e.partner].filter(Boolean).join(' / ')
  return `${parts || '?'} — ${e.teamId}`
}

export default function SyncButton({ currentState, onApply, divisionId = 'D1' }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [diff, setDiff] = useState(null)
  const [scraped, setScraped] = useState(null)

  const startSync = async () => {
    if (!SCRAPABLE_DIVISIONS.includes(divisionId)) {
      setErr(`Sync not configured for ${divisionId}`)
      return
    }
    setBusy(true); setErr(''); setDiff(null); setScraped(null)
    try {
      const result = await scrapeAllFlights(divisionId)
      const d = diffFlights(result.flights, currentState.flights)
      setScraped(result.flights)
      setDiff(d)
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    if (!scraped) return
    const merged = mergeState(scraped, currentState.flights)
    onApply(merged)
    setDiff(null); setScraped(null)
  }

  const dismiss = () => { setDiff(null); setScraped(null); setErr('') }

  const total = diff ? diff.entryChanges.length + diff.winnerChanges.length : 0
  const noChange = diff && total === 0

  return (
    <>
      <button
        onClick={startSync}
        disabled={busy}
        className="px-2 py-1 rounded bg-blue-700 border border-blue-600 text-white disabled:opacity-50"
        title="Fetch latest from tennisreporting.com and preview a diff"
      >
        {busy ? 'Syncing…' : 'Sync site'}
      </button>
      {err && <div className="ml-2 text-xs text-red-400 inline">{err}</div>}

      {diff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onClick={dismiss}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold">Sync from tennisreporting</div>
                <div className="text-[10px] text-slate-400">
                  {noChange ? 'No changes — site matches your state' : `${total} change${total === 1 ? '' : 's'} to apply`}
                  {diff.aheadOfSite.length > 0 && ` · ${diff.aheadOfSite.length} local-only winner${diff.aheadOfSite.length === 1 ? '' : 's'} kept`}
                </div>
              </div>
              <button onClick={dismiss} className="text-slate-400 hover:text-white text-xs">close</button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
              {diff.winnerChanges.length > 0 && (
                <section>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Match results</div>
                  <ul className="space-y-1">
                    {diff.winnerChanges.map((c, i) => (
                      <li key={i} className={`rounded border p-2 ${c.kind === 'overwrite' ? 'border-amber-700/60 bg-amber-900/20' : 'border-slate-700 bg-slate-800/40'}`}>
                        <div className="flex justify-between items-baseline">
                          <span className="font-mono">{c.flightId} {c.matchId}</span>
                          {c.kind === 'overwrite' && <span className="text-amber-400 text-[10px] font-semibold">OVERWRITE</span>}
                        </div>
                        <div className="text-slate-300 mt-0.5">
                          {c.before && <><span className="line-through text-slate-500">{c.before}</span> → </>}
                          <span className="text-emerald-400">{c.after}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {diff.entryChanges.length > 0 && (
                <section>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Draw entries</div>
                  <ul className="space-y-1">
                    {diff.entryChanges.map((c, i) => (
                      <li key={i} className={`rounded border p-2 ${c.kind === 'overwrite' ? 'border-amber-700/60 bg-amber-900/20' : 'border-slate-700 bg-slate-800/40'}`}>
                        <div className="flex justify-between items-baseline">
                          <span className="font-mono">{c.flightId} pos {c.pos}</span>
                          {c.kind === 'overwrite' && <span className="text-amber-400 text-[10px] font-semibold">OVERWRITE</span>}
                          {c.kind === 'clear' && <span className="text-red-400 text-[10px] font-semibold">CLEAR</span>}
                        </div>
                        <div className="text-slate-300 mt-0.5">
                          <span className="line-through text-slate-500">{fmtEntry(c.before)}</span>
                          {' → '}
                          <span className="text-emerald-400">{fmtEntry(c.after)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {diff.aheadOfSite.length > 0 && (
                <section>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                    Local-only (site hasn't reported yet — kept as-is)
                  </div>
                  <ul className="space-y-1">
                    {diff.aheadOfSite.map((c, i) => (
                      <li key={i} className="rounded border border-slate-700 bg-slate-800/30 p-2 text-slate-400">
                        <span className="font-mono">{c.flightId} {c.matchId}</span>: winner {c.value}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {noChange && (
                <div className="text-slate-400 italic text-center py-6">Site and local are in sync.</div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-700 flex gap-2 justify-end">
              <button onClick={dismiss} className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-xs">
                {noChange ? 'Close' : 'Cancel'}
              </button>
              {!noChange && (
                <button onClick={apply} className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold">
                  Apply {total} change{total === 1 ? '' : 's'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
