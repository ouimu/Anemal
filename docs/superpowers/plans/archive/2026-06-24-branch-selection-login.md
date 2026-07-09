# Branch Selection at Login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All clinic users must select a branch at login; clinic_admin sees all active branches; staff/doctor see only their assigned branches (from `user_branches`); selected branch is preserved across token refreshes.

**Architecture:** Two-step login for all users: (1) credentials → pending JWT (5-min, `scope='branch_select'`) + branch list; (2) POST `/auth/select-branch` → full JWT + refresh token. `branchId` stored in `refresh_tokens` row so rotation preserves the user's session branch. `switchBranch` validates `user_branches` for non-admin. All changes are additive: `user_branches` is the source of truth; `users.branchId` is a legacy read-only convenience field.

**Tech Stack:** Node.js + Express + Prisma + PostgreSQL + React 18 + Zustand + React Query + Vite

## Global Constraints

- All DB queries must include `WHERE tenantId = :tenantId` (multi-tenancy absolute rule)
- JWT payload shape: `{ userId, tenantId, branchId?, plane, permSetVersion, role, scope? }`
- Backend layer order: Route → Controller → Service → Repository (no skipping)
- Zod validation on all request bodies in controllers
- `user.role === 'admin'` is the isAdmin check (legacy transitional field; maps to `clinic_admin` system role)
- clinic_admin: goes through two-step login but sees ALL active branches for tenant; no `user_branches` enforcement
- staff/doctor: sees only branches assigned via `user_branches`; 0 assigned branches → 403 at step 1
- All users always see the branch selection screen even if only 1 branch (no auto-skip)
- `branchId` in `refresh_tokens` row preserves selected branch across token rotations
- Tests: run `npm test` in `src/backend/` after each backend task; `npm test` in `src/frontend/` after each frontend task

---

## ✅ Completed Tasks (already committed)

### Task 1: DB — `user_branches` join table [commit 84af789]
### Task 2: Repo — `getUserBranches` / `replaceUserBranches` [commits e7deb69, 7acedde, b010deb]
### Task 3: API — branch assignment accepts `{ branchIds: number[] }` [commit 947b429]

---

## Task 3.5: DB — Add `branchId` to `refresh_tokens`

**Files:**
- Create: `src/backend/prisma/migrations/add_refresh_token_branch/migration.sql`
- Modify: `src/backend/prisma/schema.prisma`
- Modify: `src/backend/models/refresh-token.repository.ts`

**Interfaces:**
- Produces: `RefreshToken.branchId: Int?` in Prisma client
- Produces: `CreateRefreshTokenData.branchId?: number`
- Produces: `rotateToken` copies `branchId` from old row to new row

- [ ] **Step 1: Create migration SQL**

Create file `src/backend/prisma/migrations/add_refresh_token_branch/migration.sql`:
```sql
ALTER TABLE "refresh_tokens"
  ADD COLUMN IF NOT EXISTS "branchId" INTEGER REFERENCES "branches"("id") ON DELETE SET NULL;
```

- [ ] **Step 2: Update Prisma schema**

In `src/backend/prisma/schema.prisma`, inside the `RefreshToken` model, add after the `tenantId` line:
```prisma
  branchId       Int?      // clinic plane only; NULL for platform tokens and admin tokens without branch
```

- [ ] **Step 3: Apply migration and regenerate client**

```bash
cd D:\Development\AnimalClinic\src\backend
npx prisma db execute --file prisma/migrations/add_refresh_token_branch/migration.sql --schema prisma/schema.prisma
npx prisma generate
```

Expected: no errors; Prisma client regenerated with `branchId` on `RefreshToken`.

- [ ] **Step 4: Update `CreateRefreshTokenData` and `rotateToken` in refresh-token.repository.ts**

In `src/backend/models/refresh-token.repository.ts`:

Replace the `CreateRefreshTokenData` interface:
```typescript
export interface CreateRefreshTokenData {
  tokenHash:       string
  familyId:        string
  userId?:         number
  platformUserId?: number
  tenantId?:       number
  branchId?:       number   // ADD: clinic plane only; NULL for platform tokens
  plane:           string
  expiresAt:       Date
}
```

Inside `rotateToken`, find the `prisma.refreshToken.create({ data: { ... } })` block and add `branchId: old.branchId`:
```typescript
prisma.refreshToken.create({
  data: {
    tokenHash:      newHash,
    familyId:       newFamilyId,
    userId:         old.userId,
    platformUserId: old.platformUserId,
    tenantId:       old.tenantId,
    branchId:       old.branchId,   // ADD THIS LINE
    plane:          old.plane,
    expiresAt,
  },
}),
```

- [ ] **Step 5: Run tests — confirm no regressions**

```bash
cd D:\Development\AnimalClinic\src\backend
npm test 2>&1 | tail -20
```

Expected: all existing tests pass (`branchId` is nullable; no existing row is affected).

- [ ] **Step 6: Commit**

```bash
git add src/backend/prisma/schema.prisma src/backend/prisma/migrations/add_refresh_token_branch/migration.sql src/backend/models/refresh-token.repository.ts
git commit -m "feat(db): add branchId to refresh_tokens for per-session branch preservation"
```

---

## Task 3.6: Backend — Fix `switchBranch` to Validate `user_branches`

**Files:**
- Modify: `src/backend/services/auth.service.ts`
- Modify: `src/backend/tests/unit/authService.test.ts`

**Interfaces:**
- Consumes: `getUserBranches(tenantId, userId): Promise<{ id: number; name: string }[]>` from `user.repository.ts`
- Produces: `switchBranch()` throws `AuthError(403)` when non-admin tries to switch to an unassigned branch

- [ ] **Step 1: Write failing tests**

First, update the mock setup at the top of `src/backend/tests/unit/authService.test.ts`. Replace the entire `jest.mock('../../config/db', ...)` call with:

```typescript
jest.mock('../../config/db', () => ({
  __esModule: true,
  default: {
    tenant:       { findUnique: jest.fn() },
    user:         { findUnique: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    refreshToken: { create: jest.fn().mockResolvedValue({ id: 'rt-1', tokenHash: 'h', familyId: 'f', plane: 'clinic', expiresAt: new Date(), createdAt: new Date(), branchId: null }) },
    branch:       { findFirst: jest.fn(), findMany: jest.fn() },
    userBranch:   { findMany: jest.fn() },
  },
}))
```

Also replace the `jest.mock('../../config/jwt', ...)` call with:
```typescript
jest.mock('../../config/jwt', () => ({
  signToken:          jest.fn().mockReturnValue('mock.jwt.token'),
  signPendingToken:   jest.fn().mockReturnValue('mock.pending.token'),
  verifyPendingToken: jest.fn(),
}))
```

Add `switchBranch` to the import line:
```typescript
import { login, switchBranch } from '../../services/auth.service'
```

