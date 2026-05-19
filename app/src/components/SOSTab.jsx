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
      <div className="text-[10px] text-slate-400 leading-relaxed">
        Bradley-Terry pooled rating (one universe for Singles, one for Doubles) · 28-day recency half-life · MOV-weighted · generated {data.generatedAt?.slice(0,10)}.{' '}
        Pooling all 4 singles flights into one rating universe means a player who flexed between 1S/2S/3S during the season is rated from <i>all</i> her matches; MHSAA flight-stay rules anchor her to her regional flight at state finals.
      </div>
      <div className="flex flex-wrap gap-1">
        {[['teams','Team Power'],['flight','Flight Rankings'],['clarkston','Clarkston'],['lineup','Lineup Watch'],['upsets','Upset Watch']].map(([k, label]) => (
          <button key={k} onClick={() => setView(k)}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold uppercase tracking-wider ${view===k ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {view === 'teams' && <TeamsView data={data} sortKey={sortKey} setSortKey={setSortKey} sortAsc={sortAsc} setSortAsc={setSortAsc} q={q} setQ={setQ} />}
      {view === 'flight' && <FlightView data={data} flight={flight} setFlight={setFlight} q={q} setQ={setQ} />}
      {view === 'clarkston' && <ClarkstonView data={data} />}
      {view === 'lineup' && <LineupWatchView data={data} />}
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

function RatingCell({ rating, source }) {
  const flag = source && source !== 'season'
  return (
    <span className="font-mono">
      {rating}
      {flag && <span className="ml-0.5 text-amber-400 text-[9px]" title={`Rating source: ${source} (no/few season matches)`}>*</span>}
    </span>
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
              <SortHeader id="ratedFlights" label="Rated" current={sortKey} asc={sortAsc} setKey={setSortKey} setAsc={setSortAsc} />
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
                <td className="px-1.5 py-1.5 text-slate-400">{t.ratedFlights ?? '—'}{t.fallbackFlights ? <span className="text-amber-400" title={`${t.fallbackFlights} flight(s) using fallback rating (no season match data)`}> +{t.fallbackFlights}*</span> : null}</td>
                <td className="px-1.5 py-1.5 font-mono">{t.total}</td>
                <td className="px-1.5 py-1.5 font-mono">{t.totalAvg}</td>
                <td className="px-1.5 py-1.5 font-mono text-slate-400">{t.sosAvg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] text-slate-500">
        Total = sum of qualifier ratings across all 8 flights. Avg = average per qualifier. SOS = avg opponent rating, recency-weighted.
        <span className="text-amber-400"> *</span> = fallback rating from TennisReporting's 2026 Elo (qualifier had ~0 ratable season matches at that flight — common for late-promoted JV/freshmen).
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
              <th className="px-1.5 py-1 text-right text-[10px] uppercase text-slate-400" title="Matches played at this flight / total matches in singles or doubles">M@flt</th>
              <th className="px-1.5 py-1 text-right text-[10px] uppercase text-slate-400">Reg seed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const swap = r.regularStarter && !r.regularStarter.noData
              return (
                <tr key={r.name + r.schoolId} className={`border-t border-slate-800 ${r.schoolId === HIGHLIGHT ? 'bg-blue-900/30' : ''}`}>
                  <td className="px-1.5 py-1.5 align-top">{r.rank}</td>
                  <td className="px-1.5 py-1.5 align-top">
                    <div>{r.name}</div>
                    {swap && (
                      <div className="text-[10px] text-amber-300 mt-0.5" title="Regular dual-meet starter differs from regional qualifier">
                        ↔ regular: {r.regularStarter.name} ({r.regularStarter.rating}, {r.regularStarter.matches}x {r.regularStarter.record})
                      </div>
                    )}
                  </td>
                  <td className="px-1.5 py-1.5 text-slate-300 align-top">{r.schoolName}</td>
                  <td className="px-1.5 py-1.5 text-right align-top"><RatingCell rating={r.rating} source={r.ratingSource} /></td>
                  <td className="px-1.5 py-1.5 font-mono text-right text-slate-400 align-top">{r.sosRating}</td>
                  <td className="px-1.5 py-1.5 font-mono text-right text-slate-400 align-top">{r.matchCountAtFlight ?? '—'}<span className="text-slate-600">/{r.matchCount ?? 0}</span></td>
                  <td className="px-1.5 py-1.5 font-mono text-right text-slate-400 align-top">{r.regionalSeed ?? '—'}</td>
                </tr>
              )
            })}
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
      <div className="text-[10px] text-slate-500 leading-relaxed">
        Ratings use every dual-meet + tournament match this season, weighted by recency
        (28-day half-life: a match 4 weeks ago counts ~50%, 8 weeks ~25%) and by margin of victory
        (game differential / 6, clamped). Late-season form moves a player more than early-season form.
        <span className="text-amber-400"> *</span> after a rating means it's a fallback (no season matches at that flight — likely a late JV/freshman call-up).
      </div>
      <div className="space-y-2">
        {c.flights.map(f => {
          const fdata = data.flights?.[f.flight]
          const ours = fdata?.qualifiers?.find(q => q.schoolId === HIGHLIGHT)
          const swap = ours?.regularStarter && !ours.regularStarter.noData
          const noLineup = ours?.regularStarter?.noData
          return (
          <div key={f.flight} className="rounded-lg border border-slate-700 bg-slate-900/40 p-2">
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-semibold">{f.flightLabel} · {f.flight}</div>
              {f.ours ? (
                <div className="text-[11px] text-slate-300">{f.ours.name} · rated {f.ours.rating} · rank {f.stateRank}/{f.fieldSize}</div>
              ) : (
                <div className="text-[11px] text-slate-500 italic">no Clarkston qualifier</div>
              )}
            </div>
            {swap && (
              <div className="mt-1 text-[11px] bg-amber-900/20 border border-amber-700/40 rounded px-2 py-1">
                <span className="text-amber-300 font-semibold">Likely sub:</span>{' '}
                regional qualifier <span className="font-semibold">{f.ours.name}</span> isn't your dual-meet starter.
                Regular starter <span className="text-emerald-300">{ours.regularStarter.name}</span> rates{' '}
                <span className="font-mono text-emerald-200">{ours.regularStarter.rating}</span>
                {' '}({ours.regularStarter.matches} matches, {ours.regularStarter.record}).
              </div>
            )}
            {noLineup && (
              <div className="mt-1 text-[11px] bg-slate-900/40 border border-slate-700 rounded px-2 py-1 text-slate-400">
                No regular {f.flight} lineup found in season data — Clarkston didn't field a {f.flight} pair in dual meets.
              </div>
            )}
            {f.ours && !swap && !noLineup && (
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
        )})}
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

function LineupWatchView({ data }) {
  const mismatches = []
  for (const fid of Object.keys(data.flights || {})) {
    for (const q of data.flights[fid].qualifiers) {
      if (q.regularStarter && !q.regularStarter.noData) {
        mismatches.push({ flight: fid, ...q })
      }
    }
  }
  mismatches.sort((a, b) => {
    // Biggest swap by rating delta first.
    const dA = Math.abs((a.regularStarter.rating ?? 0) - a.rating)
    const dB = Math.abs((b.regularStarter.rating ?? 0) - b.rating)
    return dB - dA
  })
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-slate-300 leading-relaxed bg-slate-900/40 border border-slate-700 rounded p-2">
        Players who qualified through regionals but aren't their team's regular dual-meet starter at that flight.
        These are <span className="text-amber-300">candidates for approved subs</span> — the regional entry will
        play state finals unless MHSAA grants a substitution. <span className="text-emerald-300">The "regular" rating
        shows what the field would look like if this team fielded its normal lineup.</span> When the seeded draw is
        posted (~ May 25) these should reconcile.
      </div>
      <div className="text-[11px] text-slate-400">{mismatches.length} mismatches found across all schools / flights.</div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              <th className="px-1.5 py-1 text-left text-[10px] uppercase text-slate-400">Flt</th>
              <th className="px-1.5 py-1 text-left text-[10px] uppercase text-slate-400">School</th>
              <th className="px-1.5 py-1 text-left text-[10px] uppercase text-slate-400">Regional qualifier</th>
              <th className="px-1.5 py-1 text-right text-[10px] uppercase text-slate-400">Qual rating</th>
              <th className="px-1.5 py-1 text-left text-[10px] uppercase text-slate-400">Regular starter (dual meets)</th>
              <th className="px-1.5 py-1 text-right text-[10px] uppercase text-slate-400">Reg rating</th>
              <th className="px-1.5 py-1 text-right text-[10px] uppercase text-slate-400">Δ</th>
            </tr>
          </thead>
          <tbody>
            {mismatches.map((m, i) => {
              const delta = (m.regularStarter.rating ?? 0) - m.rating
              return (
                <tr key={i} className={`border-t border-slate-800 ${m.schoolId === HIGHLIGHT ? 'bg-blue-900/30' : ''}`}>
                  <td className="px-1.5 py-1.5 font-mono">{m.flight}</td>
                  <td className="px-1.5 py-1.5">{m.schoolName}</td>
                  <td className="px-1.5 py-1.5">{m.name}</td>
                  <td className="px-1.5 py-1.5 font-mono text-right">{m.rating}</td>
                  <td className="px-1.5 py-1.5 text-emerald-200">
                    {m.regularStarter.name}
                    <span className="text-slate-500 text-[11px]"> · {m.regularStarter.matches}x {m.regularStarter.record}</span>
                  </td>
                  <td className="px-1.5 py-1.5 font-mono text-right text-emerald-200">{m.regularStarter.rating}</td>
                  <td className={`px-1.5 py-1.5 font-mono text-right ${delta > 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {delta > 0 ? '+' : ''}{delta}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
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
