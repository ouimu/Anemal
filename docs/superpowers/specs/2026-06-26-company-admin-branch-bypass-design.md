# Company Admin Branch Bypass — Design Spec

**Date:** 2026-06-26  
**Status:** Approved (post-grilling)  
**Feature:** Company admin (`role === 'admin'`) bypasses branch selection on login and lands directly on the dashboard with company-wide scope (`branchId: null`). An optional branch switcher in the `AdminLayout` sidebar lets the admin narrow to a specific branch or reset to all-branches.

---

## Problem

All users currently go through a two-step login: credentials → branch picker → JWT. For company admins this is unnecessary friction — they manage the whole company, not a single branch, and their dashboard already shows cross-branch data.

---

## Behaviour

| User | Login flow | JWT branchId |
|------|-----------|--------------|
| `admin` | One step: credentials → full JWT | `null` (all-branches scope) |
| `staff` / `doctor` | Existing two-step: credentials → branch picker → full JWT | specific branch |

After login, admin can optionally switch to a specific branch via a branch switcher in the `AdminLayout` sidebar. Selecting "All Branches" (`ภาพรวมทั้งหมด`) resets to `branchId: null`.

**Session boundary:** Branch focus persists for the 8-hour access token lifetime. Token expiry forces logout; the next login always starts in all-branches mode. No silent token refresh exists on the frontend (401 → clearAuth + redirect to login).

**Branch focus scope:** When admin is focused on Branch X, clinic-facing endpoints that read `req.context?.branchId` (appointments, invoices, transactions, etc.) return branch-scoped data. Admin dashboard KPI cards (`/admin/usage`) always show company-wide data regardless of branch focus — that endpoint ignores `branchId` by design.

---

## Backend Changes

### `src/backend/types/index.ts`

Update `LoginResponse` to a discriminated union (currently typed as always `requiresBranchSelection: true`):

```typescript
export type LoginResponse =
  | { requiresBranchSelection: true;  pendingToken: string; branches: { id: number; name: string }[] }
  | { requiresBranchSelection: false; token: string; refreshToken: string; userId: number; tenantId: number; branchId: number | null; role: string; name: string; companyName: string }
```

### `src/backend/services/auth.service.ts`

**`login()`** — add early return after step 4 (time-window check), before the pending token block:

```typescript
if (isAdmin) {
  const permSetVersion = await computePermSetVersion(user.id, tenant.id)
  const token = signToken({ userId: user.id, tenantId: tenant.id, branchId: undefined, plane: 'clinic', permSetVersion, role: user.role })
  const rawRefreshToken = crypto.randomBytes(32).toString('hex')
  const familyId = crypto.randomUUID()
  await refreshTokenRepo.create({
    tokenHash: refreshTokenRepo.hashToken(rawRefreshToken),
    familyId,
    userId: user.id,
    tenantId: tenant.id,
    branchId: null,
    plane: 'clinic',
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  })
  return {
    requiresBranchSelection: false as const,
    token,
    refreshToken: rawRefreshToken,
    userId: user.id,
    tenantId: tenant.id,
    branchId: null,
    role: user.role,
    name: user.name,
    companyName: tenant.name,
  }
}
```

**`switchBranch()`** — extend signature to `targetBranchId: number | null`:

- `targetBranchId === null`: only allowed when `role === 'admin'` (403 otherwise). Skip branch-exists check. Sign token with `branchId: undefined`.
- `targetBranchId` is a number: existing logic unchanged.

No refresh token is rotated on `switchBranch` — branch focus is a UI-layer choice that lasts the session, not a durable commitment.

### `src/backend/controllers/auth.controller.ts`

`handleSwitchBranch` — update to pass `null` through to `switchBranch()`. Input validation schema must allow `branchId: number | null`.

---

## Frontend Changes

### `src/frontend/src/hooks/useAuth.ts`

**`LoginStep2Response` interface** — update `branchId: number` → `branchId: number | null`.

**`applyLogin()`** — when `login.branchId === null`, set `branchName` from i18n key `nav.allBranches` instead of the default empty string:

```typescript
async function applyLogin(login, remember, setAuth, branchName = '') {
  const resolvedBranchName = login.branchId === null ? i18n.t('nav.allBranches') : branchName
  // use resolvedBranchName when calling setAuth
}
```

