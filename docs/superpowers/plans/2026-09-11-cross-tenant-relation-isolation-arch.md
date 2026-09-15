# Arch Brief — Cross-Tenant Relation Isolation

**Date:** 2026-09-11 · **Author:** @arch-agent · **Tier:** Brief (+ §A option comparison, required by BA C-3)
**Source:** `docs/superpowers/plans/2026-09-10-cross-tenant-relation-isolation-ba-signoff.md` (corrected 2026-09-11, §4.3 / §9 E-2 / §17)
**Standards applied:** `.claude/standards/architecture-rules.md` · `.claude/skills/anemal-db-context` · `.claude/skills/anemal-rbac-matrix`
**Next:** @ponytail-agent `arch-precheck` (3.4b) → `/grill-with-docs` (3.5) → @pm-agent `/write-plan` (4)
**ADRs produced:** `docs/adr/0027-tenant-scoped-relation-traversal-carries-its-own-predicate.md` ·
`docs/adr/0028-composite-tenant-foreign-keys-deferred.md`

**Revision:** rev 2 (2026-09-11) — rework after `@ponytail-agent` `arch-precheck` **BLOCK**.

> **What changed in rev 2, for a targeted re-review.** The BLOCK was correct: the analyzer was
> specified over literal `where`/`include` values, but 17 of 35 model files put those values behind a
> call expression, an identifier or a spread — and R-4 *mandated* the very shape the analyzer could not
> read, on the flagship T1 files. Five edits, nothing else touched:
>
> | # | Fix | Sections |
> |---|---|---|
> | 1 | Resolution model stated per shape, with a re-costed analyzer (~200 → **~350 lines**) | **new §6.2.1** |
> | 2 | Path **(ii)** chosen — bounded resolution; (i) and (iii) rejected on the record; §3.3's `relGuard()` rejection **re-argued** after withdrawing its dead reason | §6.2.1, **§3.3 rewritten** |
> | 3 | **R-4 narrowed** to "`findX` and `countX` each carry the predicate" — the forced `medical-record` builder refactor is cancelled | §5, R-4 row, §B W1c |
> | 4 | Unresolvable `select`/`include` **value** ruled on by relation arity (to-one passes on the key, to-many fails closed) | §6.2.1 table, §4.2 |
> | 5 | `scripts/tenant-integrity-scan.ts` marked **CONDITIONAL** on BA's AC-4 answer, not committed | §0, §7, §A.4, §B |
>
> **Untouched by design** (ponytail did not object): the core rule and its three dialects (§3.1), the
> post-filter retirement (§3.2), zero new dependencies (**still true** — TS compiler API only, A-6),
> the 20-file scope, and ADR-0028's deferral of Option A.
>
> **Three facts verified on this branch during rework**, each of which changed a decision:
> all five builder functions end in a single `return <object literal>` (so shape (a) resolves);
> `BranchInventory` is tenant-scoped and `product.repository.ts:57,70`'s `: true` ternary branch is a
> **live unguarded include** a literals-only analyzer would never have seen; and
> `medical-record.findByPet`/`countByPet` **already each carry `tenantId`**, so R-4's refactor was
> never buying isolation.

---

## 0. Read this first — the shape of the change

> **This is ONE rule, applied at N call sites. It is not N fixes.**
>
> **The rule:** *a tenant-scoped relation is only ever **followed**, or **written**, with a tenant
> predicate attached at the point of traversal.* One sentence. Three spellings, because Prisma
> to-one, Prisma to-many and raw SQL are three dialects of the same join.
>
> **New abstractions introduced: zero.** No interface, no wrapper client, no helper, no new layer,
> no new error class, no new permission code, no schema migration, no new dependency.
> **New runtime code: zero** — every read-side change is a predicate added to an existing `where`.
> **New artefacts: two test files**, plus one operator script **that is conditional on a BA answer
> and may not be built at all** (§7, item 3 below).
>
> The diff is wide because the defect is structural. The *design* is one line.

**What is actually being built (the whole list):**

| # | Artefact | Kind | Why it exists |
|---|---|---|---|
| 1 | `tenantRelationConformance.test.ts` + 6 fixtures | new test | XTI-7. The only thing that stops a twelfth site. |
| 2 | `config/tenant-relation-exemptions.ts` | new 20-line data file | E-1 / E-5 named, reviewed exemptions |
| 3 | `scripts/tenant-integrity-scan.ts` | new operator script — **CONDITIONAL, not committed** | XTI-INV-b + Option A's precondition. Built **only if** @ba-agent accepts the AC-4 rewording (§7). Not decided here. |
| 4 | `crossTenantFkWritePathRepro.test.ts` | **converted**, not added | XTI-5. A throwaway reproduction becomes the standing prober. |
| 5 | 57 `include:` occurrences + 19 raw-SQL `JOIN`s (see scope note) | edits, ~1 line each | XTI-1…XTI-4 |
| 6 | 4 write-path FK checks | **relocated** into their write transaction | XTI-5 atomicity (BA F-3) |

Item 5 is the wide part. It is mechanical, its correctness criterion is "artefact 1 reports zero
violations for this file", and the files are disjoint — which is what makes Step 6 parallel.

**Scope correction for @pm-agent:** BA's audit was forward-only and found **11 files**. The candidate
surface is **20 model files** — 57 `include:` occurrences, plus 19 raw-SQL `JOIN`s across 7 files —
because reverse includes were wrongly believed safe until QA disproved it (BA §17).

Not all 76 are defects: `product.repository.ts`'s 4 joins are already correctly guarded
(R2-HI-02), `vaccination.repository.ts`'s 6 are the known XTI-2 defect, and an unknown number of the
`include:` occurrences traverse relations to non-tenant-scoped models (`Tenant`, `Permission`, `Plan`)
where no predicate applies. **W0's first output is the exact defect list** — the analyzer prints it,
and that printout is W1's work order. @pm-agent should size W1 from that list, not from this estimate.

What matters for planning: the mechanism covers both directions by construction (§3.1), so the
*design* does not grow with the count — only the site count does. Plan against 20 files, not 11.

---

## 1. Problem & assumptions

**Problem.** No FK in the schema references `tenantId`. The database therefore permits a child row in
tenant A whose FK points at a parent in tenant B. Every query that follows such a relation without
re-checking the related row's `tenantId` returns the other tenant's data. QA proved this leaks in
**both** directions (BA §17): forward, A pulls B's data into A's response; reverse, A's corrupt row
pushes A's own data into B's response — the victim is the tenant that did nothing wrong.

**Verified assumptions** (each checked against this branch, not inherited):

| # | Assumption | Verified how | Result |
|---|---|---|---|
| A-1 | Prisma cannot filter a **to-one** `include` by a field on the related row | generated `.prisma/client/index.d.ts`: `owner?: boolean \| OwnerDefaultArgs` — `OwnerDefaultArgs` has `select`/`include`/`omit`, **no `where`** | **True** — the hotfix comment is right about this |
| A-2 | …but the predicate can go in the **root `where`** instead | `VaccinationWhereInput.pet?: XOR<PetRelationFilter, PetWhereInput>`; `PetRelationFilter = { is?, isNot? }` | **True.** This is the fix the hotfix missed. |
| A-3 | A **nullable** to-one can distinguish "absent" from "wrong tenant" | `PetNullableRelationFilter = { is?: PetWhereInput \| null; isNot?: … }` | **True** — `{ is: null }` matches absent. Covers E-4. |
| A-4 | A **to-many** include accepts a nested `where` | `vaccinations?: boolean \| Pet$vaccinationsArgs` | **True** — reverse includes are a one-token fix |
| A-5 | The relation map can be **derived**, never hand-maintained | `Prisma.dmmf.datamodel.models` ships with `@prisma/client` 5.22.0 | **True** — relation #114 is known to the scanner the day it is added |
| A-6 | `typescript` is already available for AST work | `src/backend/package.json` devDeps: `typescript ^5.4.5` | **True** — zero new dependencies |
| A-7 | The repo has **no CI** | `.github/workflows` does not exist | **True — and decisive. See §4.** |
| A-8 | Removing `owner: true` breaks no consumer | every reader of a *related* owner reads only `firstName`/`lastName`/`phone`(/`id`) — `pdf.service.ts:83-86,194-203`, `search.service.ts:19-21`, `ClinicBilling.tsx:630`, `ClinicEMR.tsx:574`. `ClinicPets.tsx`'s `address`/`idCardNumber` reads come from `/api/owners`, where Owner is the **root** row, not a relation | **True — zero frontend work** |

