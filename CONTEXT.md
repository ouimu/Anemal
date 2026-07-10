# Anemal

Multi-tenant vet clinic SaaS. Tablet (touch-first) + Web. Clinic plane (per-tenant staff) and Platform plane (SaaS operator) are distinct authorization contexts.

## Language

**Bookable doctor**:
A user eligible to be assigned to an appointment: assigned to the branch in question (or any branch, for an all-branches session), active, and holding a role that resolves to the Doctor system role (directly, or via role lineage).
_Avoid_: "vet", "practitioner" — code and schema use "doctor" throughout.

**Role lineage** (`ClinicRole.sourceRoleId`):
A pointer from a tenant's custom role back to the system role it was cloned from (e.g. a renamed/customized "Doctor" role). Direct pointer only, not transitive — a clone-of-a-clone is not currently possible since `cloneRole` only clones system roles.
_Avoid_: "role parent", "base role".

**Branch scope (server-derived)**:
The branch a request is scoped to, taken exclusively from the authenticated session (`req.context.branchId`), never from client-supplied input (query/body). `null` means an all-branches admin session — no branch filter applied, not an error.
_Avoid_: "branch filter" (implies it's optional/client-controlled — it isn't).

**Recompute-last-known-weight policy**:
The rule keeping `Pet.weightKg` in sync with `MedicalRecord.weightKg`: any medical-record save that includes a non-null weight recomputes the pet's weight from that pet's chronologically latest medical record with a non-null weight (tenant-scoped). A null/omitted weight on a record never triggers recompute and never clears the pet's stored weight — a weight-less visit doesn't make the pet's last-known weight unknown. See ADR-0008.
_Avoid_: "weight sync" alone (ambiguous about direction/trigger — always name which side recomputes from which).

**Atomic conditional UPDATE pattern**:
The codebase's convention for atomic writes under concurrency: a single raw SQL `UPDATE` (optionally with a subquery or a guard condition) run via `tx.$executeRaw` inside `prisma.$transaction`, instead of a read-then-write with an explicit row lock (`SELECT ... FOR UPDATE`). Established by `prescription.repository.ts` `deductStockAndCreate` (guarded decrement, checks `affected === 0`); reused by the weight-sync recompute (subquery form). See ADR-0008.
_Avoid_: introducing `SELECT ... FOR UPDATE` for new conditional-write logic without checking whether a single-statement form covers it first.
