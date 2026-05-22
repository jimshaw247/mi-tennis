import { useState } from 'react'

// Admin gate. The password is NOT in the client bundle — Gate posts the value
// to /api/state which compares (timing-safe) against a server-only env var.
// On success, we cache the password in localStorage so subsequent writes via
// sync.js can send it as X-Admin-Password.
const STORAGE_KEY = 'tennis-regionals-admin'
const PASS_KEY = 'tennis-regionals-admin-pass'

export function isAdmin() {
  return localStorage.getItem(STORAGE_KEY) === '1'
}

export function logout() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(PASS_KEY)
  window.location.reload()
}

export default function Gate({ onUnlock }) {
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setErr('')
    setBusy(true)
    try {
      const res = await fetch('/api/state', { headers: { 'X-Admin-Password': p } })
      if (res.ok) {
        localStorage.setItem(STORAGE_KEY, '1')
        localStorage.setItem(PASS_KEY, p)
        onUnlock()
      } else if (res.status === 401) {
        setErr('Nope')
      } else {
        setErr(`Server error ${res.status}`)
      }
    } catch {
      setErr('Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-xs space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-5">
        <div>
          <div className="text-sm font-bold">Admin login</div>
          <div className="text-[11px] text-slate-400">View-only? Open <a href="/view" className="underline text-blue-400">/view</a></div>
        </div>
        <input
          autoFocus
          value={p}
          onChange={e => setP(e.target.value)}
          placeholder="password"
          type="password"
          autoComplete="current-password"
          className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm"
        />
        {err && <div className="text-xs text-red-400">{err}</div>}
        <button type="submit" disabled={busy} className="w-full px-3 py-2 rounded bg-blue-600 text-white text-sm font-semibold disabled:opacity-60">
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}
