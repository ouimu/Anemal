# Company Admin Branch Bypass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Company admins skip branch selection on login (JWT `branchId: null`), land directly on the admin dashboard, and can optionally narrow their view to a specific branch via a sidebar switcher.

**Architecture:** Backend `login()` short-circuits for `role === 'admin'` and returns a full JWT immediately. `switchBranch()` is extended to accept `null` (reset to all-branches). The `AdminLayout` sidebar gains a branch picker that updates the JWT via `POST /auth/switch-branch`.

**Tech Stack:** Node.js + Express + Zod + Prisma (backend); React 18 + Zustand + React Query + Tailwind (frontend); Thai/English i18n via `useT()` hook.

## Global Constraints

- Every backend query must include `tenant_id` — no cross-tenant data leaks.
- No new endpoints — extend existing `/auth/login` and `/auth/switch-branch`.
- No new npm dependencies.
- All Tailwind classes must use design-system tokens (no raw hex, no arbitrary values).
- Touch targets minimum 44×44 px.
- i18n: all UI strings must use `useT()` — no hardcoded English literals in JSX.
- `branchId: null` in JWT means all-branches scope; `branchId: undefined/number` means branch-scoped.
- Non-admins must never be able to reach `branchId: null` scope via any API path.

---

### Task 1: Backend — Types + Admin Login Bypass

**Files:**
- Modify: `src/backend/types/index.ts:52-68`
- Modify: `src/backend/services/auth.service.ts:36-86`
- Test: `src/backend/tests/integration/auth.test.ts`

**Interfaces:**
- Produces: `LoginResponse` union now returns `branchId: number | null` in the `requiresBranchSelection: false` variant; `login()` returns the full-token variant for admins without issuing a pending token.

- [ ] **Step 1: Update `LoginResponse` type in `src/backend/types/index.ts`**

Change line 59 comment and line 64 (`branchId: number` → `branchId: number | null`):

```typescript
// Two-step login for staff/doctor; admin receives full token directly.
export type LoginResponse =
  | {
      requiresBranchSelection: true
      pendingToken: string                        // 5-min JWT, scope='branch_select'
      branches:     { id: number; name: string }[] // staff/doctor: assigned only
    }
  | {
      requiresBranchSelection: false              // admin: from POST /auth/login; staff/doctor: from POST /auth/select-branch
      token:        string
      refreshToken: string
      userId:       number
      tenantId:     number
      branchId:     number | null                 // null = all-branches scope (admin only)
      role:         string
      name:         string
      companyName:  string
    }
```

`SelectBranchResponse` on line 71 is an alias (`Extract<LoginResponse, { requiresBranchSelection: false }>`) — it picks up the change automatically, no edit needed.

- [ ] **Step 2: Write the failing integration test**

In `src/backend/tests/integration/auth.test.ts`, add a new `describe` block (do not modify existing tests):

```typescript
describe('POST /auth/login — admin bypass', () => {
  it('returns full JWT with branchId null for admin user', async () => {
    // Uses the seeded dev-clinic tenant + admin user from seed.ts
    const res = await request(app)
      .post('/auth/login')
      .send({ subdomain: 'dev-clinic', username: 'admin', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.body.data.requiresBranchSelection).toBe(false)
    expect(res.body.data.branchId).toBeNull()
    expect(res.body.data.token).toBeTruthy()
    expect(res.body.data.refreshToken).toBeTruthy()
    expect(res.body.data.role).toBe('admin')
  })

  it('still returns branch selection for non-admin users', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ subdomain: 'dev-clinic', username: 'staff1', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.body.data.requiresBranchSelection).toBe(true)
    expect(res.body.data.pendingToken).toBeTruthy()
    expect(Array.isArray(res.body.data.branches)).toBe(true)
  })
})
```

> **Note:** Check `src/backend/prisma/seed.ts` for the actual seeded admin username and password before running. Adjust if different.

- [ ] **Step 3: Run test — confirm it fails**

