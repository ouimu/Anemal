// Permission codes gating entry to each clinic-plane layout tree — used by
// AdminLayout/ClinicLayout to decide whether a role belongs in that tree at
// all, replacing the legacy role==='admin' string gate. Kept in a shared
// module (not each layout's own NAV) so neither layout has to import the
// other's NAV array, which would be circular.
export const ADMIN_NAV_PERMS = [
  'clinic.profile.view',
  'staff.view',
  'bloodbank.view',
  'audit.view',
  'roles.view',
]

export const CLINIC_NAV_PERMS = [
  'dashboard.view',
  'crm.view',
  'appointments.view',
  'emr.view',
  'inventory.view',
  'billing.create',
  'inpatient.view',
  'grooming.view',
]
