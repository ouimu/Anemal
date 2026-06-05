// @db-agent — Seed script
// Creates 2 tenants with 3 users each for dev/test isolation testing
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcrypt'

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

  const usersToSeed = [
    // Tenant A
    { tenantId: tenantA.id, name: 'Admin A',  email: 'admin@dev-clinic.com',  role: Role.admin,  password: 'AdminPass1!' },
    { tenantId: tenantA.id, name: 'Doctor A', email: 'doctor@dev-clinic.com', role: Role.doctor, password: 'DoctorPass1!' },
    { tenantId: tenantA.id, name: 'Staff A',  email: 'staff@dev-clinic.com',  role: Role.staff,  password: 'StaffPass1!' },
    // Tenant B
    { tenantId: tenantB.id, name: 'Admin B',  email: 'admin@test-clinic.com',  role: Role.admin,  password: 'AdminPass2!' },
    { tenantId: tenantB.id, name: 'Doctor B', email: 'doctor@test-clinic.com', role: Role.doctor, password: 'DoctorPass2!' },
    { tenantId: tenantB.id, name: 'Staff B',  email: 'staff@test-clinic.com',  role: Role.staff,  password: 'StaffPass2!' },
  ]

  for (const u of usersToSeed) {
    const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS)
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: u.tenantId, email: u.email } },
      update: {},
      create: {
        tenantId:     u.tenantId,
        name:         u.name,
        email:        u.email,
        passwordHash,
        role:         u.role,
      },
    })
    console.log(`  ✓ ${u.role} — ${u.email}`)
  }

  // Phase 3 — sample inventory for Tenant A (idempotent by name).
  const soon = new Date(); soon.setDate(soon.getDate() + 20) // expiring-soon demo
  const products = [
    { name: 'Amoxicillin 250mg', category: 'Medicine',  unit: 'tablet', unitPrice: 12,  unitCost: 6,   stockQuantity: 200, minStockLevel: 50 },
    { name: 'Apoquel 5.4mg',     category: 'Medicine',  unit: 'tablet', unitPrice: 30,  unitCost: 18,  stockQuantity: 120, minStockLevel: 20 },
    { name: 'Rabies Vaccine',    category: 'Vaccine',   unit: 'vial',   unitPrice: 350, unitCost: 180, stockQuantity: 5,   minStockLevel: 10, expiryDate: soon },
    { name: 'Surgical Gloves',   category: 'Supply',    unit: 'box',    unitPrice: 150, unitCost: 90,  stockQuantity: 8,   minStockLevel: 10 },
    { name: 'Dog Shampoo',       category: 'Grooming',  unit: 'bottle', unitPrice: 220, unitCost: 110, stockQuantity: 40,  minStockLevel: 5 },
    { name: 'Premium Cat Food',  category: 'Food',      unit: 'bag',    unitPrice: 600, unitCost: 420, stockQuantity: 25,  minStockLevel: 5 },
  ]
  for (const p of products) {
    const existing = await prisma.inventoryItem.findFirst({ where: { tenantId: tenantA.id, name: p.name } })
    if (!existing) {
      await prisma.inventoryItem.create({ data: { tenantId: tenantA.id, ...p } })
      console.log(`  ✓ product — ${p.name}`)
    }
  }

  console.log('✅ Seed complete.')
  console.log(`   Tenant A: ${tenantA.subdomain} (id: ${tenantA.id})`)
  console.log(`   Tenant B: ${tenantB.subdomain} (id: ${tenantB.id})`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
