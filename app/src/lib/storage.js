import { FLIGHTS } from '../data/teams.js'
import { emptyFlight, FLIGHT_SIZE } from './bracket.js'

const KEY_PREFIX = 'tennis-state-v1'
const keyFor = (divisionId) => `${KEY_PREFIX}-${divisionId.toLowerCase()}`

export function loadState(divisionId = 'D1') {
  try {
    const raw = localStorage.getItem(keyFor(divisionId))
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw)
    if (!parsed.flights) return defaultState()
    const byId = Object.fromEntries(parsed.flights.map(f => [f.id, normalizeFlight(f)]))
    const flights = FLIGHTS.map(f => byId[f.id] || emptyFlight(f.id))
    return { flights }
  } catch {
    return defaultState()
  }
}

// Backfill any missing slots so older saves expand into the 32-slot shape.
function normalizeFlight(f) {
  const base = emptyFlight(f.id)
  const merged = base.entries.map((e, i) => f.entries?.[i] ? { ...e, ...f.entries[i], pos: i } : e)
  // Trim or pad to FLIGHT_SIZE.
  while (merged.length < FLIGHT_SIZE) merged.push({ pos: merged.length, teamId: null, seed: null, name: '', partner: '' })
  merged.length = FLIGHT_SIZE
  return { id: f.id, entries: merged, winners: f.winners || {}, scores: f.scores || {} }
}

export function saveState(state, divisionId = 'D1') {
  try { localStorage.setItem(keyFor(divisionId), JSON.stringify(state)) } catch { /* localStorage full or disabled */ }
}

export function defaultState() {
  return { flights: FLIGHTS.map(f => emptyFlight(f.id)) }
}

export function exportJson(state) { return JSON.stringify(state, null, 2) }

export function importJson(text) {
  const parsed = JSON.parse(text)
  if (!parsed.flights || !Array.isArray(parsed.flights)) throw new Error('Missing flights array')
  const byId = Object.fromEntries(parsed.flights.map(f => [f.id, normalizeFlight(f)]))
  return { flights: FLIGHTS.map(f => byId[f.id] || emptyFlight(f.id)) }
}
