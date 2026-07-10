// Username-recall helper for the clinic login screen ("Remember me").
// Stores only usernames (never passwords), scoped per (subdomain, username)
// pair so one browser origin never leaks staff usernames across tenants —
// see docs/adr/0010-remember-me-username-recall-not-session-persistence.md.

/** One remembered username, scoped to the clinic subdomain it was saved under. */
export interface RememberedUsername {
  username:   string
  subdomain:  string
  lastUsedAt: number
}

const STORAGE_KEY = 'vc_remembered_usernames'

function readAll(): RememberedUsername[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function writeAll(entries: RememberedUsername[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) }
  catch { /* private mode / unavailable — degrade silently, matches authStore.ts pattern */ }
}

/** Entries saved under `subdomain` (case-insensitive). Relies on the write-time
 *  invariant (upsert always unshifts) for most-recent-first order — no re-sort on read. */
export function list(subdomain: string): RememberedUsername[] {
  const needle = subdomain.toLowerCase()
  return readAll().filter(
    e => typeof e.subdomain === 'string' && e.subdomain.toLowerCase() === needle
  )
}

/** Case-insensitive match on (subdomain, username); last-typed casing wins for display. */
export function upsert(subdomain: string, username: string): void {
  const sLower = subdomain.toLowerCase()
  const uLower = username.toLowerCase()
  const next = readAll().filter(e =>
    !(typeof e.subdomain === 'string' && e.subdomain.toLowerCase() === sLower
      && e.username.toLowerCase() === uLower)
  )
  next.unshift({ subdomain, username, lastUsedAt: Date.now() })
  writeAll(next)
}

export function remove(subdomain: string, username: string): void {
  const sLower = subdomain.toLowerCase()
  const uLower = username.toLowerCase()
  writeAll(readAll().filter(e =>
    !(typeof e.subdomain === 'string' && e.subdomain.toLowerCase() === sLower
      && e.username.toLowerCase() === uLower)
  ))
}
