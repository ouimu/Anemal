import type { AxiosError } from 'axios'

/** Surfaces the server's actual validation/error message instead of a generic "Save failed". */
export function describeSaveError(err: unknown): string {
  const body = (err as AxiosError<{ error?: string; details?: { fieldErrors?: Record<string, string[]> } }>)?.response?.data
  const fieldErrors = body?.details?.fieldErrors
  if (fieldErrors) {
    const first = Object.entries(fieldErrors).find(([, msgs]) => msgs?.length)
    if (first) return `${first[0]}: ${first[1][0]}`
  }
  return body?.error ? `Save failed — ${body.error}` : 'Save failed — check all fields.'
}
