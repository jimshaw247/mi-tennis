// Per-division config for MHSAA State Finals.
//
// Each division has its own Supabase row (id) and its own highlight team.
// `host` is the host parameter used in the tennisreporting.com URL — needed
// only for re-running the scraper. `null` means we don't have it yet (you'll
// find it from the live bracket URL once the division's bracket is posted).
// `day2Date` is the ISO date (local) when the tournament moves into its
// SF/F day. Used to default the "Day 2 only" bracket view to ON once that
// date arrives. Single-day divisions can omit it (no special default).
export const DIVISIONS = [
  { id: 'D1', label: 'D1', stateRowId: 1, division: 995, host: 2951, highlightTeam: 'clarkston', available: true, day2Date: '2026-05-30' },
  { id: 'D2', label: 'D2', stateRowId: 2, division: 996, host: 2952, highlightTeam: null,        available: true, day2Date: '2026-06-06' },
  { id: 'D3', label: 'D3', stateRowId: 3, division: 997, host: 2953, highlightTeam: null,        available: true, day2Date: '2026-06-06' },
  { id: 'D4', label: 'D4', stateRowId: 4, division: 998, host: 2954, highlightTeam: null,        available: true, day2Date: '2026-05-28' },
]

export const DIVISION_BY_ID = Object.fromEntries(DIVISIONS.map(d => [d.id, d]))

// Read current division from URL hash (`#d=D2`) or default to D1.
export function readDivisionFromUrl() {
  const m = (typeof location !== 'undefined' ? location.hash : '').match(/[#&]d=(D[1-4])/i)
  return (m?.[1] || 'D1').toUpperCase()
}

export function writeDivisionToUrl(id) {
  if (typeof location === 'undefined') return
  location.hash = `d=${id}`
}

// True once the current local date is on or past the division's day-2 date.
// Used to pick the default for the Day-2 bracket view.
export function isDay2(division, now = new Date()) {
  if (!division?.day2Date) return false
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return today >= division.day2Date
}
