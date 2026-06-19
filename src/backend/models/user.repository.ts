// User repository — all Prisma access for the users table.
// @db-agent: every read is scoped by tenantId; writes are guarded by a prior
// tenant-scoped existence check in the service.

import prisma from '../config/db'
import type { CreateUserRequest, UpdateUserRequest } from '../types'

export function findUsers(tenantId: number) {
  return prisma.user.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } })
}

export function findUserById(tenantId: number, userId: number) {
  return prisma.user.findFirst({ where: { id: userId, tenantId } })
}

export function createUser(
  tenantId: number,
  data: { name: string; email: string; passwordHash: string; role: CreateUserRequest['role'] },
) {
  return prisma.user.create({ data: { tenantId, ...data } })
}

export function updateUser(userId: number, data: UpdateUserRequest) {
  return prisma.user.update({ where: { id: userId }, data })
}

export function setActive(userId: number, isActive: boolean) {
  return prisma.user.update({ where: { id: userId }, data: { isActive } })
}

// Phase 1.5-B — personal preferences (language, default calendar view, theme)
export function getPreferences(tenantId: number, userId: number) {
  return prisma.user.findFirst({
    where:  { id: userId, tenantId },
    select: { language: true, defaultCalendarView: true, theme: true },
  })
}

export function updatePreferences(
  tenantId: number,
  userId: number,
  data: { language?: string; defaultCalendarView?: string; theme?: string },
) {
  // updateMany keeps the write tenant-scoped (plain update matches by id alone)
  return prisma.user.updateMany({ where: { id: userId, tenantId }, data })
}
