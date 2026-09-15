# HANDOFF — Cross-Tenant Relation Isolation (Lane A)

**Status as of 2026-09-11:** Step 4b **COMPLETE — PASS (3rd pass, independent full re-scan).**
`@pm-agent` wrote the implementation plan at
`docs/superpowers/plans/2026-09-11-cross-tenant-relation-isolation-plan.md` — 14 tasks (XTI-1…XTI-14)
across W0 (serial, 6 tasks) → W1a/b/c/d (parallel, 4 tasks) → W2 (parallel, 4 tasks), a work-partition
manifest satisfying one-owner-per-file-per-wave, and AC-1…AC-10 carried forward from BA §12 with AC-4
as reworded at the grill. Both ponytail FLAG items (catch-all scope, `product.repository.ts` both
branches) and grill decision #3 (`tenant-integrity-scan.ts` committed to W0) are folded into the task
content, not left as separate notes. `@scribe-agent` independently re-verified every file path, every
cited line number, and every cross-doc section reference in the plan against the actual branch content
(not just the 2 previously-flagged `:70`→`:69` spots) — see verdict below.

## Step 5 — APPROVED 2026-09-11 (3rd pass, after 2 REJECTs fixed)

Ponytail gate (mode `gate`) went through 3 rounds:
1. REJECT — drift: arch §4.1's frozen signatures had no task owning the repository files needed to
   write them. Fixed: XTI-11 (W2) given exclusive scope over `pet.repository.ts`,
   `appointment.repository.ts`, `blood-bank.repository.ts`.
2. REJECT — criterion 2 (duplicate work): arch §4.1 rev 2 claimed `appointmentRepo.findPetForBooking`
   needed extracting from `appointment.service.ts`'s "inline pet-check logic" — verified against
   source, that logic doesn't exist; both call sites already use `petRepo.findPetById`. Fixed:
   **arch §4.1 rev 3** — `findPetById` gains the `client?` param (4th, after existing `includeEmr`)
   instead of a new function being built. `appointment.repository.ts` removed from XTI-11's scope,
   stays XTI-7/W1a's alone.
3. **APPROVE** — all 9 criteria pass, drift resolved, no new issues. 3 non-blocking cosmetic notes
   (stale "rev 2" label, a wrong precedent citation, `includeEmr` default preservation) fixed same
   commit.

**Step 6 is unblocked.** Arch doc is now rev 3; plan reflects it throughout.

## W0 — DONE (commit `4285623`, plus platform-customers.repository.ts scope fix `a5e138f`)

XTI-1 through XTI-6 all complete and verified: analyzer (14/14 fixtures), exemption registry,
summary-select consts, false-comment fix, roadmap correction, integrity-scan script. Full suite
green at that point: 65 suites / 1010 tests. **W0→W1 checkpoint result: 18 files had real findings**
(not the ~57/~19 estimate) — this list, not any prior estimate, is what actually drove W1.

**Scope gap found and fixed before W1 dispatch:** `platform-customers.repository.ts` had real
findings (`listTenants`, `getTenantWithPlanAndQuota`) that no task's file scope covered — added to
XTI-10.

## W1 — DONE (commit `9b710b0`)

All 4 parallel workers (W1a Dev A/XTI-7, W1b Dev B/XTI-8, W1c Dev C/XTI-9, W1d Dev D/XTI-10)
complete. Orchestrator did a consolidated re-verification after all 4 reported done (not just trusted
each worker's own report) and found + fixed 3 more issues before committing:
- A shared-analyzer crash (OR-fallback resolver bug) — W1a fixed it first, W1b/W1c independently
  confirmed the same root cause from their own files.
- **`loyalty.repository.ts`** — a THIRD file (after `platform-customers.repository.ts`) with a real
  violation (`findInvoiceOwner`) that no task's scope covered. Fixed directly (same nullable-pet OR
  pattern as `invoice.repository.ts`) rather than dispatching a whole new worker for one line.
- `tenantRelationExemptions.test.ts`'s "well-formed registry" test checked the real global registry
  against one synthetic finding — every entry W1d added read as "stale." Fixed by giving that test its
  own local single-entry registry.

**W1 exit criterion met**: 11 raw findings remain against current `models/`, all covered by valid
exemption entries — `isExemptionRegistryHealthy(TENANT_RELATION_EXEMPTIONS, violations)` is `true`.
Full suite green: 65 suites / 1010 tests. `tsc --noEmit` clean.

**Lesson for W2 dispatch below**: the plan's file lists have twice missed real files
(`platform-customers.repository.ts`, `loyalty.repository.ts`). Don't fully trust a file list frozen
before W0 ran — cross-check against the analyzer's live output before considering any wave's scope
closed.

## W2 — 3 of 4 done (commit `e795abe`)

