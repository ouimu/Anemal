# RBAC Quick Reference — Anemal Authorization

> **Updated:** 2026-06-16  
> **Owner:** @ba-agent  
> **For full detail:** See [Permission Matrix](permission-matrix.md) & [RBAC Spec](../../specs/RBAC_Platform_Restructure_Spec.md)

---

## System Roles (Clinic Plane)

These are the **three seeded roles** that every clinic has. Clinic Admins can create custom roles by cloning & modifying.

| Role Code | Display Name | Manages | Typical User |
|-----------|-------------|---------|--------------|
| `clinic_admin` | Clinic Administrator | Clinic config, staff, roles, reports, billing | Clinic owner |
| `doctor` | Veterinarian | Medical records, diagnoses, prescriptions, treatment plans | Vet doctor |
| `clinic_staff` | Clinic Staff | Appointments, pet info, owner contact, billing (view-only) | Receptionist, tech |

**Platform roles (separate plane):**
- `platform_super_admin` — Anemal operators; manage customers, quotas, platform settings

---

## Permission Codes (Clinic Plane)

| Module | Action | Default Roles | Example |
|--------|--------|---------------|---------|
| **Clinic** | manage_users | clinic_admin | Add/remove clinic staff |
| **Clinic** | manage_roles | clinic_admin | Create custom roles, edit permissions |
| **Clinic** | manage_branches | clinic_admin | Create new branch |
| **Clinic** | view_reports | clinic_admin, doctor | Access clinic analytics |
| **Pet** | create | clinic_staff | Register new pet |
| **Pet** | view_medical_records | clinic_staff, doctor | Read EMR history |
| **Pet** | edit_medical_records | doctor | Add diagnoses, prescriptions |
| **Appointment** | create | clinic_staff | Schedule appointment |
| **Appointment** | cancel | clinic_staff, doctor | Cancel/reschedule |
| **Billing** | create_invoice | clinic_admin, doctor | Generate invoice |
| **Billing** | process_payment | clinic_admin | Mark as paid |
| **Prescription** | create | doctor | Write prescription |
| **Prescription** | view | clinic_staff, doctor | Read prescription |

---

## Role Permissions Matrix (Clinic Plane)

| Permission | clinic_admin | doctor | clinic_staff |
|-----------|:-----------:|:------:|:------------:|
| clinic.manage_users | ✅ | ❌ | ❌ |
| clinic.manage_roles | ✅ | ❌ | ❌ |
| clinic.manage_branches | ✅ | ❌ | ❌ |
| clinic.view_reports | ✅ | ✅ | ❌ |
| pet.create | ✅ | ✅ | ✅ |
| pet.view_medical_records | ✅ | ✅ | ✅ |
| pet.edit_medical_records | ✅ | ✅ | ❌ |
| appointment.create | ✅ | ✅ | ✅ |
| appointment.cancel | ✅ | ✅ | ✅ |
| billing.create_invoice | ✅ | ✅ | ❌ |
| billing.process_payment | ✅ | ❌ | ❌ |
| prescription.create | ✅ | ✅ | ❌ |
| prescription.view | ✅ | ✅ | ✅ |

---

## Common Scenarios

### "Can a doctor edit diagnoses?"
Yes. `doctor` role has `pet.edit_medical_records` permission.

### "Can clinic staff process payments?"
No. `clinic_staff` lacks `billing.process_payment`. Only `clinic_admin` has it.

### "Can a staff member create a custom role?"
No. `clinic.manage_roles` is restricted to `clinic_admin` only.

### "What if we need a 'billing manager' role?"
`clinic_admin` can create a custom role by:
1. Copying `clinic_staff` base permissions
2. Adding: `billing.process_payment`, `billing.create_invoice`
3. Assigning to the billing user

---

## For Developers

**Adding a new permission:**
1. Define the code: `<module>.<action>`
2. Assign default roles in [permission-matrix.md](permission-matrix.md)
3. Implement server check: `requirePermission('<module>.<action>')` on the endpoint
4. **Never** rely on frontend UI hiding; server must deny

**Adding a new role:**
- **System role:** Only Anemal can add; requires code & migration
- **Custom role:** Clinic Admin creates via Platform Console; no code change needed

---

**See also:**
- [Permission Matrix (full)](permission-matrix.md) — exhaustive reference
- [RBAC Spec](../../specs/RBAC_Platform_Restructure_Spec.md) — business rationale & design decisions
