# Pet.weightKg recomputed via single atomic raw UPDATE subquery, not a pessimistic row lock

Date: 2026-07-09
Status: Accepted

`Pet.weightKg` is kept in sync with `MedicalRecord.weightKg` by the **recompute-last-known-weight
policy**: any `createMedicalRecord`/`updateMedicalRecord` call that writes a non-null weight
recomputes `Pet.weightKg` from the pet's chronologically latest medical record that has a
non-null weight (tenant-scoped, `ORDER BY "createdAt" DESC, id DESC` as tiebreak). Null/omitted
weight never triggers a recompute and never clears the pet's weight.

The recompute is implemented as a single `tx.$executeRaw` **atomic conditional UPDATE pattern**
— `UPDATE pets SET "weightKg" = (SELECT "weightKg" FROM medical_records WHERE "tenantId"=:t
AND "petId"=:p AND "weightKg" IS NOT NULL ORDER BY "createdAt" DESC, id DESC LIMIT 1) WHERE
id=:p AND "tenantId"=:t` inside the same `prisma.$transaction` as the record write — rather
than a pessimistic `SELECT ... FOR UPDATE` read-then-write. This matches the codebase's existing
convention for atomic conditional writes under concurrency (`prescription.repository.ts`
`deductStockAndCreate`, a guarded raw `UPDATE` inside `$transaction`), is simpler than adding
explicit row-level locking, and needs no new mechanism: Postgres guarantees the subquery and the
outer `UPDATE` execute as one atomic statement.

Considered alternative: `SELECT ... FOR UPDATE` on the pet row, then a separate `UPDATE`. Rejected
— it's a second, unprecedented locking mechanism in this codebase for no extra correctness benefit
over the single-statement subquery form, which is already atomic.

Accepted residual anomaly: under READ COMMITTED, two medical records for the same pet saved at
effectively the same instant can each recompute from a snapshot that doesn't yet include the other's
row, so the "losing" transaction's recompute may not reflect the "winning" transaction's weight.
This is a millisecond-window ambiguity between two simultaneous weigh-ins, not a sustained
divergence — the next weighed save self-heals it. A `SERIALIZABLE` isolation level or retry loop
would close this window but was rejected as disproportionate (Ponytail: no real clinical scenario
depends on sub-second ordering between two concurrent weigh-ins for the same pet).
