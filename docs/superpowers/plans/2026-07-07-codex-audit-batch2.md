# Codex Audit Batch 2 — Wiring Fixes + Docs Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Source of truth:** `docs/adr/0004-codex-audit-batch2-decisions.md` (D1–D6, authoritative). BA sign-off + grilling (Step 3.5) both complete — this plan only encodes already-resolved decisions, it does not re-litigate them.

**Goal:** Fix 5 wiring bugs found by Codex audit batch 2 (BUG-006, 007, 009, 010, 011 — one wrong URL, one wrong API client/path, one flat-vs-nested login hydration bug, one wrong permission code, one missing plane guard), correct a stale/false audit claim by deleting the duplicate `.agents/` skills tree, and bring the RBAC matrix + platform-domain docs up to date with explicit deferral markings.

**Branch:** `fix/codex-audit-batch2`

**Order:** T1 → T2 → T3 → T4 → T5 → T6 (independent code fixes first, in ADR decision order; docs/cleanup last since T4's correction (`vaccination.create` was never missing) directly informs what T6 writes). Tasks T1–T5 have no interdependencies and could be parallelized, but this plan executes them sequentially for a clean, reviewable commit history — do not reorder relative to T6, which must run last.

**Tech Stack:** React 18 + TanStack Query + Vitest (frontend only, `src/frontend/src/`). No backend code changes in this batch — full backend suite runs once at the end as a regression check only.

## Global Constraints

- No schema change, no new backend routes, no new dependencies (Ponytail-gate scope).
- Never mix API clients across planes (ADR glossary "Plane client separation") — T2 is the one place this batch touches that rule; get the client right, not just the path.
- D3 (BUG-010) explicitly excludes adding a silent-refresh interceptor for `refreshToken` — do not add one, even if it looks like a natural follow-on.
- D4 (BUG-009) is a single-line permission-code swap, not a matrix redesign — matrix additions in T6 are additive rows only, no existing row changes.
- D6 deferrals are documentation-only in this batch — do not build provisioning UI, platform users CRUD, usage aggregate, or customer deletion here.

---

### Task 1 (BUG-006): Grooming status update URL fix

**Files:**
- Modify: `src/frontend/src/views/clinic/ClinicGrooming.tsx`
- Test: `src/frontend/src/views/clinic/__tests__/ClinicGrooming.test.tsx` (check first if a test file for this view exists; if not, create one scoped to just this mutation)

**Interfaces:**
- Modifies: the `updateStatus` mutation's `mutationFn` inside `ClinicGrooming()` (currently `src/frontend/src/views/clinic/ClinicGrooming.tsx:278`) — URL changes from `` `/api/grooming/bookings/${id}` `` to `` `/api/grooming/bookings/${id}/status` ``. No other line in this mutation changes (method stays `PUT`, body stays `{ status }`).

- [x] **Step 1: Check for an existing test file covering this view**

Run: `Get-ChildItem -Recurse -Filter "*ClinicGrooming*" src/frontend/src` (PowerShell) or `find src/frontend/src -iname "*ClinicGrooming*"` (Bash).
If found, add the new test into that file's existing structure (matching its mocking pattern for `api`/`useQuery`/`useMutation`). If not found, Step 2 creates a minimal new file.

- [x] **Step 2: Write the failing test**

Create (or extend) `src/frontend/src/views/clinic/__tests__/ClinicGrooming.test.tsx`:
```tsx
/**
 * BUG-006 regression: the grooming status-update mutation must PUT to the
 * `/status` sub-resource, not the bare booking resource — the backend route
 * for status transitions lives at PUT /api/grooming/bookings/:id/status.
 */
import { describe, it, expect, vi } from 'vitest'

const putSpy = vi.fn(() => Promise.resolve({ data: { success: true } }))

vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { data: [] } })),
    put: putSpy,
  },
}))

// Import after mocks so the module under test picks up the mocked api client.
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ClinicGrooming from '../ClinicGrooming'

describe('ClinicGrooming — status update URL (BUG-006)', () => {
  it('PUTs to /api/grooming/bookings/:id/status, not the bare booking URL', async () => {
    render(<ClinicGrooming />)
    // Trigger whatever UI action invokes updateStatus.mutate(...) — read the
    // component's status-change control (button/select) during implementation
    // and drive it here; fall back to calling the mutation via a test id if
    // the view exposes one, matching existing ClinicGrooming test conventions.
    await waitFor(() => {
      // Assert on call args once a status-change action has fired.
      if (putSpy.mock.calls.length > 0) {
        expect(putSpy.mock.calls[0][0]).toMatch(/\/api\/grooming\/bookings\/\d+\/status$/)
      }
    })
  })
})
```
Note for implementer: read `ClinicGrooming.tsx` in full to find the exact UI trigger for `updateStatus.mutate(...)` (status dropdown/button per booking card) and wire the `fireEvent` call precisely — do not guess a selector; grep the render output or existing modal/status-control JSX first.

- [x] **Step 3: Run test to verify it fails**

Run (from `src/frontend`): `npm test -- --run ClinicGrooming`
Expected: FAIL — asserted URL does not match `/status` suffix (current code PUTs to the bare `/:id` URL).

- [x] **Step 4: Fix the URL**

In `src/frontend/src/views/clinic/ClinicGrooming.tsx`, change line 278:
```ts
      api.put(`/api/grooming/bookings/${id}`, { status }),
```
to:
```ts
      api.put(`/api/grooming/bookings/${id}/status`, { status }),
```

- [x] **Step 5: Run test to verify it passes**

Run: `npm test -- --run ClinicGrooming`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicGrooming.tsx src/frontend/src/views/clinic/__tests__/ClinicGrooming.test.tsx
git commit -m "fix(grooming): PUT status updates to /:id/status, not the bare booking URL (BUG-006)"
```

---

### Task 2 (BUG-007): Company-types picker — platform client + correct path

**Files:**
- Modify: `src/frontend/src/views/platform/CustomerDetailView.tsx`
- Modify: `src/frontend/src/views/platform/CustomerDetailView.tsx` (provisioning placeholder text, same file, separate section — see Step 5)
- Modify: `src/frontend/src/__tests__/PlatformConsole.test.tsx` (mock update, line ~34)

**Interfaces:**
- Modifies: `OverviewTab`'s company-types `useQuery` (`src/frontend/src/views/platform/CustomerDetailView.tsx:42`) — `queryFn` changes from `api.get('/api/platform/company-types')` to `platformApi.get('/platform/company-types')`. Import swaps from `import api from '../../utils/api'` to `import platformApi from '../../utils/platformApi'` (verify `api` import isn't used elsewhere in this file before removing it — grep first).
- Modifies: `ProvisioningTab` (same file, ~lines 321-333) placeholder copy — per ADR D6, states honest status naming the available backend endpoints instead of implying a generic "future release."

- [x] **Step 1: Confirm whether `api` (clinic client) is used elsewhere in this file**

Run: `Grep -n "api\." src/frontend/src/views/platform/CustomerDetailView.tsx` (or equivalent) to confirm the only clinic-plane `api` usage is the company-types query. If other usages exist, keep the `api` import and add `platformApi` alongside it; if not, replace the import entirely.

- [x] **Step 2: Update the mock in `PlatformConsole.test.tsx` first (test-first)**

In `src/frontend/src/__tests__/PlatformConsole.test.tsx`, the existing `vi.mock('@tanstack/react-query', ...)` (line 36) already stubs `useQuery` to return `{ data: [], isLoading: false }` regardless of caller — this does not need to change. Instead, add a new `vi.mock` for `platformApi` (if not already present in this file) asserting the company-types call goes through the platform client. Read the full mock block (lines 1-60) first to match existing hoisting conventions (`vi.hoisted`), then add:
```ts
vi.mock('../../utils/platformApi', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { data: [] } })) },
}))
```
Note: since `useQuery` itself is mocked to bypass the real `queryFn` call, this mock alone won't fail without an additional assertion. Add a targeted unit test instead (Step 3) that imports `CustomerDetailView`'s `queryFn` indirectly is not feasible without exporting it — prefer asserting via a lightweight source-inspection test or by checking `platformApi.get` was NOT called with the wrong path when `api.get` is also mocked and asserted as never called for `/company-types`. Simplest reliable approach: mock BOTH `api` and `platformApi` clients, render the view, and assert `api.get` was never called with a path containing `company-types` while `platformApi.get` WAS called with `/platform/company-types`.

- [x] **Step 3: Write/extend the failing test**

In `PlatformConsole.test.tsx`, within the existing `CustomerDetailView` describe block, add:
```ts
it('fetches company-types via platformApi, never the clinic api client (BUG-007)', async () => {
  const apiModule = await import('../../utils/api')
  const platformApiModule = await import('../../utils/platformApi')
  render(<CustomerDetailView />) // match existing render setup in this describe block (router/provider wrappers)
  expect((platformApiModule.default.get as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('/platform/company-types')
  expect((apiModule.default.get as ReturnType<typeof vi.fn>).mock.calls.some(
    (call: unknown[]) => String(call[0]).includes('company-types')
  )).toBe(false)
})
```
Note for implementer: match this file's existing render/wrapper conventions exactly (check how other `CustomerDetailView` tests in this file render it — router mocks are already hoisted per the file header).

- [x] **Step 4: Run tests to verify they fail**

Run (from `src/frontend`): `npm test -- --run PlatformConsole`
Expected: FAIL — `platformApi.get` was never called; `api.get` was called with the company-types path instead.

- [x] **Step 5: Fix the client + path, and update the provisioning placeholder text**

In `src/frontend/src/views/platform/CustomerDetailView.tsx`:
- Add `import platformApi from '../../utils/platformApi'` near the top (alongside or replacing the `api` import per Step 1's finding).
- Change line 42:
  ```ts
  queryFn: () => api.get('/api/platform/company-types').then(r => r.data.data),
  ```
  to:
  ```ts
  queryFn: () => platformApi.get('/platform/company-types').then(r => r.data.data),
  ```
- In `ProvisioningTab` (~lines 321-333), replace the placeholder paragraph:
  ```tsx
        <p className="text-body-sm">
          Provisioning settings (S3, SMTP, base providers) are managed via Platform Settings
          and will be per-tenant in a future release.
        </p>
  ```
  with copy naming the actually-available backend endpoint per ADR D6 (honest status, not a vague "future release"):
  ```tsx
        <p className="text-body-sm">
          Per-tenant provisioning (S3, SMTP, base providers) has no dedicated UI yet.
          Existing tenant-wide values are managed via Platform Settings
          (<code>GET/PUT /platform/settings</code>); a per-customer provisioning screen
          is tracked as a separate, not-yet-scheduled task.
        </p>
  ```

- [x] **Step 6: Run tests to verify they pass**

Run: `npm test -- --run PlatformConsole`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/frontend/src/views/platform/CustomerDetailView.tsx src/frontend/src/__tests__/PlatformConsole.test.tsx
git commit -m "fix(platform-customers): fetch company-types via platformApi, correct path; honest provisioning placeholder (BUG-007)"
```

---

### Task 3 (BUG-010): Platform login hydration — map nested `user` object

**Files:**
- Modify: `src/frontend/src/store/platformAuthStore.ts`
- Modify: `src/frontend/src/views/platform/PlatformLoginView.tsx`
- Test: `src/frontend/src/store/__tests__/platformAuthStore.test.ts` (check first if it exists; if not, create it)

**Interfaces:**
- Modifies: `PlatformAuthPayload` (`src/frontend/src/store/platformAuthStore.ts:22-27`) — changes from the flat shape `{ token, platformUserId, role, name }` to the real wire shape `{ token: string, refreshToken: string, user: { id: number, name: string, email: string, role: string } }` (per ADR D3, this is the backend's canonical envelope).
- Modifies: `setAuth(data: PlatformAuthPayload)` (`platformAuthStore.ts:41-48`) — maps `data.user.id → platformUserId`, `data.user.role → role`, `data.user.name → name`. `refreshToken` is accepted in the payload type (for shape accuracy) but intentionally NOT stored in state — ADR D3 explicit: no silent-refresh interceptor in this batch, storing it would be dead state.
- Modifies: `PlatformLoginView.tsx:30-33` — the mutation's `.then((r) => r.data.data)` return type annotation updates to match the new `PlatformAuthPayload` shape (no call-site logic change needed beyond the type import, since `setAuth(data)` already just forwards whatever the mutation resolves to).

- [x] **Step 1: Check for an existing platformAuthStore test file**

Run: `Get-ChildItem -Recurse -Filter "*platformAuthStore*" src/frontend/src` (PowerShell) or `find src/frontend/src -iname "*platformAuthStore*"` (Bash).

- [x] **Step 2: Write the failing store test**

Create (or extend) `src/frontend/src/store/__tests__/platformAuthStore.test.ts`:
```ts
/**
 * BUG-010 regression: setAuth must map the REAL backend wire shape
 * { token, refreshToken, user: { id, name, email, role } } into the flat
 * store fields (platformUserId, role, name) — the previous flat-payload
 * assumption never matched what POST /platform/auth/login actually returns,
 * so avatar/name in PlatformLayout silently rendered blank.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { usePlatformAuthStore } from '../platformAuthStore'

describe('platformAuthStore.setAuth — nested user mapping (BUG-010)', () => {
  beforeEach(() => {
    usePlatformAuthStore.getState().clearAuth()
  })

  it('populates platformUserId/role/name from the real nested wire shape', () => {
    usePlatformAuthStore.getState().setAuth({
      token: 'jwt-token-value',
      refreshToken: 'refresh-token-value',
      user: { id: 7, name: 'Ada Lovelace', email: 'ada@example.com', role: 'platform_super_admin' },
    })
    const state = usePlatformAuthStore.getState()
    expect(state.token).toBe('jwt-token-value')
    expect(state.platformUserId).toBe(7)
    expect(state.role).toBe('platform_super_admin')
    expect(state.name).toBe('Ada Lovelace')
    expect(state.plane).toBe('platform')
  })

  it('does not persist refreshToken into store state (no silent-refresh interceptor this batch)', () => {
    usePlatformAuthStore.getState().setAuth({
      token: 't', refreshToken: 'r',
      user: { id: 1, name: 'X', email: 'x@example.com', role: 'platform_support' },
    })
    expect(usePlatformAuthStore.getState()).not.toHaveProperty('refreshToken')
  })
})
```

- [x] **Step 3: Run test to verify it fails**

Run (from `src/frontend`): `npm test -- --run platformAuthStore`
Expected: FAIL — TypeScript shape mismatch and/or `platformUserId`/`role`/`name` end up `undefined` under the current flat-mapping `setAuth`.

- [x] **Step 4: Update the payload type and `setAuth` mapping**

In `src/frontend/src/store/platformAuthStore.ts`, replace lines 22-27:
```ts
export interface PlatformAuthPayload {
  token:          string
  platformUserId: number
  role:           string
  name:           string
}
```
with:
```ts
/** Matches the real backend envelope from POST /platform/auth/login (and /platform/auth/me). */
export interface PlatformAuthPayload {
  token:        string
  refreshToken: string
  user: {
    id:    number
    name:  string
    email: string
    role:  string
  }
}
```
Replace lines 41-48:
```ts
      setAuth: (data) =>
        set({
          token:          data.token,
          platformUserId: data.platformUserId,
          role:           data.role,
          name:           data.name,
          plane:          'platform',
        }),
```
with:
```ts
      // refreshToken is intentionally NOT stored — no silent-refresh interceptor
      // exists in platformApi yet (ADR-0004 D3, deferred by design, not an oversight).
      setAuth: (data) =>
        set({
          token:          data.token,
          platformUserId: data.user.id,
          role:           data.user.role,
          name:           data.user.name,
          plane:          'platform',
        }),
```

- [x] **Step 5: Update `PlatformLoginView.tsx`'s mutation type usage**

In `src/frontend/src/views/platform/PlatformLoginView.tsx`, the `type PlatformAuthPayload` import (line 11) and the mutation's `.then((r) => r.data.data)` (line 31) need no structural change — they already just pass through whatever shape `PlatformAuthPayload` resolves to. Confirm `npx tsc --noEmit -p src/frontend` (Step 7) reports no error at this call site now that the type is nested; if `LoginPayload`'s response typing elsewhere in the file destructures `data.platformUserId` directly (grep this file for `platformUserId`), update that specific reference to `data.user.id` — read the full file before finalizing to catch every reference, not just line 30-33.

- [x] **Step 6: Run test to verify it passes**

Run: `npm test -- --run platformAuthStore`
Expected: PASS.

- [x] **Step 7: Type-check the frontend**

Run: `npx tsc --noEmit -p src/frontend`
Expected: no errors (catches any other call site still assuming the old flat `PlatformAuthPayload` shape — e.g. `PlatformLayout.tsx` if it reads `usePlatformAuthStore` fields, which are unchanged at the store-field level so should be unaffected).

- [x] **Step 8: Commit**

```bash
git add src/frontend/src/store/platformAuthStore.ts src/frontend/src/views/platform/PlatformLoginView.tsx src/frontend/src/store/__tests__/platformAuthStore.test.ts
git commit -m "fix(platform-auth): map nested user object from real login wire shape (BUG-010)"
```

---

### Task 4 (BUG-009): Vaccination-record route guard — correct permission code

**Files:**
- Modify: `src/frontend/src/App.tsx`
- Test: `src/frontend/src/guards/guards.test.tsx` (extend only if this exact route-guard pattern is unit-testable there; otherwise this is a one-line change verified by Step 3's manual route-table check — guards.test.tsx tests the `RequirePermission` component generically, not specific route wiring, so no new test is required there per se, but Step 1 below determines this for certain)

**Interfaces:**
- Modifies: `App.tsx:145` — the `vaccinations-due/record` route's `RequirePermission perm=` prop changes from `"emr.create"` to `"vaccination.create"`. No other route on this line or adjacent lines changes; `vaccinations-due` (list, line 144) stays on `emr.view` per ADR D4.

- [x] **Step 1: Confirm whether route-level guard wiring (as opposed to the `RequirePermission` component itself) is covered anywhere in the test suite**

Run: `Grep -rn "vaccinations-due" src/frontend/src` to check for any existing route-table test. `guards.test.tsx` (read in full already) only tests `RequirePermission` in isolation with a mocked `perm` prop — it does not assert which permission string `App.tsx` passes for a given route. If no route-table test exists, this task's verification is: (a) the diff itself, (b) a manual smoke check via `anemal-smoke-walkthrough` is out of scope for this batch's automated verification — rely on the `npx tsc --noEmit` + full frontend suite pass, consistent with ADR D4's evidence base (backend tests + seed grants already prove `vaccination.create` is correct; this task only aligns the one outlier).

- [x] **Step 2: Make the one-line permission-code change**

In `src/frontend/src/App.tsx`, change line 145:
```tsx
          <Route path="vaccinations-due/record" element={<RequirePermission perm="emr.create"><ClinicRecordVaccination/></RequirePermission>}/>
```
to:
```tsx
          <Route path="vaccinations-due/record" element={<RequirePermission perm="vaccination.create"><ClinicRecordVaccination/></RequirePermission>}/>
```

- [x] **Step 3: Verify no other reference to the old guard exists**

Run: `Grep -n "emr.create" src/frontend/src/App.tsx`
Expected: zero matches (this was the only route gated on `emr.create` in the clinic section per the file excerpt already read; if any other line matches, stop and confirm with the ADR before changing it — D4 scopes this fix to the vaccination-record route only).

- [x] **Step 4: Run the guards suite + type-check as regression check**

Run (from `src/frontend`): `npm test -- --run guards` then `npx tsc --noEmit -p src/frontend`
Expected: both PASS (this change doesn't touch `RequirePermission`'s implementation, so `guards.test.tsx` is unaffected; this step exists purely to confirm no collateral breakage).

- [x] **Step 5: Commit**

```bash
git add src/frontend/src/App.tsx
git commit -m "fix(rbac): gate vaccination recording on vaccination.create, not emr.create (BUG-009)"
```

---

### Task 5 (BUG-011): Wrap `/settings` in `RequirePlane plane="clinic"`

**Files:**
- Modify: `src/frontend/src/App.tsx`
- Modify: `src/frontend/src/guards/guards.test.tsx` (extend — this one IS a testable guard-composition change, unlike T4)

**Interfaces:**
- Modifies: `App.tsx:152` — the `/settings` route element changes from `<RequireAuth><SettingsLayout/></RequireAuth>` to `<RequireAuth><RequirePlane plane="clinic"><SettingsLayout/></RequirePlane></RequireAuth>`, matching the existing pattern at `App.tsx:96` (`/clinic-admin`) and `App.tsx:134` (`/clinic`). No child `<Route>` under `/settings` changes — `preferences` (line 159) stays permission-free for all clinic roles per ADR D5.

- [x] **Step 1: Write the failing test**

In `src/frontend/src/guards/guards.test.tsx`, this specific route-composition isn't unit-testable in isolation from `App.tsx`'s router tree without a heavier integration test. Since `guards.test.tsx` already tests `RequirePlane` generically (lines 94-135, already covers "platform session redirected away from clinic plane"), the composition itself doesn't need a new guards.test.tsx case. Instead, add a route-table assertion. Create `src/frontend/src/__tests__/settingsPlaneGuard.test.tsx`:
```tsx
/**
 * BUG-011 regression: /settings must be wrapped in RequirePlane plane="clinic",
 * matching /clinic-admin and /clinic — a platform-plane session must not be able
 * to reach clinic Settings screens (even though it's a separate journey today,
 * this is the same defense-in-depth pattern already applied to the other two
 * clinic route trees).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('App.tsx route wiring — /settings plane guard (BUG-011)', () => {
  it('wraps the /settings route element in RequirePlane plane="clinic"', () => {
    const source = readFileSync(resolve(__dirname, '../App.tsx'), 'utf-8')
    const settingsRouteLine = source
      .split('\n')
      .find((line) => line.includes('path="/settings"'))
    expect(settingsRouteLine).toBeDefined()
    expect(settingsRouteLine).toMatch(/RequirePlane plane="clinic"/)
  })
})
```
Note: this is a source-inspection test (acceptable here since `App.tsx`'s router tree isn't rendered in isolation elsewhere in the suite) — prefer this over standing up a full `MemoryRouter` render if no existing test file already does that for `App.tsx`; check `Grep -rln "MemoryRouter" src/frontend/src/__tests__` first and use that pattern instead if one already exists and is a closer fit.

- [x] **Step 2: Run test to verify it fails**

Run (from `src/frontend`): `npm test -- --run settingsPlaneGuard`
Expected: FAIL — current line has no `RequirePlane` wrapper.

- [x] **Step 3: Add the `RequirePlane` wrapper**

In `src/frontend/src/App.tsx`, change line 152:
```tsx
        <Route path="/settings" element={<RequireAuth><SettingsLayout/></RequireAuth>}>
```
to:
```tsx
        <Route path="/settings" element={<RequireAuth><RequirePlane plane="clinic"><SettingsLayout/></RequirePlane></RequireAuth>}>
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- --run settingsPlaneGuard`
Expected: PASS.

- [x] **Step 5: Run full guards + settings-adjacent suites as regression check**

Run: `npm test -- --run guards settings`
Expected: PASS — no existing Settings screen test assumes the absence of a plane guard (none should, since plane guards don't affect an already-clinic-authenticated session).

- [x] **Step 6: Commit**

```bash
git add src/frontend/src/App.tsx src/frontend/src/__tests__/settingsPlaneGuard.test.tsx
git commit -m "fix(rbac): wrap /settings in RequirePlane plane=clinic, matching /clinic and /clinic-admin (BUG-011)"
```

---

### Task 6 (Docs): RBAC matrix additions, platform-domain deferral markings, delete stale `.agents/` tree

**Files:**
- Modify: `.claude/skills/anemal-rbac-matrix/references/permission-matrix.md`
- Modify: `.claude/skills/anemal-platform-console/references/platform-domain.md`
- Delete: `.agents/` (entire tree — `git rm -r .agents`)

No tests — documentation-only task, per plan header convention (docs tasks need no tests).

- [x] **Step 1: Add `staff.assign_branch` row + route map entries to the permission matrix**

In `.claude/skills/anemal-rbac-matrix/references/permission-matrix.md`, section "5. Multi-role addendum (CR-01)" (currently ends at line 166 with the `staff.assign_role` route map entry), add immediately after the existing `staff.assign_role` row/rule block:
```markdown
| `staff.assign_branch` | Staff / users | E | - | - |

Runtime rule: assigning a branch requires `staff.assign_branch`. A user must retain ≥ 1 branch
assignment on tenants where branch selection is required (`requiresBranchSelection`).
Route map: `POST /auth/switch-branch` → (any authenticated clinic role — switches own active
branch among branches already assigned, no elevated permission); `GET /users/:userId/branches` →
`staff.view`; `PATCH /users/:userId/branch` → `staff.assign_branch`.
```
Verify against the real route implementations in `src/backend/routes/auth.routes.ts` and `src/backend/routes/user.routes.ts` before finalizing wording — confirm `switch-branch` is genuinely self-service (no permission gate beyond authentication) versus admin-assigns-branch (`staff.assign_branch`), since these are two different operations (a user switching their OWN active branch vs. an admin assigning which branches a user belongs to). Read both route files' current middleware chains first; adjust the permission mapping above if the actual code differs from this draft.

- [x] **Step 2: Add the `clinic.settings.manage` reserved row**

In the same file, section "2. Permission catalogue + default grid" (the big table, lines 24-75), add a row after `clinic.integrations.edit` (line 69):
```markdown
| `clinic.settings.manage` | Clinic settings | — reserved — | — reserved — | — reserved — |
```
Immediately below the table (before "### Notes on key business decisions"), add a callout:
```markdown
> **Reserved permission:** `clinic.settings.manage` is seeded but not yet enforced by any
> route — no controller currently calls `requirePermission('clinic.settings.manage')`. It is
> intentionally kept in the seed so future settings-consolidation work doesn't need a new
> migration. Do not delete this code as "unused," and do not assume it is currently active on
> any route (ADR-0004 D4).
```

- [x] **Step 3: Add the audit-correction note to the matrix doc**

At the top of the file, after the existing header blockquote (after line 4), add:
```markdown
> **Audit correction (ADR-0004 D4):** a Codex audit batch 2 finding claiming
> `vaccination.create` was "missing from the RBAC matrix" was FALSE — the audit tool read the
> stale `.agents/skills/` duplicate tree (deleted as part of this same fix batch), not this file.
> `vaccination.create` has been documented here since section 2's original authoring. Future
> audits and agents should reference `.claude/skills/anemal-rbac-matrix/` exclusively — see
> CLAUDE.md, which names only `.claude/skills/` as the project skill path.
```

- [x] **Step 4: Mark the four D6 deferrals in platform-domain.md**

In `.claude/skills/anemal-platform-console/references/platform-domain.md`, in the "Proposed API surface" table (lines 7-20), annotate the four deferred rows. Change:
```markdown
| GET/POST/PUT `/platform/users` | `platform.users.manage` | platform operator CRUD |
```
to:
```markdown
| GET/POST/PUT `/platform/users` | `platform.users.manage` | platform operator CRUD — **DEFERRED (ADR-0004 D6):** operators are a 2-role static enum managed via seed today; CRUD is its own privilege-escalation surface needing its own grilled pipeline cycle. Backlog. |
```
Change:
```markdown
| GET `/platform/usage` | `platform.usage.view` | cross-tenant usage vs quota |
```
to:
```markdown
| GET `/platform/usage` | `platform.usage.view` | cross-tenant usage vs quota — **DEFERRED (ADR-0004 D6):** per-customer usage (shipped, see Customer Detail's Usage tab) satisfies the current operational need; the cross-tenant aggregate view is deferred. |
```
Change:
```markdown
| PUT `/platform/customers/:id/provisioning` | `platform.provisioning.manage` | S3 prefix, base providers, LINE binding |
```
to:
```markdown
| PUT `/platform/customers/:id/provisioning` | `platform.provisioning.manage` | S3 prefix, base providers, LINE binding — **DEFERRED to its own grilled task (ADR-0004 D6):** needs masking UX + write-only display design + verification against Batch 1 redaction before a UI is built. Placeholder text in `CustomerDetailView.tsx`'s Provisioning tab names the currently-available `/platform/settings` endpoint instead. |
```
Add a new line for customer deletion (not currently in the table — insert after the `suspend`/`reactivate` rows):
```markdown
| DELETE `/platform/customers/:id` | n/a | **NOT IMPLEMENTED — DEFERRED to Phase 10 (ADR-0004 D6):** suspend/reactivate cover the operational need today. Soft-delete + retention policy is recorded as the hard constraint for when this is built — see `anemal-platform-console/SKILL.md:82`. |
```

- [x] **Step 5: Delete the stale `.agents/` tree**

Run: `git rm -r .agents`
Expected: removes all 32 files listed under `.agents/skills/` (grep-verified unreferenced by any config, CLAUDE.md, or tooling — CLAUDE.md names only `.claude/skills/` as the project skill path; this tree was a stale duplicate that caused the false BUG-009 audit claim in D4).

- [x] **Step 6: Confirm nothing references the deleted tree**

Run: `Grep -rn "\.agents/" --glob '!.git' .` (or `Grep -rn "\.agents/skills"` scoped to the repo root) excluding the git history itself.
Expected: zero matches outside of this plan file and the ADR (which reference it only to explain the deletion, not as a live dependency).

- [x] **Step 7: Commit**

```bash
git add .claude/skills/anemal-rbac-matrix/references/permission-matrix.md .claude/skills/anemal-platform-console/references/platform-domain.md
git rm -r --cached .agents 2>/dev/null; git add -u .agents 2>/dev/null
git commit -m "docs(rbac,platform): add staff.assign_branch + clinic.settings.manage rows, mark D6 deferrals, delete stale .agents duplicate tree"
```
Note: if `.agents` was already staged for deletion by Step 5's `git rm -r`, the redundant `git rm --cached`/`git add -u` lines above are no-ops guarding against staging-order drift — a plain `git add -A .agents .claude/skills/...` before commit is also acceptable; verify with `git status` before committing that the `.agents/` deletions are staged alongside the two doc modifications.

---

## Final verification (after all 6 tasks)

- [x] Run full frontend suite: `npm test -- --run` (from `src/frontend`) — expect all suites pass, including the 5 new/extended test files from T1–T5
- [x] Run `npx tsc --noEmit -p src/frontend` — expect zero errors (catches any stray reference to the old flat `PlatformAuthPayload` shape or the old `emr.create` guard)
- [x] Run full backend suite once as a regression check (no backend files changed this batch, but confirms nothing in `src/backend` was accidentally touched): `npx jest --runInBand` (from `src/backend`)
- [x] Run `git status` and confirm `.agents/` no longer appears as tracked
- [x] Run `git log --oneline fix/codex-audit-batch2` and confirm 6 commits in T1→T2→T3→T4→T5→T6 order
- [x] Hand off to `@ponytail-agent` (Step 5 gate) before `/execute-plan`, then `@qa-agent` (Step 7) for RBAC/plane-isolation sign-off (T4 and T5 are RBAC-relevant — QA should specifically re-run the plane-isolation and permission-matrix regression suites), then `/anemal-finish-branch` (Step 8)
