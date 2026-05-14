import { FLIGHTS } from '../data/teams.js'
import { emptyFlight } from './bracket.js'

const KEY = 'tennis-regionals-state-v1'

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw)
    if (!parsed.flights) return defaultState()
    // Ensure all 8 flights are present (in case schema evolved).
    const byId = Object.fromEntries(parsed.flights.map(f => [f.id, f]))
    const flights = FLIGHTS.map(f => byId[f.id] || emptyFlight(f.id))
    return { flights }
  } catch {
    return defaultState()
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* localStorage full or unavailable; surfacing a UI error would distract from match entry */
  }
}

export function defaultState() {
  return { flights: FLIGHTS.map(f => emptyFlight(f.id)) }
}

export function exportJson(state) {
  return JSON.stringify(state, null, 2)
}

export function importJson(text) {
  const parsed = JSON.parse(text)
  if (!parsed.flights || !Array.isArray(parsed.flights)) throw new Error('Missing flights array')
  return parsed
}
