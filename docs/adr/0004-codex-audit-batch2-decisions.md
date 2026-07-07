# ADR-0004 — Codex Audit Batch 2 Decisions

Date: 2026-07-07
Status: Accepted
Context: Batch 2 of Codex audit remediation (Batch 1 merged as PR #8). BA validation + adversarial grill (Step 3.5) both passed on current main. Decision authority delegated to agents by product owner; all decisions below are evidence-grounded and grill-verified.

## Decisions

### D1 — BUG-006: Grooming status update — frontend URL fix only
`views/clinic/ClinicGrooming.tsx:278` changes `PUT /api/grooming/bookings/${id}` → `.../${id}/status`. No backend compat route (would widen mutation surface for no reason). Frontend status literals already match backend `statusSchema` enum. Only one wrong-URL caller exists.

### D2 — BUG-007: Company-types picker — platform client + correct path
`views/platform/CustomerDetailView.tsx:42` changes clinic `api` client → `platformApi.get('/platform/company-types')`. Hard rule preserved: never mix API clients across planes. Verified: `platform.company_types.view` is in PLATFORM_SUPPORT_PERMISSIONS — no 403 for support role. Update `PlatformConsole.test.tsx` mock.

### D3 — BUG-010: Platform login hydration — frontend maps nested `data.user`
Backend envelope `{token, refreshToken, user:{id,name,email,role}}` is canonical (tested, mirrors /platform/auth/me). `store/platformAuthStore.ts` `setAuth` maps `user.id→platformUserId`, `user.role→role`, `user.name→name`. Grill-verified: these fields feed only cosmetic UI (avatar/name in PlatformLayout); authz stays JWT-side — hydration enables no dormant code path. Platform refreshToken remains unused — known-deferred (no silent-refresh interceptor in platformApi); do not add in Batch 2.

### D4 — BUG-009: `vaccination.create` is canonical for recording vaccinations
`App.tsx:145` route guard changes `emr.create` → `vaccination.create`. Rationale: backend route, seed grants (doctor + clinic_staff, NOT admin), integration tests, and live matrix doc all agree; the frontend guard was the lone outlier. Effects: clinic_staff regains UI access it always had server-side; doctor unaffected (holds both perms); admin stays denied both sides (documented clinical-safety intent); custom roles with only emr.create lose nothing that worked (their submit always 403'd). Worklist list route stays on `emr.view`.
Matrix doc additions: `staff.assign_branch` row + route map entries; `clinic.settings.manage` row marked "reserved — seeded, not route-enforced".
**Audit correction:** Codex claim "vaccination.create missing from RBAC matrix" was FALSE — audit read the stale `.agents/skills/` duplicate. That tree is deleted in this batch (grep-verified: no config/tooling references it; CLAUDE.md names only `.claude/skills/`).

### D5 — BUG-011: `/settings` wrapped in `RequirePlane plane="clinic"`
`App.tsx:152` — same pattern as `/clinic-admin` and `/clinic`. `preferences` child stays permission-free for all clinic roles. Grill-verified: platform console users live in a separate store (usePlatformAuthStore) and already bounce at RequireAuth; no real journey breaks.

### D6 — Scope deferrals (explicit, documented — not silent)
- **/platform/users CRUD: DEFER.** Operators are a 2-role static enum managed via seed; CRUD is its own privilege-escalation surface needing its own pipeline cycle. Marked backlog in platform-domain.md.
- **/platform/usage aggregate: DEFER.** Per-customer usage (shipped) satisfies the operational need. Marked deferred.
- **Provisioning UI: DEFER to its own grilled task.** Secret-entry form (S3/SMTP/LINE) needs masking UX + write-only display design + verification against Batch 1 redaction. Placeholder text updated to honest status naming the available backend endpoints.
- **Customer deletion/retention: DEFER to Phase 10.** Suspend covers the operational need. Soft-delete + retention hard rule already recorded in anemal-platform-console/SKILL.md:82 as the constraint for when built.

## Glossary additions
- **Plane client separation**: clinic axios client (`utils/api.ts`, clinic token) and platform client (`utils/platformApi.ts`, platform token) must never be mixed; the client choice IS the plane choice on the frontend.
- **Reserved permission**: seeded permission code not yet enforced by any route (e.g. `clinic.settings.manage`); documented so it is neither deleted nor assumed active.
- **vaccination.create**: canonical permission for recording vaccinations (doctor + clinic_staff; deliberately not clinic_admin).
