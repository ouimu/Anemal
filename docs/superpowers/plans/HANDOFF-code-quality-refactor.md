# HANDOFF — Code-quality refactor backlog (Lane D)

**Worktree:** `D:\Development\Anemal\.claude\worktrees\refactor+code-quality-phase1`
**Branch:** `worktree-refactor+code-quality-phase1`
**Status:** Phases 1-5 done (backend). Phase 6 attempted, pulled to Lane A
(human decision, 2026-09-10) — see its entry below. Phases 7-10 PAUSED,
awaiting explicit go-ahead. Main untouched. Not merged.

## Origin

Full-codebase `/code-review`-style scan (2 parallel general-purpose agents, one
backend, one frontend) produced a refactor backlog. Per the Lane D scope guard
("all/entire/whole repo → backlog first, one item per branch") this is being
worked as one phase per commit inside a single isolated worktree, not merged
to `main` until the user reviews.

## Environment note for whoever resumes this

This worktree needed local setup that a fresh worktree does **not** inherit
(all gitignored, none committed, no action needed unless you start a *new*
worktree):
- `npm ci` run in `src/backend` (node_modules is not copied/linked across
  worktrees automatically — a node_modules **junction** to the main checkout
  silently breaks jest's file discovery, see below. Do a real `npm ci`.)
- `npx prisma generate` run in `src/backend`
- Root `.env` copied from the main checkout (`D:\Development\Anemal\.env`) —
  required or `config/env.ts`'s `required()` throws on `JWT_SECRET`/`CRON_SECRET`.
- `src/backend/.env.test` copied from the main checkout, with one line added:
  `SETTINGS_ENCRYPTION_KEY=<64-hex-char local-only test key>` (main's own
  `.env.test` doesn't carry it — likely relies on a machine env var elsewhere
  on the primary dev box that isn't present here).

**Known infra gotcha (not a code bug, don't try to fix it via source edit):**
`jest.config.js`'s `testPathIgnorePatterns: ['/node_modules/', '/\.claude/worktrees/']`
is written to protect a scan launched from the **main checkout** against
double-discovering nested worktree copies. Run from *inside* a worktree
(as this session is), the worktree's own absolute path always contains
`.claude/worktrees/...`, so that pattern silently matches and excludes every
test file — `jest` reports "0 matches" with no error. Work around it per-run
with `--testPathIgnorePatterns "/node_modules/"` on the CLI; do not edit the
committed config to fix this (it protects a real scenario for other callers).

**Baseline:** 93/93 suites, 1310/1310 tests, green — recorded at
`docs/superpowers/plans/baseline-backend-tests-2026-09-09.log`.
**Current (after Phase 3, commit `506a398`):** 97/97 suites, 1335/1335
tests, green. Use this count for Phase 4's Gate 4 check.

## Phase loop (standard from here on — every phase, no exceptions)

1. **PRE** — confirm characterization coverage exists for the target files
   (Lane D gate 2). No coverage → write it first.
2. **BRIEF** — state the file scope for this phase explicitly before touching
   anything (matches orchestration-protocol.md's PRE→BRIEF→POST→LOG contract).
3. Implement in small atomic commits, each independently revertable.
4. **Full backend suite rerun**, compare counts against the last recorded
   baseline — must match exactly (test-set equality gate).
5. **Reverse-ponytail gate** (`@ponytail-agent`, mode=reverse) — APPROVE
   required before commit. A REJECT is fixed and re-gated, not overridden.
6. **QA formal review** (`@qa-agent`) — required before a phase is considered
   done, not just before the final merge. Re-verifies: tests actually green
   (re-run, not trusted from the implementer's report), tenant/RBAC logic
   byte-for-byte preserved in every moved/extracted function, contract
   unchanged (routes/status/response shape/permission codes), and any
   subtle behavioral details (short-circuits, ordering, error branches)
   preserved exactly. Verdict recorded in this file next to the phase.
7. **LOG** — commit, then update this HANDOFF: check the phase's box, note
   the commit SHA, the ponytail verdict, and the QA verdict.

This loop applies to every remaining phase below, including ones already
flagged for `@db-agent` (Phase 5) or extra characterization work (Phase 7) —
those just add a step before step 1, they don't skip the QA step.

## Backlog (ordered risk · payoff · existing coverage)

### Backend
- [x] **Phase 1 — Layering:** move direct `prisma.*` calls out of 4 controllers
  (oauth-google, oauth-onedrive, role, settings) into repo/service functions.
  Committed `77f004e`. Reverse-ponytail: APPROVE as documented exception
  (LOC +34, abstractions/dependencies both down — see commit body).
  QA formal review (`@qa-agent`): **APPROVE**. Independently re-ran the full
  suite (93/93, 1310/1310, exit 0), diffed suite-name sets against baseline
  (zero drift), re-ran `tsc --noEmit` and `eslint` on all 10 changed files
  (both clean), and traced the highest-risk detail — `resolvePermissions`
  argument order and the short-circuit around it in `isStillEntitled` — line
  by line against both original inline blocks. No tenant/RBAC drift, no
  contract change. Findings recorded, none blocking:
  - **F-1 (medium) — RESOLVED 2026-09-09, commit `7cea708`:** added
    `tests/integration/settings-oauth-authorize.test.ts` — 8 new tests
    (401/403/503/200 × google + onedrive) covering `googleAuthorize`/
    `onedriveAuthorize` and, through them, `getTenantSubdomain()`.
  - **F-2 (medium) — RESOLVED 2026-09-09:** QA and `@ponytail-agent` counted
    "abstractions" differently (QA: +7 raw new exports; ponytail: down, by
    duplicated-call-site count). Escalated to the human, decided: count
    duplication/call-site reduction, not raw new exports — collapsing N
    repeated blocks into 1 shared function counts as **down** even though it
    adds an export, because the point of the metric is "how many places need
    a fix repeated," not "how many named things exist." `@ponytail-agent`'s
    original Phase 1 verdict (APPROVE) was already using this definition and
    stands unchanged. Codified in
    `.claude/agents/ponytail-agent/SKILL.md` under Mode 3 (`reverse`).
  - **F-3 (low) — RESOLVED 2026-09-09, commit `7cea708`:** added
    `__tests__/isStillEntitled.test.ts` — 7 mocked unit tests covering every
    branch (active+entitled, active-but-lacking-permission, user-inactive,
    tenant-inactive, both-inactive, user-not-found, tenant-not-found),
    including an explicit assertion on the `undefined !== false`
    short-circuit quirk preserved verbatim from the original inline code.
  - **F-4 (info):** this HANDOFF file was uncommitted at review time —
    fixed by this commit.
  - Bonus finding: zero `../config/db` imports remain anywhere under
    `src/backend/controllers/` — architecture-rules.md §1 is now fully
    satisfied for the backend controller layer, not just the 4 sites touched.
  - **Updated baseline after F-1/F-3 fixes:** 95/95 suites (+2), 1325/1325
    tests (+15), tsc clean. Additions only, no existing test touched
    (Gate 4 test-set equality unaffected).
- [x] **Phase 2 — Duplication:** OAuth Google/OneDrive controllers shared
  ~50 near-identical lines beyond the N-9 block already deduped in Phase 1
  (state verify, nonce consume, code-presence check, error-redirect
  construction). Extracted `services/oauth-callback-guard.service.ts`'s
  `runOAuthCallbackGuard()` (shipped there, not `oauth-callback.helper.ts` as
  originally named in this backlog line — the service location is more
  layer-conformant, per QA's own note below). Committed `8197aa4`.
  Reverse-ponytail: APPROVE (abstraction count down — 2 duplicated ~25-line
  blocks collapsed to 1 shared function, per the definition codified after
  Phase 1's F-2; LOC down code-only; deps flat; contract unchanged). First
  gate run wrongly REJECTed on a tooling error (ran a name-filtered 5-suite
  subset, mistook it for the full suite) — corrected to APPROVE against the
  actual full-suite logs on disk.
  QA formal review (`@qa-agent`): **APPROVE**. Independently re-ran the full
  suite (95/95, 1325/1325, exit 0), confirmed test-set equality structurally
  (commit touches 0 test files), `tsc --noEmit` clean, and compared origin
  selection + error-suffix string at all 5 failure points × 2 providers
  against the original inline code (git diff `-` lines) — exact match on
  all 10, including that `consumeNonce` still runs before the `!code` check
  so a code-less callback still burns its nonce, same order as before.
  Verified `guard.code` (not `query.code`) is what reaches
  `exchangeCodeForTokens` in both controllers. Findings, none blocking:
  - **F-5 (low):** `freshState()` in both OAuth callback test files signs
    `origin: 'http://localhost:5173'`, identical to `DEFAULT_ERROR_ORIGIN` —
    the suite cannot currently distinguish "used the default origin" from
    "used verified.origin" on any branch, which is exactly this refactor's
    highest-risk axis. Pre-existing test gap, not introduced by Phase 2.
    Fix: sign one state per test file with a distinct origin.
  - **F-6 (low):** the `!query.state` guard branch is untested for both
    providers; `!query.code` is untested for Google specifically (OneDrive
    has OD-CB-14 already).
  - **F-7 (info) — fixed by this commit:** this backlog line originally
    named the target file `oauth-callback.helper.ts`; shipped code uses
    `services/oauth-callback-guard.service.ts` instead.
- [x] **Phase 3 — Duplication (financial/inventory, extra scrutiny):**
  stock-deduction raw SQL was repeated in `invoice.repository.ts:68`,
  `prescription.repository.ts:48`, `transfer.repository.ts:17`. Extracted
  `product.repository.ts`'s `deductBranchStock(tx, tenantId, branchId,
  productId, qty): Promise<boolean>` — deliberately returns a boolean, never
  throws, so each call site's distinct failure handling (invoice: per-item
  ConflictError; prescription: return null; transfer: fixed-message
  ConflictError) stayed untouched. Committed `8db4a68`.
  Reverse-ponytail: APPROVE (abstraction count down — 3 duplicated blocks
  to 1 — files/deps flat, LOC +4 code-only).
  QA formal review (`@qa-agent`) — took **3 rounds**, the most scrutiny any
  phase in this backlog has had, appropriately for a money/inventory path:
  - **Round 1: BLOCKED.** The extracted code itself verified correct (SQL
    byte-identical, return-value semantics equivalent, all 3 failure
    behaviors preserved, tenant scoping intact) — but `prescription.repository.ts`'s
    `deductStockAndCreate` and `transfer.repository.ts`'s `createTransfer`
    had **zero test coverage** before this refactor, violating Lane D
    Gate 0. Fixed: added `__tests__/prescription-stock-deduction.test.ts`
    and `__tests__/transfer-stock-deduction.test.ts` (happy path, exact-stock
    boundary, insufficient-stock with no-partial-writes verified via DB
    state not just return value, and a concurrency case). Committed
    `5bc4a45`. 97/97 suites, 1333/1333 tests.
  - **Round 2: CONDITIONALLY APPROVED**, on one finding: QA *measured*
    (mutated `deductBranchStock` to a naive SELECT-then-UPDATE, ran only the
    new concurrency test) that it passed 5/5 even against the broken
    version — the "two concurrent calls" test only proved JS-level timing
    interleaving, not real database-level atomicity. Fixed: added a
    deterministic version holding one transaction's row lock open and
    starting the second only once the first's lock was signaled taken.
    Committed `c46bffc`. Self-verified both directions before resubmitting.
  - **Round 2.5 (same conditional-approval cycle): STILL BLOCKED.** QA
    measured the "deterministic" fix directly (timing instrumentation) and
    found it wasn't deterministic either — `releaseA()` fired before B's
    UPDATE reached Postgres in most runs (B completed uncontended in 1-5ms,
    not the ~400ms+ a real block takes), because a resolved-promise
    continuation is faster than a fresh transaction's BEGIN round-trip.
    Assertions passed regardless (A always commits first either way) —
    false confidence, not a false failure. QA's own suggested fix: don't
    release the first transaction until the second is *observed* blocked
    via `pg_stat_activity`, not assumed from promise ordering. Fixed:
    capture B's backend pid via `SELECT pg_backend_pid()`, poll a third
    connection for `wait_event_type = 'Lock'` on that pid, assert
    `observedBlocked === true` before releasing. Committed `506a398`.
  - **Round 3: APPROVE.** QA verified the fix two independent ways
    (a timing probe confirming B genuinely blocks 427-438ms once contended,
    and re-running the same naive-mutation test — which now correctly
    FAILS instead of passing by luck), confirmed no mutation artifacts
    leaked into `product.repository.ts` (byte-identical to `8db4a68`), and
    confirmed Gate 4 holds (95→97 suites, 1325→1335 tests, additions only).
  - **Non-blocking backlog note:** `deductStockAndCreate` and
    `createTransfer` open `prisma.$transaction` in the repository layer;
    `architecture-rules.md` §5 puts transaction ownership in the service
    layer. Pre-existing (not introduced by Phase 3), not fixed here — a
    candidate for a future phase if this backlog grows one.
  - **Updated baseline after Phase 3 (all 4 commits):** 97/97 suites,
    1335/1335 tests, tsc clean.
- [x] **Phase 4 — God-file:** `services/platform-customers.service.ts` (563
  lines) mixed tenant/customer lifecycle with tenant-admin-user lifecycle.
  Split verbatim into `services/platform-customer-admin-users.service.ts`
  (4 functions, 5 error classes, 3 types — largest file now 354 lines).
  Committed `faa93c7`.
  Reverse-ponytail: APPROVE, and this phase added a 5th dimension to the
  gate — **"largest-file LOC"** — since the original 4 dimensions were
  written for collapsing duplicates and can't express a legitimate split
  (file count necessarily rises by definition). Codified in
  `.claude/agents/ponytail-agent/SKILL.md` Mode 3, same pattern as Phase 1's
  abstraction-count resolution: when file count rises but the file `gate`
  mode's own >500-LOC criterion flagged actually shrinks (562→354), and the
  move is verbatim with zero new abstractions, that counts as down.
  QA formal review (`@qa-agent`): **APPROVE**, zero findings. Verified the
  move byte-for-byte (140/140 code lines identical in order between the
  deleted and added diff hunks), all 4 controller call sites correctly
  repointed, no import cycle, `CustomerNotFoundError`'s cross-file export
  still resolves for `platform-plans.service.ts`, no route/contract change,
  and confirmed no code anywhere does `instanceof` on any of the 5 relocated
  error classes (global `AppError` handler only) so the move carries zero
  identity risk.
  **Baseline unchanged:** 97/97 suites, 1335/1335 tests (pure structural
  move, no test file touched — the existing admin-user test already reached
  this code over HTTP regardless of which file it lived in).
- [x] **Phase 5 — Multi-tenancy consistency:** `vaccination.repository.ts`'s
  `findDueSoonWorklist` joined `pets`/`owners` without an explicit tenant
  guard, relying on FK integrity alone. `@db-agent` confirmed this is real
  (no composite FK ties tenantId across vaccinations/pets/owners — verified
  against the schema) and specified the exact fix: `AND p."tenantId" = ...`
  / `AND o."tenantId" = ...` on 5 JOIN clauses. Implemented exactly as
  specified, with 7 new characterization tests
  (`__tests__/vaccination-worklist-repository.test.ts`) run against the
  original code first (Gate 0), then the fix (same 7 pass — no-op on valid
  data). Committed `b60a11f`.
  Reverse-ponytail: APPROVE. Zero new abstractions (no shared guard-builder
  extracted across the two query variants), production LOC +8 (comment
  block only).
  QA formal review (`@qa-agent`): **APPROVE**, with 2 non-blocking findings
  and one **important side-discovery**:
  - **F-5.1 (HIGH, not from this commit, flagged as a separate task, NOT
    fixed here):** while adversarially testing the fix, QA found the
    *sibling* function `findDueSoon` (same file) has the **identical
    cross-tenant PII leak** via a different code path — a Prisma `include`
    that follows the pet/owner relation without a tenant filter, instead of
    raw SQL. QA reproduced it live (seeded a cross-tenant FK mismatch,
    confirmed leaked pet/owner data in the response). Route-reachable
    (`GET /vaccinations/due-soon`). This is a real bug outside `@db-agent`'s
    original review scope (raw SQL only) and outside Lane D (fixing it
    changes behavior on corrupted data, arguably fine for Lane D's own
    "no-op on valid data" standard, but it needs its own review + Gate 0
    pass, not a bundled addition to this commit). Spawned as a standalone
    task for the user rather than silently deferred — **not yet fixed**.
  - **F-5.2 (medium, non-blocking):** no test exercises the guard itself —
    deleting it would keep all 1342 tests green. QA's own adversarial probe
    (seed a cross-tenant FK violation, assert 0 leaked rows) should be
    productionized into the test file as a follow-up.
  - QA also independently verified the date-comparison fix in the
    characterization tests is timezone-invariant by construction (traced
    the actual UTC round-trip through Postgres), correcting my own
    description of it as "intermittent" — it failed deterministically
    within a ~7-hour UTC-offset window, not randomly.
  **Baseline after Phase 5:** 98/98 suites, 1342/1342 tests, tsc clean.

### Frontend
- [~] **Phase 6 — Duplication — MOVED TO LANE A, 2026-09-10, human decision.**
  Attempted as Lane D: migrated 5 modal instances (AdminBranches, one dialog
  in UserManagementTab, ClinicAppointments, StoragePage, RoleList) onto
  `components/platform/PlatformModal.tsx` — commits `910b70c` (migration)
  and `01b8348` (characterization tests). Ponytail APPROVEd after 2 rounds
  (fixed an unused prop, a stray `package.json` change, disclosed a UI
  delta). QA then found **F-2**: real rendered-result changes stack up
  across the 5 sites that Lane D's "nothing observable changes" bar does
  not allow — `role="dialog"` added on 3 sites that never had it, a close
  (X) button added on 2 sites that never had one, `<h3>`→`<h2>` heading
  changes, StoragePage's title font restyled. Confirmed concretely while
  writing F-1's characterization tests: they cannot pass unmodified against
  the pre-migration DOM (no `role="dialog"` existed), which is itself the
  proof these are real UI changes, not refactor-safe internal reshuffling.
  **Decision:** pull this from the Lane D branch. Same goal (consolidate
  duplicated modal markup), but re-enter through Lane A
  (`/superpowers:brainstorm` → BA → **UIUX A designs the role/close-button/
  heading changes deliberately** instead of them falling out accidentally
  from a shared component) so the visual changes are intended and reviewed,
  not incidental. Commits `910b70c`/`01b8348` stay in this branch's history
  as a **reference/starting point** for that Lane A work, not as part of
  this branch's own deliverable — do not count them toward this Lane D
  branch's merge, and do not build further Lane D phases on top of them.
  **When resuming Lane A for this:** new branch/worktree (never mix a
  refactor and a feature in one branch), starting point is `910b70c` for
  the shared-component shape and `01b8348` for a first pass at
  characterization coverage to build from. Files touched, for reference:
  `components/platform/PlatformModal.tsx` (gained `closeOnBackdropClick`
  prop), `views/admin/AdminBranches.tsx`, `views/admin/UserManagementTab.tsx`
  (only its `DeactivateConfirmDialog` — the main edit `Modal` was never
  touched, sticky-footer layout conflict), `views/clinic/ClinicAppointments.tsx`,
  `views/settings/StoragePage.tsx`, `components/roles/RoleList.tsx`.
  Remaining untouched candidates for whenever Lane A picks this up:
  `views/clinic/ClinicGrooming.tsx` (same sticky-footer conflict),
  `components/roles/CloneRoleModal.tsx`, `views/admin/AdminBloodBank.tsx`,
  `views/clinic/ClinicInventory.tsx`, `components/BarcodeScanner/BarcodeScanner.tsx`,
  `components/IdleLogoutModal.tsx` (all zero test coverage — Gate 0/
  characterization needed regardless of lane), plus `ClinicPets.tsx`/
  `ClinicBilling.tsx`/`ClinicInpatient.tsx` (Phase 7's god-components,
  don't touch their modals until Phase 7 restructures them).

- [ ] **PAUSED, 2026-09-10, human decision — do not start without an explicit
  go-ahead.** Phases 7-10 below are queued but not begun. Resume only when
  the user explicitly asks.
- [ ] **Phase 7 — God-components:** `ClinicPets.tsx` (936 lines, 30 useState),
  `ClinicBilling.tsx`, `ClinicInpatient.tsx` (799 lines), `ClinicEMR.tsx` (767
  lines) — inline modals with their own fetch calls, mixing logic/fetch/
  presentation. Largest, riskiest phase in this backlog; needs
  characterization tests first (Lane D gate 2) since frontend test coverage
  on these views was not verified in this pass — **check before starting**.
- [ ] **Phase 8 — Bypass pattern:** `hooks/useAuth.ts:64` and
  `store/authStore.ts:164` call raw `fetch()` instead of the shared
  `utils/api.ts` axios client, skipping centralized 401 handling.
- [ ] **Phase 9 — Design-system drift:** hardcoded hex in chart/canvas
  contexts (`AdminDashboard.tsx:136`, `ClinicTransactions.tsx:6`,
  `ClinicEMR.tsx:62`) not in the documented token table. Consolidate into
  one `designTokens.ts`.
- [ ] **Phase 10 — Minor cleanup (batch, low risk):** 5 stray `.gitkeep`
  files in populated dirs; 10 non-null assertions without guard comments
  (worst: `ClinicEMR.tsx:100,108,130` double-asserts canvas ref); split
  717-line `i18n/index.ts` into per-feature files.

## Next action

**Phases 1-5 are fully closed** (backend, implementation + ponytail gate +
QA review each). **Baseline: 98/98 suites, 1342/1342 backend tests**;
frontend baseline separately established at 60/60 files, 410/410 tests
(see Phase 6's entry for the `npm ci` setup needed in `src/frontend` too).

**Phase 6 was attempted, then pulled to Lane A** by human decision — see
its backlog entry above for the full reasoning and what to reuse when that
work starts. Do not resume Phase 6 as Lane D.

**Phases 7-10 are PAUSED** by explicit human decision (2026-09-10) — do
not start any of them without the user asking first. When they do:
- Phase 7 (god-components) is the largest/riskiest remaining item — check
  characterization coverage per component before touching anything
  (`ClinicPets.tsx` already has 4 test files per an earlier scan; the
  others are unverified).
- Phase 8 (auth fetch→axios), 9 (design tokens), 10 (minor cleanup batch)
  are smaller, independent of Phase 7 and of each other.

A separate, standalone security finding — **not part of this backlog**,
spawned as its own task — is in flight: `findDueSoon`'s cross-tenant PII
leak (F-5.1, discovered during Phase 5's QA review). Track it separately;
it is Lane B/C, not Lane D, and does not block or depend on anything here.

Do not merge this branch to `main` until the user has reviewed and decided
how much of the backlog to land in this pass.
