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

## Backlog (ordered risk · payoff · existing coverage)

### Backend
- [x] **Phase 1 — Layering:** move direct `prisma.*` calls out of 4 controllers
  (oauth-google, oauth-onedrive, role, settings) into repo/service functions.
  Committed `77f004e`. Reverse-ponytail: APPROVE as documented exception
  (LOC +34, abstractions/dependencies both down — see commit body).
- [ ] **Phase 2 — Duplication:** OAuth Google/OneDrive controllers still share
  ~50 near-identical lines beyond the N-9 block already deduped in Phase 1
  (state/nonce verify, error-redirect construction). Extract a shared
  `oauth-callback.helper.ts`. Covered by `tests/integration/oauth-google-callback.test.ts`
  and `oauth-onedrive-callback.test.ts` — no new characterization tests needed.
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

Resume with Phase 2 (OAuth helper dedup) — same files already touched in
Phase 1, same test coverage, low risk. Follow the same loop: characterization
check → change → full-suite rerun → reverse-ponytail gate → commit.

Do not merge to `main` until the user has reviewed the full backlog and
decided how many phases they want landed in this pass.
