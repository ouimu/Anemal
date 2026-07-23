# BA Validation & Sign-off — Per-Tenant Storage Provider: Custom Path Driver (Sub-project 1 of 3)

**Agent:** @ba-agent (Step 3 of Anemal pipeline)
**Date:** 2026-07-23
**Inputs reviewed:**
- Design: `docs/superpowers/specs/2026-07-23-storage-custom-path-driver-design.md`
- ADR-0022 + live source: `src/backend/config/storage-driver.ts`, `services/pet.service.ts`, `services/emr-attachment.service.ts`, `routes/settings.routes.ts`, `services/tenant-settings.service.ts`, `prisma/schema.prisma`
**Skills applied:** `anemal-rbac-matrix` (+ `references/permission-matrix.md`), `anemal-db-context`, `anemal-ba-toolkit`
**Gate role:** Gates Step 3.5 (`/grill-with-docs`) and Step 4 (`/write-plan`). Verdict at foot.

---

## 1. Requirement validation against workflows & locked decisions

Objective is clear and traceable: a clinic keeps patient files on storage it controls (mapped network drive / server folder now; own cloud later) — direct continuation of ADR-0022's stated pre-production goal. All five locked decisions are respected and workable:

| Locked decision | BA assessment |
|---|---|
| 1. Custom-path → GDrive → OneDrive, one branch | No BA objection; sequencing sound (filesystem driver exercises the seam before OAuth complexity). |
| 2. Migration choice per switch | Sound — **but the spec mis-defers it** (see R-2): `local ↔ custom_path` is *already* a switch the moment this ships. |
| 3. Error, no silent fallback | Correct and already how both services behave (upload error surfaces; `exists()` miss → 404 "file is missing"). Matches "server is the security boundary" — no hidden write path. |
| 4. Admin-only, per-tenant, in Clinic Settings | Matches matrix (all `clinic.*` config codes are admin-only E/-/-). Per-tenant (not per-branch) is right: storage keys are tenant-scoped (`tenants/{tid}/...`), branches share them today. |
| 5. Real test-write before save | Necessary but **not sufficient** as the only validation (see R-1). |

Architecture claim verified: `LocalDiskDriver` already accepts an arbitrary `baseDir`; a UNC path/drive letter is just another `baseDir`. No new driver class needed. ✔ Correct and minimal.

**Two spec corrections (minor):**
- `getStorageDriver(tenantId: string)` — tenant IDs are `number` (Prisma `Int`) throughout the backend. Signature is `(tenantId: number)`.
- `getStorageDriver` becomes **async** (DB lookup). All 5 call sites (`pet.service.ts` ×2, `emr-attachment.service.ts` ×3) must `await` it — trivial, but the plan must list them. Resolve the driver **once per service operation** and reuse it (e.g. `uploadPetPhoto` deletes the old key then saves — both must use the same resolved driver, never two lookups).

---

## 2. Authorization design review

### 2.1 Plane & deny-by-default
Both new endpoints clinic-plane, behind `authMiddleware` + `requirePlane('clinic')` + explicit `requirePermission` — ✔. No platform-plane involvement; `TenantStorageConfig` holds no PII. Plane separation intact.

### 2.2 🟠 R-3 — Reuse an existing code, but the *right* one: `clinic.integrations.edit`, not `clinic.profile.edit`

The spec's instinct (no new permission code) is correct — a distinct `clinic.storage.edit` is **not** warranted. But the chosen code is the wrong existing one:

- `clinic.profile.edit` is catalogued as "Clinic settings (**name/logo/addr/taxId**)" — business identity data. The VAT precedent (ADR-0020) fit that class; a **server filesystem pointer does not**.
- `clinic.integrations.edit` ("LINE / SMS / Lab keys" — external infrastructure config, admin-only E/-/-) is the exact risk class, and the routes file already carries the pattern this feature needs: `PUT /clinic/integrations` + `POST /clinic/integrations/test` mirrors `PUT /clinic/storage-config` with its test-write.
- **Concrete risk of profile.edit:** a clinic that cloned a custom "office manager" role to let someone update the address/logo would *silently* also grant relocation of the entire file store. Granting integrations.edit, by contrast, already means "may repoint external infrastructure."
- **Forward consistency:** sub-projects 2/3 (Google Drive / OneDrive OAuth connect) unambiguously belong to the integrations class. Choosing integrations.edit now avoids a mid-branch permission flip.

