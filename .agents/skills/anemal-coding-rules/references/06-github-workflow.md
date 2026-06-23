# GitHub Workflow, CI/CD & Deployment

> **Audience:** All developers, PM agent  
> **See also:** [Index](00-index.md)

---

## Branch Naming

```
main          — production-ready only; auto-deploys
staging       — integration testing; merges from features
feature/<ticket>-description    e.g. feature/VET-142-add-search
fix/<ticket>-description        e.g. fix/VET-201-race-condition
chore/<description>             e.g. chore/upgrade-prisma
hotfix/<ticket>-description     e.g. hotfix/VET-305-crash
```

**Rules:**
- Branch from `staging` (not `main`)
- Hotfixes branch from `main` and back-merge to `staging` immediately
- Delete branches after merge

---

## Conventional Commits

```
<type>(<scope>): <short summary under 72 chars>

[optional body — why, not what]

[optional footer: Closes #issue]
```

**Types:** `feat` | `fix` | `refactor` | `test` | `chore` | `docs` | `perf`

**Examples:**
```
feat(appointments): add double-booking conflict detection

fix(auth): return 401 on expired refresh token instead of 500

test(pets): add cross-tenant isolation test

Closes #142
```

---

## Pull Request Rules

**PR Title:** Must follow Conventional Commits format

**PR must include:**
- [ ] Description: what changed and why
- [ ] Test plan: steps to verify
- [ ] Screenshots for UI changes

**Size:** Aim for < 400 lines of diff

**Required approvals:**
- 1 approval: `chore`/`docs`/`test`
- 2 approvals: `feat`/`fix` touching backend or DB
- `@db-agent` review: any migration or query change
- `@qa-agent` sign-off: any auth or tenant isolation change

**Merge strategy:**
- Squash and Merge: `feature/*` and `fix/*`
- Merge Commit: `hotfix/*` → `main`
- No force-push to `staging` or `main`

---

## Code Review Checklist

Reviewers must verify:
- [ ] Multi-tenant: every DB query filtered by `tenantId`
- [ ] No `any` TypeScript types
- [ ] Zod validation on every new endpoint
- [ ] No raw SQL string interpolation
- [ ] No secrets in diff
- [ ] Tests added/updated
- [ ] Correct HTTP status codes
- [ ] No `console.log` statements
- [ ] `@db-agent` approval (if DB change)
- [ ] `@qa-agent` approval (if security-related)

---

## CI/CD Pipeline

Every PR to `staging` or `main` must pass:

```
1. Lint (ESLint + TypeScript) — zero errors
2. Unit tests — 100% pass
3. Security tests (tenant isolation) — 100% pass
4. Build (Vite + tsc) — zero errors
5. Integration tests — against test DB
6. E2E smoke test — critical paths only
```

**No `--no-verify` allowed.** If a hook fails, fix the root cause.

---

## Environment Tiers

| Tier | Branch | Purpose |
|------|--------|---------|
| Dev | local | Individual machines |
| Staging | `staging` | Integration testing, QA sign-off |
| Production | `main` | Live tenant data |

**Parity rule:** Staging must mirror production (same Node.js, OS, DB version).

---

## Deployment Rules

- **Staging:** Auto-deploy on merge to `staging` (after CI)
- **Production:** Manual approval in GitHub Actions
- Migrations run before new app version starts
- Rollback plan documented in every PR with migration
- Health check (`GET /health`) responds 200 within 30s or rollback triggers

---

## Pre-Production Checklist

Before production deploy, verify:
- [ ] `npm run test` — 100% pass
- [ ] `npm run test:security` — 100% pass
- [ ] TypeScript build — zero errors
- [ ] No `console.log` in diff
- [ ] Migration dry-run passes on staging DB
- [ ] Rollback SQL script prepared
- [ ] New indexes use `CONCURRENTLY`
- [ ] Secrets different from staging
- [ ] Error tracking connected
- [ ] Database backup within 24h

---

**See also:** [Security Rules](05-security-rules.md) | [Testing Rules](03-testing-rules.md)
