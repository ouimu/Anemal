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
- [ ] **Acceptance criteria in Gherkin** — tagged Scenarios incl. `@authz` / `@tenant` / `@validation` (see format below); @qa-agent can verify each one
- [ ] **Dependencies & risks recorded** — blockers, external dependencies, risks identified

**Sign-off:** @ba-agent confirms ready → hand to @pm-agent for task breakdown

---

## Acceptance Criteria Format — Gherkin (MANDATORY)

Every acceptance criterion is written in **Gherkin** (`Feature` / `Scenario` / `Given` / `When` /
`Then`). One format that clinic owner, @ba-agent, @pm-agent, @dev-agent and @qa-agent all read the same
way — and each Scenario maps one-to-one to an automated test. Free-text checkbox AC
(`- [ ] system allows X`) is **not** accepted at Step 2/3 and fails the Definition of Ready.

### Rules

1. **Keywords in English, step text in business language.** `Feature`, `Scenario`, `Scenario Outline`,
   `Examples`, `Background`, `Given`, `When`, `Then`, `And`, `But` stay English so tooling can parse
   them. Step text may be Thai or English — write it so clinic staff understand it. Role keys
   (`doctor`, `clinic_staff` …), permission codes (`emr.edit`) and HTTP codes stay verbatim.
2. **Describe behaviour, not UI clicks.** `When the doctor saves a new diagnosis` — not
   `When the doctor clicks the blue "Edit" button at top-right`. Screen detail belongs in
   `anemal-screen-specs`, not in AC.
3. **One behaviour per Scenario, exactly one `When`.** Several outcomes → `Then … And …`.
   Two actions → two Scenarios.
4. **`Given` = state, `When` = one event, `Then` = observable outcome** (response code, what is shown or
   hidden, what is persisted, what is audited). No `Then` like "works correctly" — it must be
   checkable.
5. **Tag every Scenario** with a stable ID `@AC-<task>-<n>` (e.g. `@AC-EMR-3-2`). Add `@authz`,
   `@tenant`, `@validation`, `@edge` where they apply.
6. **Role/permission matrices use `Scenario Outline` + `Examples`** — one table row per role, instead
   of copying the Scenario.
7. **`Background`** only for preconditions shared by every Scenario in the Feature (e.g. tenant + login).

### Required Scenarios per protected feature

| Tag | Scenario | Expected |
|-----|----------|----------|
| — | Happy path for the permitted role | action succeeds, outcome observable |
| `@authz` | Role **without** the permission | `403` and the control is hidden |
| `@tenant` | User of tenant B targets tenant A's resource | `404` — never confirms existence |
| `@validation` | Invalid / missing input | `400` with the error envelope, nothing persisted |

Add `@edge` Scenarios for exception cases listed at Definition of Ready (empty, boundary, concurrent,
offline, quota `409`).

### Template

```gherkin
@<TASK-ID>
Feature: <capability in business words>
  As a <role key>
  I want <capability>
  So that <business value>

  Background:
    Given a clinic tenant "<Clinic A>" exists
    And I am signed in to "<Clinic A>" as "<role key>"

  @AC-<TASK-ID>-1
  Scenario: <happy path in one line>
    Given <state>
    When <one event>
    Then <observable outcome>
    And <second observable outcome>

  @AC-<TASK-ID>-2 @authz
  Scenario Outline: Only roles holding <permission.code> may <action>
    Given I am signed in as "<role>"
    When I <action>
    Then the response is <status>

    Examples:
      | role         | status |
      | doctor       | 200    |
      | clinic_staff | 403    |

  @AC-<TASK-ID>-3 @tenant
  Scenario: Another clinic's record cannot be reached
    Given a record belongs to tenant "Clinic B"
    When I request that record
    Then the response is 404
```

### Example

```gherkin
@EMR-3
Feature: แก้ไขผลวินิจฉัยในเวชระเบียน
  As a doctor
  I want to correct a diagnosis on a past medical record
  So that the patient's record stays accurate

  Background:
    Given คลินิก "Clinic A" มีเวชระเบียนของสัตว์ชื่อ "Mochi"
    And ผู้ใช้ล็อกอินเข้า "Clinic A"

  @AC-EMR-3-1
  Scenario: หมอแก้ผลวินิจฉัยแล้วบันทึกสำเร็จ
    Given ผู้ใช้ล็อกอินเป็น "doctor"
    When หมอบันทึกผลวินิจฉัยใหม่ "Otitis externa" ให้เวชระเบียนของ "Mochi"
    Then เวชระเบียนแสดงผลวินิจฉัย "Otitis externa"
    And audit log บันทึกว่าใคร แก้อะไร เมื่อไร

  @AC-EMR-3-2 @authz
  Scenario Outline: เฉพาะ role ที่มี emr.edit แก้ผลวินิจฉัยได้
    Given ผู้ใช้ล็อกอินเป็น "<role>"
    When ผู้ใช้บันทึกผลวินิจฉัยใหม่ให้เวชระเบียนของ "Mochi"
    Then ได้ response <status>
    And ปุ่มแก้ไข <button>

    Examples:
      | role         | status | button |
      | doctor       | 200    | แสดง   |
      | clinic_staff | 403    | ถูกซ่อน |

  @AC-EMR-3-3 @tenant
  Scenario: หมอของคลินิกอื่นเข้าถึงเวชระเบียนนี้ไม่ได้
    Given ผู้ใช้ล็อกอินเป็น "doctor" ของ "Clinic B"
    When ผู้ใช้ขอเวชระเบียนของ "Mochi"
    Then ได้ response 404

  @AC-EMR-3-4 @validation
  Scenario: ผลวินิจฉัยว่างถูกปฏิเสธ
    Given ผู้ใช้ล็อกอินเป็น "doctor"
    When หมอบันทึกผลวินิจฉัยว่างให้เวชระเบียนของ "Mochi"
    Then ได้ response 400 พร้อม error envelope
    And ผลวินิจฉัยเดิมไม่ถูกเปลี่ยน
```

### From Scenario to test

- @qa-agent writes **at least one automated test per Scenario** (one per `Examples` row for an
  Outline) and puts the tag in the test name, e.g.
  `it('@AC-EMR-3-2 clinic_staff gets 403 on diagnosis edit', …)`.
- The Step 7 sign-off lists every `@AC-…` tag with pass/fail. A tag with no test = not done.
- The Gherkin block is the spec; tests run on the existing Jest/Vitest suites. A Cucumber runner is
  **not** required — add one only through Lane A if the team decides to execute `.feature` files.

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
- [ ] Every Gherkin `@AC-…` tag has a passing test named after it
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
