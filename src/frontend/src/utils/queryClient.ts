// Shared TanStack Query client (HI-09).
//
// Exported as a singleton so every identity-transition site (logout, 401,
// branch switch) can reach the same cache instance and clear it. Previously
// `main.tsx` created the QueryClient inline and nothing ever cleared it —
// PII fetched under one identity (owner records, invoices, medical history)
// stayed resident in memory and readable after logout or a branch switch,
// a real exposure on shared clinic tablets.
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

/**
 * Drops every cached query/mutation result. Call BEFORE clearing the auth
 * store and navigating away, on every identity transition: logout, a 401
 * from the API interceptor, or a branch switch. `cancelQueries()` first so
 * an in-flight request for the old identity cannot repopulate the cache
 * after `clear()` runs.
 */
export async function clearServerState(): Promise<void> {
  await queryClient.cancelQueries()
  queryClient.clear()
}