Add these tests at the end of the file (after the existing `describe` block):
```typescript
describe('authService.switchBranch', () => {
  const tenantId  = 1
  const userId    = 10
  const branch1   = { id: 1, tenantId, name: 'Main', isActive: true }
  const branch2   = { id: 2, tenantId, name: 'Branch 2', isActive: true }
  const staffUser = { id: userId, tenantId, name: 'Staff', role: 'staff', isActive: true, branchId: null }
  const adminUser = { id: userId, tenantId, name: 'Admin', role: 'admin', isActive: true, branchId: null }

  beforeEach(() => jest.clearAllMocks())

  it('staff can switch to an assigned branch', async () => {
    ;(prisma.user.findFirst   as jest.Mock).mockResolvedValue(staffUser)
    ;(prisma.branch.findFirst as jest.Mock).mockResolvedValue(branch1)
    ;(prisma.userBranch.findMany as jest.Mock).mockResolvedValue([
      { branch: { id: 1, name: 'Main' } },
    ])
    const result = await switchBranch(tenantId, userId, 'staff', 1)
    expect(result.branchId).toBe(1)
  })

  it('staff cannot switch to unassigned branch — throws 403', async () => {
    ;(prisma.user.findFirst   as jest.Mock).mockResolvedValue(staffUser)
    ;(prisma.branch.findFirst as jest.Mock).mockResolvedValue(branch2)
    ;(prisma.userBranch.findMany as jest.Mock).mockResolvedValue([
      { branch: { id: 1, name: 'Main' } },  // only branch1 assigned
    ])
    await expect(switchBranch(tenantId, userId, 'staff', 2))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('admin can switch to any branch regardless of user_branches', async () => {
    ;(prisma.user.findFirst   as jest.Mock).mockResolvedValue(adminUser)
    ;(prisma.branch.findFirst as jest.Mock).mockResolvedValue(branch2)
    // userBranch.findMany is NOT called for admin
    const result = await switchBranch(tenantId, userId, 'admin', 2)
    expect(result.branchId).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd D:\Development\AnimalClinic\src\backend
npm test -- --testPathPattern="authService" 2>&1 | tail -20
```

Expected: FAIL — switchBranch tests fail (no 403 thrown, admin path not separated).

- [ ] **Step 3: Update `switchBranch` in auth.service.ts**

Add this import at the top of `src/backend/services/auth.service.ts` (after existing imports):
```typescript
import * as userRepo from '../models/user.repository'
```

Replace the existing `switchBranch` function body (lines ~106-118) with:
```typescript
export async function switchBranch(
  tenantId: number, userId: number, role: JwtPayload['role'], targetBranchId: number,
): Promise<SwitchBranchResponse> {
  const user = await authRepo.findUserById(tenantId, userId)
  if (!user || !user.isActive) throw new AuthError('User not found', 404)

  const branch = await authRepo.findBranchById(tenantId, targetBranchId)
  if (!branch) throw new AuthError('Branch not found', 404)

  // Non-admin: verify target branch is in user's assigned branches
  if (role !== 'admin') {
    const assignedBranches = await userRepo.getUserBranches(tenantId, userId)
    if (!assignedBranches.some(b => b.id === targetBranchId)) {
      throw new AuthError('You are not assigned to this branch.', 403)
    }
  }

  const permSetVersion = await computePermSetVersion(userId, tenantId)
  const token = signToken({ userId, tenantId, branchId: targetBranchId, plane: 'clinic', permSetVersion, role })
  return { token, userId, tenantId, branchId: targetBranchId, role, name: user.name }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd D:\Development\AnimalClinic\src\backend
npm test -- --testPathPattern="authService" 2>&1 | tail -20
```

Expected: PASS — all three switchBranch tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/auth.service.ts src/backend/tests/unit/authService.test.ts
git commit -m "fix(auth): switchBranch validates user_branches for non-admin users"
```

---

## Task 4: Backend — Two-Step Login Flow

**Files:**
- Modify: `src/backend/types/index.ts`
- Modify: `src/backend/config/jwt.ts`
- Modify: `src/backend/models/auth.repository.ts`
- Modify: `src/backend/services/auth.service.ts`
- Modify: `src/backend/controllers/auth.controller.ts`
- Modify: `src/backend/routes/auth.routes.ts`
- Modify: `src/backend/tests/unit/authService.test.ts`
- Modify: `src/backend/tests/integration/auth.test.ts`
- Modify: `src/backend/__tests__/auth.test.ts`
- Modify: `src/backend/tests/integration/user-branch-assign.test.ts`

**Interfaces:**
- Consumes: `signPendingToken`, `verifyPendingToken` (new in jwt.ts, Task 4)
- Consumes: `findActiveBranchesByTenant(tenantId)` (new in auth.repository.ts, Task 4)
- Consumes: `getUserBranches(tenantId, userId)` (user.repository.ts, Task 2)
- Produces:
  - `POST /auth/login` → `LoginResponse` union (`requiresBranchSelection: true` always)
  - `POST /auth/select-branch` → `SelectBranchResponse` (full JWT + refreshToken with branchId)

- [ ] **Step 1: Update types in `src/backend/types/index.ts`**

Find `JwtPayload` and add `scope` field after `platformUserId`:
```typescript
export interface JwtPayload {
  userId:          number
  tenantId:        number
  branchId?:       number
  plane:           'clinic' | 'platform'
  permSetVersion:  number
  role:            string
  platformUserId?: number
  scope?:          'branch_select'   // ADD: marks 5-min pending tokens only
  iat?:            number
  exp?:            number
}
```

Replace the entire `LoginResponse` interface with this union type:
```typescript
// Two-step login: step 1 always returns branch selection prompt.
// Step 2 (/auth/select-branch) returns the full token.
export type LoginResponse =
  | {
      requiresBranchSelection: true
      pendingToken: string                        // 5-min JWT, scope='branch_select'
      branches:     { id: number; name: string }[] // admin: all active; staff/doctor: assigned only
    }
  | {
      requiresBranchSelection: false              // returned only by POST /auth/select-branch
      token:        string
      refreshToken: string
      userId:       number
      tenantId:     number
      branchId:     number
      role:         string
      name:         string
    }

/** Alias for the full-token variant — return type of selectBranch(). */
export type SelectBranchResponse = Extract<LoginResponse, { requiresBranchSelection: false }>
```

- [ ] **Step 2: Add pending token helpers in `src/backend/config/jwt.ts`**

Add these functions after `verifyToken`:
```typescript
/** Pending token payload — only used between login step 1 and step 2. */
interface PendingTokenPayload {
  userId:         number
  tenantId:       number
  plane:          'clinic'
  permSetVersion: number
  role:           string
  scope:          'branch_select'
}

/** Signs a 5-minute token used only for the branch-selection step. */
export function signPendingToken(payload: PendingTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '5m' } as jwt.SignOptions)
}

