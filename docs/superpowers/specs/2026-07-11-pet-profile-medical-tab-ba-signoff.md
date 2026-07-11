# BA Sign-off — Pet Profile "Medical" Tab (Bugfix Pipeline Item 2)

Date: 2026-07-11
Owner: @ba-agent
Pipeline step: Step 3 of 8 (formal validation + sign-off)
Inputs: `2026-07-11-pet-profile-medical-tab-brainstorm.md`, `2026-07-11-pet-profile-medical-tab-tasks.md`
Method: `anemal-ba-toolkit` working method; all AS-IS claims independently re-verified against code (not taken from the brainstorm on trust).

---

## 1. Verdict

**SIGN-OFF GRANTED — Option C confirmed — with corrections CORR-1..CORR-3 applied below.**
`/write-plan` remains blocked until Step 3.5 `/grill-with-docs` runs and all findings are resolved.

---

## 2. Independent code verification (BA re-checked, 2026-07-11)

| # | Claim (brainstorm/tasks) | Verified | Evidence |
|---|---|---|---|
| V1 | Medical tab is read-only, capped list of `assessment` + date | CONFIRMED | `src/frontend/src/views/clinic/ClinicPets.tsx:615-624` |
| V2 | `findPetById` embeds `medicalRecords` `take: 3` with narrow select | CONFIRMED | `src/backend/models/pet.repository.ts:31-44` |
| V3 | `findPetById` ALSO embeds `vaccinations` — **with NO take cap and NO select projection** (full rows) | CONFIRMED — over-fetch is *worse* than the brainstorm stated | `pet.repository.ts:36` |
| V4 | `GET /api/pets/:id` gated only on `crm.view`; no `emr.*` check anywhere in the pet path | CONFIRMED | `src/backend/routes/pet.routes.ts:12` |
| V5 | `GET /api/medical-records?petId=...` exists, requires `petId`, paginated (`page`/`limit`), gated `emr.view` | CONFIRMED — usable for drill-in, no new endpoint needed | `medical-record.routes.ts:14`, `medical-record.controller.ts:9-13`, `medical-record.service.ts:38-42` |
| V6 | Vaccination GET routes gated `emr.view`; POST gated `vaccination.create` | CONFIRMED — AMEND-1 in tasks doc is correct and necessary | `vaccination.routes.ts:11-14` |
| V7 | Naming drift: spec says "Medical History", code `TABS` says "Medical" | CONFIRMED | `04-pet-owner.md:106,116` vs `ClinicPets.tsx:500` |
| V8 | Frontend route guards: `/clinic/pets` → `crm.view`, `/clinic/emr` → `emr.view` | CONFIRMED | `src/frontend/src/App.tsx:138-139` |
| V9 | `allergies`/`underlyingConditions` editable via `EditPetModal` → `PUT /api/pets/:id` (`crm.edit`) | CONFIRMED | `ClinicPets.tsx:363-375,443-444`; `pet.routes.ts:14` |
| V10 | Server-side conditional include is feasible: `resolvePermissions(userId, tenantId)` is an exported, cached helper the pet controller/service can call | CONFIRMED | `src/backend/middlewares/permission.middleware.ts:65-90` |
| V11 | **NEW FINDING:** `ClinicEMR.tsx` pet selection is component-local state (`selectedPetId`, line 393), initialized to `null`, with **no URL/query-param/router-state input** | CONFIRMED — drill-in as written is NOT implementable without touching `ClinicEMR.tsx` (→ CORR-1) | `ClinicEMR.tsx:386-393`; no `useParams`/`useSearchParams` in file |

---

## 3. Decision: Option C — CONFIRMED (independent reasoning)

**Objective.** Pet Profile must give any profile-viewing staff member immediate prescription-safety context (allergies, chronic conditions) and give clinically-permitted staff a truthful, navigable window into the clinical history — without creating a second writable store of clinical data.

**Why not Option A (pure EMR rollup, allergies move under EMR).** FR-03-04 (Must) deliberately places drug-allergy/underlying-condition flags on the Pet record "แยกเป็นสัดส่วนชัดเจนเพื่อความปลอดภัยในการสั่งยา" — separated precisely so they are visible/maintainable outside any consult and outside `emr.*` gating. Option A would make a receptionist (custom `crm.*`-only role) unable to record "owner phoned: pet is allergic to penicillin" and would put the safety banner behind `emr.view`. That breaks a Must requirement and weakens FR-05-05's allergy-check input chain. Rejected.

**Why not Option B (separately editable medical fields on Pet).** Two writable stores for SOAP/vitals data = source-of-truth fork; every FR-05 feature (prescription checks, lab trending, referral export) would face a "which copy is true?" hazard. Also violates the BA anti-pattern of forking logic instead of using the existing module. Rejected.

