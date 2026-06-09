// Proactive pet reminder repository (Phase 4, FR-03-09 / Module 4.7). Tenant-scoped.
import prisma from '../config/db'
import type { ReminderInput } from '../services/reminder.service'

const petSel = { select: { id: true, name: true, species: true } }

export function create(tenantId: number, data: ReminderInput) {
  return prisma.petReminder.create({
    data: {
      tenantId, petId: data.petId, reminderType: data.reminderType, message: data.message,
      dueDate: new Date(data.dueDate), channel: data.channel ?? 'line',
    },
  })
}

export function list(tenantId: number, status?: string, petId?: number) {
  return prisma.petReminder.findMany({
    where: { tenantId, ...(status ? { status } : {}), ...(petId ? { petId } : {}) },
    include: { pet: petSel },
    orderBy: { dueDate: 'asc' },
  })
}

export function listDue(tenantId: number) {
  const end = new Date(); end.setHours(23, 59, 59, 999)
  return prisma.petReminder.findMany({
    where: { tenantId, status: 'pending', dueDate: { lte: end } },
    include: { pet: petSel },
    orderBy: { dueDate: 'asc' },
  })
}

// Cross-tenant scan for the background worker only (system context, not request-scoped).
export function listAllDue() {
  const end = new Date(); end.setHours(23, 59, 59, 999)
  return prisma.petReminder.findMany({
    where: { status: 'pending', dueDate: { lte: end } },
    include: { pet: petSel },
    orderBy: { dueDate: 'asc' },
  })
}

export function markSent(id: number) {
  return prisma.petReminder.update({ where: { id }, data: { status: 'sent', sentAt: new Date() } })
}

export function findById(tenantId: number, id: number) {
  return prisma.petReminder.findFirst({ where: { id, tenantId } })
}

export function setStatus(tenantId: number, id: number, status: string, sentAt?: Date) {
  return prisma.petReminder
    .updateMany({ where: { id, tenantId }, data: { status, ...(sentAt ? { sentAt } : {}) } })
    .then(() => findById(tenantId, id))
}
