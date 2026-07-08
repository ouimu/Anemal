# Anemal Coding Rules — Index

> **Version:** 1.0  
> **Owner:** @dev-agent, @qa-agent  
> **Master file:** coding-rules.md (831 lines, split into modules)

---

## Quick Navigation

| Module | For | Lines |
|--------|-----|-------|
| **01-backend-rules.md** | Backend devs, architects | Directory structure, layered architecture, code style |
| **02-frontend-rules.md** | Frontend devs, React devs | Component hierarchy, Tailwind, React Query |
| **03-testing-rules.md** | QA engineers, test devs | Unit/integration/E2E tests, coverage targets |
| **04-database-rules.md** | DB engineers, migrations | Query safety, schema rules, performance |
| **05-security-rules.md** | Security-critical work | TypeScript strict, JWT, multi-tenancy, validation, error handling |
| **06-github-workflow.md** | All devs, PM agent | Branching, commits, PRs, CI/CD, deployment |

---

## Load What You Need

**Backend implementation?**
- Load: `01-backend-rules.md` + `05-security-rules.md`

**Frontend implementation?**
- Load: `02-frontend-rules.md` + `05-security-rules.md`

**Database migration?**
- Load: `04-database-rules.md` + `05-security-rules.md`

**Writing tests?**
- Load: `03-testing-rules.md`

**Code review?**
- Load: All modules (comprehensive check)

**CI/CD or deployment?**
- Load: `06-github-workflow.md`

---

## Key Principles (All Modules)

1. **TypeScript strict mode** — no `any` types; explicit return types everywhere
2. **Multi-tenant isolation** — every DB query: `WHERE tenant_id = tenantId` (ABSOLUTE RULE)
3. **Server is security boundary** — UI gating is UX only, never security
4. **Structured logging** — use `src/backend/utils/logger.ts`, no `console.log` in production
5. **Parameterized queries** — Prisma ORM only; no raw SQL string interpolation

---

## Critical Rules Quick Reference

| Rule | Module |
|------|--------|
| Every DB query filtered by tenant_id | 04-database-rules.md, 05-security-rules.md |
| No `any` TypeScript types | 05-security-rules.md |
| Zod validation on every endpoint | 05-security-rules.md |
| Layered architecture: Route → Controller → Service → Repository | 01-backend-rules.md |
| 44×44px minimum touch targets | 02-frontend-rules.md |
| 90%+ service layer unit test coverage | 03-testing-rules.md |
| Conventional Commits format | 06-github-workflow.md |

---

**Master source:** See `coding-rules.md` for full unabridged reference.