/** Verifies a pending token and asserts scope === 'branch_select'. Throws on invalid/expired. */
export function verifyPendingToken(token: string): JwtPayload {
  const payload = jwt.verify(token, config.jwtSecret) as JwtPayload
  if (payload.scope !== 'branch_select') throw new Error('Not a pending token')
  return payload
}
```

- [ ] **Step 3: Add `findActiveBranchesByTenant` to auth.repository.ts**

Add to `src/backend/models/auth.repository.ts`:
```typescript
/** All active branches for a tenant — used to populate admin's branch list at login step 1. */
export function findActiveBranchesByTenant(tenantId: number) {
  return prisma.branch.findMany({
    where:   { tenantId, isActive: true },
    select:  { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}
```

- [ ] **Step 4: Update `login()` in auth.service.ts**

Add these imports at the top of `src/backend/services/auth.service.ts` (after existing imports, `userRepo` may already be there from Task 3.6):
```typescript
import { signToken, signPendingToken, verifyPendingToken } from '../config/jwt'
import type { SelectBranchResponse } from '../types'
import * as userRepo from '../models/user.repository'
```

Replace everything from `// 5. Sign JWT` to the end of the `login()` function (keeping steps 1-4 unchanged — tenant resolve, user lookup, password check, time-window check, touchLastLogin):
```typescript
  // 5. All users go through two-step: issue pending token + branch list
  const permSetVersion = await computePermSetVersion(user.id, tenant.id)
  const isAdmin = user.role === 'admin'

  // admin: all active branches for tenant; staff/doctor: assigned branches only
  const branches = isAdmin
    ? await authRepo.findActiveBranchesByTenant(tenant.id)
    : await userRepo.getUserBranches(tenant.id, user.id)

  // Non-admin with zero assigned branches cannot log in
  if (!isAdmin && branches.length === 0) {
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

- [ ] **Step 5: Add `selectBranch()` to auth.service.ts**

Add this new function after the updated `login()` function:
```typescript
/**
 * Step 2 of two-step login: exchange a pending token + chosen branchId for a full JWT.
 * clinic_admin: any active branch in tenant allowed.
 * staff/doctor: branchId must be in user_branches for this user.
 */
export async function selectBranch(
  pendingToken: string,
  branchId:     number,
): Promise<SelectBranchResponse> {
  let payload: JwtPayload
  try {
    payload = verifyPendingToken(pendingToken)
  } catch {
    throw new AuthError('Invalid or expired session. Please log in again.', 401)
  }

  const { userId, tenantId, role, permSetVersion } = payload

  // Verify user still active
  const user = await authRepo.findUserById(tenantId, userId)
  if (!user || !user.isActive) throw new AuthError('User not found or inactive.', 401)

  // Verify branch exists and is active in this tenant
  const branch = await authRepo.findBranchById(tenantId, branchId)
  if (!branch) throw new AuthError('Branch not found or inactive.', 404)

  // Non-admin: verify branchId is in user_branches
  if (role !== 'admin') {
    const assignedBranches = await userRepo.getUserBranches(tenantId, userId)
    if (!assignedBranches.some(b => b.id === branchId)) {
      throw new AuthError('You are not assigned to this branch.', 403)
    }
  }

  const token = signToken({ userId, tenantId, branchId, plane: 'clinic', permSetVersion, role })

  const rawRefreshToken = crypto.randomBytes(32).toString('hex')
  const familyId        = crypto.randomUUID()
  await refreshTokenRepo.create({
    tokenHash: refreshTokenRepo.hashToken(rawRefreshToken),
    familyId,
    userId,
    tenantId,
    branchId,     // store selected branch so refresh preserves it
    plane:     'clinic',
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  })

  return {
    requiresBranchSelection: false as const,
    token,
    refreshToken: rawRefreshToken,
    userId,
    tenantId,
    branchId,
    role:  user.role,
    name:  user.name,
  }
}
```

- [ ] **Step 6: Update `refreshClinicToken()` to use `record.branchId`**

In `src/backend/services/auth.service.ts`, find where `newToken` is signed inside `refreshClinicToken`. Replace the `signToken` call:
```typescript
// BEFORE:
const newToken = signToken({
  userId:         record.userId,
  tenantId:       record.tenantId,
  branchId:       user.branchId ?? undefined,
  plane:          'clinic',
  permSetVersion,
  role:           user.role,
})

// REPLACE WITH (prefer stored branchId from the refresh_token row):
const newToken = signToken({
  userId:         record.userId,
  tenantId:       record.tenantId,
  branchId:       record.branchId ?? user.branchId ?? undefined,
  plane:          'clinic',
  permSetVersion,
  role:           user.role,
})
```

- [ ] **Step 7: Add controller handler + schema in auth.controller.ts**

Add `selectBranch` to the import in `src/backend/controllers/auth.controller.ts`:
```typescript
import { login, switchBranch, selectBranch, getMe, refreshClinicToken, revokeClinicToken } from '../services/auth.service'
```

Add schema and handler after `switchBranchSchema`:
```typescript
export const selectBranchSchema = z.object({
  pendingToken: z.string().min(1),
  branchId:     z.number().int().positive(),
}).strict()

export async function handleSelectBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pendingToken, branchId } = req.body as z.infer<typeof selectBranchSchema>
    const result = await selectBranch(pendingToken, branchId)
    res.status(200).json({ success: true, data: result })
  } catch (err) { next(err) }
}
```

- [ ] **Step 8: Add route in auth.routes.ts**

In `src/backend/routes/auth.routes.ts`, update the import to include `handleSelectBranch` and `selectBranchSchema`:
```typescript
import { handleLogin, loginSchema, handleSwitchBranch, switchBranchSchema, handleSelectBranch, selectBranchSchema, handleMe, handleRefresh, refreshSchema, handleLogout, logoutSchema } from '../controllers/auth.controller'
```

Add this route after the login route:
```typescript
// POST /auth/select-branch — step 2 of two-step login; no authMiddleware (signed pendingToken is the security)
router.post('/select-branch', loginRateLimiter, validate(selectBranchSchema), handleSelectBranch)
```

- [ ] **Step 9: Update unit tests in authService.test.ts**

The existing login tests check `result.token` and `result.role` — login now returns `requiresBranchSelection: true` with `pendingToken`. Replace the entire file content of `src/backend/tests/unit/authService.test.ts`:

```typescript
// @qa-agent — Unit tests: auth service (two-step login + switchBranch)
import bcrypt from 'bcrypt'
import { login, switchBranch } from '../../services/auth.service'

