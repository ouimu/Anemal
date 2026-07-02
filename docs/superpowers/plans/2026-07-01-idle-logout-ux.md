# Idle-Timeout Auto-Logout — Settings UI & Login Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let clinic admins configure `idleTimeoutMinutes` from the Settings screen, and show a banner on both login screens explaining why the user was logged out.

**Architecture:** A new "Security" section in `ClinicSettingsTab` reads/writes `idleTimeoutMinutes` through the existing settings query/mutation. Both login views read `?reason=idle` from the URL and render a banner — clinic side uses the i18n system, platform side (no i18n today) uses a plain string.

**Tech Stack:** React 18 + Tailwind + React Query (frontend), Vitest + Testing Library (tests).

**Depends on:**
- Plan 1 (`docs/superpowers/plans/2026-07-01-idle-logout-backend.md`) — `idleTimeoutMinutes` on `TenantSettings` / `/admin/settings`.
- Plan 2 (`docs/superpowers/plans/2026-07-01-idle-logout-frontend-core.md`) — redirects to `/login?reason=idle` and `/platform/login?reason=idle` on timeout.

Both must be merged before starting this plan.

**Split note:** This is Plan 3 of 3 for the idle-logout feature (split per Ponytail Gate — original combined plan was over the 3-subsystem / 10-file limit).

## Global Constraints

- Idle timeout range (clinic): 5–120 minutes, default 15.
- No new npm dependencies.
- Full spec: [docs/superpowers/specs/2026-07-01-idle-logout-design.md](../specs/2026-07-01-idle-logout-design.md). BA sign-off recorded there.

---

### Task 1: Frontend — Security section in Clinic Settings admin UI

**Files:**
- Modify: `src/frontend/src/views/admin/ClinicSettingsTab.tsx`
- Test: `src/frontend/src/__tests__/ClinicSettingsTab.test.tsx`

**Interfaces:**
- Consumes: `TenantSettings.idleTimeoutMinutes`, `useAdminSettings()`, `useUpdateSettings()` (Plan 1 Task 2 / Plan 2 Task 3 / existing `useAdmin.ts`).

- [ ] **Step 1: Write the failing test**

`src/frontend/src/__tests__/ClinicSettingsTab.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mutateAsync = vi.fn().mockResolvedValue({})

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      defaultSlotMinutes: 30, workStartTime: '08:00', workEndTime: '18:00',
      smsRemindersEnabled: true, lineRemindersEnabled: true, idleTimeoutMinutes: 15,
    },
    isLoading: false,
  }),
  useMutation: () => ({ mutateAsync, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import ClinicSettingsTab from '../views/admin/ClinicSettingsTab'

describe('ClinicSettingsTab — Security section', () => {
  it('renders the idle-timeout input with the loaded value', () => {
    render(<ClinicSettingsTab />)
    expect(screen.getByLabelText(/idle timeout/i)).toHaveValue(15)
  })

  it('submits the updated idle-timeout value on save', async () => {
    render(<ClinicSettingsTab />)
    fireEvent.change(screen.getByLabelText(/idle timeout/i), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ idleTimeoutMinutes: 45 }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `src/frontend`): `npx vitest run src/__tests__/ClinicSettingsTab.test.tsx`
Expected: FAIL — no element with label "idle timeout" exists yet.

- [ ] **Step 3: Add the Security section**

In `src/frontend/src/views/admin/ClinicSettingsTab.tsx`, add `idleTimeoutMinutes: 15` to the initial `form` state (Step 17-20 area) and to the `useEffect` sync block (Step 23-31 area):

```ts
  const [form, setForm] = useState({
    defaultSlotMinutes: 30, workStartTime: '08:00', workEndTime: '18:00',
    smsRemindersEnabled: true, lineRemindersEnabled: true, idleTimeoutMinutes: 15,
  })
```

```ts
  useEffect(() => {
    if (data) setForm({
      defaultSlotMinutes:  data.defaultSlotMinutes,
      workStartTime:       data.workStartTime,
      workEndTime:         data.workEndTime,
      smsRemindersEnabled: data.smsRemindersEnabled,
      lineRemindersEnabled:data.lineRemindersEnabled,
      idleTimeoutMinutes:  data.idleTimeoutMinutes,
    })
  }, [data])
