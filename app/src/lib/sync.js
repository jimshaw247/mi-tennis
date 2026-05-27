// Sync layer between local state and Supabase `tennis_state` table.
//
// Read path: anon SELECT on a single row (id=1..4, JSONB column `data`).
// Write path: POST to /api/state. Server validates X-Admin-Password against a
//   non-VITE env var and writes with the service role key. The Supabase RLS
//   policies for anon allow SELECT only — writes from a tampered client are
//   blocked at the database.
// Realtime: subscribe to the row; on UPDATE, callback with the new state.

import { supabase, supabaseConfigured } from './supabase.js'

export { supabaseConfigured }

const PASS_KEY = 'tennis-regionals-admin-pass'

function adminPassword() {
  try { return localStorage.getItem(PASS_KEY) || '' } catch { return '' }
}

// Strip stray trailing/leading underscores from teamIds. Older scraper
// versions produced bad ids like "lansing_catholic_" when the source name
// had trailing whitespace; without this, any stale browser session would
// keep re-pushing those to Supabase and undo the SQL cleanup.
function normalizeTeamIds(state) {
  if (!state?.flights) return state
  return {
    ...state,
    flights: state.flights.map(f => ({
      ...f,
      entries: f.entries?.map(e => {
        if (!e?.teamId) return e
        const fixed = e.teamId.replace(/^_+|_+$/g, '')
        return fixed === e.teamId ? e : { ...e, teamId: fixed }
      }),
    })),
  }
}

export async function pullState(rowId = 1) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('tennis_state')
    .select('data, updated_at')
    .eq('id', rowId)
    .maybeSingle()
  if (error) {
    console.warn('pullState failed:', error.message)
    return null
  }
  if (!data) return null
  return { state: normalizeTeamIds(data.data), updatedAt: data.updated_at }
}

export function subscribeState(rowId, onChange) {
  if (!supabase) return () => {}
  const channel = supabase
    .channel(`tennis_state_changes_${rowId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tennis_state', filter: `id=eq.${rowId}` },
      (payload) => {
        const next = payload.new?.data
        if (next) onChange({ state: normalizeTeamIds(next), updatedAt: payload.new.updated_at })
      }
    )
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

export async function pushState(rowId, state) {
  const pw = adminPassword()
  if (!pw) throw new Error('Not authenticated — please log in again')
  const res = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Password': pw },
    body: JSON.stringify({ stateRowId: rowId, state: normalizeTeamIds(state) }),
  })
  if (!res.ok) {
    if (res.status === 401) {
      try {
        localStorage.removeItem(PASS_KEY)
        localStorage.removeItem('tennis-regionals-admin')
      } catch {}
      throw new Error('Session expired — please log in again')
    }
    const body = await res.json().catch(() => ({}))
    throw new Error(`pushState: ${body.error || res.statusText}`)
  }
  return await res.json()
}
