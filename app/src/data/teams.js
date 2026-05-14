export const TEAMS = [
  { id: 'rochester',     name: 'Rochester',             short: 'ROC',  color: '#ef4444' },
  { id: 'clarkston',     name: 'Clarkston',             short: 'CLA',  color: '#3b82f6' },
  { id: 'lake_orion',    name: 'Lake Orion',            short: 'LO',   color: '#10b981' },
  { id: 'oxford',        name: 'Oxford',                short: 'OXF',  color: '#f59e0b' },
  { id: 'rochester_adams', name: 'Rochester Adams',     short: 'RA',   color: '#a855f7' },
  { id: 'avondale',      name: 'Auburn Hills Avondale', short: 'AVO',  color: '#06b6d4' },
  { id: 'davison',       name: 'Davison',               short: 'DAV',  color: '#ec4899' },
  { id: 'lapeer',        name: 'Lapeer',                short: 'LAP',  color: '#84cc16' },
  { id: 'waterford',     name: 'Waterford Kettering',   short: 'WAT',  color: '#f97316' },
]

export const TEAM_BY_ID = Object.fromEntries(TEAMS.map(t => [t.id, t]))

export const HIGHLIGHT_TEAM = 'clarkston'

export const FLIGHTS = [
  { id: '1S', label: '1 Singles' },
  { id: '2S', label: '2 Singles' },
  { id: '3S', label: '3 Singles' },
  { id: '4S', label: '4 Singles' },
  { id: '1D', label: '1 Doubles' },
  { id: '2D', label: '2 Doubles' },
  { id: '3D', label: '3 Doubles' },
  { id: '4D', label: '4 Doubles' },
]
