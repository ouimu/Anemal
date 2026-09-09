# HANDOFF — Code-quality refactor backlog (Lane D)

**Worktree:** `D:\Development\Anemal\.claude\worktrees\refactor+code-quality-phase1`
**Branch:** `worktree-refactor+code-quality-phase1`
**Status:** Phase 1 committed. Main untouched. Not merged.

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
**Current (after F-1/F-3 coverage additions, commit `7cea708`):** 95/95
suites, 1325/1325 tests, green. Use this count for Phase 2's Gate 4 check,
not the original 93/1310.

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
- [ ] **Phase 3 — Duplication:** stock-deduction raw SQL repeated in
  `invoice.repository.ts:68`, `prescription.repository.ts:48`,
  `transfer.repository.ts:17`. Extract one `deductBranchStock(tx, tenantId,
  branchId, productId, qty)` helper. Check existing coverage per repo file
  before touching — these are financial/inventory paths, treat cautiously.
- [ ] **Phase 4 — God-file:** `services/platform-customers.service.ts` (563
  lines) mixes tenant/customer lifecycle with tenant-admin-user lifecycle.
  Split in two — `platform-customer-admin-users.test.ts` already treats the
  admin-user half as a separate concern, so a characterization baseline
  partially exists; verify full coverage before splitting.
- [ ] **Phase 5 — Multi-tenancy consistency:** `vaccination.repository.ts:66`
  (`findDueSoonWorklist`) joins `pets`/`owners` without an explicit tenant
  guard on the joined tables (FK integrity covers it today; inconsistent with
  the explicit-guard pattern elsewhere). Low risk, defense-in-depth only —
  **hand to `@db-agent` for review**, not a plain Lane D mechanical fix, since
  it touches the multi-tenancy veto surface.

### Frontend
- [ ] **Phase 6 — Duplication:** ~25 screens hand-roll modal overlay markup
  instead of reusing `components/platform/PlatformModal.tsx`. Extract one
  shared `<Modal>` primitive, migrate call sites incrementally (this alone
  should probably be its own multi-commit phase, screen by screen).
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

Phase 1 and Phase 2 are fully closed (implementation, ponytail gate, QA
review). Baseline is still **95/95 suites, 1325/1325 tests** — Phase 2 added
no test files, only refactored existing controllers, so the count didn't
move. F-5/F-6 (low-priority test-coverage gaps on the new shared guard) are
open, not blocking — fold into whichever phase next touches the OAuth test
files, or do as a standalone small task if asked.

Resume with Phase 3 (stock-deduction SQL dedup across invoice/prescription/
transfer repositories) — financial/inventory paths, treat cautiously per
the backlog note. Follow the **Phase loop** above in full, QA step included.

Do not merge to `main` until the user has reviewed the full backlog and
decided how many phases they want landed in this pass.
