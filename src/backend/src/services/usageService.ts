// @db-agent reviewed — all queries scoped by tenantId
import prisma from '../config/db'

export async function getClinicUsage(tenantId: number) {
  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    totalPets,
    totalOwners,
    totalUsers,
    activeUsers,
    appointmentsThisMonth,
    appointmentsToday,
    invoicesThisMonth,
    settings,
  ] = await Promise.all([
    prisma.pet.count({ where: { tenantId, isActive: true } }),
    prisma.owner.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId, isActive: true } }),
    prisma.appointment.count({ where: { tenantId, scheduledAt: { gte: start } } }),
    prisma.appointment.count({
      where: {
        tenantId,
        scheduledAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          lt:  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
        },
      },
    }),
    prisma.invoice.count({ where: { tenantId, createdAt: { gte: start } } }),
    prisma.tenantSettings.findUnique({ where: { tenantId } }),
  ])

  return {
    totalPets,
    totalOwners,
    totalUsers,
    activeUsers,
    appointmentsThisMonth,
    appointmentsToday,
    invoicesThisMonth,
    planTier: settings?.planTier ?? 'starter',
  }
}

export async function getClinicSummary(tenantId: number) {
  const now     = new Date()
  const start   = new Date(now.getFullYear(), now.getMonth(), 1)
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [appointmentsToday, appointmentsThisMonth, totalPets, invoicesThisMonth, vaccinationsDueSoon] = await Promise.all([
    prisma.appointment.count({
      where: {
        tenantId,
        scheduledAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          lt:  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
        },
      },
    }),
    prisma.appointment.count({ where: { tenantId, scheduledAt: { gte: start } } }),
    prisma.pet.count({ where: { tenantId, isActive: true } }),
    prisma.invoice.count({ where: { tenantId, createdAt: { gte: start } } }),
    prisma.vaccination.count({ where: { tenantId, nextDueAt: { gte: now, lte: in7days } } }),
  ])

  return { appointmentsToday, appointmentsThisMonth, totalPets, invoicesThisMonth, vaccinationsDueSoon }
}