```bash
cd src/backend && npx jest --testPathPattern="auth.test" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `requiresBranchSelection` is `true` for admin (current behaviour).

- [ ] **Step 4: Implement the admin early return in `src/backend/services/auth.service.ts`**

Replace the existing step 5 block (lines ~62-85) with:

```typescript
  // 5. Compute permission version and check role
  const permSetVersion = await computePermSetVersion(user.id, tenant.id)
  const isAdmin = user.role === 'admin'

  // Admin bypass — skip branch selection, issue full JWT immediately
  if (isAdmin) {
    const token = signToken({
      userId:         user.id,
      tenantId:       tenant.id,
      branchId:       undefined,   // null in JWT = all-branches scope
      plane:          'clinic',
      permSetVersion,
      role:           user.role,
    })
    const rawRefreshToken = crypto.randomBytes(32).toString('hex')
    const familyId        = crypto.randomUUID()
    await refreshTokenRepo.create({
      tokenHash: refreshTokenRepo.hashToken(rawRefreshToken),
      familyId,
      userId:    user.id,
      tenantId:  tenant.id,
      branchId:  null,
      plane:     'clinic',
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    })
    return {
      requiresBranchSelection: false as const,
      token,
      refreshToken: rawRefreshToken,
      userId:       user.id,
      tenantId:     tenant.id,
      branchId:     null,
      role:         user.role,
      name:         user.name,
      companyName:  tenant.name,
    }
  }

  // Non-admin: two-step flow — assigned branches only
  const branches = await userRepo.getUserBranches(tenant.id, user.id)
  if (branches.length === 0) {
    throw new AuthError('You are not assigned to any branch. Contact your administrator.', 403)
  }

  const pendingToken = signPendingToken({
    userId:         user.id,
    tenantId:       tenant.id,
    plane:          'clinic',
    permSetVersion,
    role:           user.role,
    scope:          'branch_select',
  })

  return { requiresBranchSelection: true as const, pendingToken, branches }
