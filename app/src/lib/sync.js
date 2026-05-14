// Sync layer between local state and Supabase `tennis_state` table.
//
// Read path: anon SELECT on a single row (id=1, JSONB column `data`).
// Write path: anon UPSERT on the same row. RLS allows both for any client.
// Security: the in-app password gate is purely UI — anyone with the Supabase
// URL+anon key could write directly. Acceptable for a one-day tennis app.
// Realtime: subscribe to the row; on UPDATE, callback with the new state.

import { supabase, supabaseConfigured } from './supabase.js'

const ROW_ID = 1

export { supabaseConfigured }

export async function pullState() {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('tennis_state')
    .select('data, updated_at')
    .eq('id', ROW_ID)
    .maybeSingle()
  if (error) {
    console.warn('pullState failed:', error.message)
    return null
  }
  if (!data) return null
  return { state: data.data, updatedAt: data.updated_at }
}

// onChange is called whenever the row updates. Returns an unsubscribe function.
export function subscribeState(onChange) {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('tennis_state_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tennis_state', filter: `id=eq.${ROW_ID}` },
      (payload) => {
        const next = payload.new?.data
        if (next) onChange({ state: next, updatedAt: payload.new.updated_at })
      }
    )
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

// Direct upsert via anon key. Debounce in caller.
export async function pushState(state) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase
    .from('tennis_state')
    .upsert({ id: ROW_ID, data: state, updated_at: new Date().toISOString() })
  if (error) throw new Error(`pushState: ${error.message}`)
  return { ok: true }
}
