# ⚙️ Phase 1.5 — Settings & Configuration Module
> **Priority: 🔴 CRITICAL — Must complete before Phase 2 Core Operations**
> **Reason:** LINE OA, SMS, Payment, and Lab integrations depend on Settings config infrastructure first.
> **Added:** 2026-06-10

---

## 📋 Module Overview

| Item | Detail |
|---|---|
| **Module Name** | Settings & Configuration |
| **Phase** | 1.5 (inserted between Phase 1 Foundation and Phase 2 Core) |
| **Priority** | 🔴 CRITICAL |
| **Estimated Duration** | 1–2 weeks |
| **Blocking** | Session G (LINE/SMS dispatch), Session C (PromptPay QR), Session F (Payment Gateway), Lab Integration |
| **Owner Agents** | @db-agent, @dev-agent, @uiux-agent, @qa-agent |

---

## 🗂️ Task Breakdown

### 📦 Module S1 — Database & Backend Foundation

#### [x] Task S1.1 — Database Schema: `clinic_settings` table ✅ 2026-06-10
**Agent:** @db-agent | **Priority:** 🔴 Critical | **Depends on:** Phase 1 complete

> **Implementation note (approved design change):** instead of a new `clinic_settings` table, the existing `tenant_settings` table (1:1 with tenant, upsert auto-create) was **extended** with `operatingHours` JSONB, LINE/SMS/PromptPay/GB PrimePay/Lab fields, and `updatedBy` FK. `clinic_name` was NOT added — `tenant.name` remains the single source of truth. `updated_at` handled by Prisma `@updatedAt` (project convention) instead of a DB trigger. Migration: `20260610081405_phase1_5a_settings` (includes `down.sql`).

```sql
CREATE TABLE clinic_settings (
    id                  SERIAL PRIMARY KEY,
    tenant_id           INT REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT          uq_clinic_settings_tenant UNIQUE (tenant_id),
    clinic_name         VARCHAR(255),
    logo_url            TEXT,
    address             TEXT,
    phone               VARCHAR(50),
    tax_id              VARCHAR(50),
    website_url         TEXT,
    operating_hours     JSONB,               -- {"mon":{"open":"08:00","close":"18:00"},"sun":null}
    line_oa_token       TEXT,                -- AES-256 encrypted
    sms_provider        VARCHAR(50),         -- 'thaibulksms' | 'thsms' | null
    sms_api_key         TEXT,                -- AES-256 encrypted
    sms_sender_name     VARCHAR(50),
    promptpay_id        VARCHAR(50),
    payment_qr_url      TEXT,
    gbprimepay_public   TEXT,
    gbprimepay_secret   TEXT,                -- AES-256 encrypted
    lab_api_url         TEXT,
    lab_api_key         TEXT,                -- AES-256 encrypted
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by          INT REFERENCES users(id)
);

CREATE OR REPLACE FUNCTION update_clinic_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clinic_settings_updated_at
    BEFORE UPDATE ON clinic_settings
    FOR EACH ROW EXECUTE FUNCTION update_clinic_settings_timestamp();
```

**Acceptance Criteria:**
- [ ] UNIQUE constraint on `tenant_id`
- [ ] Trigger auto-updates `updated_at`
- [ ] No cross-tenant data access possible

---

#### [x] Task S1.2 — Database Schema: `system_settings` table ✅ 2026-06-10
**Agent:** @db-agent | **Priority:** 🔴 Critical

> Done — seeded idempotently inside the migration (`ON CONFLICT DO NOTHING`) with Anemal branding (`app_name='Anemal'`, anemal.app URLs). Secret values are AES-encrypted by `system-settings.service.ts`, masked on read.

```sql
CREATE TABLE system_settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       TEXT NOT NULL,
    description TEXT,
    category    VARCHAR(50),     -- 'smtp' | 'platform' | 'feature_flags'
    is_secret   BOOLEAN DEFAULT FALSE,
    updated_by  INT REFERENCES users(id),
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO system_settings (key, value, description, category, is_secret) VALUES
    ('app_name',         'VetCare SaaS',           'Application display name',          'platform', FALSE),
    ('app_base_url',     'https://app.vetcare.co',  'Base URL for links in emails',      'platform', FALSE),
    ('maintenance_mode', 'false',                   'Set true to show maintenance page', 'platform', FALSE),
    ('default_trial_days','30',                     'Free trial duration (days)',         'platform', FALSE),
    ('smtp_host',        '',     'SMTP server hostname',               'smtp', FALSE),
    ('smtp_port',        '587',  'SMTP server port',                   'smtp', FALSE),
    ('smtp_user',        '',     'SMTP authentication username',       'smtp', FALSE),
    ('smtp_password',    '',     'SMTP authentication password',       'smtp', TRUE),
    ('smtp_from_email',  'no-reply@vetcare.co', 'From address',        'smtp', FALSE),
    ('smtp_from_name',   'VetCare',             'From name',           'smtp', FALSE);
```

