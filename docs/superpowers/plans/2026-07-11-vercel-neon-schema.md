# Vercel Neon Schema Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an undeployed Vercel project named `Anemal`, attach a Neon development database, and apply the repository's 22 canonical Prisma migrations without copying or seeding test data.

**Architecture:** Vercel owns the project and Neon Marketplace integration under the user's Personal Account. Marketplace-managed environment variables are scoped to Development and Preview only; a direct Neon URL is mapped to `DATABASE_URL` only inside the migration process, while the pooled URL remains available for a future serverless runtime. Verification runs against the remote database without writing credentials to disk.

**Tech Stack:** Vercel CLI, Neon PostgreSQL (Free), PostgreSQL 15+, Prisma 5.13, PowerShell 5.1, Node.js 20+, Docker PostgreSQL client

## Global Constraints

- Use Vercel Personal Account and project name `Anemal`.
- Use Neon Free/Development in `aws-ap-southeast-1` (Singapore); if the CLI reports that region unavailable, stop and request approval before selecting another region.
- Connect database variables to Development and Preview only; Production must remain unconnected.
- Apply exactly 22 migrations with `prisma migrate deploy`; never use `migrate dev` or `db push`.
- Never run `prisma/seed.ts`, `prisma/seed-rbac.ts`, or import Docker data.
- Permit exactly 10 migration-owned rows in `system_settings` and Prisma metadata in `_prisma_migrations`; every other public table must be empty.
- Never print, commit, or write the remote connection URLs to disk.
- Leave `vetclinic-pg`, `vetclinic_dev`, and the Docker volume unchanged.
- Do not deploy the Express or Vite application.

---

### Task 1: Authenticate and create the undeployed Vercel project

**Files:**
- Generated locally and ignored: `.vercel/project.json`
- Modify: none

**Interfaces:**
- Consumes: Vercel Personal Account selected by the user.
- Produces: A linked, undeployed Vercel project named `Anemal` and local project metadata for later CLI commands.

- [ ] **Step 1: Confirm the repository is not already linked**

Run from `D:\Development\AnimalClinic`:

```powershell
if (Test-Path .\.vercel\project.json) { Get-Content .\.vercel\project.json } else { 'not-linked' }
```

Expected before provisioning: `not-linked`. If metadata exists, inspect it and stop if it points to any project other than `Anemal`.

- [ ] **Step 2: Start Vercel authentication**

```powershell
npx --yes vercel@latest login
```

Expected: the CLI opens or prints a secure verification URL. The user completes authentication in the browser. Do not request or copy an access token into chat.

- [ ] **Step 3: Verify the authenticated identity**

```powershell
npx --yes vercel@latest whoami
```

Expected: the user's Personal Account username. If a Team scope is selected, stop and switch to the Personal Account before continuing.

- [ ] **Step 4: Create and link the Vercel project without deploying**

```powershell
npx --yes vercel@latest link
```

Answer the interactive prompts exactly as follows:

```text
Set up this directory? yes
Which scope? Personal Account
Link to existing project? no
Project name? Anemal
Directory containing code? ./
Modify project settings? no
```

Expected: `.vercel/project.json` is created and the CLI reports that the directory is linked. Do not run `vercel deploy`.

- [ ] **Step 5: Verify project identity and undeployed scope**

```powershell
$project = Get-Content .\.vercel\project.json | ConvertFrom-Json
[PSCustomObject]@{ ProjectIdPresent = [bool]$project.projectId; OrgIdPresent = [bool]$project.orgId }
npx --yes vercel@latest project ls
```

Expected: both IDs are present and `Anemal` appears in the Personal Account project list. No deployment command has run.

---

### Task 2: Provision and scope the Neon Marketplace resource

**Files:**
- Modify: none

**Interfaces:**
- Consumes: linked Vercel project `Anemal` from Task 1.
- Produces: Neon resource `anemal-db` in Singapore with connection variables attached to Development and Preview.

- [ ] **Step 1: Inspect the current Neon integration contract**

```powershell
npx --yes vercel@latest integration guide neon
```

Expected: the guide lists the Free plan and region metadata. Confirm `aws-ap-southeast-1` is offered. If it is absent, stop and request approval for the nearest offered region.

- [ ] **Step 2: Provision the Neon resource**

```powershell
npx --yes vercel@latest integration add neon --name anemal-db --plan free -m region=aws-ap-southeast-1 -e development -e preview
```