```

> **Note:** The old code fetched branches for both admin (all active) and non-admin. The new code fetches nothing for admin. The `findActiveBranchesByTenant` import may become unused — remove it if so.

- [ ] **Step 5: Run test — confirm it passes**

```bash
cd src/backend && npx jest --testPathPattern="auth.test" --no-coverage 2>&1 | tail -20
```

Expected: PASS on both new tests, no regressions in existing auth tests.

- [ ] **Step 6: Commit**

```bash
git add src/backend/types/index.ts src/backend/services/auth.service.ts src/backend/tests/integration/auth.test.ts
git commit -m "feat: admin login bypasses branch selection, returns JWT with branchId null"
```

---

### Task 2: Backend — `switchBranch` Null Support

**Files:**
- Modify: `src/backend/controllers/auth.controller.ts:11-13` (schema)
- Modify: `src/backend/services/auth.service.ts:152-187` (`switchBranch` function)
- Test: `src/backend/tests/integration/auth.test.ts`

**Interfaces:**
- Consumes: Task 1's `login()` — admin JWT with `branchId: null` is used as bearer token in tests.
- Produces: `switchBranch(tenantId, userId, role, targetBranchId: number | null)` — null resets to all-branches; non-admins get 403.

- [ ] **Step 1: Write the failing tests**

Add to `src/backend/tests/integration/auth.test.ts`:

```typescript
describe('POST /auth/switch-branch — null support', () => {
  let adminToken: string

  beforeAll(async () => {
    // Login as admin to get token (uses bypass from Task 1)
    const res = await request(app)
      .post('/auth/login')
      .send({ subdomain: 'dev-clinic', username: 'admin', password: 'password123' })
    adminToken = res.body.data.token
  })

  it('allows admin to reset to all-branches (branchId: null)', async () => {
    const res = await request(app)
      .post('/auth/switch-branch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchId: null })

    expect(res.status).toBe(200)
    expect(res.body.data.token).toBeTruthy()
    expect(res.body.data.branchId).toBeNull()
  })

  it('returns 403 when non-admin sends branchId: null', async () => {
    // Login as staff and select a branch first
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ subdomain: 'dev-clinic', username: 'staff1', password: 'password123' })
    const { pendingToken, branches } = loginRes.body.data
    const selectRes = await request(app)
      .post('/auth/select-branch')
      .send({ pendingToken, branchId: branches[0].id })
    const staffToken = selectRes.body.data.token

    const res = await request(app)
      .post('/auth/switch-branch')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ branchId: null })

    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd src/backend && npx jest --testPathPattern="auth.test" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — Zod schema rejects `null`, returns 400.

- [ ] **Step 3: Update `switchBranchSchema` in `src/backend/controllers/auth.controller.ts`**

```typescript
export const switchBranchSchema = z.object({
  branchId: z.number().int().positive().nullable(),
}).strict()
```

- [ ] **Step 4: Update `SwitchBranchResponse` interface and `switchBranch()` in `src/backend/services/auth.service.ts`**

Change the local `SwitchBranchResponse` interface (`branchId: number` → `branchId: number | null`):

```typescript
interface SwitchBranchResponse {
  token:       string
  userId:      number
  tenantId:    number
  branchId:    number | null
  role:        string
  name:        string
  companyName: string
}
```

Replace the `switchBranch` function body:

```typescript
export async function switchBranch(
  tenantId: number, userId: number, role: JwtPayload['role'], targetBranchId: number | null,
): Promise<SwitchBranchResponse> {
  const user = await authRepo.findUserById(tenantId, userId)
  if (!user || !user.isActive) throw new AuthError('User not found', 404)

  // null = reset to all-branches (admin only)
  if (targetBranchId === null) {
    if (role !== 'admin') throw new AuthError('Only admins may switch to all-branches scope.', 403)
    const tenant = await authRepo.findTenantById(tenantId)
    const companyName = tenant?.name ?? ''
    const permSetVersion = await computePermSetVersion(userId, tenantId)
    const token = signToken({ userId, tenantId, branchId: undefined, plane: 'clinic', permSetVersion, role })
    return { token, userId, tenantId, branchId: null, role: user.role, name: user.name, companyName }
  }

  // branch-scoped switch (existing logic)
  const branch = await authRepo.findBranchById(tenantId, targetBranchId)
  if (!branch) throw new AuthError('Branch not found', 404)

  const tenant = await authRepo.findTenantById(tenantId)
  const companyName = tenant?.name ?? ''

  if (role !== 'admin') {
    const assignedBranches = await userRepo.getUserBranches(tenantId, userId)
    if (!assignedBranches.some(b => b.id === targetBranchId)) {
      throw new AuthError('You are not assigned to this branch.', 403)
    }
  }

  const permSetVersion = await computePermSetVersion(userId, tenantId)
  const token = signToken({ userId, tenantId, branchId: targetBranchId, plane: 'clinic', permSetVersion, role })
  return { token, userId, tenantId, branchId: targetBranchId, role, name: user.name, companyName }
}
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
cd src/backend && npx jest --testPathPattern="auth.test" --no-coverage 2>&1 | tail -20
```

Expected: all auth tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/backend/controllers/auth.controller.ts src/backend/services/auth.service.ts src/backend/tests/integration/auth.test.ts
git commit -m "feat: switchBranch accepts null for admin all-branches reset"
```

---

### Task 3: Frontend — i18n + useAuth Hook

**Files:**
- Modify: `src/frontend/src/i18n/index.ts:76` (after `nav.adminPanel`)
- Modify: `src/frontend/src/hooks/useAuth.ts`

**Interfaces:**
- Produces: `t('nav.allBranches')` available in both EN and TH; `useSwitchBranch()` hook exported from `useAuth.ts`; `LoginStep2Response.branchId` typed as `number | null`; `applyLogin` sets correct `branchName` for admin login.

- [ ] **Step 1: Add `nav.allBranches` to `src/frontend/src/i18n/index.ts`**

In the `en` dict, after `'nav.adminPanel': 'Admin Panel'`, add:

```typescript
  'nav.allBranches': 'All Branches',
```

In the `th` dict (find the matching `nav.adminPanel` entry in the `th` section), add after it:

```typescript
  'nav.allBranches': 'ภาพรวมทั้งหมด',
```

- [ ] **Step 2: Update `src/frontend/src/hooks/useAuth.ts`**

Replace the entire file with the following (preserving all existing exports):

```typescript
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuthStore, AuthData } from '../store/authStore'
import { useT } from '../i18n'

interface LoginPayload { subdomain: string; username: string; password: string; remember: boolean }

interface LoginStep1Response {
  requiresBranchSelection: true
  pendingToken: string
  branches:     { id: number; name: string }[]
}

interface LoginStep2Response {
  requiresBranchSelection: false
  token:        string
  refreshToken: string
  userId:       number
  tenantId:     number
  branchId:     number | null   // null = all-branches scope (admin bypass)
  role:         string
  name:         string
  companyName:  string
}

interface MeResponse {
  userId:          number
  tenantId:        number
  branchId?:       number | null
  name:            string
  email:           string
  roleIds:         number[]
  permissions:     string[]
  permSetVersion?: number
}

export interface BranchSelectionState {
  pendingToken: string
  branches:     { id: number; name: string }[]
}