**Acceptance Criteria:**
- [ ] Super Admin only can access `system_settings`
- [ ] `is_secret = TRUE` → API masks value as `"••••••"` in response
- [ ] All seed rows inserted

---

#### [x] Task S1.3 — Database Schema: `settings_audit_log` table ✅ 2026-06-10
**Agent:** @db-agent | **Priority:** 🟡 High | **Depends on:** S1.1, S1.2

> Done — dedicated table (no tenant FK so audit rows survive tenant deletion; `tenantId NULL` = system_settings change). Repository: `models/settings-audit.repository.ts`. Secrets masked in old/new values.

```sql
CREATE TABLE settings_audit_log (
    id          SERIAL PRIMARY KEY,
    tenant_id   INT,                      -- NULL for system_settings
    changed_by  INT REFERENCES users(id),
    table_name  VARCHAR(50) NOT NULL,     -- 'clinic_settings' | 'system_settings'
    field_name  VARCHAR(100) NOT NULL,
    old_value   TEXT,                     -- masked if is_secret
    new_value   TEXT,                     -- masked if is_secret
    changed_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

#### [x] Task S1.4 — Encryption Utility for Sensitive Fields ✅ 2026-06-10
**Agent:** @dev-agent | **Priority:** 🔴 Critical
**File:** `src/backend/utils/encryption.ts`

> Done — AES-256-GCM, stored format `enc:v1:<iv>:<tag>:<ciphertext>` (versioned for key rotation; legacy plaintext passes through `decryptField`). `SETTINGS_ENCRYPTION_KEY` required at startup in `config/env.ts`. Unit tests: `tests/unit/encryption.test.ts` (roundtrip, unique IV, tamper detection, masking).

```typescript
// AES-256-GCM — uses SETTINGS_ENCRYPTION_KEY env var (32-byte hex)
// Generate: openssl rand -hex 32
export function encryptField(plaintext: string): string
export function decryptField(ciphertext: string): string
export function maskSecret(value: string): string  // "••••••••ab12"
```

**Acceptance Criteria:**
- [ ] Encrypt → decrypt roundtrip returns original value
- [ ] DB stores ciphertext, never plaintext
- [ ] `maskSecret()` shows last 4 characters only

---

### 📦 Module S2 — Backend API

#### [x] Task S2.1 — Clinic Settings API ✅ 2026-06-10
**Agent:** @dev-agent | **Priority:** 🔴 Critical
**File:** `src/backend/controllers/settings.controller.ts`

> Done — mounted at `/api/settings` (project uses `/api/...`, no `/v1`). Per-section `.strict()` zod schemas (any `tenantId` in body → 400). Test endpoints are stateless (`services/connection-test.service.ts`, 10s AbortController timeout, always 200 + `{success, detail}`). **Masked-echo guard** added to `tenant-settings.service.ts`: a client echoing `••••••••xxxx` back never overwrites the stored secret.

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/api/v1/settings/clinic` | Clinic Admin | Get own clinic settings |
| PUT | `/api/v1/settings/clinic` | Clinic Admin | Update clinic profile |
| PUT | `/api/v1/settings/clinic/notifications` | Clinic Admin | Save LINE OA / SMS config |
| POST | `/api/v1/settings/clinic/notifications/test` | Clinic Admin | Send test message (stateless) |
| PUT | `/api/v1/settings/clinic/payment` | Clinic Admin | Save PromptPay / payment config |
| PUT | `/api/v1/settings/clinic/integrations` | Clinic Admin | Save Lab API URL & key |
| POST | `/api/v1/settings/clinic/integrations/test` | Clinic Admin | Test Lab API connection |
| PUT | `/api/v1/settings/clinic/hours` | Clinic Admin | Save operating hours |

