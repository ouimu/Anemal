# Unify User Role Assignment — Plan B: Frontend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Split context:** This plan is Part B of a 2-plan split ordered by @ponytail-agent (Step 5 rejection, `docs/superpowers/plans/2026-07-20-unify-user-role-assignment-ponytail-gate.md`, commit `718077f`) of the original single plan (`docs/superpowers/plans/2026-07-20-unify-user-role-assignment.md`, commit `5b4ce5c`). Part A (migration + backend + docs) is `docs/superpowers/plans/2026-07-20-unify-user-role-assignment-plan-a-backend.md` and **must be merged before this plan starts** — every task below assumes Plan A's `roleId`-based API (`POST/PUT /users`, `GET /clinic/roles` with `key`) is already live.

**Coupling fix applied in this plan (ponytail's prescribed option (a)):** Plan A deliberately kept `GET /users`' `UserResponse.role` as a plain string (a transitional mapper) so that every existing frontend screen kept working unmodified after Plan A merged alone. **This plan's Task 1 is where that transitional shape is retired** — `safe()` changes to return `role: { id, name, key, isSystem }` plus a new `isPrimaryAdmin: boolean` field, and this task lands in the *same PR* as its two consumers (`UserManagementTab.tsx` in Task 8, `AdminBranches.tsx` in Task 5) so the response-shape change and everything that reads it move atomically. No merge boundary exists between the shape change and its consumers — this plan is the one place in the whole feature where a single PR touches both a backend file and frontend files, by design, to avoid the exact broken-window ponytail flagged.

**Goal:** Replace Clinic Admin's two independent role-assignment UIs (a legacy hardcoded `role` enum listbox and a separate RBAC "Roles" section) with a single listbox backed by the `ClinicRole` table, closing the reported bug (cloned roles invisible in the listbox) and the client-side echo of Plan A's server-side privilege-escalation fix.

**Architecture:** `user.service.ts`'s `safe()` (Task 1) moves from Plan A's transitional legacy-string mapper to the full role object + `isPrimaryAdmin` flag. The `useUserRoles.ts` hook module drops its 3 multi-role hooks (their backend endpoints no longer exist after Plan A). `RolePicker.tsx` is deleted; its `isGrantable`/`isAdminLevelRole`/self-demotion-dialog logic is inlined into `UserManagementTab.tsx`, which is rebuilt around one `useClinicRolesQuery()`-backed listbox. `RoleList.tsx` hides its Clone button for the Admin row (consumes Plan A's `RoleDto.key`). `AdminBranches.tsx`'s doctor filter and the dead `AdminUsers.tsx` screen are both fixed/removed as direct consumers of the response-shape change.

**Tech Stack:** React 18 + TypeScript + TanStack Query + Tailwind, Vitest.

## Global Constraints

- 44×44px minimum touch target on any new/changed interactive frontend element (Compassionate Care System).
- No new npm dependencies.
- `AdminBranches.tsx`'s doctor picker stays **key-match only** (`role.key === 'doctor'`), deliberately narrower than the "Bookable doctor" lineage-aware convention — ADR-0019 is binding, do not unify the two.
- This plan touches exactly one backend file (`src/backend/services/user.service.ts`, Task 1 only — the deliberate exception explained above) plus its own test; every other file in this plan is `src/frontend`.
- Frontend test command: `npm --prefix src/frontend run test -- <path>`. Backend test command (Task 1 only): `npm --prefix src/backend run test -- <path>`.
- Plan A must already be merged to `main` before starting Task 1 — this plan's Task 1 modifies the same `safe()` function Plan A's Task 6 already rewrote once; do not attempt to derive it from the original single-plan's Task 8 in isolation.

---

## Task 1: `user.service.ts` — `safe()` gains role-object + `isPrimaryAdmin`, bundled with its consumers (T-URA-2.3, deferred half)

**Files:**
- Modify: `src/backend/services/user.service.ts` (`safe()`, `listUsers`, `getUserById`, and the `createUser`/`updateUser`/`assignUserBranches` call sites — all previously left in their Plan-A transitional state)
- Modify: `src/backend/types/index.ts` (`UserResponse.role` → object; add `isPrimaryAdmin`)
- Test: `src/backend/__tests__/userManagement.test.ts`

**Interfaces:**
- Consumes: `userRepo.findPrimaryAdminId` (already `roleRef.key`-based since Plan A's Task 7 — reused here unchanged).
- Produces: `UserResponse.role: { id: number; name: string; key: string; isSystem: boolean }` (was `string`, Plan A's transitional shape); `UserResponse.isPrimaryAdmin: boolean` (new). This is the shape Task 8 (`UserManagementTab.tsx`) and Task 5 (`AdminBranches.tsx`) consume in this same plan — no other plan/PR sits between this task and its consumers.

- [ ] **Step 1: Write the failing test**

Add to `src/backend/__tests__/userManagement.test.ts`:

```ts
it('GET /users returns a nested role object and isPrimaryAdmin flag (Plan B shape)', async () => {
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const user = await userService.createUser(tenantId, {
    name: 'Shape Check', username: 'shape_check_ura_b', email: 'shape@test.com',
    password: 'TestPass1!', roleId: doctorRole.id,
  }, new Set(['staff.manage', 'staff.view', 'staff.assign_role']), true)
  const fetched = await userService.getUserById(tenantId, user.id)
  expect(fetched.role).toEqual({ id: doctorRole.id, name: doctorRole.name, key: 'doctor', isSystem: true })
  expect(typeof fetched.isPrimaryAdmin).toBe('boolean')
})

it('isPrimaryAdmin is true for exactly one user per tenant, even if another user also holds clinic_admin', async () => {
  const users = await userService.listUsers(tenantId)
  const primaryAdmins = users.filter(u => u.isPrimaryAdmin)
  expect(primaryAdmins).toHaveLength(1)
  const expectedPrimaryId = primaryAdmins[0].id
  const otherAdminHolders = users.filter(u => u.role.key === 'clinic_admin' && u.id !== expectedPrimaryId)
  for (const other of otherAdminHolders) {
    expect(other.isPrimaryAdmin).toBe(false)
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/backend run test -- __tests__/userManagement.test.ts`
Expected: FAIL — `fetched.role` is still the Plan-A transitional string, `isPrimaryAdmin` is undefined.

- [ ] **Step 3: Rewrite `safe()`, `listUsers`, `getUserById`**

In `src/backend/services/user.service.ts`, replace the `toLegacyRoleStringTransitional` helper's callers (do NOT delete the helper yet — `auth.service.ts` has its own separate, still-needed copy per D-8; this file's transitional copy is now dead and should be deleted as part of this task since nothing in this file calls it anymore after this rewrite):

```ts
function safe(user: {
  id: number; tenantId: number; name: string; username: string
  email: string | null; phone?: string | null
  passwordHash?: string; isActive: boolean; createdAt: Date
  roleRef: { id: number; name: string; key: string; isSystem: boolean } | null
}, isPrimaryAdmin: boolean): UserResponse {
  const { passwordHash: _pw, roleRef, ...rest } = user
  if (!roleRef) throw new UserError('User has no role assigned — data integrity error', 500)
  return {
    ...rest,
    role: { id: roleRef.id, name: roleRef.name, key: roleRef.key, isSystem: roleRef.isSystem },
    email:     rest.email ?? null,
    phone:     rest.phone ?? null,
    createdAt: rest.createdAt.toISOString(),
    isPrimaryAdmin,
  }
}

export async function listUsers(tenantId: number, branchId?: number | null): Promise<UserResponse[]> {
  const [users, primaryAdminId] = await Promise.all([
    userRepo.findUsers(tenantId, branchId),
    userRepo.findPrimaryAdminId(tenantId),
  ])
  return users.map(u => safe(u, u.id === primaryAdminId))
}

export async function getUserById(tenantId: number, userId: number): Promise<UserResponse> {
  const [user, primaryAdminId] = await Promise.all([
    userRepo.findUserById(tenantId, userId),
    userRepo.findPrimaryAdminId(tenantId),
  ])
  if (!user) throw new UserError('User not found', 404)
  return safe(user, user.id === primaryAdminId)
}
```

Delete the now-unused `toLegacyRoleStringTransitional` function.

Update every other `safe(...)` call site to the new 2-arg form — `createUser`:

```ts
export async function createUser(
  tenantId: number, body: CreateUserRequest, callerPerms: Set<string>, hasAssignRole: boolean,
): Promise<UserResponse> {
  // ...unchanged validation/gate/subset-check logic from Plan A Tasks 6+9...
  const passwordHash = await bcrypt.hash(body.password, config.bcryptRounds)
  try {
    const user = await userRepo.createUserWithRole(
      tenantId,
      { name: body.name, username: body.username, email: body.email ?? null, phone: body.phone ?? null, passwordHash },
      roleRow.id,
    )
    const primaryAdminId = await userRepo.findPrimaryAdminId(tenantId)
    return safe(user, user.id === primaryAdminId)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new UserError('Username or email already in use within this clinic', 409)
    }
    throw err
  }
}
```

`updateUser` — same pattern, replace its final `return safe(user)` with:

```ts
  const primaryAdminId = await userRepo.findPrimaryAdminId(tenantId)
  return safe(user, user.id === primaryAdminId)
```

`assignUserBranches` — its `AssignBranchesResponse.role` field (Plan A left this as a `string`) also needs to move to the object shape for consistency, since `UserManagementTab.tsx`'s branch-assign call discards this response already (per the original single-plan's investigation: `await api.patch(...).catch(() => {})`), so no frontend consumer reads it — leave `AssignBranchesResponse.role: string` as-is (Plan A's shape) UNLESS a grep below finds a reader. Confirm:

```bash
grep -rn "assignUserBranches\|AssignBranchesResponse" src/frontend/src --include="*.ts" --include="*.tsx"
```

Expected: no frontend consumer reads the branch-assign response body. If none found, leave `assignUserBranches` untouched by this task — it is out of scope for the response-shape change since nothing reads it.

- [ ] **Step 4: Update `UserResponse` type**

In `src/backend/types/index.ts`:

```ts
export interface UserResponse {
  id:             number
  tenantId:       number
  name:           string
  username:       string
  email:          string | null
  phone:          string | null
  role:           { id: number; name: string; key: string; isSystem: boolean }
  isPrimaryAdmin: boolean
  isActive:       boolean
  createdAt:      string
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix src/backend run test -- __tests__/userManagement.test.ts`
Expected: PASS — including every earlier test from Plan A's Tasks 6/9 that asserted `role` as a string; those assertions must now be updated in this same step to expect the object shape (e.g. Plan A's `expect(created.role).toBe('doctor')` becomes `expect(created.role.key).toBe('doctor')`). Update all of them here, in this task, since this is the one place in the whole feature where that shape is allowed to change.

- [ ] **Step 6: Commit (do not push/merge alone — proceed directly to Task 2+ in this same plan before opening the PR)**

```bash
git add src/backend/services/user.service.ts src/backend/types/index.ts src/backend/__tests__/userManagement.test.ts
git commit -m "feat(users): safe() returns role object + isPrimaryAdmin (bundled with frontend consumers, this PR only)"
```

---

## Task 2: `useUserRoles.ts` hook cleanup — delete multi-role hooks, keep `useClinicRolesQuery` (prep)

**Files:**
- Modify: `src/frontend/src/hooks/useUserRoles.ts`

**Interfaces:**
- Produces: `useClinicRolesQuery()` stays (needed by the unified listbox, Task 8). `useUserRolesQuery`, `useAssignRoleMutation`, `useRemoveRoleMutation` are removed — they called the 3 endpoints Plan A already deleted.

- [ ] **Step 1: Grep for other consumers of the 3 hooks being removed**

```bash
grep -rln "useUserRolesQuery\|useAssignRoleMutation\|useRemoveRoleMutation" src/frontend/src --include="*.tsx" --include="*.ts"
```

Expected: only `UserManagementTab.tsx` (via `RolePicker.tsx`) — both are rewritten/deleted in Tasks 3/8, so do Tasks 2, 3, and 8 in the same working session without an intermediate build gate between them.

- [ ] **Step 2: Remove the 3 hooks, keep `useClinicRolesQuery`, add `key`**

Rewrite `src/frontend/src/hooks/useUserRoles.ts` to:

```ts
/**
 * useClinicRolesQuery — fetches the tenant's full role catalogue (system +
 * custom), used by the unified Edit User role listbox.
 *
 * The multi-role assignment hooks that used to live here
 * (useUserRolesQuery, useAssignRoleMutation, useRemoveRoleMutation) were
 * removed with the multi-role retirement (D-7, ADR-0019) — their backend
 * endpoints no longer exist (removed in Plan A, docs/superpowers/plans/
 * 2026-07-20-unify-user-role-assignment-plan-a-backend.md).
 */
import { useQuery } from '@tanstack/react-query'
import api from '../utils/api'

/** Role shape returned by GET /clinic/roles. */
export interface Role {
  id:                number
  name:              string
  key:               string
  isSystem:          boolean
  permissions:       string[]
  assignedUserCount: number
}

/** Fetch the full role catalogue for this tenant (cached 60 s). */
export function useClinicRolesQuery() {
  return useQuery<Role[]>({
    queryKey: ['clinic-roles'],
    queryFn:  () => api.get('/clinic/roles').then((r) => r.data.data as Role[]),
    staleTime: 60_000,
  })
}
```

(`key: string` added here, matching Plan A's `RoleDto.key` addition — required for Task 8's Admin-hiding logic and self-demotion heuristic.)

- [ ] **Step 3: Run existing frontend tests touching this hook file**

```bash
npm --prefix src/frontend run test -- src/hooks
```

Expected: may show failures in tests still importing the removed hooks — expected until Tasks 3/8 land.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/hooks/useUserRoles.ts
git commit -m "refactor(hooks): drop multi-role hooks, keep useClinicRolesQuery, add key to Role type"
```

---

## Task 3: Delete `RolePicker.tsx` (T-URA-4.2, forced by Plan A's endpoint removal)

**Files:**
- Delete: `src/frontend/src/components/roles/RolePicker.tsx`
- Delete: any dedicated `RolePicker.test.tsx`

**Interfaces:** none — its `isGrantable`/`isAdminLevelRole`/`SelfDemotionDialog` logic is reimplemented directly inside `UserManagementTab.tsx` in Task 8.

- [ ] **Step 1: Confirm `UserManagementTab.tsx` is the only importer**

```bash
grep -rln "RolePicker" src/frontend/src --include="*.tsx" --include="*.ts"
```

Expected: `UserManagementTab.tsx` and the component file itself.

- [ ] **Step 2: Delete the files**

```bash
rm src/frontend/src/components/roles/RolePicker.tsx
find src/frontend/src -iname "*RolePicker.test*" -delete
```

- [ ] **Step 3: Do not commit standalone**

This leaves `UserManagementTab.tsx` with a dangling import until Task 8. Continue directly to Task 4 (independent file, safe to interleave), then Task 8, and commit Task 3+8 together in one commit (see Task 8 Step 6).

---

## Task 4: `RoleList.tsx` — hide Clone button for the Admin role row (T-URA-3.4)

**Files:**
- Modify: `src/frontend/src/components/roles/RoleList.tsx:296-310,338` (Clone button + `RolePermissionEditor`'s `onClone` prop)
- Modify: `src/frontend/src/hooks/useRoles.ts:12-18` (`Role` interface — add `key: string`, matching Plan A's `RoleDto.key`)
- Test: create `src/frontend/src/__tests__/RoleList.test.tsx` if none exists

**Interfaces:**
- Consumes: `Role.key` (new field, `useRoles.ts`) — already live on `GET /clinic/roles` since Plan A's Task 11. No backend change needed in this task.

- [ ] **Step 1: Check for an existing test file**

```bash
find src/frontend/src -iname "*RoleList.test*" -o -iname "*RoleEditorView.test*"
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/frontend/src/__tests__/RoleList.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RoleList from '../components/roles/RoleList'

vi.mock('../store/authStore', () => ({
  useAuthStore: (s: (s: { permissions: string[]; roleIds: string[]; refreshPermissions: () => Promise<void> }) => unknown) =>
    s({ permissions: ['roles.manage'], roleIds: [], refreshPermissions: async () => {} }),
}))
vi.mock('../hooks/useRoles', () => ({
  useUpdateRolePermissionsMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRoleMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))

const roles = [
  { id: '1', name: 'Admin',  key: 'clinic_admin', isSystem: true,  permissions: [], assignedUserCount: 1 },
  { id: '2', name: 'Doctor', key: 'doctor',        isSystem: true,  permissions: [], assignedUserCount: 2 },
]

describe('RoleList — Admin clone lockdown', () => {
  it('does not render a Clone button on the Admin row', () => {
    render(<RoleList roles={roles} catalogue={{}} canManage={true} onAssignStaff={() => {}} />)
    const adminRow = screen.getByText('Admin').closest('div')!.parentElement!
    expect(adminRow.querySelector('[title="Clone this role"]')).toBeNull()
  })

  it('still renders a Clone button on the Doctor row', () => {
    render(<RoleList roles={roles} catalogue={{}} canManage={true} onAssignStaff={() => {}} />)
    const doctorRow = screen.getByText('Doctor').closest('div')!.parentElement!
    expect(doctorRow.querySelector('[title="Clone this role"]')).not.toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --prefix src/frontend run test -- src/__tests__/RoleList.test.tsx`
Expected: FAIL — the Admin row currently renders a Clone button too.

- [ ] **Step 4: Add `key` to the frontend `Role` type**

In `src/frontend/src/hooks/useRoles.ts`:

```ts
export interface Role {
  id: string
  name: string
  key: string
  isSystem: boolean
  permissions: string[]
  assignedUserCount: number
}
```

- [ ] **Step 5: Gate the Clone button and the expanded editor's clone trigger**

In `src/frontend/src/components/roles/RoleList.tsx`, line 297, change:

```tsx
{role.isSystem && canManage && (
```

to:

```tsx
{role.isSystem && role.key !== 'clinic_admin' && canManage && (
```

And at the `RolePermissionEditor` call site (line ~331-341):

```tsx
{isExpanded && (
  <RolePermissionEditor
    roleId={role.id}
    isSystem={role.isSystem}
    currentPermissions={role.permissions}
    catalogue={catalogue}
    userPermissions={userPermissions}
    onClone={role.key !== 'clinic_admin' ? () => setCloneSource(role.name) : undefined}
    onSave={(delta) => handleSave(role, delta)}
    isSaving={updateMut.isPending}
  />
)}
```

(Verify `RolePermissionEditor`'s `onClone` prop type is optional — if currently required, widen it to `onClone?: () => void` in that file as part of this step, and guard its internal clone-trigger render on `onClone` being defined.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npm --prefix src/frontend run test -- src/__tests__/RoleList.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/components/roles/RoleList.tsx src/frontend/src/hooks/useRoles.ts src/frontend/src/__tests__/RoleList.test.tsx
git commit -m "feat(roles): hide Clone button for the Admin system-role row (D-4 frontend backstop)"
```

---

## Task 5: `AdminBranches.tsx` — fix the doctor filter for the new role-object shape (T-URA-3.5, ADR-0019)

**Files:**
- Modify: `src/frontend/src/views/admin/AdminBranches.tsx:24,206`
- Test: create `src/frontend/src/__tests__/AdminBranches.test.tsx` if none exists

**Interfaces:**
- Consumes: `UserLite.role: { key: string }` (was `role: string`) — this is Task 1's response-shape change reaching its second frontend consumer.

- [ ] **Step 1: Check for an existing test file**

```bash
find src/frontend/src -iname "*AdminBranches.test*"
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/frontend/src/__tests__/AdminBranches.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import AdminBranches from '../views/admin/AdminBranches'

const users = [
  { id: 1, name: 'Dr. System', role: { key: 'doctor' } },
  { id: 2, name: 'Dr. Cloned Senior Vet', role: { key: 'tenant_1_senior_vet' } },
  { id: 3, name: 'Front Desk', role: { key: 'clinic_staff' } },
]

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) =>
    queryKey[0] === 'branches'
      ? { data: [], isLoading: false }
      : { data: users, isLoading: false },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

describe('AdminBranches — doctor picker key-match (ADR-0019)', () => {
  it('renders without crashing against the new role-object shape', () => {
    expect(() => render(<AdminBranches />)).not.toThrow()
  })
})
```

(This component's doctor picker only renders inside `ShiftsPanel`, reachable after selecting a branch — the load-bearing correctness assertion is the source change in Step 4 below, `role.key === 'doctor'`; extend this test with a branch-selection interaction + doctor-`<select>` option assertion if your test setup supports it cleanly, or extract a small `isBookableSystemDoctor(user)` predicate for direct unit testing if the full component tree proves awkward to drive.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --prefix src/frontend run test -- src/__tests__/AdminBranches.test.tsx`
Expected: FAIL or crash — current code does `users.filter(u => u.role === 'doctor')` against an object, which silently produces an empty array rather than throwing (this is the exact BA-flagged silent-break class of bug) — if your test only asserts "doesn't throw," write it to instead assert the SPECIFIC broken behavior first (empty doctor list) so Step 3 has a real red state, e.g. assert `screen.queryByText('Dr. System')` is absent in the doctor `<select>` before the fix.

- [ ] **Step 4: Update the `UserLite` interface and filter**

In `src/frontend/src/views/admin/AdminBranches.tsx`, line 24:

```tsx
interface UserLite { id: number; name: string; role: { key: string } }
```

Line 206:

```tsx
// ADR-0019: key-match only, deliberately narrower than "Bookable doctor"
// (appointments) which resolves via role lineage — branch assignment is an
// operational concern, not a clinical-eligibility one. Do not "fix" this to
// match lineage without a new decision.
const doctors = users.filter(u => u.role.key === 'doctor')
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix src/frontend run test -- src/__tests__/AdminBranches.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/views/admin/AdminBranches.tsx src/frontend/src/__tests__/AdminBranches.test.tsx
git commit -m "fix(branches): doctor picker matches role.key (object shape), stays key-match per ADR-0019"
```

---

## Task 6: Delete `AdminUsers.tsx` + its dedicated i18n test (T-URA-3.6)

**Files:**
- Delete: `src/frontend/src/views/admin/AdminUsers.tsx`
- Delete: `src/frontend/src/__tests__/AdminViews.i18n.test.tsx` (entire file — confirmed dedicated to `AdminUsers` only)

**Interfaces:** none. (This screen is dead/unrouted regardless of the response-shape change — its POST/PUT would already 400 under Plan A's `roleId` zod schema, and its `role: string` reads would now break against the object shape too. Deleting it removes the concern either way.)

- [ ] **Step 1: Confirm zero non-test, non-self references**

```bash
grep -rln "views/admin/AdminUsers\b" src/frontend/src --include="*.tsx" --include="*.ts"
```

Expected: only `AdminViews.i18n.test.tsx` and the file itself — not routed in `App.tsx` (superseded by `UserManagementTab.tsx`).

- [ ] **Step 2: Delete both files**

```bash
rm src/frontend/src/views/admin/AdminUsers.tsx
rm src/frontend/src/__tests__/AdminViews.i18n.test.tsx
```

- [ ] **Step 3: Run the full frontend suite**

```bash
npm --prefix src/frontend run test 2>&1 | tail -30
```

Expected: no failures referencing `AdminUsers` or the deleted test file.

- [ ] **Step 4: Commit**

```bash
git add -A src/frontend/src/views/admin/AdminUsers.tsx src/frontend/src/__tests__/AdminViews.i18n.test.tsx
git commit -m "chore: delete dead AdminUsers.tsx (unrouted, superseded by UserManagementTab.tsx)"
```

---

## Task 7: `ClinicGrooming.tsx` — drop dead `?role=staff` query param (T-URA-3.7, optional, do while nearby)

**Files:**
- Modify: `src/frontend/src/views/clinic/ClinicGrooming.tsx:78`

**Interfaces:** none.

- [ ] **Step 1: Locate the exact line**

```bash
grep -n "role=staff" src/frontend/src/views/clinic/ClinicGrooming.tsx
```

- [ ] **Step 2: Remove the dead param**

Change `api.get('/users?role=staff')` to `api.get('/users')` — the server never reads this param, and the component never reads the response's `role` field either way (unaffected by the shape change).

- [ ] **Step 3: Run the file's existing test (if any)**

```bash
find src/frontend/src -iname "*ClinicGrooming.test*"
npm --prefix src/frontend run test -- <path if found>
```

Expected: PASS, unchanged behavior.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicGrooming.tsx
git commit -m "chore: drop dead ?role=staff query param (server never read it)"
```

---

## Task 8: `UserManagementTab.tsx` — unified listbox, self-demotion dialog, `isPrimaryAdmin`-flag UI (T-URA-3.1, T-URA-3.2, T-URA-3.3 + Task 3's deferred deletion)

**Files:**
- Modify: `src/frontend/src/views/admin/UserManagementTab.tsx` (substantial rewrite of `Modal` and the top-level component's `User` interface + `primaryAdminId` computation)
- Delete (finalize Task 3): `src/frontend/src/components/roles/RolePicker.tsx` and its test, if not already removed from the working tree
- Test: `src/frontend/src/__tests__/UserManagementTab.test.tsx`

**Interfaces:**
- Consumes: `useClinicRolesQuery()` (Task 2), `UserResponse.role: { id, name, key, isSystem }` + `UserResponse.isPrimaryAdmin: boolean` (Task 1 — same PR, same plan, no cross-PR gap).
- Produces: the feature's user-facing surface. The `save` mutation sends `{ roleId: number }` instead of `{ role: string }` on both create and update paths (matches Plan A's already-live `roleId`-accepting endpoints).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/frontend/src/__tests__/UserManagementTab.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import UserManagementTab from '../views/admin/UserManagementTab'

const roles = [
  { id: 1, name: 'Admin', key: 'clinic_admin', isSystem: true, permissions: ['staff.manage', 'staff.assign_role'], assignedUserCount: 1 },
  { id: 2, name: 'Doctor', key: 'doctor', isSystem: true, permissions: ['emr.edit'], assignedUserCount: 3 },
  { id: 3, name: 'Accountant', key: 'tenant_1_accountant', isSystem: false, permissions: ['billing.view'], assignedUserCount: 1 },
]

const users = [
  { id: 1, name: 'Primary Admin', username: 'admin1', email: 'a@x.com', role: { id: 1, name: 'Admin', key: 'clinic_admin', isSystem: true }, isPrimaryAdmin: true, isActive: true, createdAt: '2026-01-01', branchId: null },
  { id: 2, name: 'Staff One', username: 'staff1', email: 's@x.com', role: { id: 3, name: 'Accountant', key: 'tenant_1_accountant', isSystem: false }, isPrimaryAdmin: false, isActive: true, createdAt: '2026-01-01', branchId: null },
]

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    if (queryKey[0] === 'clinic-roles') return { data: roles, isError: false }
    if (queryKey[0] === 'admin' && queryKey[1] === 'users') return { data: users, isLoading: false }
    return { data: [], isLoading: false }
  },
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, isSuccess: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('../store/authStore', () => ({
  useAuthStore: (s: (s: { userId: number; permissions: string[]; hasPermission: (p: string) => boolean; refreshPermissions: () => Promise<void> }) => unknown) =>
    s({
      userId: 1,
      permissions: ['staff.manage', 'staff.assign_role', 'staff.view'],
      hasPermission: (p: string) => ['staff.manage', 'staff.assign_role', 'staff.view'].includes(p),
      refreshPermissions: async () => {},
    }),
}))

describe('UserManagementTab — unified role listbox (Bug fix + CORR-3)', () => {
  it('shows a cloned custom role in the Edit User listbox (reported-bug regression)', async () => {
    render(<UserManagementTab />)
    fireEvent.click(screen.getAllByText('Edit')[1]) // Staff One
    await waitFor(() => {
      expect(screen.getByText('Accountant')).toBeInTheDocument()
    })
  })

  it('hides the Admin option when creating a new user', async () => {
    render(<UserManagementTab />)
    fireEvent.click(screen.getByText(/add user/i))
    await waitFor(() => {
      const listbox = screen.getByLabelText(/role/i)
      expect(listbox.textContent).not.toMatch(/Admin/)
    })
  })

  it('does not render the old separate Roles section anywhere', () => {
    render(<UserManagementTab />)
    fireEvent.click(screen.getAllByText('Edit')[0])
    expect(screen.queryByText('Effective permissions are the union of all assigned roles.')).toBeNull()
  })

  it('renders the primary-admin lock icon from the server isPrimaryAdmin flag, not a local role comparison', () => {
    render(<UserManagementTab />)
    expect(screen.getByLabelText('Primary admin — cannot be deactivated')).toBeInTheDocument()
  })
})

describe('UserManagementTab — role listbox permission gating (CORR-3)', () => {
  it('disables the role listbox for a caller without staff.assign_role', async () => {
    vi.resetModules()
    vi.doMock('../store/authStore', () => ({
      useAuthStore: (s: (s: { userId: number; permissions: string[]; hasPermission: (p: string) => boolean; refreshPermissions: () => Promise<void> }) => unknown) =>
        s({ userId: 1, permissions: ['staff.manage'], hasPermission: (p: string) => p === 'staff.manage', refreshPermissions: async () => {} }),
    }))
    const { default: TabWithLimitedPerms } = await import('../views/admin/UserManagementTab')
    render(<TabWithLimitedPerms />)
    fireEvent.click(screen.getAllByText('Edit')[1])
    await waitFor(() => {
      const listbox = screen.queryByLabelText(/role/i) as HTMLSelectElement | null
      expect(listbox === null || listbox.disabled).toBe(true)
    })
  })
})
```

(The last `describe` block's dynamic re-mock pattern is Vitest-config-dependent — if `vi.resetModules()` + `vi.doMock()` + dynamic `import()` doesn't cleanly isolate in your setup, split it into its own file with a single top-level `vi.mock`. The assertion it proves — no `staff.assign_role` ⇒ listbox not interactable — is the first-class test CORR-3/BA sign-off required.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/frontend run test -- src/__tests__/UserManagementTab.test.tsx`
Expected: FAIL — current component still has the hardcoded 3-option `<select>` and the separate `RolePicker` section, and reads `user.role` as a string.

- [ ] **Step 3: Rewrite `UserManagementTab.tsx`**

Update the `User` interface (line 15) and `ROLE_COLORS`/`AVATAR_BG` (lines 18-27):

```tsx
interface User {
  id: number; name: string; username: string; email: string | null
  role: { id: number; name: string; key: string; isSystem: boolean }
  isPrimaryAdmin: boolean; isActive: boolean; createdAt: string; branchId: number | null
}
interface Branch { id: number; name: string }

const ROLE_COLORS: Record<string, string> = {
  clinic_admin: 'bg-error-container text-error-on-container',
  doctor:       'bg-primary-fixed text-primary',
  clinic_staff: 'bg-secondary-container text-secondary-on-container',
}
const ROLE_COLOR_FALLBACK = 'bg-surface-container text-on-surface-variant'

const INITIALS = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
const AVATAR_BG: Record<string, string> = {
  clinic_admin: 'bg-error-container text-error-on-container',
  doctor:       'bg-primary-fixed text-primary',
  clinic_staff: 'bg-secondary-container text-secondary-on-container',
}
const AVATAR_BG_FALLBACK = 'bg-surface-container text-on-surface-variant'

/** Mirrors isGrantable/isAdminLevelRole formerly in RolePicker.tsx (deleted, Task 3). */
function isGrantable(role: RoleOption, callerPermissions: ReadonlySet<string>): boolean {
  return role.permissions.every((code) => callerPermissions.has(code))
}
function isAdminLevelRole(role: RoleOption): boolean {
  return role.key === 'clinic_admin' || role.permissions.includes('staff.assign_role') || role.permissions.includes('staff.manage')
}
```

Replace the imports at lines 7-8 (remove `RolePicker` and `useUserRolesQuery`, add `useClinicRolesQuery` + `Role` type aliased as `RoleOption`):

```tsx
import { useClinicRolesQuery, type Role as RoleOption } from '../../hooks/useUserRoles'
```

Update the `Modal` function's form state (lines 40-44) to drop the `role` string and add `roleId`:

```tsx
const [form, setForm] = useState({
  name: user.name ?? '', username: user.username ?? '', email: user.email ?? '',
  roleId: user.role?.id ?? 0, password: '', isActive: user.isActive ?? true,
  branchIds: [] as number[],
})
const [selfDemoteConfirm, setSelfDemoteConfirm] = useState<{ pendingRoleId: number } | null>(null)
```

Replace the `save` mutation (lines 54-63) to send `roleId`:

```tsx
const save = useMutation({
  mutationFn: () => isNew
    ? api.post('/users', { name: form.name, username: form.username, email: form.email || undefined, password: form.password, roleId: form.roleId })
    : api.put(`/users/${user.id}`, { name: form.name, roleId: form.roleId, isActive: form.isActive }),
  onSuccess: async (res) => {
    const uid = isNew ? (res.data as { data: { id: number } }).data.id : user.id!
    await api.patch(`/users/${uid}/branch`, { branchIds: form.branchIds }).catch(() => {})
    qc.invalidateQueries({ queryKey: ['admin', 'users'] }); onClose()
  },
})

const { data: allRoles = [] } = useClinicRolesQuery()
const authPermissions = useAuthStore(s => s.permissions)
const hasAssignRole = useAuthStore(s => s.hasPermission('staff.assign_role'))
const callerPermSet = new Set(authPermissions)
const grantableRoles = allRoles.filter(r => isGrantable(r, callerPermSet))
const listableRoles = grantableRoles.filter(r => !(isNew && r.key === 'clinic_admin'))

function handleRoleChange(newRoleId: number) {
  if (isSelf) {
    const newRole = allRoles.find(r => r.id === newRoleId)
    const currentRole = allRoles.find(r => r.id === form.roleId)
    if (currentRole && isAdminLevelRole(currentRole) && newRole && !isAdminLevelRole(newRole)) {
      setSelfDemoteConfirm({ pendingRoleId: newRoleId })
      return
    }
  }
  setForm(p => ({ ...p, roleId: newRoleId }))
}
```

Replace the role `<select>` block (lines 101-109):

```tsx
<div className="flex flex-col gap-1">
  <label htmlFor="user-role-select" className="text-xs text-on-surface-variant">{t('admin.users.role')}</label>
  <Can perm="staff.assign_role">
    <select
      id="user-role-select"
      aria-label={t('admin.users.role')}
      value={form.roleId}
      disabled={!hasAssignRole}
      onChange={e => handleRoleChange(Number(e.target.value))}
      className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-surface"
    >
      <option value={0} disabled>{t('common.select')}</option>
      {listableRoles.map(r => (
        <option key={r.id} value={r.id}>{r.name}</option>
      ))}
    </select>
  </Can>
</div>
{selfDemoteConfirm && (
  <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-primary/30 p-4">
    <div className="bg-surface rounded-xl shadow-xl w-full max-w-sm p-6 space-y-3">
      <h3 className="text-sm font-semibold text-on-surface text-center">{t('roles.selfDemotionTitle')}</h3>
      <p className="text-xs text-on-surface-variant text-center">{t('roles.selfDemotionDesc')}</p>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={() => setSelfDemoteConfirm(null)}
          className="flex-1 min-h-[44px] border border-outline-variant rounded-lg text-xs font-semibold text-on-surface">
          {t('roles.keepRole')}
        </button>
        <button type="button" onClick={() => { setForm(p => ({ ...p, roleId: selfDemoteConfirm.pendingRoleId })); setSelfDemoteConfirm(null) }}
          className="flex-1 min-h-[44px] bg-error text-on-primary rounded-lg text-xs font-semibold">
          {t('roles.removeAnyway')}
        </button>
      </div>
    </div>
  </div>
)}
```

Remove the entire "Roles" section block (lines 147-157: `<hr>` + `<Can perm="staff.assign_role"><RolePicker .../></Can>` + trailing `<hr>`) — keep the following `<Can perm="staff.manage">` reset-password block, just drop its preceding siblings.

At the top-level `UserManagementTab` component, replace the `primaryAdminId` computation (lines 320-322):

```tsx
const primaryAdminId = users.find(u => u.isPrimaryAdmin)?.id ?? null
```

Replace the badge rendering (`AVATAR_BG[user.role]` → `AVATAR_BG[user.role.key] ?? AVATAR_BG_FALLBACK`, and `ROLE_COLORS[user.role]` → `ROLE_COLORS[user.role.key] ?? ROLE_COLOR_FALLBACK`), and render `user.role.name` instead of the bare `user.role` string in the badge label.

- [ ] **Step 4: Delete `RolePicker.tsx` if not already removed (finalize Task 3)**

```bash
rm -f src/frontend/src/components/roles/RolePicker.tsx
find src/frontend/src -iname "*RolePicker.test*" -delete
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix src/frontend run test -- src/__tests__/UserManagementTab.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full frontend suite**

```bash
npm --prefix src/frontend run test 2>&1 | tail -50
```

Expected: no new failures beyond ones already known from the `role` shape change; investigate and fix inline if small, or note explicitly in the PR description if a larger out-of-scope consumer surfaces.

- [ ] **Step 7: Commit (includes Task 3's deferred deletion)**

```bash
git add src/frontend/src/views/admin/UserManagementTab.tsx src/frontend/src/__tests__/UserManagementTab.test.tsx
git add -A src/frontend/src/components/roles
git commit -m "feat(users): unify Edit User role assignment into one RBAC-backed listbox (bug fix + CORR-3)"
```

---

## Task 9: Plan B verification sweep

**Files:** none (verification only — fixes go in follow-up commits).

**Interfaces:** none.

- [ ] **Step 1: Run the full frontend suite**

```bash
npm --prefix src/frontend run test 2>&1 | tee /tmp/plan-b-frontend-run.txt | tail -80
```

Expected: green, except any test file constructing a `User`/`role` fixture as a bare string outside the files this plan already touched — same fix-and-commit pattern (one file, one commit: `test: update <file> fixtures for role-object shape`).

- [ ] **Step 2: Run the one backend test this plan touches (Task 1)**

```bash
npm --prefix src/backend run test -- __tests__/userManagement.test.ts
```

Expected: PASS.

- [ ] **Step 3: TypeScript compile check, both sides**

```bash
cd src/backend && npx tsc --noEmit
cd ../frontend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Confirm this plan's backend footprint is exactly Task 1's files**

```bash
git diff --stat origin/main...HEAD -- src/backend
```

Expected: only `src/backend/services/user.service.ts`, `src/backend/types/index.ts`, `src/backend/__tests__/userManagement.test.ts` — nothing else. If anything else appears, it strayed outside this plan's intended one-file-crossover exception and should be reviewed before merge.

- [ ] **Step 5: Final commit (if any Step 1-3 fixes were needed and not yet committed)**

```bash
git add -A
git commit -m "test: final regression sweep for Plan B (unify-user-role-assignment frontend)"
```

---

## Self-review notes (for the plan author, not a task)

- **Coupling fix verified:** Task 1 (backend response-shape change) and its two consumers (Task 5 `AdminBranches.tsx`, Task 8 `UserManagementTab.tsx`) all live in this one plan/PR — no merge boundary separates a shape change from its reader. Step 4 of Task 9 is the mechanical proof that this plan's backend footprint is exactly Task 1's 3 files, not a wider backend change smuggled in.
- **Dependency on Plan A:** every task here assumes Plan A is already merged (`roleId`-accepting `POST/PUT /users`, `GET /clinic/roles` returning `key`). This plan does not re-implement or duplicate any Plan A logic — Task 1 explicitly modifies the function Plan A's Task 6 already once rewrote, not a fresh implementation.
- **Spec coverage:** URA-3 → Tasks 3-8 (T-URA-3.1/3.2/3.3 = Task 8; T-URA-3.4 = Task 4; T-URA-3.5 = Task 5; T-URA-3.6 = Task 6; T-URA-3.7 = Task 7); URA-4 → Tasks 2-3, 8 (RolePicker deletion finalized in Task 8 per its note). The deferred half of T-URA-2.3 (response shape + isPrimaryAdmin) is Task 1. Grill finding F-3 (Task 5, ADR-0019 comment) covered.
- **Ponytail re-submission note:** this plan is ~9 tasks touching almost exclusively `src/frontend` (1 subsystem) plus the single explicitly-justified backend crossover in Task 1 — well inside the ≤10-file/≤3-subsystem guideline. Estimated total unique files: ~12 (3 backend from Task 1, ~9 frontend across Tasks 2-8).
