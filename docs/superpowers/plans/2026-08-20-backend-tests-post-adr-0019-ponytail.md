# Ponytail Gate Verdict — Backend Test Suite Repair Post-ADR-0019

**Pipeline step:** 5 (`@ponytail-agent` simplicity gate)
**Date:** 2026-08-21
**Plan under review:** `docs/superpowers/plans/2026-08-20-backend-tests-post-adr-0019.md`
**Branch:** `fix/backend-tests-post-adr-0019`

## VERDICT: ✅ APPROVE — all 7 criteria pass. Proceed to Step 6 `/execute-plan`.

---

## 1. Per-criterion table

| # | Criterion | Verdict | One-line why |
|---|---|---|---|
| 1 | Over-engineering? | **NO** | No new abstraction, layer, helper, or config anywhere; the production fix is a 6-line branch on an existing failure path, and the two "simpler" alternatives are forbidden by ADR-0025 as unsafe. |
| 2 | Duplicate work? | **NO** | Nothing reimplements an existing function, route, or schema. One *test* (`bill-19`) duplicates `bill-06` — advisory trim, not production duplication. |
| 3 | Existing solution? | **NO** | No library covers "repair stale Jest mocks after a schema change"; the in-repo candidate for reuse (a generic `findInvoiceById`) is explicitly named by ADR-0025 as the hazard that reintroduces the oracle. |
| 4 | Scope too large? | **NO** | 1 production subsystem, 1 file, 1 function, ~8 LOC. 13 files touched trips the literal >10 line — justified below, not scope creep. |
| 5 | Too many deps? | **NO** | Zero new dependencies, transitive or direct. |
| 6 | Too many files? | **NO** | Exactly 1 new file (the deleted-coverage doc). Cap is 15. |
| 7 | Too many APIs? | **NO** | Zero new endpoints, hooks, or mutations. `claimInvoicePaid`'s signature is unchanged. |

---

## 2. Reasoning on the four items flagged for scrutiny

### 2.1 Is 41 tasks proportionate? (Criterion 1)

The brief said ~34; the plan actually carries **41 numbered tasks** (0.1 through 11.4), of which
12 are one-line verification runs. That looked like the most likely hiding place for padding, so
it got the hardest look.

**Ceremony found, but it is not solution complexity.** Two groups are over-subdivided:

