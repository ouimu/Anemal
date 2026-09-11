# ADR-0028 — Composite tenant foreign keys are deferred, not rejected

**Status:** Accepted (the decision to defer is accepted; the schema change itself is **not** approved)
**Date:** 2026-09-11
**Related:** ADR-0027 (relation traversal carries its own predicate) · backlog R3-F1 (`onDelete` FK
drift) · B-4 from `docs/superpowers/plans/2026-08-27-role-service-tenant-scope-ba-signoff.md` §7 ·
`.claude/specs/database-schema.sql` §10 (RLS, NOT DEPLOYED)
**Origin:** Lane A Step 3.4 —
`docs/superpowers/plans/2026-09-11-cross-tenant-relation-isolation-arch.md` §A, answering condition
C-3 of the 2026-09-10 BA sign-off

## Context

Adding `tenantId` to the foreign keys themselves — `(tenantId, petId) → pets(tenantId, id)` and
equivalents — is the only option that makes the corrupt row **impossible** rather than merely
invisible. It has now been raised three times: as B-4 on 2026-08-27, as hotfix debt on 2026-09-10,
and as Option A of the 2026-09-10 BA sign-off. It has never been scheduled and never been ruled on,
which is itself the finding (BA backlog B-1: there is no route from "a BA raises a schema question"
to "the schema question gets scheduled").

This ADR exists to stop the fourth raising. It records the measurements, the blockers and the
sequence, so the next person to ask reads an answer instead of re-deriving one.

**What the schema actually looks like**, measured against `src/backend/prisma/schema.prisma` on this
branch rather than estimated:

| Set | Count |
|---|---|
| models carrying a `tenantId` column | 35 of 43 |
| forward to-one `@relation(fields:)` where **both** sides are tenant-scoped | **39** |
| …blocked by a nullable parent `tenantId` | 3 |
| **feasible candidate set** | **36** |
| parent models needing a new `@@unique([tenantId, id])` to make the FK declarable | 11 |
| reverse to-many traversals to tenant-scoped models, which composite FKs do **not** address | 68 |

The "70 relations" figure in circulation counts every `@relation(fields:)` declaration, including
relations to `Tenant`, `Plan`, `Permission` and other models that have no tenant of their own, where
a composite tenant key is meaningless.

Two facts follow immediately and change how this option should be read. First, composite FKs cover
**36 of 107** tenant-relevant traversals: they remove the cause in the forward direction only, and
`@qa-agent` has proved the reverse direction leaks as well. **Option A was never a superset of the
read-side guard and could not have replaced it.** Second, the 11 `@@unique([tenantId, id])` indexes
are redundant with each table's primary key and exist purely to make the composite key declarable —
11 extra B-trees on the hottest tables, a permanent write cost that belongs in this option's
cost/benefit rather than being discovered mid-migration.

## Decision

**Composite tenant foreign keys are DEFERRED.** They are not rejected, not descoped, and not
"someday" — they are sequenced behind three named preconditions, after which they run as their own
Lane A change with `@db-agent` holding the veto.

**Precondition 1 — evidence.** `npm run db:integrity-scan`, shipped by the cross-tenant relation
isolation change, generates one `SELECT` per tenant-scoped forward relation from the same
`Prisma.dmmf` relation map and reports every child row whose `tenantId` differs from its parent's. It
selects ids only and never a PII column. A constraint cannot be added `VALID` over data nobody has
inspected, and until that report exists this option cannot be costed.

**Precondition 2 — a business decision, if the scan finds anything.** The remedy for an existing
violation is not an engineering choice. *Quarantine* (null the FK, keep the row) and *delete* both
destroy clinical linkage; *reassign* preserves it but requires someone who knows which patient the
record actually belongs to, which is clinic staff, per row. That decision is escalated to the human,
and it sits **outside** this change.

Adding the constraint `NOT VALID` to sidestep the decision is **explicitly ruled out**: it leaves
every existing violation in place and unenforced while presenting as a fixed schema. That is the
false-safety failure of finding F-1 expressed in DDL, and F-1 is the reason this whole body of work
exists.

**Precondition 3 — R3-F1 first, and in the same constraint definitions.** Altering a foreign key is
`DROP CONSTRAINT` + `ADD CONSTRAINT`, taking a `SHARE ROW EXCLUSIVE` lock and re-validating the whole
child table. Doing that twice on `pets`, `invoices` and `medical_records` — once for the composite key
and once for `onDelete` — is two lock windows on the hottest tables for one outcome. **R3-F1 is
therefore promoted from an adjacent backlog item to a precondition of this option**, and its
`onDelete` decision must be carried by the same constraint definitions.

**Exclusions, ruled now so the future migration does not rediscover them.**

Exactly three tenant-scoped models declare `tenantId Int?`: **`SettingsAuditLog`, `ClinicRole`,
`RefreshToken`**.

`ClinicRole` is B-4's case and the reason is now explicit: **system roles are stored with
`tenantId = NULL`** — visible throughout the test fixtures as
`prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })`. A composite
FK cannot match a NULL-tenant system role, so **`User.roleRef`, `UserRole.role` and
`ClinicRole.sourceRole` are permanently excluded** while system roles are modelled this way. That is
the answer B-4 asked for on 2026-08-27.

`SettingsAuditLog.changedByUser → User` is excluded for a subtler reason that must not be missed: the
**child's** `tenantId` is nullable, and under Postgres' default `MATCH SIMPLE` semantics a composite
FK containing any NULL column is satisfied **vacuously**. The constraint would exist and enforce
nothing for exactly the rows whose tenancy is undefined. A constraint that silently does not apply is
worse than no constraint, because it reads as protection. The exclusion must be written into the DDL
comment, not left implicit.

**The read-side guard stays regardless.** ADR-0027 is not contingent on this ADR and is not made
redundant by it. A restore from backup, a manual SQL correction, a future migration, or a constraint
added `NOT VALID` each reintroduce precisely the state a composite FK is meant to prevent. The two
controls answer different questions: ADR-0027 protects **confidentiality** (the row is never
returned), this option protects **integrity** (the row never exists).

**Row-level security (`database-schema.sql` §10) is not part of this decision.** It was ruled out of
scope as a requirements matter, its three named preconditions are each an infrastructure programme,
and nothing in ADR-0027 or here would have to be undone if it is ever deployed — the guards are
ordinary `WHERE` predicates, which RLS composes with rather than contradicts.

## Consequences

**Good.** The schema question has an answer with numbers behind it, so the next person to raise it
inherits a sequence instead of an open question. The business decision about existing corrupt data
stops blocking a PII fix: because ADR-0027 ships first, the default outcome if nobody decides is that
the rows remain, stay invisible, and wait — which is safe. The measurement work (which pairs, which
exclusions, which indexes) is done once, here, rather than during a migration window.

**Costs.** The cause of the defect remains in the database. Integrity faults can still be created by
operator scripts (`prisma/seed.ts`, `scripts/backfill-main-branch.ts`, `scripts/reset-demo-data.ts`),
by a restore, or by direct SQL — and after ADR-0027 they are silent, because the read-side guard hides
the row from its own tenant. `npm run db:integrity-scan` is the only control on that path until this
option ships, and it is on-demand rather than continuous. Operators must run it after any seed,
backfill or restore.

**Trigger for revisiting.** Any one of: the integrity scan reporting a non-zero count on production;
R3-F1 being scheduled; or a fourth independent raising of the composite-FK question. The first is the
expected trigger, and the scan is the artefact that will produce it.