**Rules:** `tenant_id` always from JWT, never request body. Secret fields encrypted on save, masked on return. `/test` endpoints are stateless.

---

#### [x] Task S2.2 — System Settings API (Super Admin) ✅ 2026-06-10 (minimal)
**Agent:** @dev-agent | **Priority:** 🔴 Critical
**File:** `src/backend/controllers/system-settings.controller.ts`

> Done (minimal, approved decision) — new `superadmin` Role enum value (migration `20260610134121_phase1_5b_settings_api` + down.sql; seed user `super@anemal.app`). Routes at `/admin/system-settings` (GET /, GET/PUT /:key, POST /smtp/test — TCP reachability check). Superadmin has NO access to clinic-admin routes and vice-versa.

| Method | Endpoint | Role |
|---|---|---|
| GET | `/api/v1/admin/system-settings` | Super Admin |
| GET | `/api/v1/admin/system-settings/:key` | Super Admin |
| PUT | `/api/v1/admin/system-settings/:key` | Super Admin |
| POST | `/api/v1/admin/system-settings/smtp/test` | Super Admin |

---

#### [x] Task S2.3 — Personal Preferences API ✅ 2026-06-10
**Agent:** @dev-agent | **Priority:** 🟡 High

> Done — `language` ('th'|'en', default 'th') + `defaultCalendarView` ('day'|'week'|'month', default 'week') columns on `users`. GET/PUT `/api/settings/personal`, any role, scoped by `userId + tenantId` from JWT.

| Method | Endpoint | Role |
|---|---|---|
| GET | `/api/v1/settings/personal` | All Users |
| PUT | `/api/v1/settings/personal` | All Users |

Fields: language preference, default calendar view.

---

#### [x] Task S2.4 — Auto-create Default Clinic Settings on Tenant Registration ✅ 2026-06-10
**Agent:** @dev-agent | **Priority:** 🔴 Critical

> Done — already guaranteed by `getOrCreateSettings()` upsert on first access (no signup flow exists yet; when one is added it inherits this). `prisma/seed.ts` now also creates settings rows for seeded tenants explicitly.

```typescript
// In tenant registration service — insert after tenant row created
await prisma.clinicSettings.create({
  data: { tenantId: newTenant.id, clinicName: registrationData.clinicName, phone: registrationData.phone }
});
```

---

### 📦 Module S3 — Frontend Settings Pages

#### [ ] Task S3.1 — Settings Layout & Navigation
**Agent:** @uiux-agent + @dev-agent | **Priority:** 🔴 Critical
**File:** `src/frontend/src/views/settings/SettingsLayout.tsx`

- Left sidebar (collapsible on Tablet), role-based section visibility
- Sticky "Save Changes" button per section
- Last updated timestamp + "Updated by [name]"
- Nav: Clinic Profile · Operating Hours · Notifications · Payment · Integrations · My Preferences

---

#### [ ] Task S3.2 — Clinic Profile Page
**Agent:** @dev-agent | **Priority:** 🔴 Critical
**File:** `src/frontend/src/views/settings/ClinicProfilePage.tsx`
Fields: Clinic Name (required), Logo Upload (drag & drop + camera), Address, Phone, Tax ID, Website URL

---

#### [ ] Task S3.3 — Operating Hours Page
**Agent:** @dev-agent | **Priority:** 🔴 Critical
**File:** `src/frontend/src/views/settings/OperatingHoursPage.tsx`
UI: Toggle on/off per day + Time picker (open/close). Tablet: native time picker, toggle ≥ 44×44px.

---

#### [ ] Task S3.4 — Notifications Configuration Page
**Agent:** @dev-agent | **Priority:** 🔴 Critical ← **Session G (LINE/SMS) blocker**
**File:** `src/frontend/src/views/settings/NotificationsPage.tsx`

- LINE OA: Channel Access Token (masked `••••••••xxxx`), Test Send button, Connected status badge
- SMS: Provider dropdown (ThaiBulkSMS / THSMS / Disabled), API Key (masked), Sender Name, Test Send
- Security: 👁 toggle reveal, warning banner "API Keys are encrypted before storage"

---

#### [ ] Task S3.5 — Payment Configuration Page
**Agent:** @dev-agent | **Priority:** 🔴 Critical ← **Session C (PromptPay QR) blocker**
**File:** `src/frontend/src/views/settings/PaymentPage.tsx`