- **Group 2** spends 9 tasks on one file. Tasks 2.3, 2.4, 2.6 are self-described as "mechanical
  mock-shape change only" / "same mechanical mock-shape change"; 2.5 and 2.8 are both
  "`findUnique` → `null`". Those five are the same edit five times. They collapse to one task
  ("swap the mock from `findMany`-returning-array to `findUnique`-returning-object; the tests at
  lines 70, 77, 85, 91, 106 need no other change"), leaving the three genuinely substantive
  rewrites (2.1 union-test rewrite, 2.2 composite-key assertion, 2.7 retitle) plus verify — 5
  tasks, not 9.
- **Group 3** spends 3 tasks on three consecutive deletions in one `describe` block (3.1, 3.2,
  3.3). The plan does not hold this rule consistently — Task 3.4 already bundles two deletions —
  which is itself the evidence that the one-test-per-task split is arbitrary. G3 collapses to 3
  tasks.

That is ~7 collapsible tasks, a 17% trim of the checklist and a **0% trim of the work**. The
artifact produced is byte-identical either way: 13 files, ~8 production LOC, net-negative test LOC.

**Why this is not a rejection.** Criterion 1 asks whether the *solution* could be 40% simpler, not
whether the checklist could be shorter. There is no layer, pattern, wrapper, or indirection in this
plan to remove. Rejecting a plan in order to renumber its checkboxes would impose more ceremony
than it removes — which is the exact vice this gate exists to police. The file-by-file ordering
does earn its keep: nine suites are red for two independent reasons, and per-file verification is
what keeps a regression attributable to one edit rather than to a 13-file blur.

Collapsing Groups 2 and 3 is left to `@dev-agent`'s discretion during execution.

### 2.2 The four invoice cases — four is right; three new tests is one too many (Criterion 2)

**Four cases is genuinely the minimum. Do not cut a case.** ADR-0025's negative-consequences
section states the reason precisely: the four rows exist so "a partial fix that special-cases
tenant mismatch cannot pass." Drop the wrong-branch row and a fix that checks only `tenantId`
goes green. Drop the nonexistent-id row and a fix that returns 404 for every failure goes green
while destroying the 409 contract. Each row kills a different wrong implementation. This is the
one place in the plan where cutting would be actively harmful, and the plan is right to insist.

**But four cases needs only two new tests, not three.** Coverage after the plan:

| ADR-0025 case | Guarded by |
|---|---|
| wrong tenant → 404 | `bill-09` (exists, currently failing, fixed in place) |
| wrong branch, same tenant → 404 | `bill-17` (**genuinely new**) |
| nonexistent id → 404 | `bill-18` (**genuinely new**) |
| already paid, own scope → 409 | `bill-06` (exists, green, untouched) — and `bill-19` |

`bill-19` is a literal duplicate of `bill-06`: same endpoint, same `tokenA`, same `invoiceId`,
same expected 409, same file, ~13 lines apart. The plan is honest about this ("duplicates
bill-06's assertion by design, for AC-05 traceability"), but traceability is already delivered by
the plan's own AC→test map at §2, which writes the row as "`bill-19`/`bill-06`" — naming `bill-06`
proves `bill-06` is findable. Colocation buys nothing when the original is in the same file.

**Advisory, not a gate condition:** drop `bill-19`, map AC-05's fourth row to `bill-06`. Cost of
keeping it is ~2 lines; that does not clear the bar for blocking execution. If it is dropped,
**Task 11.1's expected total becomes 1288, not 1289** — that must be changed in the plan at the
same time, or Task 11.1's own "do not adjust the tests to match, report the discrepancy" rule will
fire on a discrepancy the executor created.

### 2.3 The production fix shape — minimal (Criterion 1, 3)

The plan adds a same-scope `findFirst` on the `count === 0` path only. Every alternative was
checked against ADR-0025's three load-bearing constraints:

| Alternative mechanism | Verdict |
|---|---|
| Hoist an existence check before the claim | **Forbidden** — reintroduces the exact TOCTOU race HI-08's single-statement claim closes (constraint 2). |
| Reuse a generic `findInvoiceById` / drop the branch clause | **Forbidden** — ADR-0025 names this by hand as the change that "silently reintroduces the oracle" (constraint 1). |
| `count()` instead of `findFirst({ select: { id: true } })` | Identical cost and identical line count. Not simpler, just different. |
| Reuse the success-path `findFirst` two lines below | Impossible — mutually exclusive code paths. |
| Widen the claim's `where` and branch on the result | Breaks the atomic claim. Same forbidden category as a pre-check. |

The chosen shape is the minimum mechanism that returns 404/404/404/409 correctly while leaving the
atomic `updateMany` byte-for-byte untouched and creating no cross-tenant existence oracle. Task
9.2's four "binding constraints" restate the ADR's invariants as diff-checkable assertions, which
is the right weight — no new document, no new abstraction, just a checklist against the diff.

### 2.4 The red-suite ship gate — one check, one rule statement (Criterion 1, 4)

Two files, but not two mechanisms. Task 10.2 puts the **actual check** in one place —
`anemal-finish-branch/SKILL.md` step 1.5, where Step 8 already runs. Task 10.1 puts a **rule
statement** in `CLAUDE.md`, which is the project's rule registry by its own convention ("Touch
CLAUDE.md itself only when an orchestration rule changes"). The two cross-reference each other
rather than both executing. There is no second gate, no duplicated logic, and no wiring into
`/execute-plan`, CI config, or a pre-commit hook. This is the minimum honest placement: a rule
nobody can find is a rule that does not exist.

Task 10.1's explicit "do not add anything else to CLAUDE.md in this branch" is the right guard
against this becoming a documentation excursion.

### 2.5 The deleted-coverage doc — a paragraph, as required (Criterion 1)

Task 0.1 specifies a 7-row table (one row per deleted test: file, name, reason, surviving cover)
plus one paragraph naming the accepted gap. That is proportionate to a human ruling that said
"delete, but document the loss." No treatise, no per-test essay, no separate ADR. It also earns
its place structurally: it is the only artifact that records that
`classifyMultiRoleUsers`/`collapseMultiRoleUsers`' ambiguous branches now have zero coverage —
a real gap that would otherwise be invisible erosion.

---

## 3. Criterion 4 — the file-count overage, stated plainly

The plan's own pre-check says "13 files. Under the 15-file cap." That cites criterion 6's cap
(>15 **new** files), not criterion 4's (>10 files touched). **13 > 10 — the literal threshold is
tripped, and it should not have been papered over.** Here is why it still passes:

| Measure | Value | Cap | |
|---|---|---|---|
| Production subsystems | 1 (billing) | >3 | pass |
| Production files | 1 (`invoice.repository.ts`) | — | pass |
| Production LOC | ~8 | >500/file | pass |
| Test files | 9 | — | see below |
| Doc/config files | 3 (+1 new doc) | — | pass |

The 9 test files are **not a discretionary choice**. They are the exact set of files that already
contain the 28 red tests on `main`. You cannot green nine red suites by editing fewer than nine
files; the count is dictated by where the pre-existing breakage sits, not by plan ambition.
Criterion 4 exists to catch a change reaching into more of the system than its goal requires —
this change reaches into exactly as much as its goal requires and no further, and Task 11.3's
`git diff --stat` check enforces that boundary mechanically.

Splitting was considered and rejected on its merits, not deferred to the locked ruling:
- Splitting the production fix out is **locked** by the BA (quarantining `bill-09` yields a green
  suite that no longer checks cross-tenant payment).
- Splitting the 13-line rule change into its own PR would run a full 8-step pipeline for a
  doc edit.
- Splitting the test repair by suite would produce three PRs for one incident, each of them
  blocked by the very red-`main` gate this plan is adding.

Every split makes the total work larger. The single branch is the simple option.

---

## 4. Non-blocking findings carried to `@dev-agent`

These do not affect the verdict. They are execution landmines found while verifying the plan's
anchors, and Step 6 should have them.

### 4.1 HIGH — Task 9.1's fixture note is factually wrong, and the error is load-bearing

The plan says: *"Use the existing `tokenA`/`tokenB`/`bA`/`bB` fixtures already in scope (see file
header, `bA`/`bB` are tenant A's branches)."*

Verified against `src/backend/__tests__/invoice.test.ts:37-39`:

```ts
const bA = await prisma.branch.create({ data: { tenantId: tidA, name: 'Main' } })
const bB = await prisma.branch.create({ data: { tenantId: tidB, name: 'Main' } })
branchAId = bA.id
```

Two errors. **`bB` belongs to tenant B, not tenant A.** And **neither `bA` nor `bB` is in scope
outside `beforeAll`** — both are block-scoped `const`s; only `branchAId` is lifted to module scope.

Why this matters beyond accuracy: if `@dev-agent` follows the parenthetical and reaches for `bB`
to build `tokenA2`, `bill-17` silently becomes a **second cross-tenant test** — a duplicate of
`bill-09` — and the wrong-branch-same-tenant case goes uncovered. That is precisely the failure
mode ADR-0025's four-row table exists to prevent: a fix that special-cases tenant mismatch would
then pass the whole suite. The plan's *instruction* is correct ("add one in this file's
`beforeAll` — tenant A, second branch"); only the parenthetical is wrong. **Delete the
parenthetical before execution.** `bill-17` requires a new tenant-A branch and a `tokenA2` signed
with `tenantId: tidA` and that new `branchId`.

Every other anchor spot-checked was exact: `authService.test.ts:9` (the `user` mock genuinely has
`findUnique`/`update`/`findFirst` and no `updateMany`), `clinicUsage.test.ts:23-31` (stale
`// Phase 8 (T-5B-01)` comment above a `findMany` mock), `roleManagement.test.ts:358-360`, and all
eight `permission.service.test.ts` line numbers (53, 62, 70, 77, 85, 91, 100, 106). The invoice
note is an isolated slip, not a systemic accuracy problem — which is why it is a note rather than
a rejection.

### 4.2 MEDIUM — `bill-19` optional trim

Per §2.2. If dropped, change Task 11.1's expected total from 1289 to 1288 in the same edit.

### 4.3 LOW — Groups 2 and 3 may be collapsed during execution

Per §2.1. Group 2: 9 → ~5 tasks. Group 3: 6 → ~3. Dev's discretion; no plan revision required.

---

## 5. Gate output

```
@pm-agent — Ponytail gate ✅ APPROVE — all 7 pass. Proceed to execute-plan.
```

Carry §4.1 into Step 6 — it is the one item that could let a partial fix through.
