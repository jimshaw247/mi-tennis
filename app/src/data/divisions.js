// Per-division config for MHSAA State Finals.
//
// Each division has its own Supabase row (id) and its own highlight team.
// `host` is the host parameter used in the tennisreporting.com URL — needed
// only for re-running the scraper. `null` means we don't have it yet (you'll
// find it from the live bracket URL once the division's bracket is posted).
export const DIVISIONS = [
  { id: 'D1', label: 'D1', stateRowId: 1, host: 2951, highlightTeam: 'clarkston', available: true },
  { id: 'D2', label: 'D2', stateRowId: 2, host: null, highlightTeam: null,        available: false },
  { id: 'D3', label: 'D3', stateRowId: 3, host: null, highlightTeam: null,        available: false },
  { id: 'D4', label: 'D4', stateRowId: 4, host: null, highlightTeam: null,        available: false },
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
