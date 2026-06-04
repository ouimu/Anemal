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

  console.log('✅ Seed complete.')
  console.log(`   Tenant A: ${tenantA.subdomain} (id: ${tenantA.id})`)
  console.log(`   Tenant B: ${tenantB.subdomain} (id: ${tenantB.id})`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
