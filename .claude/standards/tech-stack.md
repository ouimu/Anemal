# Anemal Tech Stack — Single Source of Truth

> **Status:** Authoritative definition  
> **Last Updated:** 2026-06-16  
> **Referenced by:** CLAUDE.md, specifications, all agent skills

---

## Backend

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Runtime | Node.js | 20 LTS | Server runtime |
| API Framework | Express.js | 4.18+ | HTTP routing & middleware |
| Database | PostgreSQL | 16+ | Relational data store |
| ORM | Prisma | 5.x | Type-safe database access |
| Auth | JWT | Custom | Token-based auth; `{ userId, tenantId, branchId, roleId }` payload, 8h TTL |
| Cache/Queue | Redis | 7.x | Session cache, background jobs |
| Validation | Zod | 3.x | Runtime schema validation |
| Logging | Winston | 3.x | Structured logging (JSON) |

---

## Frontend

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Framework | React | 18 | Component library |
| Language | TypeScript | 5.x | Type safety |
| Build Tool | Vite | 5.x | Module bundler |
| State Management | Zustand | 4.x | Lightweight store |
| Data Fetching | TanStack Query | 5.x | Server state management |
| UI Components | Tailwind CSS + shadcn/ui | Latest | Styling + component library |
| Calendar | FullCalendar.js | 6.x | Event scheduling |
| Canvas | Fabric.js | 5.x | Anatomy diagram editor |
| Offline Storage | IndexedDB (idb) | 8.x | Client-side persistence |

---

## Multi-Tenancy

| Aspect | Implementation | Enforcement |
|--------|----------------|------------|
| Pattern | Shared Database, Shared Schema | `tenant_id` column on every table |
| Isolation | Row-level via tenant_id | Middleware + Repository layer |
| Auth Context | JWT payload includes `tenantId` | Never from request body/headers |
| DB Safety | Parameterized queries only | Prisma (prevents injection) |
| **Rule** | **Every SELECT/INSERT/UPDATE/DELETE includes `WHERE tenant_id = currentTenantId`** | Pre-merge code review |

---

## Deployment

| Environment | Purpose | CI/CD |
|------------|---------|-------|
| Dev | Local development | Git pre-commit hooks |
| Staging | Pre-production testing | GitHub Actions on develop branch |
| Production | Live clinics | GitHub Actions on main branch |

**Deployment platform:** TBD (AWS/GCP/Azure — decision pending)

---

**See also:**
- [RBAC & Authorization](../specs/RBAC_Platform_Restructure_Spec.md)
- [Database Schema](../specs/database-schema.sql)
- [Coding Rules](../skills/anemal-coding-rules/references/00-index.md)