```

Add a new `<section>` after the existing "Notifications" section (after the closing `</section>` around line 67, before the save-button `<div>`):

```tsx
      {/* Security */}
      <section>
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Security</h3>
        <div className="bg-surface border border-outline-variant rounded-xl p-5">
          <div className="flex flex-col gap-1 max-w-xs">
            <label htmlFor="idleTimeoutMinutes" className="text-xs text-on-surface-variant">
              Idle timeout (minutes)
            </label>
            <input
              id="idleTimeoutMinutes" type="number" min={5} max={120}
              value={form.idleTimeoutMinutes}
              onChange={e => setForm(p => ({ ...p, idleTimeoutMinutes: Number(e.target.value) }))}
              className="min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-xs text-on-surface-variant mt-1">
              Automatically log out any user after this many minutes of inactivity. 5–120 minutes.
            </p>
          </div>
        </div>
      </section>
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `src/frontend`): `npx vitest run src/__tests__/ClinicSettingsTab.test.tsx`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/admin/ClinicSettingsTab.tsx src/frontend/src/__tests__/ClinicSettingsTab.test.tsx
git commit -m "feat: add Security section to Clinic Settings for idle timeout"
```

---

### Task 2: Frontend — idle-logout banner on both login screens

**Files:**
- Modify: `src/frontend/src/i18n/index.ts` (after line 128 for `en`, after line 419 for `th`)
- Modify: `src/frontend/src/views/LoginView.tsx`
- Modify: `src/frontend/src/views/platform/PlatformLoginView.tsx`
- Test: `src/frontend/src/__tests__/LoginView.i18n.test.tsx` (extend existing file)

**Interfaces:**
- Consumes: nothing new (reads `window.location.search`; relies on Plan 2's `?reason=idle` redirect).

- [ ] **Step 1: Add the i18n key**

In `src/frontend/src/i18n/index.ts`, in the `en` dict, after line 128 (`'login.terms': 'Terms of Service',`):

```ts
  'login.idleLogoutMessage': 'You were logged out due to inactivity.',
```

In the `th` dict, after line 419 (`'login.terms': 'ข้อกำหนดการใช้บริการ',`):

```ts
  'login.idleLogoutMessage': 'คุณถูกออกจากระบบเนื่องจากไม่มีการใช้งาน',
```

- [ ] **Step 2: Write the failing test**

Add to `src/frontend/src/__tests__/LoginView.i18n.test.tsx` (check the file's existing mock setup first and follow its pattern — it already mocks `useUiStore`/`useAuthStore`/`useAuth`/`react-router-dom` for `LoginView`). Add:

```tsx
it('shows the idle-logout banner when ?reason=idle is present', () => {
  window.history.pushState({}, '', '/login?reason=idle')
  render(<LoginView />)
  expect(screen.getByText(/logged out due to inactivity/i)).toBeInTheDocument()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `src/frontend`): `npx vitest run src/__tests__/LoginView.i18n.test.tsx`
Expected: FAIL — no such text rendered yet.

- [ ] **Step 4: Add the banner to `LoginView`**

In `src/frontend/src/views/LoginView.tsx`, add right after the existing hooks near the top (after `const t = useT()`):

```tsx
  const showIdleBanner = new URLSearchParams(window.location.search).get('reason') === 'idle'
```

Then render it just above the `{/* Branding */}` block inside the login-form section (after the opening `<div className="w-full max-w-[440px]">`):

```tsx
            {showIdleBanner && (
              <div className="mb-lg flex items-start gap-sm bg-secondary-container/30 border border-secondary/30 rounded-lg px-md py-sm">
                <span className="material-symbols-outlined text-secondary flex-shrink-0 mt-0.5" style={{ fontSize: '18px' }}>
                  info
                </span>
                <p className="text-body-md text-on-surface">{t('login.idleLogoutMessage')}</p>
              </div>
            )}
```

- [ ] **Step 5: Add the banner to `PlatformLoginView`**

`PlatformLoginView.tsx` has no i18n integration (plain English strings throughout), so use a plain string here rather than `useT()`. Add near the top of the component body:

```tsx
  const showIdleBanner = new URLSearchParams(window.location.search).get('reason') === 'idle'
```

Render it inside the card, just before the `<form onSubmit={handleSubmit} className="space-y-md">` line:

```tsx
        {showIdleBanner && (
          <div className="mb-md flex items-start gap-sm bg-secondary-container/30 border border-secondary/30 rounded-lg px-md py-sm">
            <MaterialIcon name="info" size={18} />
            <p className="text-body-sm text-on-surface">You were logged out due to inactivity.</p>
          </div>
        )}
```

- [ ] **Step 6: Run test to verify it passes**

Run (from `src/frontend`): `npx vitest run src/__tests__/LoginView.i18n.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/i18n/index.ts src/frontend/src/views/LoginView.tsx src/frontend/src/views/platform/PlatformLoginView.tsx src/frontend/src/__tests__/LoginView.i18n.test.tsx
git commit -m "feat: show idle-logout banner on clinic and platform login screens"
```

---

## Final Verification (run once, after both tasks — this is the last plan in the feature, so this is also the whole-feature smoke test)

- [ ] Backend full suite: `cd src/backend && npm test` — expect 0 failures.
- [ ] Frontend full suite: `cd src/frontend && npm test` — expect 0 failures.
- [ ] Manual smoke test (per `.claude/roadmap/qa-protocols.md`): log into clinic plane, set `idleTimeoutMinutes` to 1 via `/clinic-admin/settings`, wait ~30s for the warning modal, confirm "Stay logged in" cancels it, then let it expire and confirm redirect to `/login?reason=idle` with the banner visible. Repeat for `/platform/login` using the `VITE_PLATFORM_IDLE_TIMEOUT_MINUTES` env var set to `1` in a local `.env`.
