// @db-agent — Seed script
// Creates 2 tenants with 3 users each for dev/test isolation testing
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import * as platformAuthRepo from '../models/platform-auth.repository'
import { seedPlans, seedRbac } from './seed-rbac'

const prisma = new PrismaClient()
const SALT_ROUNDS = 10

async function seedCompanyTypes() {
  const companyTypes = [
    { key: 'animal_hospital',     nameEn: 'Animal Hospital',      nameTh: 'โรงพยาบาลสัตว์',         sortOrder: 0 },
    { key: 'animal_clinic',       nameEn: 'Animal Clinic',        nameTh: 'คลีนิคสัตว์',             sortOrder: 1 },
    { key: 'pet_hotel',           nameEn: 'Pet Hotel',            nameTh: 'โรงแรมรับฝากสัตว์เลี้ยง', sortOrder: 2 },
    { key: 'animal_health_center',nameEn: 'Animal Health Center', nameTh: 'ศูนย์สุขภาพสัตว์',        sortOrder: 3 },
    { key: 'other',               nameEn: 'Other',                nameTh: 'อื่น ๆ',                  sortOrder: 4 },
  ]
  for (const ct of companyTypes) {
    await prisma.companyType.upsert({
      where:  { key: ct.key },
      update: { nameEn: ct.nameEn, nameTh: ct.nameTh, sortOrder: ct.sortOrder },
      create: { ...ct },
    })
  }
  console.log(`  ✓ company_types — ${companyTypes.length} types seeded`)
}

