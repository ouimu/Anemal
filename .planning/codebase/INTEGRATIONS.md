# External Integrations

**Analysis Date:** 2026-06-10

## APIs & External Services

**Payment Processing:**
- GBPrimePay — Thai payment gateway for QR / card transactions
  - SDK/Client: No SDK; direct HTTP calls (TBD implementation)
  - Auth: `gbprimepayPublic` (plain), `gbprimepaySecret` (AES-256-GCM encrypted at rest in `tenant_settings`)
  - Config: stored per-tenant in `TenantSettings` model (`src/backend/prisma/schema.prisma`)

- PromptPay — Thai QR payment standard (static QR image)
  - Config: `promptpayId`, `paymentQrUrl` stored per-tenant in `TenantSettings`
  - UI: QR display deferred (listed in `remaining-tasks.md`)

**Messaging / Notifications:**
- LINE Official Account — appointment reminders via LINE messaging API
  - Auth: `LINE_CHANNEL_TOKEN` env var (for global dispatch); per-tenant `lineOaToken` stored AES-256-GCM encrypted in `TenantSettings`
  - Status: config storage complete (Phase 1.5-A); actual LINE API dispatch deferred

- Thai Bulk SMS / ThSMS — SMS appointment reminders
  - Providers: `thaibulksms` or `thsms` (selectable per tenant)
  - Auth: `SMS_API_KEY` env var (global); per-tenant `smsApiKey` AES-256-GCM encrypted in `TenantSettings`; sender name in `smsSenderName`
  - Status: config storage complete (Phase 1.5-A); actual SMS dispatch deferred

**Lab Integration:**
- External lab/diagnostics API (provider TBD)
  - Config: `labApiUrl`, `labApiKey` (encrypted) stored per-tenant in `TenantSettings`
  - Status: schema ready (Phase 1.5-A); API integration deferred

## Data Storage

**Databases:**
- PostgreSQL 15+
  - Connection: `DATABASE_URL` env var
  - Client: Prisma ORM v5.13.x; single shared `PrismaClient` in `src/backend/config/db.ts`
  - Multi-tenancy: shared database, shared schema; every tenant-scoped table has `tenantId` column
  - Migrations: `src/backend/prisma/migrations/`; run with `npx prisma migrate dev`
  - Seed: `src/backend/prisma/seed.ts`

**File Storage:**
- S3 / GCS (TBD — not yet implemented)
  - Env vars reserved: `STORAGE_BUCKET`, `STORAGE_REGION`
  - Current state: photo upload deferred; local filesystem used during development for PDF assets in `src/backend/assets/`

**Caching:**
- None — no Redis or in-memory cache layer; React Query handles client-side cache on the frontend

## Authentication & Identity

**Auth Provider:**
- Custom JWT (self-issued; no external IdP)
  - Implementation: `src/backend/config/jwt.ts` — `signToken` / `verifyToken` wrappers around `jsonwebtoken`
  - Payload: `{ userId, tenantId, branchId, role }`
  - TTL: 8 h (`JWT_EXPIRES_IN`)
  - Storage: in-memory only (no refresh token, no DB session table)
  - Middleware: `src/backend/middlewares/auth.middleware.ts` — extracts Bearer token, attaches decoded payload to `req.context`
  - RBAC: `src/backend/middlewares/rbac.middleware.ts` — role check after auth; roles: `admin`, `doctor`, `staff`
  - Password hashing: bcrypt, 10 rounds (`src/backend/config/env.ts` → `bcryptRounds`)

## Monitoring & Observability

**Error Tracking:**
- None — no Sentry, Datadog, or equivalent configured

**Logs:**
- Prisma query logging enabled in `development` mode; `error` only in production (configured in `src/backend/config/db.ts`)
- Express error handler middleware: `src/backend/middlewares/error-handler.middleware.ts`
- Audit trail: `AuditLog` Prisma model (Phase 4); `src/backend/middlewares/audit.middleware.ts` captures tenant-scoped action records
- Settings audit: `SettingsAuditLog` model (Phase 1.5-A) in `src/backend/models/settings-audit.repository.ts`

## CI/CD & Deployment

**Hosting:**
- AWS or Google Cloud (TBD — not yet provisioned)

**CI Pipeline:**
- None configured (no `.github/workflows/` or equivalent)
- Git remote: `ouimu/AnimalClinic` (private GitHub repo)

## Environment Configuration

**Required env vars (app fails to start if absent):**
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — HMAC secret for JWT sign/verify
- `SETTINGS_ENCRYPTION_KEY` — 32-byte hex key for AES-256-GCM encryption of sensitive tenant settings (generate: `openssl rand -hex 32`)

**Optional env vars with defaults:**
- `PORT` — backend HTTP port (default: `4000`)
- `JWT_EXPIRES_IN` — token TTL (default: `8h`)
- `NODE_ENV` — `development` | `production` (default: `development`)
- `BCRYPT_ROUNDS` — password hash cost (default: `10`)

**Integration env vars (optional, deferred features):**
- `STORAGE_BUCKET`, `STORAGE_REGION` — S3/GCS file storage
- `LINE_CHANNEL_TOKEN` — LINE messaging API
- `SMS_API_KEY` — SMS provider API key
- `GITHUB_TOKEN` — Claude Code MCP server access (dev tooling only)

**Secrets location:**
- `.env` file at project root (gitignored); template in `.env.example`
- Sensitive per-tenant values (LINE token, SMS key, payment secret, lab key) stored AES-256-GCM encrypted in the `tenant_settings` DB table

## Webhooks & Callbacks

**Incoming:**
- None currently implemented (PromptPay callback endpoint is deferred)

**Outgoing:**
- LINE Messaging API — reminder push (deferred; not yet dispatching)
- SMS provider APIs (thaibulksms / thsms) — reminder SMS (deferred; not yet dispatching)

## PDF Generation

**PDFKit 0.19.x** — server-side invoice and receipt PDF rendering
- Entry: used inside billing/invoice controllers
- Assets: `src/backend/assets/` (fonts, logo images for PDF templates)
- Type declarations: `@types/pdfkit ^0.17.6`

---

*Integration audit: 2026-06-10*
