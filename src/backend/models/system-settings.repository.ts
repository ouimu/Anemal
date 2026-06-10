// System-settings repository — platform-global key/value store (NOT tenant-scoped).
// Access restricted to super admin at the route layer (Phase 1.5).

import prisma from '../config/db'

export function getAll() {
  return prisma.systemSettings.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] })
}

export function getByKey(key: string) {
  return prisma.systemSettings.findUnique({ where: { key } })
}

export function getByCategory(category: string) {
  return prisma.systemSettings.findMany({ where: { category }, orderBy: { key: 'asc' } })
}

export function updateByKey(key: string, value: string, updatedBy: number | null) {
  return prisma.systemSettings.update({ where: { key }, data: { value, updatedBy } })
}
