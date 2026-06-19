# Phase 05 — RBAC, Platform Console & Restructure — Research

**Date:** 2026-06-13 · **Author:** @ba-agent · **Mode:** quality
**Authoritative spec:** `.claude/specs/RBAC_Platform_Restructure_Spec.md` (SPEC-RBAC-PLATFORM-01)

## Why this phase
Three product-owner-raised problems (see brief 2026-06-13): coarse/inconsistent authorization,
fused platform/clinic planes, disorganised structure. Confirmed decisions: D1 separate Platform
Console · D2 configurable roles per clinic · D3 plan-only this round (Claude Code implements next).

## AS-IS findings (verified against the codebase)
- `rbac.middleware.ts`: role-array allow-list only; roles `admin|doctor|staff|superadmin`.
- Clinical/transaction routes (`pet`, `medical-record`, `invoice`, `appointment`, `report`,
  `prescription`) mount `authMiddleware` **only** — no role/permission check. Doctor == Staff in rights.
- `ProtectedRoute.tsx`: checks `isAuthenticated()` only; never role. `/admin` "admin-only" claim
  is unenforced on the client.
- `superadmin` is a `users.role` inside a tenant; `system-settings.routes` gate on it. No platform
  identity, no tenant/plan/quota management surface.
- Three settings stacks: `admin.routes`+`tenant-settings`, `settings.routes`, `system-settings.routes`.
  Frontend duplicates: `/admin/*` (clinic-admin + ops), legacy `*Tab.tsx`, and `/settings/*`.
- Schema: `tenants.plan` is a bare CHECK string; no `plans`/quota tables; no `roles`/`permissions`.
- Noise: `_archive/phase2-prototype-src/`, stray `nul` file.

## Constraints
- Tech stack fixed (Node/Express/PostgreSQL/Prisma/JWT/React/Zustand/React Query) — no infra change
  beyond Redis (already present) for permission cache.
- 226 existing tests must stay green; zero access regression on rollout.
- Tenant/branch isolation rules (`anemal-db-context`) remain underneath permissions.

## Key design decisions (rationale in spec sections 6–9)
- Two planes; plane-scoped tokens; `requirePlane` before `requirePermission`.
- Permission catalogue `<module>.<action>`; roles as permission sets; `users.role_id`.
- System roles seeded; clinic-admin clones to custom roles (configurable RBAC, deny-by-default).
- `plans` + `tenant_quotas`; quotas enforced at create-time (`409 QUOTA_EXCEEDED`).
- Incremental restructure (new modules clean; existing migrated route-by-route).

## Open items to confirm before/while building
- Default plan quota values (proposed in `anemal-platform-console`) — needs commercial sign-off.
- Platform Console deploy target (same app vs separate) — designed route-separated either way.
- Multi-role-per-user — deferred; schema leaves room.