**`loginMutation.onSuccess`** — remove the "shouldn't happen" comment on the `requiresBranchSelection: false` branch. No logic change — this path already calls `applyLogin()` and navigates to `/clinic-admin/dashboard` for `role === 'admin'`.

**Add `useSwitchBranch` hook:**

```typescript
// POST /auth/switch-branch { branchId: number | null }
// On success: update authStore token + branchId + branchName
// branchName resolved client-side: null → t('nav.allBranches'), number → name from branch list
// No refresh token involved — frontend does not implement silent refresh
```

### `src/frontend/src/layouts/AdminLayout.tsx`

Add a branch switcher in the sidebar header, below the "Admin Panel" label:

- Fetches branch list via `GET /api/branches` (`queryKey: ['branches']`) — same query `AdminBranches` page already uses
- **Expanded sidebar:** full `<select>` dropdown — "All Branches" option + one per active branch; current branch highlighted
- **Collapsed sidebar:** single `apartment` icon (44×44px tap target) that opens a popover with the same options
- On change: calls `useSwitchBranch` → updates authStore (token + branchId + branchName) → React Query refetches scoped queries automatically (queryKey includes branchId)
- Default selection: "All Branches" (matches `branchId: null` from login)

### `src/frontend/src/i18n/index.ts`

Add translation key:

```typescript
'nav.allBranches': { en: 'All Branches', th: 'ภาพรวมทั้งหมด' }
```

### `src/frontend/src/views/LoginView.tsx`

No change. `branchSelection` is never set for admins so the branch picker UI never renders.

### `src/frontend/src/store/authStore.ts`

No change. `branchId: number | null` and `branchName: string` already exist.

---

## Data Flow

```
Admin login:
  POST /auth/login
    → isAdmin=true → sign JWT(branchId: null) → LoginStep2Response
    → frontend: applyLogin() → branchName = t('nav.allBranches')
    → authStore(branchId: null, branchName: 'All Branches' / 'ภาพรวมทั้งหมด')
    → navigate /clinic-admin/dashboard

Admin switches to Branch X (via sidebar switcher):
  POST /auth/switch-branch { branchId: 42 }
    → sign JWT(branchId: 42) → new access token
    → authStore(branchId: 42, branchName: 'Branch X')  ← name from client-side branch list
    → React Query refetches branch-scoped data

Admin resets to all-branches:
  POST /auth/switch-branch { branchId: null }
    → role === 'admin' check passes → sign JWT(branchId: undefined)
    → authStore(branchId: null, branchName: t('nav.allBranches'))

Session ends (token expires or explicit logout):
    → clearAuth() → redirect /login
    → next login always starts in all-branches mode
```

---

## Edge Cases

| Case | Handling |
|------|---------|
| Non-admin sends `branchId: null` to switch-branch | 403 — enforced in `switchBranch()` |
| Token expiry while admin has branch focus | Frontend 401 → logout → next login resets to all-branches |
| `requireBranchId` routes (invoice create, product write, etc.) | On `/clinic/*` — admins are redirected away from these routes by `ClinicLayout`; non-issue |
| Single-branch tenant | Admin still bypasses; can optionally switch to that one branch |
| Admin dashboard KPIs with branch focus | `/admin/usage` uses `tenantId` only — always company-wide; not affected by branchId |

---

## Files Changed

| File | Change |
|------|--------|
| `src/backend/types/index.ts` | `LoginResponse` union type; `branchId: number \| null` |
| `src/backend/services/auth.service.ts` | `login()` admin early return; `switchBranch()` null support |
| `src/backend/controllers/auth.controller.ts` | Pass null branchId through; update validation schema |
| `src/frontend/src/hooks/useAuth.ts` | `LoginStep2Response.branchId: number \| null`; fix `applyLogin` branchName; add `useSwitchBranch`; remove stale comment |
| `src/frontend/src/layouts/AdminLayout.tsx` | Branch switcher (icon+popover when collapsed / dropdown when expanded) |
| `src/frontend/src/i18n/index.ts` | Add `nav.allBranches` (EN + TH) |

**Total: 6 files modified, 0 new files.**