A-8 is worth stating loudly: the highest-severity fix in the set (T1, five sites, Thai national ID)
costs **no frontend change and no UIUX worker**.

**Rejected premise.** PR #73's comment concludes from A-1 that post-filtering is the answer. A-1 is
true; the conclusion does not follow. The filter belongs in the root `where`, not in the include.
That single mistake is what produced E-7 (§5).

---

## 2. Complexity hotspots — what changes often vs what is stable

| Area | Classification | Consequence for the design |
|---|---|---|
| The relation graph (114 traversals, 35 tenant-scoped models) | **frequently changing** — grew to 70 forward relations with nobody noticing this hole | The mechanism must **derive** it, never list it. Hence `Prisma.dmmf`. |
| The set of `include`/`select` call sites | **frequently changing** — every new read adds one | The mechanism must be **repo-wide and automatic**, not per-site. |
| The invariant itself (XTI-INV) | **stable** — it has been true since the first tenant | Belongs in an ADR + a test, not in a comment. |
| The three guard spellings | **stable** — fixed by Prisma's and SQL's shape | Safe to freeze literally. No helper needed (§3.3). |
| Owner PII field list | **stable** — 4 fields, 5 consumers, all verified | Safe to freeze as one exported constant. |
| Write-path FK validation | **frequently changing** — a new route adds one | Needs route-table-driven detection, not a hand-listed probe set. |

**The isolation that matters:** everything that changes often (the relation graph, the call sites,
the routes) is *derived* by the mechanism. Everything hand-written (the invariant, the three
spellings, the exemptions) is stable. That is the whole boundary.

---

## 3. The mechanism

### 3.1 One rule, three dialects

> **XTI-INV (BA §5), restated as a code rule:** a tenant-scoped relation is traversed only with a
> tenant predicate attached at the traversal point.

**Dialect 1 — forward (to-one), Prisma.** The predicate goes in the **root `where`**, not the include.

```ts
// required FK
prisma.vaccination.findMany({
  where:   { tenantId, pet: { is: { tenantId } } },
  include: { pet: { select: petSummarySelect } },
})

// nullable FK — E-4: a genuinely absent relation must survive, not be dropped
prisma.invoice.findFirst({
  where:   { id, tenantId, OR: [{ pet: { is: null } }, { pet: { is: { tenantId } } }] },
  include: { pet: { include: { owner: { select: ownerSummarySelect } } } },
})

// two levels — mirror the include path in the where
prisma.prescription.findFirst({
  where: { id, tenantId,
           medicalRecord: { is: { tenantId, pet: { is: { tenantId,
                            owner: { is: { tenantId } } } } } } },
  include: { medicalRecord: { include: { pet: { include: { owner: { select: ownerSummarySelect } } } } } },
})
```

**Dialect 2 — reverse (to-many), Prisma.** The predicate goes in the **nested `where`**.

```ts
prisma.pet.findFirst({
  where:   { id, tenantId, isActive: true },
  include: { vaccinations: { where: { tenantId }, orderBy: { administeredAt: 'desc' } } },
})
```

**Dialect 3 — raw SQL.** The predicate goes on the **`ON` clause**, exactly as
`product.repository.ts:242/254/266` already does:

```sql
JOIN pets   p ON p.id = v."petId"   AND p."tenantId" = ${tenantId}
JOIN owners o ON o.id = p."ownerId" AND o."tenantId" = ${tenantId}
```

**This is not a fourth pattern.** Dialects 1 and 3 are the *same* join predicate in two languages —
BA §4.3 point 1 named the SQL spelling as canonical; dialect 1 is its Prisma spelling. Dialect 2 is
the same predicate one level down. BA §4.3 point 2 (`hospitalization.repository.ts:39-46`, resolve via
a separate tenant-filtered batch query) stays valid where it is already used and is the correct escape
hatch for a traversal Prisma cannot express — it is not being replaced.

### 3.2 What is retired

