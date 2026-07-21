---
name: anemal-rbac-matrix
description: >
  Authoritative role & permission model for Anemal. Use this skill for ANY task touching
  authorization: adding/guarding a route, designing a screen guard, deciding who can view vs
  edit something, seeding roles, building the clinic role editor, reviewing a PR for access
  control, or answering "what role can do X / which permission protects Y?". Covers the two
  planes (platform vs clinic), the permission code catalogue, the default matrix for the three
  system clinic roles, configurable custom roles, and the route -> permission map. If a change
  affects who-can-do-what, this skill must be active.
---

# Anemal RBAC Matrix

## Model in one screen

- **Two planes.** `platform` (operate the SaaS, no tenant) and `clinic` (operate one tenant).
  A token belongs to exactly one plane. `requirePlane()` runs before any permission check.
- **Permission code** = `<module>.<action>`. Deny-by-default: no code assigned = no access.
- **Role** = a named set of permission codes. System roles are seeded (`is_system=true`,
  `tenant_id=NULL`); clinic admins may clone a system role into a tenant-scoped **custom role**
  and toggle permissions (configurable RBAC).
- **User** holds **exactly one role** via `roleId` (single-role model, ADR-0019 — retires the
  earlier CR-01 multi-role design). Server resolves that role's permission set (current
  implementation: 5-minute in-memory cache keyed by `tenantId:userId`; `permSetVersion` in the
  JWT detects stale tokens). UI mirrors it via `usePermissions()` for hide/disable only. A
  Clinic Admin assigns a user's role (`staff.assign_role`, no escalation — the assigned role's
  permissions must be a subset of the assigner's own).

## System clinic roles (seeded defaults)

| Role key | Business mandate |
|---|---|
| `clinic_admin` | Clinic configuration, staff & role management, all reports, integration keys |
| `doctor` | Clinical: EMR/SOAP, lab/X-ray, diagnosis, prescriptions |
| `clinic_staff` | Front desk & commerce: appointments, CRM, inventory, POS/billing, dispensing |

## Enforcement contract

```
requirePlane('clinic') -> requirePermission('billing.create') -> controller
```
- API returns `403 FORBIDDEN` (permission) or `404` (cross-tenant, per anemal-db-context).
- Frontend: `<RequirePermission perm="billing.create">` for routes, `<Can perm="...">` for controls.
- Permissions narrow *what*; tenant/branch isolation still governs *whose* data.

## Custom-role safety rules (configurable RBAC)
1. Clinic Admin can grant only permissions they themselves hold (no escalation).
2. System roles are immutable (clone to customize).
3. A user must always have a role; deleting a role in use is blocked (reassign first).
4. Changing a role's permissions bumps `perm_version` -> cache + active tokens re-resolve.

## Full catalogue, default matrix & route map

Authoritative detail (every permission code, the per-role grid, and the API route ->
permission mapping `@dev-agent` applies): `references/permission-matrix.md`.

Platform-plane permissions live in the `anemal-platform-console` skill.

## Review checklist (for @qa-agent / @ba-agent)
- [ ] Every new route has `requirePlane` + `requirePermission`.
- [ ] view vs write are separate codes; read-only roles get only `.view`.
- [ ] No clinic route reachable by a platform token and vice versa.
- [ ] Each system role keeps its existing access (regression test exists).
- [ ] UI guard present but NOT relied on as the security boundary.

## Single-role users (ADR-0019, retires CR-01)
A user holds exactly one role via `User.roleId` (NOT NULL). Effective permissions = that role's
permission set (no union — the earlier CR-01 multi-role design, and the `user_roles` join table's
many-to-many capacity, are retired; `user_roles` now holds exactly one row per user, kept in sync
by `replaceUserRole`). Clinic Admin (perm `staff.assign_role`) assigns a user's role but may only
grant a role whose permissions are a **subset of their own** (no escalation) — enforced server-side
on the `PUT /users/:id`/`POST /users` role-change branch, not just on a dedicated role-assignment
route. Combined access needs are met by cloning a role with the right permission mix, not by
stacking roles on one user. See `docs/adr/0019-single-role-per-user-retires-multi-role.md`.
