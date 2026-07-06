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
