# How to Run VetClinic Locally (Windows)

## Prerequisites
- Node.js ≥ 20: https://nodejs.org
- PostgreSQL 16 running locally OR Docker Desktop

---

## Step 1 — Start PostgreSQL

**Option A — Docker (easiest):**
```powershell
docker run --name vetclinic-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=vetclinic_dev -p 5432:5432 -d postgres:16
```

**Option B — Local PostgreSQL:**
Create a database named `vetclinic_dev` and note your username/password.

---

## Step 2 — Configure .env

The `.env` file is already at the project root. Open it and update if needed:
```
DATABASE_URL=postgresql://postgres:dev@localhost:5432/vetclinic_dev
JWT_SECRET=vetclinic-dev-jwt-secret-change-in-prod-32chars
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
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@dev-clinic.com | AdminPass1! |
| Doctor | doctor@dev-clinic.com | DoctorPass1! |
| Staff | staff@dev-clinic.com | StaffPass1! |
| Clinic ID | dev-clinic | |

---

## Step 7 — Run Integration Tests (requires seeded DB)

```powershell
# From src\backend\
npm test
```

All 13 tests should pass including cross-tenant isolation tests.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Error: Missing required env var: DATABASE_URL` | Check `.env` is at project root; run from `src\backend\` |
| `Can't reach database server` | Make sure PostgreSQL / Docker container is running |
| `P1003: Database does not exist` | Create `vetclinic_dev` DB or check `DATABASE_URL` |
| `Port 4000 in use` | Change `PORT=4001` in `.env` |
| `Port 5173 in use` | Vite will auto-increment to 5174 |
| Prisma errors after schema change | `npm run db:generate` then restart dev server |
