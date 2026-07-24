# Phase 3: Integrations, System Admin + QA - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-11
**Phase:** 3-integrations-system-admin-qa
**Areas discussed:** System Settings tab structure, TC-S010 timeout test mock, useSystemSettings hook design

---

## System Settings Tab Structure

| Option | Description | Selected |
|--------|-------------|----------|
| In-page tab switcher | Single page, tab state in useState | |
| Sub-routes | /settings/system/platform etc. | |
| Accordion sections | All three sections always visible, collapsed by default | ✓ |

**User's choice:** Accordion sections

---

### Save pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Save per-section (Recommended) | Each section has its own Save button; PUT /:key per changed field | ✓ |
| One global Save button | Single Save saves all sections at once | |

---

### Feature Flags placeholder

| Option | Description | Selected |
|--------|-------------|----------|
| "Coming Soon" card | Muted card with icon + "Feature flag management — Phase 4" | ✓ |
| Hidden | Don't render section until Phase 4 | |
| Empty accordion | Section present but empty | |

---

### Access guard for non-superadmin

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect to /settings | useNavigate() redirect | |
| Inline "Access Denied" message | Permission error card inside page | ✓ |

---

### Test SMTP loading state

| Option | Description | Selected |
|--------|-------------|----------|
| Spinner on button + disable | Same as NotificationsPage testLoading pattern | ✓ |
| Loading overlay on section | Whole section grays out | |

---

### Maintenance Mode confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| No confirmation (Recommended) | Toggle saves with Save button like other fields | ✓ |
| Confirm dialog | Show warning dialog before saving | |

---

## TC-S010 Timeout Test Mock

| Option | Description | Selected |
|--------|-------------|----------|
| Mock fetch + jest fake timers | Never-resolving Promise + advance 10,001ms | ✓ |
| Shorten TEST_TIMEOUT_MS env | Real slow server with env override | |
| Just test AbortError handling | Mock AbortError directly (weaker) | |

**User's choice:** Mock fetch returning `new Promise(() => {})` + `jest.advanceTimersByTimeAsync(10001)`

---

### TC-S010 file location

| Option | Description | Selected |
|--------|-------------|----------|
| Extend settings-api.test.ts | Add alongside TC-S008/S009 | ✓ |
| New settings-connection-test.test.ts | Separate file | |

---

## useSystemSettings Hook Design

| Option | Description | Selected |
|--------|-------------|----------|
| Fetch all at once, destructure (Recommended) | Single useQuery for GET /admin/system-settings | ✓ |
| Per-section queries | 3 separate useQuery calls | |

---

### Save pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Batch PUT per changed field | Iterate dirty fields, PUT /:key each | ✓ |
| Single bulk endpoint | New POST /bulk endpoint (not built) | |

---

### SMTP password masking

| Option | Description | Selected |
|--------|-------------|----------|
| Same mask/stripMask pattern (Recommended) | Masked load, 👁 toggle, stripMask before PUT | ✓ |
| Plain password input | Standard input type="password" | |

---

## Claude's Discretion

- IntegrationsPage layout and field order
- Specific system settings keys per section (infer from seed.ts)
- Placeholder card visual design for X-ray/DICOM and Accounting

## Deferred Ideas

None.
