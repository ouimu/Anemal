// Proactive pet reminder service (Phase 4). Actual LINE/SMS send is deferred (stub marks sent).
import { z } from 'zod'
import { config } from '../config/env'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'
import * as reminderRepo from '../models/reminder.repository'

export const reminderSchema = z.object({
  petId:        z.number().int().positive(),
  reminderType: z.enum(['vaccination', 'deworming', 'health_checkup', 'other']),
  message:      z.string().trim().min(1),
  dueDate:      z.string().datetime(),
  channel:      z.enum(['line', 'sms', 'email', 'all']).optional(),
}).strict()

export const statusSchema = z.object({
  status: z.enum(['pending', 'sent', 'completed', 'cancelled']),
}).strict()

export type ReminderInput = z.infer<typeof reminderSchema>

export class ReminderError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'REMINDER_ERROR')
  }
}

export function create(tenantId: number, data: ReminderInput) {
  return reminderRepo.create(tenantId, data)
}

export function list(tenantId: number, status?: string, petId?: number) {
  return reminderRepo.list(tenantId, status, petId)
}

export function listDue(tenantId: number) {
  return reminderRepo.listDue(tenantId)
}

// Background worker entry point: dispatch all due pending reminders across tenants.
//
// R2-HI-04 (BA-confirmed live in production): no real LINE/SMS/email provider
// is integrated yet, so this loop is gated OFF by default behind
// REMINDER_DISPATCH_ENABLED (config/env.ts). Previously it ran unconditionally
// on every boot + hourly (workers/reminder.worker.ts) and daily via Vercel
// Cron, silently marking reminders "sent" with no message ever delivered —
// existing `sent` rows from before this fix are corrupt data. See the SQL
// note below for a manual, human-run data-correction step; do not run it
// automatically as part of this change.
//
// Data correction (run manually against a target tenant/environment when a
// human decides how to handle historical corrupt rows — NOT auto-run here):
//   UPDATE pet_reminders
//   SET status = 'needs_reverification'
//   WHERE status = 'sent';
// `status` is a free-form VARCHAR(20) (schema.prisma:857), so this needs no
// migration — it is a data-only change reversible by resetting to 'pending'.
export async function dispatchDue(): Promise<{ sent: number; skipped: boolean }> {
  if (!config.reminderDispatchEnabled) {
    logger.info({}, 'reminder dispatch skipped — REMINDER_DISPATCH_ENABLED is not "true" (no provider integration exists yet)')
    return { sent: 0, skipped: true }
  }

  const due = await reminderRepo.listAllDue()
  let sent = 0
  for (const r of due) {
    // Atomic per-row claim: concurrent cron/worker runs cannot both process
    // the same reminder (R2-HI-04).
    const claimed = await reminderRepo.claimPending(r.tenantId, r.id)
    if (!claimed) continue // another run already claimed this reminder

    // TODO(phase4+): integrate LINE Messaging API / Twilio SMS here before marking sent.
    await reminderRepo.markSent(r.tenantId, r.id)
    sent++
  }
  return { sent, skipped: false }
}

export async function setStatus(tenantId: number, id: number, status: string) {
  const existing = await reminderRepo.findById(tenantId, id)
  if (!existing) throw new ReminderError('Reminder not found', 404)
  // 'sent' stamps sentAt (real LINE/SMS dispatch deferred to a future cron worker).
  return reminderRepo.setStatus(tenantId, id, status, status === 'sent' ? new Date() : undefined)
}
