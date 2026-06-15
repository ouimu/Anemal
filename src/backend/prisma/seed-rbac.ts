/**
 * seed-rbac.ts — Phase 8 (T-5A-02) RBAC seed
 *
 * Seeds:
 *   1. All permission codes from anemal-rbac-matrix/references/permission-matrix.md
 *   2. Three system roles: clinic_admin, doctor, clinic_staff  (tenantId=null, isSystem=true)
 *   3. Role-permission assignments per the authoritative permission matrix
 *
 * Idempotent: uses upsert on every record. Safe to re-run.
 *
 * @db-agent — isolation note: system roles have tenantId=null (templates).
 * Clinic-custom roles are created at runtime by clinic admins, never here.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ---------------------------------------------------------------------------
// 1. Full permission catalogue (source: anemal-rbac-matrix permission-matrix.md §2)
// ---------------------------------------------------------------------------
const PERMISSIONS: Array<{ code: string; module: string; action: string; description: string }> = [
  // Dashboard
  { code: 'dashboard.view',            module: 'dashboard',    action: 'view',        description: 'View dashboard overview' },
  // Appointments
  { code: 'appointments.view',         module: 'appointments', action: 'view',        description: 'View appointments' },
  { code: 'appointments.create',       module: 'appointments', action: 'create',      description: 'Create appointments' },
  { code: 'appointments.edit',         module: 'appointments', action: 'edit',        description: 'Edit appointments' },
  { code: 'appointments.delete',       module: 'appointments', action: 'delete',      description: 'Delete / cancel appointments' },
  // CRM — Pet & Owner
  { code: 'crm.view',                  module: 'crm',          action: 'view',        description: 'View pet & owner records' },
  { code: 'crm.create',                module: 'crm',          action: 'create',      description: 'Create pet & owner records' },
  { code: 'crm.edit',                  module: 'crm',          action: 'edit',        description: 'Edit pet & owner records' },
  { code: 'crm.delete',                module: 'crm',          action: 'delete',      description: 'Delete pet & owner records' },
  // EMR / Clinical
  { code: 'emr.view',                  module: 'emr',          action: 'view',        description: 'View EMR / clinical notes' },
  { code: 'emr.create',                module: 'emr',          action: 'create',      description: 'Create EMR / SOAP notes' },
  { code: 'emr.edit',                  module: 'emr',          action: 'edit',        description: 'Edit EMR / SOAP notes' },
  { code: 'emr.attach',                module: 'emr',          action: 'attach',      description: 'Upload lab/X-ray attachments to EMR' },
  // Prescriptions
  { code: 'prescriptions.view',        module: 'prescriptions', action: 'view',       description: 'View prescriptions' },
  { code: 'prescriptions.create',      module: 'prescriptions', action: 'create',     description: 'Write prescriptions (Rx)' },
  { code: 'prescriptions.dispense',    module: 'prescriptions', action: 'dispense',   description: 'Dispense drugs & deduct stock' },
  // Inventory
  { code: 'inventory.view',            module: 'inventory',    action: 'view',        description: 'View inventory' },
  { code: 'inventory.create',          module: 'inventory',    action: 'create',      description: 'Add inventory items' },
  { code: 'inventory.edit',            module: 'inventory',    action: 'edit',        description: 'Edit inventory items' },
  { code: 'inventory.adjust',          module: 'inventory',    action: 'adjust',      description: 'Stock movements / adjustments' },
  // Billing / POS
  { code: 'billing.view',              module: 'billing',      action: 'view',        description: 'View invoices & billing' },
  { code: 'billing.create',            module: 'billing',      action: 'create',      description: 'Create invoices' },
  { code: 'billing.payment',           module: 'billing',      action: 'payment',     description: 'Record payments' },
  { code: 'billing.void',              module: 'billing',      action: 'void',        description: 'Void / refund invoices' },
  // Inpatient
  { code: 'inpatient.view',            module: 'inpatient',    action: 'view',        description: 'View inpatient / hospitalization' },
  { code: 'inpatient.manage',          module: 'inpatient',    action: 'manage',      description: 'Manage inpatient admissions & care logs' },
  // Grooming
  { code: 'grooming.view',             module: 'grooming',     action: 'view',        description: 'View grooming bookings' },
  { code: 'grooming.manage',           module: 'grooming',     action: 'manage',      description: 'Manage grooming bookings' },
  // Blood Bank
  { code: 'bloodbank.view',            module: 'bloodbank',    action: 'view',        description: 'View blood bank' },
  { code: 'bloodbank.manage',          module: 'bloodbank',    action: 'manage',      description: 'Manage blood donors / donations / transfusions' },
  // Loyalty
  { code: 'loyalty.view',              module: 'loyalty',      action: 'view',        description: 'View loyalty programme' },
  { code: 'loyalty.manage',            module: 'loyalty',      action: 'manage',      description: 'Manage loyalty transactions' },
  // Reports
  { code: 'reports.revenue.view',      module: 'reports',      action: 'revenue.view', description: 'View revenue reports' },
  { code: 'reports.inventory.view',    module: 'reports',      action: 'inventory.view', description: 'View inventory usage reports' },
  { code: 'reports.cost.view',         module: 'reports',      action: 'cost.view',   description: 'View cost analysis reports' },
  { code: 'reports.export',            module: 'reports',      action: 'export',      description: 'Export / download reports' },
  // Clinic settings
  { code: 'clinic.settings.manage',    module: 'clinic',       action: 'settings.manage', description: 'Manage clinic-level settings' },
  { code: 'clinic.profile.view',       module: 'clinic',       action: 'profile.view',  description: 'View clinic profile / settings' },
  { code: 'clinic.profile.edit',       module: 'clinic',       action: 'profile.edit',  description: 'Edit clinic name, logo, address, taxId' },
  { code: 'clinic.branch.view',        module: 'clinic',       action: 'branch.view',   description: 'View branches' },
  { code: 'clinic.branch.manage',      module: 'clinic',       action: 'branch.manage', description: 'Create / edit branches' },
  { code: 'clinic.hours.edit',         module: 'clinic',       action: 'hours.edit',    description: 'Edit operating hours' },
  { code: 'clinic.payment.edit',       module: 'clinic',       action: 'payment.edit',  description: 'Edit PromptPay / QR settings' },
  { code: 'clinic.integrations.edit',  module: 'clinic',       action: 'integrations.edit', description: 'Edit LINE / SMS / Lab integration keys' },
  // Staff management
  { code: 'staff.view',                module: 'staff',        action: 'view',        description: 'View staff / user list' },
  { code: 'staff.manage',              module: 'staff',        action: 'manage',      description: 'Create / edit / deactivate staff' },
  { code: 'staff.assign_role',         module: 'staff',        action: 'assign_role', description: 'Assign / remove roles for staff (CR-01)' },
  // Role management
  { code: 'roles.view',                module: 'roles',        action: 'view',        description: 'View roles & permissions' },
  { code: 'roles.manage',              module: 'roles',        action: 'manage',      description: 'Create / edit custom roles & assign permissions' },
  // Audit
  { code: 'audit.view',                module: 'audit',        action: 'view',        description: 'View audit log' },
]

// ---------------------------------------------------------------------------
// 2. System role definitions and their permission codes
//    Source: permission-matrix.md §2 (E = granted, V = granted, - = denied)
//    clinic_admin gets ALL codes they have E or V.
//    doctor gets only their E or V.
//    clinic_staff gets only their E or V.
// ---------------------------------------------------------------------------
const SYSTEM_ROLES = [
  {
    key: 'clinic_admin',
    name: 'Clinic Admin',
    description: 'Full clinic configuration, staff management, all reports, and all clinical access',
    permissions: [
      'dashboard.view',
      'appointments.view', 'appointments.create', 'appointments.edit', 'appointments.delete',
      'crm.view', 'crm.create', 'crm.edit', 'crm.delete',
      'emr.view',
      // emr.create and emr.edit are denied for clinic_admin (doctor only)
      'emr.attach',
      'prescriptions.view',
      // prescriptions.create is denied (doctor only)
      'prescriptions.dispense',
      'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.adjust',
      'billing.view', 'billing.create', 'billing.payment', 'billing.void',
      'inpatient.view', 'inpatient.manage',
      'grooming.view', 'grooming.manage',
      'bloodbank.view', 'bloodbank.manage',
      'loyalty.view', 'loyalty.manage',
      'reports.revenue.view', 'reports.inventory.view', 'reports.cost.view', 'reports.export',
      'clinic.settings.manage',
      'clinic.profile.view', 'clinic.profile.edit',
      'clinic.branch.view', 'clinic.branch.manage',
      'clinic.hours.edit', 'clinic.payment.edit', 'clinic.integrations.edit',
      'staff.view', 'staff.manage', 'staff.assign_role',
      'roles.view', 'roles.manage',
      'audit.view',
    ],
  },
  {
    key: 'doctor',
    name: 'Doctor',
    description: 'Clinical work: EMR, SOAP notes, lab/X-ray, diagnosis, prescriptions',
    permissions: [
      'dashboard.view',
      'appointments.view',
      'crm.view',
      'emr.view', 'emr.create', 'emr.edit', 'emr.attach',
      'prescriptions.view', 'prescriptions.create', 'prescriptions.dispense',
      'inventory.view',
      'billing.view',
      'inpatient.view', 'inpatient.manage',
      'bloodbank.view', 'bloodbank.manage',
      'reports.inventory.view',
      'clinic.profile.view',
      'clinic.branch.view',
    ],
  },
  {
    key: 'clinic_staff',
    name: 'Clinic Staff',
    description: 'Front desk & commerce: appointments, CRM, inventory, POS/billing, dispensing',
    permissions: [
      'dashboard.view',
      'appointments.view', 'appointments.create', 'appointments.edit', 'appointments.delete',
      'crm.view', 'crm.create', 'crm.edit',
      'emr.view', 'emr.attach',
      'prescriptions.view', 'prescriptions.dispense',
      'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.adjust',
      'billing.view', 'billing.create', 'billing.payment',
      'inpatient.view', 'inpatient.manage',
      'grooming.view', 'grooming.manage',
      'bloodbank.view',
      'loyalty.view', 'loyalty.manage',
      'reports.revenue.view', 'reports.inventory.view', 'reports.cost.view', 'reports.export',
      'clinic.profile.view',
      'clinic.branch.view',
    ],
  },
]

// ---------------------------------------------------------------------------
// 3. Seed function
// ---------------------------------------------------------------------------
export async function seedRbac(): Promise<void> {
  console.log('[seed-rbac] Starting RBAC seed...')

  // 3-A: Upsert all permissions
  console.log(`[seed-rbac] Seeding ${PERMISSIONS.length} permissions...`)
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { module: perm.module, action: perm.action, description: perm.description },
      create: { code: perm.code, module: perm.module, action: perm.action, description: perm.description },
    })
  }
  console.log('[seed-rbac] Permissions seeded.')

  // 3-B: Upsert system roles and assign permissions
  for (const roleDef of SYSTEM_ROLES) {
    console.log(`[seed-rbac] Seeding system role: ${roleDef.key}`)

    // Find existing system role by key (tenantId IS NULL and isSystem=true)
    let role = await prisma.clinicRole.findFirst({
      where: { key: roleDef.key, tenantId: null, isSystem: true },
    })

    if (!role) {
      role = await prisma.clinicRole.create({
        data: {
          tenantId: null,
          key: roleDef.key,
          name: roleDef.name,
          description: roleDef.description,
          isSystem: true,
          permVersion: 1,
        },
      })
      console.log(`[seed-rbac]   Created role id=${role.id}`)
    } else {
      // Update name/description if they drift
      role = await prisma.clinicRole.update({
        where: { id: role.id },
        data: { name: roleDef.name, description: roleDef.description },
      })
      console.log(`[seed-rbac]   Found existing role id=${role.id}`)
    }

    // Upsert role-permission assignments
    for (const code of roleDef.permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionCode: { roleId: role.id, permissionCode: code } },
        update: {},
        create: { roleId: role.id, permissionCode: code },
      })
    }

    // Remove any stale permissions (e.g. if matrix changes narrowed grants)
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionCode: { notIn: roleDef.permissions },
      },
    })

    console.log(`[seed-rbac]   Assigned ${roleDef.permissions.length} permissions to ${roleDef.key}`)
  }

  console.log('[seed-rbac] RBAC seed complete.')
}

// Run directly when invoked as a script
if (require.main === module) {
  seedRbac()
    .catch((err) => {
      console.error('[seed-rbac] Fatal error:', err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
