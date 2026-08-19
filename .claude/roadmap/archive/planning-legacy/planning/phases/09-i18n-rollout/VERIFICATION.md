# Phase 9 — i18n Rollout: Verification Summary

**Date Completed:** 2026-06-18
**Branch:** `refactor/coding-rules-alignment` → merged to `main` (fast-forward, commit `78672d5`)
**Verified by:** @pm-agent

---

## What Was Built

Full EN/TH internationalization rollout across all clinic-plane screens in the Anemal SaaS frontend.

### Architecture Decision
Custom lightweight i18n — no external library (no i18next, no react-intl).
- `src/frontend/src/i18n/index.ts` — EN/TH key dictionary (260+ key pairs)
- `useT()` hook — reads `uiStore.language` from Zustand (`'en' | 'th'`)
- Language toggle — persists via Zustand `uiStore.language` (cross-device sync already wired via `/api/settings/personal` from Phase 5)

### Scope Boundary
- Clinic plane: all screens translated
- Platform Console (`/platform/*`): excluded — internal SaaS operator tool, not Thai clinic users

---

## Screens Translated (16)

| Screen | Component |
|---|---|
| Login | LoginView.tsx |
| Clinic Dashboard | ClinicDashboard.tsx |
| Admin Dashboard | AdminDashboard.tsx |
| Appointments | ClinicAppointments.tsx |
| Pets & Owners | ClinicPets.tsx |
| EMR | ClinicEMR.tsx |
| Inventory | ClinicInventory.tsx |
| Billing / POS | ClinicBilling.tsx |
| Admin Users | AdminUsers.tsx |
| Admin Profile / Clinic Profile Tab | ClinicProfileTab.tsx |
| User Management Tab | UserManagementTab.tsx |
| Role Editor View | RoleEditorView.tsx |
| Role List | RoleList.tsx |
| Role Permission Editor | RolePermissionEditor.tsx |
| Clone Role Modal | CloneRoleModal.tsx |
| Role Picker | RolePicker.tsx |

---

## Key Pairs (approximate counts by task)

| Task | Keys Added |
|---|---|
| T-9-01 common + login | 11 |
| T-9-02 clinic + admin dashboards | 22 |
| T-9-03 appointments | 14 |
| T-9-04 pets + EMR | 26 |
| T-9-05 inventory + billing | 18 |
| T-9-06 admin users + profile | 17 |
| T-9-07 RBAC role components | 27 |
| T-9-08 coverage audit pass + remaining strings | ~39 |
| **Total** | **260+** |

---

## Test Results

- **95/95 frontend tests passing** (Vitest, 12 test files)
- `i18n.coverage.test.ts`: 0 missing TH keys — every EN key has a TH translation
- `translate()` fallback verified: missing key returns the key string rather than crashing
- Language toggle tests: EN↔TH switching verified
- RoleEditorView tests: fixed and passing
- Backend tests: ~394 (unchanged from Phase 8 — no backend changes in Phase 9)

### Run Command
```bash
cd src/frontend
npx vitest run
```

---

## Commits

| Commit | Description |
|---|---|
| `fdbea09` | T-9-01: common + login strings |
| `95c3efc` | T-9-02: clinic + admin dashboards |
| `f92e137` | T-9-03: clinic appointments + showForm regression fix |
| `a92dfcd` | T-9-04: clinic pets + EMR |
| `64d87ff` | T-9-04 fix: remove injected header div, fix test assertions |
| `fc8a048` | T-9-05: clinic inventory + billing |
| `b94f27b` | T-9-06: admin users + profile |
| `159293e` | T-9-07: RBAC role components |
| `7b9827d` | T-9-05 fix: common.done key + ClinicBilling Done button |
| `2bcb707` | T-9-08: coverage audit + language toggle tests |
| `78672d5` | remaining strings + final merge to main |

---

## Next Phase

**Phase 10 — Payment Gateway & SaaS Billing** (credential-gated)
- Requires: Omise API keys + SMTP credentials
- Status: Postponed until credentials available