Read side: keep `clinic.profile.view` for `GET /clinic/storage-config` (there is no `clinic.integrations.view`; integration fields are already readable — masked — via `GET /clinic` under profile.view). Note: doctor/staff hold `clinic.profile.view`, so the server path is visible to them. A path is not a secret; accepted with a note. Default matrix regression: none — both candidate write codes are admin-only, so no role gains or loses access either way.

**Permission decision (format per BA skill):**
```
Module.Action: clinic.integrations.edit (write) / clinic.profile.view (read)
Default roles: clinic_admin (write); all three (read)   Configurable: yes (custom roles)
Rationale: storage location = external-infrastructure config, same class as LINE/SMS/Lab keys;
           test-write mirrors the existing integrations/test pattern; GDrive/OneDrive OAuth lands here next.
Risk if wrong: profile.edit reuse lets identity-editing custom roles silently redirect the file store.
```

### 2.3 Endpoint count
2 new endpoints — under the Ponytail threshold (≤3). A dedicated `PUT` is justified by the test-write side effect (same reason `integrations/test` exists). Optional simplification for write-plan: fold the *read* into the existing `GET /clinic` payload and keep only the `PUT` (1 new endpoint); not required.

---

## 3. Gap analysis

### 3.1 🔴 R-1 (blocking) — `customBasePath` is a clinic-plane-controlled arbitrary server filesystem pointer

Test-write alone validates *reachability*, not *legitimacy*. A clinic admin (any tenant, any custom role holding the write permission) can submit any path the Node service account can touch:

- **Arbitrary write:** test-write drops a marker file in any writable server directory (app dir, a statically-served dir, scheduled-task folders...). Subsequent uploads then write **attacker-chosen bytes** (upload content passes MIME sniffing trivially) to `{anyDir}/tenants/{tid}/...`.
- **Filesystem probe oracle:** the spec's per-reason 400s (path not found / access denied / not a directory) let a tenant admin enumerate server directory structure and permissions.
- **Delete:** photo-replace best-effort delete fires under the chosen base (key-prefix-confined, so own-tenant keys only — contained, but still admin-directed deletion at an arbitrary base).
- **Symlink residual:** `resolveSafePath` is lexical (`path.resolve`, no `realpath`); a symlink under an admin-chosen base escapes it. Marginal today (planting a symlink needs server FS access already) but worth an ADR note.

**Required fix — operator-controlled allowlist of roots (config, not code the tenant can influence):**
1. New env `STORAGE_ALLOWED_ROOTS` (path-separator-delimited absolute paths, e.g. `D:\clinic-storage;\\nas01\vetfiles`). `PUT /clinic/storage-config` with `provider=custom_path` **rejects any `customBasePath` not resolving under one of these roots** (resolve → prefix-compare, same technique as `resolveSafePath`). Unset/empty ⇒ `custom_path` cannot be enabled at all (deny-by-default).
2. `customBasePath` must be an **absolute** path (relative paths resolve against process CWD — non-deterministic); trim + normalize before compare and persist.
3. Keep the test-write as the second gate (reachability), after the allowlist gate (legitimacy). With the allowlist in front, the per-reason error messages stop being a server-wide probe oracle and become genuinely helpful — keep them.
4. **Extend ADR-0022's G1 production boundary:** `custom_path` is a filesystem-class provider. The G1 boot guard ("local disk refuses `NODE_ENV=production`") currently can't see per-tenant runtime config, so it must be restated: in production, `PUT` with `provider=custom_path` (and any runtime resolution of a filesystem-class driver) is refused unless `ALLOW_LOCAL_STORAGE_IN_PROD=true`. Without this, any tenant setting `custom_path` silently bypasses G1.

### 3.2 🟠 R-2 — the spec's migration deferral is factually wrong for its own scope

Spec §out-of-scope says decision 2 "applies once more than one real provider exists to switch between." **This sub-project creates that situation**: `local → custom_path` (and back) is a switch. A tenant with existing attachments/photos who saves a custom path will find **every previously uploaded file 404s** ("Attachment file is missing" / "Photo file is missing") because reads now resolve against the new base. DB rows survive; files are stranded at the old base.

**Required minimum for this sub-project** (full migration tooling stays deferred): on provider/path change where the effective base changes, the UI must present an explicit informed confirmation — "existing files stay at `<old base>` and will not be visible until you move `<old>/tenants/<id>` to `<new>/tenants/<id>` yourself" — i.e. decision 2's "leave in place" choice made *knowingly*, not silently. Add an AC for it. (A read-time fallback to the old base is rejected: it contradicts decision 3's error-not-fallback principle and would mask half-migrated states.)