async function main() {
  console.log('🌱 Seeding database...')

  // Session D-1: seed company type reference data first (idempotent)
  await seedCompanyTypes()

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

  // Phase 8 (5-A) — seed system roles + permissions first, then resolve IDs
  await seedRbac()

  // resolve system ClinicRole IDs for User.roleId + UserRole seeding
  // (ADR-0019/D-7: LegacyRole enum + User.role column retired, roleId is now
  // the single source of truth — see the roleId-based migration this seed
  // script had to follow.)
  const [adminClinicRole, doctorClinicRole, staffClinicRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor',       tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
  ])

  // Session D-1: username added; unique finder is now tenantId_username (email unique dropped)
  const usersToSeed = [
    // Tenant A
    { tenantId: tenantA.id, name: 'Admin A',  username: 'admin_a',  email: 'admin@dev-clinic.com',  roleKey: 'clinic_admin', roleId: adminClinicRole.id,  password: 'AdminPass1!' },
    { tenantId: tenantA.id, name: 'Doctor A', username: 'doctor_a', email: 'doctor@dev-clinic.com', roleKey: 'doctor',       roleId: doctorClinicRole.id, password: 'DoctorPass1!' },
    { tenantId: tenantA.id, name: 'Staff A',  username: 'staff_a',  email: 'staff@dev-clinic.com',  roleKey: 'clinic_staff', roleId: staffClinicRole.id,  password: 'StaffPass1!' },
    // T-5C-03: superadmin removed from users — platform admin lives in platform_users (see T-5C-02)
    // Tenant B
    { tenantId: tenantB.id, name: 'Admin B',  username: 'admin_b',  email: 'admin@test-clinic.com',  roleKey: 'clinic_admin', roleId: adminClinicRole.id,  password: 'AdminPass2!' },
    { tenantId: tenantB.id, name: 'Doctor B', username: 'doctor_b', email: 'doctor@test-clinic.com', roleKey: 'doctor',       roleId: doctorClinicRole.id, password: 'DoctorPass2!' },
    { tenantId: tenantB.id, name: 'Staff B',  username: 'staff_b',  email: 'staff@test-clinic.com',  roleKey: 'clinic_staff', roleId: staffClinicRole.id,  password: 'StaffPass2!' },
  ]

  for (const u of usersToSeed) {
    const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS)
    const branchId = mainBranch[u.tenantId]
    // Session D-1: unique finder is now tenantId_username (email unique index removed)
    const seededUser = await prisma.user.upsert({
      where: { tenantId_username: { tenantId: u.tenantId, username: u.username } },
      update: { branchId, email: u.email, roleId: u.roleId },
      create: { tenantId: u.tenantId, branchId, name: u.name, username: u.username, email: u.email, passwordHash, roleId: u.roleId },
    })
    console.log(`  ✓ ${u.roleKey} — ${u.email}`)

    // Phase 8 (5-B) — seed UserRole join-table row so requirePermission() resolves permissions
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: seededUser.id, roleId: u.roleId } },
      update: {},
      create: { userId: seededUser.id, roleId: u.roleId, tenantId: u.tenantId },
    })
  }

  // Task 4 (two-step login): seed user_branches for non-admin seed users
  // so staff/doctor can complete branch selection at login. doctor_a covers BOTH
  // dev-clinic branches so each branch has visible staff; staff_a is Main-only.
  // (Admins get no assignment → they appear under every branch.)
  const nonAdminSeedMap: { tenantId: number; username: string; branchId: number }[] = [
    { tenantId: tenantA.id, username: 'doctor_a', branchId: branchA.id },
    { tenantId: tenantA.id, username: 'doctor_a', branchId: branchA2.id },
    { tenantId: tenantA.id, username: 'staff_a',  branchId: branchA.id },
    { tenantId: tenantB.id, username: 'doctor_b', branchId: branchB.id },
    { tenantId: tenantB.id, username: 'staff_b',  branchId: branchB.id },
  ]
  for (const entry of nonAdminSeedMap) {
    const u = await prisma.user.findFirst({ where: { tenantId: entry.tenantId, username: entry.username } })
    if (u) {
      await prisma.userBranch.upsert({
        where:  { tenantId_userId_branchId: { tenantId: entry.tenantId, userId: u.id, branchId: entry.branchId } },
        update: {},
        create: { tenantId: entry.tenantId, userId: u.id, branchId: entry.branchId },
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

  // ── Demo clinic data for dev-clinic (Tenant A) ──────────────────────────────
  // Small, branch-assigned dataset so the branch switcher produces clean, verifiable
  // splits: every pet/appointment/invoice/inpatient belongs to a specific branch.
  // Main Branch = 3 pets, Downtown Branch = 2 pets (5 total across 4 owners).
  const doctorA = await prisma.user.findFirst({ where: { tenantId: tenantA.id, username: 'doctor_a' } })
  const doctorAId = doctorA!.id

  interface DemoOwner {
    firstName: string; lastName: string; phone: string; email: string
    pets: { name: string; species: string; breed: string; gender: 'male' | 'female'; weightKg: number; branchId: number }[]
  }
  const demoOwners: DemoOwner[] = [
    {
      firstName: 'Somchai', lastName: 'Prasit', phone: '081-555-0101', email: 'somchai.prasit@example.com',
      pets: [{ name: 'Khaolek', species: 'Dog', breed: 'Thai Ridgeback', gender: 'male', weightKg: 24.0, branchId: branchA.id }],
    },
    {
      firstName: 'Pranee', lastName: 'Chaowalit', phone: '081-555-0102', email: 'pranee.chaowalit@example.com',
      pets: [{ name: 'Muffin', species: 'Cat', breed: 'Persian', gender: 'female', weightKg: 4.1, branchId: branchA.id }],
    },
    {
      firstName: 'Anong', lastName: 'Ratanaporn', phone: '081-555-0103', email: 'anong.ratanaporn@example.com',
      pets: [
        { name: 'Thongdaeng', species: 'Dog', breed: 'Golden Retriever', gender: 'male', weightKg: 29.5, branchId: branchA2.id },
        { name: 'Nomyen', species: 'Cat', breed: 'Siamese', gender: 'female', weightKg: 3.7, branchId: branchA2.id },
      ],
    },
    {
      firstName: 'Wichai', lastName: 'Sombat', phone: '081-555-0104', email: 'wichai.sombat@example.com',
      pets: [{ name: 'Guagai', species: 'Dog', breed: 'Pomeranian', gender: 'male', weightKg: 3.2, branchId: branchA.id }],
    },
  ]

  // petByName lets later demo records (appointments, invoices, inpatients, donors) link by pet name.
  const petByName: Record<string, { id: number; branchId: number }> = {}
  for (const o of demoOwners) {
    let owner = await prisma.owner.findFirst({ where: { tenantId: tenantA.id, phone: o.phone } })
    if (!owner) {
      owner = await prisma.owner.create({
        data: { tenantId: tenantA.id, firstName: o.firstName, lastName: o.lastName, phone: o.phone, email: o.email },
      })
      console.log(`  ✓ owner — ${o.firstName} ${o.lastName}`)
    }
    for (const petData of o.pets) {
      let pet = await prisma.pet.findFirst({ where: { tenantId: tenantA.id, ownerId: owner.id, name: petData.name } })
      if (!pet) {
        pet = await prisma.pet.create({
          data: {
            tenantId: tenantA.id, ownerId: owner.id, branchId: petData.branchId,
            name: petData.name, species: petData.species, breed: petData.breed, gender: petData.gender, weightKg: petData.weightKg,
          },
        })
        console.log(`  ✓ pet — ${petData.name} (${o.firstName}'s ${petData.species.toLowerCase()})`)
      }
      petByName[petData.name] = { id: pet.id, branchId: petData.branchId }
    }
  }

  const now = new Date()
  const todayAt = (h: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0)
  const thisMonthAt = (day: number, h: number) => new Date(now.getFullYear(), now.getMonth(), day, h, 0, 0)

  // Appointments — 2 at Main (1 today, 1 earlier this month), 1 at Downtown (today).
  const demoAppointments = [
    { pet: 'Khaolek',    scheduledAt: todayAt(10),        reason: 'Annual vaccination',    branchId: branchA.id },
    { pet: 'Muffin',     scheduledAt: thisMonthAt(3, 14), reason: 'Skin check',            branchId: branchA.id },
    { pet: 'Thongdaeng', scheduledAt: todayAt(11),        reason: 'Post-surgery follow-up', branchId: branchA2.id },
  ]
  for (const a of demoAppointments) {
    const pet = petByName[a.pet]
    const exists = await prisma.appointment.findFirst({ where: { tenantId: tenantA.id, petId: pet.id, reason: a.reason } })
    if (!exists) {
      await prisma.appointment.create({
        data: { tenantId: tenantA.id, branchId: a.branchId, petId: pet.id, doctorId: doctorAId, scheduledAt: a.scheduledAt, reason: a.reason },
      })
      console.log(`  ✓ appointment — ${a.pet} (${a.reason})`)
    }
  }

  // Invoices (paid, earlier this month) — 2 at Main, 1 at Downtown. issuedAt is backdated
  // a few days so it falls inside the dashboard's [1st-of-month, today) revenue window
  // (the revenue-by-branch report is exclusive of "today").
  const demoInvoices = [
    { pet: 'Khaolek',    invoiceNo: 'INV-DEMO-001', total: 500,  branchId: branchA.id,  day: 2 },
    { pet: 'Muffin',     invoiceNo: 'INV-DEMO-002', total: 800,  branchId: branchA.id,  day: 4 },
    { pet: 'Thongdaeng', invoiceNo: 'INV-DEMO-003', total: 1200, branchId: branchA2.id, day: 5 },
  ]
  for (const inv of demoInvoices) {
    const pet = petByName[inv.pet]
    const exists = await prisma.invoice.findFirst({ where: { tenantId: tenantA.id, invoiceNo: inv.invoiceNo } })
    if (!exists) {
      // Clamp to at most yesterday so a run on the 1st–5th of the month still lands in-window.
      const issuedDay = Math.min(inv.day, Math.max(1, now.getDate() - 1))
      const issuedAt = thisMonthAt(issuedDay, 12)
      await prisma.invoice.create({
        data: {
          tenantId: tenantA.id, branchId: inv.branchId, petId: pet.id, invoiceNo: inv.invoiceNo,
          subtotal: inv.total, taxAmount: 0, totalAmount: inv.total, paymentStatus: 'paid',
          issuedAt, paidAt: issuedAt,
          items: { create: [{ tenantId: tenantA.id, description: 'Consultation & treatment', itemType: 'service', quantity: 1, unitPrice: inv.total, totalPrice: inv.total }] },
        },
      })
      console.log(`  ✓ invoice — ${inv.invoiceNo} (${inv.pet})`)
    }
  }

  // Hospitalizations (admitted / current inpatients) — 1 at Main, 1 at Downtown.
  const demoInpatients = [
    { pet: 'Muffin',     reason: 'Observation after dental surgery', cageNo: 'A-01', branchId: branchA.id },
    { pet: 'Thongdaeng', reason: 'IV fluids for recovery',           cageNo: 'D-02', branchId: branchA2.id },
  ]
  for (const h of demoInpatients) {
    const pet = petByName[h.pet]
    const exists = await prisma.hospitalization.findFirst({ where: { tenantId: tenantA.id, petId: pet.id, status: 'admitted' } })
    if (!exists) {
      await prisma.hospitalization.create({
        data: { tenantId: tenantA.id, branchId: h.branchId, petId: pet.id, reason: h.reason, cageNo: h.cageNo, status: 'admitted', doctorInCharge: doctorAId, dailyRate: 800 },
      })
      console.log(`  ✓ inpatient — ${h.pet} (${h.cageNo})`)
    }
  }

  // Blood-bank donors — 1 dog per branch (branch derived from the donor pet's branchId).
  for (const donorPetName of ['Khaolek', 'Thongdaeng']) {
    const pet = petByName[donorPetName]
    const exists = await prisma.bloodDonor.findFirst({ where: { tenantId: tenantA.id, petId: pet.id } })
    if (!exists) {
      await prisma.bloodDonor.create({ data: { tenantId: tenantA.id, petId: pet.id, bloodType: 'DEA 1.1+' } })
      console.log(`  ✓ blood donor — ${donorPetName}`)
    }
  }

  // T-5C-02 — Platform super admin (platform plane, not tenant-scoped)
  const platformEmail    = process.env.PLATFORM_ADMIN_EMAIL    || 'admin@anemal.app'
  const platformPassword = process.env.PLATFORM_ADMIN_PASSWORD || 'PlatformAdmin1!'
  const platformName     = process.env.PLATFORM_ADMIN_NAME     || 'Platform Super Admin'
  const platformHash     = await bcrypt.hash(platformPassword, SALT_ROUNDS)
  await platformAuthRepo.upsertPlatformSuperAdmin(platformEmail, platformName, platformHash)
  console.log(`  ✓ platform_super_admin — ${platformEmail}`)

  await seedPlans()

  console.log(`  ✓ branches: ${branchA.name}, ${branchA2.name} (dev-clinic), ${branchB.name} (test-clinic)`)
  console.log('✅ Seed complete.')
  console.log(`   Tenant A: ${tenantA.subdomain} (id: ${tenantA.id})`)
  console.log(`   Tenant B: ${tenantB.subdomain} (id: ${tenantB.id})`)
}

export { main }

if (require.main === module) {
  main()
    .catch((e) => { console.error(e); process.exit(1) })
    .finally(() => prisma.$disconnect())
}
