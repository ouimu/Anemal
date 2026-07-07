# ADR-0003 — Codex Audit Batch 1 Stop-Ship Decisions

Date: 2026-07-07
Status: Accepted
Context: QA audit (`RecomendByCodex/`) found 6 stop-ship items. BA sign-off verified all root causes against live code + DB. Grilling (Step 3.5) resolved the 5 open questions with the product owner.

## Decisions

### D1 — BUG-001: Existing plaintext secrets in platform_audit_logs → scrub + rotate
Redact secret values in existing `platform_audit_logs.details` rows in-place (one-time migration/script), documented as a security override to the FR-12 write-once policy. Affected tenant credentials (baseSmsApiKey, smtpPassword, lineChannelSecret) treated as compromised → rotate. Forward fix: deep, pattern-based (`/(password|secret|apikey|api_key|token|credential)/i`) deny-by-default redaction in `audit.middleware.ts`, applied to BOTH planes' audit writes. Provisioning service's semantic audit row (field names only) stays unchanged. Regression test: sentinel secrets via real HTTP route, assert no plaintext in audit rows.

### D2 — BUG-002: Trial support → deferred to Phase 10
Remove/hide `trialEndsAt` from customer create/edit UI and payload types. No backend change; Zod schemas stay `.strict()`. Trial lifecycle (Tenant.trialEndsAt column, status rules, `default_trial_days` consumer) becomes part of Phase 10 payment/SaaS billing.

### D3 — BUG-003: Plan features = boolean flags only (valued config deferred)
Canonical contract: `features` is `Record<string, boolean>`. Frontend write path translates `price` → `priceMonth` and `string[]` → record-of-true, mirroring existing backend read translation. Valued config (features carrying data, e.g. quotas per feature) explicitly deferred to a future phase — requires read-projection redesign so round-trips don't destroy values.

### D4 — BUG-004: Settings PUT accepts null (backend fix)
Backend PUT schema for optional SMTP fields becomes `.nullable()`; `null` = clear value (stored as `''`), `undefined` = unchanged, non-null = set. Symmetric with GET which emits null for blank. Frontend unchanged. Out of scope (flagged, not bundled): featureFlags silently ignored on PUT; settings audit actor uses userId instead of platformUserId.

### D5 — BUG-005: Seed re-run + deactivate duplicate users
Re-run idempotent seed (fixes doctor_b/staff_b login — user_branches upsert already in seed.ts since 76d6e09, DB just predates it). One-time cleanup sets `isActive=false` on tenant-2 duplicates (user4/5/6) and test artifacts (user2072, intruder_b) — no hard delete (FK safety). Add seed credential smoke test: full two-step login for every HOW-TO-RUN credential. The 403-on-no-branch behavior in auth.service.ts is correct deny-by-default and MUST NOT be relaxed.

### D6 — BUG-008: Platform audit date filters → pure UTC
`from`/`to` (`YYYY-MM-DD`) interpreted in UTC consistently: `from` → `T00:00:00.000Z`, `to` → `T23:59:59.999Z` (fixes local-time `setHours` on UTC-parsed date in `platform-audit.controller.ts:47-54`, which lost the last 7h of the UTC day at UTC+7 → time-of-day-dependent test flake). Add Zod regex `/^\d{4}-\d{2}-\d{2}$/` on both params. Contract documented: date filters are UTC calendar days, inclusive. Regression test uses injected timestamps, not wall-clock "today".

## Glossary additions
- **Plan features**: boolean capability flags on a subscription plan (`Record<string, boolean>`). Not valued configuration.
- **Audit redaction**: deny-by-default masking of secret-like keys (pattern-based, deep) before any audit `details` persistence, both planes.
- **Trial lifecycle**: deferred Phase 10 concept; no trial data model exists before then.