**Option C** keeps each FR's ownership intact: FR-03 owns pet-level safety flags (writable via `crm.edit`); FR-05 owns clinical narrative (writable only in EMR via `emr.*`); the Medical tab becomes an honest read-only rollup with drill-in. No schema change, no new writable surface, deny-by-default preserved. **Confirmed.**

---

## 4. Permission-code mapping (authoritative for this item)

| UI element / API surface | Permission | Behavior when absent |
|---|---|---|
| `/clinic/pets` route + Pet Profile screen | `crm.view` | Route blocked (existing `RequirePermission`, `App.tsx:138`) — unchanged |
| `GET /api/pets/:id` — base pet + owner + `allergies`/`underlyingConditions` | `crm.view` | 403 (existing) — unchanged |
| `GET /api/pets/:id` — embedded `medicalRecords` **and `vaccinations`** | `emr.view` (NEW server-side conditional include) | Fields **omitted from payload**; base pet data still returned — never a whole-request failure |
| Medical tab rollup section (list + "Showing 3 of N") | `emr.view` (frontend, driven by payload absence) | Section replaced by neutral no-access/hidden state; Overview + alerts banner unaffected |
| "View all in EMR" drill-in link | `emr.view` | Link **omitted** (not disabled) |
| Drill-in target `/clinic/emr?petId=...` | `emr.view` (existing route guard, `App.tsx:139`) | Blocked — consistent with link omission |
| Full-history fetch `GET /api/medical-records?petId=...` | `emr.view` (existing) | 403 — unchanged |
| Vaccinations tab list (embedded `vaccinations`) | `emr.view` (same conditional include) | List degrades same as Medical tab |
| "Add Vaccination" button + `POST /api/vaccinations` | `vaccination.create` (existing) | Button hidden (existing `Can`), 403 (existing) — unchanged |
| Edit allergies/conditions (`EditPetModal` → `PUT /api/pets/:id`) | `crm.edit` (existing) | Hidden/403 — unchanged, explicitly out of scope |

**Graceful-degradation requirement (binding):** a `crm.view`-only caller receives a complete, functional Pet Profile (hero, owner card, alerts banner, Overview) with the EMR-derived sections absent. Frontend must not throw on missing `medicalRecords`/`vaccinations` keys (current optional-chaining at `ClinicPets.tsx:617,635` already tolerates this — keep it that way, add a test).

**No access regression:** all three system roles (`clinic_admin`, `clinic_doctor`, `clinic_staff`) hold both `crm.view` AND `emr.view` (permission-matrix rows 38, 42), so the new server gate changes nothing for any seeded role. Only custom roles with `emr.view` toggled off are affected — which is the intended fix, and it *narrows* (never widens) access. Regression rule satisfied; require a test proving system-role payloads are byte-equivalent pre/post.

---

## 5. Gap analysis vs FR-03 / FR-05

| ID | FR | AS-IS | Gap/Risk | TO-BE (this item) | Status |
|---|---|---|---|---|---|
| GAP-1 | FR-03-04 (Must) | Allergies/conditions pet-level, editable, always visible to `crm.view` | None — already compliant | Unchanged | SATISFIED (no action) |
| GAP-2 | FR-05-01 | SOAP records fully owned by EMR; Medical tab silently truncates to 3 with no path to the rest | Users may believe 3 records = full history (clinical-safety misread) | "Showing 3 of N" + drill-in to EMR | CLOSED by PET-MED-1 |
| GAP-3 | Deny-by-default (RBAC spec) | `GET /api/pets/:id` leaks `medicalRecords` + **full** `vaccinations` rows to callers without `emr.view`, wider than the dedicated endpoints' own guards | Server-side authorization bypass for custom roles; UI-only hiding is an anti-pattern | Conditional include gated on `emr.view`, both embeds | CLOSED by PET-MED-2 (+AMEND-1) |
| GAP-4 | Spec hygiene | Spec/code label drift; stale "pet edit create-only" deferred line | Doc rot | Reconcile to "Medical"; fix stale line | CLOSED by PET-MED-3 |
| GAP-5 | FR-05-05 (Must) | Allergies are free text; automated prescription allergy check can only string-match | Residual — structured/coded allergy entries needed eventually | Out of scope; backlog per tasks doc | RESIDUAL (backlog, agreed) |
| GAP-6 | ADR-0011 | Discharged-admission history deferred to this tab | Residual — future rollup scope | Out of scope; separate item | RESIDUAL (backlog, agreed) |

**Conflicts:** none. Option C creates no conflict between FR-03 and FR-05; it enforces their existing boundary.

