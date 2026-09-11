# Implementation Plan — Cross-Tenant Relation Isolation (Lane A, Step 4)

**Feature slug:** `cross-tenant-relation-isolation`
**Author:** @pm-agent
**Date:** 2026-09-11 (dating convention: same date as the arch doc it plans from, since Steps 3.4–4
completed same day)
**Precedes:** @scribe-agent reference pre-check (Step 4b) → @ponytail-agent mode `gate` (Step 5) →
`/superpowers:execute-plan` (Step 6)
**Inputs read, in order:**
1. `docs/superpowers/plans/2026-09-10-cross-tenant-relation-isolation-ba-signoff.md` (corrected
   2026-09-11, incl. §17 QA addendum and §18 grill record — 4 binding human decisions)
2. `docs/superpowers/plans/2026-09-11-cross-tenant-relation-isolation-arch.md` (rev 2, **PASSED**
   ponytail `arch-precheck`, verdict FLAG — 2 minor items folded in below, not re-litigated)
3. `docs/adr/0027-tenant-scoped-relation-traversal-carries-its-own-predicate.md`
4. `docs/adr/0028-composite-tenant-foreign-keys-deferred.md`
5. `docs/superpowers/plans/HANDOFF-cross-tenant-relation-isolation.md`
6. `.claude/skills/anemal-dev-lanes/references/hotfix.md` §5a (context only — not build content)

**Skills applied:** `anemal-functional-reqs`, `anemal-ba-toolkit`, `anemal-rbac-matrix` (role keys)

---

## 0. Read this first — what this plan is planning