- **XTI-11 (Dev A) — DONE, fully closed.** Atomicity for createPet/registerDonor landed clean.
  createAppointment/createWalkIn's fix was initially partial (check ran in a transaction, write
  ran in its own nested one, since the first pass avoided touching `appointment.repository.ts`)
  — orchestrator closed it fully by adding `client?` to both repository functions, since no other
  W2 worker touches that file this wave. All 3 writes now have their FK check and write in one
  literal transaction.
- **XTI-12 (Dev B) — DONE, measurement only, no code.** `searchPets` p95 8–12ms, well under
  NFR-01's 500ms — **but found a real, separate regression**: on a freshly bulk-loaded tenant
  (before Postgres autovacuum's first `ANALYZE`), the same query jumps to 3.7–5.6s due to stale
  cardinality estimates on the join XTI-9 introduced. **Orchestrator's call: backlog, not a Step 7
  blocker** — narrow operational window (post-bulk-import, pre-autovacuum), not a correctness bug
  from this change, steady-state is comfortably fast. Needs a `@db-agent`/`@arch-agent` follow-up
  (an explicit `ANALYZE` step after bulk import, or a query restructure less sensitive to stale
  stats) — **not done in this change**, record as backlog when this ships.
- **XTI-13 (@qa-agent) — DONE, 9 behavioural tests + 1 fixture helper, found and fixed a REAL
  live leak** the analyzer's checkpoint never printed: `medical-record.repository.ts`'s
  `prescriptions.drug` (a to-one nested inside an already-guarded to-many) was unguarded — fixed.
  Confirmed a genuine, scoped gap in XTI-1's analyzer (doesn't walk into a to-many's own nested
  include) — documented as a standing test, not silently dropped; extending the analyzer is
  separate follow-up work, out of scope here. **Not done**: converting
  `crossTenantFkWritePathRepro.test.ts` into an ongoing registry-parity check (QA's agent hit a
  rate limit before reaching this part of XTI-13) — the file is unchanged from its original C-1
  form and still passes; this is a nice-to-have regression-guard upgrade, not a correctness gap,
  and is now backlog too.
- **XTI-14 (@db-agent) — NOT YET DISPATCHED.** This is genuinely next.

Full backend suite green after all of the above: 75 suites / 1076 tests. `tsc --noEmit` clean.

## XTI-14 — VETOed once, fixes applied, re-review pending (commit `1a33d0a`)

`@db-agent`'s first pass **VETOed** (non-overrulable): found 2 MORE live leaks of the exact same
shape XTI-13 had already found and fixed once (to-one nested inside an already-guarded to-many):
1. `invoice.repository.ts` `findMedicalRecord` — `prescriptions.drug` (required FK) unguarded.
   Worse than the sibling case: feeds invoice creation, so a corrupt `drugId` wrote another
   tenant's `unitPrice` into a new invoice's line items — financial-integrity corruption, not just
   a read leak.
2. `medical-record.repository.ts` `findById` — `attachments.uploadedByUser` (nullable FK,
   `onDelete: SetNull`) unguarded, leaking another tenant's staff id+name. Needed the
   OR-fallback (null-or-matches), not a bare mirror, since the FK is genuinely nullable (E-4).

Both fixed, both got real behavioral test coverage (`crossTenantRelation.reverseIncludeAttachments
.test.ts` — a corrupt-uploader attachment is proven omitted with no name leak, a NULL-uploader one
proven to still appear). Also fixed 2 stale exemption-registry comments (E-6/E-7) that blamed a
now-fixed analyzer bug for something that's actually a structural exemption. Full suite green:
75 suites / 1078 tests. `tsc --noEmit` clean.

