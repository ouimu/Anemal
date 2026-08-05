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

// R3-HI-06: an attacker-controlled request body can nest arbitrarily deep
// (`{"a":{"a":{"a":...}}}`). The previous implementation recursed with the native call
// stack and no bound, so a payload well under any body-size limit could still throw
// `RangeError: Maximum call stack size exceeded` — fatal because this runs inside
// `res.on('finish')`, outside Express's error-handling middleware chain, so nothing
// catches it and the process recycles. MAX_DEPTH/MAX_NODES bound both the vertical
// (nesting) and horizontal (breadth across the whole payload) cost.
const MAX_DEPTH = 12
const MAX_NODES = 2000
const TRUNCATED = '[TRUNCATED]'

interface WorkItem {
  value: unknown
  depth: number
  assign: (result: unknown) => void
}

/**
 * Iteratively (stack-based, not recursive) redacts any object key matching
 * SENSITIVE_KEY_PATTERN, at any depth up to MAX_DEPTH, including inside arrays and
 * nested objects. Replaces matched values with '***'. A branch that exceeds MAX_DEPTH,
 * or the payload exceeding MAX_NODES total, is replaced with '[TRUNCATED]' instead of
 * continuing to traverse or throwing. Non-plain-object/array leaves pass through
 * unchanged.
 */
export function redact(value: unknown): unknown {
  let nodeCount = 0
  let root: unknown

  const stack: WorkItem[] = [{ value, depth: 0, assign: (v) => { root = v } }]

  while (stack.length > 0) {
    const item = stack.pop() as WorkItem
    nodeCount++
    if (nodeCount > MAX_NODES) {
      item.assign(TRUNCATED)
      continue
    }

    const { value: v, depth, assign } = item
    if (depth > MAX_DEPTH) {
      assign(TRUNCATED)
      continue
    }

    if (Array.isArray(v)) {
      const out: unknown[] = new Array(v.length)
      assign(out)
      for (let i = 0; i < v.length; i++) {
        const idx = i
        stack.push({ value: v[idx], depth: depth + 1, assign: (res) => { out[idx] = res } })
      }
      continue
    }

    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      assign(out)
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (SENSITIVE_KEY_PATTERN.test(k)) {
          out[k] = '***'
        } else {
          stack.push({ value: val, depth: depth + 1, assign: (res) => { out[k] = res } })
        }
      }
      continue
    }

    assign(v)
  }

  return root
}

/** Sanitizes a request-body-shaped value for audit persistence; non-objects return undefined. */
export function sanitize(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined
  return redact(body) as Record<string, unknown>
}
