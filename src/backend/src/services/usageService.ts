// @db-agent reviewed — all queries scoped by tenantId
import * as usageRepo from '../models/usage.repository'

export async function getClinicUsage(tenantId: number) {
  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

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
    usageRepo.countActivePets(tenantId),
    usageRepo.countOwners(tenantId),
    usageRepo.countUsers(tenantId),
    usageRepo.countActiveUsers(tenantId),
    usageRepo.countAppointmentsSince(tenantId, start),
    usageRepo.countAppointmentsBetween(tenantId, today, tomorrow),
    usageRepo.countInvoicesSince(tenantId, start),
    usageRepo.findSettings(tenantId),
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
  const now      = new Date()
  const start    = new Date(now.getFullYear(), now.getMonth(), 1)
  const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const in7days  = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [appointmentsToday, appointmentsThisMonth, totalPets, invoicesThisMonth, vaccinationsDueSoon] = await Promise.all([
    usageRepo.countAppointmentsBetween(tenantId, today, tomorrow),
    usageRepo.countAppointmentsSince(tenantId, start),
    usageRepo.countActivePets(tenantId),
    usageRepo.countInvoicesSince(tenantId, start),
    usageRepo.countVaccinationsBetween(tenantId, now, in7days),
  ])

  return { appointmentsToday, appointmentsThisMonth, totalPets, invoicesThisMonth, vaccinationsDueSoon }
}
