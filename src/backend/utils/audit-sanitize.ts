/**
 * Single redaction implementation shared by the audit middleware (both planes),
 * the platform audit repository (defense-in-depth against direct-service writes),
 * and the one-time scrub script. Deny-by-default: any object key matching
 * SENSITIVE_KEY_PATTERN is redacted, at any nesting depth, including inside arrays.
 *
 * @module audit-sanitize
 */

/** Deny-by-default: any key matching this pattern is redacted, at any nesting depth. */
export const SENSITIVE_KEY_PATTERN = /(password|secret|apikey|api_key|token|credential)/i

/**
 * Recursively redacts any object key matching SENSITIVE_KEY_PATTERN, at any depth,
 * including inside arrays and nested objects. Replaces matched values with '***'.
 * Non-plain-object/array leaves pass through unchanged.
 */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '***' : redact(v)
    }
    return out
  }
  return value
}

/** Sanitizes a request-body-shaped value for audit persistence; non-objects return undefined. */
export function sanitize(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined
  return redact(body) as Record<string, unknown>
}
