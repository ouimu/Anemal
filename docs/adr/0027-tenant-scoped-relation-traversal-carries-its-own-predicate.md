# ADR-0027 — A tenant-scoped relation traversal carries its own predicate

**Status:** Accepted
**Date:** 2026-09-11
**Related:** ADR-0028 (composite tenant FKs deferred) · PR #73 (Lane C hotfix, `findDueSoon`) ·
`.claude/standards/architecture-rules.md` §1, §4, §8 · `.claude/skills/anemal-db-context`
**Origin:** Lane A Step 3.4 —
`docs/superpowers/plans/2026-09-11-cross-tenant-relation-isolation-arch.md`, from
`docs/superpowers/plans/2026-09-10-cross-tenant-relation-isolation-ba-signoff.md`

## Context

No foreign key in the Anemal schema references `tenantId`. All 70 `@relation(fields:)` declarations
are single-column, so Postgres permits a child row in tenant A whose FK points at a parent row in
tenant B. A query that filters `WHERE tenantId = A` and then follows such a relation returns tenant
B's data, and nothing in the schema, the type system, the linter or the test suite objects.

Eleven repository files were found with this pattern on the forward (child → parent) side. `@qa-agent`
then proved (C-1 addendum, BA sign-off §17) that the **reverse** direction leaks too: a to-many
`include` applies no predicate to the child rows, so tenant A's corrupt row pushes A's own data into
tenant B's response — the victim is the tenant that did nothing wrong. Counting both directions, the
candidate surface is 20 model files: 57 `include:` occurrences plus 19 raw-SQL `JOIN`s across 7 files,
of which some already carry a guard and some traverse relations to models that have no tenant.

The PR #73 hotfix closed one instance by fetching the related row, comparing `tenantId` in
application memory, and dropping mismatches. Its comment justified the approach on the grounds that
Prisma cannot filter a to-one `include` by a field on the related row. That premise is correct —
the generated `PetDefaultArgs` exposes `select`/`include`/`omit` and no `where`. The conclusion is
not: `VaccinationWhereInput.pet` is typed `XOR<PetRelationFilter, PetWhereInput>`, so the predicate
belongs in the query's **root `where`**, where Postgres evaluates it before `LIMIT`.

That distinction is not cosmetic. Post-filtering after `take: N` returns fewer than N rows and
desynchronises a paginated list from its `count` query, turning a security fix into a correctness bug
at scale (BA E-7).

Three reference patterns already existed in the repository and were not applied consistently:
tenant-guarded raw-SQL joins (`product.repository.ts:242/254/266`), resolving a relation through a
separate tenant-filtered batch query (`hospitalization.repository.ts:39-46`), and the PR #73
post-filter. Eleven sites accumulated because nothing failed when a twelfth was written.

## Decision

**One rule governs every tenant-scoped relation traversal in the backend:**

> A tenant-scoped relation is only ever **followed**, or **written**, with a tenant predicate
> attached at the point of traversal.

It has three spellings, because Prisma to-one, Prisma to-many and raw SQL are three dialects of one
join. They are not three patterns:

1. **Forward (to-one), Prisma** — the predicate goes in the root `where`, mirroring the include path:
   `where: { tenantId, pet: { is: { tenantId } } }`. For a **nullable** FK the relation must be
   allowed to be genuinely absent: `OR: [{ pet: { is: null } }, { pet: { is: { tenantId } } }]`.
2. **Reverse (to-many), Prisma** — the predicate goes in the nested `where`:
   `include: { vaccinations: { where: { tenantId } } }`.
3. **Raw SQL** — the predicate goes on the `ON` clause:
   `JOIN pets p ON p.id = v."petId" AND p."tenantId" = ${tenantId}`.