### 3.3 Tenant isolation of `TenantStorageConfig` — ✔ with conditions

- One row per tenant, PK/FK `tenantId` (Int, FK → `tenants`, `onDelete: Cascade` like `TenantSettings`). All access through a repo that takes `tenantId` from the JWT — never from the body/params. Iron rule satisfied; no cross-tenant read/write path exists if the repo is written per `anemal-db-context`.
- **Cross-tenant storage isolation survives even overlapping bases:** if tenant A points at tenant B's base (or the global `ATTACHMENT_DIR`), A still cannot read/delete B's files — every key is server-built with A's own `tenants/{A}/` prefix, and the read-side guards (`assertStorageKeyPrefix`, `isOwnTenantPhotoKey`) hold regardless of base. Verified against live source. Two tenants sharing one base cannot collide on keys. No dedupe/uniqueness constraint on `customBasePath` needed.
- Zero-config tenants: absence of a row ⇒ env-default `LocalDiskDriver` — no backfill, no change to `createCustomer()` provisioning, existing driver tests untouched. ✔ Clean default. AC: `getStorageDriver(tenantId)` unit test for the no-row case (already in spec §Testing).

### 3.4 🟠 R-4 — audit gap vs the `TenantSettings` precedent

Every existing clinic-config write (`PUT /clinic`, VAT, integrations) flows through `updateSettings()` and lands field-by-field in `settings_audit_log`. The spec's new table + new endpoint **bypasses that audit for the single most security-sensitive clinic setting shipped to date**. Required: `PUT /clinic/storage-config` writes `settings_audit_log` entries (tableName `tenant_storage_config`, old/new provider + path, `changedBy`) on every accepted change.

**Solution option (record the decision):** (a) *Dedicated `TenantStorageConfig` table* (spec) — pros: clean home for sub-project 2/3's encrypted OAuth token columns, keeps `TenantSettings` from bloating; cons: must hand-wire audit (R-4). (b) *Two columns on `TenantSettings`* (`storageProvider`, `storageCustomBasePath`) — pros: audit + get-or-create + admin guard free, exact ADR-0020 VAT precedent, zero new table; cons: OAuth token columns would later bloat `TenantSettings` or force a table anyway. **BA recommendation: keep the dedicated table** — justified *only* by the locked 3-provider lineage on this branch — with R-4 as the compensating requirement. If grill overturns the lineage, (b) becomes the ponytail answer.

### 3.5 Race conditions — acceptable with one rule

- **Config change mid-upload:** an in-flight upload resolved its driver at operation start; the file lands at the old base while the row now points elsewhere — same stranded-file class as R-2, covered by the R-2 warning ("files uploaded during the switch may also need moving"). Frequency ≈ admin action × in-flight upload; accepted, note in ADR.
- **Within one operation:** rule stated in §1 — resolve driver once per service operation; never re-fetch between the delete-old and save steps.
- **TOCTOU on test-write** (drive unmounts after save): decision 3 already covers it — runtime error, user retries. ✔
- **No config caching for now:** a per-operation DB point-read on a PK is cheap at current scale; caching would *worsen* switch staleness. Revisit only with measured need (NFR note).

### 3.6 Multi-branch / ops concerns

- Branches share tenant storage (keys carry no `branchId`) — consistent with decision 4 and current key scheme. No per-branch config; do not add one (YAGNI).
- **Ops trap worth a UI hint:** the path is evaluated on the *server*, not the admin's PC — and on Windows, mapped drive letters are per-user-session and typically **invisible to a service account**. Recommend the UI hint + error copy say "path on the clinic server; prefer UNC form `\\server\share\...`". The test-write catches it, but the failure will read as "path not found" for a drive the admin can plainly see on their own machine — pre-empt the support ticket.
- Enum note: match the `vatMode` precedent (`VarChar` + app-level validation) or a Prisma enum with future values pre-declared — either fine; db-agent's call.

---

## 4. NFR impact

- **Security:** net negative until R-1 lands (arbitrary FS pointer); net acceptable after (operator-bounded roots + tenant-prefix keys + existing read guards + G1 extension). R-4 restores audit parity.
- **Performance:** +1 PK point-read per storage operation (incl. per-image on photo grids — N reads per page). Negligible now; documented, uncached by design (§3.5).
- **Availability:** a dead network path degrades *that tenant only*, surfacing as the existing retryable upload/404 read errors — correct blast radius, no cross-tenant impact.
- **Maintainability:** `getStorageDriver(tenantId)` becomes *the* provider switch point ADR-0022 promised — sub-projects 2/3 slot in without touching call sites again. ✔

