// Proactive pet reminder service (Phase 4). Actual LINE/SMS send is deferred (stub marks sent).
import { z } from 'zod'
import { AppError } from '../utils/errors'
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
// Real LINE/SMS send is deferred — for now we mark them sent and let the caller log.
export async function dispatchDue(): Promise<{ sent: number }> {
  const due = await reminderRepo.listAllDue()
  for (const r of due) {
    // TODO(phase4+): integrate LINE Messaging API / Twilio SMS here before marking sent.
    await reminderRepo.markSent(r.id)
  }
  return { sent: due.length }
}

export async function setStatus(tenantId: number, id: number, status: string) {
  const existing = await reminderRepo.findById(tenantId, id)
  if (!existing) throw new ReminderError('Reminder not found', 404)
  // 'sent' stamps sentAt (real LINE/SMS dispatch deferred to a future cron worker).
  return reminderRepo.setStatus(tenantId, id, status, status === 'sent' ? new Date() : undefined)
}
