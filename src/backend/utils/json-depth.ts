/**
 * Bounded, iterative (stack-based, not recursive) JSON-shape check used to reject
 * pathologically deep/wide request bodies at validation time — see R3-HI-06. Mirrors the
 * same MAX_DEPTH/MAX_NODES bound as `utils/audit-sanitize.ts`'s `redact()`; keeping the
 * check itself iterative avoids reintroducing an unbounded-recursion crash in the
 * validator that's supposed to be guarding against exactly that.
 *
 * @module json-depth
 */

const DEFAULT_MAX_DEPTH = 12
const DEFAULT_MAX_NODES = 2000

/**
 * Returns false if `value` nests deeper than `maxDepth` or contains more than
 * `maxNodes` object/array nodes anywhere in its structure. Used as a Zod `.refine()`
 * guard on any field typed `z.any()` / `z.record(z.unknown())` that accepts
 * client-supplied nested JSON (e.g. `operatingHours`, `anatomyAnnotation`).
 */
export function isWithinJsonLimits(value: unknown, maxDepth = DEFAULT_MAX_DEPTH, maxNodes = DEFAULT_MAX_NODES): boolean {
  let nodeCount = 0
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }]

  while (stack.length > 0) {
    const { value: v, depth } = stack.pop() as { value: unknown; depth: number }
    if (v === null || typeof v !== 'object') continue

    nodeCount++
    if (nodeCount > maxNodes) return false
    if (depth > maxDepth) return false

    const children = Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)
    for (const child of children) {
      stack.push({ value: child, depth: depth + 1 })
    }
  }

  return true
}