**`db-agent`'s own integrity-scan run (AC-4) was clean**: `0 corrupt row(s) found across 39
relation(s)` — that part does not need re-running unless the re-review wants to.

**Environment note for whoever re-reviews**: db-agent's own jest invocation couldn't discover
tests from inside this worktree (the checked-in `jest.config.js`'s `testPathIgnorePatterns`
excludes `.claude/worktrees/`, which also matches this worktree's own path — a known, pre-existing
quirk, not something this change caused). The orchestrator's numbers above were produced with an
inline `--config` override that omits that ignore pattern (same trick used throughout this whole
Step 6) — use the same override to reproduce them rather than plain `npm test`.

**db-agent's closing position on the analyzer's residual gap** (does not walk into a to-many's own
nested include): "shipping the gap documented is acceptable... provided extending the analyzer is
recorded as real scheduled work, not a nice-to-have." Carry this into Step 7/8 — it needs an actual
backlog entry, not just a code comment.

## XTI-14, 2nd VETO round — fixes applied, 3rd review pending (commit `3e40867`)

`@db-agent`'s 2nd pass confirmed both repository fixes correct, but VETOed on 2 remaining issues:
- **V1**: the E-6 exemption comment's own correction was itself factually wrong (`roleRef` IS a
  nullable relation field per schema — just never null at runtime; and a valid, analyzer-accepted
  guard shape DOES exist for 8 of 9 E-6 sites, blocked at the 9th (`findUsers`) by a real, narrow
  `checkOrFallback` limitation — OR nested inside AND isn't recognized). Comment rewritten to say
  this accurately: E-6 is scheduled follow-up work, not a clean structural exemption.
- **V2**: `invoice.repository.ts`'s fix had ZERO test coverage (the prior commit's claim otherwise
  was wrong — `reverseIncludeAttachments.test.ts` never touches invoice creation). Added
  `crossTenantRelation.invoiceForeignDrug.test.ts` proving the actual financial-corruption property
  via `POST /api/invoices` (subtotal excludes the foreign drug's price, not just a string check).

Full suite green: 76 suites / 1082 tests. `tsc --noEmit` clean.

**Pattern across all 3 db-agent rounds so far**: round 1 found 2 live leaks the human/orchestrator
missed; round 2 found the round-1 fix's OWN correction comment was itself wrong, plus a test-
coverage gap the round-1 commit message falsely claimed didn't exist. Verify db-agent's claims
independently when reviewing its output (as done each time above) — but also don't assume round 3
will be clean just because rounds 1-2 are now addressed.

## XTI-14, 3rd VETO round — fixes applied, 4th review pending (commit `da1dfcf`)

`@db-agent`'s 3rd pass independently traced the actual code (not just restated claims) and
confirmed the round-2 fixes are substantively correct, but found 2 more defects in those same
changes:
- The new invoice test's `totalPrice` string-absence assertion was **vacuous** — Prisma `Decimal`
  serializes quoted (`"50"`, not `50`), so the check could never fail either way. Fixed.
- The E-6 comment's tally was off by one AND misclassified which site is blocked: **`findUsers` is
  NOT blocked** (a one-line branch-filter restructure fixes it, zero analyzer change) —
  **`createUserWithRoleTx` IS the genuinely blocked one** (a `prisma.create()` has no `where` at
  all to attach a guard to — a different problem than an analyzer limitation). Comment rewritten
  with the correct split: 6 sites mechanically fixable today, 1 needs a restructure, 1 needs a
  different fix shape, plus the login-path product-decision flag on `findUserByTenantUsername`.

**db-agent's backlog grouping (their explicit answer, carry forward verbatim to Step 7/8):**
E-6 = own tracked item (live residual leak, medium severity). Analyzer to-many-nesting gap = own
tracked item (detection blind spot, low severity, different risk class — do NOT merge with E-6).
E-7 = **NOT backlog** — resolved-as-exempt, permanent (verified: both relations keyed on the same
id already filtered by, no other tenant's row reachable under any guard shape).

Full suite green: 76 suites / 1082 tests. `tsc --noEmit` clean.

**Pattern note for whoever runs Step 7/8**: this task has now gone through 3 VETO rounds, each
catching something real that survived the previous "fix." Do not assume a 4th pass will be clean
just because the pattern feels like it should terminate — verify db-agent's next verdict the same
way each prior round was verified (re-read the actual diff, don't just trust the summary).

## XTI-14, 4th pass — APPROVE (commit `4168efb`). Veto closed.

`@db-agent`'s 4th pass independently re-traced both fixes against source (not the restatement) and
**APPROVED**:
- Traced the `"totalPrice":"50"` assertion's whole value path (schema `Decimal(10,2)` → service
  `round2(qty*unitPrice)` → fixture seed price → actual installed `Prisma.Decimal` serialization
  behavior) and confirmed it now discriminates leak-present vs leak-absent — not vacuous.
- Parsed the E-6 registry: exactly 8 entries, tally now correct. Independently re-verified the two
  named sites' actual code (`findUsers`'s branch filter, `createUserWithRoleTx`'s `prisma.create()`
  shape) rather than trusting the comment's restatement — both classifications hold.
- Extra check not on the named list: verified `auth.findUserByTenantUsername` (`findUnique`, not
  `findFirst`) is still guard-safe against the installed Prisma client's generated
  `UserWhereUniqueInput` type (`OR` is legal there) — would have been a 7th blocked site otherwise.
- **One non-blocking nit**: E-6 comment located `updateUser`'s `findFirst` at "line ~105" (actually
  line 78; the disambiguating text was already correct and uniquely identified the site). Fixed in
  commit `4168efb`.

**XTI-14 is now closed.** 4 rounds total: round 1 found 2 live cross-tenant leaks nobody else had
caught; round 2 found the round-1 fix's own correction comment was itself wrong plus a false
test-coverage claim; round 3 found a vacuous assertion and an off-by-one/misclassified exemption
tally; round 4 found only a cosmetic line-pointer nit and approved. Full suite green: 76 suites /
1082 tests. `tsc --noEmit` clean.

**Backlog to carry forward verbatim into Step 7/8** (db-agent's explicit grouping, round 3, reconfirmed
round 4):
- E-6 — live residual leak via `ClinicRole`-nullable-`tenantId` at 8 sites, held shut only by
  write-path guarantees. **Own tracked backlog item, medium severity.**
- Analyzer's to-many-nesting detection gap (doesn't walk into a to-many's own nested `include`).
  **Own SEPARATE tracked backlog item, low severity, different risk class — do NOT merge with E-6.**
- E-7 — **NOT backlog**, resolved-as-exempt permanently (both relations keyed on the same id already
  filtered by).
- XTI-12's perf regression under stale-Postgres-stats bulk-import conditions — needs an operator
  `ANALYZE pets, owners;` step after bulk imports; db-agent agreed this doesn't block.
- XTI-13's unfinished conversion of `crossTenantFkWritePathRepro.test.ts` into a standing
  registry-parity check (QA's agent hit a rate limit before reaching this part).

## Correction — every "full suite green: 75/76 suites" figure above measured ~70% of the suite

`@qa-agent` (Step 7) found that the inline `--config` override used throughout Step 6 excluded the
whole `src/backend/__tests__/` directory (33 suites — `multitenancy-isolation`, `rbac`, `inventory`,
`subscription`, `reports`, `owner-idcard`, etc.), not just the `.claude/worktrees/` path it was meant
to exclude. Every "75/76 suites" number in this file (§ XTI-13 close-out and all three XTI-14 rounds
above) is real but incomplete — those 33 suites were never run against this branch until Step 7.
**Corrected, verified figure: 109 suites / 1454 tests, all green**, confirmed by `@qa-agent` running
all four shards. `tsc --noEmit` clean. Nothing was hidden — all 33 previously-unrun suites pass — but
`@scribe-agent`'s Step 8 red-suite ship gate must baseline on **109/1454**, not 76/1082, or it will
under-measure `main`. A single unsharded run exhausts Postgres connections around suite 47 regardless
of code correctness (F4 below) — shard by 4 with `--runInBand --forceExit`, per Step 7's repro command.

## Step 7 — QA code-review + sign-off: REQUEST CHANGES (docs only), code APPROVED

`@qa-agent` reviewed the full branch diff against `main` (not just XTI-14's files), independently
checked all 51 added/changed tenant-predicate sites against `schema.prisma`'s FK nullability (51/51
correct — bare mirror only on non-nullable FKs, OR-fallback on the 3 genuinely nullable ones), and
confirmed arch §4.1 rev 3 signatures, RBAC/plane-isolation suites, and no-PII-in-integrity-scan all
hold. **Verdict: code is correct, no isolation defect found. Approval withheld pending two doc fixes**,
both applied by the orchestrator in this pass, no re-test needed:

- **F1 (blocking)**: ADR-0027's "Write side" paragraph asserted `crossTenantFkWritePathRepro.test.ts`
  "is converted" into a route-table-walking standing prober — it was not (XTI-13's write-side AC-5 was
  never completed, rate-limited mid-task; the file is unchanged from its original C-1 form). This is
  the exact failure mode `hotfix.md` §5a (this branch's own new rule) forbids — an unverified safety
  claim about code. **Fixed**: ADR-0027 now states this is deferred/backlog, not shipped.
- **F1b (non-blocking, corrected anyway)**: ADR-0027 named the wrong enforcement file
  (`tenantRelationConformance.test.ts`, whose real-models assertion is vacuous by design). Actual
  enforcement is `crossTenantRelation.standingGuards.test.ts`'s `remaining` === `[]` assertion.
  **Fixed**: ADR-0027 now names both correctly.
- **F5 (blocking)**: HANDOFF suite-count correction, see section immediately above.

**2 new backlog items from Step 7** (not blocking, add to the same tracked list as E-6/analyzer-gap):
- **F2, medium**: `appointment.service.ts` calls `findDoctorById`/`shiftWarning` on the global prisma
  client from *inside* `prisma.$transaction` (which holds `pg_advisory_xact_lock`) — each booking now
  needs ≥2 pool connections concurrently and extends time under the advisory lock. Introduced by this
  branch (XTI-11), outside every db-agent round's file scope and outside XTI-12's perf measurement
  (which only covered `searchPets`). Fix: pass `tx` through, or move both reads before the transaction.
- **F4, low, test infra**: the full suite cannot run unsharded — ~2 leaked PG connections/suite exhaust
  `max_connections=100` around suite 47. `jest.config.js` already has a noted TODO to add
  `afterAll(() => prisma.$disconnect())`; apply it. Sharding (4-way) is the workaround until then.
- **F3, informational, not backlog**: `blood-bank.repository.ts:130`'s `listTransfusions` filters
  `recipientPet` by branch with no tenant predicate — no leak (scalars-only select, no `include`, so
  the analyzer is correctly silent), but a corrupt row's foreign pet's `branchId` can affect whether an
  own-tenant row is included. Filter-correctness quirk, noted for awareness only.

QA's backlog-grouping disposition: **E-6, analyzer gap, F2, and F4 are each their own item** — QA
explicitly does not merge F2 or F4 into E-6 or the analyzer gap (different failure classes). E-7 stays
not-backlog. XTI-12 perf and XTI-13's registry-parity conversion carry forward as before, with XTI-13's
now reclassified per F1 (an unmet ADR-0027 decision, not a nice-to-have).

## Next action — literally this

```
@scribe-agent   /anemal-finish-branch (Step 8)
gate: red-suite ship gate baselines on 109 suites / 1454 tests (see correction above), 4-way sharded
  run required (see repro command in Step 7 section) — do not use the old 76/1082 unsharded figure.