jest.mock('../../config/db', () => ({
  __esModule: true,
  default: {
    tenant:       { findUnique: jest.fn() },
    user:         { findUnique: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    refreshToken: { create: jest.fn().mockResolvedValue({ id: 'rt-1', tokenHash: 'h', familyId: 'f', plane: 'clinic', expiresAt: new Date(), createdAt: new Date(), branchId: null }) },
    branch:       { findFirst: jest.fn(), findMany: jest.fn() },
    userBranch:   { findMany: jest.fn() },
  },
}))
jest.mock('../../config/jwt', () => ({
  signToken:          jest.fn().mockReturnValue('mock.jwt.token'),
  signPendingToken:   jest.fn().mockReturnValue('mock.pending.token'),
  verifyPendingToken: jest.fn(),
}))
jest.mock('../../services/permission.service', () => ({
  computePermSetVersion: jest.fn().mockResolvedValue(1),
}))

import prisma from '../../config/db'

const mockTenant = { id: 1, subdomain: 'dev-clinic', isActive: true }
const mockBranch = { id: 5, tenantId: 1, name: 'Main', isActive: true }

async function makeUser(role = 'admin') {
  return {
    id: 10, tenantId: 1, name: 'Admin A', username: 'admin_a',
    email: 'admin@dev-clinic.com',
    passwordHash: await bcrypt.hash('AdminPass1!', 10),
    role, isActive: true, branchId: null, allowedStartTime: null, allowedEndTime: null,
  }
}

describe('authService.login — step 1 (credentials → pendingToken + branches)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('admin: returns pendingToken + all active branches for tenant', async () => {
    const user = await makeUser('admin')
    ;(prisma.tenant.findUnique as jest.Mock).mockResolvedValue(mockTenant)
    ;(prisma.user.findUnique   as jest.Mock).mockResolvedValue(user)
    ;(prisma.branch.findMany   as jest.Mock).mockResolvedValue([mockBranch])

    const result = await login({ subdomain: 'dev-clinic', username: 'admin_a', password: 'AdminPass1!' })

    expect(result.requiresBranchSelection).toBe(true)
    expect(result.pendingToken).toBe('mock.pending.token')
    expect(result.branches).toEqual([mockBranch])
    // userBranch.findMany NOT called for admin
    expect((prisma.userBranch.findMany as jest.Mock)).not.toHaveBeenCalled()
  })

  it('staff: returns pendingToken + assigned branches only', async () => {
    const user = await makeUser('staff')
    ;(prisma.tenant.findUnique   as jest.Mock).mockResolvedValue(mockTenant)
    ;(prisma.user.findUnique     as jest.Mock).mockResolvedValue(user)
    ;(prisma.userBranch.findMany as jest.Mock).mockResolvedValue([{ branch: { id: 5, name: 'Main' } }])

    const result = await login({ subdomain: 'dev-clinic', username: 'admin_a', password: 'AdminPass1!' })

    expect(result.requiresBranchSelection).toBe(true)
    if (result.requiresBranchSelection) {
      expect(result.branches).toHaveLength(1)
      expect(result.branches[0].id).toBe(5)
    }
    // branch.findMany NOT called for non-admin
    expect((prisma.branch.findMany as jest.Mock)).not.toHaveBeenCalled()
  })

  it('staff with zero assigned branches → throws 403', async () => {
    const user = await makeUser('staff')
    ;(prisma.tenant.findUnique   as jest.Mock).mockResolvedValue(mockTenant)
    ;(prisma.user.findUnique     as jest.Mock).mockResolvedValue(user)
    ;(prisma.userBranch.findMany as jest.Mock).mockResolvedValue([])

    await expect(login({ subdomain: 'dev-clinic', username: 'admin_a', password: 'AdminPass1!' }))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('throws 401 on wrong password', async () => {
    const user = await makeUser()
    ;(prisma.tenant.findUnique as jest.Mock).mockResolvedValue(mockTenant)
    ;(prisma.user.findUnique   as jest.Mock).mockResolvedValue(user)

    await expect(login({ subdomain: 'dev-clinic', username: 'admin_a', password: 'WrongPass!' }))
      .rejects.toMatchObject({ statusCode: 401 })
  })

  it('throws 401 when tenant not found', async () => {
    ;(prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null)
    await expect(login({ subdomain: 'no-tenant', username: 'nobody', password: 'pass' }))
      .rejects.toMatchObject({ statusCode: 401 })
  })

  it('throws 401 for inactive user', async () => {
    const user = { ...(await makeUser()), isActive: false }
    ;(prisma.tenant.findUnique as jest.Mock).mockResolvedValue(mockTenant)
    ;(prisma.user.findUnique   as jest.Mock).mockResolvedValue(user)
    await expect(login({ subdomain: 'dev-clinic', username: 'admin_a', password: 'AdminPass1!' }))
      .rejects.toMatchObject({ statusCode: 401 })
  })

  it('throws 401 for inactive tenant', async () => {
    ;(prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ ...mockTenant, isActive: false })
    await expect(login({ subdomain: 'dev-clinic', username: 'nobody', password: 'pass' }))
      .rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('authService.switchBranch', () => {
  const tenantId  = 1;  const userId = 10
  const branch1   = { id: 1, tenantId, name: 'Main', isActive: true }
  const branch2   = { id: 2, tenantId, name: 'Branch 2', isActive: true }
  const staffUser = { id: userId, tenantId, name: 'Staff', role: 'staff', isActive: true, branchId: null }
  const adminUser = { id: userId, tenantId, name: 'Admin', role: 'admin', isActive: true, branchId: null }

  beforeEach(() => jest.clearAllMocks())

  it('staff can switch to an assigned branch', async () => {
    ;(prisma.user.findFirst      as jest.Mock).mockResolvedValue(staffUser)
    ;(prisma.branch.findFirst    as jest.Mock).mockResolvedValue(branch1)
    ;(prisma.userBranch.findMany as jest.Mock).mockResolvedValue([{ branch: { id: 1, name: 'Main' } }])
    const result = await switchBranch(tenantId, userId, 'staff', 1)
    expect(result.branchId).toBe(1)
  })

  it('staff cannot switch to unassigned branch — throws 403', async () => {
    ;(prisma.user.findFirst      as jest.Mock).mockResolvedValue(staffUser)
    ;(prisma.branch.findFirst    as jest.Mock).mockResolvedValue(branch2)
    ;(prisma.userBranch.findMany as jest.Mock).mockResolvedValue([{ branch: { id: 1, name: 'Main' } }])
    await expect(switchBranch(tenantId, userId, 'staff', 2))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('admin can switch to any branch regardless of user_branches', async () => {
    ;(prisma.user.findFirst   as jest.Mock).mockResolvedValue(adminUser)
    ;(prisma.branch.findFirst as jest.Mock).mockResolvedValue(branch2)
    const result = await switchBranch(tenantId, userId, 'admin', 2)
    expect(result.branchId).toBe(2)
    expect((prisma.userBranch.findMany as jest.Mock)).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 10: Update `src/backend/tests/integration/auth.test.ts`**

Replace the entire file content with the two-step flow tests:

```typescript
// @qa-agent — Integration tests: two-step login (POST /auth/login + POST /auth/select-branch)
import request from 'supertest'
import { Server } from 'http'
import app from '../../app'

// These tests use seed users admin_a / admin_b who are clinic_admin (role='admin').
// Admin sees ALL branches for tenant; both seed tenants must have at least one branch.
const TENANT_A = { subdomain: 'dev-clinic',  username: 'admin_a', password: 'AdminPass1!' }
const TENANT_B = { subdomain: 'test-clinic', username: 'admin_b', password: 'AdminPass2!' }

let server: Server

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('POST /auth/login — step 1: credentials', () => {
  it('✅ returns requiresBranchSelection=true + pendingToken + branches list', async () => {
    const res = await request(server).post('/auth/login').send(TENANT_A)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.requiresBranchSelection).toBe(true)
    expect(res.body.data.pendingToken).toBeTruthy()
    expect(Array.isArray(res.body.data.branches)).toBe(true)
    expect(res.body.data.branches.length).toBeGreaterThan(0)
    // No full token yet
    expect(res.body.data.token).toBeUndefined()
  })

  it('✅ Tenant A and Tenant B get different pendingTokens (different tenant/user)', async () => {
    const [resA, resB] = await Promise.all([
      request(server).post('/auth/login').send(TENANT_A),
      request(server).post('/auth/login').send(TENANT_B),
    ])
    expect(resA.body.data.pendingToken).not.toBe(resB.body.data.pendingToken)
  })

  it('❌ returns 401 for wrong password', async () => {
    const res = await request(server).post('/auth/login').send({ ...TENANT_A, password: 'wrong' })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('❌ returns 401 for unknown subdomain', async () => {
    const res = await request(server).post('/auth/login').send({ ...TENANT_A, subdomain: 'ghost-clinic' })
    expect(res.status).toBe(401)
  })

  it('❌ returns 400 for missing username field', async () => {
    const res = await request(server).post('/auth/login').send({ subdomain: 'dev-clinic', password: 'pass' })
    expect(res.status).toBe(400)
  })
})

describe('POST /auth/select-branch — step 2: branch selection', () => {
  let pendingToken: string
  let branchId:     number

  beforeAll(async () => {
    const res = await request(server).post('/auth/login').send(TENANT_A)
    pendingToken = res.body.data.pendingToken
    branchId     = res.body.data.branches[0].id
  })

  it('✅ returns full token + refreshToken on valid pendingToken + branchId', async () => {
    const res = await request(server).post('/auth/select-branch').send({ pendingToken, branchId })
    expect(res.status).toBe(200)
    expect(res.body.data.requiresBranchSelection).toBe(false)
    expect(res.body.data.token).toBeTruthy()
    expect(res.body.data.refreshToken).toBeTruthy()
    expect(res.body.data.branchId).toBe(branchId)
    expect(res.body.data.role).toBe('admin')
    // Verify JWT payload
    const [, b64] = (res.body.data.token as string).split('.')
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString())
    expect(payload.tenantId).toBeDefined()
    expect(payload.branchId).toBe(branchId)
    expect(payload.role).toBe('admin')
    expect(payload.exp).toBeDefined()
    expect(payload.scope).toBeUndefined()   // scope only on pending tokens
  })

  it('❌ returns 401 for invalid pendingToken', async () => {
    const res = await request(server).post('/auth/select-branch').send({ pendingToken: 'bad.token.here', branchId })
    expect(res.status).toBe(401)
  })

  it('❌ returns 400 for missing branchId', async () => {
    const res = await request(server).post('/auth/select-branch').send({ pendingToken })
    expect(res.status).toBe(400)
  })
})

describe('GET /auth/me', () => {
  let token: string

  beforeAll(async () => {
    // Must complete both steps to get a real token
    const step1 = await request(server).post('/auth/login').send(TENANT_A)
    const { pendingToken, branches } = step1.body.data
    const step2 = await request(server)
      .post('/auth/select-branch')
      .send({ pendingToken, branchId: branches[0].id })
    token = step2.body.data.token
  })

  it('✅ returns current clinic identity with roleIds + permissions', async () => {
    const res = await request(server).get('/auth/me').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.username).toBe(TENANT_A.username)
    expect(res.body.data.tenantId).toBeDefined()
    expect(Array.isArray(res.body.data.roleIds)).toBe(true)
    expect(Array.isArray(res.body.data.permissions)).toBe(true)
    expect(res.body.data.passwordHash).toBeUndefined()
  })

  it('❌ returns 401 without a token', async () => {
    const res = await request(server).get('/auth/me')
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 11: Update `src/backend/__tests__/auth.test.ts`**

This file tests JWT payload shape and expiry. It creates users but no branches; admin sees all branches, which returns empty if the tenant has no branches. The test must create a branch and go through two-step. Replace the entire file:

```typescript
/**
 * Test Suite: auth-1.2 — JWT Authentication (two-step login)
 * @qa-agent | Protocol: qa-protocols.md §1 + §3 + §4
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../app'
import prisma from '../config/db'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { config } from '../config/env'

let server: Server
let tenantId:       number
let branchId:       number
let adminUsername:  string
let doctorUsername: string
let staffUsername:  string
const SUBDOMAIN = `auth-test-${Date.now()}`

/** Two-step login helper. Returns the full access token. */
async function fullLogin(username: string, password = 'ValidPass1!'): Promise<{ token: string; refreshToken: string; branchId: number }> {
  const step1 = await request(server)
    .post('/auth/login')
    .send({ subdomain: SUBDOMAIN, username, password })
  expect(step1.status).toBe(200)
  expect(step1.body.data.requiresBranchSelection).toBe(true)
  const { pendingToken, branches } = step1.body.data
  const selectedBranchId = branches[0]?.id ?? branchId

  const step2 = await request(server)
    .post('/auth/select-branch')
    .send({ pendingToken, branchId: selectedBranchId })
  expect(step2.status).toBe(200)
  return { token: step2.body.data.token, refreshToken: step2.body.data.refreshToken, branchId: selectedBranchId }
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })

  const hash   = await bcrypt.hash('ValidPass1!', 10)
  const tenant = await prisma.tenant.create({ data: { name: 'Auth Test Clinic', subdomain: SUBDOMAIN } })
  tenantId = tenant.id

  const branch = await prisma.branch.create({ data: { tenantId, name: 'Main Branch' } })
  branchId = branch.id

  const ts = Date.now() % 100000
  adminUsername  = `admin_${ts}`
  doctorUsername = `doctor_${ts}`
  staffUsername  = `staff_${ts}`

  const [admin, doctor, staff] = await Promise.all([
    prisma.user.create({ data: { tenantId, name: 'Auth Admin',  username: adminUsername,  email: `admin-${ts}@auth.local`,  passwordHash: hash, role: 'admin'  } }),
    prisma.user.create({ data: { tenantId, name: 'Auth Doctor', username: doctorUsername, email: `doctor-${ts}@auth.local`, passwordHash: hash, role: 'doctor' } }),
    prisma.user.create({ data: { tenantId, name: 'Auth Staff',  username: staffUsername,  email: `staff-${ts}@auth.local`,  passwordHash: hash, role: 'staff'  } }),
  ])

  // staff and doctor need user_branches rows to log in
  await prisma.userBranch.createMany({
    data: [
      { tenantId, userId: doctor.id, branchId },
      { tenantId, userId: staff.id,  branchId },
    ],
    skipDuplicates: true,
  })
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await prisma.userBranch.deleteMany({ where: { tenantId } })
  await prisma.user.deleteMany({ where: { tenantId } })
  await prisma.branch.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
})

describe('auth-1.2 — POST /auth/login (step 1)', () => {
  test('auth-01: Login step 1 returns requiresBranchSelection=true + pendingToken', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: adminUsername, password: 'ValidPass1!' })
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.requiresBranchSelection).toBe(true)
    expect(res.body.data.pendingToken).toBeTruthy()
    expect(Array.isArray(res.body.data.branches)).toBe(true)
  })

  test('auth-02: Doctor login step 1 shows only assigned branches', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: doctorUsername, password: 'ValidPass1!' })
      .expect(200)

    expect(res.body.data.requiresBranchSelection).toBe(true)
    expect(res.body.data.branches).toHaveLength(1)
    expect(res.body.data.branches[0].id).toBe(branchId)
  })

  test('auth-03: Staff login step 1 shows only assigned branches', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: staffUsername, password: 'ValidPass1!' })
      .expect(200)

    expect(res.body.data.requiresBranchSelection).toBe(true)
    expect(res.body.data.branches).toHaveLength(1)
  })

  test('auth-04: Full JWT after select-branch has correct payload', async () => {
    const { token } = await fullLogin(adminUsername)
    const decoded = jwt.verify(token, config.jwtSecret) as Record<string, unknown>
    expect(decoded.tenantId).toBe(tenantId)
    expect(decoded.role).toBe('admin')
    expect(decoded.branchId).toBe(branchId)
    expect(decoded.scope).toBeUndefined()   // scope only on pending tokens
    expect(decoded.exp).toBeDefined()
  })

  test('auth-05: Full JWT expires in ~8 hours', async () => {
    const { token } = await fullLogin(adminUsername)
    const decoded = jwt.decode(token) as { iat: number; exp: number }
    const diffHours = (decoded.exp - decoded.iat) / 3600
    expect(diffHours).toBeCloseTo(8, 0)
  })

  test('auth-06: Wrong password → 401', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: adminUsername, password: 'WrongPass!' })
      .expect(401)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/invalid credentials/i)
  })

  test('auth-07: Non-existent username → 401 (no user enumeration)', async () => {
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: 'nobody_user', password: 'ValidPass1!' })
      .expect(401)
  })

  test('auth-08: Unknown subdomain → 401', async () => {
    await request(server)
      .post('/auth/login')
      .send({ subdomain: 'does-not-exist', username: adminUsername, password: 'ValidPass1!' })
      .expect(401)
  })

  test('auth-09: Deactivated user → 401', async () => {
    const hash = await bcrypt.hash('ValidPass1!', 10)
    const ts   = Date.now() % 100000
    const uname = `inactive_${ts}`
    await prisma.user.create({
      data: { tenantId, name: 'Inactive', username: uname, email: `inactive-${ts}@auth.local`, passwordHash: hash, role: 'staff', isActive: false },
    })
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: uname, password: 'ValidPass1!' })
      .expect(401)
  })

  test('auth-10: Missing username field → 400', async () => {
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, password: 'ValidPass1!' })
      .expect(400)
  })

  test('auth-11: Missing password field → 400', async () => {
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: adminUsername })
      .expect(400)
  })

  test('auth-12: Username too short → 400', async () => {
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: 'ab', password: 'ValidPass1!' })
      .expect(400)
  })

  test('auth-13: Missing subdomain → 400', async () => {
    await request(server)
      .post('/auth/login')
      .send({ username: adminUsername, password: 'ValidPass1!' })
      .expect(400)
  })

  test('auth-14: Inactive tenant → 401', async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: false } })
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: adminUsername, password: 'ValidPass1!' })
      .expect(401)
    await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: true } })
  })
})
```

- [ ] **Step 12: Update login helper in user-branch-assign.test.ts**

In `src/backend/tests/integration/user-branch-assign.test.ts`:

1. Replace the `login` helper function with a two-step version:
```typescript
async function login(username: string): Promise<string> {
  // Step 1: credentials
  const step1 = await request(server)
    .post('/auth/login')
    .send({ subdomain: SUB, username, password: PASSWORD })
  expect(step1.status).toBe(200)
  expect(step1.body.data.requiresBranchSelection).toBe(true)
  const { pendingToken, branches } = step1.body.data
  // Step 2: select first available branch
  const step2 = await request(server)
    .post('/auth/select-branch')
    .send({ pendingToken, branchId: branches[0].id })
  expect(step2.status).toBe(200)
  return step2.body.data.token as string
}
```

2. In `beforeAll`, add `userBranch` row for `staff_t3` BEFORE calling `login('staff_t3')`. Insert after the `userRole.create` calls for staff:
```typescript
// staff_t3 must have a user_branches row to log in
await prisma.userBranch.create({
  data: { tenantId: tid, userId: staffUserId, branchId: branch1Id },
})
```

3. In `afterAll`, add cleanup for `userBranch` rows (they may already be there from Task 1 migration, but be explicit):
```typescript
await prisma.userBranch.deleteMany({ where: { tenantId: tid } })
```
(This is likely already present from the Task 3 test fixes.)

- [ ] **Step 13: Run unit tests**

```bash
cd D:\Development\AnimalClinic\src\backend
npm test -- --testPathPattern="authService" 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 14: Run integration auth tests**