---

## 6. Task review (PET-MED-1/2/3) — corrections

### PET-MED-1 — Fix silent cap / drill-in — **APPROVED with CORR-1**
- AC "visibly indicates more exist", link omission for non-`emr.view`, route-guard verification: all correct and testable. AMEND-2's restatement (pet-scoped drill-in, not record-scoped) is confirmed correct — adopt it.
- Endpoint claim verified: `GET /api/medical-records?petId=...` exists and suffices; "no new endpoint" holds.
- **CORR-1 (infeasibility as written):** `ClinicEMR.tsx` cannot currently be "pre-filtered to the pet" from outside — `selectedPetId` is local `useState(null)` with no URL/router input (`ClinicEMR.tsx:393`). PET-MED-1 MUST include a small `ClinicEMR.tsx` change: read an initial pet id from a URL search param (e.g. `/clinic/emr?petId=123`) or router state on mount. Therefore PET-MED-1's "Dependencies: none" is wrong for files touched — add `ClinicEMR.tsx` to the touch list (brainstorm's 3-5 file estimate still holds). Alternative (fetch full list inline in the Pets screen only) is acceptable but weaker UX; if chosen, drill-in AC must be rewritten. Default recommendation: query-param approach.

### PET-MED-2 — Server-side graceful degradation — **APPROVED with AMEND-1 confirmed + CORR-2**
- AMEND-1 (gate `vaccinations` too) is verified necessary; note the vaccinations embed is **uncapped and unprojected** (`pet.repository.ts:36`) — broader than the brainstorm reported. The conditional include must cover both.
- Feasibility confirmed: `resolvePermissions(userId, tenantId)` (cached, exported) lets the controller/service pass a `hasEmrView` flag into `findPetById` — no middleware redesign needed.
- **CORR-2 (AC addition):** add an explicit AC for the `vaccination.create`-without-`emr.view` custom-role edge: the "Add Vaccination" button (gated `Can perm="vaccination.create"`, `ClinicPets.tsx:629`) may still render while the list is absent. Decide and test the behavior (recommended: keep POST working — write permission is independently held — list simply stays hidden; document this in the spec update).
- Tenant-isolation AC correct: `findPetById` where-clause already scopes `tenantId`; conditional include adds no new query surface.

### PET-MED-3 — Naming + spec update — **APPROVED with CORR-3**
- Keep code label "Medical" (i18n/string-churn avoidance) — confirmed; update `04-pet-owner.md` to match.
- **CORR-3:** spec update must additionally document (a) the `?petId=` drill-in entry point into EMR from CORR-1, (b) the CORR-2 button-vs-list decision, and (c) fix the stale "pet edit create-only" deferred line (AMEND-2 second half) — `EditPetModal` exists at `ClinicPets.tsx:334+`.

Note: the "BA Step-3 sign-off addendum" pre-recorded in the tasks doc is hereby ratified as-is (AMEND-1, AMEND-2 both independently verified correct); this document supersedes it as the formal Step 3 artifact and adds CORR-1..CORR-3.

---

## 7. NFR impact, risks, dependencies

- **Performance:** conditional include *reduces* payload for gated callers; `resolvePermissions` is already cached (5-min) — negligible added latency. Consider (non-blocking) adding a `select` projection + cap to the vaccinations embed later; out of scope here.
- **Security:** net improvement — closes a server-side over-fetch (GAP-3). No plane-boundary impact (clinic plane only). No PII change.
- **Risks:** R-1 (Low) — clients other than `PetDetail` reading `pet.vaccinations`/`pet.medicalRecords` from `GET /api/pets/:id` could break for custom roles; mitigation: grep frontend for consumers before implementation, add to grill agenda. R-2 (Low) — `?petId=` param must be validated/ignored-if-unauthorized inside ClinicEMR (route guard already blocks non-`emr.view`).
- **Dependencies:** none external. PET-MED-2 depends on PET-MED-1 only via shared tab section (as stated).

## 8. Definition-of-Ready check

Objective stated ✓ · Actors/roles named ✓ · Permission codes assigned (§4) ✓ · Business rules (Option C boundary) ✓ · Exceptions covered (custom-role degradation, CORR-2 edge) ✓ · NFR impact noted ✓ · AC testable by @qa-agent (with CORR-1/CORR-2 applied) ✓ · Risks & dependencies recorded ✓ → **READY**, conditional on CORR-1..CORR-3 being folded into the plan.

## 9. Hand-off

Next: Step 3.5 `/grill-with-docs` (MANDATORY) — bring R-1, CORR-1 design choice (query-param vs inline fetch), and CORR-2 edge to the grill agenda. Then @pm-agent `/write-plan`.