**This is one mechanism (ADR-0027), applied at N call sites. It is not N fixes.** Do not let the wave
table below read as a file-by-file sweep — that framing is exactly what ponytail's gate (Step 5)
tests for (BA Risk #1, arch §10 risk 6). One rule — *a tenant-scoped relation is only followed, or
written, with a tenant predicate attached at the point of traversal* — in three dialects (Prisma
to-one via root `where`, Prisma to-many via nested `where`, raw SQL via `ON` clause). New
abstractions: zero. New runtime indirection: zero. New artefacts: the conformance-test analyzer, an
exemption registry, an operator script, and two test files (one new, one converted).

**Scope is 20 model files, not 11.** BA's original audit was forward-only (child→parent). QA proved
the reverse direction (parent→children) leaks too, with the opposite victim. The candidate surface is
57 `include:` occurrences plus 19 raw-SQL `JOIN`s across `src/backend/models/*.repository.ts`. **Not
all of these are defects** — some already carry a guard (`product.repository.ts`'s raw SQL), some
target non-tenant-scoped models (`Tenant`, `Plan`, `Permission`) where no predicate applies.

**This plan does not invent a fixed defect count, and neither should any worker.** Per the HANDOFF,
the arch doc, and ponytail's re-check independently: **W0's analyzer, once built, prints the exact
current violation list for `models/*.repository.ts`. That printout is W1's real work order.** The
wave/worker **file assignments** below are frozen — they come from arch §B's already-decided,
already-ponytail-reviewed partition, sized at file granularity, which is stable because it assigns
*which repository each worker owns*, not *how many violations exist in it*. What is **not** frozen is
the violation count inside each file; a worker fixes everything the analyzer reports in their files,
not a number estimated today.

---

## 1. Scope confirmation (carried from BA §2, unchanged)

**In scope:** every repository read/write touching a tenant-scoped relation via Prisma `include` /
nested `select` / raw-SQL `JOIN`, in both directions (forward and reverse); the write-side FK-check
relocation (XTI-5); the mechanical enforcement point (XTI-7); the operator integrity scan (XTI-INV-b,
AC-4); correcting the false safety comment and its roadmap record (C-2).

**Out of scope (confirmed, do not build):** Postgres RLS (Option B, ADR closed) · composite tenant
FKs (Option A, deferred per ADR-0028 — recorded, not implemented, this change) · `branchId`-level
relation isolation (BA backlog B-2) · `onDelete` FK drift (backlog R3-F1, now a *precondition* of a
future Option A per ADR-0028, not absorbed here) · the platform plane's own data model (exempted by
name, not by accident, per E-5).

**Human approval (C-7):** ✅ resolved 2026-09-11 — kritsapon approved proceeding via hotfix-debt
escalation, no separate `/superpowers:brainstorm` required.

---

## 2. Acceptance criteria baseline (BA §12, AC-4 as reworded 2026-09-11 at the grill)

Carried forward without dilution — every AC below is falsifiable against **pre-fix** code, per the
G-5 standard. @qa-agent owns execution at Step 7; this is the contract each wave is built to satisfy.

```
AC-1  No field from a cross-tenant related row (reached via forward OR reverse traversal, in any of
      the 20 files) appears in a response to a same-permission, different-tenant request.
AC-2  A single-resource read whose related row fails the tenant check returns 404 — never 403, never
      a partial row, never a response naming another tenant.
AC-3  A LIST read with some cross-tenant rows: the corrupt row is absent, the request succeeds, and
      the reported total matches the rows actually returned across the full pagination range. [E-7]
AC-4  Given `npm run db:integrity-scan` is run (operator-invoked, not per-request), when it scans the
      affected tables, then every corrupt row is reported by tenant, table and row id, with no PII
      field value. [XTI-INV-b — REWORDED at the grill; script is COMMITTED to W0, not conditional]
AC-5  A NEW repository read added with an unguarded forward-FK or reverse-FK traversal fails the
      conformance-test enforcement point. Demonstrated by 6 fixtures (2 guarded, 2 unguarded, 1
      proving the resolver resolves, 1 proving it fails closed). [XTI-7, load-bearing]
AC-6  `reminder.repository.ts` `listAllDue()` still returns pending reminders across all tenants;
      each write stays pinned to the reminder's own tenantId. [E-1, no regression]
AC-7  A retail invoice with `petId = NULL` still returns `pet: null` and 200 — not treated as a failed
      check. [E-4]
AC-8  The five former `owner: true` endpoints return no `idCardNumber`, `address`, `idCardType`, or
      `lineId` for ANY owner, including the requester's own tenant. [XTI-1, over-fetch reduction]
AC-9  Full backend suite green on this branch; no pre-existing test deleted without a recorded
      deleted-coverage justification. [ship gate]
AC-10 `vaccination.repository.ts` contains no comment asserting `findDueSoonWorklist` is
      tenant-guarded unless it is. [F-1 / C-2]
```

**No AC is dropped.** AC-4's rewording is the only change from BA's original draft, and it was
accepted by the human at the grill (BA §18, decision #3) — it moves the assertion from an
impossible-by-design read-time signal (the design filters in Postgres; the app never sees the corrupt
row) to the operator scan the design actually produces.

---

## 3. Folded-in content (per HANDOFF's "fold into the plan" list — not new grill items)

### 3.1 Ponytail FLAG #1 — catch-all scope, narrowed for W0's worker

§6.2.1's "unresolvable → fail closed" rule applies **only at relation-key and guard positions** —
i.e. an object key naming a to-one/to-many relation to a tenant-scoped model, and the `where`/`ON`
predicate that must accompany it. It does **not** apply to every scalar property access inside a
`where` clause. Concretely: `data.petId`, `data.doctorId`, and ~18 similar scalar reads across 8
files are filter/lookup values, not relation traversals, and must **not** register as violations.

**Binding instruction for XTI-1 (W0, the analyzer build):** the rule table (R-1…R-5) is evaluated
**per relation field on an `include`/`select` object and per `JOIN` clause** — never per arbitrary
identifier or scalar expression inside a `where`. Before W0 is marked done, the worker must show the
analyzer's first run against current `models/` produces **zero false positives on scalar-only
`where` clauses** (spot-checked against the ~20 known scalar sites) — this is a condition of XTI-1's
exit criterion, not a separate task.

### 3.2 Ponytail FLAG #2 — `product.repository.ts:57,69` both branches, stated explicitly for W1d

`branchInventory: branchId != null ? { where: { branchId } } : true` at both lines. **Both ternary
branches fail R-1** — not only the `: true` branch. `BranchInventory` is tenant-scoped; `{ where:
{ branchId } }` filters by branch, not by tenant, so it carries **no `tenantId`** either. **The W1d
worker must guard both branches**, not patch the obviously-unguarded one and leave the other reading
as already correct. This is stated directly in the W1d task below (§5, XTI-10) so it is not missed.

### 3.3 AC-4 / `scripts/tenant-integrity-scan.ts` — now committed, not conditional

Grill decision #3 (BA §18) resolved arch's open gate: the script builds in W0, as a periodic/manual
operator script (real-time per-read was rejected on performance grounds). This plan places it in W0
(§5, XTI-6) as committed work. C-6 is fully resolved — no further BA round-trip.

---

## 4. Wave shape (confirmed from arch §B, adjusted only where noted)

```
W0  (SERIAL — nothing else starts)   The analyzer defines "guarded." Building it in parallel with
                                      sites that need guarding means four workers guess at the
                                      spelling before the checker exists — precisely how eleven
                                      inconsistent guards were written the first time (arch §B).
     ↓ integration checkpoint: analyzer runs clean, prints the current violation list
W1  (PARALLEL — 4 dev workers, disjoint files)   W1a/b/c/d apply the guard across the printed list.
     ↓ integration checkpoint: analyzer reports 0 violations in every W1 file; full suite green
W2  (PARALLEL — dev + qa + db)   Write-side atomicity, behavioural proof, NFR measurement, DB veto.
```

**Step 6 parallelism (W1 running 4 workers at once) is legal per CLAUDE.md's rule: `@arch-agent`
froze the contract at 3.4** — repository signatures (§4.1), response-shape constants (§4.2), HTTP
behaviour (§4.3), and the rule table (§6.2) are all frozen and unchanged since ponytail's re-check
passed. **W0 itself is NOT parallelizable** — it is the one wave every later wave depends on.

---

## 5. Task breakdown

Actor/role and Device are stated per PM format even though this is an internal defect-class fix, not
a new user-facing feature: the "actor" is whichever clinic role can reach the affected route today
(per BA §7's permission table), and every fix is server-side, so it is **Both** (Tablet + Web) by
construction — no client differs.

```
Task ID: XTI-1   Actor/role: N/A (infrastructure — read by clinic_admin/doctor/clinic_staff via
                 every affected route)   Device: Both
Wave: W0   Owner: Dev A (serial)
Description: Build src/backend/tests/unit/tenantRelationConformance.test.ts — the conformance-test
  analyzer per arch §6.2/§6.2.1: derive the relation map from Prisma.dmmf, parse
  src/backend/models/*.repository.ts with the TS compiler API, implement the bounded resolver
  (same-module call expression ending in single terminal `return <object literal>`, same-module
  identifier, cross-module identifier within models/ only, additive conditional spread, both branches
  of a conditional value checked independently, mutable accumulator fails closed), and rules R-1…R-5.
  Add the 6 fixture files under tests/fixtures/tenant-conformance/ (§6.3): unguarded-forward,
  unguarded-reverse, guarded-forward, guarded-reverse, guarded-via-builder, unresolvable-accumulator.
Acceptance Criteria:
  - [ ] All 6 fixtures assert exactly as specified in arch §6.3 (2 guarded → 0 violations, 2
        unguarded → exactly 1 violation each on the correct rule, guarded-via-builder → 0 violations
        proving resolution works, unresolvable-accumulator → exactly 2 violations proving fail-closed)
  - [ ] §3.1 above: zero false positives against the ~20 known scalar-only `where` sites
        (data.petId, data.doctorId, etc.) on the first real run against current models/
  - [ ] Analyzer is one file, one exported function `(sourceFiles, relationMap) => Violation[]`, zero
        new npm dependencies (TS compiler API + Prisma.dmmf only)
  - [ ] First run against current models/ prints a complete violation list with file:line, rule,
        relation path — this list becomes W1's work order
Permission(s): None (test/tooling code, no route change)
Dependencies: None (first task)
Contract referenced: arch §6.2, §6.2.1, §6.3; ADR-0027 enforcement paragraph

---

Task ID: XTI-2   Actor/role: N/A   Device: Both
Wave: W0   Owner: Dev A (serial)
Description: Build src/backend/config/tenant-relation-exemptions.ts (arch §4.5) with the
  TenantRelationExemption interface (file, fn, relationPath, reason — all required, non-empty) and
  seed the single known exemption: reminder.repository.ts listAllDue (E-1, background dispatcher,
  system-context scan, each write pinned to the reminder's own tenantId, covered by AC-6).
Acceptance Criteria:
  - [ ] File sits in config/, not models/ — outside the analyzer's own glob (per arch §4.5 comment)
  - [ ] An entry with an empty reason fails the analyzer's own registry-hygiene check (R-5)
  - [ ] An entry that no longer matches a real violation fails the check (stale-exemption guard)
  - [ ] The E-1 entry is present and the analyzer treats listAllDue's pet traversal as exempted, not
        as a violation
Permission(s): None
Dependencies: XTI-1 (registry is read by the analyzer built there)
Contract referenced: arch §4.5

---

Task ID: XTI-3   Actor/role: crm.view roles (clinic_admin, doctor, clinic_staff — all V)   Device: Both
Wave: W0   Owner: Dev A (serial)
Description: Declare the two frozen response-shape constants inside the repository that owns each
  model (arch §4.2) — `ownerSummarySelect` in owner.repository.ts, `petSummarySelect` in
  pet.repository.ts. Both scalar-only ({id, firstName, lastName, phone} and {id, name, species,
  photoUrl} respectively), both `as const`. Do not create a shared `_select.ts` file — that would
  break the models/ = *.repository.ts convention and fall outside the analyzer's resolvable set.
Acceptance Criteria:
  - [ ] Both consts declared exactly inside the two named *.repository.ts files, nowhere else
  - [ ] Both consts are scalar-only — no relation key present or added later (frozen constraint, per
        arch §4.2 — a relation key here would turn all 5 T1 W1a sites into fail-closed violations)
  - [ ] Analyzer (XTI-1) resolves both as shape (b)/(c) identifiers with zero violations
Permission(s): None
Dependencies: XTI-1
Contract referenced: arch §4.2 (FROZEN CONSTRAINT)

---

Task ID: XTI-4   Actor/role: emr.view roles (clinic_admin, doctor, clinic_staff — all V)   Device: Both
Wave: W0   Owner: Dev A (serial)
Description: Correct the false comment at vaccination.repository.ts:25-30, which currently asserts
  findDueSoonWorklist has "explicit tenantId join guards" — it does not (BA F-1). Replace with an
  accurate statement, or remove it once XTI-8 (W1b) makes it true. Do not leave a comment asserting
  a property the code does not yet have.
Acceptance Criteria:
  - [ ] AC-10: no comment in the file asserts findDueSoonWorklist is tenant-guarded unless it is,
        checked at every point in the branch history from this commit forward
Permission(s): None
Dependencies: None (can run alongside XTI-1, same file scope reserved to Dev A this wave)
Contract referenced: BA §3 F-1; hotfix.md §5a (the process rule this finding produced)

---

Task ID: XTI-5   Actor/role: N/A (documentation)   Device: Both
Wave: W0   Owner: @scribe-agent
Description: The false "explicit tenantId join guards" claim lives in vaccination.repository.ts's
  code comment and the PR #73 commit message (1add331) — NOT in .claude/roadmap/index.md's PR #73 row,
  which was checked and does not repeat it. So this task is not "remove a claim" but "add the
  correction record": append a note to the PR #73 row (or the Open hotfix debt row it links to) stating
  that findDueSoonWorklist was in fact unguarded at merge time, the claim in the code comment/commit
  message was false, and this change (XTI-4) fixes both the code and the comment. Do this in the same
  change/branch that fixes the code — not deferred.
Acceptance Criteria:
  - [ ] The PR #73 row (or its linked Open hotfix debt row) in .claude/roadmap/index.md documents that
        findDueSoonWorklist's "already guarded" claim was false and has now been fixed by this change
  - [ ] The correction is in the same change/branch that fixes the code (XTI-4, XTI-8) — not deferred
Permission(s): None
Dependencies: None
Contract referenced: BA §13 C-2; BA §11 ("in W0 of this change, not a separate branch")

---

Task ID: XTI-6   Actor/role: platform_super_admin / operator (script run manually, no route)   Device: Both
Wave: W0   Owner: Dev A (serial) — @db-agent reviews at W2 (XTI-14), does not co-own the file this wave
Description: Build src/backend/scripts/tenant-integrity-scan.ts (arch §7, grill decision #3 —
  COMMITTED, not conditional). One SELECT per tenant-scoped forward relation, derived from the same
  Prisma.dmmf relation map as XTI-1's analyzer: report every child row whose tenantId differs from
  its parent's, by table + row id + both tenant ids. Select ids only — never a PII column. Exposed as
  `npm run db:integrity-scan`.
Acceptance Criteria:
  - [ ] AC-4: running the script against a DB containing a known-corrupt fixture row reports it by
        table/id/tenant pair, and the output contains no PII field value (structural — the query
        never selects one)
  - [ ] Script is read-only — it reports, it does not remediate (grill decision #2: production-data
        remediation is human, per-row, case-by-case — no auto-delete/reassign/quarantine anywhere in
        this script)
  - [ ] Relation list is derived from Prisma.dmmf, not hand-maintained
Permission(s): None (operator CLI, not an HTTP route — no permission code needed)
Dependencies: None (uses the same DMMF-derivation approach as XTI-1, but is a separate artefact)
Contract referenced: arch §7; ADR-0028 Precondition 1; BA §18 grill decision #3

---

Task ID: XTI-7   Actor/role: appointments.view / crm.view / prescriptions.view / billing.view /
                 billing.payment — all V for clinic_admin/doctor/clinic_staff except billing.payment
                 (E for clinic_admin/clinic_staff, not doctor)   Device: Both
Wave: W1a   Owner: Dev A
Files (exclusive): pet.repository.ts, appointment.repository.ts, invoice.repository.ts,
  prescription.repository.ts
Description: Fix the 5 T1 `owner: true` sites (BA F-2, highest severity — full Owner row incl.
  idCardNumber/address) using ADR-0027 dialect 1: predicate in the root `where`, `owner: {
  select: ownerSummarySelect }` in the include. Sites: appointment.repository.ts:85 (findById),
  pet.repository.ts:32 (findPetById), prescription.repository.ts:34 (findPrescriptionWithDetails,
  2-level — mirror the include path in the where per arch §3.1's two-level example),
  invoice.repository.ts:137 (findInvoiceById), invoice.repository.ts:218 (claimInvoicePaid — this
  site ALSO gets the F-4 fix below in the same pass). Also fix any other violation the XTI-1 analyzer
  prints against these 4 files (forward or reverse), not only the 5 named ones.
  F-4 (BA §3): invoice.repository.ts:198-221 claimInvoicePaid claims with {id, tenantId, branchId?}
  but reads back with only {id, tenantId} — branchId dropped at L218. Widen the read-back scope to
  match the claim scope.
  Mechanical rewrite: invoice.paymentHistoryWhere (:244, shape (f) mutable accumulator, used at
  :272/:282/:284) is rewritten from `where['k'] = v` assignment into the conditional-spread object
  literal already idiomatic elsewhere in this codebase — no behaviour change, done so the analyzer
  can resolve it instead of failing it closed.
Acceptance Criteria:
  - [ ] AC-1, AC-2, AC-8 pass for all 5 T1 sites (see XTI-13 for the behavioural test that proves it)
  - [ ] AC-3 holds for any of these that are LIST reads (pagination/count stay consistent — no
        post-filter reintroduced)
  - [ ] F-4: claimInvoicePaid's read-back scope matches its claim scope
  - [ ] paymentHistoryWhere resolves under XTI-1's analyzer (shape (a)/(d), not (f)) with identical
        runtime behaviour to before the rewrite
  - [ ] XTI-1's analyzer reports 0 violations in these 4 files
Permission(s): appointments.view, crm.view, prescriptions.view, billing.view, billing.payment
  (no codes added or changed — existing routes, existing permissions, narrower response only)
Dependencies: XTI-1, XTI-2, XTI-3 (needs the analyzer, exemption registry, and summary-select consts
  to exist first — but XTI-7 does not touch those files)
Contract referenced: ADR-0027 dialect 1 & 2-level example; §4.2 (ownerSummarySelect), §3.3 (why
  paymentHistoryWhere is rewritten, not wrapped). arch §4.1 (the client? param) is XTI-11's task, not
  this one — XTI-7 does the tenant-predicate fix only; do not add the client? param here.

---

Task ID: XTI-8   Actor/role: emr.view (clinic_admin/doctor/clinic_staff — all V)   Device: Both
Wave: W1b   Owner: Dev B
Files (exclusive): vaccination.repository.ts
Description: Fix findDueSoonWorklist's two unguarded raw-SQL join pairs (L75; L88-89/L113-114) per
  ADR-0027 dialect 3 — add `AND p."tenantId" = ${tenantId}` / `AND o."tenantId" = ${tenantId}` to
  every JOIN ON clause, mirroring product.repository.ts:242/254/266's existing correct pattern.
  Delete the findDueSoon post-filter block (L31-45, PR #73's `.filter()`/`.map()`) entirely and
  rewrite findDueSoon to ADR-0027 dialect 1 (predicate in root where) — this is a retirement, not an
  extension; do not leave both patterns in the file.
Acceptance Criteria:
  - [ ] AC-1 passes for findDueSoonWorklist (both branch-scoped and branchless variants)
  - [ ] AC-10 (already satisfied by XTI-4's comment fix, re-verified true now that the code matches)
  - [ ] The `(p."branchId" = ${branchId} OR p."branchId" IS NULL)` branch-null leak (BA §3 F-1,
        aggravating detail 1) is closed by the same tenantId predicate — a NULL-branch pet from
        another tenant no longer surfaces in any branch's worklist
  - [ ] No `.filter()`/`.map()` post-processing remains in the file for tenant isolation purposes
  - [ ] vaccination-worklist.test.ts (existing) stays green
  - [ ] XTI-1's analyzer reports 0 violations in this file
Permission(s): emr.view (unchanged)
Dependencies: XTI-1, XTI-2
Contract referenced: ADR-0027 dialect 3; arch §3.2 (post-filter retirement, reasons 1-4)

---

Task ID: XTI-9   Actor/role: crm.view / emr.view / inpatient.view (all V for all 3 clinic roles)
                 Device: Both
Wave: W1c   Owner: Dev C
Files (exclusive): search.repository.ts, medical-record.repository.ts, hospitalization.repository.ts,
  owner.repository.ts
Description: Fix the 4 T2 sites (BA XTI-3: findPets-adjacent search, findById owner contact fields,
  hospitalization petSelect) plus owner.repository.ts's reverse includes (owner→pets and similar,
  exposed by QA's C-1 side-finding, BA §17) using ADR-0027 dialects 1 and 2 as appropriate.
  R-4 (narrowed, arch §5): medical-record.repository.ts's findByPet/countByPet each independently
  gain the relation predicate in their own root `where` — they already each carry `tenantId`
  independently. Do NOT refactor them into a shared builder function; that restructuring was the
  first arch draft's mistake (rejected on rework, no isolation payoff, and it was mandating a shape
  its own analyzer couldn't read).
Acceptance Criteria:
  - [ ] AC-1 passes for all sites in these 4 files, forward and reverse
  - [ ] AC-3 holds for any LIST read touched (in particular, count/take parity for any paginated read
        in these files — this is where R-4 narrowed matters)
  - [ ] findByPet/countByPet remain two literal where clauses (no builder introduced), each verified
        to carry tenantId + the new relation predicate independently
  - [ ] XTI-1's analyzer reports 0 violations in these 4 files
Permission(s): crm.view, emr.view, inpatient.view (unchanged)
Dependencies: XTI-1, XTI-2, XTI-3
Contract referenced: arch §5 (R-4 narrowed); ADR-0027 dialects 1 & 2

---

Task ID: XTI-10   Actor/role: various T3/T4 routes (pet identity, staff name, drug name — all V for
                  all 3 clinic roles per their module; platform-plane entries are platform_super_admin
                  only)   Device: Both
Wave: W1d   Owner: Dev D
Files (exclusive): reminder.repository.ts, blood-bank.repository.ts, grooming.repository.ts,
  transfer.repository.ts, product.repository.ts, user.repository.ts, role.repository.ts,
  auth.repository.ts, usage.repository.ts, report.repository.ts, tenant-settings.repository.ts,
  AND (entries only, not structural edits) config/tenant-relation-exemptions.ts for platform-plane
  exemptions (E-5) — this file transfers exclusive ownership from Dev A (W0) to Dev D for this one
  wave; no other W1 worker touches it
Description: Fix the T3/T4 sites (BA XTI-4: pet identity, staff names via bare User FK, drug/product
  names via bare InventoryItem FK) across these 11 files, plus **both** ternary branches at
  product.repository.ts:57 and :69 (§3.2 above — `BranchInventory` is tenant-scoped; the `: true`
  branch is a live unguarded to-many include exactly as much as the visibly-unguarded one looks; fix
  both, do not stop at the obvious one). Add exemption entries (E-5) to
  config/tenant-relation-exemptions.ts for platform-plane repositories where a traversal genuinely has
  no tenant to check (platform-audit.listPlatformAuditLogs and similar — verify PlatformAuditLog etc.
  actually have no tenantId before exempting; an exemption must be a real exemption, not a shortcut
  past a real violation).
Acceptance Criteria:
  - [ ] AC-1 passes for all sites across these 11 files
  - [ ] product.repository.ts:57 AND :69: both ternary branches guarded, verified independently — a
        test asserting only the `: true` branch was fixed is insufficient
  - [ ] Every new exemption entry has a non-empty, accurate reason and names a genuine no-tenant case
        (R-5 registry hygiene passes)
  - [ ] XTI-1's analyzer reports 0 violations in these 11 files (violations covered by a valid
        exemption entry count as 0 for this purpose)
Permission(s): module-specific view permissions (unchanged); platform.* codes for exemption entries
  (unchanged — no new platform permission)
Dependencies: XTI-1, XTI-2, XTI-3
Contract referenced: arch §6.2.1 shape (e) (branch-splitting); arch §4.5 (exemption registry rules)

---

Task ID: XTI-11   Actor/role: appointments.create / crm.create / blood-bank writers (clinic_admin,
                  doctor, clinic_staff per module)   Device: Both
Wave: W2   Owner: Dev A
Files (exclusive): appointment.service.ts, pet.service.ts, blood-bank.service.ts,
  pet.repository.ts, appointment.repository.ts, blood-bank.repository.ts
  (repository files transfer ownership into this wave from XTI-7/W1a (pet, appointment) and
  XTI-10/W1d (blood-bank) — same cross-wave transfer pattern as config/tenant-relation-exemptions.ts
  W0→W1d; no same-wave collision, see §6)
Description: XTI-5 (write-side atomicity, arch §8.2) AND arch §4.1 (frozen repository signatures —
  this is the one task that owns and executes §4.1, not just references it). Move the 3 service-layer
  FK checks that currently run outside their write transaction into it, so the check is atomic with
  the write: appointment.service.ts:66,85 (check before createAppointment/createWalkIn) →
  service opens prisma.$transaction, passes tx to both check and write. pet.service.ts:53-54
  (findOwner check before createPet) → findOwner moves inside createWithQuotaLock's existing
  transaction callback. blood-bank.service.ts:43 (registerDonor's pet check) → service opens tx,
  passes tx to both. **This requires creating new repository code, not just adding a parameter:**
  `petRepo.findOwner` (pet.repository.ts:50) already exists — add its trailing optional `client?`
  param in place. `appointmentRepo.findPetForBooking` does **not exist** — extract it from
  appointment.service.ts's inline pet-check logic into appointment.repository.ts with the client?
  param from the start. `bloodBankRepo.findDonorPet` does **not exist** — move the inline
  `prisma.pet.findFirst` check out of blood-bank.service.ts:43 into blood-bank.repository.ts as a
  named function with the client? param. All three land in the repository files now added to this
  task's exclusive scope above. The 5 repositories that already open their own transaction with the
  check inside it (hospitalization, grooming, reminder, medicalRecord, invoice) are UNCHANGED — that
  deviation from architecture-rules.md §5 is grandfathered as backlog B-6 (Lane D + ADR), not rolled
  back here; doing so would be a behaviour-preserving refactor with no isolation payoff and is exactly
  the scope bloat the ponytail gate exists to catch.
Acceptance Criteria:
  - [ ] All 3 writes (createAppointment, createWalkIn, createPet, registerDonor) have their FK check
        and their write inside the same transaction — a check-then-write race is structurally
        impossible, not merely improbable
  - [ ] The 3 repository functions gaining a trailing optional client? param match arch §4.1's frozen
        list exactly: petRepo.findOwner, appointmentRepo.findPetForBooking (extracted),
        bloodBankRepo.findDonorPet (moved down) — no other signature changes
  - [ ] Full suite green; no existing behaviour changes observably (same 404 on cross-tenant FK,
        same success path)
Permission(s): unchanged
Dependencies: XTI-7, XTI-9, XTI-10 (repository-layer guard fixes land first; this wave adjusts where
  the check for these specific writes is invoked, not what it checks)
Contract referenced: arch §4.1 (frozen signatures), §8.2 (transaction table)

---

Task ID: XTI-12   Actor/role: N/A (performance measurement)   Device: Both
Wave: W2   Owner: Dev B
Files: none written — measurement task, report inline in the PR
Description: Measure searchPets latency against NFR-01 (<500ms) after XTI-9's tenant predicate is
  added to search.repository.ts. BA flagged this as the one place to verify rather than assume —
  owners carries @@index([tenantId]) and @@index([tenantId, phone]), so the added predicate should be
  index-aligned, but arch's risk table (risk 5) requires it be measured, not assumed.
Acceptance Criteria:
  - [ ] searchPets p95 latency measured before/after XTI-9's change, reported in the PR description
  - [ ] No regression beyond NFR-01's 500ms budget; if a regression is found, it blocks Step 7 sign-off
        until resolved (index hint, query restructure) — does not ship silently degraded
Permission(s): N/A
Dependencies: XTI-9
Contract referenced: BA §10 NFR-01; arch §10 risk 5

---

Task ID: XTI-13   Actor/role: N/A (test authorship)   Device: Both
Wave: W2   Owner: @qa-agent
Files (exclusive): the 9 new behavioural test files (arch §9, one per shape — T1 forward 1-level, T1
  forward 2-level, T1 inside a write tx, raw SQL both variants, paginated list take+count, reverse
  include #1, reverse include #2, nullable FK preserved, non-PII T4), plus
  tests/integration/crossTenantFkWritePathRepro.test.ts (converted, not new)
Description: Author the 9 behavioural corrupt-row tests per arch §9's list (each proves the guard
  actually works, not merely that a guard is spelled correctly — the conformance test from W0 only
  checks spelling). Convert crossTenantFkWritePathRepro.test.ts from a one-off 38-probe reproduction
  into the standing prober: add registry parity — walk the Express route table with the existing
  tests/helpers/expressRouteWalker.ts, assert every POST/PUT/PATCH route appears in a new
  writePathFkMap registry (an unmapped new route fails), and run the existing paired-control probe
  (attacker's own id = positive control, victim's id = must be BLOCKED) for every registry entry
  declaring a tenant-scoped FK body field.
Acceptance Criteria:
  - [ ] AC-1, AC-2, AC-3, AC-6, AC-7, AC-8 all demonstrated green by these 9 tests plus the fixtures
        from XTI-1
  - [ ] AC-5's write half: a new unguarded write route fails the registry-parity assertion before its
        probe is even written
  - [ ] The 38 existing paired-control probes still pass under the converted, registry-driven harness
  - [ ] Full backend suite green (AC-9)
Permission(s): N/A
Dependencies: XTI-7, XTI-8, XTI-9, XTI-10, XTI-11 (tests the finished W1+W2-dev state)
Contract referenced: arch §9 (test strategy table, 9 shapes); ADR-0027 (standing prober paragraph)

---

Task ID: XTI-14   Actor/role: N/A (review, veto authority)   Device: Both
Wave: W2   Owner: @db-agent
Files: none written — review + script execution only
Description: Review every changed query across W1a-d and W2-Dev-A for tenant-isolation correctness
  (this is @db-agent's standing veto per CLAUDE.md, not a new grant of authority). Run
  `npm run db:integrity-scan` (XTI-6) against the test database as part of this review, once XTI-6 is
  built and the fixture corpus is seeded, to confirm the script itself produces a correct report
  against a deliberately-corrupted test row.
Acceptance Criteria:
  - [ ] Every changed query in W1a-d and XTI-11 reviewed and either approved or returned with a
        blocking comment — veto is not overrulable by any other agent (CLAUDE.md)
  - [ ] db:integrity-scan run against the test DB with a seeded corrupt-row fixture reports it
        correctly and with no PII field value (co-verifies AC-4 from the DB side)
Permission(s): N/A
Dependencies: XTI-7, XTI-8, XTI-9, XTI-10, XTI-6
Contract referenced: CLAUDE.md "Critical Rules — Multi-tenancy (ABSOLUTE)"; ADR-0028 Precondition 1
```

---

## 6. Work-partition manifest (Step 4, required for Step 6 parallelism)

**Roster note:** CLAUDE.md's illustrative manifest roster is DBA / Dev A / Dev B / UIUX A — the
typical split for a feature that touches schema, backend, and a screen. This change touches **none**
of those in the typical way: Option A (schema) is deferred (ADR-0028), and A-8 (arch doc) verifies
**zero frontend/UIUX work** — every consumer of the trimmed fields already reads only the fields that
survive. Arch's own frozen contract (§B) instead specifies **four backend workers** for W1 because the
20-file surface is disjoint across four independent repository groups. This manifest follows arch's
frozen grouping (Dev A/B/C/D — all `@dev-agent` instances with disjoint exclusive scope, not four
different agent types) rather than forcing an unused DBA/UIUX A row into the table.

| Task | Wave | Owner | Files it may write (exclusive) | Depends on | Contract referenced |
|------|------|-------|--------------------------------|------------|----------------------|
| XTI-1 | W0 | Dev A | `tests/unit/tenantRelationConformance.test.ts`, `tests/fixtures/tenant-conformance/*` (6 files) | — | arch §6.2/§6.2.1/§6.3 |
| XTI-2 | W0 | Dev A | `config/tenant-relation-exemptions.ts` (create) | XTI-1 | arch §4.5 |
| XTI-3 | W0 | Dev A | `owner.repository.ts`, `pet.repository.ts` (consts only) | XTI-1 | arch §4.2 |
| XTI-4 | W0 | Dev A | `vaccination.repository.ts` (comment only, L25-30) | — | BA §3 F-1 |
| XTI-5 | W0 | @scribe-agent | `.claude/roadmap/index.md` (PR #73 row only) | — | BA §13 C-2 |
| XTI-6 | W0 | Dev A | `scripts/tenant-integrity-scan.ts` (create) | — | arch §7 |
| XTI-7 | W1a | Dev A | `pet.repository.ts`, `appointment.repository.ts`, `invoice.repository.ts`, `prescription.repository.ts` | XTI-1, XTI-2, XTI-3 | ADR-0027 dialect 1; arch §4.1/§4.2 |
| XTI-8 | W1b | Dev B | `vaccination.repository.ts` (function bodies, not the W0 comment region) | XTI-1, XTI-2 | ADR-0027 dialect 3; arch §3.2 |
| XTI-9 | W1c | Dev C | `search.repository.ts`, `medical-record.repository.ts`, `hospitalization.repository.ts`, `owner.repository.ts` | XTI-1, XTI-2, XTI-3 | arch §5 (R-4 narrowed) |
| XTI-10 | W1d | Dev D | `reminder.repository.ts`, `blood-bank.repository.ts`, `grooming.repository.ts`, `transfer.repository.ts`, `product.repository.ts`, `user.repository.ts`, `role.repository.ts`, `auth.repository.ts`, `usage.repository.ts`, `report.repository.ts`, `tenant-settings.repository.ts`, `config/tenant-relation-exemptions.ts` (entries only — ownership transfers from Dev A for this wave) | XTI-1, XTI-2, XTI-3 | arch §6.2.1 shape (e); §4.5 |
| XTI-11 | W2 | Dev A | `appointment.service.ts`, `pet.service.ts`, `blood-bank.service.ts`, `pet.repository.ts`, `appointment.repository.ts`, `blood-bank.repository.ts` (repository files transfer in from XTI-7/W1a and XTI-10/W1d for this wave) | XTI-7, XTI-9, XTI-10 | arch §4.1, §8.2 |
| XTI-12 | W2 | Dev B | none (measurement only) | XTI-9 | BA §10 NFR-01 |
| XTI-13 | W2 | @qa-agent | 9 new test files + `tests/integration/crossTenantFkWritePathRepro.test.ts` (convert) | XTI-7…XTI-11 | arch §9 |
| XTI-14 | W2 | @db-agent | none (review + script run) | XTI-7…XTI-10, XTI-6 | CLAUDE.md multi-tenancy rule |

**File-ownership check (CLAUDE.md manifest rule — one owner per file per wave):**
- `vaccination.repository.ts`: Dev A owns only L25-30 (the comment) in **W0**; Dev B owns the function
  bodies in **W1b**. Different waves, same file, no same-wave conflict. If the comment fix and the
  function fix land in the same PR/commit sequence, Dev A's W0 edit must merge to `main`/the shared
  branch **before** Dev B's W1b edit starts, per the wave's own serial gate (W0 completes first).
- `config/tenant-relation-exemptions.ts`: Dev A creates it and adds the E-1 entry in **W0**; Dev D adds
  platform-plane entries in **W1d**. Different waves, no same-wave conflict. No other W1 worker touches
  this file.
- `owner.repository.ts` and `pet.repository.ts`: Dev A declares the two summary-select consts in
  **W0**; those same two files are edited again for their T1/T2 fixes in **W1a** (`pet.repository.ts`,
  by Dev A again) and **W1c** (`owner.repository.ts`, by Dev C). Sequencing: Dev A's W0 const-only edit
  must land before W1 starts (structural requirement — W0 gates W1 entirely, so this is automatic).
  Within W1, `pet.repository.ts` is Dev A's alone (W1a); `owner.repository.ts` is Dev C's alone (W1c) —
  no two W1 workers share a file.
- `pet.repository.ts`, `appointment.repository.ts`, `blood-bank.repository.ts` (arch §4.1 — 3 waves,
  found by ponytail's Step 5 gate review, corrected here): `pet.repository.ts` is touched in **W0**
  (XTI-3, const declaration, Dev A), **W1a** (XTI-7, T1 tenant-predicate fix, Dev A), and **W2**
  (XTI-11, the arch §4.1 `client?` param + `findOwner`, Dev A) — three waves, same owner (Dev A)
  throughout, no conflict. `appointment.repository.ts` is touched in **W1a** (XTI-7, Dev A) and **W2**
  (XTI-11, `findPetForBooking` extracted, Dev A) — same owner both waves. `blood-bank.repository.ts` is
  touched in **W1d** (XTI-10, Dev D) and **W2** (XTI-11, `findDonorPet` moved down, Dev A) — ownership
  transfers from Dev D to Dev A across the W1d→W2 wave boundary, same pattern as
  `config/tenant-relation-exemptions.ts`'s W0→W1d transfer above. All three land inside XTI-11's
  exclusive scope for W2; no same-wave collision in any wave.
- All other files: exactly one worker across the whole plan.

---

## 7. Integration checkpoints

- **After W0:** analyzer runs against current `models/`, prints the violation list (this is the real
  W1 work order — confirm it roughly matches the ~57 include / ~19 JOIN estimate but do not block on
  an exact match); all 6 fixtures pass; exemption registry validates; both summary-select consts
  resolve; XTI-6's script runs against a seeded fixture and reports correctly; the vaccination comment
  and roadmap record are corrected. **Nothing in W1 starts until this checkpoint passes.**
- **After W1 (a/b/c/d together):** analyzer reports 0 violations across all 20 files (violations
  covered by a valid, non-stale exemption count as resolved); full backend suite green; no post-filter
  pattern remains anywhere in `models/`.
- **After W2:** the 9 behavioural tests + converted write-path prober all green; searchPets NFR-01
  measured and within budget; @db-agent's review is APPROVE with no open blocking comment; AC-1
  through AC-10 all demonstrated, not merely asserted.

---

## 8. Backlog reminders (not this change — do not absorb)

- **B-2** — branch-level (`branchId`) relation isolation. Same defect class, larger surface,
  complicated by nullable `branchId`. Track separately.
- **B-6** — five repositories (hospitalization, grooming, reminder, medicalRecord, invoice) open their
  own transaction, deviating from `architecture-rules.md` §5. Grandfathered here (XTI-11 does not
  touch them). Lane D + ADR, future work.
- **B-7** — R3-F1 (`onDelete` FK drift) is now a *precondition* of a future Option A per ADR-0028, not
  merely adjacent backlog. Not touched by this change.
- **B-5** (BA's) — no response-shaping layer between repository and controller; `ownerSummarySelect`
  narrows the worst instance but the structural fix is bigger than this requirement justifies.
  Acknowledged, not absorbed.
- **Option A** (composite tenant FKs) — ruled DEFERRED in ADR-0028 with 3 named preconditions and its
  own future Lane A entry. Not implemented here; only the ruling is recorded.

---

## 9. Risks carried forward (arch §10 / BA §14, not re-litigated — tracked for Step 6/7)

| # | Risk | Where it's mitigated in this plan |
|---|---|---|
| Ponytail reads 20 files as scope bloat | §0's framing + the manifest's "one mechanism" note |
| A worker changes a frozen signature mid-wave | §4.1's list is frozen; any addition stops the wave and returns to @arch-agent, not decided ad hoc by a worker |
| `findX`/`countX` drift (E-7 regression) | R-4 narrowed, checked per-file in XTI-7/XTI-9's AC, proven by XTI-13's paginated-list behavioural test |
| NFR-01 regression on searchPets | XTI-12, dedicated measurement task, blocks Step 7 if it regresses |
| A twelfth violation appears later (recurrence) | XTI-1's analyzer is exactly the mechanism that prevents this — AC-5 is the load-bearing proof |
| Searches hit stale copies under `.claude/worktrees/` | Every task above scopes edits to `src/backend/` paths as read from source in this session, not from a cached search |

---

## 10. Handback

**Step 4 complete.** All BA conditions (C-1…C-7) and both ponytail FLAG items are addressed above —
folded into task content, not left as open notes. AC-1 through AC-10 carried forward with no drop.
Work-partition manifest satisfies "one file, one owner, per wave." W0 is explicitly serial; W1's four
workers are explicitly parallel and disjoint; W2's four owners (2 dev, qa, db) are explicitly disjoint.

**Next:** @scribe-agent, Step 4b — reference pre-check (verify every path cited above, including the
35-file `src/backend/models/*.repository.ts` glob and every named line number, actually resolves on
this branch) — a dangling path blocks Step 5. Then @ponytail-agent, mode `gate` (Step 5) — the 9
criteria against {arch doc + this plan}, checking specifically for drift between what arch froze and
what this plan assigns.

*@pm-agent — Step 4 (`/superpowers:write-plan` equivalent) complete. Plan path:
`docs/superpowers/plans/2026-09-11-cross-tenant-relation-isolation-plan.md`.*
