// Server-side write endpoint for tennis_state.
// - Verifies the admin password against a server-only env var (ADMIN_PASS).
// - Writes via SUPABASE_SERVICE_ROLE_KEY, bypassing RLS.
// - GET with valid password = auth check (used by Gate.jsx). POST = upsert state.
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

function isAuthed(req) {
  const expected = process.env.ADMIN_PASS
  if (!expected) return false
  const provided = req.headers['x-admin-password']
  return timingSafeEqual(String(provided || ''), String(expected))
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!isAuthed(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const { stateRowId, state } = body || {}

  if (!Number.isInteger(stateRowId) || stateRowId < 1 || stateRowId > 4) {
    return res.status(400).json({ error: 'stateRowId must be an integer 1-4' })
  }
  if (!state || typeof state !== 'object') {
    return res.status(400).json({ error: 'state must be an object' })
  }

  const updatedAt = new Date().toISOString()
  const { error } = await supabase
    .from('tennis_state')
    .upsert({ id: stateRowId, data: state, updated_at: updatedAt })

  if (error) {
    console.error('upsert failed', error)
    return res.status(500).json({ error: 'Write failed' })
  }

  return res.status(200).json({ ok: true, updatedAt })
}
