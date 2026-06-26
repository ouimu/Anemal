# Company Admin Branch Bypass — Design Spec

**Date:** 2026-06-26  
**Status:** Approved  
**Feature:** Company admin (`role === 'admin'`) bypasses branch selection on login and lands directly on the dashboard with company-wide scope (`branchId: null`). An optional branch switcher on the admin dashboard allows narrowing the view to a specific branch.

---

## Problem

All users currently go through a two-step login: credentials → branch picker → JWT. For company admins this is unnecessary friction — they manage the whole company, not a single branch, and their dashboard already shows cross-branch data.

---

## Behaviour

| User | Login flow | JWT branchId |
|------|-----------|--------------|
| `admin` | One step: credentials → full JWT | `null` (all-branches scope) |
| `staff` / `doctor` | Existing two-step: credentials → branch picker → full JWT | specific branch |

After login, admin can optionally switch to a specific branch via a dropdown on the dashboard. Selecting "All Branches" resets to `branchId: null`.

---

## Backend Changes

### `src/backend/services/auth.service.ts`

**`login()`** — add early return after step 4 (time-window check):

```typescript
if (isAdmin) {
  const permSetVersion = await computePermSetVersion(user.id, tenant.id)
  const token = signToken({ userId: user.id, tenantId: tenant.id, branchId: undefined, plane: 'clinic', permSetVersion, role: user.role })
  // issue refresh token with branchId: null
  const rawRefreshToken = crypto.randomBytes(32).toString('hex')
  const familyId = crypto.randomUUID()
  await refreshTokenRepo.create({ tokenHash: refreshTokenRepo.hashToken(rawRefreshToken), familyId, userId: user.id, tenantId: tenant.id, branchId: null, plane: 'clinic', expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS) })
  return { requiresBranchSelection: false as const, token, refreshToken: rawRefreshToken, userId: user.id, tenantId: tenant.id, branchId: null, role: user.role, name: user.name, companyName: tenant.name }
}
```

**`switchBranch()`** — extend signature to `targetBranchId: number | null`:

- If `targetBranchId === null`: only allowed when `role === 'admin'` (403 otherwise). Skip branch-exists check. Sign token with `branchId: undefined`.
- If `targetBranchId` is a number: existing logic unchanged.

### `src/backend/routes/auth.routes.ts` / `auth.controller.ts`

`POST /auth/switch-branch` — update controller to pass `null` through to `switchBranch()`. No new endpoint.

---

## Frontend Changes

### `src/frontend/src/hooks/useAuth.ts`

Remove the "shouldn't happen" comment on the `requiresBranchSelection: false` branch in `loginMutation.onSuccess`. No logic change — this path already calls `applyLogin()` and navigates to `/clinic-admin/dashboard` for `role === 'admin'`.

Add `useSwitchBranch` hook:

```typescript
// POST /auth/switch-branch with branchId: number | null
// On success: update authStore token + branchId + branchName
```

### `src/frontend/src/views/admin/AdminDashboard.tsx`

Add a branch selector dropdown at the top:

- Fetches branch list via existing `GET /admin/branches` query
- Options: "All Branches" (value: null) + one per active branch
- On change: calls `useSwitchBranch` → updates authStore → React Query refetches (queryKey includes branchId)
- Default: "All Branches" (matches null branchId on login)

### `src/frontend/src/store/authStore.ts`

No change. `branchId: number | null` and `branchName: string` already exist. Set `branchName = 'All Branches'` when `branchId` is null (handled in `applyLogin` / `useSwitchBranch`).

### `src/frontend/src/views/LoginView.tsx`

No change. `branchSelection` is never set for admins so the branch picker UI never renders.

---

## Data Flow

```
Admin login:
  POST /auth/login
    → isAdmin=true → sign JWT(branchId: null) → LoginStep2Response
    → frontend: applyLogin() → authStore(branchId: null, branchName: 'All Branches')
    → navigate /clinic-admin/dashboard

Admin switches to Branch X:
  POST /auth/switch-branch { branchId: 42 }
    → sign JWT(branchId: 42) → new token
    → authStore(branchId: 42, branchName: 'Branch X')
    → React Query refetches with new branchId in queryKey

Admin resets to all-branches:
  POST /auth/switch-branch { branchId: null }
    → role === 'admin' check passes → sign JWT(branchId: undefined)
    → authStore(branchId: null, branchName: 'All Branches')
```

---

## Edge Cases

| Case | Handling |
|------|---------|
| Non-admin sends `branchId: null` to switch-branch | 403 — enforced in `switchBranch()` |
| Token refresh while admin has `branchId: null` | `record.branchId` is null → refreshed token keeps null branchId |
| Single-branch tenant | Admin still bypasses; can optionally switch to that one branch |
| Admin routes filtering by branch | `/admin/*` routes already don't filter by branch — no change needed |

---

## Files Changed

| File | Change |
|------|--------|
| `src/backend/services/auth.service.ts` | `login()` early return for admin; `switchBranch()` null support |
| `src/backend/controllers/auth.controller.ts` | Pass null branchId through to service |
| `src/frontend/src/hooks/useAuth.ts` | Remove comment; add `useSwitchBranch` hook |
| `src/frontend/src/views/admin/AdminDashboard.tsx` | Branch switcher dropdown |

Total: 4 files modified, 0 new files.
