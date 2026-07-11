# ADR-0006 — Codex Audit Batch 4: Documentation Repair

Date: 2026-07-08
Status: Accepted
Context: Final batch of Codex audit remediation (Batches 1-3 merged as PRs #8/#9/#10). Source: RecomendByCodex/05-documentation-gaps.md. BA validation + adversarial grill (conditional pass; B1/B2 blocking items folded in below). Decision authority delegated. Docs-only — zero code changes.

## Decisions

### D1 — Canonical implementation-status matrix
New file `.claude/specs/implementation-status-matrix.md`. Module-level (~30 rows), NOT per-route (route-level authorization evidence is machine-verified by `roleRouteMatrix.test.ts` — cite it, don't duplicate it). Columns: area | screen/API route | status | backend evidence | frontend evidence | test evidence | release status ∈ {implemented, backend-only, frontend-only, bug, deferred, credential-gated}.
**(grill B1)** Status cells seeded from CURRENT post-Batch-1-3 code state, never from the raw audit: grooming status route = implemented (fixed Batch 2), platform company-types = implemented (fixed Batch 2), vaccination permission = vaccination.create canonical (ADR-0004), all Batch 1 contract fixes = implemented.
**(grill B3)** S3 presign and PromptPay QR = `credential-gated` (503 STORAGE_NOT_CONFIGURED without S3 env; 422 without promptpayId), not bare "implemented".
Header rule: "expand a row before modifying that module."
**(grill B2)** Discoverability hook: CLAUDE.md "Tracking & Documentation" section gains one line naming the matrix as the canonical status source that @pm-agent updates LAST on every task. Without this the matrix is write-only and rots.

### D2 — Fix actively harmful files
- **HOW-TO-RUN.md:** clinic credential tables → username-based (admin_a/AdminPass1!, doctor_a/DoctorPass1!, staff_a/StaffPass1!, *_b with Pass2! per seed.ts:76-83); curl body → `{"subdomain","username","password"}` (loginSchema is .strict()); platform credential stays EMAIL (admin@anemal.app — platform plane is email-login by design). **(grill B5)** Seed console-output echo block (lines ~55-64) stays as-is — it truthfully reproduces email log lines; do not "fix" it.
- **README.md:** stack table → React 18.3 / Tailwind 3.4 / Zustand 4.5 / Vite 5.2 (per package.json); folder structure → real names (`.claude/` not `claude/`, `store/` not `stores/`); remove references to files that don't exist; phase table synced.
- **CLAUDE.md:** phase table only — add one Codex-audit remediation row (Batches 1-4, ✅, 832 backend + 143 frontend) + the D1 matrix pointer line. NO edits to pipeline/router/rules sections.
**(grill B4) Test-count policy:** current totals (832/143) appear in the new Codex row + HOW-TO-RUN; per-phase historical counts stay but labeled "as of that phase"; README ~394 updated to current or marked historical. One policy, applied everywhere edited.

### D3 — Surgical screen-spec edits (7 files, no rewrites)
- `anemal-screen-specs/SKILL.md`: fix dead AdminView.tsx ref (real: AdminDashboard/AdminLayout); add coverage/deferral table listing every unspecced routed screen; add write-on-next-touch rule.
- `00-shared-layout.md`: nav table `/admin/*` → `/clinic-admin/*`; add missing nav rows (branches, blood bank, audit, roles).
- `08-admin.md`: headings → `/clinic-admin/*`; one-line pointers for unspecced admin screens.
- `01-login.md`: Email field → Username (D-1 change).
- `06-inventory.md`: branch transfers = implemented (transfer.routes.ts mounted app.ts:80).
- `07-billing-pos.md`: PromptPay QR + PDF = implemented/credential-gated precise wording; card gateway stays deferred (Phase 10).
- `04-pet-owner.md`: S3 presign = credential-gated implemented; camera-barcode stays deferred.

### D4 — New screen specs deferred
~10 new spec files REJECTED for this batch (post-hoc specs for shipped screens ≈ zero value until next touch). SKILL.md coverage table + write-on-next-touch rule is the mechanism. Spec gets written when its screen is next modified.

### D5 — Already-fixed items not re-edited
RBAC matrix (Batch 2), platform-domain.md deferrals (Batch 2), qa-protocols Protocol 5 (Batch 3), docs/index.html (current). No double edits.

## Grill record
Conditional PASS. B1 (matrix seeded from stale audit → re-reports fixed bugs) and B2 (no discoverability hook → matrix rots write-only) were blocking; both folded into D1. B3 (credential-gated precision), B4 (test-count policy), B5 (seed-echo boundary) resolved via wording above. B6 (no double-edit conflicts) verified.

## Glossary additions
- **Implementation-status matrix**: canonical module-level status doc at `.claude/specs/implementation-status-matrix.md`; agents expand a row before modifying that module; @pm-agent updates it LAST on every task.
- **Credential-gated**: implemented in code but inert without external config/credentials (S3, PromptPay ID, payment gateway).
- **Write-on-next-touch**: screen-spec authoring rule — unspecced shipped screens get a spec only when next modified.