carry forward backlog (7 items, do not merge groupings): E-6 (medium) · analyzer to-many-nesting gap
  (low, separate from E-6) · F2 appointment-service pool/advisory-lock overlap (medium, separate) ·
  F4 jest afterAll/$disconnect + sharding (low, test infra) · F3 blood-bank branch-filter quirk
  (informational) · XTI-12 perf (ANALYZE after bulk import) · XTI-13 registry-parity conversion
  (now an unmet ADR-0027 decision, not a nice-to-have).
also: resolve the "Open hotfix debt" follow-up row in .claude/roadmap/index.md for PR #73 — this
  Lane A change is its resolution. Refresh the 5 tracking docs per doc-maintenance.md.
```

### Step 4b — scribe-agent reference pre-check, 3rd pass (2026-09-11) — PASS

Full independent re-scan of `2026-09-11-cross-tenant-relation-isolation-plan.md` (607 lines), not a
spot-check of the 2 previously-named lines:
- Every file path cited (repository/service files under `src/backend/models/` and
  `src/backend/services/`, the 6 pending W0 artefacts correctly framed as "to be created," the 5 cross-
  doc inputs, `.claude/roadmap/index.md`, `.claude/skills/anemal-dev-lanes/references/hotfix.md`)
  resolves on this branch — mechanical dangling-reference scan (SKILL.md §1) returned zero breaks.
- Every cited line number verified against the actual file content: `product.repository.ts:57` and
  `:69` (both ternary branches — the fix the orchestrator applied), `vaccination.repository.ts:25-30`
  (comment), `:31-45` (post-filter block), `:75`/`:88-89`/`:113-114` (raw-SQL joins),
  `appointment.repository.ts:85`, `pet.repository.ts:32`, `prescription.repository.ts:34`,
  `invoice.repository.ts:137`, `:198-221` and `:218` (claimInvoicePaid + the F-4 read-back line),
  `:244`/`:272`/`:282`/`:284` (paymentHistoryWhere + its 3 usage sites), `appointment.service.ts:66,85`,
  `pet.service.ts:53-54`, `blood-bank.service.ts:43`, `product.repository.ts:242/254/266` (the
  reference dialect-3 pattern XTI-8 mirrors) — all exact matches, no further drift found.
  `.claude/roadmap/index.md` and the "35-file" glob count (line 601) were already corrected by the
  orchestrator (commit `2656e8d`) and are confirmed still correct.
- Every cross-doc section reference resolves: arch doc §3.1–§3.3, §4.1–§4.5, §5, §6.1–§6.4, §7, §8.1–
  §8.3, §9, §10, §B all exist as headed sections; BA sign-off §2, §3, §7, §10–§14, §17, §18 all exist;
  ADR-0027 and ADR-0028 exist and their cited concepts (three dialects, Precondition 1) are present;
  `hotfix.md` §5a exists.
- **Extra finding, out of the plan doc's own scope but caught in this pass:** the HANDOFF file itself
  (this file) carried the same wrong fact three more times — `product.repository.ts:57,70` at the old
  lines 66/80/115 — the identical `:70`-should-be-`:69` error the orchestrator already fixed twice in
  the plan doc, just in a third document nobody had re-checked. Fixed in this pass (all three now read
  `:57,69`). This is why the full-file re-scan (vs. spot-checking the 2 named lines) was worth doing.
- **Minor, non-blocking note (not a dangling reference — does not block Step 5):** the plan cites several
  bare filenames (`appointment.service.ts`, `architecture-rules.md`, etc.) without restating their
  directory each time. Each resolves unambiguously to exactly one file repo-wide, and the base
  (`src/backend/{models,services}/`, `.claude/standards/`) is established by CLAUDE.md's T0-loaded
  Project Structure section. Not a break; noted for completeness only.

**Verdict: PASS — no dangling references, no line-number drift, no unresolved cross-doc section
reference. Nothing blocks Step 5.**

---

## Step 3.4 / 3.4b / 3.5 history (completed earlier 2026-09-11, kept for context)

Step 3.4 **COMPLETE — PASSED 3.4b on re-run.** `@ponytail-agent` returned
**FLAG** (not BLOCK) on arch doc rev 2 — independently re-implemented §6.2.1's resolution model as a
real TS AST pass over all 35 `src/backend/models/*.repository.ts` files and verified every claim in
the rework (10/10 call-expr sites exact, 10/10 identifier sites exact, all 5 builders single-return
verified, the `product.repository.ts` and `invoice.repository.ts` live-defect claims both verified,
zero exotic receivers that would fail the detector open). **Two non-blocking items carried to the
Step 3.5 grill agenda** (below) — neither returns this to 3.4.

## Step 3.5 grill — CONCLUDED 2026-09-11, no unresolved findings

Ran interactively with the human (kritsapon), one question at a time per the `grilling` skill method.
Full record: BA doc §18. Four decisions, all now binding:

1. **Full AST resolver confirmed** (not the literals-only + exempt-T1-files alternative).
2. **Production-data remediation is human, per-row** (no auto-delete/reassign) — ADR-0028.
3. **`scripts/tenant-integrity-scan.ts` builds in W0**, as a periodic/manual operator script (not
   real-time per-read — rejected on performance grounds). AC-4 reworded (BA doc §12), C-6 now resolved
   (was conditional, now committed).
4. **New Lane C process gate shipped same day**: `.claude/skills/anemal-dev-lanes/references/hotfix.md`
   §5a — a hotfix may not claim other code is "already safe/guarded" without citing a passing test.
   Directly closes the gap that let PR #73's false comment ship.

Ponytail's 2 FLAG items (§6.2.1 catch-all scope, `product.repository.ts` work-order clarity) were not
put to the human — technical, one-line fixes, folded into `@pm-agent`'s plan instead (see below).

## Step 4 — DONE (see top of file for the current next action)

```
@pm-agent   /superpowers:write-plan   (Step 4)   ✅ COMPLETE 2026-09-11
output: docs/superpowers/plans/2026-09-11-cross-tenant-relation-isolation-plan.md
```

### Fold into the plan — not new grill items, just plan content — ✅ all folded in, see plan §3

- **Ponytail FLAG #1**: §6.2.1's catch-all row must apply only at relation-key/guard positions, not
  every scalar leaf in a `where` (20 scalar accesses like `data.petId` across 8 files would otherwise
  false-positive on day one of W0).
- **Ponytail FLAG #2**: `product.repository.ts:57,69` — both ternary branches fail R-1, not just the
  `: true` one; the work order must say so explicitly so a worker doesn't fix only the obvious half.
- **AC-4 is now in the W0 baseline** (grill decision #3) — `scripts/tenant-integrity-scan.ts` is
  committed work, not conditional on a later BA answer.
- **C-6 is resolved**, remove its "OPEN GATE" status from the conditions table below.

### Ponytail's 2 FLAG items for the grill agenda (verified real, not blocking)

1. **§6.2.1's catch-all row is scoped too broadly as written.** 20 scalar property accesses inside
   `where` clauses across 8 files (`data.petId`, `data.doctorId`, etc.) sit at relation-*irrelevant*
   positions but read literally as violations under the catch-all rule, which would pollute W0's
   printed violation list on day one. Fix is one sentence: unresolvability applies at relation-key and
   guard positions, not every scalar leaf.
2. **§6.2.1(e) / §B W1d understates the `product.repository.ts` defect.** Both ternary branches at
   `:57,69` fail R-1, not just the `: true` branch — the "guarded" branch (`{ where: { branchId } }`)
   has no `tenantId` either. The analyzer catches both, but the work-order narrative should say so
   explicitly or a worker may fix only the obvious half.

Minor: conditional-spread census is 59 occurrences on this branch, not 57 as the doc states (file
count of 17 is exact). Not worth a grill slot on its own.

### What the rework changed (rev 2) — the 5 fixes, one line each

1. **Resolution model published** — new **§6.2.1**, one ruling per shape: same-module call expression
   and identifier **resolve**; cross-module identifier resolves **only within `models/*.repository.ts`**
   (the analyzer's own glob); conditional spread is **additive-only**, so it is not an obstacle;
   conditional value has **both branches checked**; mutable accumulator (`where['k']=v`) and any import
   from outside the set **fail closed**. Analyzer re-costed **~200 → ~350 lines** (same file, same
   single export, same signature, still zero new dependencies).
2. **Path (ii) chosen and stated** — bounded resolution. (i) narrow+exempt-the-builder-repos rejected
   (it would exempt the T1 files holding the defect); (iii) inline-the-builders rejected (it would
   change working code to suit the checker and contradict §4.2). **§3.3 rewritten**: the `relGuard()`
   rejection's "it would hide the guard from the scanner" reason is **explicitly withdrawn** as now
   false, and re-argued on three surviving grounds.
3. **R-4 narrowed** to *`findX` and `countX` each carry the tenant predicate in their own root `where`*
   — no shared-expression requirement. The forced `medical-record` builder refactor is **cancelled**
   (verified: both functions already carry `tenantId` independently).
4. **`select`/`include` value ruling** — by relation arity: **to-one passes on the literal key alone**
   (the guard is in the root `where`, so the value is never read → §4.2's 5 T1 sites are safe by
   design), **to-many fails closed** (the guard is inside the value). Plus a frozen constraint: the two
   `*SummarySelect` consts must stay inside `models/` and stay scalar-only.
5. **`scripts/tenant-integrity-scan.ts` marked CONDITIONAL**, not committed — built only if `@ba-agent`
   accepts the AC-4 rewording (§7). ADR-0028's Precondition 1 reworded to depend on *a scan report
   existing*, not on this change authoring the scanner, so the Option A deferral holds either way.

### Three facts verified on the branch during rework (each changed a decision)

- All five builder functions (`pet`/`owner`/`audit`/`invoice`/`product`) end in a **single
  `return <object literal>`** — so the bounded resolver covers **10 of 10** call-expression sites.
- **`BranchInventory` is tenant-scoped**, and `product.repository.ts:57,69` writes
  `branchInventory: cond ? { where: { branchId } } : true` — the `: true` branch is a **live unguarded
  to-many include** that a literals-only analyzer would never have seen. Added to W1d.
- `invoice.paymentHistoryWhere` (:244) is a **mutable accumulator** on tenant-scoped `PaymentHistory`
  with 3 to-one traversals → fails closed → **mechanical rewrite scheduled into W1a** (not exempted).

---

### The original BLOCK report — HISTORICAL, all 5 items now addressed in rev 2

*Kept so the re-review can check the fixes against the original objection. Do not re-action this list;
it is the input to a rework that is already done.*

**BLOCK reason (criterion #1 — over-engineering: analyzer contract contradicts the code it must read):**
The conformance-test analyzer (arch doc §6.2/§6.4) defines "guarded" only over a literal `where`/
`include` on the Prisma call itself. Three shapes it cannot resolve already exist live in 17 of 35
model files — `where`/`include` behind a call expression (`pet`, `owner`, `invoice`, `audit`,
`product`), behind an identifier (`pet.listInclude`, platform-customers ×6), and conditional spreads
(57 occurrences / 17 files). Worse: **R-4 mandates the exact call-expression shape the analyzer can't
resolve**, landing directly on the flagship T1 cases (`pet.findPets`, `pet.findPetById`) — the files
holding the PII defect the mechanism exists to catch would be exempt from it.

**5 required fixes (arch owns all 5, do not exceed this list):**
1. State the analyzer's resolution model explicitly for all 4 shapes (same-module call expr,
   same-module identifier, cross-module identifier, conditional spread) — resolved or fail-closed,
   per shape. Re-cost the "~200 lines" estimate against this.
2. Pick and state one of: (i) narrow the analyzer + explicitly exempt builder-based repos, (ii) specify
   resolution (then re-argue §3.3's helper rejection — same machinery would read `relGuard()`), or
   (iii) mandate literal `where`/`include` at guarded sites + say which builders get inlined.
3. Narrow R-4 to the checkable property actually needed: *`findX`/`countX` each carry the tenant
   predicate* — not a shared `where` expression (that's the construct breaking resolution).
4. Rule explicitly whether an unresolvable `select` value fails closed (affects §4.2's
   `ownerSummarySelect`/`petSummarySelect` cross-module consts at 5 T1 sites).
5. Mark the `scripts/tenant-integrity-scan.ts` build as conditional on BA accepting the AC-4 reword
   (§7), not decided — its only other customer is ADR-0028's deferred precondition.

**Explicitly NOT objected to — do not touch in rework:** the core rule (one rule, three spellings),
post-filter retirement, zero new dependencies, refusal to build a `relGuard()` helper, the 20-file
scope (defect width, not scope creep). Ponytail said it only needs to re-review §5/§6.2/§6.4 and the
ADR-0027 enforcement paragraph — not the whole doc.

**Rework is done.** Remaining order: re-run `@ponytail-agent` arch-precheck → `/grill-with-docs`
(Step 3.5, human + `@ba-agent`, MANDATORY) → `@pm-agent` `/write-plan` (Step 4) → `@scribe-agent`
reference pre-check (4b) → `@ponytail-agent` mode `gate` (Step 5) → `/superpowers:execute-plan` (Step 6).

---

## What this is

Lane A follow-up to the 2026-09-10 Lane C hotfix (PR #73, merged), which fixed a cross-tenant PII leak
in `findDueSoon`. Root cause is structural: **no FK in the schema references `tenantId`**, so the
database permits a child row in tenant A pointing at a parent row in tenant B, and any query that
follows that relation returns the other tenant's data. QA proved it leaks in **both** directions.

## Documents produced, in reading order

1. `docs/superpowers/plans/2026-09-10-cross-tenant-relation-isolation-ba-signoff.md` — BA sign-off
   (**corrected 2026-09-11** in §4.3 / §9 E-2 / new §17; read the corrected version).
2. `docs/superpowers/plans/2026-09-11-cross-tenant-relation-isolation-arch.md` — **arch brief
   (Step 3.4)**. Start at §0; it is written to be read first.
3. `docs/adr/0027-tenant-scoped-relation-traversal-carries-its-own-predicate.md` — the rule.
4. `docs/adr/0028-composite-tenant-foreign-keys-deferred.md` — the Option A ruling (answers B-4 from
   2026-08-27 for the third and final time).
5. `src/backend/tests/integration/crossTenantFkWritePathRepro.test.ts` — QA's C-1 reproduction
   (verdict MISS) and the `SIDE-FINDING` test that disproved the "reverse includes are safe" premise.

## Architecture decision in three lines

**Option D as BA defined it: Option C built now, Option A ruled on and deferred, Option B (RLS) out.**
One rule — *a tenant-scoped relation is only followed, or written, with a tenant predicate attached at
the point of traversal* — in three dialects (Prisma to-one via the root `where`, Prisma to-many via the
nested `where`, raw SQL via the `ON` clause). Enforced by a conformance test in the backend Jest suite,
because the repository has **no CI** and `npm run lint` is gated by nothing, while the test suite is
gated three times. Zero new abstractions; the post-filter pattern from PR #73 is **deleted**.

## Gate conditions — where each one stands

| Condition | Owner | Status |
|---|---|---|
| C-1 write-path reproduction | @qa-agent | ✅ MISS (2026-09-11), 38 probes, 0 HIT |
| C-7 human scope approval | human | ✅ approved (2026-09-11) |
| C-3 Option A preconditions (a)(b)(c)(d) | @arch-agent | ✅ answered — arch §A.3, ADR-0028 |
| C-4 E-7 pagination consistency | @arch-agent | ✅ resolved by construction — arch §5 |
| C-5 XTI-7 enforcement named + shown failing | @arch-agent | ✅ answered — arch §6, fixtures §6.3 |
| C-6 integrity-signal RBAC exposure | @arch-agent → @ba-agent | ✅ **RESOLVED at grill 2026-09-11.** Log/operator-script only, no permission code. Human accepted the AC-4 reword — `tenant-integrity-scan.ts` is now committed to the W0 baseline. |
| C-2 false comment + roadmap record | @dev-agent + @scribe-agent | ⏳ scheduled into W0 of the plan |
| Step 3.5 `/grill-with-docs` | human + @ba-agent | ✅ **CONCLUDED 2026-09-11** — 4 human decisions, no unresolved findings. BA doc §18. |

## Things the next agent must not get wrong

- **Scope is 20 model files, not 11.** BA's audit was forward-only; reverse includes add the rest
  (57 `include:` occurrences + 19 raw-SQL `JOIN`s across 7 files — some already guarded, some
  targeting models with no tenant). The *mechanism* does not grow — it covers both directions in one
  pass — but @pm-agent must plan against 20, and should size W1 from **W0's printed defect list**
  rather than from that estimate.
- **Lead with "one rule, N sites", not "N fixes."** Arch §0 exists for the ponytail gate; do not
  re-frame it as a file-by-file sweep (BA Risk #1).
- **W0 is serial.** The conformance test defines what "guarded" means. Four workers guessing at the
  spelling before the checker exists is how eleven inconsistent guards were written the first time.
- **Do not reintroduce the post-filter.** It breaks `take`/`count` and is being deleted, not extended.
- **Do not design around RLS** (BA §8 Option B is closed) and do not narrow T3/T4 (BA §5 ruled the
  invariant uniform).
- Searches must exclude `.claude/worktrees/` and `*/archive/*` — stale copies (BA Risk #8).

## Open items that leave this pipeline

- **Escalation for the human at Step 3.5:** if `db:integrity-scan` finds cross-tenant rows in
  production, who reassigns them, and is that inside this change? Arch's position: **outside** — it is
  per-row clinical judgement (arch §A.3a).
- **Back to @ba-agent (now a GATE, not a note):** AC-4 needs rewording from "a signal is emitted when
  the read executes" to an assertion about `npm run db:integrity-scan` (arch §7). **If BA accepts, the
  script is built in W0; if BA declines, it is not built by this change** and XTI-INV-b returns to BA as
  an open requirement. @pm-agent must carry this answer into Step 4 as a precondition on W0's scope.
  Nothing else returns to BA.
- **New backlog:** B-6 (five repositories open their own transaction, deviating from
  `architecture-rules.md` §5 — Lane D + ADR) · B-7 (R3-F1 promoted to a precondition of Option A).
  BA's B-5 (no response-shaping layer) is acknowledged and deliberately **not** absorbed.

## No PENDING-DECISION file exists for this

Every open decision is listed above with its owner. The two that need a human are the Step 3.5 grill
itself and the production-data question, and both are stated here rather than duplicated elsewhere.
