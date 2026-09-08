---
name: anemal-coding-rules
description: >
  Anemal project coding standards enforcer for @dev-agent and @qa-agent.
  Use this skill whenever writing, reviewing, or refactoring any code in the Anemal
  codebase — backend routes, controllers, services, repositories, frontend components,
  hooks, stores, or tests. Also trigger for PR reviews, migration scripts, GitHub workflow
  tasks, CI/CD changes, and any security or database work. If the task involves touching
  a file in src/, this skill should be active.
---

# Anemal Coding Rules

This skill makes the full Anemal coding standards available during implementation and review work.

## What's covered

- Directory structure and file naming conventions (backend + frontend + shared)
- Layered architecture pattern: Route → Controller → Service → Repository
- TypeScript strict-mode rules (no `any`, explicit return types, DTOs)
- Security (JWT + multi-tenant isolation, injection prevention, file validation, secrets)
- Input validation (Zod schemas, colocated with the route/controller that uses them)
- Error handling (typed `AppError`, global middleware, structured logging)
- Database rules (tenant scoping, migration safety, query performance)
- Frontend component rules (Tailwind tokens only, touch targets, React Query)
- Design patterns: Repository, Strategy, Observer, Optimistic Lock, Idempotency Key
- GitHub workflow: branch naming, Conventional Commits, PR checklist, merge strategy
- CI/CD pipeline, environment tiers, pre-production checklist

## How to use

Read `references/00-index.md` first, then the numbered rule files it lists, before starting any implementation task. For code
review, use the checklists in **Section 12** (GitHub Workflow → Code Review Checklist) and
**Section 13** (Pre-Production Checklist) as the acceptance gate.

**Critical rules to verify on every PR:**
1. Every DB query on a tenant-scoped table includes `WHERE tenant_id = tenantId` (§ 4.2 / § 7.1)
2. `tenantId` comes from `req.user`, never from `req.body` or headers (§ 4.1)
3. No `any` TypeScript types (§ 3)
4. Zod validation middleware on every new endpoint (§ 5.1)
5. `AppError` subclass used for all thrown errors (§ 6.1)
6. No `console.log` — structured logger only (§ 6.5 / § 8)
7. Tenant isolation test added for any new protected resource (§ 9)

## Reference file

Full rules with code examples: `references/00-index.md` and the numbered files beside it (01-backend, 02-frontend, 03-testing, 04-database, 05-security, 06-github-workflow)
