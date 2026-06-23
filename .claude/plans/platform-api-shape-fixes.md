# Platform Admin API Shape Fix Plan

BASE_COMMIT: cdac267

## Global Constraints

- No new DB migrations — fixes are in repository/service/controller layer only
- No new dependencies
- All existing backend tests must continue passing (`cd src/backend && npm test`)
- Coding rules: `anemal-coding-rules` skill — layered Route→Controller→Service→Repository
- Multi-tenancy: every query must still include tenant_id where applicable
- No changes to DB schema or Prisma schema

---

## Task 1 — P-FIX-01: Backend — normalize platform API response shapes

**Files in scope:**
- `src/backend/models/platform-customers.repository.ts`
- `src/backend/services/platform-customers.service.ts` (if exists) or controller
- `src/backend/controllers/platform-customers.controller.ts`
- `src/backend/models/platform-audit.repository.ts`
- `src/backend/controllers/platform-audit.controller.ts` (if exists) or routes
- `src/backend/controllers/system-settings.controller.ts`
- `src/backend/routes/platform-plans.routes.ts` + controller

**Bugs to fix:**

### B1 — Plans response shape
API currently returns: `{ id, key, name, priceMonth: string, maxBranches, maxUsers, maxOwners, features: {}, isActive: bool }`
Frontend expects:       `{ id, key, name, price: number, maxBranches, maxUsers, maxOwners, features: string[], isRetired: bool, createdAt }`

Fix: In the plans repository or controller, map the response:
- `priceMonth` (Prisma Decimal) → `price` (number, use `parseFloat`)
- `isActive` (bool) → `isRetired` (bool, inverted: `!isActive`)
- `features` (Json object `{}`) → `features` (string array, `Object.keys(features)` or `[]` if empty)
- Include `createdAt`

### B2 — Settings GET response shape
`GET /platform/settings` currently returns: `[{ key, value, description, category, isSecret, updatedBy, updatedAt }]` (array)
Frontend hook expects a single `PlatformSettings` object: `{ appName, baseUrl, maintenanceMode, trialDays, smtpHost, smtpPort, smtpUser, smtpFrom, featureFlags }`

The controller `getAllSettings` must transform the array using `SETTINGS_KEY_MAP` (already defined in the controller):
```
const SETTINGS_KEY_MAP = {
  appName:         'app_name',
  baseUrl:         'app_base_url',
  maintenanceMode: 'maintenance_mode',
  trialDays:       'default_trial_days',
  smtpHost:        'smtp_host',
  smtpPort:        'smtp_port',
  smtpUser:        'smtp_user',
  smtpFrom:        'smtp_from_email',
}
```
Build a reverse map (`app_name → appName`), then reduce the rows array into `{ appName: ..., baseUrl: ..., ... }`.
Type coerce: `maintenance_mode` value `"true"/"false"` → boolean; `default_trial_days`/`smtp_port` → number; others → string | null (empty string → null).
`featureFlags` key is not in system_settings rows — return `{}` as default.
Return the named object, not the array.

### B3/B4 — Customer list + detail response shape
`GET /platform/customers` currently returns per item: `{ id, name, subdomain, isActive, planId, createdAt }`
Frontend expects: `{ id, name, subdomain, planId, planName, status, userCount, trialEndsAt, createdAt }`

`GET /platform/customers/:id` currently returns: `{ id, name, subdomain, isActive, planId, createdAt, plan: null, quota: null }`
Frontend expects: `{ ..., planName, status, userCount, trialEndsAt, maxBranches, maxUsers, maxOwners, email, phone, address, logoUrl }`

Fix in repository/controller:
- `status` computed: if `!isActive` → `'suspended'`; else if `trialEndsAt && new Date(trialEndsAt) > new Date()` → `'trial'`; else → `'active'`
- `planName`: join from `plans` table via `planId` (or use the nested `plan` object if already joined)
- `userCount`: count of users belonging to this tenant (query `users` table with `tenantId`)
- `trialEndsAt`: expose from tenant record
- Detail only: `maxBranches, maxUsers, maxOwners` from quota override or plan defaults; `email, phone, address, logoUrl` from tenant record (null if not present in schema)

### B5 — Audit log response shape
`GET /platform/audit` currently returns per item: `{ id, action, targetTenantId, performedByPlatformUserId, ipAddress, createdAt }`
Frontend expects: `{ id, action, actorId, actorName, tenantId, tenantName, details, createdAt }`

Fix in audit repository:
- `actorId`: same as `performedByPlatformUserId`
- `actorName`: join `platform_users.name` where `platform_users.id = performedByPlatformUserId`
- `tenantId`: same as `targetTenantId`
- `tenantName`: join `tenants.name` where `tenants.id = targetTenantId` (nullable)
- `details`: return `{}` (empty object) as default — no metadata column yet

**Acceptance criteria:**
- `GET /platform/plans` returns items with `price: number`, `isRetired: boolean`, `features: string[]`
- `GET /platform/settings` returns single object with `appName`, `baseUrl`, `maintenanceMode` (bool), `trialDays` (number), smtp fields
- `GET /platform/customers` returns items with `status: 'active'|'trial'|'suspended'`, `planName: string|null`, `userCount: number`
- `GET /platform/customers/:id` returns `status`, `planName`, `maxBranches`, `maxUsers`, `maxOwners`, `trialEndsAt`
- `GET /platform/audit` returns items with `actorName: string`, `tenantName: string|null`, `details: {}`
- All existing backend tests pass

---

## Task 2 — P-FIX-02: Frontend — align hook types with corrected API

**Files in scope:**
- `src/frontend/src/hooks/usePlatformPlans.ts`
- `src/frontend/src/hooks/usePlatformCustomers.ts`
- `src/frontend/src/hooks/usePlatformAudit.ts`
- `src/frontend/src/hooks/usePlatformSettings.ts`

**After P-FIX-01 corrects the backend, update TypeScript types:**

### Plans hook
```typescript
export interface Plan {
  id:          number
  key:         string
  name:        string
  price:       number      // was missing, API now returns price
  maxBranches: number | null
  maxUsers:    number | null
  maxOwners:   number | null
  features:    string[]    // was features: string[] but API returned {}
  isRetired:   boolean     // API now returns isRetired
  createdAt:   string
}
```

### Customer hook
Verify `Customer` interface matches: `status: 'active'|'trial'|'suspended'`, `planName: string|null`, `userCount: number`
Verify `CustomerDetail` matches: add `trialEndsAt`, `maxBranches`, `maxUsers`, `maxOwners` if not already correct.

### Audit hook
Verify `AuditLog` interface: `actorId: number`, `actorName: string`, `tenantId: number|null`, `tenantName: string|null`, `details: Record<string,unknown>`

### Settings hook
`usePlatformSettings` already expects `PlatformSettings` object — should work after B2 backend fix. No type changes needed here.

**Acceptance criteria:**
- `npm run build` (or TypeScript check) passes in frontend
- No TypeScript errors on `price.toLocaleString()` in PlatformPlansView
- Frontend tests pass: `cd src/frontend && npm test`
