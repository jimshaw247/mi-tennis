// Compare scraped state (from tennisreporting) to current local state.
// Conflict rules:
//   - site empty,    local empty    → no-op
//   - site has X,    local empty    → adopt X silently
//   - site has X,    local has X    → no-op
//   - site has X,    local has Y    → adopt X, flag as conflict ("OVERWRITE")
//   - site empty,    local has X    → keep local, flag as "ahead of site"

import { MATCH_DEFS } from './bracket.js'

const MATCH_IDS = MATCH_DEFS.map(m => m.id)

function entryFingerprint(e) {
  if (!e || !e.teamId) return null
  return `${e.teamId}|${(e.name || '').trim()}|${(e.partner || '').trim()}`
}

export function diffFlights(scrapedFlights, localFlights) {
  const localById = Object.fromEntries(localFlights.map(f => [f.id, f]))
  const out = {
    entryChanges: [],     // [{flightId, pos, before, after, kind: 'adopt'|'overwrite'|'clear'}]
    winnerChanges: [],    // [{flightId, matchId, before, after, kind}]
    aheadOfSite: [],      // [{flightId, matchId, value}] — local has a winner the site doesn't
  }
  for (const scraped of scrapedFlights) {
    const local = localById[scraped.id] || { entries: [], winners: {} }

    for (let pos = 0; pos < 32; pos++) {
      const a = scraped.entries[pos] || { pos, teamId: null, name: '', partner: '' }
      const b = local.entries?.[pos] || { pos, teamId: null, name: '', partner: '' }
      const af = entryFingerprint(a), bf = entryFingerprint(b)
      if (af === bf) continue
      let kind = 'adopt'
      if (af && bf) kind = 'overwrite'
      else if (!af && bf) kind = 'clear'   // site cleared an entry we had locally
      out.entryChanges.push({ flightId: scraped.id, pos, before: b, after: a, kind })
    }

    const sW = scraped.winners || {}
    const lW = local.winners || {}
    for (const mid of MATCH_IDS) {
      const siteVal = sW[mid]
      const localVal = lW[mid]
      if (!siteVal && !localVal) continue
      if (siteVal && !localVal) {
        out.winnerChanges.push({ flightId: scraped.id, matchId: mid, before: null, after: siteVal, kind: 'adopt' })
      } else if (siteVal && localVal && siteVal === localVal) {
        // no diff
      } else if (siteVal && localVal && siteVal !== localVal) {
        out.winnerChanges.push({ flightId: scraped.id, matchId: mid, before: localVal, after: siteVal, kind: 'overwrite' })
      } else if (!siteVal && localVal) {
        out.aheadOfSite.push({ flightId: scraped.id, matchId: mid, value: localVal })
      }
    }
  }
  return out
}

// Site wins where site has a value (overwrites local). Local kept where site is empty.
// Entries: trust site entirely (the bracket draw is authoritative).
// Used by the manual Sync button after the user has previewed and confirmed.
export function mergeState(scrapedFlights, localFlights) {
  const localById = Object.fromEntries(localFlights.map(f => [f.id, f]))
  return {
    flights: scrapedFlights.map(scraped => {
      const local = localById[scraped.id] || { entries: [], winners: {}, scores: {} }
      const mergedWinners = { ...(local.winners || {}) }
      for (const [mid, val] of Object.entries(scraped.winners || {})) {
        mergedWinners[mid] = val
      }
      const mergedScores = { ...(local.scores || {}) }
      for (const [mid, val] of Object.entries(scraped.scores || {})) {
        mergedScores[mid] = val
      }
      return {
        id: scraped.id,
        entries: scraped.entries,
        winners: mergedWinners,
        scores: mergedScores,
      }
    }),
    meta: { source: 'live' },
  }
}

// Soft merge for the unattended server-side cron: entries adopt from site (MHSAA
// can edit the draw post-publication), but winners only adopt where local is
// empty. The admin's manual taps are never silently overwritten — if site
// disagrees with a tap they'd have to open the Sync modal to apply the change.
export function softMergeState(scrapedFlights, localFlights) {
  const localById = Object.fromEntries(localFlights.map(f => [f.id, f]))
  return {
    flights: scrapedFlights.map(scraped => {
      const local = localById[scraped.id] || { entries: [], winners: {}, scores: {} }
      const mergedWinners = { ...(local.winners || {}) }
      for (const [mid, val] of Object.entries(scraped.winners || {})) {
        if (mergedWinners[mid] == null) mergedWinners[mid] = val
      }
      const mergedScores = { ...(local.scores || {}) }
      for (const [mid, val] of Object.entries(scraped.scores || {})) {
        if (mergedScores[mid] == null) mergedScores[mid] = val
      }
      return {
        id: scraped.id,
        entries: scraped.entries,
        winners: mergedWinners,
        scores: mergedScores,
      }
    }),
    meta: { source: 'live' },
  }
}
