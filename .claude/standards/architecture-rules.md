# Architecture Rules — Anemal

> **Owner:** `@arch-agent` · **Readers:** `@arch-agent`, `@dev-agent`, `@db-agent`, `@qa-agent`
> **Created:** 2026-09-09 · **Not** loaded by every agent — read it when you design or review structure.
> Canonical for: layer contract · abstraction choice · pattern whitelist · error taxonomy ·
> transaction boundary · state modelling · where a value lives (code vs data).

---

## 1. Layer contract

```
Route  →  Controller  →  Service  →  Repository  →  Prisma
                              ↘  other Services (same tenant context)
```

**Dependency direction is one-way.** Nothing below calls back upward.

| Layer | Owns | Must never contain |
|-------|------|--------------------|
| Route | path, middleware chain, `requirePlane` + `requirePermission` | logic |
| Controller | HTTP only: parse, validate transport shape, call one service, shape the envelope | business rules, Prisma |
| Service | business rules, orchestration, transaction boundary | HTTP objects (`req`/`res`), raw SQL |
| Repository | every Prisma call, `tenantId` as the first parameter | business rules, permission checks |

**Frontend:** presentational components hold no logic · logic lives in hooks · all server state through
TanStack Query · no fetch inside a component body.

**Deviation from this layering requires an ADR.** Not a comment, not a plan line — an ADR in `docs/adr/`.

---

## 2. Interface vs abstract vs concrete

| Choose | Only when |
|--------|-----------|
| **Interface** | a second implementation exists or is already committed to · an external system must be swappable |
| **Abstract class** | several classes share a real algorithm skeleton and differ only in named steps |
| **Concrete class** | everything else — this is the default |

A mock is not a second implementation. One implementation plus a test double → write the concrete class.

**Composition over inheritance.** Inheritance needs all four: a true subtype · safe substitution ·
stable shared behaviour · duplication genuinely removed without adding coupling.

---

## 3. Pattern whitelist

Allowed patterns, each usable only with a written justification:

```
Problem:      <the concrete problem in this codebase>
Why:          <why this pattern solves it>
Alternative:  <what else was considered>
Trade-off:    <what it costs>
```

Strategy · Factory · Abstract Factory · Template Method · Command · State · Adapter · Facade ·
Decorator · Observer/Event · Repository · Specification · Chain of Responsibility.

**Cannot fill all four lines → do not use the pattern.**

**Abuse signals (reject on sight):** an interface with one implementation · a layer that only forwards
calls · a factory around a plain constructor · a repository wrapping a repository · an event with no
second subscriber · "for future flexibility" with no named future · a pattern defended as best practice.

---

## 4. Error taxonomy

Every error is exactly one of these, and each maps to a fixed HTTP result in the
`{ success: false, error }` envelope:

| Class | Meaning | HTTP | Retryable |
|-------|---------|------|-----------|
| **Validation** | input violates a schema or a field rule | 400 | no |
| **Authentication** | no valid token / expired | 401 | no |
| **Authorization** | valid identity, permission denied | 403 | no |
| **Not found / cross-tenant** | absent, **or belongs to another tenant** | **404** | no |
| **Business conflict** | double-booking, quota exceeded, state transition not allowed, payment already claimed | 409 | no |
| **Integration** | a downstream system failed | 502 / 503 | **yes, with a bounded retry** |
| **Technical** | a bug — unexpected state | 500 | no |

**Rules:** a cross-tenant hit returns 404 and never confirms existence · never swallow an exception
without classifying it · never return a raw driver or Prisma error to the client · every retry has a
cap and an idempotency guarantee.

---

## 5. Transaction boundary

- The **service** opens the transaction. Never a controller, never a repository.
- One transaction covers one aggregate's consistency requirement. Spanning two unrelated aggregates
  is a design smell — split the operation or model a saga explicitly.
- **No external call inside a transaction** — no HTTP, no S3, no email, no queue publish. Do the
  external work before or after, and make the operation idempotent.
- Any operation that can be retried must state its idempotency key.
- Record in the arch doc: boundary · consistency requirement · rollback behaviour · idempotency · retry.

---

## 6. State modelling

If an entity has a real lifecycle, model it as an explicit status with declared transitions.

**Forbidden:** a spread of booleans (`isPaid`, `isCancelled`, `isCompleted`, `isApproved`) that
together encode a state machine — they permit impossible combinations and no one can enumerate the
legal states.

Document the legal transitions **and the illegal ones**, and enforce them in the service. Tests must
cover at least one rejected transition.

---

## 7. Where a value lives — code, or a table

The rule that keeps hardcoded constants out of the codebase.

| Kind of value | Lives in | Anemal example |
|---------------|----------|----------------|
| Differs per tenant | **tenant-scoped table** (mandatory) | VAT mode + rate → `TenantSettings` (ADR-0020) |
| Users add or edit rows | **lookup table + seed** | species, breed, payment method, appointment type |
| Bound to `switch`/`if` logic; changing it requires a deploy | **Prisma enum / TS union** | plane, role type |
| Platform sets it for a tenant | **platform-plane table** | plan, quota |

**Decision rule:** if changing the value requires **no** code change → it is data.
If changing it forces you to edit a `switch` or an `if` → it is an enum.

**Forbidden:** a magic number or string in code for any value in rows 1, 2, or 4. The precedent is
ADR-0020: `7` percent VAT was hardcoded in two places (`invoice.service.ts` and a `TAX_RATE` constant
in `ClinicBilling.tsx`) until clinics without VAT registration had no way to configure it — and the
client-suppliable `taxRate` field it left behind was a tampering vector.

**Also:** a tenant-configurable value is resolved **server-side**. Never trust a client-supplied copy.

---

## 8. Testability (architecture level)

Two rules that belong to structure, not to test authoring:

1. **Business logic must be testable with no DB, no network, no filesystem, no UI.** If a service can
   only be tested through HTTP or a real database, the boundary is in the wrong place — fix the design,
   do not write a heavier test.
2. **Every repository function needs an isolation test** — tenant B reaching a tenant A row returns 404.

Everything else about testing is already canonical elsewhere — do not restate it here:
`.claude/skills/anemal-coding-rules/references/03-testing-rules.md` (pyramid, targets, patterns) and
`.claude/roadmap/qa-protocols.md` (what runs at the end of every task).

---

## 9. Self-check before an arch doc ships

Simpler alternative that absorbs the expected change? · abstraction with no second implementation? ·
pattern with no named problem? · business logic in a controller/repository/hook? · core logic testable
without infrastructure? · which spot is the most expensive to maintain, and is that acceptable? ·
does anything weaken tenant isolation, plane separation, or deny-by-default?
