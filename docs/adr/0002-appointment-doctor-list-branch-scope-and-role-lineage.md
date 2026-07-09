# Doctor-list branch scope comes from server session, not client input; role lineage tracked via self-referencing FK

Date: 2026-07-05
Status: Accepted

The appointment-booking doctor list (`GET /api/appointments/doctors`) takes its branch scope exclusively from `req.context.branchId` (the authenticated session), never from a client-supplied query parameter — reusing the existing `branchOf(req)` pattern already used by `listAppointments`/`createAppointment`. This closed two BA-flagged gaps at once: a branch-A-bound staff token could otherwise enumerate branch B's doctors by editing the query string, and a required `branchId` param would have broken the "all-branches" admin flow (`branchId === null`), reintroducing the exact bug this feature fixes.

Considered alternative: accept `?branchId=` from the client and validate it's tenant-owned. Rejected — it adds a validation surface for no product benefit; no screen needs a user to view a branch other than their own assigned one (confirmed with product owner), so there is nothing legitimate the parameter would enable.

Separately, `ClinicRole.sourceRoleId` (nullable, self-referencing FK, `ON DELETE SET NULL`) was added to track that a custom role was cloned from a system role (e.g. "Doctor"), so a clinic-customized/renamed Doctor role still counts as bookable. Lineage is recorded as a **direct pointer only** (not transitive) because `cloneRole` only ever clones system roles today — if clone-of-custom-role is added later, this membership check must become transitive.
