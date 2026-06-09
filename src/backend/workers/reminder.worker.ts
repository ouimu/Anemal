// Reminder background worker (Phase 4, Module 4.7).
// Periodically scans for due pet reminders across all tenants and dispatches them.
// Started from server.ts only — never imported by app.ts, so tests don't spawn timers.
import { dispatchDue } from '../services/reminder.service'
import { logger } from '../utils/logger'

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000 // hourly

async function runOnce(): Promise<void> {
  try {
    const { sent } = await dispatchDue()
    if (sent > 0) logger.info({ sent }, 'reminder worker dispatched due reminders')
  } catch (err) {
    logger.error({ err }, 'reminder worker run failed')
  }
}

export function startReminderWorker(intervalMs = DEFAULT_INTERVAL_MS): NodeJS.Timeout {
  void runOnce() // fire once on boot
  const timer = setInterval(() => void runOnce(), intervalMs)
  timer.unref() // don't keep the process alive solely for the worker
  logger.info({ intervalMs }, 'reminder worker started')
  return timer
}
