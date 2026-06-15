// @db-agent — Seed script
// Creates 2 tenants with 3 users each for dev/test isolation testing
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { PrismaClient, LegacyRole } from '@prisma/client'
import bcrypt from 'bcrypt'
import * as platformAuthRepo from '../models/platform-auth.repository'

const prisma = new PrismaClient()
const SALT_ROUNDS = 10

async function main() {
  console.log('🌱 Seeding database...')

  // Tenant A — Dev Clinic
  const tenantA = await prisma.tenant.upsert({
    where: { subdomain: 'dev-clinic' },
    update: {},
    create: { name: 'Dev Clinic', subdomain: 'dev-clinic' },
  })

  // Tenant B — Test Clinic (used by @qa-agent for isolation tests)
  const tenantB = await prisma.tenant.upsert({
    where: { subdomain: 'test-clinic' },
    update: {},
    create: { name: 'Test Clinic', subdomain: 'test-clinic' },
  })

  // Phase 1.5 — guarantee a tenant_settings row exists for each seeded tenant (S2.4)
  for (const t of [tenantA, tenantB]) {
    await prisma.tenantSettings.upsert({ where: { tenantId: t.id }, update: {}, create: { tenantId: t.id } })
  }

  // Phase 4 — branches (idempotent). dev-clinic gets a 2nd branch for transfer/switch demos.
  const branchA = await prisma.branch.upsert({
    where: { tenantId_name: { tenantId: tenantA.id, name: 'Main Branch' } },
    update: {}, create: { tenantId: tenantA.id, name: 'Main Branch', phone: '02-000-0001' },
  })
  const branchA2 = await prisma.branch.upsert({
    where: { tenantId_name: { tenantId: tenantA.id, name: 'Downtown Branch' } },
    update: {}, create: { tenantId: tenantA.id, name: 'Downtown Branch', phone: '02-000-0002' },
  })
  const branchB = await prisma.branch.upsert({
    where: { tenantId_name: { tenantId: tenantB.id, name: 'Main Branch' } },
    update: {}, create: { tenantId: tenantB.id, name: 'Main Branch' },
  })
  const mainBranch: Record<number, number> = { [tenantA.id]: branchA.id, [tenantB.id]: branchB.id }

  const usersToSeed = [
    // Tenant A
    { tenantId: tenantA.id, name: 'Admin A',  email: 'admin@dev-clinic.com',  role: LegacyRole.admin,  password: 'AdminPass1!' },
    { tenantId: tenantA.id, name: 'Doctor A', email: 'doctor@dev-clinic.com', role: LegacyRole.doctor, password: 'DoctorPass1!' },
    { tenantId: tenantA.id, name: 'Staff A',  email: 'staff@dev-clinic.com',  role: LegacyRole.staff,  password: 'StaffPass1!' },
    // T-5C-03: superadmin removed from users — platform admin lives in platform_users (see T-5C-02)
    // Tenant B
    { tenantId: tenantB.id, name: 'Admin B',  email: 'admin@test-clinic.com',  role: LegacyRole.admin,  password: 'AdminPass2!' },
    { tenantId: tenantB.id, name: 'Doctor B', email: 'doctor@test-clinic.com', role: LegacyRole.doctor, password: 'DoctorPass2!' },
    { tenantId: tenantB.id, name: 'Staff B',  email: 'staff@test-clinic.com',  role: LegacyRole.staff,  password: 'StaffPass2!' },
  ]

  // Phase 8 (5-A) — resolve system ClinicRole IDs for UserRole seeding
  const [adminClinicRole, doctorClinicRole, staffClinicRole] = await Promise.all([
    prisma.clinicRole.findFirst({ where: { key: 'clinic_admin', tenantId: null } }),
    prisma.clinicRole.findFirst({ where: { key: 'doctor',       tenantId: null } }),
    prisma.clinicRole.findFirst({ where: { key: 'clinic_staff', tenantId: null } }),
  ])

  const legacyRoleToClinicRole: Partial<Record<LegacyRole, typeof adminClinicRole>> = {
    [LegacyRole.admin]:  adminClinicRole,
    [LegacyRole.doctor]: doctorClinicRole,
    [LegacyRole.staff]:  staffClinicRole,
  }

  for (const u of usersToSeed) {
    const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS)
    const branchId = mainBranch[u.tenantId]
    const seededUser = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: u.tenantId, email: u.email } },
      update: { branchId },
      create: { tenantId: u.tenantId, branchId, name: u.name, email: u.email, passwordHash, role: u.role },
    })
    console.log(`  ✓ ${u.role} — ${u.email}`)

    // Phase 8 (5-B) — seed UserRole join-table row so requirePermission() resolves permissions
    const clinicRole = legacyRoleToClinicRole[u.role]
    if (clinicRole) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: seededUser.id, roleId: clinicRole.id } },
        update: {},
        create: { userId: seededUser.id, roleId: clinicRole.id, tenantId: u.tenantId },
      })
    }
  }

  // Phase 3/4 — sample catalog + per-branch stock for Tenant A Main Branch (idempotent by name).
  const soon = new Date(); soon.setDate(soon.getDate() + 20) // expiring-soon demo
  const products = [
    { name: 'Amoxicillin 250mg', category: 'Medicine',  unit: 'tablet', unitPrice: 12,  unitCost: 6,   stockQty: 200, minStockQty: 50 },
    { name: 'Apoquel 5.4mg',     category: 'Medicine',  unit: 'tablet', unitPrice: 30,  unitCost: 18,  stockQty: 120, minStockQty: 20 },
    { name: 'Rabies Vaccine',    category: 'Vaccine',   unit: 'vial',   unitPrice: 350, unitCost: 180, stockQty: 5,   minStockQty: 10, expiryDate: soon },
    { name: 'Surgical Gloves',   category: 'Supply',    unit: 'box',    unitPrice: 150, unitCost: 90,  stockQty: 8,   minStockQty: 10 },
    { name: 'Dog Shampoo',       category: 'Grooming',  unit: 'bottle', unitPrice: 220, unitCost: 110, stockQty: 40,  minStockQty: 5 },
    { name: 'Premium Cat Food',  category: 'Food',      unit: 'bag',    unitPrice: 600, unitCost: 420, stockQty: 25,  minStockQty: 5 },
  ]
  for (const p of products) {
    let item = await prisma.inventoryItem.findFirst({ where: { tenantId: tenantA.id, name: p.name } })
    if (!item) {
      item = await prisma.inventoryItem.create({
        data: { tenantId: tenantA.id, name: p.name, category: p.category, unit: p.unit, unitPrice: p.unitPrice, unitCost: p.unitCost },
      })
      console.log(`  ✓ product — ${p.name}`)
    }
    await prisma.branchInventory.upsert({
      where: { tenantId_branchId_productId: { tenantId: tenantA.id, branchId: branchA.id, productId: item.id } },
      update: {},
      create: { tenantId: tenantA.id, branchId: branchA.id, productId: item.id, stockQty: p.stockQty, minStockQty: p.minStockQty, expiryDate: p.expiryDate ?? null },
    })
  }

  // T-5C-02 — Platform super admin (platform plane, not tenant-scoped)
  const platformEmail    = process.env.PLATFORM_ADMIN_EMAIL    || 'admin@anemal.co'
  const platformPassword = process.env.PLATFORM_ADMIN_PASSWORD || 'PlatformAdmin1!'
  const platformName     = process.env.PLATFORM_ADMIN_NAME     || 'Platform Super Admin'
  const platformHash     = await bcrypt.hash(platformPassword, SALT_ROUNDS)
  await platformAuthRepo.upsertPlatformSuperAdmin(platformEmail, platformName, platformHash)
  console.log(`  ✓ platform_super_admin — ${platformEmail}`)

  console.log(`  ✓ branches: ${branchA.name}, ${branchA2.name} (dev-clinic), ${branchB.name} (test-clinic)`)
  console.log('✅ Seed complete.')
  console.log(`   Tenant A: ${tenantA.subdomain} (id: ${tenantA.id})`)
  console.log(`   Tenant B: ${tenantB.subdomain} (id: ${tenantB.id})`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
