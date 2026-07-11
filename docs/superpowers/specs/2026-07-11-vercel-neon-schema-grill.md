# Vercel Neon Schema Provisioning Grill

**Date:** 2026-07-11
**Status:** Findings resolved; BA approved

## Decision Summary

The approved design was stress-tested for ownership, environment isolation, data meaning, failure recovery, and secret handling. All findings below are resolved.

## Resolved Findings

### Ownership and billing scope

**Question:** Which Vercel scope owns the project and Marketplace resource?

**Decision:** Use the user's Vercel Personal Account, not a Team or Organization.

**Reason:** This is a personal development resource and should not inherit team billing or permission dependencies.

### Environment exposure

**Question:** Which Vercel environments receive the Neon integration variables?

**Decision:** Connect `Development` and `Preview` only. Do not connect `Production`.

**Reason:** The database is explicitly for development/testing and lacks the production backup, retention, availability, and access-control posture required by project NFRs.

### Meaning of schema-only

**Question:** Must every application table contain exactly zero rows?

**Decision:** Do not copy Docker data or run seed scripts. Permit the ten `system_settings` defaults created by the canonical migration and permit `_prisma_migrations` metadata.

**Reason:** These rows are migration-owned configuration and migration history, not clinic or test data.

### Migration source of truth

**Question:** Should provisioning use Prisma migrations, `db push`, or a schema-only dump?

**Decision:** Apply the repository's 22 migrations with `prisma migrate deploy` using the direct TLS connection URL.

**Reason:** This preserves canonical migration history and manual migration behavior. `db push` and a schema-only dump could omit or obscure migration-defined behavior.

### Failure recovery

**Question:** What happens if a historical migration fails on the fresh database?

**Decision:** Stop, record the failed migration without exposing credentials, delete only the newly created development resource if recovery requires rollback, recreate it, and retry after resolving the migration issue.

**Reason:** Fifteen historical migrations lack down scripts. Reprovisioning an empty development database is safer and simpler than attempting a partial reverse migration.

### Secret and connection handling

**Question:** How are migration and future runtime credentials separated?

**Decision:** Use a direct/non-pooled TLS URL in a temporary process environment for the one-time migration. Retain the Marketplace-managed pooled URL for a future serverless runtime. Do not store either URL in repository files or documentation.

**Reason:** Direct connections are appropriate for migration locking; pooled connections reduce future serverless connection exhaustion.

### Local database safety

**Question:** Is the Docker database modified or retired after remote provisioning?

**Decision:** No. Leave `vetclinic-pg`, `vetclinic_dev`, and its Docker volume unchanged.

**Reason:** The local database remains the unaffected development reference and rollback source.

## Residual Risks

- Vercel or Neon may require interactive authentication, Marketplace consent, or acceptance of provider terms. The user must complete any identity, consent, or billing confirmation that cannot be delegated.
- Singapore may not be offered for the selected plan at provisioning time. Select the closest available region to Thailand and record the actual region.
- Marketplace environment-variable names may differ from the application's expected `DATABASE_URL`. Map the pooled runtime URL to `DATABASE_URL` only for the approved `Development` and `Preview` scopes.
- The Vercel project is intentionally undeployed. Database provisioning does not make the Express/Vite application available online.

## Domain Modeling Outcome

No business-domain glossary or ADR change is required. This is reversible development infrastructure, and the distinction between Vercel Project, Neon Resource, and PostgreSQL Database is fully defined in the design and this grill record.

## Exit Criteria

- All grill questions have an explicit decision.
- No unresolved placeholder or user choice remains before planning.
- BA confirms that the design and resolved findings are ready for implementation planning.

## BA Sign-off

**Decision:** APPROVED

All prior conditions are resolved. The operation changes development infrastructure only, introduces no application route or authorization behavior, and is ready for implementation planning. Interactive authentication or Marketplace consent remains an execution dependency rather than a design blocker.
