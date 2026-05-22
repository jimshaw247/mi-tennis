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

function HelpDot({ active, onClick }) {
  // Tap target is the whole 32x32 button; the visible circle is smaller and
  // sits inside generous padding so fat-finger taps don't bleed into the
  // adjacent sort label.
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      aria-label="Show column explanation"
      className="ml-1 -my-1 inline-flex items-center justify-center align-middle w-8 h-8 p-0 bg-transparent"
    >
      <span className={`flex items-center justify-center w-5 h-5 rounded-full border text-[10px] leading-none font-semibold ${active ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-500 text-slate-300 bg-slate-800'}`}>?</span>
    </button>
  )
}

function HelpRow({ helpKey, helpDict, colSpan }) {
  if (!helpKey) return null
  return (
    <tr className="bg-slate-950/80">
      <td colSpan={colSpan} className="px-3 py-2 text-[11px] text-slate-300 leading-relaxed border-t border-blue-900/40">
        <span className="text-blue-300 font-semibold mr-1.5">{helpDict[helpKey]?.title}:</span>
        {helpDict[helpKey]?.body}
      </td>
    </tr>
  )
}

function SortHeader({ id, label, current, asc, setKey, setAsc, helpKey, helpOpen, setHelpOpen, align = 'left' }) {
  const active = current === id
  const helpActive = helpKey != null && helpOpen === helpKey
  return (
    <th className={`px-1.5 py-1 text-${align} text-[10px] uppercase tracking-wider text-slate-400 select-none whitespace-nowrap`}>
      <span
        onClick={() => { if (active) setAsc(!asc); else { setKey(id); setAsc(false) } }}
        className="cursor-pointer"
        title={helpKey ? 'Tap label to sort, ? for definition' : ''}
      >
        {label}{active ? (asc ? ' ↑' : ' ↓') : ''}
      </span>
      {helpKey && <HelpDot active={helpActive} onClick={() => setHelpOpen(helpActive ? null : helpKey)} />}
    </th>
  )
}