```bash
cd D:\Development\AnimalClinic\src\backend
npm test -- --testPathPattern="auth.test|user-branch-assign" 2>&1 | tail -30
```

Expected: PASS

- [ ] **Step 15: Run full test suite**

```bash
cd D:\Development\AnimalClinic\src\backend
npm test 2>&1 | tail -20
```

Expected: 447+ tests pass. Fix any TypeScript errors from the `LoginResponse` union type change — callers that accessed `result.token` directly on login now need to handle `requiresBranchSelection`.

- [ ] **Step 16: Commit**

```bash
git add src/backend/types/index.ts src/backend/config/jwt.ts src/backend/models/auth.repository.ts src/backend/services/auth.service.ts src/backend/controllers/auth.controller.ts src/backend/routes/auth.routes.ts src/backend/tests/unit/authService.test.ts src/backend/tests/integration/auth.test.ts src/backend/__tests__/auth.test.ts src/backend/tests/integration/user-branch-assign.test.ts
git commit -m "feat(auth): two-step login — all users select branch after credentials; branchId preserved in refresh tokens"
```

---

## Task 5: Frontend — Login Branch Selection Step

**Files:**
- Modify: `src/frontend/src/hooks/useAuth.ts`
- Modify: `src/frontend/src/views/LoginView.tsx`
- Modify: `src/frontend/src/i18n/th.json`
- Modify: `src/frontend/src/i18n/en.json`

