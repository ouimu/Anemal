# Codex Audit Batch 4 — Documentation Repair (FINAL BATCH)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Source of truth:** `docs/adr/0006-codex-audit-batch4-doc-repair.md` (D1–D5, authoritative). BA sign-off + grilling (Step 3.5) both complete — grill returned a conditional PASS: B1 (matrix must be seeded from CURRENT post-Batch-1-3 state, not the stale raw audit) and B2 (matrix needs a discoverability hook or it rots write-only) were blocking and are folded into D1 below; B3 (credential-gated precision), B4 (test-count policy), B5 (seed-echo boundary) are resolved by exact wording baked into each task. This plan only implements already-resolved decisions; it does not re-litigate them.

**Goal:** Close out the Codex audit remediation program (Batches 1–3 shipped as PRs #8/#9/#10) by repairing the five actively-wrong or missing documentation surfaces identified in `RecomendByCodex/05-documentation-gaps.md`: a canonical implementation-status matrix that didn't exist, two "actively harmful" onboarding files (HOW-TO-RUN.md, README.md) that contradict the shipped username-login system, a stale CLAUDE.md phase table, and seven screen-spec files with dead component refs / wrong route prefixes / imprecise credential-gated wording.

**Branch:** `docs/codex-audit-batch4-doc-repair`

**Docs-only — zero code changes, zero new tests.** Verification for this batch is: (a) grep sweeps proving the specific stale strings are gone and the specific correct strings are present, (b) a full run of the existing backend (832) and frontend (143) test suites as a regression proof that nothing executable was touched, (c) manual read-through of each edited file's diff against the ADR line items.

**Never commit:** `RecomendByCodex/` (source audit input, not a project doc) or `.claude/roadmap/ACTIVE/*` (working scratch, not a tracked deliverable).

**Order:** T1 → T2 → T3 → T4 → T5 → T6. T1 (the matrix) is seeded first because T2/T3/T4 reference "current state" facts that should already be consistent with it; T5 (screen specs) is independent of T1–T4 and could run in parallel, but this plan executes sequentially per ADR decision order (D1→D2→D3) for a clean, reviewable commit history. T6 (final verification) runs last.

---

## Global Constraints (from ADR-0006 + grill record)

- **(grill B1)** Every status cell in the new matrix (T1) is seeded from the **current** post-Batch-1-3 code state — verified against real files in this session, not copied from `RecomendByCodex/05-documentation-gaps.md`'s original claims. Concretely: grooming status route = implemented (Batch 2 D1 fixed the frontend URL — `ClinicGrooming.tsx:278` now calls `.../status`), platform company-types picker = implemented (Batch 2 D2 fixed the client), `vaccination.create` is the canonical EMR-record permission (Batch 2 D4, ADR-0004), all Batch 1 contract fixes are implemented. Do not re-report any of these as bugs.
- **(grill B2)** T1's matrix gets a discoverability hook: CLAUDE.md's "Tracking & Documentation" section gains one line naming the matrix as the canonical status source @pm-agent updates LAST on every task (T4, Step 2). Without this hook the matrix is write-only and rots — this line is not optional.
- **(grill B3)** Credential-gated precision: S3 presign (`services/upload.service.ts` — 503 `STORAGE_NOT_CONFIGURED` without S3 env vars) and PromptPay QR (`services/promptpay-qr.service.ts` — 422 without a `promptpayId` configured) are status `credential-gated` everywhere they appear (T1 matrix rows, T5 07-billing-pos.md, T5 04-pet-owner.md) — never bare "implemented". This is a real, third status value in the matrix's release-status enum, not a footnote.
- **(grill B4) Test-count policy — one rule, applied everywhere edited this batch:** current totals are **832 backend + 143 frontend**. These exact numbers appear in: T1's matrix header, T3's README phase table + footer, T4's CLAUDE.md Codex row. Any **pre-existing per-phase historical count already in a file being edited** (e.g. README's "✅ Complete (226)" per-phase cells, CLAUDE.md's "✅ ~394 backend tests" Phase 8 row) is left as-is but must read unambiguously as "as of that phase" from surrounding context — do not delete historical counts, do not silently inflate them to 832/143, and do not add a "(historical)" suffix to rows this batch doesn't otherwise touch (i.e. don't gold-plate rows outside scope). README's standalone "~394" in the footer/last-updated line (not a phase-table cell) is the one instance this batch updates to current, since it is presented as a present-tense summary, not a phase-scoped historical figure.
- **(grill B5)** HOW-TO-RUN.md's seed console-output echo block stays byte-for-byte as-is (`✓ admin — admin@dev-clinic.com` etc.) — it truthfully reproduces `seed.ts:111`'s `console.log(\`  ✓ ${u.role} — ${u.email}\`)` line, which logs by **email** even though login now happens by **username**. Do not "fix" this block to say username — that would make the doc lie about what the seed script actually prints. Only the credential **tables** and the **curl body** (which describe how to log in, not what the seed script prints) change to username.
- No new files created except T1's matrix (a doc). No code files touched in any task. No test files touched in any task.
- Every fact below was verified by reading the real file in this planning session; where a step says "verify against X before writing," it means the plan author already did this and the value quoted is real — but the implementer should still spot-check nothing drifted between planning and execution (docs describing fast-moving code can go stale in hours, not just batches).

---

### Task 1 (ADR D1): Create `.claude/specs/implementation-status-matrix.md`

**Files:**
- Create: `.claude/specs/implementation-status-matrix.md`

**Verified facts to seed the matrix with (read in this session):**
- Grooming status update: `views/clinic/ClinicGrooming.tsx:278` calls `PUT /api/grooming/bookings/:id/status` (fixed Batch 2 D1, ADR-0004) → **implemented**.
- Platform company-types picker: `views/platform/CustomerDetailView.tsx:42` uses `platformApi.get('/platform/company-types')` (fixed Batch 2 D2) → **implemented**.
- Vaccination recording permission: `vaccination.create` is canonical (Batch 2 D4, ADR-0004) — doctor + clinic_staff hold it, clinic_admin deliberately does not. Route-level authorization for this and every other permission is machine-verified by `src/backend/tests/integration/roleRouteMatrix.test.ts` (Batch 3 T4) — **cite it, do not duplicate its per-route rows in this matrix.**
- S3 presign photo upload: `services/upload.service.ts` returns 503 `STORAGE_NOT_CONFIGURED` when S3 env vars are absent → **credential-gated**.
- PromptPay QR: `services/promptpay-qr.service.ts` (+ `invoice.controller.ts`, `invoice.service.ts`) returns 422 without a configured `promptpayId` → **credential-gated**.
- Branch inventory transfers: `src/backend/routes` mounts `app.use('/api/inventory/transfers', transferRoutes)` at `app.ts:80` → **implemented**.
- Platform users CRUD, platform usage aggregate, provisioning UI, customer deletion/retention: all explicitly **deferred** per ADR-0004 D6 (2-role static enum + seed for platform users; per-customer usage already shipped satisfies the need; provisioning UI deferred to its own grilled task; deletion deferred to Phase 10, suspend covers the operational need today).
- Payment gateway (Omise/Stripe webhooks) and LINE/SMS real dispatch: Phase 10/11, **deferred** — postponed pending credentials (README/CLAUDE.md phase table already say this; matrix just restates it at module granularity).
- Current test totals: **832 backend / 143 frontend** (per ADR-0006 D2, grill B4 policy — this is the number this batch treats as ground truth for "current").

- [x] **Step 1: Write the matrix file**

Structure (module-level, ~30 rows, NOT per-route — per-route authorization is `roleRouteMatrix.test.ts`'s job):

```markdown
# Implementation Status Matrix

> **Header rule: expand a row before modifying that module.** Before you touch any
> module's code, find (or add) its row here first, confirm the row still matches
> reality, and update it as part of the SAME change — not as an afterthought.
> This matrix is the canonical status source; @pm-agent updates it LAST on every
> task (see CLAUDE.md → Tracking & Documentation).
>
> Current totals as of this batch (Codex Audit Batches 1–4): **832 backend tests,
> 143 frontend tests.** Route-level authorization is machine-verified by
> `src/backend/tests/integration/roleRouteMatrix.test.ts` — that file is the source
> of truth for per-route permission coverage; this matrix does not duplicate it.

## Release status legend
- `implemented` — shipped, no external dependency needed to function.
- `backend-only` — API + data layer shipped, no frontend surface yet.
- `frontend-only` — UI shipped ahead of/without a real backend (placeholder data).
- `bug` — shipped but currently broken; see linked issue/ADR.
- `deferred` — explicitly out of scope for now, tracked, not silently dropped.
- `credential-gated` — implemented in code but inert without external config/
  credentials (S3, PromptPay ID, payment gateway). Not the same as "implemented."

## Matrix

| Area | Screen / API route | Status | Backend evidence | Frontend evidence | Test evidence | Release status |
|---|---|---|---|---|---|---|
| Auth (clinic) | `/auth/login`, `/auth/select-branch` | Username + two-step branch select | `controllers/auth.controller.ts`, `services/auth.service.ts` | `views/LoginView.tsx` | `tests/integration/auth.test.ts` | implemented |
| Auth (platform) | `/platform/auth/login` | Email-based, single-step | `controllers/platform-auth.controller.ts` | `views/platform/PlatformLogin.tsx` | `tests/integration/seedCredentialSmoke.test.ts` | implemented |
| RBAC — clinic roles | `/clinic/roles/*` | Role editor, custom roles | `routes/role.routes.ts` | `views/admin/UserManagementTab.tsx` | `tests/integration/roleRouteMatrix.test.ts` | implemented |
| RBAC — route authorization | all clinic-mounted routes | Per-role allow/deny sweep, CI-enforced | `middlewares/permission.middleware.ts` | — | `tests/integration/roleRouteMatrix.test.ts` | implemented |
| Vaccination recording | `POST /api/vaccinations` | `vaccination.create` canonical (doctor + clinic_staff, not admin) | `routes/vaccination.routes.ts` | `views/clinic/ClinicEMR.tsx` | `tests/integration/vaccination.test.ts` | implemented |
| Grooming status update | `PUT /api/grooming/bookings/:id/status` | Fixed Batch 2 D1 (frontend URL) | `routes/grooming.routes.ts` | `views/clinic/ClinicGrooming.tsx:278` | `tests/integration/grooming.test.ts` | implemented |
| Blood bank registry | `/api/blood-bank/*` | Donor eligibility, bag collection, transfusions | `routes/bloodBank.routes.ts` | `views/admin/AdminBloodBank.tsx` | `tests/integration/bloodBank.test.ts` | implemented |
| Branch inventory transfers | `/api/inventory/transfers` | Mounted `app.ts:80` | `routes/transfer.routes.ts` | `views/clinic/ClinicInventory.tsx` | `tests/integration/transfer.test.ts` | implemented |
| Inventory barcode scan | Pets/Inventory barcode field | Manual text field, no camera scan | `models/product.repository.ts` | `views/clinic/ClinicPets.tsx`, `views/clinic/ClinicInventory.tsx` | — | deferred |
| Billing — invoices/receipts | `/api/invoices/*` | Browser-print receipt | `routes/invoice.routes.ts` | `views/clinic/ClinicBilling.tsx` | `tests/integration/invoice.test.ts` | implemented |
| Billing — PromptPay QR | `/api/invoices/*` (QR panel) | 422 without configured `promptpayId` | `services/promptpay-qr.service.ts` | `views/clinic/ClinicBilling.tsx` | `tests/unit/promptpay-qr.test.ts` | credential-gated |
| Billing — card gateway | — | Omise/Stripe not integrated | — | — | — | deferred (Phase 10) |
| Photo upload (pets/owners) | `/api/upload/*` | 503 `STORAGE_NOT_CONFIGURED` without S3 env | `services/upload.service.ts` | `views/clinic/ClinicPets.tsx` | `tests/integration/upload.test.ts` | credential-gated |
| Camera barcode capture | Pet/Inventory forms | Not built — manual entry only | — | — | — | deferred |
| Platform — customers | `/platform/customers/*` | Tenant provisioning, quotas | `routes/platform-customers.routes.ts` | `views/platform/CustomerDetailView.tsx` | `tests/integration/platformContract.test.ts` | implemented |
| Platform — company types | `/platform/company-types` | Fixed Batch 2 D2 (client) | `routes/platform-company-type.routes.ts` | `views/platform/CustomerDetailView.tsx:42` | `tests/integration/platformCompanyType.test.ts` | implemented |
| Platform — plans/quotas | `/platform/plans/*` | Package + per-tenant quota mgmt | `routes/platform-plans.routes.ts` | `views/platform/PlansView.tsx` | `tests/integration/platformContract.test.ts` | implemented |
| Platform — settings | `/platform/settings/*` | Integration secrets, AES-256-GCM | `controllers/system-settings.controller.ts` | `views/platform/SettingsView.tsx` | `tests/integration/auditRedaction.test.ts` | implemented |
| Platform — audit log | `/platform/audit/*` | Cross-tenant audit sink | `routes/platform-audit.routes.ts` | `views/platform/AuditView.tsx` | `tests/integration/auditRedaction.test.ts` | implemented |
| Platform — users CRUD | — | 2-role static enum via seed only | — | — | — | deferred (ADR-0004 D6) |
| Platform — usage aggregate | — | Per-customer usage shipped; cross-tenant aggregate not | `routes/platform-customers.routes.ts` (per-customer) | `views/platform/CustomerDetailView.tsx` | — | deferred (ADR-0004 D6) |
| Platform — provisioning UI | — | Secret-entry form (S3/SMTP/LINE) not built | — | — | — | deferred (ADR-0004 D6) |
| Platform — customer deletion | — | Suspend only; delete/retention not built | `routes/platform-customers.routes.ts` (suspend) | — | — | deferred (Phase 10, ADR-0004 D6) |
| i18n (Thai/English) | all clinic screens | 16 screens, no library, EN/TH | `frontend/src/i18n` | all `views/clinic/*` | frontend suite (95 of 143) | implemented |
| Username login (D-1) | `/auth/login` | Replaces email login for clinic plane | `services/auth.service.ts` | `views/LoginView.tsx` | `tests/integration/auth.test.ts` | implemented |
| Company types (D-2) | `/platform/company-types` | See platform row above | — | — | — | implemented |
| Payment history (D-3) | owner/pet billing history | Historical invoice list | `controllers/invoice.controller.ts` | `views/clinic/ClinicPets.tsx` | `tests/integration/invoice.test.ts` | implemented |
| Owner-first browse (D-4/D-5) | pets/owners search | Owner-first navigation flow | `routes/owner.routes.ts` | `views/clinic/ClinicPets.tsx` | `tests/integration/owner.test.ts` | implemented |
| Payment gateway (Phase 10) | — | Omise/Stripe webhooks | — | — | — | deferred (needs credentials) |
| LINE/SMS dispatch (Phase 11) | — | Real notification dispatch | — | — | — | deferred (needs credentials) |
```

Implementer note: this is a starting seed (~30 rows), not exhaustive — the header rule ("expand a row before modifying that module") is the mechanism that keeps it growing accurately over time rather than trying to enumerate everything up front.

- [x] **Step 2: Spot-check the seeded rows against the real files listed**

Re-confirm each "backend evidence"/"frontend evidence" path in the table actually exists (`ls`/`Read` each), and each cited test file exists under `src/backend/tests/`. Fix any path that has drifted since this plan was written.

- [x] **Step 3: Commit (includes ADR-0006 + this plan file per task brief)**
```bash
git add docs/adr/0006-codex-audit-batch4-doc-repair.md docs/superpowers/plans/2026-07-08-codex-audit-batch4.md .claude/specs/implementation-status-matrix.md
git commit -m "docs(specs): add canonical implementation-status matrix seeded from current post-Batch-1-3 state (ADR-0006 D1)"
```

---

### Task 2 (ADR D2 part 1): Fix `HOW-TO-RUN.md`

**Files:**
- Modify: `HOW-TO-RUN.md`

**Verified against `src/backend/prisma/seed.ts:76-83,111,168-174`:**
- Tenant A (`dev-clinic`): `admin_a`/`AdminPass1!`, `doctor_a`/`DoctorPass1!`, `staff_a`/`StaffPass1!`.
- Tenant B (`test-clinic`): `admin_b`/`AdminPass2!`, `doctor_b`/`DoctorPass2!`, `staff_b`/`StaffPass2!`.
- Login is two-step: `POST /auth/login` body is `{ subdomain, username, password }` (the schema is `.strict()` — extra/wrong-named fields are rejected, not ignored) → returns a pending token requiring `POST /auth/select-branch`.
- Platform admin stays **email**-based: `admin@anemal.co` / `PlatformAdmin1!` (env-overridable via `PLATFORM_ADMIN_EMAIL`/`PLATFORM_ADMIN_PASSWORD`) — platform plane is email-login by design, do not change this.
- **(grill B5)** The seed console-output echo block (current lines ~55-64, the `✓ admin — admin@dev-clinic.com` block) reproduces `seed.ts:111`'s literal `console.log` line, which prints by email even though login is now by username. Leave this block untouched — it is truthful about what the script prints, not about how to log in.

- [x] **Step 1: Replace the credential table**

Where the doc currently implies email-based login (it doesn't have an explicit credential table today — the "Expected seed output" block is the echo, not a login-credential table — so this step **adds** a proper login-credential table right after Step 3's seed command, before the untouched echo block), insert:

```markdown
**Login credentials (clinic plane — username, not email):**

| Tenant | Subdomain | Role | Username | Password |
|---|---|---|---|---|
| Tenant A | `dev-clinic` | admin | `admin_a` | `AdminPass1!` |
| Tenant A | `dev-clinic` | doctor | `doctor_a` | `DoctorPass1!` |
| Tenant A | `dev-clinic` | staff | `staff_a` | `StaffPass1!` |
| Tenant B | `test-clinic` | admin | `admin_b` | `AdminPass2!` |
| Tenant B | `test-clinic` | doctor | `doctor_b` | `DoctorPass2!` |
| Tenant B | `test-clinic` | staff | `staff_b` | `StaffPass2!` |

Login is two-step: `POST /auth/login` with `{"subdomain":"dev-clinic","username":"admin_a","password":"AdminPass1!"}`, then `POST /auth/select-branch` with the returned pending token.
```

- [x] **Step 2: Leave the "Expected seed output" echo block exactly as-is** (grill B5 — no edit in this step).

- [x] **Step 3: Fix any curl example bodies elsewhere in the file**

Grep the file for any `curl`/request-body example using `email`/`password` for the clinic login and replace with `{"subdomain","username","password"}` per `loginSchema` (`.strict()`, extra fields rejected). Leave the Phase 8 note's `/platform/login` reference and the platform credential (email) untouched — platform stays email by design.

- [x] **Step 4: Apply the test-count policy (grill B4)**

Update "Expected: **8 tests pass**..." line (or wherever the doc states a stale total) to reflect current reality: state the current full-suite totals (832 backend / 143 frontend) alongside a note that early-Phase-1 unit-only counts are historical. Do not delete the historical figure if it's presented as "at that point in setup" — add the current total as the authoritative "full suite" number.

- [x] **Step 5: Commit**
```bash
git add HOW-TO-RUN.md
git commit -m "docs(onboarding): fix HOW-TO-RUN.md to username-based clinic login, keep platform email login and seed echo intact (ADR-0006 D2, grill B5)"
```

---

### Task 3 (ADR D2 part 2): Fix `README.md`

**Files:**
- Modify: `README.md`

**Verified facts:**
- Frontend stack (real, from `src/frontend/package.json`): React `^18.3.0`, Tailwind `^3.4.3`, Zustand `^4.5.2`, Vite `^5.2.10`. (Current README's "Tech Stack (Recommended)" table lists React 19 + TS 5 + Tailwind CSS 4 + Recharts/Radix UI/Redis/Cornerstone.js/Omise/Stripe/LINE/Twilio as if already integrated — this table conflates "recommended/future" with "actually built." Rewrite it as the real, current stack; anything genuinely not-yet-integrated (Redis, Cornerstone.js DICOM viewer, Omise/Stripe, LINE/Twilio) moves to a clearly-labeled "Planned (Phase 10/11)" row or is removed if there's no near-term phase for it.)
- Real folder structure (from `ls`): project uses `.claude/` (not `claude/`), agent files live at `.claude/agents/<name>.md` + `.claude/agents/<name>/SKILL.md` (not a single `claude/agents/<name>.md`), skills live at `.claude/skills/anemal-*/`, frontend state dir is `src/frontend/src/store/` (singular — not `stores/`), frontend also has `guards/`, `hooks/`, `i18n/`, `layouts/`, `test/`, `utils/`, `__tests__/` alongside `components/`/`views/`. `HistoryLog.md` is referenced twice in the current README but does not appear to be a currently-maintained tracked file for this batch's scope — verify its existence before deciding to keep or remove the reference (if it doesn't exist, remove both references; if it exists, keep but do not invent claims about what it contains).
- Agent list: current README lists only 5 agents (pm/uiux/db/dev/qa) at `claude/agents/<name>.md`. Real agent set per CLAUDE.md's Agent Router includes `@ba-agent` and `@ponytail-agent` too, and the real file locations are `.claude/agents/<name>.md` (system prompt) + `.claude/agents/<name>/SKILL.md` (skill body) — update the table to list all agents actually in the Agent Router and point at real paths.
- Phase table: current README stops at Phase 8 (~394 tests) plus a placeholder Phase 9 "Planned" row — actual state per CLAUDE.md is Phase 9 (i18n, 95 frontend tests) ✅ done, D-1–D-5 (447 backend tests) ✅ done, and Codex Audit Batches 1–4 now complete. Sync the table to match CLAUDE.md's phase table (Task 4 keeps these two tables in lockstep — do this task first, then mirror into CLAUDE.md in T4).
- **(grill B4)** Per-phase historical cells (e.g. "✅ Complete (226)") stay as historical, phase-scoped counts — do not rewrite them to 832. Only the standalone present-tense summary line (the "*Last updated: ... ~394 tests passing*" footer) is not phase-scoped and gets updated to the current 832/143 total, since it claims to describe "now," not "as of Phase 8."

- [x] **Step 1: Rewrite the "Tech Stack" table to real, current versions**

Replace the "Tech Stack (Recommended)" heading and table with a "Tech Stack (Current)" table reflecting: Frontend — React 18.3, TypeScript, Tailwind CSS 3.4, Zustand 4.5, Vite 5.2; Backend — Node.js + Express 4.19; Database — PostgreSQL 15+ + Prisma 5.13; Auth — JWT (tenant_id/branch_id embedded, username-based clinic login, email-based platform login); File Storage — AWS S3 (credential-gated, see implementation-status-matrix.md). Move Omise/Stripe, LINE/Twilio, Redis, Cornerstone.js DICOM viewer, Recharts/Radix UI to a separate "Planned / Deferred" list citing Phase 10/11 and the new matrix, rather than presenting them as current stack.

- [x] **Step 2: Fix the "Folder Structure" block**

Replace `claude/` with `.claude/`, remove the "(rename to .claude/ in production)" comment (it already is `.claude/`), fix `stores/` → `store/`, and correct any other stale path. Verify `HistoryLog.md`'s existence before keeping/removing its two references.

- [x] **Step 3: Fix the "AI Sub-Agent Team" table**

Expand to all agents in CLAUDE.md's Agent Router (pm, ba, uiux, db, dev, ponytail, qa) with correct file paths (`.claude/agents/<name>.md` + `.claude/agents/<name>/SKILL.md`).

- [x] **Step 4: Sync the phase table**

Add rows/update statuses for Phase 9 (✅ 95 frontend tests), D-1–D-5 (✅ 447 backend tests), and a new Codex Audit Batches 1–4 row (✅, 832 backend + 143 frontend — this is the same row CLAUDE.md gets in T4, keep the wording identical between the two files).

- [x] **Step 5: Update the footer date/summary line**

Change the "*Last updated...*" line to reflect Codex Audit Batch 4 completion and the current 832/143 totals (this is the one non-phase-scoped count this file updates per the B4 policy).

- [x] **Step 6: Commit**
```bash
git add README.md
git commit -m "docs(readme): sync tech stack, folder structure, agent list, and phase table to current state (ADR-0006 D2)"
```

---

### Task 4 (ADR D2 part 3): Fix `CLAUDE.md` phase table only

**Files:**
- Modify: `CLAUDE.md` (Phases table + Tracking & Documentation section ONLY)

**Scope guard (explicit verification step, not optional):** this task's diff must touch ONLY the `## Phases` table and the `## Tracking & Documentation` section. No line in the Agent Router table, Standard Pipeline, Ponytail Gate, Critical Rules, Project Structure, or Superpowers Integration sections may appear in this task's diff. Verify with `git diff CLAUDE.md` before committing — if any other section shows a diff, revert it before committing.

- [x] **Step 1: Add the Codex Audit row to the Phases table**

Current table (CLAUDE.md lines ~148-155):
```
| Phase | Focus | Status |
|-------|-------|--------|
| 1–7 | Foundation → UI redesign | ✅ 226 tests |
| 8 | RBAC + Platform Console | ✅ ~394 backend tests |
| 9 | i18n Thai/English (16 screens, no library) | ✅ 95 frontend tests |
| D-1–D-5 | Username login, company types, payment history, owner-first browse | ✅ 447 backend tests |
| 10 | Payment gateway + SaaS billing | ⏸ needs credentials |
| 11 | LINE/SMS dispatch | ⏸ needs credentials |
```
Add one new row after the D-1–D-5 row and before Phase 10:
```
| Codex Audit | Batches 1–4: stop-ship fixes, decision docs, QA automation, doc repair (PRs #8/#9/#10 + this batch) | ✅ 832 backend + 143 frontend tests |
```
Leave every existing row's historical count untouched (grill B4 — per-phase counts stay as-is; only the new row carries the current 832/143 total).

- [x] **Step 2: Add the matrix discoverability hook (grill B2 — mandatory, not optional)**

In the `## Tracking & Documentation` section, add one line (do not restructure the section, do not touch any other bullet in it):
```
- `.claude/specs/implementation-status-matrix.md` is the canonical module-level implementation-status source; `@pm-agent` updates it LAST on every task, alongside the phase status/test count/HTML docs it already updates last.
```

- [x] **Step 3: Verify the scope guard**

Run `git diff CLAUDE.md` and confirm every changed line falls inside `## Phases` or `## Tracking & Documentation`. If not, fix before committing.

- [x] **Step 4: Commit**
```bash
git add CLAUDE.md
git commit -m "docs(claude-md): add Codex Audit phase row and matrix discoverability hook (ADR-0006 D2, grill B2)"
```

---

### Task 5 (ADR D3): Surgical screen-spec edits (7 files)

**Files:**
- Modify: `.claude/skills/anemal-screen-specs/SKILL.md`
- Modify: `.claude/skills/anemal-screen-specs/references/00-shared-layout.md`
- Modify: `.claude/skills/anemal-screen-specs/references/08-admin.md`
- Modify: `.claude/skills/anemal-screen-specs/references/01-login.md`
- Modify: `.claude/skills/anemal-screen-specs/references/06-inventory.md`
- Modify: `.claude/skills/anemal-screen-specs/references/07-billing-pos.md`
- Modify: `.claude/skills/anemal-screen-specs/references/04-pet-owner.md`

**Verified facts:**
- `SKILL.md`'s screen index lists "Admin Control Center ... `views/admin/AdminView.tsx`" — that component does not exist. Real components (confirmed via `ls src/frontend/src/views/admin/`): `AdminDashboard.tsx`, `AdminUsers.tsx`/`UserManagementTab.tsx`, `AdminProfile.tsx`/`ClinicProfileTab.tsx`, `AdminUsage.tsx`, `AdminSettings.tsx`/`ClinicSettingsTab.tsx`, `AdminSubscription.tsx`/`SubscriptionTab.tsx`, plus `AdminBranches.tsx`, `AdminBloodBank.tsx`, `AdminAudit.tsx` (none of which appear in the SKILL.md index at all — unspecced).
- `00-shared-layout.md`'s nav table (lines 70-75) lists routes as `/admin/dashboard`, `/admin/users`, etc. Real frontend routing (`App.tsx:95-120`) mounts the admin section at `/clinic-admin/*` with `RequirePlane plane="clinic"`; `/admin/*` paths are now legacy redirect-only routes (`<Navigate to="/clinic-admin/..." replace/>`). The nav table is also missing rows for Branches, Blood Bank, and Audit (real routes exist: `/clinic-admin/branches`, `/clinic-admin/blood-bank`, `/clinic-admin/audit` per `App.tsx:118-120`) and there is no Roles nav row either (Users & Roles combines them under `/clinic-admin/users`, per the existing `group` icon row — confirm before deciding whether "Roles" needs its own row or is already covered by "Users & Roles").
- `08-admin.md` headings use `/admin/dashboard`, `/admin/users`, `/admin/profile`, `/admin/settings`, `/admin/subscription` — same legacy-prefix problem, and the file has no entries at all for Branches/Blood Bank/Audit (unspecced screens with real, shipped components).
- `01-login.md` line 61 lists "Email | `mail` | email" as a form field — real login is username-based (D-1). Change to Username.
- `06-inventory.md` line 59 says "inter-branch transfers, camera barcode scanning (currently barcode is a manual text field)" — phrasing already correctly separates transfers (implemented) from barcode (deferred), but confirm transfers reads unambiguously as implemented (not bundled into the parenthetical "currently... manual" caveat, which as currently worded could be misread as applying to transfers too).
- `07-billing-pos.md` line 6 says "Status: Implemented (Phase 3) — browser-print receipt + placeholder PromptPay QR; gateway deferred to Phase 4" and line 59 lists "Real PromptPay QR (node-qrcode/EMVCo)... Deferred to Phase 4" — this is now stale: PromptPay QR generation (`services/promptpay-qr.service.ts`) is real (not a placeholder) but **credential-gated** (422 without a configured `promptpayId`), and "Phase 4" is the old phase numbering (README's Phase 3/4 predate the 2026-06-13 resequence to Phase 1-11 — real deferred item is the card gateway, tracked as Phase 10 in the current numbering). Card gateway (Omise/Stripe) remains genuinely deferred.
- `04-pet-owner.md` line 163 says "Real S3 pre-signed photo upload (currently `photoUrl` display only — see remaining-tasks Session E)" — S3 presign is implemented in code (`services/upload.service.ts`), just credential-gated (503 without S3 env vars) — not "display only." Camera-barcode capture is the item that's genuinely not built (deferred).

- [x] **Step 1: `SKILL.md` — fix dead ref, add coverage table, add write-on-next-touch rule**

Change the screen-index row `Admin Control Center | Implemented | references/08-admin.md | views/admin/AdminView.tsx` → `views/admin/AdminDashboard.tsx (+ AdminLayout)`. Add a new "Coverage & deferrals" section listing every routed-but-unspecced admin screen (Branches, Blood Bank, Audit, and any Platform-plane screens not yet in this skill's index) with a one-line note "not yet specced — write-on-next-touch." Add a rule: "An unspecced shipped screen gets a spec only when it is next modified — do not batch-write specs for screens no one is touching (ADR-0006 D4)."

- [x] **Step 2: `00-shared-layout.md` — nav table route prefix + missing rows**

Change all `/admin/*` entries in the nav table to `/clinic-admin/*`. Add nav rows for Branches (`/clinic-admin/branches`), Blood Bank (`/clinic-admin/blood-bank`), Audit (`/clinic-admin/audit`) matching the table's existing icon/label/route column format. Confirm whether "Users & Roles" already covers role management or whether a separate Roles row is warranted, based on what `App.tsx` actually routes — do not invent a new route that doesn't exist.

- [x] **Step 3: `08-admin.md` — heading route prefixes + unspecced pointers**

Change every `/admin/...` heading to `/clinic-admin/...`. Add one-line pointer entries for Branches, Blood Bank, Audit sections: "`/clinic-admin/branches` → `AdminBranches.tsx` — not yet specced, write-on-next-touch (see SKILL.md coverage table)." (repeat pattern for the other two).

- [x] **Step 4: `01-login.md` — Email field → Username**

Change the form-field table row "Email | `mail` | email" → "Username | `person`| text" (or whatever icon convention the rest of this file's field rows use — match it, do not invent a new one). Read the surrounding rows first to match the existing table's icon-naming convention exactly.

- [x] **Step 5: `06-inventory.md` — confirm transfers reads as implemented**

Reword line 59 if needed so branch transfers is unambiguously "implemented" and only the camera-barcode clause is caveated, e.g.: "Per-branch stock (`branch_inventory`) and inter-branch transfers are implemented; barcode scanning is currently a manual text field (camera capture deferred)."

- [x] **Step 6: `07-billing-pos.md` — precise credential-gated wording**

Change line 6's status line to something like: "Status: **Implemented** — browser-print receipt; PromptPay QR generation implemented but **credential-gated** (422 without a configured `promptpayId`); card gateway (Omise/Stripe) deferred to Phase 10." Update line 59's "Deferred to Phase 4" list to drop "Real PromptPay QR" (it's built, just credential-gated — move it out of the deferred list into the status line above) and correct "Phase 4" references to "Phase 10" per the current phase numbering; keep "Omise/Stripe card gateway + webhooks" and "PDF (pdfkit) + email receipts" in the deferred list if those are still genuinely unbuilt — verify PDF receipt status against the matrix (T1) before finalizing, since the matrix's billing row doesn't currently list PDF as shipped.

- [x] **Step 7: `04-pet-owner.md` — S3 presign wording**

Change line 163 to: "S3 pre-signed photo upload is implemented but **credential-gated** (503 `STORAGE_NOT_CONFIGURED` without S3 env vars — see `services/upload.service.ts`); camera-barcode capture remains deferred (not built)." Remove the stale "remaining-tasks Session E" pointer if that file/section no longer exists — verify before deciding whether to keep, update, or drop the pointer.

- [x] **Step 8: Commit**
```bash
git add .claude/skills/anemal-screen-specs/SKILL.md .claude/skills/anemal-screen-specs/references/00-shared-layout.md .claude/skills/anemal-screen-specs/references/08-admin.md .claude/skills/anemal-screen-specs/references/01-login.md .claude/skills/anemal-screen-specs/references/06-inventory.md .claude/skills/anemal-screen-specs/references/07-billing-pos.md .claude/skills/anemal-screen-specs/references/04-pet-owner.md
git commit -m "docs(screen-specs): fix dead component ref, /clinic-admin route prefix, username field, and credential-gated wording across 7 files (ADR-0006 D3)"
```

---

### Task 6: Final verification (docs-only proof + grep sweeps)

- [ ] **Step 1: Run the full backend suite (regression proof — nothing executable changed)**
```
node node_modules/jest/bin/jest.js --runInBand --forceExit
```
(from `src/backend`) — expect **832** tests passing, zero failures, zero new suites (this batch adds/modifies no test files).

- [ ] **Step 2: Run the full frontend suite**
```
npm test -- --run
```
(from `src/frontend`) — expect **143** tests passing, zero failures.

- [ ] **Step 3: Grep sweep — no stray `/admin/*` route strings remain in the edited screen-spec files**
```
grep -n "/admin/" .claude/skills/anemal-screen-specs/references/00-shared-layout.md .claude/skills/anemal-screen-specs/references/08-admin.md
```
Expected: no output (all should now read `/clinic-admin/*`). If any legitimate reference to the legacy `/admin/*` redirect routes is intentionally retained (e.g. documenting the redirect itself), confirm it's clearly labeled as "legacy redirect," not presented as the current path.

- [ ] **Step 4: Grep sweep — no email-based clinic login references remain in HOW-TO-RUN.md's credential/curl sections**
```
grep -n "email" HOW-TO-RUN.md
```
Expected: only the platform-admin email reference and the untouched seed-echo block (grill B5) should remain — no email appearing in a clinic login credential table or clinic curl body.

- [ ] **Step 5: Confirm `RecomendByCodex/` and `.claude/roadmap/ACTIVE/*` were never staged**
```
git log --stat docs/codex-audit-batch4-doc-repair -- RecomendByCodex .claude/roadmap/ACTIVE
```
Expected: no output.

- [ ] **Step 6: Confirm commit order and count**
```
git log --oneline docs/codex-audit-batch4-doc-repair
```
Expected: 5 commits (T1→T2→T3→T4→T5), with ADR-0006 and this plan file included in T1's diff (per the task brief: "First commit includes ADR-0006 + plan file").

- [ ] **Step 7: Hand off**

Hand off to `@ponytail-agent` (Step 5 gate) before `/execute-plan`, then `@qa-agent` (Step 7) for sign-off — QA's role this batch is limited to confirming the two grep sweeps above and the full-suite regression run, since there is no new executable behavior to test. Then `/anemal-finish-branch` (Step 8, which invokes `/anemal-HTML-updater` as its last act) — this is the FINAL batch of the Codex audit remediation program; the finish-branch step should note in the PR description that this closes out Batches 1–4 (PRs #8/#9/#10 + this one).