async function fetchMe(token: string): Promise<MeResponse | null> {
  try {
    const res = await fetch('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const json = await res.json()
    return (json.data ?? json) as MeResponse
  } catch { return null }
}

async function applyLogin(
  login:      LoginStep2Response,
  remember:   boolean,
  setAuth:    (data: AuthData, remember: boolean) => void,
  branchName: string,
): Promise<void> {
  const me = await fetchMe(login.token)
  setAuth({
    token:          login.token,
    plane:          'clinic',
    userId:         login.userId,
    tenantId:       login.tenantId,
    branchId:       me?.branchId ?? login.branchId ?? null,
    roleIds:        me?.roleIds  ?? [],
    role:           login.role,
    permissions:    me?.permissions    ?? [],
    permSetVersion: me?.permSetVersion ?? 0,
    name:           login.name,
    companyName:    login.companyName ?? '',
    branchName,
  }, remember)
  try { await useAuthStore.getState().refreshPermissions() } catch { /* server enforces */ }
}

export function useLogin() {
  const [branchSelection, setBranchSelection] = useState<BranchSelectionState | null>(null)
  const [remember, setRemember]               = useState(false)
  const setAuth   = useAuthStore((s) => s.setAuth)
  const navigate  = useNavigate()
  const t         = useT()

  const loginMutation = useMutation({
    mutationFn: ({ remember: _rem, ...creds }: LoginPayload) =>
      api.post<{ success: boolean; data: LoginStep1Response | LoginStep2Response }>('/auth/login', creds),

    onSuccess: (res, vars) => {
      setRemember(vars.remember)
      const data = res.data.data
      if (data.requiresBranchSelection) {
        setBranchSelection({ pendingToken: data.pendingToken, branches: data.branches })
      } else {
        // Admin bypass: branchId is null → use 'All Branches' label
        const branchName = data.branchId === null ? t('nav.allBranches') : ''
        void applyLogin(data, vars.remember, setAuth, branchName).then(() =>
          navigate(data.role === 'admin' ? '/clinic-admin/dashboard' : '/clinic/dashboard')
        )
      }
    },
  })

  const selectBranchMutation = useMutation({
    mutationFn: ({ pendingToken, branchId }: { pendingToken: string; branchId: number }) =>
      api.post<{ success: boolean; data: LoginStep2Response }>('/auth/select-branch', { pendingToken, branchId }),

    onSuccess: async (res, vars) => {
      const data = res.data.data
      const selectedBranch = branchSelection?.branches.find(b => b.id === vars.branchId)
      setBranchSelection(null)
      await applyLogin(data, remember, setAuth, selectedBranch?.name ?? '')
      navigate(data.role === 'admin' ? '/clinic-admin/dashboard' : '/clinic/dashboard')
    },
  })

  return {
    branchSelection,
    loginMutation,
    selectBranchMutation,
    resetBranchSelection: () => setBranchSelection(null),
  }
}

export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const navigate  = useNavigate()
  return () => { clearAuth(); navigate('/login') }
}

/** Updates the JWT to a specific branch (or null = all-branches for admins). */
export function useSwitchBranch() {
  return useMutation({
    mutationFn: ({ branchId, branchName: _name }: { branchId: number | null; branchName: string }) =>
      api.post<{ success: boolean; data: { token: string } }>('/auth/switch-branch', { branchId }),

    onSuccess: (res, { branchId, branchName }) => {
      const state   = useAuthStore.getState()
      const remember = localStorage.getItem('vc_auth') !== null
      state.setAuth({
        token:          res.data.data.token,
        plane:          state.plane,
        userId:         state.userId,
        tenantId:       state.tenantId,
        branchId,
        roleIds:        state.roleIds,
        role:           state.role,
        permissions:    state.permissions,
        permSetVersion: state.permSetVersion,
        name:           state.name,
        companyName:    state.companyName,
        branchName,
      }, remember)
    },
  })
}
```

- [ ] **Step 3: Run frontend type-check**

```bash
cd src/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors. Fix any type errors before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/i18n/index.ts src/frontend/src/hooks/useAuth.ts
git commit -m "feat: add nav.allBranches i18n key and useSwitchBranch hook"
```

---

### Task 4: Frontend — AdminLayout Branch Switcher

**Files:**
- Modify: `src/frontend/src/layouts/AdminLayout.tsx`

**Interfaces:**
- Consumes: `useSwitchBranch()` from `../hooks/useAuth`; `useAuthStore` for `branchId`; `useQuery` for `GET /api/branches`; `useT` for `nav.allBranches`.
- Produces: Branch switcher in admin sidebar — expanded = select dropdown, collapsed = icon + popover.

> **Prerequisite:** Verify that the admin role has the `staff.assign_branch` permission in the RBAC seed (`src/backend/prisma/seed-rbac.ts`). The `POST /auth/switch-branch` route requires this permission. If absent, the switcher will 403 — add it to the admin role's permission set before proceeding.

- [ ] **Step 1: Add missing imports to `src/frontend/src/layouts/AdminLayout.tsx`**

`useAuthStore` and `useT` are already imported. Add only the missing ones:

```typescript
import { useState } from 'react'                          // add to existing react import
import { useQuery } from '@tanstack/react-query'          // new import
import { useSwitchBranch } from '../hooks/useAuth'        // merge with existing useLogout import line
import api from '../utils/api'                            // new import
```

- [ ] **Step 2: Add hook calls inside `AdminLayout()` (after existing `const { sidebarOpen, toggleSidebar } = useUiStore()`)**

```typescript
  const t                 = useT()
  const branchId          = useAuthStore(s => s.branchId)
  const switchMutation    = useSwitchBranch()
  const [popoverOpen, setPopoverOpen] = useState(false)

  interface Branch { id: number; name: string; isActive: boolean }
  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn:  () => api.get('/api/branches').then(r => r.data.data),
  })

  const allBranchesLabel = t('nav.allBranches')
  const currentLabel = branchId === null
    ? allBranchesLabel
    : (branches.find(b => b.id === branchId)?.name ?? allBranchesLabel)

  function handleSwitch(id: number | null, name: string) {
    switchMutation.mutate({ branchId: id, branchName: name })
    setPopoverOpen(false)
  }