**Interfaces:**
- Consumes: `POST /auth/login` → `{ requiresBranchSelection: true, pendingToken, branches }` (Task 4)
- Consumes: `POST /auth/select-branch` → `{ requiresBranchSelection: false, token, refreshToken, userId, tenantId, branchId, role, name }` (Task 4)
- Produces: `useLogin()` returns `branchSelection` state + `loginMutation` + `selectBranchMutation` + `resetBranchSelection`

- [ ] **Step 1: Replace `src/frontend/src/hooks/useAuth.ts`**

```typescript
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuthStore, AuthData } from '../store/authStore'

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
  branchId:     number
  role:         string
  name:         string
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
  login: LoginStep2Response,
  remember: boolean,
  setAuth: (data: AuthData, remember: boolean) => void,
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
  }, remember)
  try { await useAuthStore.getState().refreshPermissions() } catch { /* server enforces */ }
}

export function useLogin() {
  const [branchSelection, setBranchSelection] = useState<BranchSelectionState | null>(null)
  const [remember, setRemember]               = useState(false)
  const setAuth   = useAuthStore((s) => s.setAuth)
  const navigate  = useNavigate()

  const loginMutation = useMutation({
    mutationFn: ({ remember: _rem, ...creds }: LoginPayload) =>
      api.post<{ success: boolean; data: LoginStep1Response | LoginStep2Response }>('/auth/login', creds),

    onSuccess: (res, vars) => {
      setRemember(vars.remember)
      const data = res.data.data
      if (data.requiresBranchSelection) {
        setBranchSelection({ pendingToken: data.pendingToken, branches: data.branches })
      } else {
        // fallback (shouldn't happen with current backend)
        void applyLogin(data, vars.remember, setAuth).then(() =>
          navigate(data.role === 'admin' ? '/clinic-admin/dashboard' : '/clinic/dashboard')
        )
      }
    },
  })

  const selectBranchMutation = useMutation({
    mutationFn: ({ pendingToken, branchId }: { pendingToken: string; branchId: number }) =>
      api.post<{ success: boolean; data: LoginStep2Response }>('/auth/select-branch', { pendingToken, branchId }),

    onSuccess: async (res) => {
      const data = res.data.data
      setBranchSelection(null)
      await applyLogin(data, remember, setAuth)
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
```

