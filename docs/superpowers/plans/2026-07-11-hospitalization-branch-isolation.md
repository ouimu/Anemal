# Plan — Hospitalization branch isolation (BOLA fix) — Package A

Date: 2026-07-11
Spec: `RecommendByCodex/03-hospitalization-branch-isolation.md`, `RecommendByCodex/04-claude-execution-guide.md`
BA sign-off: Step 3 (see session), amendments folded in below.
Grilling: `docs/adr/0014-hospitalization-branch-isolation.md` — all 4 gate questions resolved.
Branch: `fix/hospitalization-branch-isolation`
PR: backend-only, no migration/endpoint/dependency.

## Scope

Files touched:
- `src/backend/controllers/hospitalization.controller.ts`
- `src/backend/services/hospitalization.service.ts`
- `src/backend/models/hospitalization.repository.ts`
- `src/backend/tests/integration/hospitalization-branch-isolation.test.ts` (new)
- `docs/adr/0014-hospitalization-branch-isolation.md` (already written, step 3.5)
- `.claude/roadmap/ACTIVE/remaining-tasks.md` (remove the now-resolved backlog row, done at finish-branch/doc-sync step, not here)

4 files + 1 new test file = well under Ponytail's >15-file / >3-subsystem thresholds. 0 new endpoints, 0 new dependencies, 0 migrations.

## Target signatures (exact — TypeScript must force every call site)

`hospitalization.repository.ts`:
```ts
export function findActive(tenantId: number, branchId?: number | null) {
  return prisma.hospitalization.findMany({
    where: { tenantId, status: 'admitted', ...(branchId != null ? { branchId } : {}) },
    ...
  })
}

export function findById(tenantId: number, branchId: number | null | undefined, id: number) {
  return prisma.hospitalization.findFirst({
    where: { id, tenantId, ...(branchId != null ? { branchId } : {}) },
    ...
  })
}

export function findByIdWithCareCount(tenantId: number, branchId: number | null | undefined, id: number) {
  return prisma.hospitalization.findFirst({
    where: { id, tenantId, ...(branchId != null ? { branchId } : {}) },
    include: { _count: { select: { careLogs: true } } },
  })
}

export function update(tenantId: number, branchId: number | null | undefined, id: number, data: EditInput) {
  return prisma.hospitalization
    .updateMany({ where: { id, tenantId, ...(branchId != null ? { branchId } : {}) }, data: {...} })
    .then(() => findById(tenantId, branchId, id))
}

export function remove(tenantId: number, branchId: number | null | undefined, id: number) {
  return prisma.hospitalization.deleteMany({ where: { id, tenantId, ...(branchId != null ? { branchId } : {}) } })
}

export function markDischarged(tenantId: number, branchId: number | null | undefined, id: number) {
  return prisma.hospitalization
    .updateMany({ where: { id, tenantId, ...(branchId != null ? { branchId } : {}) }, data: { status: 'discharged', dischargedAt: new Date() } })
    .then(() => findById(tenantId, branchId, id))
}

// addCare unchanged signature (no branchId column on DailyInpatientCare) — defense
// rests entirely on the branch-scoped parent lookup in service.logCare.
export function addCare(tenantId: number, hospitalizationId: number, data: CareInput, performedBy?: number) { ... }
```

`hospitalization.service.ts` — `branchId` inserted as **required positional param before `id`** in every signature that takes an `id`:
```ts
export function listActive(tenantId: number, branchId: number | null | undefined) {
  return hospRepo.findActive(tenantId, branchId ?? undefined)
}

export async function getHospitalization(tenantId: number, branchId: number | null | undefined, id: number) {
  const h = await hospRepo.findById(tenantId, branchId, id)
  if (!h) throw new HospitalizationError('Hospitalization not found', 404)
  return h
}

export async function logCare(tenantId: number, branchId: number | null | undefined, id: number, data: CareInput, performedBy?: number) {
  const h = await getHospitalization(tenantId, branchId, id)   // branch-scoped parent lookup gates addCare
  if (h.status !== 'admitted') throw new HospitalizationError('Cannot log care for a discharged patient', 409)
  return hospRepo.addCare(tenantId, id, data, performedBy)
}

export async function editHospitalization(tenantId: number, branchId: number | null | undefined, id: number, data: EditInput) {
  const h = await getHospitalization(tenantId, branchId, id)
  if (h.status !== 'admitted') throw new HospitalizationError('Cannot edit a discharged admission', 409)
  return hospRepo.update(tenantId, branchId, id, data)
}

export async function deleteHospitalization(tenantId: number, branchId: number | null | undefined, id: number): Promise<void> {
  const h = await hospRepo.findByIdWithCareCount(tenantId, branchId, id)
  if (!h) throw new HospitalizationError('Hospitalization not found', 404)
  if (h.status !== 'admitted') throw new HospitalizationError(...)
  if (h._count.careLogs > 0) throw new HospitalizationError(...)
  await hospRepo.remove(tenantId, branchId, id)
}

// discharge already takes a required (non-nullable) branchId via requireBranchId(req) — unchanged contract, just
// route the same branchId value into getHospitalization instead of calling the 2-arg overload.
export async function discharge(tenantId: number, branchId: number, id: number, createdBy?: number) {
  const h = await getHospitalization(tenantId, branchId, id)
  if (h.status !== 'admitted') throw new HospitalizationError('Patient is not currently admitted', 409)
  const discharged = await hospRepo.markDischarged(tenantId, branchId, id)
  ...
}
```