**BA §4.3 point 3 — the post-filter — is retired, including its only instance.**
`vaccination.repository.ts:31-45` (`findDueSoon`, shipped in PR #73) is rewritten to dialect 1 and its
`.filter()`/`.map()` block is **deleted**. Reasons, in order of weight:

1. It breaks pagination (§5 / E-7 / C-4).
2. It fetches the foreign tenant's PII into application memory before discarding it. Filtering in the
   database means the bytes never leave Postgres.
3. It cannot be checked mechanically — a scanner cannot tell a security `.filter()` from any other.
4. Leaving it standing means the codebase contains two answers to one question, and the weaker one is
   the one with a comment pointing at it.

This is a **deletion**, not an addition. The change removes a pattern from the codebase.

### 3.3 Why there is no helper — re-argued, because my first argument was wrong

The obvious move is `relGuard(tenantId)` returning `{ is: { tenantId } }`. Still **rejected** — but one
of the three reasons I originally gave has to be **withdrawn**, and saying so is cheaper than leaving a
dead argument standing.

**Withdrawn:** *"it would hide the guard from the scanner."* §6.2.1 now gives the analyzer bounded
resolution of same-set identifiers and call expressions. The same machinery that reads
`buildWhere(...)` would read `relGuard(...)`. That reason is dead and I am not going to pretend it
isn't.

**What survives, and why it is still enough:**

- **Resolution is a cost paid to read code that already exists — not a licence to add more of it.**
  `buildWhere`/`listWhere`/`catalogWhere` exist for a domain reason that predates this change: they
  keep a list query and its count query on one filter. The analyzer must resolve them because they are
  *there*, and removing them would be a behavioural regression (§5). `relGuard` would be a **new**
  indirection, introduced by this change, whose entire benefit is four saved tokens. Every construct
  the analyzer must resolve is a construct where the check's correctness depends on the resolver being
  right. Paying that price to read existing code is forced; paying it again to shorten a line is a
  choice, and the wrong one.
- **The nullable form still does not compose.** `OR: [{ is: null }, { is: { tenantId } }]` is not a
  single keyed value; a helper for it would need `AND`-merging, and two nullable relations in one query
  would collide. A helper that covers the easy half and not the hard half leaves two spellings where
  there was one — which is precisely how eleven inconsistent guards accumulated.
- **New, and it is the same reason as the first two:** the resolver is bounded to *single terminal
  `return` of an object literal* (§6.2.1). A `relGuard` worth having would have to branch on nullability
  (`relGuard(tid, { nullable: true })`), which is exactly the shape the resolver refuses. **The helper
  that would earn its keep is the one the analyzer cannot read.** That is not bad luck; branching is
  what makes a value unresolvable and what makes a guard unreadable to a reviewer, and those are the
  same property.

Per `architecture-rules.md` §3 abuse signals, this would be "a layer that only forwards calls."

---

## 4. Contract (FROZEN) — the seam Step 6 builds against

### 4.1 Repository signatures — **unchanged** (REVISED rev 3, 2026-09-11 — ponytail Step 5 gate)

`tenantId` stays the first parameter of every repository function. No function is renamed, removed, or
reordered. **Two functions gain one optional trailing parameter**, following the pattern already in
`pet.repository.ts:56` (`createPet(tenantId, data, client = prisma)`):

```ts
petRepo.findOwner(tenantId: number, ownerId: number, client?: Prisma.TransactionClient | typeof prisma)
petRepo.findPetById(tenantId: number, id: number, includeEmr = true, client?: …)   // client? is 4th,
                                                                                    // includeEmr KEEPS
                                                                                    // its existing
                                                                                    // `= true` default —
                                                                                    // do not change it
                                                                                    // to optional-undefined
bloodBankRepo.findDonorPet(tenantId: number, petId: number, client?: …)          // moved down from blood-bank.service
```

**Correction (rev 3):** rev 2 named a third function, `appointmentRepo.findPetForBooking(...)
// extracted from appointment.service`. This was wrong — `appointment.service.ts:66,85` hold no inline
pet-check logic to extract; both sites already call the existing `petRepo.findPetById(tenantId, petId)`
(`pet.repository.ts:32`). There is nothing to extract, and building a second tenant-scoped pet lookup
in `appointment.repository.ts` would duplicate `findPetById` — exactly the double-guarding §8.2's B-3
ruling forbids by name. The atomicity fix for `createAppointment`/`createWalkIn` (XTI-11/arch §8.2)
reuses `findPetById` with its `client?` param added, called with `includeEmr: false` (the booking check
needs only tenant/existence, not the EMR-shaped include `findPetById` returns by default — passing
`false` skips that work). `findPetById` stays in `pet.repository.ts`, not `appointment.repository.ts`.

No other signature may change. **A worker that wants a different signature stops and raises it** —
Step 6 parallelism depends on this list being complete.

### 4.2 Response shapes — exactly one change, and it is a removal

**No new file.** `src/backend/models/` contains *only* `*.repository.ts` — verified, 35 files, no
exceptions — so a shared `_select.ts` would both break that convention and land inside the scanner's
own glob. Each summary select is instead exported from the repository that owns its model and
imported by the others (same layer, no dependency-direction violation):

```ts
// src/backend/models/owner.repository.ts
export const ownerSummarySelect = { id: true, firstName: true, lastName: true, phone: true } as const

// src/backend/models/pet.repository.ts
export const petSummarySelect   = { id: true, name: true, species: true, photoUrl: true } as const
```

**Both constants are declared in W0**, before any W1 worker starts, precisely because they are the
one thing four parallel workers share. W1 workers import them and never edit them.

> **FROZEN CONSTRAINT — these two consts must stay inside `src/backend/models/*.repository.ts`.**
> That glob is not just a convention here; it is exactly the analyzer's source set (§6.2), so a const
> declared inside it is **resolvable** and the same const moved to `utils/`, `types/` or a shared
> `_select.ts` is **not**. Moving them would make the analyzer blind to whatever they contain and, per
> the §6.2.1 ruling, would turn all five T1 sites into fail-closed violations. Both properties — "no
> new file in `models/`" and "inside the analyzer's own glob" — point the same way, which is why this
> placement is frozen rather than merely preferred. `select` values are also **scalar-only by rule**:
> neither const may ever gain a relation key (§6.2.1 (c)).

`ownerSummarySelect` replaces `owner: true` at all five T1 sites (`appointment.repository.ts:93`,
`invoice.repository.ts:146`, `invoice.repository.ts:218`, `pet.repository.ts:36`,
`prescription.repository.ts:40`). Five endpoints stop shipping `idCardNumber`, `idCardType`,
`address`, `lineId`, `email`, `isActive`, `loyaltyPoints`, `membershipTier`.

**Verified consumer impact: none** (assumption A-8). `/api/owners` and `/api/owners/:id` are
untouched — Owner is the root row there, so the owner-management screens keep every field.

Every other response shape is **byte-identical** before and after, including `findDueSoon` (the
`pet.tenantId` currently selected and then stripped simply stops being selected).

### 4.3 HTTP behaviour — unchanged envelope, unchanged status codes

| Case | Before | After | Requirement |
|---|---|---|---|
| single-resource read, related row cross-tenant | 200 + foreign PII | **404** (root query returns null → existing `NotFoundError`) | E-6, XTI-INV-a |
| list read, some rows cross-tenant | 200, rows present with foreign PII | 200, rows **absent**, `total` consistent | E-7, AC-3 |
| nullable relation genuinely absent | 200, relation `null` | 200, relation `null` — **unchanged** | E-4, AC-7 |
| write with cross-tenant FK | 404 | 404 — unchanged | XTI-5 |

### 4.4 Permissions and error taxonomy — **no change**

- **Permission codes:** none added, none changed, no route guard touched. BA §7 ruled this orthogonal
  to RBAC and I concur — verified against `architecture-rules.md` §4 and the affected routes.
- **Error classes:** none added. Every case maps to an existing class; the cross-tenant case is
  already `Not found / cross-tenant → 404` in `architecture-rules.md` §4.
- **Planes:** unchanged. `/platform/*` carries no `tenantId`; the mechanism must not assume one (E-5,
  handled by the exemption registry, §4.5).

### 4.5 Exemption registry — frozen shape

```ts
// src/backend/config/tenant-relation-exemptions.ts
// (config/, not models/ — models/ holds only *.repository.ts, and this must sit outside
//  the glob the analyzer scans)
export interface TenantRelationExemption {
  file: string; fn: string; relationPath: string; reason: string   // all four required, all non-empty
}
export const TENANT_RELATION_EXEMPTIONS: TenantRelationExemption[] = [
  { file: 'reminder.repository.ts', fn: 'listAllDue', relationPath: 'pet',
    reason: 'E-1: background dispatcher system-context scan, deliberately cross-tenant; every write is ' +
            'pinned to the reminder own tenantId (markSent/claim). Covered by AC-6.' },
  // platform-plane repository reads: no tenantId in the plane by design (E-5) — entries added in W0
]
```

Three rules the scanner enforces on the registry itself:
1. An entry with an empty `reason` **fails the build**.
2. An entry that **no longer matches a real violation** fails the build — stale exemptions must be
   deleted, or the registry rots into a permanent allowlist.
3. Adding an entry is the only way to pass with an unguarded traversal, and it shows up in the diff.

---

## 5. C-4 / E-7 — the pagination bug, resolved by construction

**BA E-7:** post-filtering a `take: N` page returns fewer than N rows, and desynchronises
`findPets`/`countPets` (`pet.service.ts:34-40` runs them as two independent queries).

**Resolution: the bug cannot occur, because nothing is filtered in application memory.** The predicate
is part of the `where` that Postgres evaluates before `LIMIT`. `take: 20` returns 20 rows.

**For `count` to agree, both queries must carry the predicate** — enforced as scanner rule R-4.

**R-4 was too strong in the first draft and is narrowed here.** It previously demanded that a
`findX`/`countX` pair derive its `where` from *the same expression* — a shared builder, not two
literals. That mandated a **code structure** when what the requirement actually needs is a **property**:

> **R-4 (narrowed).** For every relation predicate that R-2 requires in `findX`'s **root `where`**,
> the `countX` in the same file must carry an equivalent predicate in its **own** root `where`.
> Each query is checked against its own resolved `where`. **No shared expression is required.**

Three things follow, and all three are improvements:

1. **`medical-record.repository.ts:10-34` is no longer refactored.** `findByPet` and `countByPet`
   duplicate their `where` as two literals and **each already carries `tenantId`**. Under narrowed
   R-4 they each gain the relation predicate in place and the duplication stays. Forcing them into the
   builder pattern would have been a restructuring with no isolation payoff — and, worse, the first
   draft was mandating the very call-expression shape its own analyzer could not read.
2. **Nested (R-1) predicates are explicitly out of R-4's scope.** A to-many guard lives in the nested
   `where` and does not change the root row set, so it cannot desynchronise a count. Only root-`where`
   predicates — the R-2 dialect — can, and only those are compared.
3. **The five existing builders keep working unchanged.** `pet`/`owner`/`audit`/`invoice`/`product`
   put the predicate in one place and both queries inherit it; the analyzer resolves the builder
   (§6.2.1) and sees the predicate in both. R-4 no longer *requires* that shape — it simply passes
   when it is used, and passes equally when two literals each carry the predicate.

**This also answers "was the hotfix's approach ever the right template?" (grill target 2): no.** It was
the fastest correct answer to one function. Generalised, it is a correctness regression. The design
retires it (§3.2) rather than extending it.

---

## 6. C-5 — the XTI-7 enforcement point, named concretely

### 6.1 Why a conformance test and not a lint rule

`npm run lint` exists (`src/backend/package.json`), ESLint 8.57 + `@typescript-eslint` 8 are installed,
and `.eslintrc.cjs` is present. **And there is no `.github/workflows` directory — this repository has
no CI** (A-7). Nothing in the pipeline runs `npm run lint`. A rule that fails only when a human
chooses to run it is not a mechanical enforcement point; it is a documented convention with extra
steps, and BA said explicitly that a documented convention will be rejected at 3.5.

What *is* gated: the **backend test suite**. @qa-agent must sign off at Step 7, @scribe-agent runs the
red-suite ship gate at Step 8, and a red suite on `main` blocks the next merge (CLAUDE.md). That is
the only fail-closed surface this repository actually has, so the enforcement point goes there.

> **If CI is introduced later,** the same analyzer module is importable by an ESLint rule with no
> redesign. The analyzer is a pure function `(sourceFiles, relationMap) → Violation[]`; the Jest test
> is one caller. That is the upgrade path, and it is not built now.

### 6.2 `src/backend/tests/unit/tenantRelationConformance.test.ts`

Unit tier — **no database, no network** (`architecture-rules.md` §8.1). Pure source analysis.

**Inputs**
1. **Relation map** — derived at runtime from `Prisma.dmmf.datamodel.models`: for every model, every
   relation field, its target, `isList`, and whether the target has `tenantId`. Never hand-written.
2. **Source set** — `src/backend/models/*.repository.ts`, parsed with the `typescript` compiler API
   (already a devDependency, A-6).
3. **Exemption registry** — §4.5.

### 6.2.1 Resolution model — what "the `where`" means when it is not a literal

**This subsection exists because the first draft did not have it, and that was the design's real
defect.** The analyzer was specified over a literal `where`/`include` written directly on the Prisma
call. That is not what the code looks like. Measured on this branch, across all 35 files in
`src/backend/models/`:

| Shape | Sites | Where |
|---|---|---|
| (a) same-module **call expression** — `where: buildWhere(...)` | **10** | `pet` ×2, `owner` ×2, `audit` ×2, `invoice` ×2, `product` ×2 |
| (b) same-module **identifier** — `include: listInclude` | **10** | `pet`, `owner`, `platform-audit` (`SELECT`), `platform-customers` (`TENANT_SELECT` ×4, `ADMIN_USER_SELECT` ×3) |
| (c) **cross-module identifier** | **0 today**; §4.2 introduces 6 (`ownerSummarySelect` ×5, `petSummarySelect`) | all inside `models/` |
| (d) **conditional spread** — `...(x ? { y } : {})` | **57** | 17 files |
| (e) **conditional expression as a value** — `include: { branchInventory: b != null ? {where:{branchId}} : true }` | **2** | `product.repository.ts:57,70` |
| (f) **mutable accumulator** — `const where: Record<string,unknown> = {}` then `where['k'] = …` | **2 fns** (4 call sites) | `invoice.paymentHistoryWhere` (:244, used :272/:282/:284), `platform-audit.listPlatformAuditLogs` (:94) |

A literals-only analyzer exempts (a)–(f) — which includes `pet.repository.ts`'s `findPets` and
`findPetById`, **the flagship T1 files this whole change exists to fix.** An alarm that is switched
off in the room that burned is not an alarm.

**The chosen path is (ii) of the three offered: give the analyzer real resolution, bounded.**
Paths (i) and (iii) are rejected on the record:

- **(i) literals only + exempt the builder-based repos** (`pet`, `owner`, `invoice`, `audit`,
  `product`) — **rejected.** Those five are where the defect lives. This buys a simpler analyzer by
  deleting its coverage of the PII leak it was commissioned to catch.
- **(iii) mandate literal `where`/`include` at guarded sites, inlining the builders** — **rejected**,
  and it is the tempting one. Inlining `buildWhere` duplicates the filter across `findPets`/`countPets`
  and reintroduces the exact list/count drift §5 exists to prevent; inlining `ownerSummarySelect` at
  five sites re-scatters the PII field list that §4.2 consolidates. It would mean **changing working
  production code to suit the checker** — the tail wagging the dog — and it contradicts §4.2 inside
  the same document.

**The resolver — scope, mechanism, and where it stops.** Resolution scope **equals** analysis scope:
the analyzer already parses all 35 files in `models/`, so it builds one flat symbol table over that
set and resolves within it. No TypeScript type-checker, no program-wide module graph, no
`ts.createProgram` — `ts.createSourceFile` per file plus a symbol table keyed `file#name`, which is why
A-6 (zero new dependencies) survives intact.

| Shape | Ruling | Mechanism |
|---|---|---|
| **(a) same-module call expression** | **RESOLVED** | Find the callee's declaration in the same file. Resolve **only** a function whose body ends in a single terminal `return <object literal>`. Verified: **all five builders have exactly this shape** — `pet.repository.ts:9-16`, `owner:10-22`, `audit:45-59`, `invoice:~150-166`, `product.catalogWhere`. Statements before the `return` compute scalar locals only. Anything else (multiple returns, a return that is not an object literal, mutation of the returned object) → **unresolvable**. |
| **(b) same-module identifier** | **RESOLVED** | Module-level `const X = <object literal>`. A `let`, a reassigned binding, or a non-literal initializer → **unresolvable**. |
| **(c) cross-module identifier** | **RESOLVED — only within the source set** | Follow the `import` specifier; if it names a file in `models/*.repository.ts`, resolve the exported declaration by (b). An import from **anywhere else** (`utils/`, `config/`, `@prisma/client`, `types/`) → **unresolvable, fail closed.** This is why §4.2 freezes the two summary selects inside `models/`. |
| **(d) conditional spread** | **ADDITIVE-ONLY — not an obstacle** | A spread adds keys; it cannot delete a sibling literal key. So a guard found literally **passes regardless of any spread**. A spread matters in exactly two cases: the guard is **absent** from the literal keys (→ it might be hiding in the spread → **fail closed**), or an unresolvable spread appears **positionally after** the guard key at the same object level (→ it could override it → **fail closed**). Both are cheap positional checks. This is what turns the 57-occurrence figure from a blocker into a non-event. |
| **(e) conditional expression as a value** | **BOTH BRANCHES CHECKED INDEPENDENTLY** | Each branch is evaluated as its own value; **any branch that fails is a violation.** This is not bookkeeping — it found a live defect: `product.repository.ts:57` and `:70` write `branchInventory: branchId != null ? { where: { branchId } } : true`, and `BranchInventory` **is tenant-scoped** (verified in `schema.prisma`), so the `: true` branch is an unguarded to-many include. A literals-only analyzer never sees it. |
| **(f) mutable accumulator** | **UNRESOLVABLE → FAIL CLOSED** | The genuine limit, and it is narrow: 2 functions. Data-flow analysis over `where['k'] = v` is where the cost curve turns vertical, and it is not being paid. Consequence is named work, not a silent gap — see below. |
| anything else | **UNRESOLVABLE → FAIL CLOSED** | A violation with `file:line`, escapable only by an exemption entry with a reason (§4.5). |

**The fail-closed consequences, named so nobody discovers them mid-wave:**

- `invoice.paymentHistoryWhere` (:244) is shape (f), and `PaymentHistory` **is tenant-scoped**, with
  three to-one traversals at :274-276 (`invoice`, `receivedBy`, `branch`). It will fail R-2. **Fix: the
  `if`-chain is rewritten into the conditional-spread object literal already idiomatic in 17 files** —
  a mechanical change, no behaviour change, and it lands in W1a. Named in §B.
- `platform-audit.listPlatformAuditLogs` (:94) is shape (f), but `PlatformAuditLog` has **no `tenantId`**
  (verified), so R-1/R-2 never fire on it. If its `select: SELECT` reaches a tenant-scoped relation it
  fails closed and takes an **E-5 platform-plane exemption entry** — exactly the placeholder §4.5
  already reserves. Resolved in W1d, not by a rule change.

**Re-costing the analyzer.** The first draft said "~200 lines, one file, one export." With the symbol
table, the bounded resolver, spread positioning and branch-splitting, the honest figure is
**~350 lines** — still one file, still one export, still zero new dependencies, and the exported
signature `(sourceFiles, relationMap) → Violation[]` is **unchanged**, so §6.1's "an ESLint rule can
import this later" upgrade path survives the change. The ~150 added lines are the price of reading the
code this repository actually contains; the alternative was an analyzer that passes by not looking.

**Rules** (evaluated per Prisma call expression — `prisma.<m>.<op>`, `tx.<m>.<op>`, `client.<m>.<op>`,
each argument first put through §6.2.1)

| Rule | Assertion | Covers |
|---|---|---|
| **R-1** | every `include`/`select` key that is a **to-many** relation to a tenant-scoped model has an object value whose `where` contains `tenantId` | reverse includes (§17) |
| **R-2** | every `include`/`select` key that is a **to-one** relation to a tenant-scoped model has a matching relation predicate at the mirrored path in the call's root `where`; for a nullable FK the predicate may sit in an `OR` beside `{ is: null }` | forward includes, E-4 |
| **R-3** | in every `$queryRaw` template in `models/`, each `JOIN <table>` whose table maps to a tenant-scoped model has `"tenantId" =` inside its `ON` clause | raw SQL |
| **R-4** | for every relation predicate R-2 requires in `findX`'s **root `where`**, the `countX` in the same file carries an equivalent predicate in its **own** root `where` — each checked independently, **no shared expression required** (§5) | E-7 / C-4 |
| **R-5** | every exemption entry has a non-empty `reason` and still matches a real violation | registry hygiene |

A violation not covered by an exemption fails the test with `file:line`, the relation path, and the
missing predicate.

**Does an unresolvable `select`/`include` *value* fail closed?** Asked explicitly because §4.2 puts
`ownerSummarySelect`/`petSummarySelect` behind imported identifiers at five T1 sites. The ruling is
**by relation arity, not by keyword**, and it falls out of where each dialect puts its guard:

| Traversal | Guard lives in | Is the value read? | Unresolvable value ⇒ |
|---|---|---|---|
| **to-one** (R-2) | the call's **root `where`** | **No — the key alone decides** | **PASS.** `include: { pet: { select: petSummarySelect } }` is judged on the literal key `pet`; whatever `petSummarySelect` holds is irrelevant to whether a guard exists, because the guard is not in there. |
| **to-many** (R-1) | the value's **nested `where`** | **Yes — the guard is inside it** | **FAIL CLOSED.** No resolvable value, no provable guard. |

**So §4.2's five T1 sites are safe by design, not by exception:** the `pet`/`owner` include *key* stays
literal, R-2 fires on the key, and the guard is checked in the root `where` where it actually is. The
imported select value never needs resolving for the guard decision.

**One residual hole, closed by rule rather than left open.** An opaque value could itself contain a
further relation key — a nested traversal the analyzer cannot see. Two things close it: (1) both
summary selects resolve anyway, because §4.2 keeps them inside the analyzer's own source set, so the
analyzer walks into them and checks what they contain; and (2) **a `select` value that resolves to
anything other than scalar-only keys is a violation** — neither const may ever gain a relation key. A
value that resolves is checked; a value that does not resolve is a violation unless its relation is
to-one. There is no third case where the analyzer looks away.

**R-1 and R-2 walk the same tree in the same pass — the mechanism covers both directions by
construction, not by a second audit.** That is the direct answer to the orchestrator's question 7:
reverse includes need **no** separate file-by-file pass. Any traversal the analyzer can see, it checks.

### 6.3 Proving the detector detects — the deliberately-unguarded fixture

`src/backend/tests/fixtures/tenant-conformance/` (six ~10-line files, outside `models/`, never
imported by the app). The same analyzer runs over them in the same test run:

| Fixture | Content | Asserted result |
|---|---|---|
| `unguarded-forward.fixture.ts` | `prisma.vaccination.findMany({ where: { tenantId }, include: { pet: true } })` | **exactly 1 violation**, rule R-2, relation `pet` |
| `unguarded-reverse.fixture.ts` | `prisma.pet.findFirst({ where: { id, tenantId }, include: { vaccinations: true } })` | **exactly 1 violation**, rule R-1, relation `vaccinations` |
| `guarded-forward.fixture.ts` | the same query with `pet: { is: { tenantId } }` in the `where` | **0 violations** |
| `guarded-reverse.fixture.ts` | the same query with `vaccinations: { where: { tenantId } }` | **0 violations** |
| `guarded-via-builder.fixture.ts` | guarded query whose `where` is `buildWhere(tenantId)` (single terminal `return` of an object literal) **and** whose `include` is an identifier — i.e. shapes (a)+(b) | **0 violations** — proves the resolver **resolves** |
| `unresolvable-accumulator.fixture.ts` | the `product`-style `include: { rel: cond ? {where:{tenantId}} : true }` plus a mutable-accumulator `where` — shapes (e)+(f) | **exactly 2 violations** — proves the resolver **fails closed** rather than passing what it cannot read |

The two guarded fixtures are not decoration: without them a detector that always reports a violation
would pass. **AC-5 is satisfied by this block and by nothing else** — it is the artefact BA asked to
see failing, and it fails on every run, forever, by design.

**The last two fixtures are the new ones, and they are what make §6.2.1 a mechanism rather than a
paragraph.** The resolution model is the part of this design most likely to rot — a Prisma or
TypeScript upgrade moves an AST shape and the resolver quietly starts returning "unresolvable" for
everything, or worse, "resolved, no violation." `guarded-via-builder` fails loudly in the first case;
`unresolvable-accumulator` fails loudly in the second. **A resolver whose own behaviour is not asserted
is a claim, not a check** — and a silently-degraded resolver is precisely the failure mode that put
this document back at Step 3.4.

### 6.4 Honest limits of R-1…R-5 — state these at the grill before someone else does

- **They check spelling, not semantics.** A predicate against the wrong tenant variable passes the
  scanner. The **behavioural** tests (§8.2) are what prove the guard works. Two layers, two questions.
- **They see only `models/*.repository.ts`.** A Prisma call written in a service would be invisible —
  but `architecture-rules.md` §1 already forbids Prisma outside the repository layer, and
  `anemal-coding-rules` is the check for that. This mechanism does not duplicate it.
- **Resolution is bounded, and the boundary is published** (§6.2.1). Same-set identifiers, call
  expressions ending in a single `return <object literal>`, conditional spreads and conditional
  branches are resolved. A **mutable accumulator** (`where['k'] = v`) and any import from outside
  `models/` are **not**, and fail closed. Two functions in the repository are on the wrong side of that
  line today; both are named, and one is scheduled for a mechanical rewrite rather than an exemption.
  The line is drawn where it is because data-flow analysis is where this artefact's cost stops being
  proportionate — not because the shapes beyond it are safe.
- **Fail-closed is load-bearing, and it has a price.** Every unresolvable construct is a red test until
  someone either rewrites it or writes an exemption with a reason. That will occasionally block work
  that was not doing anything wrong. That is the correct direction (risk 2), but it is a real tax and
  it should be named at the grill rather than discovered in W1.
- **R-3 is regex over a template literal**, not a SQL parser. It is sufficient for the join shapes this
  codebase uses and will over-report on an exotic one. Over-reporting is the correct failure direction.

---

## 7. C-6 — the data-integrity alarm (XTI-INV-b)

**Answer to BA: log/metric only. No clinic-user-readable surface. No permission code. No RBAC change.
Nothing comes back to you — except one AC rewording, below.**

**But the requirement's *shape* changes, and I am flagging it rather than quietly complying.**
XTI-INV-b asks for a signal *when the read drops a row*. The design filters in the database, so the
application never sees the corrupt row and cannot log it. Re-introducing visibility would mean
re-introducing the post-filter — trading the E-7 fix for a log line. That trade is wrong.

**Replacement: `src/backend/scripts/tenant-integrity-scan.ts` — proposed, and CONDITIONAL.**

> **This script is not a decided deliverable of this change.** The first draft listed it in §0 as
> committed, which was wrong: its acceptance criterion is the AC-4 rewording at the end of this
> section, and **@ba-agent has not accepted that rewording yet.** The build trigger is therefore:
>
> - **BA accepts the AC-4 reword** → the script is built, in W0, as specified below.
> - **BA declines, or rewords differently** → **the script is not built by this change.** It comes back
>   to @arch-agent for re-scoping, and XTI-INV-b returns to BA as an open requirement. It does **not**
>   get built anyway "because Option A will want it" — Option A is deferred (ADR-0028) and a deferred
>   consumer is not a reason to ship an artefact now.
>
> Its only other customer is ADR-0028's deferred Option A precondition, which is satisfied by *a scan
> report existing*, not by *this change building the scanner* — so ADR-0028 stays coherent either way
> (§A.4). @pm-agent must plan W0 with this artefact behind a gate, not inside the baseline.

Generates, from the same `Prisma.dmmf` relation map, one `SELECT` per tenant-scoped forward relation:

```sql
SELECT c.id, c."tenantId" AS child_tenant, p."tenantId" AS parent_tenant
FROM <child> c JOIN <parent> p ON p.id = c."<fk>"
WHERE c."tenantId" IS DISTINCT FROM p."tenantId"
```

Output: relation pair, row id, both tenant ids. **No PII column is ever selected** — the query lists
ids only, which satisfies XTI-INV-b's "no PII in the log" clause structurally rather than by
discipline. Exposed as `npm run db:integrity-scan`, for operators, on demand and after any seed,
backfill or restore.

**Why this is better than a read-time log, not merely a substitute:**
- It finds **every** corrupt row, not only the ones somebody happened to read.
- It happens to be **the same artefact Option A will need** to prove zero violations before a
  constraint can be added (§A, C-3a). Stated as a fact about the artefact, **not as a justification for
  building it now** — a deferred consumer does not earn present-tense code, and the build trigger stays
  the AC-4 gate above.
- It costs nothing on the request path.

**A consequence nobody has stated yet, and it belongs in the grill.** After this change, a corrupt row
stops leaking — and also **becomes invisible to its own tenant**. A vaccination legitimately owned by
clinic A, whose `petId` points at clinic B's pet, disappears from A's list rather than showing B's pet
name. Today it is visible and wrong; afterwards it is absent and silent. The read-side guard protects
**confidentiality**; it does nothing for **integrity**, and it makes an integrity fault harder to
notice. That is precisely why the scan is not optional and why Option A is not cancelled, only deferred.

**Required of @ba-agent (the only thing coming back — and it is a GATE, not a note):** AC-4 currently
reads *"when the read executes, then a data-integrity signal is emitted."* It should read: *"when
`npm run db:integrity-scan` is run against a database containing the fixture, it reports the corrupt
row by table and id, and emits no PII field value."* Falsifiable, and true of the design as built.

**Until BA answers, the script's status is undecided and §0 marks it so.** This is the one place where
this design asks for something it cannot settle itself: I can rule that the *signal* moves from
read-time to scan-time (that is an architecture call, and §7 makes it), but I cannot rewrite an
acceptance criterion on BA's behalf and then build against my own rewrite. @pm-agent should carry the
answer into Step 4 as a precondition on the W0 scope, and the question belongs on the `/grill-with-docs`
agenda at Step 3.5 if it is still open then.

---

## 8. Transaction & error boundary

### 8.1 Read side

No transactions. Every guarded read is a **single query** — the predicate is evaluated inside it, so
the check and the fetch are atomic by definition. This is strictly stronger than the post-filter,
where the foreign row was materialised in application memory before being discarded.

### 8.2 Write side (XTI-5) — the check is atomic with the write

`architecture-rules.md` §5: *the service opens the transaction; never a repository.* The codebase
already deviates — `hospitalization.admit`, `grooming.createBooking`, `reminder.create`,
`medicalRecord.createRecord` and `invoice.createInvoiceTx` each open their own. **This change does not
restructure transaction ownership.** Ruling:

| Path | Today | After | §5 |
|---|---|---|---|
| hospitalization · grooming · reminder · medicalRecord · invoice | repo opens tx, check inside it — **already atomic** | unchanged | grandfathered deviation → **backlog B-6**, Lane D + ADR |
| `appointment.createAppointment` / `createWalkIn` | check in `appointment.service.ts:66,85`, **outside** the write | service opens `prisma.$transaction`, passes `tx` to both check and write | **conforms** |
| `pet.createPet` | `findOwner` at `pet.service.ts:53-54`, outside `createWithQuotaLock`'s tx | `findOwner` moves **inside** the `createWithQuotaLock` callback, using its `tx` | **conforms** |
| `bloodBank.registerDonor` | check in `blood-bank.service.ts:43`, outside the write | service opens tx, passes `tx` to both | **conforms** |

Rolling the deviation back is a behaviour-preserving refactor of five files with no isolation payoff —
Lane D work, and absorbing it here is exactly the scope bloat the gate exists to catch. Naming it as
B-6 is the conforming move; silently extending it is not.

**B-3 (`blood-bank.repository.ts:15-17` `createDonor` has no guard of its own).** Resolved by
**locating the guard with whoever owns the transaction**, not by adding a second guard. Double-guarding
is how eleven inconsistent checks accumulate. The standing prober (§9) is what guarantees the guard
exists at all — it tests the route, and is indifferent to which layer holds it.

### 8.3 Error boundary

No new error class (§4.4). `NotFoundError` → 404 for both the read and write cross-tenant cases,
matching `architecture-rules.md` §4 and `anemal-db-context` (404, never 403, never confirming
existence).

---

## 9. Test strategy

| Tier | Artefact | Count | Question it answers |
|---|---|---|---|
| **Unit, no DB** | `tenantRelationConformance.test.ts` + 6 fixtures (§6) | 1 file | *Is every traversal in the repo spelled with a guard — including ones written tomorrow?* **and** *is the resolver still resolving, and still failing closed?* (§6.3) |
| **Integration, corrupt-row fixture** | one per representative shape, recipe proven by `vaccinationDueSoonTenantLeak.test.ts` | **9** | *Does the guard actually work?* |
| **Integration, standing prober** | `crossTenantFkWritePathRepro.test.ts`, **converted** | 1 file | *Can any write path still create the corrupt row?* |
| **Regression** | `listAllDue` (AC-6) + full suite green (AC-9) | existing | *Did we break the dispatcher?* |

**The nine behavioural tests — and why not 57.** The scanner covers all 57 sites structurally; a
behavioural test is needed only once per *shape*, because the shapes are what can be got wrong:

1. T1 forward, 1 level — `pet.repository.findPetById` (AC-1, AC-2, AC-8)
2. T1 forward, 2 levels — `prescription.findPrescriptionWithDetails` (AC-1)
3. T1 inside a write tx — `invoice.claimInvoicePaid` (AC-1)
4. Raw SQL, both variants — `vaccination.findDueSoonWorklist` (AC-1, XTI-2)
5. Paginated list, `take`+`count` — `pet.findPets`/`countPets` (**AC-3**, E-7)
6. Reverse include — `pet.findPetById` → `vaccinations` (AC-1, §17)
7. Reverse include, 2nd instance — `medical-record.findById` → `attachments` (AC-1, §17)
8. Nullable FK preserved — retail invoice, `petId = NULL` (**AC-7**, E-4)
9. Non-PII T4 — `medical-record.findByPet` → `doctor` / `prescriptions.drug` (AC-1, XTI-4)

**Converting the write-path prober (XTI-5 + AC-5's write half).** QA's `crossTenantFkWritePathRepro.test.ts`
is today a one-off 38-probe reproduction: it proves nothing about route #39. It becomes standing by
adding **registry parity**:

- walk the Express route table with the existing `tests/helpers/expressRouteWalker.ts`;
- assert every `POST`/`PUT`/`PATCH` route appears in a `writePathFkMap` registry (a new route with no
  entry → **fail**);
- for every entry declaring a tenant-scoped FK body field, run the existing paired-control probe
  (attacker's own id = positive control, victim's id = must be BLOCKED).

A new unguarded write route fails on the parity assertion before anyone writes its probe. That is
fail-closed on novelty, it reuses a helper that already exists, and it converts a throwaway artefact
into the permanent one rather than adding a twelfth thing.

**Isolation tests** are mandatory per `architecture-rules.md` §8.2 and `anemal-db-context`; items 1-9
plus the prober discharge that for everything this change touches.

---

## 10. Risks & the highest-maintenance spot

| # | Risk | Mitigation |
|---|---|---|
| 1 | **The AST analyzer is the most expensive thing here to maintain**, and §6.2.1's resolver made it more so. A Prisma major upgrade can move `dmmf`; TS AST shapes drift; and a degraded resolver could fail open. | Accepted, deliberately, and now **~350 lines** rather than ~200 (re-costed in §6.2.1) — one file, one export, unchanged signature, zero new dependencies. It is the only artefact that makes the property hold for code not yet written and it has zero runtime cost. Its own correctness is re-proved by **six** fixtures on every run, two of which (`guarded-via-builder`, `unresolvable-accumulator`) exist specifically to catch a resolver that has silently stopped resolving or stopped failing closed. A broken analyzer fails loudly. |
| 1b | **The resolver's boundary is where this design is most likely to be wrong.** It resolves same-set identifiers and single-return builders and refuses mutable accumulators — a line drawn on cost, not on safety. | Published in full (§6.2.1) instead of left implicit, which is the specific failure that sent the first draft back. Everything past the line fails closed, so being wrong about the boundary costs a false positive, never a missed leak. The two functions currently on the wrong side are named, and neither is silently exempted. |
| 2 | Analyzer false positives block unrelated work | Over-reporting is the safe direction; the escape hatch is a registry entry with a reason, visible in the diff and deleted automatically when stale (R-5). |
| 3 | A worker changes a repository signature mid-wave and breaks a parallel worker | §4.1 freezes the list. Any addition stops the wave and comes back here. |
| 4 | A relation predicate is added to `findX` but not `countX` | R-4, **narrowed** (§5): each query must carry the predicate in its own root `where`; no shared builder is imposed. `medical-record.findByPet`/`countByPet` satisfy it by each gaining the predicate in place — **no refactor**. |
| 5 | NFR-01 (`searchPets` < 500 ms) regresses | `owners` is indexed `@@index([tenantId])` and `@@index([tenantId, phone])` (BA §10) so the added predicate is index-aligned, and the join is `EXISTS` on an indexed column. **Measure `searchPets` in W2 rather than assume** — BA named it as the one to check. |
| 6 | Ponytail reads 20 files as scope bloat | §0 is written for that reading: one rule, zero abstractions, two test files, one script, and a pattern **deleted**. |
| 7 | Someone re-raises composite FKs a fourth time | ADR-0028 records the ruling with its precondition and its successor initiative. |

---

## 11. Self-review (`architecture-rules.md` §9)

1. **Simpler alternative?** Four were considered and rejected — a Prisma client extension that
   auto-injects predicates (§A, Option C′), a lint rule (§6.1), a literals-only analyzer that exempts
   the five builder-based repositories (§6.2.1 path (i)), and inlining the builders so every guarded
   site is literal (§6.2.1 path (iii)). The last two are simpler *artefacts* that buy simplicity by
   either not checking the files holding the defect, or by changing working production code to suit the
   checker. Nothing simpler covers code not yet written.
2. **Abstraction with no second implementation?** None. No interface, no abstract class, no factory.
   The only shared constants are two `select` literals and one exemption array.
3. **Pattern with no named problem?** No pattern from the whitelist is used. Nothing to justify.
4. **Business logic in a controller / repository / hook?** No. A tenant predicate is a data-access
   concern and lives in the repository, which is where every Prisma call already lives.
5. **Core logic testable without infrastructure?** Yes — the analyzer is a pure function over source
   text and the DMMF, tested with no DB.
6. **Most expensive spot to maintain?** The analyzer. Named, justified, bounded (risk 1).
7. **Does anything weaken tenant isolation, plane separation, or deny-by-default?** No — every change
   is strictly stricter. Plane separation is untouched; the platform plane is exempted by name, not by
   accident. Deny-by-default is extended from *routes* to *relations*.

---

# §A. Option comparison (BA §8) and the C-3 answers

## A.1 The decision

> **Option D, in BA's own formulation: Option C is implemented now; Option A is decided now and
> deferred with a named precondition and a named successor. Option B (RLS) stays out.**
>
> **Only one mechanism is being built.** The Option A half of D is a *recorded ruling*, not code — so
> the "two mechanisms for one property" objection does not apply to this change's diff.

**Pre-answering BA's Ponytail warning (§8 Option D, Risk #1) — what each half does that the other cannot:**

| | Option C (built now) | Option A (deferred) |
|---|---|---|
| Stops the corrupt row being **returned** | **Yes** | No |
| Stops the corrupt row **existing** | No | **Yes** |
| Survives a restore from backup, a manual SQL correction, a `NOT VALID` constraint | **Yes** — it re-checks on every read | No — those are exactly how the state returns |
| Protects **confidentiality** | **Yes** | Indirectly |
| Protects **integrity** (right record attached to the right patient) | **No** — it hides the fault | **Yes** |
| Needs a live-data migration and a business decision first | No | **Yes** |

They are not redundant: C is a confidentiality control, A is an integrity control, and §7 shows C
actually makes integrity faults *harder to see*. BA already ruled (§8, closing paragraph) that the
read-side guard stays even if A ships. Given that, C is on the critical path and A is not — which
settles the sequence without needing both now.

## A.2 Options as evaluated

**Option B — Postgres RLS. Out of scope, per BA §8. Not designed around, and nothing here would have
to be undone if it ships later:** the guards are ordinary `WHERE` predicates, which RLS composes with
rather than contradicts.

**Option C′ (my own candidate, considered and rejected) — a Prisma client extension that walks every
query's args and auto-injects tenant predicates.** Genuinely attractive: fully by-construction, covers
both directions, nothing to forget. **Rejected** because it is application-layer RLS and inherits RLS's
worst property — BA's decisive argument against B was that a mechanism which can *silently return zero
rows* must not be coupled to a PII fix. An auto-injector has that failure mode across **every model and
every query**, not just the twenty files with a known defect. It is also implicit where a security
predicate should be legible, and it would be the thing that has to be undone if real RLS arrives.

**Option C (chosen) — explicit predicate at each traversal + mechanical enforcement.** Blast radius is
exactly the sites touched; every guard is legible in the diff; the failure mode of a mistake is a red
test, not a silently empty screen.

## A.3 C-3 — the four Option A rulings (answers, not proposals)

### (a) What if the migration finds existing cross-tenant violations?

**This is a business decision and I am escalating it, not deciding it** — consistent with BA §8 and
Risk #4. What architecture *can* settle, and does:

1. **It is answerable rather than hypothetical** — the scan described in §7 produces the exact list, so
   the question stops being "what if" and becomes a report. **Who builds that scan is conditional**
   (§7's AC-4 gate): this change if BA accepts the rewording, otherwise Option A's own first task.
   Either way the question is answered by evidence before anyone acts on it, which is the part that
   matters here.
2. **The decision menu is three options, and each has a different owner:** *quarantine* (null the FK,
   retain the row — @db-agent), *reassign* (correct the FK to a row in the right tenant — clinic staff,
   per row, since only they know the true patient), *delete* (@db-agent + clinic consent). Reassign is
   the only one that preserves clinical truth and the only one the platform cannot do unilaterally.
3. **The default if no decision is taken: nothing happens, and that is safe.** Option A is not applied,
   the rows stay, and the read-side guard already makes them invisible. **This is the load-bearing
   consequence of sequencing C first:** the business decision stops being a blocker on a PII fix and
   becomes a scheduled data-quality task.
4. **`NOT VALID` is ruled out as a shortcut.** Adding the constraint `NOT VALID` to dodge the decision
   leaves every existing violation in place and unenforced while presenting as a fixed schema — the
   exact false-safety failure of F-1, in DDL.

**→ Escalation for the human at 3.5:** *if the scan finds violations in production, who reassigns them,
and is that work inside this change or its own?* The architecture's position is **outside** — it is
per-row clinical judgement, not engineering.

### (b) Which of the 70 relations are in scope?

BA's 70 is the count of `@relation(fields:)` declarations, including relations to `Tenant`, `Plan`,
`Permission` and other non-tenant-scoped models, where a composite tenant FK is meaningless. Measured
against `schema.prisma` on this branch:

| Set | Count |
|---|---|
| tenant-scoped models (have a `tenantId` column) | **35** of 43 |
| forward to-one `@relation(fields:)` where **both** sides are tenant-scoped — Option A's candidate set | **39** |
| …of those, blocked by a nullable parent `tenantId` (see (c)) | **3** |
| **Option A's feasible set** | **36** |
| parent models needing a new `@@unique([tenantId, id])` | **11** (Pet, Owner, User, Branch, MedicalRecord, Appointment, Invoice, InventoryItem, Hospitalization, BloodDonor, ClinicRole) |
| reverse to-many traversals to tenant-scoped models (Option A does **not** address these; only Option C does) | **68** |

Two consequences worth stating plainly:

- **Option A covers 36 of 107 tenant-relevant traversals.** It removes the *cause* for the forward
  direction only. The reverse direction — which QA proved leaks (§17) — is reachable only by Option C.
  **A is not a superset of C, and could never have replaced it.**
- The 11 new unique indexes are redundant with each table's primary key and exist purely to make the
  composite FK declarable. That is 11 extra B-trees on the hottest tables, a real and permanent write
  cost, which belongs in A's own cost/benefit rather than being discovered during its migration.

### (c) The `tenantId = NULL` parent limitation

Exactly **three** tenant-scoped models declare `tenantId Int?` (nullable): **`SettingsAuditLog`,
`ClinicRole`, `RefreshToken`.**

`ClinicRole` is the B-4 case from 2026-08-27, and the reason is now explicit: **system roles are stored
with `tenantId = NULL`** — visible in the test fixtures as
`prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })`. A composite FK
`(tenantId, roleId) → clinic_roles(tenantId, id)` cannot match a NULL-tenant system role. Three of the
39 candidates are blocked by this: **`User.roleRef`, `UserRole.role`, `ClinicRole.sourceRole`.**

A fourth case is subtler and must not be missed: `SettingsAuditLog.changedByUser → User` has a
**nullable `tenantId` on the child**. Under SQL `MATCH SIMPLE` (Postgres' default), a composite FK with
any NULL column is **satisfied vacuously** — the constraint would exist and enforce nothing for exactly
the rows where tenancy is undefined. A constraint that silently does not apply is worse than no
constraint, because it reads as protection. **Ruling: `SettingsAuditLog` is excluded from Option A, and
the exclusion must be written into the DDL comment, not left implicit.**

**B-4 is hereby answered for the third and last time, in ADR-0028.**

### (d) The R3-F1 `onDelete` collision

**Ruling: Option A must not ship before R3-F1, and when it ships it must carry R3-F1's `onDelete`
decision in the same constraint definitions.**

Reason: altering an FK is `DROP CONSTRAINT` + `ADD CONSTRAINT`, which takes a
`SHARE ROW EXCLUSIVE` lock and re-validates the whole child table. Doing that twice on `pets`,
`invoices` and `medical_records` — once for the composite key and once for `onDelete` — is two lock
windows on the hottest tables for one outcome. **R3-F1 is therefore promoted from "adjacent backlog" to
a precondition of Option A**, and ADR-0028 records it as such. This change touches neither, so nothing
is absorbed here — only sequenced.

## A.4 Option A's recorded verdict

**DEFERRED, conditionally, with the successor named.** Preconditions, in order:

1. **A scan report exists** for production data — i.e. cross-tenant rows have been counted, not
   guessed. The precondition is the *report*, not this change's authorship of the scanner: if §7's
   AC-4 gate resolves yes, this change ships `npm run db:integrity-scan` and the report is cheap; if it
   resolves no, producing the report becomes Option A's own first task. **ADR-0028's deferral holds
   either way** — nothing in the Option A ruling depends on who builds the scanner.
2. If violations exist → the business decision of A.3(a), owner: human + @db-agent.
3. R3-F1's `onDelete` decision is made → A.3(d).
4. Then Option A runs as **its own Lane A**, scoped to the 36 feasible pairs + 11 unique indexes, with
   @db-agent holding the veto and the scan output as its input artefact.

**The read-side guard stays regardless** — BA §8 ruled it and I concur: a restore from backup, a manual
correction, or a `NOT VALID` constraint each reintroduce the state A prevents.

Recorded in **`docs/adr/0028-composite-tenant-foreign-keys-deferred.md`** so it is not re-litigated.

---

# §B. Implementation order & work partition (input to @pm-agent, Step 4)

Files are disjoint per worker within a wave. **Wave boundaries are integration checkpoints.**

| Wave | Worker | Exclusive file scope | Exit criterion |
|---|---|---|---|
| **W0** | Dev A (serial — nothing else may start) | `tests/unit/tenantRelationConformance.test.ts` (incl. the §6.2.1 resolver), `tests/fixtures/tenant-conformance/*`, `config/tenant-relation-exemptions.ts`, the two `*SummarySelect` consts in `owner`/`pet.repository.ts` (§4.2 — declared here because four W1 workers share them, and because the analyzer's symbol table must see them before W1 runs), `models/vaccination.repository.ts:25-30` (**F-1 comment, C-2**). **`scripts/tenant-integrity-scan.ts` is NOT in this scope unless the §7 AC-4 gate has resolved yes by Step 4** | analyzer runs; **6** fixtures assert as specified (incl. resolver resolves / resolver fails closed); it reports the **current** violation list across `models/` (that list is W1's work order) |
| **W0** | @scribe-agent | `.claude/roadmap/index.md` PR #73 row (**C-2**) | the false "guarded" claim is corrected in the record as well as the code |
| **W1a** | Dev A | `pet` · `appointment` · `invoice` · `prescription` repositories (**T1, XTI-1**) + `invoice.repository.ts:218` branch-scope drift (**F-4**) + **rewrite `invoice.paymentHistoryWhere` (:244) from a mutable accumulator into the conditional-spread object literal** so it resolves (§6.2.1 shape (f)) — mechanical, no behaviour change | analyzer: 0 violations in these files |
| **W1b** | Dev B | `vaccination.repository.ts` (**XTI-2** raw SQL, both variants) + `findDueSoon` post-filter **deleted** (§3.2) | analyzer: 0 violations; `vaccination-worklist.test.ts` still green |
| **W1c** | Dev C | `search` · `medical-record` · `hospitalization` · `owner` repositories (**XTI-3**). **`medical-record` `findByPet`/`countByPet` each gain the predicate in their own `where` — the shared-builder refactor is CANCELLED** (narrowed R-4, §5) | analyzer: 0 violations |
| **W1d** | Dev D | `reminder` · `blood-bank` · `grooming` · `transfer` · `product` · `user` · `role` · `auth` · `usage` · `report` · `tenant-settings` repositories (**XTI-4**, T3/T4) + exemption entries for the platform-plane files. **Includes `product.repository.ts:57,70` — the `branchInventory: cond ? {where:{branchId}} : true` ternary whose `: true` branch is an unguarded to-many include on a tenant-scoped model** (§6.2.1 shape (e)) | analyzer: 0 violations; every exemption carries a reason |
| **W2** | Dev A | `appointment.service.ts` · `pet.service.ts` · `blood-bank.service.ts` (**XTI-5** — move 4 checks into their write transaction, §8.2) | the three writes are atomic with their checks |
| **W2** | @qa-agent | the 9 behavioural tests (§9) + convert `crossTenantFkWritePathRepro.test.ts` to the standing prober | AC-1…AC-3, AC-6…AC-8 green; parity assertion live |
| **W2** | Dev B | measure `searchPets` latency against NFR-01 (risk 5) | measured, not assumed |
| **W2** | @db-agent | review every changed query for isolation; run `db:integrity-scan` against the test DB **if that script was in scope** (§7 gate) | **veto point** — not overrulable |

**F-1's comment correction is in W0, not W2** (BA §11): a shipped comment telling engineers a
vulnerable function is safe is itself the defect, and it must not survive another reading.

**Why W0 is serial:** the analyzer *defines* what "guarded" means. Four workers guessing at the
spelling before the checker exists is how eleven inconsistent guards were written the first time.

---

# §C. Handback

| Condition | Status |
|---|---|
| **C-2** false comment + roadmap record | routed — W0, Dev A + @scribe-agent |
| **C-3** Option A preconditions (a)(b)(c)(d) | **answered**, §A.3, recorded in ADR-0028 |
| **C-4** E-7 pagination | **resolved by construction**, §5; post-filter retired, **narrowed** R-4 enforces count parity without mandating a shared builder |
| **C-5** XTI-7 enforcement named + shown failing | **answered**, §6; **six** fixtures, §6.3; resolution model published in §6.2.1 |
| **C-6** integrity signal RBAC exposure | **log/metric/operator-script only — no permission code, no RBAC change.** The operator script itself is **CONDITIONAL** on the AC-4 rewording, which is **still open with @ba-agent**, §7 |
| Reverse includes (§17) | **covered by construction** — R-1 and R-2 walk the same tree; **no separate audit pass needed**, §6.2 |
| T3/T4 not narrowed | confirmed — W1d carries them; BA §5's uniform ruling accepted without argument |
| RLS | not designed around; nothing here is undone if it ships, §A.2 |

**New backlog raised by this design:**

- **B-6 — five repositories open their own transaction**, deviating from `architecture-rules.md` §5
  (`hospitalization.admit`, `grooming.createBooking`, `reminder.create`, `medicalRecord.createRecord`,
  `invoice.createInvoiceTx`). Grandfathered here; a Lane D refactor + ADR, not this change.
- **B-7 — R3-F1 is promoted to a precondition of Option A**, not merely adjacent to it (§A.3d).
- **B-5 (BA's) is acknowledged and not solved.** Services return Prisma rows unmodified, so any
  relation added to an `include` becomes public API immediately. `ownerSummarySelect` narrows the
  worst instance; the structural answer is a response-shaping layer, which is a bigger change than
  this requirement justifies. It stays on the backlog, unabsorbed.

**Four things I want attacked at `/grill-with-docs` (§3.5), beyond BA's five:**

0. **The resolver boundary** (§6.2.1). It resolves same-set identifiers and single-return builders, and
   fails closed on mutable accumulators. That line is drawn on **cost**, not on safety. Is ~150 extra
   lines of AST resolution the right purchase — or is the honest answer that a checker which cannot read
   two of its own repository's functions should have forced those two functions to change instead?
   (I chose to change one of them and exempt nothing; argue the other way.)

1. **The scanner checks spelling, not semantics** (§6.4). Is "a guard is present" plus nine
   behavioural tests genuinely enough, or does a wrong-variable guard slip through in a year?
2. **The invisible-row consequence** (§7). We are making a corrupt row vanish from its rightful
   owner's screen. Is an on-demand operator script sufficient, or does a clinic need to be *told*?
3. **The write-path prober's registry parity** (§9). It fails closed on a new *route*. It does not fail
   closed on a new *body field* added to an existing route. Is that gap acceptable?

---

*@arch-agent — Step 3.4 **rev 2** complete (rework after BLOCK; 5 fixes applied, scope unchanged).
Decision: **Option D — C built now, A ruled on and deferred, B out**. One artefact
(`tenant-integrity-scan.ts`) is now **conditional on a BA answer**, not committed.
Next: @ponytail-agent, mode `arch-precheck` (Step 3.4b) — re-review scoped to §3.3, §5, §6.2.1,
§6.2's rule table, §6.3, §7 and ADR-0027's enforcement paragraph.*
