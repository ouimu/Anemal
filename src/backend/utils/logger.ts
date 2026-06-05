// Structured JSON logger (CODING_RULES §6.5, §8 — no raw console.log in app code).
// Intentionally dependency-free so it works offline; the API mirrors pino/winston
// ({ ...context }, message) and can be swapped for pino without touching callers.

type Level = 'error' | 'warn' | 'info' | 'debug'

const LEVEL_RANK: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 }

const threshold: number =
  LEVEL_RANK[(process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug')]

function emit(level: Level, context: Record<string, unknown>, message: string): void {
  if (LEVEL_RANK[level] > threshold) return
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg: message, ...serialize(context) })
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n')
  else process.stdout.write(line + '\n')
}

// Errors don't serialize to JSON by default — expand name/message/stack.
function serialize(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(context)) {
    out[k] = v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v
  }
  return out
}

export const logger = {
  error: (context: Record<string, unknown>, message: string) => emit('error', context, message),
  warn:  (context: Record<string, unknown>, message: string) => emit('warn', context, message),
  info:  (context: Record<string, unknown>, message: string) => emit('info', context, message),
  debug: (context: Record<string, unknown>, message: string) => emit('debug', context, message),
}
