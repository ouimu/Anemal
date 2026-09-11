# Cross-Tenant Relation Isolation — BA Sign-off (Lane A, Steps 1 + 3)

**Feature slug:** `cross-tenant-relation-isolation`
**Author:** @ba-agent
**Date:** 2026-09-10
**Precedes:** @arch-agent (Step 3.4) → @ponytail-agent `arch-precheck` (3.4b) → `/grill-with-docs` (3.5)
**Origin:** open hotfix debt, `.claude/roadmap/index.md` row `2026-09-10` (PR #73, Lane C) — the
Lane B repo audit half is now complete; this document is the Lane A half.
**Skills applied:** `anemal-ba-toolkit`, `anemal-rbac-matrix`, `anemal-db-context`,
`anemal-functional-reqs`

---

# VERDICT: **REQUIREMENT VALIDATED — proceed to Step 3.4, with 7 conditions**

The systemic finding is **real and correctly characterised**: no composite FK exists anywhere in the
schema, and 11 repository files return related tenant-scoped rows without re-checking the related
row's own `tenantId`. That is a genuine structural defect, not 11 coincidences.

Three things in the inherited brief are **wrong or unproven** and are corrected in §3:

1. **A shipped comment and a merged commit message both assert that `findDueSoonWorklist` has
   "explicit tenantId join guards." It does not.** The hotfix that closed the `findDueSoon` leak
   justified its own approach by pointing at a sibling function that is itself unguarded — in the
   same file, exposing a *superset* of the same PII. A false safety claim in shipped code is worse
   than an unfixed function, because it stops the next engineer looking.
2. **The severity ordering is inverted.** Five call sites use bare `owner: true`, which returns the
   **entire** `Owner` row — including `idCardNumber` (Thai national ID / passport) and `address`.
   The function that was hotfixed as an emergency leaked *strictly less* (name + phone) than five
   functions that were left alone.
3. **"Latent, not reachable through the app's own write path" was inherited, not verified.** I
   verified it: it holds **today**, on every path I traced. But it holds by *convention* — 11
   hand-written checks scattered across 5 files, placed inconsistently, with no constraint, no lint
   rule and no test enforcing them. It is one forgotten line away from being false, and the whole
   "no urgency" framing rests on it.

**Objective this work serves:** *no API response may include data from a tenant-scoped row whose own
`tenantId` differs from the request's `tenantId` — regardless of how that row was reached.* Every
ruling below is measured against that sentence.

**Recommendation on sequencing: one coordinated Lane A change, not a high-severity fast-follow.**
Reasoning in §11. This recommendation is conditional on C-1 and flips to Lane C immediately if C-1
finds an app-reachable write path.

---

## 0. What this document is and is not

This is a **merged Step 1 + Step 3 artefact**. There is no `/superpowers:brainstorm` output for this
work — it arrived as hotfix debt, not as a feature request. Consequences:

- The scope in §2 has **not yet been human-approved**. Step 1's `⛔ human approves before any plan or
  code` gate is **open**. @arch-agent may design against §2, but nothing may be planned or built
  until a human ratifies the scope line.
- I am answering **WHAT and WHO**. Class design, helper shape, pattern choice, transaction
  boundaries and layering are @arch-agent's at 3.4. §8 gives arch the option space and rules on
  which options are *out of scope for requirements reasons* — it does not pick one.

---

## 1. Evidence base

Everything below was read from source on this branch. Nothing is inherited from the brief.

| Source | Read | What it establishes |
|---|---|---|
| `src/backend/prisma/schema.prisma` | full scan + `model Owner` | 70 `@relation(fields:…)`, **0** with `tenantId` in `references:[]`. Owner's real column list. |
| `src/backend/models/vaccination.repository.ts` | full (119 L) | The false comment (L25-30); `findDueSoonWorklist` unguarded joins (L75, L88-89, L113-114) |
| `src/backend/models/appointment.repository.ts` | `findInRange` L7-21, `findById` L85-97 | `owner: true` at L93 |
| `src/backend/models/pet.repository.ts` | L7, L18-47, L49-56 | `listInclude` L7; `owner: true` L36; `findOwner` FK guard L49-50 |
| `src/backend/models/prescription.repository.ts` | `findPrescriptionWithDetails` L34-44 | 2-level `owner: true` at L40 |
| `src/backend/models/invoice.repository.ts` | L34, L59-62, L137-149, L198-221 | `owner: true` L146 + L218; named "CR-01 Cross-tenant FK guard" L59-62; branch-scope drift L218 |
| `src/backend/models/medical-record.repository.ts` | L10-25, L37-45, L82-103 | owner PII L45; write-path guards L84-90 |
| `src/backend/models/search.repository.ts` | L5-27 | owner PII L16 |
| `src/backend/models/hospitalization.repository.ts` | L9, L31-70 | `petSelect` L9; **exemplary counter-pattern comment L39-46** |
| `src/backend/models/reminder.repository.ts` | L6, L10-48 | `petSel` L6; intentional cross-tenant `listAllDue` L41-48 |
| `src/backend/models/blood-bank.repository.ts` | L5-30 | `petSel` L5; **`createDonor` L15-17 has no FK guard of its own** |
| `src/backend/models/grooming.repository.ts` | L6, L10-41 | `petSel` L6; write guard L12-13 |
| `src/backend/models/product.repository.ts` | L230-270 | **Correct raw-SQL reference pattern** + the R2-HI-02 rationale comment |
| `src/backend/services/*.ts` | pet, search, invoice, appointment, hosp, grooming, reminder, blood-bank | Services pass repository rows through unmodified; only `search.service` projects |
| `src/backend/routes/*.routes.ts` | hosp, grooming, blood-bank, search | Actual permission guards on the affected reads |
| `.claude/specs/database-schema.sql` | §10, L561-688 | RLS is **NOT DEPLOYED** + its three named preconditions |
| `.claude/skills/anemal-rbac-matrix/SKILL.md` | L43-45 | The governing sentence for §7 |
| `.claude/skills/anemal-db-context/SKILL.md` | L16, L36, L63-70 | Tenant-filter rule, 404-not-403, mandatory isolation test |
| `docs/superpowers/plans/2026-08-27-role-service-tenant-scope-ba-signoff.md` | §7 | **B-4 raised this same schema question on 2026-08-27** |
| `git show 1add331` | full | The commit message repeats the false claim |

---

## 2. Scope (pending human approval)

**In scope**

- Every repository read that returns a tenant-scoped related row reached through a **forward
  (child → parent) FK**: Prisma `include` / nested `select`, and raw-SQL `JOIN`.
- The **invariant** (§5), and a mechanism that makes it hold for code not yet written.
- The **write-side** convention that currently prevents the corrupt row (§4.3) — because the read-side
  guard and the write-side guard are two halves of one property, and today neither is enforced.
- Correcting the false safety claim in `vaccination.repository.ts` L25-30 and in the PR #73 record.

**Out of scope**

- Deploying Postgres RLS (§8, Option B) — ruled out as a *requirements* matter, not a technical one.
- Branch-level (`branchId`) isolation of related rows. Same defect class, materially larger surface,
  and `branchId` is nullable by design (`NULL`-branch pets appear in every branch list —
  `blood-bank.repository.ts:19-22`, `permission-matrix.md:108-114`). **Backlog B-2.**
- `onDelete` FK drift (existing backlog `R3-F1`) — adjacent, touches the same DDL, but a distinct
  objective. Arch should note the collision (§13), not absorb it.
- The platform plane. `/platform/*` carries no `tenant_id` and touches no PII; nothing here changes it.

---

## 3. Corrections to the inherited brief

### F-1 (must-fix, blocking) — a shipped comment asserts a vulnerable function is safe

`vaccination.repository.ts:25-30`, and verbatim in merged commit `1add331`:

> *"…same defense-in-depth as the explicit tenantId join guards in `findDueSoonWorklist`."*

`findDueSoonWorklist` (L61-118) has **no tenant predicate on any join**:

```
L75:      JOIN pets p ON p.id = v."petId"            -- no AND p."tenantId" = ${tenantId}
L88-89:   JOIN pets p ON p.id = r."petId"
          JOIN owners o ON o.id = p."ownerId"        -- no AND o."tenantId" = ${tenantId}
L113-114: (same pair, branchless variant)
```

`WorklistRow` (L47-57) returns `petName`, `species`, `breed`, `ownerName`, `ownerPhone` — a
**superset** of what `findDueSoon` leaked. Two aggravating details:

1. The branch variant's filter is `(p."branchId" = ${branchId} OR p."branchId" IS NULL)` (L79). A
   cross-tenant pet with `branchId = NULL` surfaces in **every** branch's worklist.
2. `product.repository.ts:242/254/266` already carries the correct pattern *with a comment explaining
   exactly this failure mode* (R2-HI-02). The knowledge existed in-repo and was not applied.

**Impact:** the audit had to actively disbelieve a shipped comment to find this. Until it is
corrected, every future reader is told the vulnerable function is the safe reference.

**Required (C-2):** correct the comment and the roadmap record in the same change that fixes the
function. Do not fix the code and leave the claim standing.

### F-2 (must-fix) — severity is inverted; `owner: true` is the real T1

`owner: true` is not "owner name and phone." From `model Owner` (schema.prisma):

```
firstName · lastName · phone · email · lineId · address ·
idCardType · idCardNumber · isActive · loyaltyPoints · membershipTier
```

`idCardNumber` is a Thai national ID or passport number (`@@unique([tenantId, idCardNumber])`).
`address` is a home address. Five call sites return this whole row for a related pet's owner:

| Site | Reached via | Response path |
|---|---|---|
| `appointment.repository.ts:93` (`findById`) | `appointment.pet.owner` | `appointment.service.ts:60` → returned as-is |
| `pet.repository.ts:36` (`findPetById`) | `pet.owner` | `pet.service.ts:44-46` → returned as-is |
| `prescription.repository.ts:40` (`findPrescriptionWithDetails`) | `prescription.medicalRecord.pet.owner` (**2 levels**) | returned as-is |
| `invoice.repository.ts:146` (`findInvoiceById`) | `invoice.pet.owner` | `invoice.service.ts:148` → returned as-is |
| `invoice.repository.ts:218` (`claimInvoicePaid`) | `invoice.pet.owner` | `invoice.service.ts:173` → returned as-is |

**No service in this set projects or strips fields.** I checked: the services `return` the repository
row directly. The full owner row reaches the HTTP response.

**Impact on planning:** these five are the highest-consequence sites in the set and none of them was
the one treated as an emergency. Any sequencing that treats "the hotfixed one" as the template
misjudges the shape of the problem.

### F-3 (correction to a premise) — "latent" is **true today**, and I verified it rather than inheriting it

I traced every caller-supplied tenant-scoped FK on the affected write paths. **All are guarded**:

| Write path | Guard | Location |
|---|---|---|
| `hospitalization.admit` | `tx.pet.findFirst({ id: data.petId, tenantId })` | `hospitalization.repository.ts:15` (in-tx) |
| `grooming.createBooking` | same shape | `grooming.repository.ts:12` (in-tx) |
| `reminder.create` | same shape | `reminder.repository.ts:12` (in-tx) |
| `medicalRecord.createRecord` | pet + doctor + appointment | `medical-record.repository.ts:84-90` (in-tx) |
| `invoice.createInvoiceTx` | pet, explicitly named "CR-01 Cross-tenant FK guard" | `invoice.repository.ts:59-62` (in-tx) |
| `appointment.createAppointment` / `createWalkIn` | `petRepo.findPetById(tenantId, …)` | `appointment.service.ts:66, 85` (**service layer**) |
| `pet.createPet` | `petRepo.findOwner(tenantId, ownerId)` | `pet.service.ts:53-54` (**service layer**) |
| `bloodBank.registerDonor` | `prisma.pet.findFirst({ id, tenantId })` | `blood-bank.service.ts:43` (**service layer**) |
| `vaccination.createVaccination` | `findPet(tenantId, petId)` | `vaccination.repository.ts:6-8` |

Also verified: `updatePetSchema` omits `ownerId` (`pet.service.ts:21`) and hospitalization's
`editSchema = admitSchema.omit({ petId: true })` — a pet cannot be *reassigned* to a different owner
or admission after creation. Those omissions are load-bearing and undocumented as such.

**So the claim holds. But note what is actually holding it up:**

- **11** hand-written `findFirst({ where: { id: data.X, tenantId } })` checks, in **5** repository files.
- Placement is **inconsistent** — five inside the transaction, four in the service layer above it.
  A service-layer check is not atomic with the write.
- **`blood-bank.repository.ts:15-17` `createDonor` has no guard of its own** and is safe only because
  its single caller happens to check. The next caller inherits nothing.
- Nothing enforces any of it: no DB constraint, no lint rule, no test.

**Correct framing for the PR and for arch:** *the corrupt row is prevented by convention on the write
side and its consequences are unmitigated on the read side. Two independent conventions must both
hold, and neither is enforced by anything.* That is a materially different — and more actionable —
statement than "latent."

### F-4 (minor, hand to arch) — a branch-scope inconsistency inside `claimInvoicePaid`

`invoice.repository.ts:198-221` claims the invoice with `{ id, tenantId, branchId? }` (L201-206) but
reads it back with `{ id, tenantId }` — **`branchId` dropped** (L218). The read-back scope is wider
than the claim scope. This is the same shape ADR-0025 D-1 ruled on (a pre-check must not be wider
than its write); here it is the post-read. Low severity, adjacent, in a function already being
touched. Arch's call whether it belongs in this change.

---

## 4. AS-IS

### 4.1 The schema

Every FK in the system is single-column. Verified mechanically: **70** `@relation(fields: …)`
declarations in `schema.prisma`, **0** whose `references:[…]` includes `tenantId`. So for every
tenant-scoped parent/child pair, the DB permits a child row in tenant A pointing at a parent row in
tenant B. The DDL in `.claude/specs/database-schema.sql` matches (`vaccinations.pet_id` →
`REFERENCES pets(id)`, and so on).

**This exact question was already raised as B-4 in the 2026-08-27 BA sign-off** (§7, on `UserRole`)
and again as hotfix debt on 2026-09-10. Two independent raisings, thirteen days apart, still
unscheduled. That is itself a finding: the system has no route from "BA raises a schema question" to
"the schema question gets scheduled."

### 4.2 The reads — 11 files, by exposure tier

**T1 — regulated identity PII** (full `Owner` row incl. `idCardNumber`, `address`)

| File:line | Function | Permission on the route |
|---|---|---|
| `appointment.repository.ts:93` | `findById` | `appointments.view` — admin **V**, doctor **V**, staff **V** |
| `pet.repository.ts:36` | `findPetById` | `crm.view` — **V / V / V** |
| `prescription.repository.ts:40` | `findPrescriptionWithDetails` | `prescriptions.view` — **V / V / V** |
| `invoice.repository.ts:146` | `findInvoiceById` | `billing.view` — **V / V / V** |
| `invoice.repository.ts:218` | `claimInvoicePaid` | `billing.payment` — E / – / E |

**T2 — contact PII** (owner name, phone, sometimes email)

| File:line | Function | Fields | Permission |
|---|---|---|---|
| `vaccination.repository.ts:75, 88-89, 113-114` | `findDueSoonWorklist` (raw SQL) | petName, species, breed, ownerName, ownerPhone | `emr.view` — **V / V / V** |
| `pet.repository.ts:7` (`listInclude`) | `findPets` | owner id, first, last, phone | `crm.view` — **V / V / V** |
| `search.repository.ts:16` | `searchPets` | owner id, first, last, phone | `crm.view` — **V / V / V** |
| `medical-record.repository.ts:45` | `findById` | owner first, last, phone | `emr.view` — **V / V / V** |
| `hospitalization.repository.ts:9` (`petSelect`) | `findActive`, `findByIdWith` | owner first, last | `inpatient.view` — **V / V / V** |

**T3 — pet identity** (name, species, photoUrl — no owner contact)

`reminder.repository.ts:6` · `blood-bank.repository.ts:5` · `grooming.repository.ts:6` ·
`appointment.repository.ts:16` (`findInRange`)

**T4 — non-PII cross-tenant business data** — worth naming because the audit did not tier it and it
is genuinely a different conversation:

`medical-record.repository.ts:21-22` (`findByPet`) includes `doctor: {id,name}` and
`prescriptions.drug: {id,name,unit}` — both bare FKs to `User` and `InventoryItem`. Exposure is
another tenant's **staff name** and **product catalogue name**. Not PII; still cross-tenant
disclosure, and still a violation of the invariant.

### 4.3 What already exists and is correct — reference patterns arch should reuse, not reinvent

1. **Raw SQL:** `product.repository.ts:242/254/266` —
   `JOIN inventory_items i ON i.id = bi."productId" AND i."tenantId" = ${tenantId}`, with the R2-HI-02
   comment stating why the outer `WHERE` is insufficient. This is the canonical form.
2. **Prisma, avoiding the include entirely:** `hospitalization.repository.ts:39-46` resolves
   `performedBy` via a **separate tenant-filtered batch query** rather than a relation `include`,
   and the comment explains precisely this failure mode. This is the strongest in-repo precedent for
   the Prisma-side answer and predates the hotfix.
3. **Post-filter:** the PR #73 shape — select the related `tenantId`, drop non-matching rows, strip
   the field before returning (`vaccination.repository.ts:31-45`). Works, but it is the weakest of
   the three: it fetches the foreign row into application memory before discarding it, and the
   stripping is manual.
4. **Reverse-direction includes are safe by construction** (parent → children, e.g.
   `owner.repository.ts` owner→pets): the parent is already tenant-filtered and children carry their
   own `tenantId`. Confirmed by the audit; no change needed. Arch should say this explicitly so the
   sweep does not touch them.

### 4.4 What does not exist

- No DB constraint preventing the corrupt row.
- No lint rule, type-level guard, or test that fails when a new unguarded `include` is added.
- No **NFR ID for tenant isolation.** `anemal-functional-reqs` NFR-01…NFR-11 covers HTTPS, bcrypt,
  encryption-at-rest, uptime, backup, responsive, touch, offline, and multi-tenant *scalability*
  (NFR-11, ≥1000 clinics) — but the single most important security property of a multi-tenant SaaS
  has no requirement ID to trace to. **Gap; see XTI-6.**

---

## 5. The invariant — what "fixed" means

> **XTI-INV.** A response produced for a request scoped to tenant *T* must contain no field
> originating from a row whose own `tenantId ≠ T`, regardless of the path by which that row was
> reached (relation `include`, nested `select`, raw-SQL `JOIN`, or in-memory join).

**Ruling: one uniform standard. No tiering of the rule.**

I considered and rejected a tiered rule ("guard T1/T2, backlog T3/T4"). Three reasons:

1. **A tiered rule is not enforceable.** It requires every future author of an `include` to make a
   severity judgement. That is precisely the judgement that failed 11 times already. A rule that is
   mechanically checkable is worth more than a rule that is correctly nuanced.
2. **T3/T4 are still disclosure.** A competing clinic's pet roster, staff names, and product
   catalogue are commercially sensitive between tenants of the same SaaS, even without PDPA-regulated
   fields attached.
3. **T3/T4 are the cheap ones.** They are single-line `select` additions to shared constants
   (`petSel` appears in three files as an identical literal). Excluding them saves almost nothing and
   leaves the invariant untrue, which means it cannot be asserted in a test.

**Tiering governs *sequence within the change* and *rollback risk*, not *whether*.** See §11.

**Corollary rules** (derived from `anemal-db-context` SKILL.md:16, :36):

- **XTI-INV-a.** A row failing the check is treated as non-existent: omitted from a list, `404` on a
  single-resource read. Never `403`, never a partial row, never an error mentioning another tenant.
- **XTI-INV-b.** A failing check is a **data-integrity alarm**, not routine filtering. It means a
  corrupt row exists. It must be observable (log/metric with tenant + table + row id, **no PII in the
  log** — NFR-adjacent, see `anemal-coding-rules`). Today PR #73's `.filter()` drops the row
  silently: the leak is stopped and nobody is told the database is corrupt.
- **XTI-INV-c.** The invariant is a property of the **server**. UI-side filtering does not satisfy it.

---

## 6. TO-BE

| # | AS-IS | Gap / Risk | TO-BE | Priority | Owner-agent |
|---|---|---|---|---|---|
| XTI-1 | 5 sites return the full `Owner` row incl. `idCardNumber`, `address` via `owner: true` | Regulated-identity PII crosses a tenant boundary if one corrupt row exists | Every one of the 5 satisfies XTI-INV; `owner: true` is eliminated as a pattern in favour of an explicit field list | **Must** | arch → dev |
| XTI-2 | `findDueSoonWorklist` raw SQL joins `pets`/`owners` with no tenant predicate, **and a shipped comment says it is guarded** | Highest-volume T2 leak; the false comment actively suppresses discovery | Joins tenant-scoped on both sides per `product.repository.ts:242`; comment + roadmap record corrected | **Must** | arch → dev |
| XTI-3 | 4 further T2 sites (`findPets`, `searchPets`, `medical-record.findById`, hosp `petSelect`) | Owner contact PII crosses tenants | Satisfy XTI-INV | **Must** | dev |
| XTI-4 | T3/T4 sites (5 files) return pet identity / staff names / drug names unguarded | Cross-tenant commercial disclosure; and the invariant cannot be asserted while they stand | Satisfy XTI-INV | **Should** | dev |
| XTI-5 | The corrupt row is prevented by 11 inconsistent hand-written checks; `blood-bank.createDonor` has none of its own; nothing enforces the convention | One forgotten check reopens the entire read-side surface | Write-side FK validation is enforced by a single mechanism, at a consistent layer, atomic with the write | **Must** | arch |
| XTI-6 | No NFR ID for tenant isolation; the property is asserted only in CLAUDE.md prose | Cannot be traced, cannot be cited in an AC, cannot be regression-tested as a requirement | A new **NFR-12 (Security — tenant isolation)** in `anemal-functional-reqs`, worded as XTI-INV | **Should** | ba (me, post-approval) |
| XTI-7 | Nothing fails when a new unguarded `include`/`JOIN` is added | The defect recurs; this is exactly how 11 sites accumulated | A mechanical enforcement point exists and fails closed on new violations | **Must** | arch |
| XTI-8 | RLS documented in `database-schema.sql` §10 as "NOT DEPLOYED" with 3 named blockers, indefinitely | Reads as an available option; it is not one | Either scheduled as its own initiative with the 3 blockers as its scope, or the section is marked explicitly deferred with a decision record | **Could** | human + db |

**XTI-7 is the requirement that actually retires the debt.** XTI-1…XTI-4 fix 11 known instances;
without XTI-7 there will be a twelfth. If arch's design satisfies XTI-1…XTI-4 but not XTI-7, this
change has bought a snapshot, not a property — and I will say so at 3.5.

---

## 7. Authorization review

**Ruling: this is a data-isolation defect, orthogonal to RBAC. No permission code changes. No route
guard changes. No matrix update.**

The governing sentence is `anemal-rbac-matrix/SKILL.md:45`:

> Permissions narrow *what*; tenant/branch isolation still governs *whose* data.

Every affected read is already correctly guarded for *what*. The defect is entirely in *whose*.

| Check | Result |
|---|---|
| New permission codes | **None.** No new surface; these are existing reads returning too much. |
| Route guards changed | **None.** All affected routes already carry `requirePlane('clinic')` + a permission — verified on `search.routes.ts:9`, `hospitalization.routes.ts:11-17`, `grooming.routes.ts:11-13`, `blood-bank.routes.ts:11-16`. |
| Deny-by-default | **Unaffected.** Nothing is opened or relaxed. |
| Plane separation | **Unaffected.** Clinic plane only. `/platform/*` carries no `tenant_id` and reads no PII. |
| Server as boundary | **Strengthened.** Moves the isolation predicate into the query/response rather than relying on data being well-formed. |
| No access regression | **Holds.** No role gains or loses a permission. Rows removed from a response were rows that role was never entitled to. |
| Privilege escalation | **None.** |
| Custom roles | **Unaffected.** A custom role is a permission bundle; it cannot grant cross-tenant reach, and nothing here changes that. |

**Two RBAC-adjacent facts that matter for how this is prioritised, even though the fix is not an RBAC fix:**

1. **Permissions provide zero mitigation.** `crm.view`, `emr.view`, `billing.view`, `inpatient.view`
   are **V for all three system roles** (`permission-matrix.md:34-63`). The exposure is not confined
   to admins — the blast radius is every authenticated clinic user of every tenant. Nothing can be
   deferred on a "only admins can reach it" argument.
2. **`claimInvoicePaid` (T1) sits behind `billing.payment`** — admin/staff only, not doctor
   (`permission-matrix.md:56`, and the ruling at :91-93). It is the one T1 site with a narrower
   audience. That is a sequencing datum, not a reason to defer it.

**Where a real authorization question *does* live:** XTI-INV-b's alarm. A corrupt-row detection event
is closer to `audit.view` (admin-only, `permission-matrix.md:82`) than to the module the read
belongs to. **I am not designing the observability surface here** — arch decides whether the signal
is a log line, a metric, or a record. But if it becomes anything a clinic user can *read*, it needs a
permission code and comes back to me. Flagged as C-6.

---

## 8. Solution options — the space, and which parts are closed

@arch-agent chooses at 3.4. My role is to define the option space and rule on requirements-level
feasibility. **I am not recommending an architecture.**

### Option A — schema-level composite FKs

`(tenantId, petId) → pets(tenantId, id)` and equivalents, requiring `@@unique([tenantId, id])` on
each parent.

- **Makes the corrupt row impossible.** The only option that removes the *cause* rather than
  containing the *effect*. If A is deployed, every read-side guard becomes belt-and-braces.
- **Requirements-level preconditions that arch cannot decide alone (C-3):**
  - A migration on live data must first **prove zero existing violations** across every affected
    pair. If violations exist, someone must decide what happens to that data — a business decision
    (delete? quarantine? reassign?), not a technical one.
  - 70 relations. Scope selection (which pairs, in what order) is a scoping decision that needs the
    human's Step 1 approval, not arch's judgement.
  - **Known limitation:** it does not cover parents with `tenantId = NULL` — the exact reason B-4
    (2026-08-27) could not simply add one for `ClinicRole`. Arch must state which pairs A can and
    cannot cover.
  - Collides with open backlog **R3-F1** (`onDelete` drift) in the same DDL. Coordinate or sequence.
- **Not blocked. Preconditions must be answered before it is chosen.**

### Option B — deploy the RLS design in `database-schema.sql` §10

**Ruled OUT OF SCOPE for this change — a requirements/ops decision, not an architecture one.**

The spec itself (L563-586) names three preconditions, and each is an infrastructure programme:

1. A **second non-owner DB role** + a separate `DATABASE_URL` (the app's current role is table owner
   and bypasses RLS).
2. **Every request wrapped in an interactive transaction** so `SET LOCAL app.current_tenant_id` has a
   safe attachment point — the app uses one shared `PrismaClient` pool with no per-request
   transaction wrapper. This is a change to the connection/transaction architecture of the entire
   backend.
3. **Integration coverage for the platform-plane bypass** — platform users have no `tenant_id` and
   must read across tenants by design.

Plus documented column-name drift: the §10 statements are snake_case against a camelCase live schema
and **cannot be run verbatim**.

The spec's own warning is decisive: *until all three exist, enabling `FORCE ROW LEVEL SECURITY`
returns zero rows for every tenant query.* Coupling a PII fix to a change that can silently blank the
product is not a trade this requirement should make.

**Ruling:** B does not enter this change. It is a separate initiative with its own Lane A entry and
its own human decision, and the three blockers are its scope. **XTI-8** requires that §10 stop
reading as an available option — either scheduled, or explicitly marked deferred with a decision
record. Arch should design as if RLS does not exist, and **must not** design something that would
have to be undone if RLS is deployed later.

### Option C — repository-layer convention with mechanical enforcement

A shared guard/helper + an enforcement point (lint rule, type-level constraint, codegen, or a
conformance test that scans repository sources).

- Cheapest, no schema risk, no ops change, no migration, reversible.
- **Only viable if the enforcement point is real.** A convention with no failure mode is what
  produced 11 violations. "Add it to the coding-rules doc and review carefully" does **not** satisfy
  XTI-7 and I will reject it at 3.5.
- Three in-repo reference patterns already exist (§4.3) — arch should pick among them rather than
  invent a fourth.
- Does not prevent the corrupt row from existing; it prevents the row from being *returned*. Leaves
  XTI-5 to be solved separately.

### Option D — combination

C (or C+A) now for the read side, plus a decision on A for the write side, with B parked.

- Most likely to satisfy all of XTI-1…XTI-7.
- **Ponytail exposure is real:** two mechanisms for one property invites criterion 2/3 ("is one of
  these enough?"). Arch must pre-answer *what each half does that the other cannot* — C stops the
  read, A stops the row. That answer belongs in the arch doc, not in the gate discussion.

**One thing I will rule on, because it is a requirements question:** whether the read-side guard is
still needed *if* A ships. **Yes.** Defence in depth on a PII boundary is not redundancy — a restore
from backup, a manual SQL correction, a future migration, or a constraint added `NOT VALID` all
reintroduce the state a composite FK is supposed to prevent. The read-side guard is the last line
and stays.

---

## 9. Exceptions and edge cases

| # | Case | Required behaviour |
|---|---|---|
| E-1 | **`reminder.repository.ts:41` `listAllDue()` is deliberately cross-tenant** — the background dispatcher's system-context read, documented at L40 and L50-52, with each write pinned to the reminder's own `tenantId` | **Must survive.** Any blanket mechanism that assumes "every query is request-scoped" breaks the reminder worker. It needs an explicit, named, reviewed exemption — not an accidental pass. |
| E-2 | Reverse-direction includes (parent → children), e.g. `owner.repository.ts` owner→pets | Already safe. Must be **explicitly declared** safe so the sweep and the enforcement rule do not churn them. |
| E-3 | `NULL`-branch pets appear in every branch's list by design (`blood-bank.repository.ts:19-22`; `permission-matrix.md:108-114`) | Unchanged. This is branch semantics, not tenant semantics — do not "fix" it. |
| E-4 | A related row is legitimately `NULL` (e.g. a retail invoice with no pet — `invoice.repository.ts:18`, `invoice.service.ts:185`) | `NULL` must stay `NULL`. Must not be conflated with "failed the tenant check." |
| E-5 | Platform-plane reads | No `tenant_id` in the token by design. The mechanism must not assume one exists. |
| E-6 | A single-resource read whose related row fails the check | `404`, per `anemal-db-context` SKILL.md:36. Never `403`, never a partial row. |
| E-7 | A list read where *some* rows fail | Failing rows omitted; the list succeeds. Pagination totals must stay consistent with what is returned (`pet.service.ts:34-40` runs `findPets` and `countPets` separately — a post-filter desynchronises them). **Arch must resolve this**; it is a correctness bug the PR #73 pattern introduces at scale. |
| E-8 | Seed / backfill / restore paths (`prisma/seed.ts`, `scripts/backfill-main-branch.ts`) | Not request-scoped. Must be stated in or out; silence here is how the corrupt row gets created after the fix ships. |
| E-9 | An existing corrupt row is found in production | Not covered by any requirement today. Needs a decision (§8 Option A precondition). |

**E-7 is the sharpest one and it is a genuine new risk introduced by the hotfixed pattern**, not a
pre-existing defect. Post-filtering after `take: N` also returns fewer than `N` rows for a page. Arch
must not extend PR #73's shape to paginated reads without answering it.

---

## 10. NFR impact

| NFR | Impact |
|---|---|
| **NFR-01** (search < 500 ms) | `searchPets` is directly affected. A post-filter approach fetches then discards; a join-predicate approach filters in the DB. Arch's choice has a measurable effect here. Both `owners` indexes are `(tenantId, …)` composites (`@@index([tenantId])`, `@@index([tenantId, phone])`), so an added tenant predicate is index-aligned — **no regression expected**, but `searchPets` is the one place to verify rather than assume. |
| **NFR-02** (main screens < 2 s) | `findPets`, `findInRange`, `findActive`, `listBookings` are list reads on primary screens. Same reasoning; low risk. |
| **NFR-11** (multi-tenant, ≥1000 clinics) | This *is* NFR-11's integrity half. Currently NFR-11 reads as a scalability requirement only. See XTI-6. |
| **NFR-06** (uptime ≥ 99.5%) | Option A implies a migration on live data; Option B (excluded) could zero every query. The availability argument is the strongest reason B stays out. |
| Maintainability | Net positive **only if XTI-7 lands.** 11 hand-patches without an enforcement point *increases* the surface a reviewer must hold in their head. |
| Observability | XTI-INV-b adds a signal that does not exist today. Must carry no PII. |
| Performance (T1 sites) | Replacing `owner: true` with an explicit field list **reduces** payload — five endpoints stop shipping `idCardNumber`, `address`, `lineId`, `loyaltyPoints` to clients that never asked. A small independent win worth stating in the PR. |

---

## 11. Priority and sequencing — recommendation

**Recommendation: ONE coordinated Lane A change. Do not split the 7 high-severity files into a
separate fast-follow branch.**

**Reasoning:**

1. **There is no incident pressure, and I verified that rather than assuming it (F-3).** Every write
   path that could create the corrupt row is guarded today. No app-reachable exploit exists. A
   fast-follow buys speed against a threat that is not currently live, and pays for it with a second
   uncoordinated pass over the same 11 files.
2. **A fast-follow produces exactly the artefact PR #73 already produced** — a correct local patch
   plus a comment asserting something false about its neighbour. Eleven of those is not eleven fixes;
   it is eleven things to re-audit.
3. **Split work makes the T1 patches potentially dead weight.** If arch chooses Option A or a shared
   mechanism under C, hand-written per-function guards written this week get rewritten next week. The
   ponytail gate is correct to attack that.
4. **The invariant cannot be *tested* while T3/T4 stand.** XTI-INV is a repo-wide property. A
   conformance test asserting "no unguarded forward-FK include exists" cannot be written, let alone
   pass, if five files are knowingly excluded. Splitting defers the only artefact that stops
   recurrence.
5. **`bugfix.md:51-57` already routes this here**: >3 files, a schema decision, and "the design does
   not support this case" each independently mandate Lane A. It is already the ruling.

**Two exceptions that do not wait for the arch design:**

- **F-1's false comment.** A shipped comment telling engineers a vulnerable function is safe is
  itself a defect, and correcting it costs nothing and blocks nothing. It goes in first, in W0 of
  this change — not in a separate branch.
- **C-1's verification.** Must complete before the architecture is chosen, because its outcome
  determines whether this recommendation stands at all.

**The trigger that flips this to Lane C — state it explicitly in the plan:** if C-1's reproduction
finds **any** app-reachable write path that creates the cross-tenant FK state, the corresponding read
becomes a live self-service cross-tenant PII read primitive available to every clinic role, and this
stops being a design exercise the same hour. Lane C is human-declared (CLAUDE.md); C-1's finding is
the evidence that would be put to the human.

**Suggested wave shape for arch to accept, reshape, or reject** (not a plan — @pm-agent owns that at
Step 4):

| Wave | Content | Why here |
|---|---|---|
| W0 | C-1 verification; F-1 comment + roadmap correction; the enforcement mechanism (XTI-7) and the shared guard (XTI-5) | Everything downstream depends on the mechanism existing. Fix the false claim before anyone reads it again. |
| W1 | XTI-1 (5 T1 sites) + XTI-2 (`findDueSoonWorklist`) | Highest consequence; smallest surface; T1 and the raw-SQL case exercise both halves of the mechanism |
| W2 | XTI-3 (4 T2) + XTI-4 (T3/T4) + the conformance test turned on | Bulk application once the mechanism is proven; the test can only go green at the end |

The **schema decision (Option A)** does not have to be *implemented* in this change, but it must be
**decided and recorded** in it. Leaving it open a third time is how it reached its second raising.

---

## 12. Acceptance criteria (draft — @pm-agent refines at Step 2/4, @qa-agent owns at Step 7)

Every AC is written to be falsifiable against the **pre-fix** code, per the G-5 standard set by the
2026-08-27 sign-off.

```
AC-1  Given a vaccination/appointment/invoice/prescription/pet/medical-record/hospitalization/
      grooming/reminder/blood-donor row in tenant A whose FK points at a pet or owner in tenant B,
      when a tenant-A user with the route's permission reads it,
      then no field of the tenant-B row appears in the response body.
      Falsifiable: fails against pre-fix code for each of the 11 files.

AC-2  Given the same fixture, when a tenant-A user reads the single-resource endpoint,
      then the response is 404 — not 403, not 200-with-partial, and the body names no other tenant.

AC-3  Given the same fixture on a LIST endpoint, when a tenant-A user reads it,
      then the corrupt row is absent, the request succeeds, and the reported total matches the
      number of rows actually returned across the full pagination range.   [covers E-7]

AC-4  Given the same fixture, when the read executes,
      then a data-integrity signal is emitted identifying tenant, table and row id,
      and containing no PII field value.                                    [XTI-INV-b]

AC-5  Given a NEW repository read is added that follows a forward FK to a tenant-scoped row without
      a tenant guard, when the enforcement point runs (lint / conformance test / typecheck),
      then it FAILS.
      Falsifiable: a deliberately unguarded fixture must be shown failing.  [XTI-7 — load-bearing]

AC-6  Given the reminder background dispatcher, when listAllDue() runs,
      then it still returns pending reminders across all tenants and each write remains pinned to
      the reminder's own tenantId.                                          [E-1 — no regression]

AC-7  Given a retail invoice with petId = NULL, when it is read,
      then pet is null and the response is 200 — a NULL relation is not treated as a failed check.
                                                                            [E-4]

AC-8  Given a tenant-A user reads any of the five former `owner: true` endpoints,
      then the response contains no `idCardNumber`, `address`, or `lineId` field for ANY owner —
      including their own tenant's.                                         [XTI-1, over-fetch]

AC-9  Given the backend suite on main, when this branch's suite runs,
      then it is green and no pre-existing test was deleted without a recorded
      deleted-coverage justification.                                       [ship gate]

AC-10 Given `vaccination.repository.ts`, when its comments are read,
      then no comment asserts that findDueSoonWorklist is tenant-guarded unless it is.   [F-1]
```

`anemal-db-context` SKILL.md:63-70 makes AC-1/AC-2's test shape mandatory for protected endpoints;
`vaccinationDueSoonTenantLeak.test.ts` is the working template and the fixture-seeding recipe is
already proven there.

---

## 13. Conditions on this sign-off

Step 3.4 may begin now. C-1 must complete **before** arch commits to an option; C-2…C-7 before 3.5.

| # | Condition | Owner |
|---|---|---|
| **C-1** | **Verify the write-path claim by reproduction, not by reading.** For each of the 11 affected reads, attempt to create the cross-tenant FK state through a supported API call. My trace (§F-3) says all are guarded; a trace is not a test. **If any path succeeds, stop and escalate to the human for a Lane C declaration** (`bugfix.md:62-66`). Result is an input to arch's option choice and to §11. | @qa-agent |
| **C-2** | Correct `vaccination.repository.ts:25-30` and the `.claude/roadmap/index.md` PR #73 record: `findDueSoonWorklist` is **not** guarded. Do not fix the code and leave the claim standing. | @dev-agent + @scribe-agent |
| **C-3** | Rule on Option A's preconditions: (a) migration must prove zero existing violations, and what happens if it cannot; (b) which of the 70 relations are in scope; (c) the `tenantId = NULL` parent limitation (B-4 precedent); (d) the R3-F1 `onDelete` collision. **Answers, not a proposal to answer later.** | @db-agent → @arch-agent |
| **C-4** | Resolve **E-7** (post-filter breaks `take`/`count` consistency) before extending the PR #73 pattern to any paginated read. This is a correctness bug the current pattern introduces at scale. | @arch-agent |
| **C-5** | Name the XTI-7 enforcement point concretely and demonstrate it failing on a deliberately unguarded fixture. A documented convention with no failure mode does not satisfy XTI-7 and I will reject it at 3.5. | @arch-agent |
| **C-6** | If XTI-INV-b's integrity signal becomes anything a clinic user can read, it needs a permission code — return to me. If it is log/metric only, state that and no RBAC change is needed. | @arch-agent → @ba-agent |
| **C-7** | Put the §2 scope line to the human for Step 1 approval. It has not been approved; `/write-plan` is blocked until it is. | @pm-agent → human |

---

## 14. Risks

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| 1 | Ponytail rejects an 11-file sweep as over-build (criteria 2/3) | **High** | Step 5 blocked | Arch doc must lead with XTI-7: the change is *one mechanism*, applied 11 times, not 11 fixes. Pre-answer "what does each half do that the other cannot" for Option D. §11 gives the sequencing argument. | @arch-agent |
| 2 | C-1 finds an app-reachable write path | Low–Med | Lane A → Lane C same hour | C-1 runs first, before design commits. Escalation route is `bugfix.md:62-66`. | @qa-agent → human |
| 3 | Post-filter pattern extended to paginated reads; page sizes and totals silently wrong | Med | Correctness bug shipped as a security fix | C-4 blocks it | @arch-agent |
| 4 | Option A's migration finds existing violations in production data | Unknown | Scope explodes mid-change | C-3(a) forces the question up front, with a business decision, not a technical one | @db-agent → human |
| 5 | Blanket mechanism breaks `listAllDue` (E-1) | Med | Reminder dispatch silently stops | E-1 named as an explicit exemption + AC-6 | @arch-agent |
| 6 | Fix ships, XTI-7 does not → twelfth violation appears | Med | Debt reopens; third raising of the same finding | XTI-7 is **Must**; AC-5 is load-bearing and must be demonstrated failing | @arch-agent |
| 7 | Red-suite ship gate at Step 8 | Low | Merge blocked | `main` is green as of PR #73 (`.claude/roadmap/index.md`). Re-verify at Step 8; do not assume. | @scribe-agent |
| 8 | Searches hit stale copies under `.claude/worktrees/` | Med | Wrong file edited | Recurring hazard (flagged 2026-08-21 §5, again 2026-08-27 M-3). Scope every grep to `src/backend/`. | all |

---

## 15. Backlog raised (not this change)

- **B-1 — There is no route from "BA raises a schema question" to "the schema question is
  scheduled."** B-4 (2026-08-27) and the 2026-09-10 hotfix debt row raised the composite-FK question
  independently, thirteen days apart. Neither was scheduled. The hotfix-debt table has an escalation
  rule ("debt older than one phase is raised to the human by `@pm-agent`"); a BA backlog item has
  none. **Process gap, and it is the reason this document exists.**
- **B-2 — Branch-level (`branchId`) isolation of related rows.** Same defect class, larger surface,
  complicated by `branchId` being nullable by design. Deliberately excluded from §2; must be tracked
  rather than merely excluded.
- **B-3 — `blood-bank.repository.ts:15-17` `createDonor` has no FK guard of its own**, unlike its
  four sibling repositories. Safe today only because its single caller checks. Absorb into XTI-5 if
  arch's mechanism covers it; track separately if not.
- **B-4 — `.claude/specs/database-schema.sql` §10 has read as "NOT DEPLOYED" indefinitely.** A
  ~130-line design that cannot be executed and is nobody's task. Either schedule it (its three
  blockers are its scope) or mark it deferred with a decision record. **= XTI-8.**
- **B-5 — Response shaping is absent between repository and controller.** Services `return` Prisma
  rows unmodified, so any relation added to an `include` becomes public API immediately. That is the
  structural reason `owner: true` reaches HTTP at all. Broader than this change and squarely
  @arch-agent's domain — raising, not scoping.

---

## 16. Definition of Ready — hand-off to @arch-agent (Step 3.4)

| Criterion | Status |
|---|---|
| Objective stated | ✅ §0 header + XTI-INV (§5) |
| Actors & roles named | ✅ §7 — every affected route's permission identified; all three system roles in the blast radius |
| Permission codes assigned | ✅ **No change required.** Existing codes verified against `permission-matrix.md:34-63` and the live route files. C-6 covers the one open case. |
| Business rules listed | ✅ XTI-INV + corollaries a/b/c (§5) |
| Exception cases covered | ✅ §9, E-1…E-9. **E-7 is unresolved by design** and assigned to arch as C-4. |
| NFR impact noted | ✅ §10. NFR-01 is the one to measure rather than assume. XTI-6 raises the missing NFR-12. |
| Acceptance criteria testable | ✅ §12, AC-1…AC-10, each falsifiable against pre-fix code |
| Dependencies & risks recorded | ✅ §13, §14, §15 |
| Step 1 human approval | ⛔ **OPEN — C-7.** `/write-plan` is blocked until the §2 scope is ratified. |

**Ready for Step 3.4 (@arch-agent).** Not ready for `/write-plan` — C-7 (human scope approval) and
C-1 (write-path verification) must close first.

### What @arch-agent owns from here

Layering and where the guard lives · helper vs. lint vs. codegen vs. conformance test for XTI-7 ·
transaction boundaries for write-side FK validation (XTI-5) · the E-7 pagination resolution · pattern
choice among the three in-repo precedents (§4.3) · test strategy · the Option A/C/D decision, and
recording the Option A ruling either way.

**What arch must not do:** design around RLS (§8 Option B is closed) · silently drop T3/T4 to shrink
the diff (§5 rules the invariant uniform) · extend the post-filter pattern to paginated reads without
C-4 · treat "documented in coding-rules" as satisfying XTI-7.

### Recommended `/grill-with-docs` targets (Step 3.5)

1. **XTI-7 is the whole requirement.** If the design fixes 11 sites without a failure mode for the
   twelfth, what stops this document being written a third time in November?
2. **E-7.** The pattern shipped in the emergency hotfix breaks `take` and `count` when applied to a
   paginated read. Was the hotfix's approach ever the right template, or only the fastest one?
3. **Option A's precondition (C-3a).** If the migration finds real cross-tenant rows in production
   data, who decides what happens to them, and is that decision inside this change or outside it?
4. **F-3's honest framing.** "Latent" holds today because of 11 hand-written checks placed
   inconsistently across two layers, one of which (`blood-bank.createDonor`) has no guard at all.
   Is that a reason to relax, or the strongest argument for XTI-5?
5. **F-1.** A merged hotfix justified its approach by citing a sibling function as safe when it was
   not. What in the Lane C path let a false safety claim ship inside a security fix, and does Lane C
   need a check that a hotfix's stated precedent is real?

---

*@ba-agent — Lane A Steps 1 + 3 complete. Verdict: REQUIREMENT VALIDATED, 7 conditions (C-1…C-7).
Next: @arch-agent, Step 3.4.*
