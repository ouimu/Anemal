# Anemal Tech Stack — Single Source of Truth

> **Status:** Authoritative definition
> **Last Updated:** 2026-07-08
> **Referenced by:** CLAUDE.md, specifications, all agent skills

---

## Backend

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Runtime | Node.js | 20 LTS | Server runtime |
| API Framework | Express.js | 4.19.x | HTTP routing & middleware |
| Database | PostgreSQL | 16+ | Relational data store |
| ORM | Prisma | 5.13.x | Type-safe database access |
| Auth | JWT | Custom | Clinic tokens carry `{ userId, tenantId, branchId, plane, permSetVersion, role }`; platform tokens carry `{ platformUserId, plane:'platform', role }`; 8h TTL |
| Permission cache | In-memory Map | 5-minute TTL | `permission.service.ts`; Redis is not integrated |
| Validation | Zod | 3.x | Runtime schema validation |
| Logging | Dependency-free JSON logger | project utility | `src/backend/utils/logger.ts`; no Winston dependency |

---

## Frontend

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Framework | React | 18 | Component library |
| Language | TypeScript | 5.x | Type safety |
| Build Tool | Vite | 5.x | Module bundler |
| State Management | Zustand | 4.x | Lightweight store |
| Data Fetching | TanStack Query | 5.x | Server state management |
| UI Components | Tailwind CSS | 3.4.x | Project design tokens + utility classes |
| Charts | Recharts | 2.12.x | Installed; use only where a chart is actually implemented |
| Barcode scanning | ZXing browser/library | 0.2.x / 0.22.x | Camera scanning implemented for Inventory (`components/BarcodeScanner/*`); pet/microchip camera barcode capture remains deferred |

---

## Multi-Tenancy

| Aspect | Implementation | Enforcement |
|--------|----------------|------------|
| Pattern | Shared Database, Shared Schema | `tenant_id` column on every table |
| Isolation | Row-level via tenant_id | Middleware + Repository layer |
| Auth Context | JWT payload includes `tenantId` | Never from request body/headers |
| DB Safety | Parameterized queries only | Prisma (prevents injection) |
| **Rule** | **Every SELECT/INSERT/UPDATE/DELETE includes `WHERE tenant_id = currentTenantId`** | Pre-merge code review |

## Planned / Deferred

These are not part of the current runtime stack unless a future phase wires them in:

| Technology | Status |
|------------|--------|
| Redis | Deferred; current permission cache is in-memory |
| shadcn/ui / Radix UI | Not integrated into the current component system |
| FullCalendar.js | Not integrated; appointments use project React views |
| Fabric.js / Cornerstone.js | Not integrated; advanced canvas/DICOM work is deferred |
| Omise / Stripe webhooks | Deferred to Phase 10, credentials required |
| LINE / Twilio dispatch | Deferred to Phase 11, credentials required |

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