```

- [ ] **Step 3: Add the branch switcher JSX inside the sidebar, between the header `<div>` and the `<nav>` block**

Insert this block after the closing `</div>` of the sidebar header and before `{/* Nav */}`:

```tsx
        {/* Branch switcher */}
        <div className="border-b border-outline-variant flex-shrink-0 px-sm py-xs">
          {sidebarOpen ? (
            <select
              value={branchId === null ? 'null' : String(branchId)}
              onChange={e => {
                const raw = e.target.value
                const id  = raw === 'null' ? null : Number(raw)
                const nm  = raw === 'null'
                  ? allBranchesLabel
                  : (branches.find(b => b.id === id)?.name ?? allBranchesLabel)
                handleSwitch(id, nm)
              }}
              disabled={switchMutation.isPending}
              className="w-full text-label-md text-on-surface-variant bg-surface-container rounded-lg px-sm py-xs border border-outline-variant focus:outline-none focus:border-secondary disabled:opacity-50 truncate"
            >
              <option value="null">{allBranchesLabel}</option>
              {branches.map(b => (
                <option key={b.id} value={String(b.id)}>{b.name}</option>
              ))}
            </select>
          ) : (
            <div className="relative flex justify-center">
              <button
                onClick={() => setPopoverOpen(p => !p)}
                title={currentLabel}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors"
              >
                <MaterialIcon name="apartment" size={22} />
              </button>
              {popoverOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setPopoverOpen(false)} />
                  <div className="absolute left-full top-0 ml-xs z-50 bg-surface border border-outline-variant rounded-lg shadow-md min-w-[160px] py-xs">
                    <button
                      onClick={() => handleSwitch(null, allBranchesLabel)}
                      className={`w-full text-left px-md py-sm text-body-sm transition-colors hover:bg-surface-container ${branchId === null ? 'text-primary font-medium' : 'text-on-surface'}`}
                    >
                      {allBranchesLabel}
                    </button>
                    {branches.map(b => (
                      <button
                        key={b.id}
                        onClick={() => handleSwitch(b.id, b.name)}
                        className={`w-full text-left px-md py-sm text-body-sm transition-colors hover:bg-surface-container ${branchId === b.id ? 'text-primary font-medium' : 'text-on-surface'}`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
```

- [ ] **Step 4: Run frontend type-check**

```bash
cd src/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 5: Manual smoke test**

Start both backend and frontend:
```bash
# terminal 1
cd src/backend && npm run dev

# terminal 2
cd src/frontend && npm run dev
```

Then verify:
1. Login as admin (`dev-clinic` subdomain) → branch picker must NOT appear → lands on `/clinic-admin/dashboard`.
2. Admin sidebar shows "All Branches" / "ภาพรวมทั้งหมด" switcher below "Admin Panel" label.
3. Expand sidebar → select a branch from dropdown → token updates (page reloads data).
4. Collapse sidebar → click `apartment` icon → popover appears with branch list.
5. Select "All Branches" from popover → switcher resets.
6. Login as staff → branch picker STILL appears (two-step flow unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/layouts/AdminLayout.tsx
git commit -m "feat: add branch switcher to admin sidebar (all-branches default, per-branch focus)"
```
