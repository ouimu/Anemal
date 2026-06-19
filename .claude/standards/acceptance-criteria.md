# Acceptance Criteria Standards

> **Owner:** @ba-agent, @qa-agent  
> **Purpose:** Single source of truth for what makes work "done"

---

## Definition of Ready (Pre-Development)

A requirement is **ready for development** when:

- [ ] **Objective stated** — business value is clear ("Why are we building this?")
- [ ] **Actor & role named** — who uses this? What's their role? (`clinic_admin`, `doctor`, `clinic_staff`, etc.)
- [ ] **Permission codes assigned** — if protected, which roles? See [RBAC Matrix](../skills/anemal-rbac-matrix/references/RBAC_index.md)
- [ ] **Exception cases listed** — "What if X happens?" scenarios documented
- [ ] **NFR impact noted** — performance, scalability, security impact assessed
- [ ] **Acceptance criteria testable** — @qa-agent can verify each criterion
- [ ] **Dependencies & risks recorded** — blockers, external dependencies, risks identified

**Sign-off:** @ba-agent confirms ready → hand to @pm-agent for task breakdown

---

## Acceptance Criteria Format

**For each user story or feature, acceptance criteria must follow:**

```
Story: [Role] wants [action] so that [business value]

**Given** [precondition]
**When** [user does X]
**Then** [expected result]

Acceptance:
1. [ ] System allows [action] for [role]
2. [ ] System rejects [action] for [other role] with error: "[message]"
3. [ ] [Data] is persisted correctly
4. [ ] [External system] is notified
5. [ ] Tenant isolation enforced (no data leakage across tenants)
```

**Example:**

```
Story: Doctor wants to edit medical diagnosis so that patient records are accurate

Given: Doctor is logged in, viewing a past medical record
When: Doctor clicks "Edit Diagnosis" button and updates the text
Then: Changes are saved, timestamp updated, audit log created

Acceptance:
1. [ ] Only doctor can edit own diagnoses (clinic_staff cannot)
2. [ ] Edit button hidden for clinic_staff
3. [ ] Changes saved to database within 1 second
4. [ ] Audit log records who, what, when
5. [ ] No other clinic's data is accessible
6. [ ] Browser back-button doesn't lose changes
```

---

## Definition of Done (Pre-Merge)

Code is **ready for merge** when ALL of the following are true:

### Code Quality
- [ ] TypeScript strict mode: zero errors
- [ ] No `any` types; all types explicit
- [ ] JSDoc on all public functions
- [ ] Function length ≤ 50 lines (extract helpers if longer)
- [ ] No magic numbers (use named constants)
- [ ] No `console.log` in production code

### Multi-Tenant Isolation
- [ ] Every DB query includes `WHERE tenant_id = tenantId`
- [ ] `tenantId` comes from JWT, never from request body/headers
- [ ] Tenant isolation test added for any protected resource
- [ ] @db-agent has reviewed for isolation bugs

### Security
- [ ] Input validation: Zod schema on every endpoint
- [ ] No SQL injection risk (Prisma parameterized queries)
- [ ] JWT tokens never logged
- [ ] Secrets never in code (use environment variables)
- [ ] CORS whitelist is specific (not `*`)
- [ ] Rate limiting on auth endpoints

### Testing
- [ ] Unit tests: ≥ 80% coverage for services layer
- [ ] Integration tests: at least one happy-path test
- [ ] Edge cases tested (empty, null, invalid input)
- [ ] Tenant isolation tests added
- [ ] All tests passing locally

### Frontend (if applicable)
- [ ] Responsive: tested at 768px (tablet portrait) and 1280px (desktop)
- [ ] Touch targets ≥ 44×44px
- [ ] Keyboard navigation works without mouse
- [ ] No raw hex colors (use token names from design system)
- [ ] No emoji in navigation (use Material Symbols Outlined)

### Documentation
- [ ] README updated (if changing setup)
- [ ] API changes documented in OpenAPI spec
- [ ] Inline comments for non-obvious logic

### Sign-Off
- [ ] PR description includes one-line summary
- [ ] Linked to relevant task/spec
- [ ] @qa-agent approval: ✅ (or specific blockers noted)
- [ ] Ready for merge to main

---

## QA Stop Criteria — Escalate Immediately If

These issues block the merge. Stop and escalate:

- ❌ Any query returns data from a different `tenant_id` than the authenticated user
- ❌ A role lower than `clinic_admin` can access financial data (invoices, payments)
- ❌ An offline action overwrites server data without conflict detection
- ❌ Any PII (names, emails, phone, medical info) appears in application logs
- ❌ A feature works in development but fails in staging/production (missing env config)

**Escalation:** Create issue in Linear tagged `[SECURITY]` or `[CRITICAL]`; notify @qa-agent + @pm-agent.

---

## Test Checklist

Every PR must include tests for:

| Scenario | Type | Example Test |
|----------|------|--------------|
| Happy path | Unit | Valid input → correct output |
| Validation fail | Unit | Invalid input → AppError thrown |
| Authorization fail | Integration | User without role → 403 Forbidden |
| Tenant isolation | Integration | User from Clinic A cannot see Clinic B data |
| Edge case | Unit | Empty list, null value, boundary values |
| Offline-first | Integration | Action queued offline → synced when online |

---

## Related Documents

- [RBAC & Permissions](../skills/anemal-rbac-matrix/references/RBAC_index.md)
- [Coding Rules](../skills/anemal-coding-rules/references/00-index.md)
- [QA Protocols](../roadmap/qa-protocols.md) — detailed test procedures
