// Extracts the backend's actual error text (error-handler.middleware.ts's
// `{ success: false, error, code }` shape) instead of a hardcoded generic string,
// so e.g. a DB-down 500 reads differently from a wrong-password 401.
export function getErrorMessage(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { error?: string } } })?.response
  return response?.data?.error ?? fallback
}