Expected: the CLI provisions `anemal-db`. If first-use provider terms or consent appear, the user reviews and accepts them in the browser; the CLI then resumes. Do not add `-e production`.

- [ ] **Step 3: Verify the integration resource**

```powershell
npx --yes vercel@latest integration list --integration neon --format=json
```

Expected: one Neon resource named `anemal-db`, plan `free`, attached to project `Anemal`, with Singapore/`aws-ap-southeast-1` region metadata. Do not print environment-variable values.

- [ ] **Step 4: Verify environment scoping by variable names only**

```powershell
npx --yes vercel@latest env ls development
npx --yes vercel@latest env ls preview
npx --yes vercel@latest env ls production
```

Expected: Development and Preview include `DATABASE_URL` and a direct/non-pooled URL such as `DATABASE_URL_UNPOOLED`; Production contains neither Neon database variable. If the direct variable has a different name, record the name and use it in Task 3 without displaying its value.

---

### Task 3: Apply the canonical Prisma migration history

**Files:**
- Read: `src/backend/prisma/schema.prisma`
- Read: `src/backend/prisma/migrations/*/migration.sql`
- Modify: none

**Interfaces:**
- Consumes: Development-scoped Neon direct URL from Task 2 and the 22 checked-in migrations.
- Produces: Remote schema at the latest migration with no seed execution.

- [ ] **Step 1: Confirm local migration inputs**

```powershell
$migrationCount = (Get-ChildItem .\src\backend\prisma\migrations -Directory).Count
$migrationCount
Test-Path .\src\backend\node_modules\.bin\prisma.cmd
```

Expected: `22` and `True`. Stop if either value differs.

- [ ] **Step 2: Validate the remote direct URL exists without printing it**

```powershell
npx --yes vercel@latest env run -e development -- powershell -NoProfile -Command 'if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL_UNPOOLED)) { throw "DATABASE_URL_UNPOOLED is missing" }; "direct-url-present"'
```

Expected: `direct-url-present`. If Task 2 exposed a differently named direct URL, substitute only that variable name.

- [ ] **Step 3: Validate the Prisma schema with the direct URL**

```powershell
npx --yes vercel@latest env run -e development -- powershell -NoProfile -Command '$env:DATABASE_URL=$env:DATABASE_URL_UNPOOLED; & ".\src\backend\node_modules\.bin\prisma.cmd" validate --schema ".\src\backend\prisma\schema.prisma"; exit $LASTEXITCODE'
```

Expected: `The schema ... is valid` and exit code 0.

- [ ] **Step 4: Apply all migrations exactly once**

```powershell
npx --yes vercel@latest env run -e development -- powershell -NoProfile -Command '$env:DATABASE_URL=$env:DATABASE_URL_UNPOOLED; & ".\src\backend\node_modules\.bin\prisma.cmd" migrate deploy --schema ".\src\backend\prisma\schema.prisma"; exit $LASTEXITCODE'
```

Expected: Prisma reports 22 migrations found and all pending migrations applied successfully. If any migration fails, record only its name/error, do not seed or edit remote tables, and follow the design's delete-and-recreate rollback path.

- [ ] **Step 5: Verify Prisma migration status**

```powershell
npx --yes vercel@latest env run -e development -- powershell -NoProfile -Command '$env:DATABASE_URL=$env:DATABASE_URL_UNPOOLED; & ".\src\backend\node_modules\.bin\prisma.cmd" migrate status --schema ".\src\backend\prisma\schema.prisma"; exit $LASTEXITCODE'
```

Expected: `Database schema is up to date!` and no failed migration.

---

### Task 4: Verify TLS, schema shape, and exact empty-data contract

**Files:**
- Create temporarily: `C:\tmp\verify-anemal-neon.cjs`
- Delete after verification: `C:\tmp\verify-anemal-neon.cjs`
- Modify in repository: none

**Interfaces:**
- Consumes: migrated Development database from Task 3.
- Produces: machine-checked evidence that TLS is active, 42 tables and 22 migrations exist, only 10 allowed settings rows exist, and every other domain table is empty.

- [ ] **Step 1: Create the temporary verifier with `apply_patch`**

Create `C:\tmp\verify-anemal-neon.cjs` with exactly this content:

```javascript
const { PrismaClient } = require('D:/Development/AnimalClinic/src/backend/node_modules/@prisma/client');

const prisma = new PrismaClient();

async function scalar(sql) {
  const rows = await prisma.$queryRawUnsafe(sql);
  return Number(rows[0].value);
}

async function main() {
  const [connection] = await prisma.$queryRawUnsafe(`
    SELECT current_setting('server_version') AS version,
           COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS ssl
  `);
  const tables = await prisma.$queryRawUnsafe(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  const migrations = await scalar(`
    SELECT count(*)::int AS value
    FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `);
  const settings = await scalar('SELECT count(*)::int AS value FROM system_settings');
  const unexpected = [];

  for (const { tablename } of tables) {
    if (tablename === '_prisma_migrations' || tablename === 'system_settings') continue;
    if (!/^[a-z_][a-z0-9_]*$/.test(tablename)) throw new Error(`Unsafe table name: ${tablename}`);
    const count = await scalar(`SELECT count(*)::int AS value FROM "${tablename}"`);
    if (count !== 0) unexpected.push({ table: tablename, rows: count });
  }

  const result = {
    ssl: connection.ssl,
    postgresVersion: connection.version,
    tableCount: tables.length,
    migrationCount: migrations,
    systemSettingsCount: settings,
    unexpectedNonEmptyTables: unexpected,
  };
  console.log(JSON.stringify(result, null, 2));

  if (!connection.ssl) throw new Error('TLS is not active');
  if (Number.parseInt(connection.version, 10) < 15) throw new Error(`PostgreSQL 15+ required, found ${connection.version}`);
  if (tables.length !== 42) throw new Error(`Expected 42 tables, found ${tables.length}`);
  if (migrations !== 22) throw new Error(`Expected 22 migrations, found ${migrations}`);
  if (settings !== 10) throw new Error(`Expected 10 system settings, found ${settings}`);
  if (unexpected.length !== 0) throw new Error('Business tables are not empty');
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
```

The script contains no credentials and is outside the repository.

- [ ] **Step 2: Run the verifier through Vercel's in-memory environment injection**

```powershell
npx --yes vercel@latest env run -e development -- powershell -NoProfile -Command '$env:DATABASE_URL=$env:DATABASE_URL_UNPOOLED; node "C:\tmp\verify-anemal-neon.cjs"; exit $LASTEXITCODE'
```

Expected JSON fields:

```json
{
  "ssl": true,
  "tableCount": 42,
  "migrationCount": 22,
  "systemSettingsCount": 10,
  "unexpectedNonEmptyTables": []
}
```

`postgresVersion` may include a provider patch/build suffix but must start with 15, 16, 17, or newer.

- [ ] **Step 3: Delete the temporary verifier with `apply_patch`**

Delete `C:\tmp\verify-anemal-neon.cjs`. Confirm:

```powershell
Test-Path 'C:\tmp\verify-anemal-neon.cjs'
```

Expected: `False`.

---

### Task 5: Confirm local safety and record the handoff

**Files:**
- Read: `.vercel/project.json`
- Modify: none

**Interfaces:**
- Consumes: verified remote database and unchanged local Docker environment.
- Produces: final non-secret handoff with resource name, region, scopes, migration status, and verification counts.

- [ ] **Step 1: Confirm the local PostgreSQL container remains running**

```powershell
docker ps --filter name=vetclinic-pg --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
```

Expected: `vetclinic-pg`, image `postgres:16`, status `Up`, host port 5432.

- [ ] **Step 2: Reconfirm local database migration state without changing it**

```powershell
docker exec vetclinic-pg psql -U postgres -d vetclinic_dev -Atc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;"
```

Expected: `22`.

- [ ] **Step 3: Ensure no secret or unrelated repository change was introduced**

```powershell
git status --short
git diff --check
```

Expected: no tracked implementation changes and no `.env`/credential file. Preserve the pre-existing untracked `RecommendByCodex/` directory unchanged. `.vercel/` must remain ignored/untracked.

- [ ] **Step 4: Report completion without credentials**

Report only:

```text
Vercel scope: Personal Account
Vercel project: Anemal (undeployed)
Neon resource: anemal-db
Region: aws-ap-southeast-1
Plan: Free
Environment scopes: Development, Preview
Prisma migrations: 22 applied, 0 failed
Tables: 42
Allowed rows: system_settings=10, _prisma_migrations=22
Other business rows: 0
Local Docker DB: unchanged
```

Do not include URLs, usernames, passwords, tokens, project IDs, or organization IDs.

## Ponytail Gate

**Decision:** APPROVED

All seven simplicity criteria pass: the plan reuses Vercel, Neon, and Prisma tooling; changes no application API or dependency; creates no persistent implementation file; and remains bounded to provisioning, migration, and verification.