function PlainHeader({ label, helpKey, helpOpen, setHelpOpen, align = 'left' }) {
  const helpActive = helpKey != null && helpOpen === helpKey
  return (
    <th className={`px-1.5 py-1 text-${align} text-[10px] uppercase text-slate-400 whitespace-nowrap`}>
      <span>{label}</span>
      {helpKey && <HelpDot active={helpActive} onClick={() => setHelpOpen(helpActive ? null : helpKey)} />}
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

const TEAM_HELP = {
  rank: { title: '#', body: "Position in the team power rankings. Default sort is by Avg (average qualifier rating). Tap any other column header to re-sort." },
  schoolName: { title: 'School', body: "Team name. Clarkston is highlighted in blue. Every state-finals D1 team fields all 8 flights (1S–4S, 1D–4D) and every qualifier now has real season-match data." },
  total: { title: 'Total', body: "Sum of qualifier Bradley-Terry ratings across all 8 flights. Higher = stronger overall team." },
  totalAvg: { title: 'Avg', body: "Average rating per qualifier (Total ÷ 8). Default sort." },
  sosAvg: { title: 'SOS', body: "Strength of schedule, averaged across this school's qualifiers. Higher = they faced tougher opponents during the season. Independent of W/L — measures who they played, not how they did." },
}

function TeamsView({ data, sortKey, setSortKey, sortAsc, setSortAsc, q, setQ }) {
  const [helpOpen, setHelpOpen] = useState(null)
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
  const hdr = (id, label) => (
    <SortHeader id={id} label={label} current={sortKey} asc={sortAsc} setKey={setSortKey} setAsc={setSortAsc}
      helpKey={id} helpOpen={helpOpen} setHelpOpen={setHelpOpen} />
  )
  return (
    <div className="space-y-2">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter schools…"
        className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-sm" />
      <div className="text-[10px] text-slate-500">Tap a column's <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-slate-600 text-[8px]">?</span> for what it means.</div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              {hdr('rank', '#')}
              {hdr('schoolName', 'School')}
              {hdr('total', 'Total')}
              {hdr('totalAvg', 'Avg')}
              {hdr('sosAvg', 'SOS')}
            </tr>
          </thead>
          <tbody>
            <HelpRow helpKey={helpOpen} helpDict={TEAM_HELP} colSpan={5} />
            {rows.map(t => (
              <tr key={t.schoolId} className={`border-t border-slate-800 ${t.schoolId === HIGHLIGHT ? 'bg-blue-900/30' : ''}`}>
                <td className="px-1.5 py-1.5">{t.rank}</td>
                <td className="px-1.5 py-1.5 font-medium">{t.schoolName}</td>
                <td className="px-1.5 py-1.5 font-mono">{t.total}</td>
                <td className="px-1.5 py-1.5 font-mono">{t.totalAvg}</td>
                <td className="px-1.5 py-1.5 font-mono text-slate-400">{t.sosAvg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const FLIGHT_HELP = {
  rank: { title: '#', body: "State-finals rank at this flight — 1 is the highest Bradley-Terry rating in the field, 22 is the lowest." },
  player: { title: 'Player(s)', body: "Player (or doubles pair) who qualified at this flight through their regional. An amber '↔ regular' note below the name means this entry isn't the school's most-frequent dual-meet starter — possibly an approved sub." },
  school: { title: 'School', body: "The qualifier's school." },
  rating: { title: 'Rating', body: "Bradley-Terry rating. We pool every singles match into one universe and every doubles match into another, then iterate until each player's rating reflects head-to-head outcomes weighted by recency (28-day half-life) and margin of victory. A * suffix means the rating is a fallback from TennisReporting's 2026 Elo because the player had no ratable season matches." },
  sos: { title: 'SOS', body: "Strength of schedule — the average rating of opponents this player faced during the season, recency-weighted. Higher SOS = tougher schedule. SOS only measures who you played, not how you did against them." },
  matAtFlt: { title: 'M@flt', body: "Matches at this exact flight ÷ total varsity matches in the season pool (singles or doubles). A 4S player who also flexed up to 3S during the season will show a smaller numerator than denominator. The Bradley-Terry rating uses the full pool, not just same-flight matches." },
  regSeed: { title: 'Reg seed', body: "Seed at the regional tournament (1 = top seed). Comparing seed to state-finals rank is what powers the Upset Watch tab — under-seeded players are upset candidates." },
}

function FlightView({ data, flight, setFlight, q, setQ }) {
  const [helpOpen, setHelpOpen] = useState(null)
  const fd = data.flights?.[flight]
  if (!fd) return <div className="text-slate-400">No data for {flight}</div>
  let rows = fd.qualifiers
  if (q.trim()) {
    const n = q.toLowerCase()
    rows = rows.filter(r => r.name.toLowerCase().includes(n) || r.schoolName.toLowerCase().includes(n))
  }
  const hdr = (key, label, align) => (
    <PlainHeader label={label} helpKey={key} helpOpen={helpOpen} setHelpOpen={setHelpOpen} align={align} />
  )
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
      <div className="text-[10px] text-slate-500">Tap a column's <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-slate-600 text-[8px]">?</span> for what it means.</div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              {hdr('rank', '#', 'left')}
              {hdr('player', 'Player(s)', 'left')}
              {hdr('school', 'School', 'left')}
              {hdr('rating', 'Rating', 'right')}
              {hdr('sos', 'SOS', 'right')}
              {hdr('matAtFlt', 'M@flt', 'right')}
              {hdr('regSeed', 'Reg seed', 'right')}
            </tr>
          </thead>
          <tbody>
            <HelpRow helpKey={helpOpen} helpDict={FLIGHT_HELP} colSpan={7} />
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
                No dual-meet matches at {f.flight} for this entry — they may be a JV call-up or only played postseason. The rating shown is a fallback (TennisReporting's 2026 Elo) and should be treated as low-confidence.
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

const LINEUP_HELP = {
  flt: { title: 'Flt', body: "State-finals flight (1S–4D). Each row is a school + flight where the regional qualifier isn't the regular dual-meet starter." },
  school: { title: 'School', body: "The school with a possible lineup question." },
  qual: { title: 'Regional qualifier', body: "Player(s) who actually qualified at this flight through their regional. MHSAA expects them to play at state finals unless a substitution is approved." },
  qualRating: { title: 'Qual rating', body: "Bradley-Terry rating of the regional qualifier." },
  regular: { title: 'Regular starter', body: "The school's most-frequent dual-meet starter at this flight during the season (with their record). When this differs from the regional qualifier, you're looking at a potential approved sub or a regional-day lineup quirk." },
  regRating: { title: 'Reg rating', body: "Bradley-Terry rating of the regular starter." },
  delta: { title: 'Δ', body: "Reg rating minus Qual rating. Green/positive = the regular starter is stronger than the qualifier, so a sub would make this team's flight tougher. Amber/negative = the regional qualifier is actually the stronger player." },
}

function LineupWatchView({ data }) {
  const [helpOpen, setHelpOpen] = useState(null)
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
  const hdr = (key, label, align) => (
    <PlainHeader label={label} helpKey={key} helpOpen={helpOpen} setHelpOpen={setHelpOpen} align={align} />
  )
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-slate-300 leading-relaxed bg-slate-900/40 border border-slate-700 rounded p-2">
        Players who qualified through regionals but aren't their team's regular dual-meet starter at that flight.
        These are <span className="text-amber-300">candidates for approved subs</span> — the regional entry will
        play state finals unless MHSAA grants a substitution. <span className="text-emerald-300">The "regular" rating
        shows what the field would look like if this team fielded its normal lineup.</span> When the seeded draw is
        posted (~ May 25) these should reconcile.
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-slate-400">{mismatches.length} mismatches found in flights with sufficient dual-meet data.</div>
        <div className="text-[10px] text-slate-500">Tap a column's <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-slate-600 text-[8px]">?</span> for details.</div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60">
            <tr>
              {hdr('flt', 'Flt', 'left')}
              {hdr('school', 'School', 'left')}
              {hdr('qual', 'Regional qualifier', 'left')}
              {hdr('qualRating', 'Qual rating', 'right')}
              {hdr('regular', 'Regular starter', 'left')}
              {hdr('regRating', 'Reg rating', 'right')}
              {hdr('delta', 'Δ', 'right')}
            </tr>
          </thead>
          <tbody>
            <HelpRow helpKey={helpOpen} helpDict={LINEUP_HELP} colSpan={7} />
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
