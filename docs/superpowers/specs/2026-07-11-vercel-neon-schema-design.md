# Vercel Neon Schema Provisioning Design

**Date:** 2026-07-11
**Status:** Approved in conversation; pending written-spec review
**Owner:** PM / DB operations

## Objective

Create a fresh managed PostgreSQL database for Anemal through the Vercel Marketplace and reproduce the repository's canonical Prisma schema without copying data from the local Docker database.

This is a development resource. It is not a production cutover and does not need production backup retention or availability guarantees.

## Current State

- The local database runs PostgreSQL 16 in Docker container `vetclinic-pg`.
- Prisma reads PostgreSQL connection details from `DATABASE_URL`.
- The repository contains 22 Prisma migrations, all of which are applied to the local database.
- The repository is not linked to Vercel and has no `vercel.json` or `.vercel/project.json`.
- No Docker data needs to be transferred.

## Approved Target

- Create a Vercel project named `Anemal` without deploying the application in this scope.
- Provision Neon PostgreSQL through the Vercel Marketplace.
- Use the free/development plan.
- Select Singapore, or the closest available region to Thailand if Singapore is unavailable.
- Use PostgreSQL 15 or newer, compatible with the project's PostgreSQL 16 schema.
- Apply all 22 repository migrations with `prisma migrate deploy`.
- Do not run `prisma migrate dev`, `prisma db push`, `prisma/seed.ts`, or `prisma/seed-rbac.ts`.
- Do not export or import any records from `vetclinic_dev`.
- Leave the local Docker container, database, and volume unchanged.

## Expected Data State

"Schema only" means no Docker, tenant, clinic, user, pet, medical, billing, audit, or other test records are copied or seeded.

The following rows are expected and explicitly approved:

- Prisma migration metadata in `_prisma_migrations`.
- Ten non-secret defaults in `system_settings`, inserted by migration `20260610081405_phase1_5a_settings`.

All tenant and business-domain tables must otherwise be empty.

## Provisioning and Data Flow

1. Authenticate to the user's intended Vercel account/team.
2. Create the undeployed Vercel project `Anemal`.
3. Install/provision the Neon Marketplace integration and connect it to `Anemal`.
4. Select the free/development plan and nearest supported region.
5. Obtain a direct, TLS-enabled connection URL for migrations without displaying or committing it.
6. Run `prisma migrate deploy` once from `src/backend` using that direct URL.
7. If Neon supplies a pooled URL, retain it for a future serverless runtime; application deployment is outside this scope.
8. Verify migration state, schema reachability, and allowed row counts.

## Security and Secret Handling

- Store credentials only in Vercel/Neon-managed environment configuration or a temporary process environment.
- Never write the remote connection string to repository `.env` files, logs, documentation, or chat output.
- Require TLS for remote connections.
- Prefer a direct/non-pooled URL for migrations and a pooled URL for future Vercel runtime connections.
- Rotate credentials immediately if they are exposed.

## Failure Handling and Rollback

- If resource creation fails, stop before migrations and report the Vercel/Neon error.
- If a migration fails, do not run seed scripts or manually edit application tables. Capture the failed migration name, inspect Prisma migration status, and resolve the migration before retrying.
- Because 15 historical migrations lack repository down scripts, rollback means deleting the new development Neon resource and provisioning a fresh one, not mutating the local Docker database.
- The local Docker database remains the unaffected reference throughout the operation.

## Verification

Provisioning is complete only when all of the following are true:

- A Neon PostgreSQL resource associated with Vercel project `Anemal` exists in the selected account/team.
- The database is reachable over TLS.
- `prisma migrate status` reports the schema is current and all 22 migrations are applied with no failed migration.
- Prisma schema validation succeeds.
- Expected tables, enums, primary keys, foreign keys, unique constraints, and indexes exist.
- Tenant and business tables contain zero rows.
- `system_settings` contains exactly the ten approved migration-owned defaults.
- No seed script or Docker data import was executed.
- The local `vetclinic-pg` container and `vetclinic_dev` database are unchanged.
- No credentials are present in git changes or command output retained for handoff.

## Out of Scope

- Deploying the Express backend or Vite frontend to Vercel.
- Importing test or production data.
- Seeding demo tenants, users, roles, inventory, or platform administrators.
- Removing or changing the local Docker database.
- Configuring a production backup, retention, uptime, or disaster-recovery plan.
- Changing application code or database schema.
