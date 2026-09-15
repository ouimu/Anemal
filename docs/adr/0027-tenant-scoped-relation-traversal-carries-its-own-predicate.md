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

**The guard is written literally at each call site. No helper wraps it.** Not because a helper would
be invisible to the enforcement point — the analyzer *can* resolve a call expression, and must, since
five repositories already build their `where` that way. Rather: resolution is a cost paid to read code
that already exists for a domain reason, not a licence to add new indirection whose only benefit is a
shorter line. The nullable form (`OR: [{ is: null }, { is: { tenantId } }]`) does not compose into a
single keyed value, so a helper would cover the easy half and not the hard half, leaving two spellings
where there is now one. And a helper worth having would have to branch on nullability — precisely the
shape the analyzer's bounded resolver refuses. The security predicate must be the thing a reviewer can
see.

**Every `findX`/`countX` pair carries the tenant predicate independently.** For each relation predicate
required in `findX`'s root `where`, the `countX` in the same file must carry an equivalent predicate in
its own root `where`, so a predicate cannot be added to the list query and forgotten in the count. This
is a property of each query, **not a requirement that the two share a builder expression**: two
literals that each carry the predicate satisfy it, and so does a shared builder. Predicates nested
inside a to-many `include` are excluded, since they do not change the root row set and cannot
desynchronise a count.

**Enforcement is a conformance test in the backend Jest suite**
(`src/backend/tests/integration/crossTenantRelation.standingGuards.test.ts`, which asserts the
`remaining` violation set against the real `models/` sources is `[]`), not a lint rule.
`src/backend/tests/unit/tenantRelationConformance.test.ts` is where the analyzer itself
(`analyzeTenantRelationConformance`) is defined and unit-tested against fixtures — its own assertion
against the real models is intentionally non-enforcing (`Array.isArray(violations)`), so
`standingGuards.test.ts` is the actual gate a future change must not break. The repository has no
`.github/workflows`; `npm run lint` is run by no gate, while the test suite is gated three times — by
`@qa-agent` at Step 7, by the red-suite ship gate at Step 8, and by the rule that a red `main` blocks
the next merge. The analyzer derives its relation map from `Prisma.dmmf.datamodel.models`, so relation
number 114 is known to it the day it is added, and parses sources with the `typescript` compiler API,
already a devDependency. It walks forward and reverse traversals in the same pass, so both directions
are covered by construction rather than by a second audit. Six fixture files assert on every run that
the detector fires, does not over-fire, resolves, and fails closed.

**The analyzer resolves indirection, within a published boundary.** A literal-only checker would have
been useless here: 17 of 35 repository files put `where`/`include` behind a call expression, an
identifier or a conditional spread, including the two functions holding the defect this rule exists to
fix. Resolution scope therefore equals analysis scope — one symbol table over
`src/backend/models/*.repository.ts`, with no type-checker and no program-wide module graph. Resolved:
a same-file identifier bound to an object literal; a call to a function whose body ends in a single
`return <object literal>`; an identifier imported from another file **in that same set**; and both
branches of a conditional value, each judged independently. Not resolved, and therefore failing closed:
a `where` built by mutation (`where['k'] = v`), and any import from outside the set. A conditional
spread is treated as additive — it can add keys but cannot delete a sibling literal one — so a guard
found literally passes regardless, and only a missing guard or a spread positioned where it could
override one fails. An unresolvable `include`/`select` **value** fails closed when the relation is
to-many, where the guard lives inside that value; when the relation is to-one the guard lives in the
root `where` and the literal key alone decides, so the value is never read.

An unguarded traversal passes only via `src/backend/config/tenant-relation-exemptions.ts`, where each
entry names file, function, relation path and a non-empty reason. An entry without a reason fails; an
entry that no longer matches a real violation fails, so exemptions cannot rot into an allowlist.

**Write side:** the FK check is a precondition of the write and must be atomic with it. The check
lives with whoever owns the transaction; it is never duplicated. `crossTenantFkWritePathRepro.test.ts`
remains, as of this change, its original fixed list of hand-written probes (C-1 form) — converting it
into a standing prober that walks the Express route table and fails on an unregistered write route was
scoped into XTI-13 but not completed (rate-limited mid-task). **Deferred, tracked as backlog**, not
shipped as part of this change; revisit before relying on this ADR's write-side coverage as automatic.

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
move `dmmf`, and TypeScript AST shapes drift. Reading indirection rather than only literals puts it at
roughly 350 lines instead of 200 — one file, one export, still no new dependency. This is accepted
because it is the only thing that makes the property hold for code not yet written, it has zero runtime
cost, and its own correctness is re-proved by six fixtures on every run — two of which exist
specifically to catch a resolver that has silently stopped resolving, or stopped failing closed. A
broken analyzer fails loudly rather than passing silently. Failing closed also taxes honest code: an
unresolvable construct is a red test until it is rewritten or exempted with a reason. The two-level and
nullable spellings are verbose; that verbosity is the price of a predicate that can be read and checked.

**Known limits, recorded so they are not rediscovered as surprises.** The analyzer checks spelling,
not semantics — a predicate against the wrong variable passes it, which is why nine behavioural
corrupt-row tests exist alongside it. It sees only `src/backend/models/*.repository.ts`; Prisma calls
elsewhere are already forbidden by `architecture-rules.md` §1 and are `anemal-coding-rules`' business,
not this mechanism's. Its resolution boundary is published above and drawn on cost rather than on
safety — everything past it is reported as a violation, which is the safe direction, but being wrong
about where that line sits costs a false positive rather than a missed leak. Rule 3 is a regex over
template literals, not a SQL parser, and will over-report on an exotic join shape.

**A consequence that is not an improvement, and must not be forgotten.** This rule protects
confidentiality, not integrity. After it ships, a corrupt row stops leaking and simultaneously becomes
**invisible to its own tenant** — a vaccination legitimately owned by clinic A, whose `petId` points at
clinic B's pet, disappears from A's list instead of showing B's pet name. The fault becomes silent.
An operator scan — `npm run db:integrity-scan`, generated from the same relation map, selecting ids
only and never a PII column — is the answer to exactly this, and is specified in the arch doc §7.
**Whether this change builds it is not settled by this ADR:** it is conditional on `@ba-agent`
accepting a rewording of AC-4 from a read-time signal (which this decision makes impossible, since the
corrupt row is filtered in Postgres and never reaches the application) to an assertion about the scan.
If that rewording is declined, the scan is not built here and XTI-INV-b returns to BA as an open
requirement. ADR-0028's deferral of composite foreign keys is conditional on **a scan report existing**
before Option A proceeds — not on this change authoring the scanner — so that deferral holds either way.