`hospitalization.controller.ts`:
```ts
export async function listActive(req, res, next) {
  try {
    // ADR-0014 Q4: query branchId override removed — req.context.branchId only.
    res.json({ success: true, data: await svc.listActive(req.context!.tenantId, req.context?.branchId) })
  } catch (err) { next(err) }
}

export async function getHospitalization(req, res, next) {
  try { res.json({ success: true, data: await svc.getHospitalization(req.context!.tenantId, req.context?.branchId, Number(req.params.id)) }) }
  catch (err) { next(err) }
}

export async function edit(req, res, next) {
  try { res.json({ success: true, data: await svc.editHospitalization(req.context!.tenantId, req.context?.branchId, Number(req.params.id), req.body) }) }
  catch (err) { next(err) }
}

export async function remove(req, res, next) {
  try {
    await svc.deleteHospitalization(req.context!.tenantId, req.context?.branchId, Number(req.params.id))
    res.status(204).send()
  } catch (err) { next(err) }
}

export async function logCare(req, res, next) {
  try { res.status(201).json({ success: true, data: await svc.logCare(req.context!.tenantId, req.context?.branchId, Number(req.params.id), req.body, req.context!.userId) }) }
  catch (err) { next(err) }
}

// discharge: unchanged call shape (requireBranchId already used) — just confirm it still compiles against the new signature.
export async function discharge(req, res, next) {
  try { res.json({ success: true, data: await svc.discharge(req.context!.tenantId, requireBranchId(req), Number(req.params.id), req.context!.userId) }) }
  catch (err) { next(err) }
}
```

`admit` is untouched (ADR-0014 Q3 — out of scope).

## TDD slices (red → green, in order)

1. New test file scaffold: create tenant + 2 branches (Branch A, Branch B) + a second tenant (cross-tenant regression reuse), a `clinic_staff`-equivalent branch-scoped user pinned to Branch A via `userBranch`/`branchId`, and an all-branch admin user (`branchId: null`). Pattern to copy: `src/backend/tests/integration/appointmentDoctors.test.ts` lines 1–95 (tenant/branch/user/login scaffolding) — this is the closest existing precedent in the repo, already reviewed.
2. Failing test: `GET /:id` from Branch-A-scoped token on a Branch-B admission → expect 404 (currently 200). Thread `branchId` through `getHospitalization` → repository `findById` until green.
3. Failing tests: `PUT /:id`, `DELETE /:id`, `POST /:id/care`, `PUT /:id/discharge` from Branch-A-scoped token against a Branch-B admission → expect 404 in every case, **plus** assert DB state unchanged (re-`GET` the Branch-B admission with a Branch-B or admin token and confirm `reason`/`status`/`careLogs.length`/discharge invoice count are identical to before the attempted mutation). Thread branchId through `editHospitalization`/`deleteHospitalization`/`logCare`/`discharge` → repository `update`/`remove`/`findByIdWithCareCount`/`markDischarged` until green.
4. Failing test: `GET /active?branchId=<branchB>` from a Branch-A-scoped token → still returns only Branch A rows (query override ignored). Fix controller `listActive` to drop the query fallback.
5. Regression tests (must stay green, no new file needed — run existing suite): `hospitalization-crud.test.ts` (tenant isolation, edit/delete guards, care performer-name join), `phase4.test.ts`.
6. All-branch admin regression: admin token (`branchId` null) can still `GET`/`PUT`/`DELETE`/`POST care` a Branch-A **and** a Branch-B admission in the same tenant (both same-tenant branches visible). Discharge still requires a concrete branch (existing `requireBranchId` behavior, assert token without a selected branch gets whatever error `requireBranchId` already throws — do not change that error).
7. Full backend suite + `npm run build` (TypeScript compiles — this is also where any missed call site the compiler catches gets fixed, per the spec's "insert before id, not append" requirement).
8. Frontend build + test as a regression check only (no frontend files touched by this package).

## Non-goals (explicit, from ADR-0014 / spec "must not do")

- No UUID migration, no row-level security, no branch-RBAC redesign, no `transferred` status workflow.
- No admin query-filter param added to `/active` (nothing consumes it — would be speculative).
- No change to `admit`/`POST /` — `branchId = null` on new admissions stays allowed.
- No change to discharge's existing `requireBranchId` requirement.
- Do not touch `ClinicInpatient.tsx` or any frontend file (Package B territory).

## Verification commands

```powershell
cd D:\Development\AnimalClinic\src\backend
npm test -- --runInBand
npm run build

cd D:\Development\AnimalClinic\src\frontend
npm test -- --run
npm run build
```

## Definition of done

- All AC in `RecommendByCodex/03-hospitalization-branch-isolation.md` pass.
- New + existing focused suites pass, then full backend suite passes, `npm run build` clean.
- Frontend build/test pass unchanged (regression check).
- Ponytail gate: APPROVE (4 files + 1 test file, 0 new deps/endpoints/migrations).
- `@qa-agent` sign-off with adversarial ID-swap test present.
- `docs/adr/0014-hospitalization-branch-isolation.md` already committed; `.claude/specs/implementation-status-matrix.md`, `CLAUDE.md` phase table, and `.claude/roadmap/ACTIVE/remaining-tasks.md` stale-row removal happen at `/anemal-finish-branch` → `/anemal-HTML-updater`.
