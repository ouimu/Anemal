# Inpatient DELETE is care-log-gated hard delete, not a soft cancel

Date: 2026-07-10
Status: Accepted

`DELETE /api/hospitalizations/:id` was added to fix the confirmed gap that an admission could
never be removed once created — not even a mis-entered admission (wrong pet, wrong reason,
fat-fingered while the board was busy). The question this ADR resolves: should delete be a true
hard delete, a soft "cancel" status, or something narrower?

**Decision: allowed only when `status === 'admitted'` AND the admission has zero `careLogs`.**
Any logged care entry — even one — means real clinical data (temperature/HR/RR/medication/
feeding observations) exists on the admission, and `Hospitalization.careLogs` cascade-deletes
(`onDelete: Cascade` in `schema.prisma`) if the parent row is removed. A true hard delete on an
admission with care history would silently destroy real medical records with no audit trail —
unacceptable for a vet clinic's EMR-adjacent data. A discharged admission is, by definition,
part of the pet's completed medical history (and already has a generated invoice in the common
case) and must never be deletable either.

Violating either guard returns `409` with a message naming the specific reason:
- care logs exist → "Cannot delete an admission with care history — discharge it instead."
- already discharged → "Cannot delete a discharged admission — it is part of the pet's medical history."

This means delete only solves the narrow "empty admission, wrong data entry, nothing clinical
happened yet" case — which is the actual reported bug (no way to remove a fat-fingered
admission). For every other case, `discharge` (already implemented, preserves the record and
generates the correct invoice) remains the only exit.

**Frontend consequence:** the Delete button on `CageCard` (`ClinicInpatient.tsx`) is rendered
only when `hospit._count.careLogs === 0` (added to `findActive`'s existing Prisma query as an
extra `_count` selection, not a new endpoint) and `status === 'admitted'` — a client-side
pre-check that avoids a guaranteed-to-fail request in the common case. The backend 409 remains
the actual source of truth (defense in depth; the frontend gate is not trusted alone).

**Considered alternative: soft "cancelled" status** (add a third `status` value alongside
`admitted`/`discharged`, never physically delete a row). Rejected for this batch — it changes the
`status` enum's meaning across every existing consumer of `Hospitalization.status` (`findActive`'s
`status: 'admitted'` filter, the board's `STATUS_COLORS`/`STATUS_LABELS` maps, any future
reporting), which is a larger, cross-cutting change for a data-entry-typo use case. If clinics
later want a full audit trail of cancelled admissions (not just "it's gone"), that's a real,
separately-scoped feature request — not something to smuggle into a CRUD bug-fix batch.
