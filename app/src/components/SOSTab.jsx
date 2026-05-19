import { useEffect, useMemo, useState } from 'react'

const FLIGHTS = ['1S','2S','3S','4S','1D','2D','3D','4D']
const FLIGHT_LABEL = { '1S':'#1 Singles','2S':'#2 Singles','3S':'#3 Singles','4S':'#4 Singles',
                       '1D':'#1 Doubles','2D':'#2 Doubles','3D':'#3 Doubles','4D':'#4 Doubles' }
const HIGHLIGHT = 4052 // Clarkston

function pct(p) { return p == null ? '—' : (p * 100).toFixed(0) + '%' }

export default function SOSTab() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [view, setView] = useState('teams') // 'teams' | 'flight' | 'clarkston' | 'upsets'
  const [flight, setFlight] = useState('1S')
  const [sortKey, setSortKey] = useState('rank')
  const [sortAsc, setSortAsc] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/sos.json').then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData).catch(e => setErr(String(e)))
  }, [])

  if (err) return <div className="p-4 text-red-300">Failed to load SOS data: {err}</div>
  if (!data) return <div className="p-4 text-slate-400">Loading SOS data…</div>

  return (
    <div className="space-y-3">
      <div className="text-[10px] text-slate-400">
        Bradley-Terry ratings per flight · 28-day half-life recency · MOV-weighted · generated {data.generatedAt?.slice(0,10)}
      </div>
      <div className="flex flex-wrap gap-1">
        {[['teams','Team Power'],['flight','Flight Rankings'],['clarkston','Clarkston'],['upsets','Upset Watch']].map(([k, label]) => (
          <button key={k} onClick={() => setView(k)}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold uppercase tracking-wider ${view===k ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {view === 'teams' && <TeamsView data={data} sortKey={sortKey} setSortKey={setSortKey} sortAsc={sortAsc} setSortAsc={setSortAsc} q={q} setQ={setQ} />}
      {view === 'flight' && <FlightView data={data} flight={flight} setFlight={setFlight} q={q} setQ={setQ} />}
      {view === 'clarkston' && <ClarkstonView data={data} />}
      {view === 'upsets' && <UpsetsView data={data} />}
    </div>
  )
}

function SortHeader({ id, label, current, asc, setKey, setAsc }) {
  const active = current === id
  return (
    <th
      onClick={() => { if (active) setAsc(!asc); else { setKey(id); setAsc(false) } }}
      className="px-1.5 py-1 text-left text-[10px] uppercase tracking-wider text-slate-400 cursor-pointer select-none">
      {label}{active ? (asc ? ' ↑' : ' ↓') : ''}
    </th>
  )
}

function TeamsView({ data, sortKey, setSortKey, sortAsc, setSortAsc, q, setQ }) {
  const rows = useMemo(() => {
    let arr = [...(data.teamRanking || [])]
    if (q.trim()) {
      const needle = q.toLowerCase()
      arr = arr.filter(t => t.schoolName.toLowerCase().includes(needle))
    }
    arr.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortAsc ? cmp : -cmp
    })
    return arr
  }, [data, sortKey, sortAsc, q])
  return (
    <div className="space-y-2">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter schools…"
        className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-sm" />
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              <SortHeader id="rank" label="#" current={sortKey} asc={sortAsc} setKey={setSortKey} setAsc={setSortAsc} />
              <SortHeader id="schoolName" label="School" current={sortKey} asc={sortAsc} setKey={setSortKey} setAsc={setSortAsc} />
              <SortHeader id="qualifierCount" label="Flts" current={sortKey} asc={sortAsc} setKey={setSortKey} setAsc={setSortAsc} />
              <SortHeader id="total" label="Total" current={sortKey} asc={sortAsc} setKey={setSortKey} setAsc={setSortAsc} />
              <SortHeader id="totalAvg" label="Avg" current={sortKey} asc={sortAsc} setKey={setSortKey} setAsc={setSortAsc} />
              <SortHeader id="sosAvg" label="SOS" current={sortKey} asc={sortAsc} setKey={setSortKey} setAsc={setSortAsc} />
            </tr>
          </thead>
          <tbody>
            {rows.map(t => (
              <tr key={t.schoolId} className={`border-t border-slate-800 ${t.schoolId === HIGHLIGHT ? 'bg-blue-900/30' : ''}`}>
                <td className="px-1.5 py-1.5">{t.rank}</td>
                <td className="px-1.5 py-1.5 font-medium">{t.schoolName}</td>
                <td className="px-1.5 py-1.5 text-slate-400">{t.qualifierCount}</td>
                <td className="px-1.5 py-1.5 font-mono">{t.total}</td>
                <td className="px-1.5 py-1.5 font-mono">{t.totalAvg}</td>
                <td className="px-1.5 py-1.5 font-mono text-slate-400">{t.sosAvg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] text-slate-500">
        Total = sum of qualifier ratings across all 8 flights (zeros for unqualified flights). Avg = average over qualifier count. SOS = average opponent rating across the season.
      </div>
    </div>
  )
}

function FlightView({ data, flight, setFlight, q, setQ }) {
  const fd = data.flights?.[flight]
  if (!fd) return <div className="text-slate-400">No data for {flight}</div>
  let rows = fd.qualifiers
  if (q.trim()) {
    const n = q.toLowerCase()
    rows = rows.filter(r => r.name.toLowerCase().includes(n) || r.schoolName.toLowerCase().includes(n))
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {FLIGHTS.map(f => (
          <button key={f} onClick={() => setFlight(f)}
            className={`px-2 py-1 rounded text-[11px] font-semibold ${flight===f ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{f}</button>
        ))}
      </div>
      <div className="text-[11px] text-slate-400">{fd.label} · {fd.matchCount} season matches</div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter players or schools…"
        className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-sm" />
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              <th className="px-1.5 py-1 text-left text-[10px] uppercase text-slate-400">#</th>
              <th className="px-1.5 py-1 text-left text-[10px] uppercase text-slate-400">Player(s)</th>
              <th className="px-1.5 py-1 text-left text-[10px] uppercase text-slate-400">School</th>
              <th className="px-1.5 py-1 text-right text-[10px] uppercase text-slate-400">Rating</th>
              <th className="px-1.5 py-1 text-right text-[10px] uppercase text-slate-400">SOS</th>
              <th className="px-1.5 py-1 text-right text-[10px] uppercase text-slate-400">Reg seed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name + r.schoolId} className={`border-t border-slate-800 ${r.schoolId === HIGHLIGHT ? 'bg-blue-900/30' : ''}`}>
                <td className="px-1.5 py-1.5">{r.rank}</td>
                <td className="px-1.5 py-1.5">{r.name}</td>
                <td className="px-1.5 py-1.5 text-slate-300">{r.schoolName}</td>
                <td className="px-1.5 py-1.5 font-mono text-right">{r.rating}</td>
                <td className="px-1.5 py-1.5 font-mono text-right text-slate-400">{r.sosRating}</td>
                <td className="px-1.5 py-1.5 font-mono text-right text-slate-400">{r.regionalSeed ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ClarkstonView({ data }) {
  const c = data.clarkston
  if (!c) return null
  return (
    <div className="space-y-3">
      {c.seasonRecord && (
        <div className="rounded-lg border border-blue-700/40 bg-blue-900/20 p-2 text-sm">
          <span className="font-semibold">Clarkston season record:</span>{' '}
          {c.seasonRecord.win}–{c.seasonRecord.loss}–{c.seasonRecord.tie}
        </div>
      )}
      <div className="space-y-2">
        {c.flights.map(f => (
          <div key={f.flight} className="rounded-lg border border-slate-700 bg-slate-900/40 p-2">
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-semibold">{f.flightLabel} · {f.flight}</div>
              {f.ours ? (
                <div className="text-[11px] text-slate-300">{f.ours.name} · rated {f.ours.rating} · rank {f.stateRank}/{f.fieldSize}</div>
              ) : (
                <div className="text-[11px] text-slate-500 italic">no Clarkston qualifier</div>
              )}
            </div>
            {f.ours && (
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px]">
                <div>
                  <div className="text-[10px] uppercase text-slate-500 mb-1">Toughest matchups</div>
                  {f.hardest.map((m, i) => (
                    <div key={i} className="flex justify-between border-t border-slate-800 py-0.5">
                      <span>{m.opponent} <span className="text-slate-500">({m.school}, {m.rating})</span></span>
                      <span className="text-amber-300 font-mono">{pct(m.winProb)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-500 mb-1">Easiest matchups</div>
                  {f.easiest.map((m, i) => (
                    <div key={i} className="flex justify-between border-t border-slate-800 py-0.5">
                      <span>{m.opponent} <span className="text-slate-500">({m.school}, {m.rating})</span></span>
                      <span className="text-emerald-300 font-mono">{pct(m.winProb)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {(c.bestWins?.length || c.worstLosses?.length) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase text-emerald-400 font-semibold mb-1">Best wins (vs opponent rating)</div>
            <div className="rounded-lg border border-emerald-900/40 bg-emerald-900/10 p-2 text-[12px] space-y-1">
              {(c.bestWins || []).map((w, i) => (
                <div key={i} className="border-t border-slate-800 first:border-t-0 pt-1 first:pt-0">
                  <div>{w.ours} beat <span className="font-semibold">{w.opp}</span></div>
                  <div className="text-slate-400 text-[11px]">{w.flight} · {w.oppSchool} · rated {Math.round(w.oppRating)} · {w.date?.slice(0,10)}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-red-400 font-semibold mb-1">Worst losses</div>
            <div className="rounded-lg border border-red-900/40 bg-red-900/10 p-2 text-[12px] space-y-1">
              {(c.worstLosses || []).map((l, i) => (
                <div key={i} className="border-t border-slate-800 first:border-t-0 pt-1 first:pt-0">
                  <div>{l.ours} lost to <span className="font-semibold">{l.opp}</span></div>
                  <div className="text-slate-400 text-[11px]">{l.flight} · {l.oppSchool} · rated {Math.round(l.oppRating)} · {l.date?.slice(0,10)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UpsetsView({ data }) {
  const u = data.upsetWatch || { underseeded: [], overseeded: [] }
  return (
    <div className="space-y-3">
      <Section title="Underseeded — high BT rating despite mediocre regional seed" tone="emerald">
        {u.underseeded.length === 0 ? <Empty /> : u.underseeded.map((r, i) => (
          <UpsetRow key={i} r={r} dir="up" />
        ))}
      </Section>
      <Section title="Overseeded — top regional seed but bottom-of-field BT rating" tone="amber">
        {u.overseeded.length === 0 ? <Empty /> : u.overseeded.map((r, i) => (
          <UpsetRow key={i} r={r} dir="down" />
        ))}
      </Section>
    </div>
  )
}
function Section({ title, tone, children }) {
  const cls = tone === 'emerald' ? 'border-emerald-900/40 bg-emerald-900/10' : 'border-amber-900/40 bg-amber-900/10'
  return (
    <div className={`rounded-lg border ${cls} p-2`}>
      <div className="text-[10px] uppercase font-semibold mb-1">{title}</div>
      <div className="space-y-1 text-[12px]">{children}</div>
    </div>
  )
}
function Empty() { return <div className="text-slate-500 italic text-center py-2">No candidates fit the threshold.</div> }
function UpsetRow({ r, dir }) {
  return (
    <div className="border-t border-slate-800 first:border-t-0 pt-1 first:pt-0 flex justify-between gap-2">
      <div>
        <span className="font-mono mr-1">{r.flight}</span>
        {r.name} <span className="text-slate-400">({r.schoolName})</span>
      </div>
      <div className="text-slate-400">
        rated <span className="text-white font-mono">{Math.round(r.rating)}</span> · state rank #{r.stateRank} · seed {r.regSeed}
      </div>
    </div>
  )
}
