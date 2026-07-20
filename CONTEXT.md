# Anemal

Multi-tenant vet clinic SaaS. Tablet (touch-first) + Web. Clinic plane (per-tenant staff) and Platform plane (SaaS operator) are distinct authorization contexts.

## Language

**Bookable doctor**:
A user eligible to be assigned to an appointment: assigned to the branch in question (or any branch, for an all-branches session), active, and holding a role that resolves to the Doctor system role (directly, or via role lineage).
_Avoid_: "vet", "practitioner" — code and schema use "doctor" throughout.

**Role lineage** (`ClinicRole.sourceRoleId`):
A pointer from a tenant's custom role back to the system role it was cloned from (e.g. a renamed/customized "Doctor" role). Direct pointer only, not transitive — a clone-of-a-clone is not currently possible since `cloneRole` only clones system roles.
_Avoid_: "role parent", "base role".
_Note_: role-lineage-aware matching is deliberately **not** universal — see "Single role per user" below. "Bookable doctor" (appointments) uses lineage; the Admin Branches doctor picker intentionally does not (ADR-0019).

**Single role per user** (ADR-0019, 2026-07-20):
Every `User` holds exactly one role (`User.roleId`, `NOT NULL`) — never zero, never more than one. Combined access is achieved by cloning a role with the desired permission mix, not by assigning multiple roles to one user. This retires the earlier multi-role model (FR-14b/CR-01), which allowed a user's effective permissions to be the union of several assigned roles via the `user_roles` join table.
_Avoid_: "assign a role" implying additive/stacking behavior — assigning a new role **replaces** the user's current one. Avoid "roles" (plural) when referring to what one user holds; a user has "a role", the tenant has "roles" (plural, the catalogue).

**Branch scope (server-derived)**:
The branch a request is scoped to, taken exclusively from the authenticated session (`req.context.branchId`), never from client-supplied input (query/body). `null` means an all-branches admin session — no branch filter applied, not an error.
_Avoid_: "branch filter" (implies it's optional/client-controlled — it isn't).

**Recompute-last-known-weight policy**:
The rule keeping `Pet.weightKg` in sync with `MedicalRecord.weightKg`: any medical-record save that includes a non-null weight recomputes the pet's weight from that pet's chronologically latest medical record with a non-null weight (tenant-scoped). A null/omitted weight on a record never triggers recompute and never clears the pet's stored weight — a weight-less visit doesn't make the pet's last-known weight unknown. See ADR-0008.
_Avoid_: "weight sync" alone (ambiguous about direction/trigger — always name which side recomputes from which).

**Platform-provisioned clinic_admin**:
A `clinic_admin`-role `User` created or managed by the platform plane (via the Customer Detail "Clinic Admins" tab), as opposed to a clinic_admin created inside the clinic plane by another clinic_admin. Platform's write access here is a bounded exception to plane separation — see ADR-0015. Distinguishing trait: the first such user (created automatically at tenant creation, username `admin`, no email/phone) has no contact channel and is exempt from D-2-02 (email-OR-phone required) precisely because that rule lives in `user.service.ts createUser()`, which this provisioning path never calls.
_Avoid_: conflating with "clinic staff" generally — platform's write access is scoped to `clinic_admin` role only (B-1, ADR-0015); doctor/staff accounts remain exclusively clinic-managed.

**Atomic conditional UPDATE pattern**:
The codebase's convention for atomic writes under concurrency: a single raw SQL `UPDATE` (optionally with a subquery or a guard condition) run via `tx.$executeRaw` inside `prisma.$transaction`, instead of a read-then-write with an explicit row lock (`SELECT ... FOR UPDATE`). Established by `prescription.repository.ts` `deductStockAndCreate` (guarded decrement, checks `affected === 0`); reused by the weight-sync recompute (subquery form). See ADR-0008.
_Avoid_: introducing `SELECT ... FOR UPDATE` for new conditional-write logic without checking whether a single-statement form covers it first.
