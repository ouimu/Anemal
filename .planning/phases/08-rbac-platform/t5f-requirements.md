# T-5F Requirements Specification — Clinic Role Editor, Platform Console Screens, Multi-Role UI

> Owner: @ba-agent · Created 2026-06-16 · Phase 8 (RBAC + Platform Console)
> Status: **Ready for @pm-agent breakdown** once DECISION-1..5 are resolved.
> Source of truth for authz: `anemal-rbac-matrix`, `anemal-platform-console`,
> `.claude/specs/RBAC_Platform_Restructure_Spec.md` §"Platform-Plane Authorization — Phase 8 Decision".
>
> **Scope note:** All backend APIs for the clinic role surface already exist. The platform plane has
> **only partial** backend coverage — see "Backend reality vs brief" below. T-5F is primarily a
> **frontend** task, but it has hard backend dependencies (settings/users/audit/usage/provision
> platform routes, and a plan seed) that MUST be closed first or carved out of scope.

---

## Backend reality vs the brief (verified against source)

The brief lists several platform endpoints as "already built". Static verification of
`src/backend/app.ts` mounts shows only the following platform routes actually exist:

| Brief claims exists | Actually mounted? | Evidence |
|---|---|---|
| `GET /roles`, `POST /roles/clone`, `PUT /roles/:id/permissions`, `DELETE /roles/:id` | ✅ Yes | `app.ts:81` → `/clinic/roles` |
| `POST /roles/users/:userId/roles`, `DELETE /roles/users/:userId/roles/:roleId` | ✅ Yes | `role.routes.ts:43,46` |
| `GET /clinic/permissions` | ✅ Yes | `clinic.routes.ts:18` |
| `/platform/customers` (+ `/:id/quota`, `/:id/provisioning`, suspend/reactivate) | ✅ Yes | `platform-customers.routes.ts` |
| `/platform/plans` (CRUD + retire) | ✅ Yes | `platform-plans.routes.ts` |
| `/platform/settings` | ✅ Yes (= system-settings router) | `app.ts:57` |
| `/platform/provision` | ⚠️ Partial — lives as `PUT /platform/customers/:id/provisioning`, **no standalone `/platform/provision`** | `platform-customers.routes.ts:51-52` |
| `/platform/users` | ❌ **NOT mounted** — no `platform-users.routes` exists | absent from `app.ts` |
| `/platform/audit` | ❌ **NOT mounted** — only `/api/audit` (clinic plane, tenant-scoped) exists | `audit.routes.ts:10` is `requirePlane('clinic')` |
| `/platform/usage` | ❌ **NOT mounted** as a platform route — only per-customer `GET /platform/customers/:id/quota` (effective quota, not live usage counts) | absent |

→ See **DECISION-2** (Platform Users), **DECISION-3** (Platform Audit), **DECISION-4** (Platform Usage).
These three screens in T-5F-02 have **no backend** today.

---

## Cross-cutting answers (questions raised in the brief)

### CC-1 — `PUT /roles/:roleId/permissions` contract: **incremental, not full replacement**
Confirmed in `role.controller.ts:28-31` (`updateRolePermsSchema`):
```ts
{ add: string[] = [], remove: string[] = [] }   // .strict()
```
The UI must compute the delta between the original permission set and the edited set, and send
`add` = newly-checked codes, `remove` = newly-unchecked codes. **Do not** send the full desired set.
The service rejects any `add` code the caller does not personally hold (no-escalation, BR per matrix
rule 1) and 403s on a system role (matrix rule 2).

### CC-2 — Session refresh when a role's permissions change
- **Backend (PRE-1):** editing a role bumps `perm_version` → `permSetVersion` re-resolves → Redis
  cache busts → active tokens re-resolve on next request (spec BR-6, §lines 457/479-482).
- **Frontend:** `authStore.refreshPermissions()` already exists (`store/authStore.ts:40,119`) and
  re-pulls `/auth/me`. **Requirement:** after a successful save in the Role Editor **that affects a
  role the current user holds** (including their own role), the editor MUST call
  `refreshPermissions()` so the acting admin's own `<Can>` guards re-evaluate without a reload.
  Other logged-in users pick up the change on their next request via the backend cache bust — no
  frontend push needed (acceptable for this phase; no websocket).

