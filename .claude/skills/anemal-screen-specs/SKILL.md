---
name: anemal-screen-specs
description: >
  Per-screen layout specifications with exact Tailwind classes, component anatomy, API
  endpoints, and acceptance criteria for all Anemal screens. Use this skill whenever
  implementing or reviewing a screen, creating or modifying a view component, or aligning
  UI with a Stitch prototype. Trigger for any task mentioning Login, Dashboard,
  Appointments, Pets, EMR, Inventory, Billing, Admin, Sidebar, or TopNav. Read the
  relevant reference file before writing a single line of JSX.
---

# Anemal Screen Specs

## Screen index

| Screen | Status | Reference file | React component |
|---|---|---|---|
| Shared Layout (Sidebar + TopNav) | Implemented | `references/00-shared-layout.md` | ClinicLayout / AdminLayout |
| Login | Implemented | `references/01-login.md` | `views/LoginView.tsx` |
| Dashboard | Implemented | `references/02-dashboard.md` | `views/clinic/ClinicDashboard.tsx` |
| Appointments | Implemented | `references/03-appointments.md` | `views/clinic/ClinicAppointments.tsx` |
| Pets & Owners | Implemented | `references/04-pet-owner.md` | `views/clinic/ClinicPets.tsx` |
| EMR | Implemented | `references/05-emr.md` | `views/clinic/ClinicEMR.tsx` |
| Inventory | Implemented | `references/06-inventory.md` | `views/clinic/ClinicInventory.tsx` |
| Billing / POS | Implemented | `references/07-billing-pos.md` | `views/clinic/ClinicBilling.tsx` |
| Admin Control Center | Implemented | `references/08-admin.md` | `views/admin/AdminView.tsx` |

## How to use

1. Identify which screen is being implemented or reviewed.
2. Read the corresponding reference file in full before writing code.
3. Copy Tailwind classes exactly from the spec — do not invent alternatives.
4. Check the **Behaviour** table in each spec for correct API calls and state transitions.
5. The Stitch prototype at `stitch_vet_clinic_design_system/<screen>/code.html` remains the visual source of truth — consult it when a spec is ambiguous.

## Layout rules common to all screens

- Screens inside ClinicLayout: `pt-16 pl-56` (expanded) / `pl-14` (collapsed)
- Screens inside AdminLayout: `ml-56/ml-14 pt-16`
- Cards: `glass-card rounded-xl shadow-lvl1`
- Tables: `thead bg-surface-container-low`, rows `min-h-[48px] hover:bg-surface-container`
- Modals: `fixed inset-0 bg-black/40 z-50`, dialog `bg-surface rounded-xl shadow-lvl3 max-w-md p-lg`
- Tokens only — no raw hex, no generic Tailwind color utilities