**The post-filter pattern is retired**, including its only instance (`findDueSoon`, PR #73), which is
rewritten to spelling 1 and whose `.filter()`/`.map()` block is deleted. Filtering in the database
means the foreign tenant's PII is never materialised in application memory, and `take`/`count` stay
consistent by construction.

**The guard is written literally at each call site. No helper wraps it.** A predicate behind a call
expression cannot be read by the enforcement point, and the nullable form does not compose into a
single keyed value. The security predicate must be the thing a reviewer can see.

**Every `findX`/`countX` pair in one repository file derives its `where` from the same expression** —
a shared builder, never two literals — so a predicate cannot be added to the list query and forgotten
in the count.

**Enforcement is a conformance test in the backend Jest suite**
(`src/backend/tests/unit/tenantRelationConformance.test.ts`), not a lint rule. The repository has no
`.github/workflows`; `npm run lint` is run by no gate, while the test suite is gated three times — by
`@qa-agent` at Step 7, by the red-suite ship gate at Step 8, and by the rule that a red `main` blocks
the next merge. The analyzer derives its relation map from `Prisma.dmmf.datamodel.models`, so relation
number 114 is known to it the day it is added, and parses sources with the `typescript` compiler API,
already a devDependency. It walks forward and reverse traversals in the same pass, so both directions
are covered by construction rather than by a second audit. Four fixture files — two deliberately
unguarded, two guarded — assert on every run that the detector both fires and does not over-fire.

An unguarded traversal passes only via `src/backend/config/tenant-relation-exemptions.ts`, where each
entry names file, function, relation path and a non-empty reason. An entry without a reason fails; an
entry that no longer matches a real violation fails, so exemptions cannot rot into an allowlist.

**Write side:** the FK check is a precondition of the write and must be atomic with it. The check
lives with whoever owns the transaction; it is never duplicated. `crossTenantFkWritePathRepro.test.ts`
is converted from a one-off reproduction into a standing prober that walks the Express route table and
fails when a write route has no registry entry.

**No new abstraction, error class, permission code, dependency or layer is introduced.** The layering
of `architecture-rules.md` §1 is unchanged: a tenant predicate is a data-access concern and lives in
the repository, where every Prisma call already lives.

## Consequences

**Good.** The invariant becomes a property rather than a snapshot: a new unguarded `include` — in
either direction — fails a gated test before it can merge. Five endpoints stop shipping
`idCardNumber`, `address`, `lineId` and `loyaltyPoints` to clients that never asked, since `owner: true`
is replaced by an explicit four-field select. Filtering moves into Postgres, where the `owners`
composite indexes (`@@index([tenantId])`, `@@index([tenantId, phone])`) already support it. The
codebase ends with one answer to this question instead of three, and one pattern fewer than it started
with.

**Costs.** The analyzer is the most expensive artefact here to maintain: a Prisma major upgrade can
move `dmmf`, and TypeScript AST shapes drift. This is accepted because it is the only thing that makes
the property hold for code not yet written, it has zero runtime cost, and its own correctness is
re-proved by the four fixtures on every run — a broken analyzer fails loudly rather than passing
silently. The two-level and nullable spellings are verbose; that verbosity is the price of a predicate
that can be read and checked.

**Known limits, recorded so they are not rediscovered as surprises.** The analyzer checks spelling,
not semantics — a predicate against the wrong variable passes it, which is why nine behavioural
corrupt-row tests exist alongside it. It sees only `src/backend/models/*.repository.ts`; Prisma calls
elsewhere are already forbidden by `architecture-rules.md` §1 and are `anemal-coding-rules`' business,
not this mechanism's. A `where` it cannot statically resolve is reported as a violation, which is the
safe direction. Rule 3 is a regex over template literals, not a SQL parser, and will over-report on an
exotic join shape.

**A consequence that is not an improvement, and must not be forgotten.** This rule protects
confidentiality, not integrity. After it ships, a corrupt row stops leaking and simultaneously becomes
**invisible to its own tenant** — a vaccination legitimately owned by clinic A, whose `petId` points at
clinic B's pet, disappears from A's list instead of showing B's pet name. The fault becomes silent.
`npm run db:integrity-scan` (an operator script generated from the same relation map, selecting ids
only and never a PII column) exists for exactly this reason, and ADR-0028's deferral of composite
foreign keys is conditional on it.