- [ ] **Step 2: Update `src/frontend/src/views/LoginView.tsx`**

The current LoginView imports `useLogin` and destructures it as `const login = useLogin()`, calling `login.mutate(...)`. Change the destructure and add branch selection UI.

At line 26, replace:
```tsx
const login = useLogin()
```
with:
```tsx
const { branchSelection, loginMutation: login, selectBranchMutation, resetBranchSelection } = useLogin()
```

The `handleSubmit` and `login.isPending` / `login.error` references stay the same (they use `login.mutate`, `login.isPending`, `login.error`).

Find the `<form>` block (starts at line ~101) and wrap the form + the surrounding content section. The simplest approach: replace the `<div className="w-full max-w-[440px]">` content block (from the branding section to the help section, lines ~79-227) with a conditional:

```tsx
<div className="w-full max-w-[440px]">

  {/* Branding — always visible */}
  <div className="mb-xl text-center md:text-left">
    {/* ... keep existing branding JSX unchanged ... */}
  </div>

  {/* Branch Selection Step */}
  {branchSelection ? (
    <div className="flex flex-col gap-lg">
      <div>
        <h2 className="text-headline-sm font-headline font-bold text-on-surface mb-xs">
          {t('login.selectBranch')}
        </h2>
        <p className="text-body-md text-on-surface-variant">
          {t('login.selectBranchHint')}
        </p>
      </div>
      <div className="flex flex-col gap-sm">
        {branchSelection.branches.map(branch => (
          <button
            key={branch.id}
            className="w-full text-left px-md py-md rounded-xl border border-outline-variant hover:bg-surface-container active:bg-surface-container-high transition-colors min-h-[52px] flex items-center gap-sm disabled:opacity-50"
            onClick={() => selectBranchMutation.mutate({
              pendingToken: branchSelection.pendingToken,
              branchId:     branch.id,
            })}
            disabled={selectBranchMutation.isPending}
          >
            <span className="material-symbols-outlined text-secondary flex-shrink-0" style={{ fontSize: '20px' }}>
              store
            </span>
            <span className="text-body-lg text-on-surface font-medium">{branch.name}</span>
            {selectBranchMutation.isPending && (
              <span className="ml-auto w-4 h-4 border-2 border-outline/40 border-t-secondary rounded-full animate-spin" />
            )}
          </button>
        ))}
      </div>
      {selectBranchMutation.isError && (
        <div className="flex items-start gap-sm bg-error-container/30 border border-error/30 rounded-lg px-md py-sm">
          <span className="material-symbols-outlined text-error flex-shrink-0 mt-0.5" style={{ fontSize: '18px' }}>error_outline</span>
          <p className="text-body-md text-error">{t('login.selectBranchError')}</p>
        </div>
      )}
      <button
        type="button"
        className="text-label-md text-on-surface-variant underline hover:text-on-surface transition-colors"
        onClick={resetBranchSelection}
      >
        {t('login.backToLogin')}
      </button>
    </div>
  ) : (
    <>
      {/* Credentials Form — keep all existing form JSX here unchanged */}
      <form className="space-y-lg" onSubmit={handleSubmit}>
        {/* ... all existing form fields ... */}
      </form>

      {/* Help */}
      <div className="mt-2xl text-center">
        {/* ... existing help JSX ... */}
      </div>
    </>
  )}
</div>
```

Note: The actual edit replaces the contents of the `<div className="w-full max-w-[440px]">` wrapper. Keep the branding section, the footer, and all outer layout unchanged. Only add the `{branchSelection ? (...) : (...)}` conditional inside the card.

- [ ] **Step 3: Add i18n keys to th.json**

In `src/frontend/src/i18n/th.json`, merge these keys into the existing `"login"` object (do not replace the whole file):
```json
"selectBranch": "เลือกสาขา",
"selectBranchHint": "กรุณาเลือกสาขาที่ต้องการเข้าใช้งาน",
"selectBranchError": "ไม่สามารถเลือกสาขาได้ กรุณาลองใหม่อีกครั้ง",
"backToLogin": "กลับหน้าเข้าสู่ระบบ"
```

- [ ] **Step 4: Add i18n keys to en.json**

In `src/frontend/src/i18n/en.json`, merge into the existing `"login"` object:
```json
"selectBranch": "Select Branch",
"selectBranchHint": "Please select the branch you want to log into.",
"selectBranchError": "Could not select branch. Please try again.",
"backToLogin": "Back to login"
```

- [ ] **Step 5: Run frontend tests**

```bash
cd D:\Development\AnimalClinic\src\frontend
npm test 2>&1 | tail -20
```

Expected: 95+ frontend tests pass. Fix TypeScript errors if any.

- [ ] **Step 6: Manual smoke test**

Start dev server:
```bash
cd D:\Development\AnimalClinic
npm run dev
```

1. Login as `admin_a` → branch list appears (all active branches for dev-clinic)
2. Click a branch → dashboard opens; confirm `/auth/me` response has correct `branchId`
3. Login as a staff user with 2 assigned branches → branch list shows 2 items
4. Login as a staff user with 0 assigned branches → 403 error shown, no branch list
5. Click "Back to login" from branch list → credentials form reappears (branchSelection reset)
6. After selecting branch, refresh page → still logged in (token preserved)

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/hooks/useAuth.ts src/frontend/src/views/LoginView.tsx src/frontend/src/i18n/th.json src/frontend/src/i18n/en.json
git commit -m "feat(ui): two-step branch selection at login for all clinic users"
```

---

## Task 6: Frontend — Admin Multi-Branch User Assignment

**Files:**
- Modify: `src/backend/controllers/user.controller.ts`
- Modify: `src/backend/routes/user.routes.ts`
- Modify: `src/frontend/src/views/admin/UserManagementTab.tsx`
- Modify: `src/frontend/src/i18n/th.json`
- Modify: `src/frontend/src/i18n/en.json`

**Interfaces:**
- Consumes: `getUserBranches(tenantId, userId)` (Task 2)
- Produces: `GET /users/:userId/branches` → `{ id: number; name: string }[]`
- Produces: Branch assignment UI uses checkboxes (multi-select) instead of single dropdown

- [ ] **Step 1: Add `GET /users/:userId/branches` endpoint to user.controller.ts**

In `src/backend/controllers/user.controller.ts`, add after the existing handlers:
```typescript
export async function handleGetUserBranches(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId  = Number(req.params.userId)
    const branches = await userRepo.getUserBranches(req.context!.tenantId, userId)
    res.json({ success: true, data: branches })
  } catch (err) { next(err) }
}
```

(Verify `import * as userRepo from '../models/user.repository'` is already present — it should be from Task 3.)

- [ ] **Step 2: Add route in user.routes.ts**

In `src/backend/routes/user.routes.ts`, add the GET route before the existing `/:userId/branch` PATCH route. Also add `handleGetUserBranches` to the import:
```typescript
import { ..., handleGetUserBranches } from '../controllers/user.controller'