### CC-3 — `roles.view` vs `roles.manage` enforcement gap (flag)
The matrix and route-permission-map gate the **route** on `roles.view` and **controls** on
`roles.manage`. **But the backend mounts ALL role endpoints — including the read-only `GET /roles`
and `GET /clinic/permissions` — behind `requirePermission('roles.manage')`** (`role.routes.ts:28`,
`clinic.routes.ts:18`). Consequence: a user with `roles.view` but not `roles.manage` **cannot load
the editor at all** (the list call 403s). This is a real inconsistency → **DECISION-5**.

---

## T-5F-01 · Clinic Role Editor (`/clinic-admin/roles`)

### User stories
1. As a **Clinic Admin**, I want to see all roles (system + my clinic's custom roles) with their
   permissions, so I can understand who can do what before changing anything.
2. As a **Clinic Admin**, I want to clone a system role and toggle its permissions grouped by module,
   so I can create a tailored role without escalating beyond my own access.
3. As a **Clinic Admin**, I want to delete a custom role that is no longer used, so the role list
   stays clean — but be blocked (with a clear reason) if staff are still assigned to it.

### Acceptance criteria
- **AC-1 (list):** Given I open `/clinic-admin/roles`, the screen lists every system role and every
  custom role for my tenant; each row shows name, `is_system` badge, and assigned-user count.
- **AC-2 (view perms):** When I expand a role, its permissions are shown grouped by module, as
  checkboxes/toggles; system-role toggles are **read-only** (disabled) with a "Clone to edit" CTA.
- **AC-3 (clone):** Given a system role, when I click "Clone", I am prompted for a new name; on
  submit a custom role is created (`POST /roles/clone`) seeded with that role's permissions
  **intersected with my own** (server-enforced); the new role appears in the list.
- **AC-4 (edit, delta):** Given a custom role, when I toggle permissions and Save, the UI sends only
  `{ add, remove }` deltas to `PUT /roles/:roleId/permissions`; on success the role's perms update.
- **AC-5 (no-escalation):** When I try to add a permission I do not personally hold, the toggle is
  **disabled** in the UI (and the server would 403 regardless); a tooltip explains why.
- **AC-6 (delete blocked):** When I delete a custom role that has ≥1 assigned user, the API returns
  `409` and the UI shows "Reassign N staff before deleting this role" — the role is **not** deleted.
- **AC-7 (delete ok):** When I delete a custom role with no assigned users, it is removed (`200`) and
  disappears from the list.
- **AC-8 (self-refresh, CC-2):** When my Save edits a role I currently hold, `refreshPermissions()`
  is called and my own visible controls re-evaluate without a page reload.
- **AC-9 (assign — see T-5F-03):** From a role row I can open "assign to staff"; covered by T-5F-03.
- **AC-10 (touch/tokens):** All toggles/buttons ≥44×44px; tokens only; Material Symbols; no raw hex;
  validated at 768px and 1024px.

### API contract (all exist)
| Action | Endpoint | Request | Response |
|---|---|---|---|
| List roles | `GET /clinic/roles` | — | `{ success, data: Role[] }` each with `permissions[]`, `isSystem`, id, name |
| Permission catalogue | `GET /clinic/permissions` | — | `{ success, data: { [module]: string[] } }` |
| Clone | `POST /clinic/roles/clone` | `{ sourceRoleName, newName }` | `201 { success, data: Role }` |
| Edit perms | `PUT /clinic/roles/:roleId/permissions` | `{ add: string[], remove: string[] }` | `200 { success, data: Role }` |
| Delete | `DELETE /clinic/roles/:roleId` | — | `200` / `409` in-use / `403` system |

**CC-3 RESOLVED (D-5a):** `GET /roles` & `GET /clinic/permissions` will accept `roles.view OR
roles.manage` (backend split, prereq #5). The route then gates on `roles.view`; mutations on
`roles.manage`.
**Prereq #6:** `Role` list must return an `assignedUserCount` — confirm/add to `GET /roles`; AC-1's
count and AC-6's delete pre-check depend on it. **@db-agent/@dev-agent.**

### Permission gates (frontend)
- Route guard: `<RequirePermission perm="roles.view">` (D-5a — backend read-route split required).
- Clone/Edit/Delete controls: `<Can perm="roles.manage">`.
- Individual permission toggle: disabled unless `hasPermission(<that code>)` (mirrors server
  no-escalation; UI affordance only).

### Edge cases
- **No custom roles exist:** list shows only the 3 system roles; show an empty-state hint under them
  ("Clone a system role to create a custom role").
- **Permission catalogue larger than role's perms:** unchecked toggles for codes the role lacks;
  codes the admin lacks are checked-disabled or unchecked-disabled accordingly.
- **System role clone-name collision:** server returns an error if `newName` already exists in tenant
  → UI shows inline validation.
- **Concurrent edit:** two admins editing the same role — last write wins (delta-based; acceptable
  this phase). No optimistic-lock requirement.
- **Save with empty `add` and empty `remove`:** no-op; disable Save until a toggle changes.

---

## T-5F-02 · Platform Console Screens (`/platform/*`)

> **Plane gating (spec Phase-8 decision, lines 425-435):** platform routes use **role-string gating
> only** — `<RequireAuth>` + `<RequirePlane plane="platform">`. **NO `<RequirePermission>` / `<Can>`
> on any platform screen.** `platformGetMe` returns `permissions:[]` by design. Do not add permission
> codes to the platform plane in this phase.**

### User stories
1. As a **Platform Super Admin**, I want a Customers list and a per-customer detail view (plan,
   quota, provisioning, usage), so I can operate the SaaS business per tenant.
2. As a **Platform Super Admin**, I want to define and edit plans (name, price, quotas, features),
   so I can change the commercial offering.
3. As a **Platform Super Admin**, I want to manage platform settings (app name, base URL, maintenance
   mode, SMTP, feature flags), so I can configure the application globally.

### Screens & backend status

| Screen | Route | Backend | Status |
|---|---|---|---|
| Customers list | `/platform/customers` | `GET /platform/customers` | ✅ ready |
| Customer Detail · Overview | `/platform/customers/:id` | `GET /platform/customers/:id` | ✅ ready |
| Customer Detail · Plan & Quota | (tab) | `GET/PUT /platform/customers/:id/quota`, `GET /platform/plans` | ✅ ready |
| Customer Detail · Provisioning | (tab) | `GET/PUT /platform/customers/:id/provisioning` | ✅ ready |
| Customer Detail · Usage | (tab) | **NEW** `GET /platform/customers/:id/usage` (D-4a — build) | ⚙️ prereq |
| Plans CRUD | `/platform/plans` | `GET/POST/PUT/DELETE /platform/plans` | ✅ ready |
| Platform Settings | `/platform/settings` | `GET/PUT /platform/settings` (system-settings) | ✅ ready |
| Platform Users | `/platform/users` | **none mounted** — **DEFERRED (D-2b), out of T-5F scope** | ⛔ out |
| Usage & Audit | `/platform/audit` (+ usage) | **NEW** `GET /platform/audit` (D-3a — build) | ⚙️ prereq |

### Acceptance criteria
- **AC-P1 (customers list):** Lists tenants with subdomain, plan, status (active/trial/suspended),
  and an "over plan" flag (R6 grandfathering); supports search by name/subdomain.
- **AC-P2 (create customer):** "Add Customer" captures name, subdomain, **plan (required)**, trial;
  on submit `POST /platform/customers`. **`planId` is REQUIRED (D-1):** the plan dropdown is
  mandatory and `createCustomerSchema` is changed from optional/nullable to required
  (`platform-customers.controller.ts:21`). The dropdown is populated from `GET /platform/plans`
  (seeded with the 3 default plans, D-1).
- **AC-P2b (usage tab):** Customer Detail's Usage tab shows live counts (branches/users/owners) from
  `GET /platform/customers/:id/usage` (D-4a) against the effective cap, with the over-plan flag.
- **AC-P2c (audit screen):** The Usage & Audit screen's audit view reads `GET /platform/audit` (D-3a)
  with filters: date range (from/to), action type, tenant (cross-tenant), and platform_user actor.
- **AC-P3 (suspend/reactivate):** Suspend immediately blocks that tenant's clinic logins (spec
  safety rule); reactivate restores. Both write to `audit_logs` (platform_user actor).
- **AC-P4 (quota override):** Plan & Quota tab shows effective quota = override ?? plan default;
  editing sets `tenant_quotas` via `PUT /:id/quota`; over-limit existing tenants are grandfathered
  and flagged, not auto-blocked.
- **AC-P5 (provisioning):** Provisioning tab edits S3 bucket/prefix, SMTP, base providers via
  `PUT /:id/provisioning`; secrets are write-only (never echoed back in plaintext).
- **AC-P6 (plans CRUD):** Create/edit/retire plans; retire (`DELETE`) is a soft-retire — existing
  tenants on the plan keep their effective quota (confirm with @db-agent that retire ≠ cascade).
- **AC-P7 (settings):** Edit app name, base URL, maintenance mode toggle, trial days, SMTP, feature
  flags via `GET/PUT /platform/settings`; secrets write-only.
- **AC-P8 (no permission guards):** No `<RequirePermission>`/`<Can>` anywhere under `/platform/*`;
  only plane gate. (QA: a clinic token hitting any `/platform/*` route gets 403 server-side.)
- **AC-P9 (touch/tokens):** ≥44px, tokens, Material Symbols, no raw hex, 768/1024 validated.

### Permission gates
- **Route:** `<RequireAuth>` + `<RequirePlane plane="platform">` only. Nothing else. (Spec decision.)

### Edge cases
- **Plan dropdown empty:** cannot occur once the 3 default plans are seeded (D-1); if the plans table
  is somehow empty, block "Add Customer" with a "Create a plan first" message.
- **Customer always has a plan (D-1):** effective quota always resolves from override ?? plan; the
  former "null-plan" ambiguity is removed.
- **Suspended tenant detail:** all tabs read-only except a "Reactivate" CTA.
- **Retiring a plan still in use:** warn "N customers are on this plan"; do not orphan their quota.
- **Maintenance mode on:** confirm whether platform console itself stays reachable (it must).
- **Usage tab over cap:** show the over-plan grandfather flag; do not block (enforcement is at
  create-time on the clinic side, not here).

### Out of scope (T-5F-02)
- **Platform Users screen (D-2b)** — deferred to a separate follow-up task; its backend
  (`/platform/users`) does not exist. Do NOT stub it.
- `platform_support` read-only role behavior (deferred; only `platform_super_admin` this phase).
- Platform-plane permission codes / `<Can>` gating (spec defers to Phase 10).
- Impersonation / "log in as tenant" (not in this task).
- Cross-tenant PII access of any kind (stop-ship per platform-console skill).

---

## T-5F-03 · Multi-role assignment UI (in user/staff editor)

### User stories
1. As a **Clinic Admin**, I want to assign one or more roles to a staff member via a multi-select
   chip/checklist, so a user's effective permissions = the union of their roles (CR-01).
2. As a **Clinic Admin**, I want to remove a role from a staff member, but be prevented from removing
   their **last** role, so every user always has ≥1 role.
3. As a **Clinic Admin**, I want to see only roles I am allowed to grant (subset of my own perms),
   so I cannot escalate a user beyond my own access.

### Acceptance criteria
- **AC-R1 (multi-select):** The user editor shows the staff member's current roles as chips and a
  picker of assignable roles; selecting adds (`POST /roles/users/:userId/roles { roleId }`),
  deselecting removes (`DELETE /roles/users/:userId/roles/:roleId`).
- **AC-R2 (only grantable roles):** The picker lists only roles whose permission set is a **subset of
  the acting admin's own** (no-escalation, matrix CR-01). A role with a permission the admin lacks is
  hidden or disabled with a reason.
- **AC-R3 (last-role guard):** Attempting to remove a user's only remaining role returns `409`
  (`removeRoleFromUser` enforces) and the UI blocks it with "A user must keep at least one role".
- **AC-R4 (re-resolve, CC-2):** After assign/remove, the affected user's permissions re-resolve
  server-side (BR-6). If the affected user is the acting admin, call `refreshPermissions()`.
- **AC-R5 (gates):** Assignment controls gated `<Can perm="staff.assign_role">`; the role picker
  loads the role list via `GET /clinic/roles`, which accepts `roles.view` after the D-5a split
  (prereq #5).
- **AC-R6 (touch/tokens):** chips removable with ≥44px targets; tokens; Material Symbols.

### API contract (all exist)
| Action | Endpoint | Request | Response |
|---|---|---|---|
| Assign role | `POST /clinic/roles/users/:userId/roles` | `{ roleId: number }` | `201` |
| Remove role | `DELETE /clinic/roles/users/:userId/roles/:roleId` | — | `200` / `409` last-role |
| Role list (for picker) | `GET /clinic/roles` | — | `Role[]` (filter client-side to grantable) |

**Gap:** "only admin-grantable roles" — is grantability computed **client-side** (compare each role's
`permissions[]` to the admin's own `permissions`) or does the server expose a `grantable` flag?
Today there is no server flag; client-side subset check is feasible since `GET /roles` returns each
role's `permissions[]` and the admin's own perms are in `authStore`. **Recommend client-side filter
for UX + rely on server 403 as the boundary.** Confirm `assignRoleToUser` enforces subset server-side
(it receives `callerPerms` — `role.controller.ts:136-145` — so yes).

### Edge cases
- **User already has the role:** picker shows it as selected; re-assign is idempotent or hidden.
- **User has max roles:** no hard cap defined → confirm none needed (matrix says 1..N). Treat as
  unbounded; UI just lists chips. **No max-role limit in scope** unless product wants one.
- **Removing a custom role mid-session:** if the role was deleted elsewhere, removal still succeeds /
  is already gone — handle 404 gracefully.
- **Self-demotion (D-6a):** an admin removing `clinic_admin` from themselves is **allowed** if they
  keep ≥1 role; show a confirm-dialog warning ("You may lose access to this screen"). On confirm,
  call `refreshPermissions()`.

### Out of scope (T-5F-03)
- Bulk role assignment across multiple users at once.
- Per-branch role scoping (roles are tenant-scoped, not branch-scoped, this phase).
- Creating/editing the roles themselves (that is T-5F-01).

---

## Decisions — RESOLVED (product, 2026-06-16)

All six decisions are now made. Resolutions below; the AC/scope sections above are updated to match.

**[DECISION-1] Customer creation & plans → RESOLVED: (a)** Seed the 3 default plans
(starter/professional/clinic_plus per platform-console skill) and make **`planId` required** on
`POST /platform/customers`.
- **Backend change required:** flip `planId` from `.optional().nullable()` to **required** in
  `createCustomerSchema` (`platform-customers.controller.ts:21`). @db-agent owns a new **plan seed**
  task (seed.ts / a dedicated seed) with the 3 plans' quota+price values. Confirm price values with
  commercial before seeding; quota caps follow the skill table (starter 1/5/500, professional
  3/20/5000, clinic_plus 10/100/NULL).
- *Consequence:* AC-P2 updated — plan dropdown is mandatory; the "null-plan customer" edge case is
  removed (a customer always has a plan, so effective quota always resolves).

**[DECISION-2] Platform Users screen → RESOLVED: (b) DEFER.** No `/platform/users` backend exists;
the screen is **carved out of T-5F-02** into a separate follow-up task (own backend
`GET/POST/PUT/DELETE /platform/users` + screen). Do not stub it in this task.

**[DECISION-3] Platform Audit screen → RESOLVED: (a) BUILD NOW.** Build a new **platform-plane**
audit endpoint as a prerequisite within T-5F-02 scope.
- **Backend change required (new task, @db-agent + @dev-agent):** `GET /platform/audit` —
  `authMiddleware` + `requirePlane('platform')`, **no tenant lock**, supporting filters
  `from`/`to` (date range), `action` (type), `tenantId` (**cross-tenant**), and platform_user actor.
  Reuse the clinic `audit.service` shape but drop the tenant scoping and add a `tenantId` filter.
- *UI:* the Usage & Audit screen's Audit view exposes those filters. Plane gate only (no perm codes).

**[DECISION-4] Customer "Usage" tab / Platform Usage → RESOLVED: (a) BUILD NOW.** Build a live-count
usage endpoint as a prerequisite within T-5F-02 scope.
- **Backend change required (new task, @db-agent + @dev-agent):** `GET /platform/customers/:id/usage`
  returning live current counts (branches/users/owners) for the tenant; reuse/extend `usage.service`
  per the platform-console skill. Platform plane, plane gate only.
- *Consequence:* **Customer Detail keeps all 4 tabs** (Overview / Plan & Quota / Provisioning /
  Usage). The Usage tab shows current count vs effective cap, with the "over plan" grandfather flag.

**[DECISION-5] `roles.view` vs `roles.manage` route gating → RESOLVED: (a)** Split read vs write
server-side: add **`roles.view`** as an accepted permission on the read routes so a view-only role
can open the editor read-only.
- **Backend change required (@db-agent for any seed/grant + @dev-agent):** on `GET /clinic/roles`
  and `GET /clinic/permissions`, accept **`roles.view` OR `roles.manage`** (currently
  `roles.manage`-only — `role.routes.ts:28`, `clinic.routes.ts:18`). Keep clone/edit/delete/assign on
  `roles.manage`. Ensure `roles.view` exists in the permission catalogue and is held by the relevant
  roles.
- *Consequence:* the frontend **route** gates on `<RequirePermission perm="roles.view">`; **controls**
  gate `<Can perm="roles.manage">`. This matches the original route-permission-map and CC-3 is closed
  by the backend split (not by accepting `roles.manage`-only). Update AC-5/AC-R5 to use `roles.view`
  for the route/list and `roles.manage` for mutations.

**[DECISION-6] Self-demotion in T-5F-03 → RESOLVED: (a) ALLOW with warning.** An admin may remove
their own admin-capable role while keeping ≥1 role; show a confirm-dialog warning ("You may lose
access to this screen"). Server already enforces the ≥1-role floor. No hard block.

---

## Readiness checklist (per anemal-ba-toolkit "ready" definition) — all decisions resolved
| Sub-task | Objective | Roles | Perm codes | Exceptions | NFR impact | AC | Risks/deps | Ready? |
|---|---|---|---|---|---|---|---|---|
| T-5F-01 Role Editor | ✅ | ✅ clinic_admin | ✅ route `roles.view`, mutations `roles.manage` (D-5a) | ✅ | tablet/touch | ✅ AC-1..10 | `roles.view` split (D-5a); assignedUserCount field | **Ready** — needs D-5a backend split + assignedUserCount in `GET /roles` |
| T-5F-02 Platform | ✅ | ✅ platform_super_admin | ✅ none (plane only) | ✅ | tablet/touch | ✅ all 4 tabs + plans + settings | planId-required (D-1); new audit + usage endpoints (D-3a/D-4a) | **Ready** — has 3 backend prereqs; Platform Users deferred (D-2b) |
| T-5F-03 Multi-role | ✅ | ✅ clinic_admin | ✅ `staff.assign_role` + `roles.view` for picker | ✅ | tablet/touch | ✅ AC-R1..6 | `roles.view` split (D-5a) | **Ready** |

## New backend prerequisites created by these decisions (own tasks, before frontend)
1. **Plan seed (D-1)** — @db-agent: seed starter/professional/clinic_plus; confirm price w/ commercial.
2. **`planId` required (D-1)** — @dev-agent: make `planId` required in `createCustomerSchema`.
3. **`GET /platform/audit` (D-3a)** — platform-plane, cross-tenant, filters from/to/action/tenantId/actor.
4. **`GET /platform/customers/:id/usage` (D-4a)** — live counts (branches/users/owners) via `usage.service`.
5. **`roles.view` read-route split (D-5a)** — accept `roles.view OR roles.manage` on `GET /roles` &
   `GET /clinic/permissions`; ensure `roles.view` is in the catalogue + granted appropriately.
6. **`assignedUserCount` on `GET /roles`** (for AC-1 count + AC-6 delete pre-check) — confirm/add.

## Recommended handoff to @pm-agent
Decisions are final. Sequence:
1. @db-agent + @dev-agent land the **6 backend prerequisites** above (plan seed, planId-required,
   `/platform/audit`, `/platform/customers/:id/usage`, `roles.view` split, `assignedUserCount`).
2. @uiux-agent designs the three surfaces: Role Editor, Platform Console (4-tab Customer Detail +
   Plans + Settings + Usage&Audit screen), and the multi-role picker in the user editor.
3. @dev-agent implements the frontend; **Platform Users screen is out of scope (D-2b)** — carve a
   separate follow-up task for it (its backend does not exist yet).
4. @qa-agent verifies: plane isolation (no `/platform/*` reachable by a clinic token; new audit/usage
   endpoints reject clinic tokens), no-escalation on role grant + perm-add, last-role guard, and that
   `roles.view`-only users can open the editor read-only but cannot mutate.