---

## 5. Risk register

| ID | Risk | Sev | Mitigation | Owner |
|---|---|---|---|---|
| R-1 | Tenant-admin-supplied `customBasePath` = arbitrary server FS write/probe/delete | **High** | Operator allowlist `STORAGE_ALLOWED_ROOTS` (deny-by-default when unset) + absolute-path rule + G1 extension to `custom_path`; test-write demoted to second gate | dev — **must be in plan** |
| R-2 | Provider switch strands existing files (silent 404s) | **High (data-visibility)** | Informed switch-time confirmation + manual-move instruction (`tenants/{tid}/` subtree); AC required | dev/uiux |
| R-3 | `clinic.profile.edit` reuse over-grants via identity-editing custom roles | Med | Guard write with existing `clinic.integrations.edit` | dev |
| R-4 | Storage config change escapes `settings_audit_log` | Med | Audit entries on every accepted `PUT` | dev |
| R-5 | Windows mapped-drive letters invisible to the service account | Low | UNC-path guidance in UI hint + error copy | uiux |
| R-6 | Symlink under an approved root escapes lexical path guard | Low | ADR note; roots are operator-chosen, residual accepted | operator |

---

## 6. Definition-of-Ready check

| Criterion | Status |
|---|---|
| Objective stated | ✔ |
| Actors/roles named | ✔ (clinic_admin; write/read codes per §2.2) |
| Permission codes assigned & correct | ⚠ — change write guard to `clinic.integrations.edit` (R-3) |
| Business rules / isolation listed | ⚠ — R-1 allowlist + G1 extension missing from spec |
| Exceptions covered | ⚠ — R-2 switch-time behavior unstated |
| NFR impact noted | ✔ (§4) |
| Acceptance criteria testable | ⚠ — add ACs: allowlist reject, non-allowlisted-root reject in prod, switch warning, audit row, no-config default, async call-site regression |
| Risks & dependencies recorded | ✔ (§5) |

---

## 7. Verdict

The core architecture is right and pleasingly small — reuse `LocalDiskDriver` with a per-tenant `baseDir`, resolve at `getStorageDriver(tenantId)`, default cleanly on absence, key-level tenant isolation already holds even for overlapping bases. All five locked user decisions are honored. It is **not yet ready** because the design treats "the path works" as "the path is allowed," mis-defers the switch problem beyond its own scope, and drops the audit trail its own precedent established.

**Required changes before `/grill-with-docs` closes (fold into design + carry into grill):**
1. **(R-1)** `STORAGE_ALLOWED_ROOTS` operator allowlist (deny-by-default when unset), absolute-path requirement, and extension of ADR-0022 G1 so `custom_path` cannot silently bypass the production filesystem-storage gate.
2. **(R-2)** Switch-time informed confirmation + manual-move instruction; the "migration is out of scope" claim is corrected — the *choice UX* (leave-in-place, knowingly) is in scope now; only migration *tooling* is deferred.
3. **(R-3)** Write guard = existing `clinic.integrations.edit` (read stays `clinic.profile.view`). No new permission code.
4. **(R-4)** `settings_audit_log` entries on every accepted storage-config change; record the dedicated-table-vs-TenantSettings-columns decision (BA recommends dedicated table, justified solely by the locked 3-provider lineage).

**Non-blocking (write-plan items):** async `getStorageDriver(tenantId: number)` + 5 awaited call sites, resolve-once-per-operation rule, UNC/server-path UI hint, no-cache note, symlink residual in ADR.

---

**BA SIGN-OFF: REVISE — approve the architecture (per-tenant `baseDir` through existing `LocalDiskDriver`, clean default for config-less tenants, key-level isolation verified intact even across overlapping bases), but four changes are required first: (1) an operator-controlled `STORAGE_ALLOWED_ROOTS` allowlist — test-write proves reachability, not legitimacy; today's spec hands every clinic admin an arbitrary server-filesystem write/probe primitive and silently bypasses ADR-0022's G1 production gate; (2) switch-time informed confirmation — `local ↔ custom_path` is already a provider switch, so existing files stranding invisible at the old base is in THIS sub-project's scope, not the deferred one; (3) guard the write with existing `clinic.integrations.edit` (infrastructure-config class, and where Google Drive/OneDrive OAuth lands next), not `clinic.profile.edit`; (4) write `settings_audit_log` entries — the new table/endpoint otherwise makes the most sensitive clinic setting the only unaudited one. Fold these in, then proceed to /grill-with-docs.**