router.get(
  '/:userId/branches',
  authMiddleware,
  requirePlane('clinic'),
  requirePermission('staff.assign_branch'),
  handleGetUserBranches,
)
```

- [ ] **Step 3: Write and run backend test for the new endpoint**

Add to `src/backend/tests/integration/user-branch-assign.test.ts` inside the existing `describe` block:
```typescript
it('GET /users/:id/branches returns the user\'s assigned branches', async () => {
  // First assign a branch
  await request(server)
    .patch(`/users/${staffUserId}/branch`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ branchIds: [branch1Id] })

  const res = await request(server)
    .get(`/users/${staffUserId}/branches`)
    .set('Authorization', `Bearer ${adminToken}`)
  expect(res.status).toBe(200)
  expect(Array.isArray(res.body.data)).toBe(true)
  const ids = (res.body.data as { id: number }[]).map(b => b.id)
  expect(ids).toContain(branch1Id)
})

it('GET /users/:id/branches returns 403 for non-admin', async () => {
  const res = await request(server)
    .get(`/users/${staffUserId}/branches`)
    .set('Authorization', `Bearer ${staffToken}`)
  expect(res.status).toBe(403)
})
```

Run:
```bash
cd D:\Development\AnimalClinic\src\backend
npm test -- --testPathPattern="user-branch-assign" 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 4: Commit backend endpoint**

```bash
git add src/backend/controllers/user.controller.ts src/backend/routes/user.routes.ts src/backend/tests/integration/user-branch-assign.test.ts
git commit -m "feat(api): add GET /users/:userId/branches endpoint"
```

- [ ] **Step 5: Update form state in UserManagementTab.tsx**

Read `src/frontend/src/views/admin/UserManagementTab.tsx`. Find the form state `useState` initializer. Replace `branchId: number | null` (or `branchId: null` default) with `branchIds: number[]`:

```typescript
// Change the form shape — replace branchId with branchIds
const [form, setForm] = useState({
  name:     '',
  username: '',
  email:    '',
  phone:    '',
  role:     'clinic_staff' as 'doctor' | 'staff',
  branchIds: [] as number[],   // REPLACE: was branchId: number | null
  isActive:  true,
})
```

- [ ] **Step 6: Add useEffect to load user's current branches when editing**

Add this after the existing state declarations in the component:
```typescript
useEffect(() => {
  if (!editingUser) { setForm(prev => ({ ...prev, branchIds: [] })); return }
  api.get<{ success: boolean; data: { id: number; name: string }[] }>(`/users/${editingUser.id}/branches`)
    .then(res => setForm(prev => ({ ...prev, branchIds: res.data.data.map(b => b.id) })))
    .catch(() => {})
}, [editingUser?.id])
```

- [ ] **Step 7: Replace branch dropdown with checkbox list**

Find the existing `<select>` or `<input>` for branch assignment. Replace it with:
```tsx
<div className="flex flex-col gap-xs">
  <label className="text-label-md text-on-surface-variant font-medium">
    {t('admin.users.assignedBranches')}
    <span className="text-error"> *</span>
  </label>
  <div className="flex flex-col gap-xs max-h-40 overflow-y-auto border border-outline-variant rounded-xl p-sm">
    {(branches as { id: number; name: string }[]).map(b => (
      <label key={b.id} className="flex items-center gap-sm py-xs cursor-pointer min-h-[44px]">
        <input
          type="checkbox"
          checked={form.branchIds.includes(b.id)}
          onChange={e => setForm(prev => ({
            ...prev,
            branchIds: e.target.checked
              ? [...prev.branchIds, b.id]
              : prev.branchIds.filter(id => id !== b.id),
          }))}
          className="w-4 h-4 accent-primary"
        />
        <span className="text-body-md text-on-surface">{b.name}</span>
      </label>
    ))}
  </div>
  {form.branchIds.length === 0 && (
    <p className="text-label-sm text-error">{t('admin.users.branchRequired')}</p>
  )}
</div>
```

- [ ] **Step 8: Update save handler**

Find the save/submit handler where branch assignment is called. Replace old single-branch call with:
```typescript
// After the user create/update API call resolves (uid = the user's id):
await api.patch(`/users/${uid}/branch`, { branchIds: form.branchIds })
```

Remove any old pattern that used `branchId` (singular).

- [ ] **Step 9: Add i18n keys**

In `src/frontend/src/i18n/th.json`, merge into the existing `"admin"."users"` object:
```json
"assignedBranches": "สาขาที่กำหนด",
"branchRequired": "กรุณาเลือกสาขาอย่างน้อย 1 สาขา"
```

In `src/frontend/src/i18n/en.json`, merge into the existing `"admin"."users"` object:
```json
"assignedBranches": "Assigned Branches",
"branchRequired": "Please assign at least one branch"
```

- [ ] **Step 10: Run full test suites**

```bash
cd D:\Development\AnimalClinic\src\backend && npm test 2>&1 | tail -20
cd D:\Development\AnimalClinic\src\frontend && npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 11: Manual smoke test**

1. Login as admin → User Management tab
2. Edit a staff user → checkbox list appears; current assigned branches are ticked
3. Tick an additional branch → Save → PATCH `/users/:id/branch` sends `branchIds: [b1, b2]`
4. Logout → login as that staff user → branch list shows 2 options
5. Select first branch → dashboard opens
6. Untick all branches for a staff user → client-side error "Please assign at least one branch" appears; if bypassed, server returns 422

- [ ] **Step 12: Commit**

```bash
git add src/frontend/src/views/admin/UserManagementTab.tsx src/frontend/src/i18n/th.json src/frontend/src/i18n/en.json
git commit -m "feat(ui): multi-branch checkbox assignment in user management"
```

---

## Verification

End-to-end checklist:

1. **Admin login** — step 1 returns branch list (all active branches for tenant); step 2 returns full token with selected `branchId`
2. **Staff login (1 branch)** — sees 1-item branch list; must click it (no auto-skip)
3. **Staff login (2+ branches)** — sees all assigned branches; selects one; enters app
4. **Staff login (0 branches)** — 403 "not assigned to any branch" at step 1; no branch list shown
5. **Staff selects unassigned branch** — 403 at `/auth/select-branch` (pendingToken tampered)
6. **Expired pendingToken** — wait 5 min then POST `/auth/select-branch` → 401 "Invalid or expired session"
7. **Token refresh** — after 8h, refresh uses `refresh_tokens.branchId`; selected branch preserved across rotation
8. **switchBranch** — staff switching to unassigned branch → 403; admin → allowed for any branch
9. **Admin assigns 2 branches to staff** — checkbox UI saves; staff login shows both
10. **Admin clears all branches from staff** — 422 from server (must have at least 1 branch)

```bash
cd D:\Development\AnimalClinic\src\backend && npm test 2>&1 | grep -E "Tests:|passed|failed"
cd D:\Development\AnimalClinic\src\frontend && npm test 2>&1 | grep -E "Tests:|passed|failed"
```
