# How to Run Anemal Locally (Windows)

## Prerequisites
- Node.js ≥ 20: https://nodejs.org
- PostgreSQL 16 running locally OR Docker Desktop

---

## Step 1 — Start PostgreSQL

**Option A — Docker (easiest):**
```powershell
docker run --name anemal-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=anemal_dev -p 5432:5432 -d postgres:16
```

**Option B — Local PostgreSQL:**
Create a database named `anemal_dev` and note your username/password.

---

## Step 2 — Configure .env

The `.env` file is already at the project root. Open it and update if needed:
```
DATABASE_URL=postgresql://postgres:dev@localhost:5432/anemal_dev
JWT_SECRET=anemal-dev-jwt-secret-change-in-prod-32chars
```

If your PostgreSQL uses a different user/password, update `DATABASE_URL` accordingly.

---

## Step 3 — Install Backend & Run DB Setup

Open **PowerShell** in `D:\Development\AnimalClinic\`:

```powershell
cd src\backend

# Install all packages (~1-2 min first time)
npm install

# Generate Prisma client from schema
npm run db:generate

# Run database migrations (creates all tables)
npm run db:migrate

# Seed 2 tenants + 6 users
npm run db:seed
```

Expected seed output:
```
🌱 Seeding database...
  ✓ admin  — admin@dev-clinic.com
  ✓ doctor — doctor@dev-clinic.com
  ✓ staff  — staff@dev-clinic.com
  ✓ admin  — admin@test-clinic.com
  ✓ doctor — doctor@test-clinic.com
  ✓ staff  — staff@test-clinic.com
✅ Seed complete.
   Tenant A: dev-clinic (id: 1)
   Tenant B: test-clinic (id: 2)
```

---

## Step 4 — Run Unit Tests (no DB needed)

```powershell
# From src\backend\
npm test
```

Expected: **8 tests pass** (5 auth unit tests + 3 RBAC unit tests).  
Integration tests require the seeded DB and will be skipped if DB is unavailable.

> **Phase 8 note:** After seeding you also have a platform super-admin user seeded for the Platform Console. Login at `/platform/login` with the platform credentials from the seed output.

---

## Step 5 — Start Backend API

```powershell
# From src\backend\ (keep this terminal open)
npm run dev
```

API running at: `http://localhost:4000`

Test it:
```powershell
# Health check
curl http://localhost:4000/health

# Login as Tenant A admin
curl -X POST http://localhost:4000/auth/login `
  -H "Content-Type: application/json" `
  -d '{"subdomain":"dev-clinic","email":"admin@dev-clinic.com","password":"AdminPass1!"}'
```

---

## Step 6 — Start Frontend

Open a **second PowerShell** in the project root:

```powershell
cd src\frontend

# Install frontend packages
npm install

# Start Vite dev server
npm run dev
```

Frontend running at: `http://localhost:5173`

**Login credentials:**

> 🔑 **The "Clinic ID" field is required and case-sensitive.** It must match the tenant subdomain exactly.
> An empty/wrong Clinic ID makes **every** login (admin, doctor, and staff) fail with *"Invalid credentials. Please try again."*
> On `localhost` the Clinic ID now auto-fills to `dev-clinic`; just type it manually if it's blank.

**Dev Clinic — Clinic ID `dev-clinic`:**
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@dev-clinic.com | AdminPass1! |
| Doctor | doctor@dev-clinic.com | DoctorPass1! |
| Staff | staff@dev-clinic.com | StaffPass1! |

**Test Clinic — Clinic ID `test-clinic`** (isolation testing; note the `Pass2!` suffix):
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@test-clinic.com | AdminPass2! |
| Doctor | doctor@test-clinic.com | DoctorPass2! |
| Staff | staff@test-clinic.com | StaffPass2! |

---

## Step 7 — Run Integration Tests (requires seeded DB)

```powershell
# From src\backend\
npm test
```

All tests should pass including cross-tenant isolation tests, RBAC permission matrix, and platform plane isolation. As of Phase 8 completion the full suite runs approximately 394 tests (backend + frontend vitest).

Run frontend tests separately:
```powershell
cd src\frontend
npx vitest run
```

---

## New Routes (Phase 8 — T-5F)

| Route | Description | Access |
|-------|-------------|--------|
| `/clinic-admin/roles` | Clinic Role Editor — list, clone, edit permissions, delete roles | `clinic_admin` · requires `roles.view` permission |
| `/platform/login` | Platform Console login (separate from clinic login) | Platform users only |
| `/platform/customers` | Customer (tenant) list and management | Platform plane |
| `/platform/customers/:id` | Customer detail — Overview, Plan & Quota, Provisioning, Usage | Platform plane |
| `/platform/plans` | Plan management | Platform plane |
| `/platform/settings` | Platform-level settings | Platform plane |
| `/platform/audit` | Cross-tenant audit log | Platform plane |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Error: Missing required env var: DATABASE_URL` | Check `.env` is at project root; run from `src\backend\` |
| `Can't reach database server` | Make sure PostgreSQL / Docker container is running |
| `P1003: Database does not exist` | Create `anemal_dev` DB or check `DATABASE_URL` |
| `Port 4000 in use` | Change `PORT=4001` in `.env` |
| `Port 5173 in use` | Vite will auto-increment to 5174 |
| Prisma errors after schema change | `npm run db:generate` then restart dev server |
