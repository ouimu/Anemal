/**
 * reset-demo-data.ts — wipe operational data for the dev/test seed tenants, then
 * reseed a small, clean, branch-assigned demo dataset (see prisma/seed.ts).
 *
 * Motivation: the dev database accumulated ~245 pets with branchId=NULL (test runs
 * that hit the dev DB before the .env.test override was added). NULL-branch records
 * only appear under "All Branches", so per-branch KPIs looked broken (247 → 1).
 * This clears the junk so every seeded record belongs to a real branch.
 *
 * Keeps: users, roles, branches, inventory, tenant settings. Removes: pets, owners,
 * appointments, invoices, hospitalizations, blood-bank, medical records, vaccinations.
 *
 * Run:  npx ts-node scripts/reset-demo-data.ts
 * Targets whatever DATABASE_URL resolves to (dev DB by default via ../../.env).
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { PrismaClient } from '@prisma/client'
import { main as seed } from '../prisma/seed'

const prisma = new PrismaClient()

async function wipeTenant(tenantId: number) {
  const where = { tenantId }
  // Child → parent order. Most pet/owner children cascade, but invoices and medical
  // records use restrict FKs to pets, so operational rows are cleared explicitly first.
  await prisma.dailyInpatientCare.deleteMany({ where })
  await prisma.hospitalization.deleteMany({ where })
  await prisma.bloodTransfusion.deleteMany({ where })
  await prisma.bloodDonation.deleteMany({ where })
  await prisma.bloodDonor.deleteMany({ where })
  await prisma.groomingBooking.deleteMany({ where })
  await prisma.vaccination.deleteMany({ where })
  await prisma.attachment.deleteMany({ where })
  await prisma.prescription.deleteMany({ where })
  await prisma.paymentHistory.deleteMany({ where })
  await prisma.loyaltyTransaction.deleteMany({ where })
  await prisma.invoiceItem.deleteMany({ where })
  await prisma.invoice.deleteMany({ where })
  await prisma.medicalRecord.deleteMany({ where })
  await prisma.appointment.deleteMany({ where })
  await prisma.petReminder.deleteMany({ where })
  await prisma.pet.deleteMany({ where })
  await prisma.owner.deleteMany({ where })

  // Remove ad-hoc users created during manual testing (e.g. "Staff Test"). Keep only the
  // canonical seed accounts; their branch assignments and roles are re-created by the seed.
  const SEED_USERNAMES = ['admin_a', 'doctor_a', 'staff_a', 'admin_b', 'doctor_b', 'staff_b']
  const junkUsers = await prisma.user.findMany({
    where: { tenantId, username: { notIn: SEED_USERNAMES } },
    select: { id: true, username: true },
  })
  if (junkUsers.length > 0) {
    const ids = junkUsers.map(u => u.id)
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } })
    await prisma.userBranch.deleteMany({ where: { userId: { in: ids } } })
    await prisma.user.deleteMany({ where: { id: { in: ids } } })
    console.log(`  ✓ removed ${junkUsers.length} non-seed user(s): ${junkUsers.map(u => u.username).join(', ')}`)
  }
  console.log(`  ✓ wiped operational data for tenant ${tenantId}`)
}

async function main() {
  console.log('🧹 Resetting demo data…')
  const tenants = await prisma.tenant.findMany({
    where: { subdomain: { in: ['dev-clinic', 'test-clinic'] } },
    select: { id: true, subdomain: true },
  })
  for (const t of tenants) {
    console.log(`  → tenant ${t.subdomain} (id ${t.id})`)
    await wipeTenant(t.id)
  }
  console.log('🌱 Reseeding…')
  await seed()
  console.log('✅ Reset complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
