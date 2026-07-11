# Step 3.5 — /grill-with-docs findings (MANDATORY gate): Pet Profile Medical Tab

Autonomous scheduled run, no human present. Findings raised against the BA-signed
design (Option C hybrid) in `2026-07-11-pet-profile-medical-tab-tasks.md`, each
interrogated against actual code (not assumed), resolved without blocking.

## Finding 1 (scope correction) — EMR has no `?petId=` deep-link today

PET-MED-1 assumed drill-in navigation to `ClinicEMR.tsx` "filtered to this pet"
was a simple existing pattern. Verified: `ClinicEMR.tsx` selects the active pet
via internal component state (`selectedPetId`, set only by the in-screen patient
search list, line 516) — it has **no `useSearchParams` usage at all**. However,
`ClinicRecordVaccination.tsx` (lines 2, 20-24) DOES establish a precedent:
`useNavigate` + `useSearchParams` reading `?petId=` on mount to pre-fill a
pet-scoped screen.

**Resolution:** PET-MED-1 must add a small on-mount effect to `ClinicEMR.tsx`
(`useSearchParams`, `searchParams.get('petId')` → `setSelectedPetId`), following
the established convention rather than inventing a new one. This means the task
touches **`ClinicEMR.tsx` in addition to `ClinicPets.tsx`** — tasks doc file
estimate corrected from "3-5 files" to include this file explicitly (still well
under Ponytail's 15-file ceiling). Recorded as ADR-0012 decision point 1.

## Finding 2 (scope reduction, good news) — EMR route already permission-gated

`App.tsx:139` — `<Route path="emr" element={<RequirePermission perm="emr.view">
<ClinicEMR/></RequirePermission>}/>`. A user without `emr.view` who somehow
follows/guesses the drill-in link is already redirected away by this existing
route guard. PET-MED-1's AC "a user with neither crm.view nor emr.view cannot
reach Pet Profile" and the EMR-side guard are BOTH already covered by existing
guards (`RequirePermission` on `/clinic/emr`, `RequirePermission` on the pets
route). **No new route-guard code needed** — only a regression test confirming
it still holds. Reduces implementation scope from the tasks doc's assumption.

## Finding 3 — empty-state ambiguity: simpler fix than a new API contract

BA's Step-3 AMEND flagged that "no records" vs "no permission" must render
distinguishably. Naive fix would require the server to encode a tri-state
(records / empty-permitted / denied) in the payload shape, which is a new,
fragile contract. Verified the codebase already has a simpler tool: `Can`
component (`src/frontend/src/components/Can.tsx`) reads permission from
`useAuthStore().hasPermission(perm)` client-side — the client always knows its
own permission set independent of any particular payload's shape.

**Resolution (simpler, adopted):** the Medical tab decides which empty-state
message to show by checking `hasPermission('emr.view')` from the auth store
directly (mirroring the existing `Can perm="vaccination.create"` pattern already
used in this same file, line 629) — NOT by inspecting whether `medicalRecords`
is present/absent/empty in the payload. The server-side omission in PET-MED-2
remains (defense-in-depth — the real security boundary per `Can`'s own doc
comment: "the server is the real security boundary"), but the UI message logic
does not depend on it. This avoids inventing a new payload contract. One
fewer moving part than the tasks doc implied.

## Finding 4 — double permission resolution is intentional, not a bug to fix

`requirePermission('crm.view')` (route middleware) already calls
`resolvePermissions(userId, tenantId)` once (5-min in-memory cache,
`permission.middleware.ts:72`). PET-MED-2's service-layer `emr.view` check
will call `resolvePermissions` again. This is a second cache-hit, not a new
DB round-trip in the common case — acceptable. Considered and REJECTED:
threading a resolved permission set through `req.context` from the route
middleware, because that changes a shared middleware used by every clinic
route in the app for the benefit of one screen — disproportionate blast radius
for a bugfix-pipeline item (Ponytail criterion #1/#4). Accept the minor
duplicate cache lookup as-is.

## Finding 5 — tenant isolation unaffected (verified, not assumed)

`findPetById` (`pet.repository.ts:31-44`) is already scoped
`where: { id, tenantId, isActive: true }`. PET-MED-2 conditionally
includes/omits `medicalRecords`/`vaccinations` on the SAME base query — no new
query surface, no new tenant-scoping code path to get wrong. Confirmed safe.

## Finding 6 — permission cache staleness is pre-existing, out of scope

If a Clinic Admin edits a custom role to add/remove `emr.view` while a user
with that role is logged in, propagation takes up to the existing 5-minute
`resolvePermissions` cache window (plus JWT `permSetVersion` invalidation
timing). This is global, pre-existing behavior affecting every permission
check in the app, not something this item introduces or should fix. Flagged
for the record; not a blocker.

## Findings resolved — /write-plan unblocked

6 findings, all resolved without a human present:
- Finding 1: real scope correction (add `ClinicEMR.tsx` to the touch-list,
  reuse `ClinicRecordVaccination.tsx`'s `useSearchParams` convention).
- Finding 2: scope reduction (route guards already exist; test-only, no new code).
- Finding 3: simplification (drive empty-state messaging off `hasPermission`
  in the auth store, not off payload shape — one fewer contract to invent).
- Finding 4, 5, 6: verified safe / accepted as pre-existing, no action.

Tasks doc (`2026-07-11-pet-profile-medical-tab-tasks.md`) to be amended before
`/write-plan` to reflect Findings 1-3. See ADR-0012 below.

---

## ADR-0012: Pet Profile Medical tab stays a permission-aware, read-only EMR rollup with drill-in

**Status:** Accepted (2026-07-11)

**Context:** The Pet Profile "Medical" tab was a bare, silently-capped
(3 records), minimally-projected read-only list with no way to see more and no
server-side permission boundary matching the dedicated EMR/Vaccination
endpoints' own guards. Item 2 of the 2026-07 bugfix pipeline resolved whether
this tab should become separately editable (fork clinical data onto the Pet
record) or stay derived from EMR.

**Decision:** Option C (hybrid):
1. `Pet.allergies` / `Pet.underlyingConditions` remain pet-level scalar fields,
   editable via `crm.edit` through the existing `EditPetModal` → `PUT
   /api/pets/:id` path — unchanged. These are CRM safety flags (FR-03-04), not
   clinical narrative, and must stay writable independent of any open EMR
   consult (e.g., a receptionist logging an owner's phone-reported allergy).
2. The tab's record list becomes an explicit, capped-with-visible-affordance,
   read-only rollup of `MedicalRecord` rows, with a drill-in link to
   `ClinicEMR.tsx?petId=<id>` (new `useSearchParams` support added there,
   mirroring `ClinicRecordVaccination.tsx`'s existing convention).
3. Server-side, `GET /api/pets/:id` omits BOTH `medicalRecords` and
   `vaccinations` when the caller lacks `emr.view` (matching the permission
   floor of the dedicated `medical-record.routes` / `vaccination.routes` GET
   endpoints) — closing a pre-existing over-fetch gap where the embedded
   include ignored the caller's `emr.*` permission entirely.
4. Empty-state messaging (no records vs. no permission) is driven by the
   client's own `hasPermission('emr.view')` (auth store), not by payload shape
   — avoiding a new tri-state API contract.

**Rejected alternatives:**
- Option A (pure EMR-derived, allergies/conditions moved under `emr.*`) —
  breaks FR-03-04's non-clinical safety-visibility guarantee.
- Option B (medical info separately editable on Pet, independent of EMR) —
  forks clinical data into two writable stores; source-of-truth hazard.

**Consequences:** No schema change. Touches `ClinicPets.tsx`, `ClinicEMR.tsx`
(new `?petId=` handling), `pet.repository.ts`/`pet.service.ts`/
`pet.controller.ts` (permission-conditional include), and
`.claude/skills/anemal-screen-specs/references/04-pet-owner.md`. Folding
discharged-admission/inpatient care history into this rollup (per ADR-0011's
deferral from Item 1) remains a separate future item, not bundled here.

**Glossary additions:** "Medical tab rollup" = the read-only EMR/vaccination
summary shown on Pet Profile, distinct from "EMR record" (the underlying
`MedicalRecord` entity, fully editable only via `ClinicEMR.tsx`).