- PromptPay: ID field, Static QR upload, QR preview
- Credit Card (Phase 4 placeholder): GB PrimePay keys (masked), Active/Inactive badge

---

#### [ ] Task S3.6 — Integrations Page
**Agent:** @dev-agent | **Priority:** 🟡 High ← **Lab Integration blocker**
**File:** `src/frontend/src/views/settings/IntegrationsPage.tsx`

- Lab API: Base URL, API Key (masked), Test Connection button (✅/❌ + response time)
- Placeholder cards: X-ray/DICOM Viewer, Accounting Software

---

#### [ ] Task S3.7 — System Settings Page (Super Admin)
**Agent:** @dev-agent | **Priority:** 🔴 Critical
**File:** `src/frontend/src/views/admin/SystemSettingsPage.tsx`

Tabs: Platform (App Name, Base URL, Maintenance toggle, Trial Days) · Email/SMTP (Host, Port, User, Password masked, Test button) · Feature Flags (Phase 4 placeholder)

---

### 📦 Module S4 — QA & Validation

#### [x] Task S4.1 — Tenant Isolation Tests ✅ 2026-06-10
**Agent:** @qa-agent | **Priority:** 🔴 Critical

> Done — `tests/integration/settings-api.test.ts`. TC-S001–S004 all pass at endpoint level (plus: doctor → 403, superadmin ↔ clinic-admin route separation, cross-tenant value isolation).

```
TC-S001: Clinic A Admin GET /settings/clinic → returns only Clinic A data
TC-S002: Clinic A Admin PUT /settings/clinic with Clinic B tenant_id in body → rejected
TC-S003: Staff PUT /settings/clinic → 403 Forbidden
TC-S004: Super Admin GET /admin/system-settings → 200; Clinic Admin → 403
```

#### [x] Task S4.2 — Encryption Validation Tests ✅ 2026-06-10
**Agent:** @qa-agent | **Priority:** 🔴 Critical

> Done — TC-S005–S007 now pass at endpoint level too (PUT → ciphertext `enc:v1:` in DB, GET/PUT responses masked, decrypt roundtrip, masked-echo no-overwrite). TC-S008/S009 also covered with mocked fetch; TC-S010 (timeout URL) deferred — 10s timeout is enforced in code.

```
TC-S005: Save LINE Token → check DB directly → must be ciphertext
TC-S006: GET /settings/clinic → response masks secret fields
TC-S007: Encrypt → Decrypt roundtrip → original value returned
```

#### [ ] Task S4.3 — Test Connection Endpoint Tests
**Agent:** @qa-agent | **Priority:** 🟡 High

```
TC-S008: POST /notifications/test valid token → 200 + success
TC-S009: POST /notifications/test invalid token → 200 + error detail (not 500)
TC-S010: POST /integrations/test timeout URL → 10s timeout enforced, error returned
```

---

## 🚫 Stop Criteria

Escalate immediately if:
1. API keys / tokens stored as plaintext in DB
2. Tenant A can read or modify Tenant B's settings
3. Staff-level user can access PUT `/settings/clinic`
4. Test Connection endpoint saves data to DB unintentionally

---

## ✅ Phase 1.5 Definition of Done

- [x] `clinic_settings` (as extended `tenant_settings`) and `system_settings` tables exist with Prisma migration ✅
- [x] Encryption utility passes unit test roundtrip 100% ✅
- [x] GET/PUT Clinic Settings API enforces tenant isolation ✅ (TC-S001–S003)
- [x] Super Admin System Settings API works with role guard ✅ (`superadmin` role, TC-S004)
- [x] Test Connection endpoints work for LINE OA and Lab API ✅ (stateless, 10s timeout)
- [ ] Settings pages render correctly on Tablet (touch target ≥ 44px) *(Phase 1.5-D frontend)*
- [ ] Secret fields masked in UI, stored as ciphertext in DB *(API side ✅ — TC-S005/S006 endpoint-level; UI pending)*
- [ ] TC-S001 through TC-S010 all pass (0 failures) *(TC-S001–S009 ✅; TC-S010 timeout test deferred)*
- [x] Audit log records every settings change ✅ (`settings_audit_log`, per-field, secrets masked)

---

*Phase 1.5 Settings Module | Anemal VetCare SaaS | Added: 2026-06-10*
