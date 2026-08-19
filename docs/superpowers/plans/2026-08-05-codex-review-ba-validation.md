# BA Validation — Codex Production-Readiness Review (CRITICAL + HIGH only)

| Field | Value |
|---|---|
| Doc ID | `BA-CODEX-2026-08-05` |
| Pipeline step | Step 3 — @ba-agent validate + design (gate before Step 3.5 `/grill-with-docs`) |
| Source under review | `D:\Development\Anemal\CodexCodeReview.md` (1402 lines, review date 2026-08-04) |
| Scope of this pass | 2 CRITICAL + 20 HIGH = **22 findings**. MEDIUM (25) and LOW (2) are **explicitly out of scope** — later phase. |
| Author | @ba-agent |
| Date | 2026-08-05 |
| Status | **CONDITIONAL SIGN-OFF** — 18 of 22 approved as-is; 4 require a human/product decision before `/write-plan`. |

---

## 0. Executive BA position

I **accept the review's overall verdict** (NOT PRODUCTION READY) and **accept the technical premise of all 22 CRITICAL/HIGH findings**. Every one maps to a business rule or project invariant that is genuinely violated. Nothing in this set is a false positive.

However, four things must be corrected before the fix list goes to `/write-plan`:

1. **HI-05 is mischaracterized.** The seed does **not** contradict the authoritative matrix — it matches the matrix *grid* line-for-line. The contradiction is **internal to `permission-matrix.md` itself** (§2 grid vs. §"Notes on key business decisions"). The fix therefore starts with a policy decision, not a code edit. Detail in §2.
2. **Four HIGH findings are not covered by the review's own 10-step remediation order** (R2-HI-01, R2-HI-03, R2-HI-04, R3-HI-05). They would silently fall out of the plan. Detail in §4.
3. **Two recommended fixes are non-functional or incomplete as written** (R3-HI-04's lock targets a column and row that do not exist; R2-HI-04 omits remediation of already-corrupted data). Detail in §5.
4. **`.claude/specs/RBAC_Platform_Restructure_Spec.md` does not exist.** `.claude/specs/` contains only `database-schema.sql`. CLAUDE.md and `.claude/agents/ba-agent/SKILL.md` both name this file as the authoritative spec (`SPEC-RBAC-PLATFORM-01`). Any "resolve the documentation conflict" remediation has **no spec home to write the decision into**. Detail in §6, risk R-04.

### Verification performed for this pass

| Check | Method | Result |
|---|---|---|
| HI-05 seed vs. matrix grid | Read `seed-rbac.ts:100-171` against `permission-matrix.md` §2, row by row | Seed matches grid **exactly**, all 3 system roles |
| HI-05 runtime impact | Read `invoice.routes.ts`, `report.routes.ts`, grep `App.tsx` guards | `billing.view` + `reports.revenue.view` enforced; `reports.cost.view` + `reports.export` **enforced nowhere** |
| R2-HI-04 reminders live in prod? | Read `server.ts`, `workers/reminder.worker.ts`, `vercel.json` | **Yes — two live triggers.** Confirmed. |
| R3-HI-04 quota fix feasibility | Read `schema.prisma:990-1002` (`TenantQuota`), `subscription.service.ts:70-146` | Recommended `FOR UPDATE` fix **cannot work** — see §5 D1 |
| HI-06 schema claim | Read `schema.prisma:927-941` (`UserRole`) | Confirmed: `@@id([userId, roleId])`, no `@unique` on `userId` |
| HI-07 fail-open claim | Read `routes/cron.routes.ts`, grep `.env.example` | Confirmed: template-literal compare; `CRON_SECRET` absent from `.env.example` |
| Spec file existence | `ls .claude/specs/` | Only `database-schema.sql` — RBAC spec **missing** |

---

## 1. Requirement understanding — all 22 CRITICAL/HIGH

For each finding: the **business/technical requirement actually being violated**. This is the BA confirmation the review asked for, not a restatement of the defect.

### Round 1 — Security & data integrity

| ID | Requirement violated | BA reading |
|---|---|---|
| **CR-01** | *Multi-tenancy (ABSOLUTE)*: every query includes `WHERE tenant_id`. Extended rule: a **foreign key is a query too** — accepting an unvalidated `petId` is the same class of failure as omitting `tenant_id`. | Correct and under-stated. This is the root cause that makes R2-HI-02 exploitable. The composite-FK half of the fix is the durable boundary; per-write validation alone leaves the invariant enforced only by developer discipline. **Confirmed.** |
| **HI-01** | *Server is the security boundary*: a branch-scoped token is an authorization fact, not a UI preference. `req.query.branchId` is attacker-controlled input. | Correct. The dangerous sub-case is repositories treating `undefined` branch as "tenant-wide" — that turns a missing argument into a privilege grant. Fail-open by omission violates deny-by-default. **Confirmed.** |
| **HI-02** | *Multi-tenancy*: scope must be on the **authoritative write**, not on a preceding read. A check/use gap is not isolation. | Correct. `updateMany({where:{id,tenantId,branchId}})` + `count !== 1` also fixes TOCTOU and makes repositories safe to reuse. **Confirmed.** |
| **HI-03** | *Deny-by-default* + token-audience separation. A pending branch-selection token is a **partial identity** and must not satisfy `requirePlane('clinic')`. | Correct, and the second-order impact is worse than the first: a missing `branchId` silently **removes** branch predicates, chaining into HI-01. **Confirmed.** |
| **HI-04** | Refresh-token rotation must be single-use. Replay detection is worthless if two descendants can be minted from one parent. | Correct. Conditional claim (`updateMany` on `rotatedAt: null`) is the right primitive. Must be applied to **both** clinic and platform flows — planes never share code but both need the invariant. **Confirmed.** |
| **HI-05** | The authoritative permission matrix must be internally consistent, and seed/routes/tests must derive from it. | **Requirement confirmed, characterization corrected — see §2.** |
| **HI-06** | ADR-0019: a user holds **exactly one** role. Effective permissions = that role's set, no union. | Correct. `schema.prisma:927` still carries the stale comment `// (CR-01 multi-role support)` and `@@id([userId, roleId])` permits N rows. Any duplicate row silently escalates. Deny-by-default cannot survive a union resolver. **Confirmed.** |
| **HI-07** | Authentication must **fail closed**. Missing config is a fatal startup condition, not a permissive default. | Correct and verified. `Bearer ${undefined}` → literal `"Bearer undefined"` matches. Confirmed `CRON_SECRET` is absent from `.env.example`, so a fresh deploy fails open by default. Cross-tenant reminder dispatch is reachable unauthenticated. **Confirmed.** |
| **CR-02** | Untrusted stored data must never become executable markup. The clinic JWT in `sessionStorage` is reachable via `window.opener`. | Correct. Same-origin `about:blank` retains opener access — this is full clinic session takeover from a stored invoice description. **Confirmed.** |
| **HI-08** | Financial operations must be atomic and idempotent. Money and loyalty points are a ledger, not a sequence of independent HTTP calls. | Correct, and the frontend **intentionally swallowing** redemption failures (`ClinicBilling.tsx:146`) is the more serious half — it converts a server error into silent financial loss. **Confirmed.** |
| **HI-09** | PII must not survive an identity transition. Shared-tablet clinic use makes this a realistic, not theoretical, exposure. | Correct. Two distinct defects: (a) cache not cleared at transition, (b) query keys not identity-scoped. Both must be fixed — (a) alone still leaks across branch switch within a session. **Confirmed.** |

### Round 2 — Architecture, migrations, performance

| ID | Requirement violated | BA reading |
|---|---|---|
| **R2-HI-01** | Defense in depth: the DB should be a backstop when the application layer is wrong. Canonical schema declares RLS; no executable migration creates it. | Requirement confirmed. **Sequencing challenged — see §5 D5.** The gap between "documented in `database-schema.sql`" and "executable in a migration" is itself a process defect worth its own control. |
| **R2-HI-02** | *Multi-tenancy (ABSOLUTE)* applied to raw SQL: **every** tenant-bearing table in a join needs its own predicate, not just the driving table. | Correct. Currently latent; becomes live data disclosure the moment CR-01 is exploited. Fixing CR-01 does not retire this — a malformed row may already exist. **Confirmed.** |
| **R2-HI-03** | A rollback restores a prior application version; it must never destroy business identities. | Correct and, in my view, **under-severed** — see §5 D6. `DELETE FROM "users" WHERE "role" = 'superadmin'` is unrecoverable and runs during the exact operation an operator reaches for under incident pressure. **Confirmed.** |
| **R2-HI-04** | A record may only be marked `sent` after a provider acknowledges delivery. State must reflect reality. | Correct, **and this is a product decision, not just a bug — see §3.** Verified live in production config. |

### Round 3 — Concurrency & resource exhaustion

| ID | Requirement violated | BA reading |
|---|---|---|
| **R3-HI-01** | A doctor cannot be in two places at once. Clinical scheduling is a real-world exclusivity constraint. | Correct. Application-level conflict counting cannot enforce exclusivity across replicas — the GiST exclusion constraint is the only durable answer. Advisory lock is an acceptable interim. **Confirmed.** |
| **R3-HI-02** | Discharge is one clinical-and-financial lifecycle event: patient state + invoice must commit together. | Correct. Two failure directions, both unacceptable: duplicate invoices (overcharge) and discharged-but-unbilled (revenue loss). `Invoice.hospitalizationId @unique` is the right invariant. **Confirmed.** |
| **R3-HI-03** | Donor safety intervals and single-consumption of a blood bag are patient-safety invariants, not business preferences. | Correct — **highest clinical-harm potential in the entire set.** One bag recorded as transfused to two patients is a traceability failure with real-world consequences. The unchecked volume case is a separate defect in the same function. **Confirmed.** |
| **R3-HI-04** | Contracted quota is a commercial boundary; `409 QUOTA_EXCEEDED` at create time is the stated policy (`anemal-platform-console` §Quota model). | Requirement confirmed against the skill: enforced at create time, existing over-limit tenants grandfathered. **Recommended fix is broken — see §5 D1. Product decision needed — see §3.** |
| **R3-HI-05** | Inventory traceability: expiry alerts, recalls, and FEFO dispensing require lot identity. | Requirement confirmed and clinically important. **Scope challenged — see §5 D4:** this is a new capability, not a defect repair. |
| **R3-HI-06** | The API process must not be terminable by authenticated input. Unbounded recursion outside Express error handling = remote process kill. | Correct. Sub-100KB payload → `RangeError` → process recycle. Made worse by running in `res.on('finish')`, where no error handler can catch it. Two independent fixes needed (bound the schema **and** bound the traversal). **Confirmed.** |
| **R3-HI-07** | Resource consumption must be bounded per identity. `memoryStorage()` buffers the whole file before any validation runs. | Correct. Note the ordering defect: memory is committed **before** MIME validation, so a rejected upload still costs full heap. **Confirmed.** |

---

## 2. HI-05 deep-dive — cross-check against the authoritative matrix and the live seed

> This is the finding the review flagged as requiring BA sign-off before any code change. **It does — but not for the reason stated.**

### 2.1 What the review claims

> "Doctor receives `billing.view`; Clinic Staff receives revenue, cost, and export permissions, while the authoritative prose says Doctor has no billing/POS access and financial reports are admin-only."
> Recommended fix: remove `billing.view` from doctor; remove `reports.revenue.view`, `reports.cost.view`, `reports.export` from clinic_staff.

### 2.2 What is actually true

I compared `src/backend/prisma/seed-rbac.ts:100-171` against `.claude/skills/anemal-rbac-matrix/references/permission-matrix.md` **row by row for all three system roles**.

**The seed matches the matrix grid exactly. Every row. There is no seed bug.**

The relevant grid rows in the authoritative file (§2, "Permission catalogue + default grid"):

| Code | matrix grid line | clinic_admin | doctor | clinic_staff | seed line | Match? |
|---|---|:---:|:---:|:---:|---|:---:|
| `billing.view` | `permission-matrix.md:54` | V | **V** | V | `seed-rbac.ts:142` (doctor) | ✅ |
| `reports.revenue.view` | `permission-matrix.md:66` | E | - | **V** | `seed-rbac.ts:166` (staff) | ✅ |
| `reports.cost.view` | `permission-matrix.md:68` | E | - | **V** | `seed-rbac.ts:166` (staff) | ✅ |
| `reports.export` | `permission-matrix.md:69` | E | - | **V** | `seed-rbac.ts:166` (staff) | ✅ |

The seed even documents its own provenance at `seed-rbac.ts:95`:
`//    Source: permission-matrix.md §2 (E = granted, V = granted, - = denied)`

**The contradiction is internal to `permission-matrix.md`.** The same file says, ~35 lines below its own grid, in §"Notes on key business decisions":

- `permission-matrix.md:91` — "**Doctor has no billing/POS access** — clinical only. Billing is Staff/Admin."
- `permission-matrix.md:94` — "**Only clinic_admin** ... sees revenue & cost reports, audit."

So: **grid says grant, prose says deny, seed follows grid.** The developer did the right thing; the source of truth is self-contradictory. Codex read the prose and assumed the grid agreed with it.

**BA consequence:** the remediation cannot begin with "update the seed." It must begin with a **policy ruling on which half of the authoritative document is correct**, because the seed is currently a faithful implementation of one of them.

### 2.3 Runtime impact — verified, and materially narrower than stated

Not all four disputed permissions are enforced. I grepped every route and frontend guard.

| Permission | Enforcement points | Real impact today |
|---|---|---|
| `billing.view` | **6 backend routes** (`invoice.routes.ts:11-17`: `/payment-history`, `/`, `/:id`, `/:id/pdf`, `/:id/promptpay-qr`) + **frontend route** `App.tsx:146` (`/transactions`) | **REAL.** Doctor can list invoices, read payment history, download invoice PDFs, generate PromptPay QR, and open the Transactions screen. |
| `reports.revenue.view` | **4 backend routes** (`report.routes.ts:10,11,13,14`: `/revenue`, `/top-services`, `/snapshot`, `/branch-revenue`) | **REAL.** Clinic Staff can read clinic revenue, top services, dashboard snapshot, and per-branch revenue. |
| `reports.cost.view` | **NONE.** Only occurrences repo-wide are `seed-rbac.ts:70` (catalogue) and `:121,:166` (grants). | **ZERO.** Dormant code, same status as the documented-reserved `clinic.settings.manage`. |
| `reports.export` | **NONE.** Same — `seed-rbac.ts:71,:121,:166` only. | **ZERO.** Dormant code. |

So HI-05 is really **two findings of different severity welded together**:

- **HI-05a (HIGH, real):** doctor→`billing.view`, staff→`reports.revenue.view`. Enforced, exploitable today, genuine policy exposure.
- **HI-05b (LOW/doc-only):** staff→`reports.cost.view`, `reports.export`. No route, no guard, no runtime effect. Documentation hygiene.

### 2.4 The decision the business must make

Two coherent options. **This is a product/clinical-workflow call, not a technical one — I cannot decide it unilaterally and neither can @dev-agent.**

```
Option A — Prose wins ("tighten to stated policy")
Change:  grid + seed lose doctor→billing.view and staff→reports.{revenue,cost,export}
Pros:    Matches the written business rationale; least-privilege; clean story
         for clinics ("doctors don't see money, staff don't see margins").
Cons:    ACCESS REGRESSION. Violates the project's "No access regression" rule —
         doctors and staff lose access they have in every seeded environment today.
         Doctor loses the ability to see whether a client has an unpaid balance
         before/after a consult, a genuine clinic workflow.
         Staff lose the revenue dashboard many front desks use for daily close.
Risks:   Live-tenant lockout on next `npm run db:seed`; support escalations.
Complexity: M (seed + grid + prose + roleRouteMatrix.test.ts + rbac-regression.test.ts)

Option B — Grid wins ("ratify current behaviour")
Change:  rewrite the two prose notes to match the grid; seed unchanged.
Pros:    Zero access regression; zero migration risk; no code change; the
         behaviour every existing tenant already relies on stays intact.
Cons:    Weakens least-privilege — doctor reads billing, staff reads revenue.
         Needs an explicit written rationale so it doesn't look like the doc was
         bent to fit the code.
Risks:   If a real customer contract or compliance claim promised "doctors cannot
         see billing", Option B breaches it. MUST be confirmed before choosing.
Complexity: L (documentation only)

Option C (BA RECOMMENDATION) — Split by evidence
- Doctor `billing.view`:            KEEP (Option B). Read-only invoice visibility is a
                                     legitimate consult-flow need; doctor already has no
                                     billing.create / billing.payment / billing.void, so no
                                     financial mutation is possible. Rewrite prose line 91 to
                                     "Doctor has read-only billing visibility; no POS, no
                                     payment, no void."
- Staff `reports.revenue.view`:     KEEP (Option B). Front-desk daily close is a real workflow;
                                     the grid deliberately marks it V (read) vs admin E.
                                     Rewrite prose line 94 to name revenue as admin-write /
                                     staff-read, and cost as admin-only.
- Staff `reports.cost.view`+`export`: REMOVE (Option A). Cost/margin is commercially sensitive,
                                     it is what prose line 94 most plausibly meant, and
                                     removing it costs nothing because NOTHING ENFORCES IT.
                                     Zero regression risk, real least-privilege gain.
Rationale: Every retained grant is justified by a workflow AND carries no mutation power.
           Every removed grant has zero users and zero enforcement — free to tighten.
Complexity: M. Regression exposure: near-zero.
```

### 2.5 Mandatory execution constraints for whichever option is chosen

These are non-negotiable regardless of the ruling — they follow from CLAUDE.md and `permission-matrix.md` §6:

1. **Change all five artefacts in one atomic change**, or the contradiction just moves: (a) `permission-matrix.md` §2 grid, (b) `permission-matrix.md` §"Notes" prose, (c) `seed-rbac.ts` `SYSTEM_ROLES`, (d) `src/backend/tests/integration/roleRouteMatrix.test.ts`, (e) `src/backend/tests/integration/rbac-regression.test.ts`.
2. **Run the pre-production diff first.** `permission-matrix.md:208-229` warns that `seedRbac()` **deletes** any `RolePermission` on a system role whose code is absent from the seed (`seed-rbac.ts:231-237`). Any permission granted manually outside the seed will be silently revoked. The documented SQL diff must run against the target DB **before** `npm run db:seed`.
3. **`seedRbac()` has no automatic trigger** (`permission-matrix.md:210-212`) — no Dockerfile, CI, or boot hook. An operator must run it manually. The remediation is therefore not complete when the PR merges; it needs a deployment runbook step.
4. **Write the ruling into an ADR.** With `RBAC_Platform_Restructure_Spec.md` missing (risk R-04), an ADR under `docs/adr/` is the only durable home for this decision.

---

## 3. Findings that are product/business decisions, not pure defects

The task asked me to flag these specifically. Four of the 22 qualify.

### 3.1 R2-HI-04 — Reminder dispatch — **CONFIRMED LIVE IN PRODUCTION**

The review asked me to confirm whether reminders are already live for real tenants. **They are.** Two independent triggers, both active in deployed config:

| Trigger | Evidence | Schedule |
|---|---|---|
| In-process worker | `src/backend/server.ts:4,8` → `startReminderWorker()`; `workers/reminder.worker.ts:19-20` fires `runOnce()` **on boot** then `setInterval` | Hourly, plus every cold start |
| Vercel Cron | `vercel.json` → `"crons": [{ "path": "/api/cron/reminders", "schedule": "0 9 * * *" }]` | Daily 09:00 |

Both call the same `dispatchDue()` (`services/reminder.service.ts:38-46`), which loads **every due reminder across all tenants** (`listAllDue()` — no tenant argument) and calls `markSent(r.id)` with **no provider call**. The source comments say so plainly: `reminder.service.ts:1` — "Actual LINE/SMS send is deferred (stub marks sent)"; line 42 — `// TODO(phase4+): integrate LINE Messaging API / Twilio SMS here before marking sent.` No provider client exists in the backend (grep for twilio/nodemailer/sendgrid/LINE returns only platform-provisioning config surfaces, no send path). `.env.example:13-15` declares `LINE_CHANNEL_TOKEN` / `SMS_API_KEY` as empty placeholders.

**Why this is a product decision, not a bug fix:**

- Clinic users currently see reminders transition to "sent". If dispatch is disabled, they stay `pending` and the queue grows unboundedly — a visible behaviour change requiring a UI/comms answer.
- **Every reminder already marked `sent` is corrupt data.** No pet owner received it. Codex's fix does not address this at all. Someone must decide: re-queue historical rows, mark them `failed`/`never_delivered`, or leave them.
- If any tenant was told reminders work, this is a customer-communication issue, not only an engineering one.
- HI-07 compounds it: because `CRON_SECRET` is undocumented and the route fails open, **an unauthenticated caller can trigger cross-tenant dispatch right now** and burn the whole pending queue to `sent`.

**BA recommendation:** treat as three separable decisions — (1) kill the write path immediately (this is urgent and non-optional), (2) decide the user-visible state semantics, (3) decide historical data remediation. See §5 D3.

### 3.2 R3-HI-04 — Subscription quota semantics

The policy is documented and unambiguous in `anemal-platform-console` §"Quota model": effective quota = `tenant_quotas` override else `plans`; **enforced at create time**; failure `409 QUOTA_EXCEEDED`; existing over-limit tenants **grandfathered** (enforce on new creates only).

So exceeding the limit under concurrency **is** a genuine policy violation, not a gray area. But two product questions are embedded and must be answered before an engineer picks a locking strategy:

- **Is a quota a hard ceiling or a billing trigger?** Grandfathering already proves the system tolerates over-limit *states*. If commercial policy is "over-limit is billed, not blocked," a strict serialization lock on every owner/pet create is an expensive answer to a cheap problem.
- **Which resources actually matter?** `maxOwners` and `maxPets` default to `null` (unlimited) on the seeded plans, and `getEffectiveQuota` falls back to `null` when unset (`subscription.service.ts:77-78`). The realistic exposure is **branches and users only** — the two that are commercially metered and low-cardinality. Scoping the fix to those two is proportionate; locking on every pet create is not.
- Note there is already a **documented exception** at `platform-customers.service.ts:294` (`// Q-5: subscriptionService.assertCanAddUser is intentionally NOT called`), which confirms quota enforcement is deliberately non-uniform. Whatever fix lands must not accidentally close that intentional gap.

### 3.3 R3-HI-05 — Inventory lot/expiry identity

Framed as a data-integrity defect; it is really a **missing product capability** (lot/batch tracking, FEFO dispensing, recall support). The current model — one aggregate `BranchInventory` row per branch/product with a single `lotNo`/`expiryDate` that each receipt overwrites — is not a coding mistake; it is a schema that never modelled lots. Delivering `InventoryLot` means a new model, a migration, repository rework, and UI. See §5 D4 for the scope split I recommend.

### 3.4 R2-HI-01 — RLS rollout

Not a product decision, but an **architecture-phase decision with release-risk implications**, and the review itself hedges: *"Do not deploy RLS until connection-pool behavior and the platform-plane bypass role have integration coverage."* Deploying transaction-local `set_config` under Prisma on serverless/pooled Postgres (Vercel per `vercel.json`) requires every tenant query to run inside an explicit transaction — an application-wide refactor. See §5 D5.

---

## 4. Prioritized, developer-ready fix list

Ordered per the review's **"Required remediation order" (1-10)**. Each finding carries its exact `file:line` from the review and **one testable acceptance criterion**.

> ⚠️ **Gap in the review's own ordering:** four HIGH findings — **R2-HI-01, R2-HI-03, R2-HI-04, R3-HI-05** — appear in no bucket of the 10-step order. If the plan is built from that order verbatim, they are silently dropped. They are placed below in bucket **U (Unmapped)** with a BA-assigned sequence.

### Bucket 1 — Block cross-tenant and cross-branch object references

| ID | Sev | File:line | Acceptance criterion (one line) |
|---|---|---|---|
| **CR-01** | CRITICAL | `services/invoice.service.ts:68`; also `models/invoice.repository.ts:67`, `services/hospitalization.service.ts:42`, `models/hospitalization.repository.ts:7`, `services/grooming.service.ts:29`, `models/grooming.repository.ts:7`, `services/reminder.service.ts:26`, `services/medical-record.service.ts:53`, `prisma/schema.prisma:332` | POSTing a Tenant-A `petId` with a Tenant-B token returns **404** and writes **no row**, for every tenant-scoped parent/child relation. |
| **HI-01** | HIGH | `controllers/grooming.controller.ts:11`; also `services/grooming.service.ts:43`, `models/grooming.repository.ts:40`, `models/prescription.repository.ts:19`, `services/promptpay-qr.service.ts:10`, `models/appointment.repository.ts:6`, `models/medical-record.repository.ts:9`, `models/invoice.repository.ts:117` | A Branch-B token supplying `?branchId=<A>` returns only Branch-B data; every repository read/write requires an explicit branch argument (no `undefined`-means-tenant-wide path remains). |
| **HI-02** | HIGH | `models/appointment.repository.ts:144`; also `models/auth.repository.ts:47`, `models/blood-bank.repository.ts:35`, `models/loyalty.repository.ts:24`, `models/reminder.repository.ts:43` | Every listed mutation is a scoped `updateMany` asserting `count === 1`; no `update({where:{id}})` on a tenant-scoped table remains (enforceable by lint/grep test). |
| **R2-HI-02** | HIGH | `models/product.repository.ts:149`; also `models/report.repository.ts:48`, `models/usage.repository.ts:66` | Every tenant-bearing table in each raw join carries its own `tenantId` predicate; a seeded malformed cross-tenant row is excluded from all three query results. |

### Bucket 2 — Remove stored XSS in receipt printing

| ID | Sev | File:line | Acceptance criterion |
|---|---|---|---|
| **CR-02** | CRITICAL | `frontend/src/views/clinic/ClinicBilling.tsx:687` (`printReceipt`) | An invoice whose description is `<img src=x onerror=...>` renders as literal text, executes no script, and the print window has `opener === null`. |

### Bucket 3 — Separate pending-login tokens from API access tokens

| ID | Sev | File:line | Acceptance criterion |
|---|---|---|---|
| **HI-03** | HIGH | `config/jwt.ts:53` (`signPendingToken`); also `middlewares/auth.middleware.ts:28`, `middlewares/permission.middleware.ts:40`, `models/medical-record.repository.ts:14`, `models/invoice.repository.ts:122` | A `scope:'branch_select'` token returns **401** on every clinic API; access and pending tokens carry different `audience` values and fail each other's verifier. |

### Bucket 4 — Make stateful operations atomic and idempotent

| ID | Sev | File:line | Acceptance criterion |
|---|---|---|---|
| **HI-04** | HIGH | `services/auth.service.ts:284` (`refreshClinicToken`); also `models/refresh-token.repository.ts:60`, `services/platform-auth.service.ts` | Two concurrent refreshes with one token yield exactly one 200 and one 401, on **both** clinic and platform flows. |
| **HI-08** | HIGH | `services/invoice.service.ts:150` (`recordPayment`); also `models/invoice.repository.ts:162`, `services/loyalty.service.ts:54`, `models/loyalty.repository.ts:28`, `frontend/.../ClinicBilling.tsx:146` | Two concurrent checkouts of one invoice produce exactly one payment row and one loyalty ledger entry; a failed redemption **surfaces an error** instead of silently granting the discount. |
| **R3-HI-01** | HIGH | `services/appointment.service.ts:65-83`; also `models/appointment.repository.ts:100-126`, `prisma/schema.prisma:359-381` | Two concurrent overlapping bookings for one doctor yield exactly one row; the loser receives **409**, enforced by a DB exclusion constraint (not application counting). |
| **R3-HI-02** | HIGH | `services/hospitalization.service.ts:56-102`; also `models/hospitalization.repository.ts:54-94` | Two concurrent discharges yield exactly one discharge and exactly one invoice; a forced invoice failure leaves the patient **still admitted** (`Invoice.hospitalizationId` is `@unique`). |
| **R3-HI-03** | HIGH | `services/blood-bank.service.ts:54-97`; also `models/blood-bank.repository.ts:31-68` | Two concurrent transfusions of one bag yield exactly one success and one 409; a transfusion requesting more volume than the bag holds is rejected; donor collection inside the safety interval cannot double-claim. |
| **R3-HI-04** | HIGH | `services/subscription.service.ts:88-146`; also `services/branch.service.ts:47-49`, `owner.service.ts:91-100`, `pet.service.ts:49-53`, `user.service.ts:182-229`, `platform-customers.service.ts:440` | For each enforced quota, two concurrent creates at `limit - 1` result in final usage **exactly equal to the limit**, with the loser receiving `409 QUOTA_EXCEEDED`. ⚠️ **Recommended fix is non-functional — see §5 D1.** |

### Bucket 5 — Correct RBAC seed/matrix contradictions and enforce one role per user

| ID | Sev | File:line | Acceptance criterion |
|---|---|---|---|
| **HI-05** | HIGH (split — see §2.3) | `prisma/seed-rbac.ts:132`; also `routes/invoice.routes.ts:11`, `routes/report.routes.ts:9`, `.claude/skills/anemal-rbac-matrix/references/permission-matrix.md` | `permission-matrix.md` §2 grid, its §Notes prose, `seed-rbac.ts`, `roleRouteMatrix.test.ts`, and `rbac-regression.test.ts` all assert the **same** grants for all 3 system roles, and a test fails if the grid and the seed diverge. 🚫 **BLOCKED on the §2.4 ruling.** |
| **HI-06** | HIGH | `prisma/schema.prisma:929` (`UserRole`); also `services/permission.service.ts:112` (`resolvePermissions`) | Inserting a second `user_roles` row for one user is rejected by a DB unique constraint, and `resolvePermissions` returns the permissions of `User.roleId` only (no union) — proven by a test that seeds a duplicate row and asserts no extra permission appears. |

### Bucket 6 — Clear identity-bound frontend caches at identity transitions

| ID | Sev | File:line | Acceptance criterion |
|---|---|---|---|
| **HI-09** | HIGH | `frontend/src/main.tsx:8`; also `hooks/useAuth.ts:136`, `utils/api.ts:30`, `utils/platformApi.ts:33`, `hooks/usePlatformCustomers.ts` | After logout, 401, or branch switch, the QueryClient contains zero cached entries, and every protected query key includes tenant + branch + user scope. |

### Bucket 7 — Stop persisting clinical/PII values in audit logs

*No CRITICAL/HIGH findings. Covered only by ME-01 (`utils/audit-sanitize.ts` / `middlewares/audit.middleware.ts`) — **out of scope for this pass.*** Flagged because R3-HI-06 touches the same files: whoever fixes R3-HI-06 should coordinate with the later ME-01 work to avoid two rewrites of `sanitize()`.

### Bucket 8 — Fail closed for cron auth; validate uploaded file bytes

| ID | Sev | File:line | Acceptance criterion |
|---|---|---|---|
| **HI-07** | HIGH | `routes/cron.routes.ts:9`; also `config/env.ts:13`, `.env.example` | With `CRON_SECRET` unset the process **refuses to start**; with it set, `Authorization: Bearer undefined` and any wrong value return **401**; `CRON_SECRET` is documented in `.env.example`. |

*(File-byte validation = ME-02, out of scope.)*

### Bucket 9 — Bound upload memory and nested JSON traversal

| ID | Sev | File:line | Acceptance criterion |
|---|---|---|---|
| **R3-HI-06** | HIGH | `utils/audit-sanitize.ts:18-24`; also `middlewares/audit.middleware.ts:22-27`, `services/branch.service.ts:9-16`, `services/medical-record.service.ts:5-18` | A 5,000-level nested payload to `operatingHours` or `anatomyAnnotation` returns a controlled **400** at validation, the process does not exit, and `sanitize()` is iterative with explicit depth/node caps. |
| **R3-HI-07** | HIGH | `routes/medical-record.routes.ts:14,22`; also `routes/pet.routes.ts:9,17`, `services/emr-attachment.constants.ts:25-26` | Under N concurrent max-size uploads, excess requests receive **429/503** and process heap stays under a fixed ceiling; per-identity rate + concurrency limits run **before** the body is buffered. |

### Bucket 10 — Regression tests (gate for the whole pass)

Cross-cutting; **must land with each fix, not after.** Minimum suites per the review: cross-tenant/branch isolation; pending-token rejection; single-successful-refresh; XSS escaping; the eight concurrency races (appointment, groomer capacity, invoice sequence, discharge, donor/bag, every enforced quota, role-assign vs delete, inventory lots); deep-payload rejection without process exit; bounded-memory uploads.

> **Gate condition:** the review is explicit that all backend integration tests were **BLOCKED** (no PostgreSQL at `localhost:5432`) and dependency scanning **NOT RUN**. No finding may be closed on code inspection alone — closure requires a green run against **real PostgreSQL using the non-owner application role**. @qa-agent must not accept a "TypeScript compiles" pass as evidence.

### Bucket U — Unmapped by the review's own remediation order (BA-assigned)

| ID | Sev | File:line | BA-assigned sequence | Acceptance criterion |
|---|---|---|---|---|
| **R2-HI-03** | HIGH | `prisma/migrations/20260610134121_phase1_5b_settings_api/down.sql:9` | **Before bucket 1** — it is a 10-line guard and it protects every subsequent migration attempt | Running that down migration with `superadmin` users present **aborts with an actionable error** and deletes zero rows. |
| **R2-HI-04** | HIGH | `services/reminder.service.ts:38`; also `models/reminder.repository.ts:33`, `workers/reminder.worker.ts:18`, `routes/cron.routes.ts`, `vercel.json` | **With bucket 8** (same attack surface as HI-07; both must ship together) | With no provider configured, `dispatchDue()` marks **zero** rows `sent`; once a provider exists, rows are claimed atomically in bounded batches and marked `sent` only after provider acknowledgement, with concurrent workers proving single delivery. 🚫 **Product decision required — see §3.1 / §5 D3.** |
| **R2-HI-01** | HIGH | `.claude/specs/database-schema.sql:521`; also `prisma/migrations/`, `config/db.ts` | **After bucket 1** — dedicated phase, own BA + grill cycle | RLS is enabled and forced on tenant tables, integration tests run as the **non-owner application role**, and a cross-tenant read returns zero rows with the application layer deliberately bypassed. ⚠️ **Sequencing challenged — see §5 D5.** |
| **R3-HI-05** | HIGH | `models/product.repository.ts:106-129` (`stockIn`); also `prisma/schema.prisma:467-484` | **Split** — guard now (with bucket 4), full lot model as a separate phase | *Now:* a receipt with a different `lotNo`/`expiryDate` never silently overwrites an existing lot identity. *Later phase:* receipts for lots A and B retain both expiries while aggregate quantity stays correct. ⚠️ **Scope challenged — see §5 D4.** |

---

## 5. Disagreements with the review

Six. Each states the disagreement, the evidence, and what I recommend instead.

### D1 — R3-HI-04: the recommended fix **cannot work as written** (severity agreed, fix rejected)

**Codex proposes:**
```sql
SELECT 1 FROM tenant_quotas
WHERE "tenantId" = ${tenantId} AND resource = ${resource}
FOR UPDATE
```

**Two independent defects:**

1. **`tenant_quotas` has no `resource` column.** `schema.prisma:990-1002` defines `TenantQuota { tenantId Int @id, maxBranches Int?, maxUsers Int?, maxOwners Int?, maxPets Int? ... }` — one row per tenant, resources as **columns**, not rows. The query does not compile against the real schema.
2. **The row is optional, and `FOR UPDATE` on zero rows locks nothing.** `getEffectiveQuota` (`subscription.service.ts:74-79`) resolves `tenant?.quota?.X ?? tenant?.plan?.X ?? FALLBACK`. A tenant with no override has **no `tenant_quotas` row at all** — the lock silently acquires nothing and both concurrent requests proceed. The fix would appear to work in a test with an override row seeded and fail exactly in the common production case.

**Recommended instead (any one, in preference order):**
- `pg_advisory_xact_lock(hashtext('quota:' || tenantId || ':' || resource))` — works whether or not the quota row exists; no schema change; transaction-scoped.
- Or `SELECT 1 FROM tenants WHERE id = ${tenantId} FOR UPDATE` — the tenant row always exists, so the lock is guaranteed to bind. Coarser (serializes all quota checks for a tenant), acceptable given low create rates.
- Or maintain an atomic usage counter with a DB check constraint.

**Also scope it:** per §3.2, `maxOwners`/`maxPets` are `null` (unlimited) on the seeded plans, so enforce-under-lock is only meaningful for **branches and users**. And the fix must not close the intentional exception at `platform-customers.service.ts:294`.

**Verdict: severity HIGH agreed; recommended fix REJECTED — must not reach `/write-plan` in its current form.**

### D2 — HI-05: mischaracterized, and severity should be split

Full evidence in §2. Summary of the disagreement:

- **"The seed contradicts the authoritative policy" is inaccurate.** The seed matches the authoritative **grid** exactly. The authoritative document contradicts **itself** (§2 grid vs §Notes prose). Presenting this to a developer as "fix the seed" invites them to edit `seed-rbac.ts` and leave the document still self-contradictory — reproducing the finding on the next audit.
- **Severity should split.** `reports.cost.view` and `reports.export` are granted but **enforced by nothing** — no route, no guard, no frontend reference anywhere in `src/` (verified by grep; only `seed-rbac.ts` mentions them). That half is **LOW / documentation-only**, not HIGH. Only `billing.view` (6 routes + 1 frontend route) and `reports.revenue.view` (4 routes) carry real exposure.
- **The proposed code diff would cause an access regression** that the project's own rule forbids ("Any authorization change must prove existing roles keep their current access before enforcement ships"). Codex's snippet strips grants without a migration/communication plan.

**Verdict: NEEDS-DECISION. Severity HIGH for HI-05a, LOW for HI-05b. Recommended fix incomplete — must include the document, the tests, and the seed-diff runbook.**

### D3 — R2-HI-04: "disable production dispatch" is necessary but **insufficient**

Codex's remediation stops at disabling dispatch. It omits the part that actually matters to a clinic.

- **Historical data is already wrong.** Every row currently marked `sent` represents a message no pet owner received. The worker has been firing on **every cold start** plus hourly plus daily-at-09:00. Disabling dispatch freezes the corruption in place; it does not name it. A decision is required: re-queue, mark `never_delivered`, or accept.
- **"Disable" needs a defined user-visible state.** Reminders silently staying `pending` forever is its own defect — the queue grows and clinic staff see a stuck list with no explanation.
- **Sequencing:** this must ship **with HI-07**, not separately. Right now the cron route fails open (`Bearer undefined` passes) *and* the dispatcher is destructive, so an unauthenticated caller can burn a tenant's entire pending queue to `sent` in one request. Fixing either alone leaves a live path.

**Verdict: severity HIGH agreed; fix INCOMPLETE. Three decisions needed (write-path kill / state semantics / historical remediation), and it must be bundled with HI-07.**

### D4 — R3-HI-05: correct finding, wrong delivery vehicle for this pass

The `InventoryLot` model Codex proposes is a **new capability**: new Prisma model, migration + backfill, `stockIn`/`stockOut` rework, FEFO dispensing logic, expiry-alert rework, and UI. That is comfortably over the Ponytail gate's scope criteria (>3 subsystems, migration + repository + service + UI) and would be rejected at Step 5 if bundled into a security-remediation plan.

**Recommended split:**
- **Now (HIGH, in-scope):** stop the silent identity loss — a receipt carrying a different `lotNo`/`expiryDate` must not overwrite the existing values. Reject with a clear error or preserve the existing lot. Small, safe, closes the data-corruption path.
- **Separate phase (own brainstorm → BA → grill → plan):** the full lot model, FEFO, and recall support. This is a product feature with clinical and regulatory framing and deserves its own requirements pass.

**Verdict: severity HIGH agreed for the corruption; scope of the recommended fix DISAGREED — split it.**

### D5 — R2-HI-01: HIGH agreed, but it must not be a same-pass blocker

The review's own caveat — *"Do not deploy RLS until connection-pool behavior and the platform-plane bypass role have integration coverage"* — is doing a lot of work. Concretely, on this stack:

- Deployment is Vercel serverless (`vercel.json`) with pooled Postgres. Transaction-local `set_config('app.current_tenant_id', ..., true)` requires **every tenant-scoped query to run inside an explicit transaction**. Prisma's default non-transactional queries would silently execute with no tenant context — under `FORCE ROW LEVEL SECURITY` that means **zero rows returned**, i.e. an application-wide outage, not a subtle bug.
- A separate non-owner application role and a narrowly-privileged platform-plane path both need provisioning, and the platform plane must bypass RLS without becoming a general bypass.

Attempting this **inside** the same remediation pass as 21 other findings, under production-readiness pressure, is how outages happen.

**Recommended instead:** keep HIGH, but sequence it as a **dedicated phase after bucket 1**, with its own brainstorm → BA → grill → plan cycle. Note that CR-01's composite-FK half (`@@unique([tenantId, id])` + tenant-qualified relations) delivers most of the same database-level backstop at a fraction of the operational risk — and it is already in bucket 1. RLS should be additive to that, not a prerequisite for shipping it.

**Verdict: severity HIGH agreed; SEQUENCING DISAGREED — must not gate the bucket-1..10 pass.**

### D6 — R2-HI-03: arguably under-severed, and mis-sequenced

Codex rates the rollback `DELETE FROM "users" WHERE "role" = 'superadmin'` as HIGH and leaves it unmapped in the remediation order. Two objections:

- **Impact is unrecoverable identity destruction** during the one operation an operator reaches for under incident pressure — a rollback. Cascading deletes take related data with it. By the review's own severity logic (CR-02 is CRITICAL for session theft), permanent unrecoverable data loss triggered by a routine operational action is at least comparable.
- **It is a ~10-line `DO $$ ... RAISE EXCEPTION` guard.** Cost is near zero, and it protects every migration rehearsal performed while fixing the other 21 findings.

**Recommended:** treat as **CRITICAL-adjacent and fix first**, ahead of bucket 1. It costs nothing and removes a catastrophic footgun from the exact workflow the remediation pass will exercise repeatedly.

**Verdict: DISAGREE-WITH-SEVERITY (raise) and DISAGREE-WITH-SEQUENCING (move to front).**

---

## 6. Risks, dependencies, assumptions

### Risk register

| ID | Risk | Impact | Likelihood | Mitigation | Owner |
|---|---|---|---|---|---|
| R-01 | HI-05 fix triggers live-tenant access regression | Doctors/staff locked out of screens they use daily | High if Option A chosen | Run the `permission-matrix.md:219-225` diff SQL before `db:seed`; pre-enforcement regression guard per matrix §4 | @ba-agent → @qa-agent |
| R-02 | `seedRbac()` **silently revokes** manually-granted permissions (`seed-rbac.ts:231-237`) | Unannounced permission loss in production | Medium | Mandatory pre-seed diff; runbook step, since `seedRbac()` has no automatic trigger | @pm-agent |
| R-03 | All backend integration tests **BLOCKED** during the review (no PostgreSQL) | Findings closed on inspection alone; regressions ship | High | No finding closes without a green run against real PostgreSQL using the non-owner app role | @qa-agent |
| R-04 | **`.claude/specs/RBAC_Platform_Restructure_Spec.md` does not exist** — `.claude/specs/` holds only `database-schema.sql`, yet CLAUDE.md and `.claude/agents/ba-agent/SKILL.md` both cite it as authoritative (`SPEC-RBAC-PLATFORM-01`) | Authorization decisions have no durable home; HI-05's ruling would be lost | **Confirmed present, not a risk — a live gap** | Record the HI-05 ruling as an ADR under `docs/adr/`; either restore the spec or amend CLAUDE.md to stop citing a missing file | @ba-agent + @pm-agent |
| R-05 | Bucket-1 composite-FK changes touch nearly every tenant-scoped relation | Very large blast radius; Ponytail scope gate likely REJECT if submitted as one plan | High | @pm-agent must split bucket 1 into per-module plans sized for the Ponytail gate | @pm-agent |
| R-06 | Fixing CR-01 does not clean **existing** malformed cross-tenant rows | R2-HI-02 stays exploitable on historical data after the code fix | Medium | Add a detection query + remediation step before adding composite constraints (they will fail to apply if violating rows exist) | @db-agent |
| R-07 | Dependency vulnerability scan **NOT RUN** (network denied) | Unknown third-party exposure | Unknown | Run `npm audit` in a networked environment before the production gate; package versions are **not** cleared | @qa-agent |
| R-08 | Reminder rows already marked `sent` are permanently wrong | Clinics believe owners were notified; missed vaccinations | **Already occurred** | Data remediation decision per §3.1 | Human/product |

### Dependencies (ordering constraints beyond the 10 buckets)

- **HI-03 → HI-01**: fixing the pending-token leak removes one source of missing `branchId`; the branch-scoping fix must still stand alone (do not treat HI-03 as closing HI-01).
- **CR-01 → R2-HI-02**: composite constraints cannot be added until existing malformed rows are found and cleaned (R-06).
- **HI-06 → HI-05**: collapse duplicate `user_roles` rows **before** changing seed grants, or a duplicate row will mask the new grant set during regression testing.
- **HI-07 ↔ R2-HI-04**: must ship together (§5 D3).
- **R2-HI-03 → everything**: the rollback guard should land first (§5 D6).
- **HI-05 → `roleRouteMatrix.test.ts` + `rbac-regression.test.ts`**: both exist and will fail on any grant change; they are part of the change, not follow-up.

### Assumptions (stated per BA method — challenge if wrong)

1. Codex's `file:line` references are accurate for the commit reviewed on 2026-08-04. I verified 8 of them directly (`seed-rbac.ts`, `invoice.routes.ts`, `report.routes.ts`, `cron.routes.ts`, `reminder.service.ts`, `reminder.worker.ts`, `schema.prisma` `UserRole`/`TenantQuota`, `subscription.service.ts`); all were correct within ±1 line. I did **not** re-verify the remainder.
2. No production tenant has yet been told that reminders are delivered. **If any has, §3.1 becomes a customer-communication issue and escalates.** — *needs human confirmation.*
3. `roleRouteMatrix.test.ts` and `rbac-regression.test.ts` currently encode the **grid** grants (matching the seed). If they encode the prose instead, they are already failing, and that changes the HI-05 remediation. — *@qa-agent to confirm once PostgreSQL is available.*
4. MEDIUM/LOW findings stay out of scope for this pass, per instruction — while noting the review's own position that several MEDIUMs *"should also block production."* That disagreement is deferred, not resolved.

---

## 7. BA SIGN-OFF — per finding

Legend: **APPROVED-AS-IS** = requirement, severity, and recommended fix all validated; proceed to `/grill-with-docs`. **NEEDS-DECISION** = blocked pending a stated human/product decision. **DISAGREE-WITH-SEVERITY** = finding valid, severity or sequencing contested.

| ID | Sev (review) | BA sign-off | Note |
|---|---|---|---|
| **CR-01** | CRITICAL | **APPROVED-AS-IS** | Root cause of the isolation class. Apply both halves (in-transaction validation **and** composite FKs). See R-06 for existing bad rows. |
| **CR-02** | CRITICAL | **APPROVED-AS-IS** | Full clinic session takeover. Prefer the React printable component over an escaped HTML template. |
| **HI-01** | HIGH | **APPROVED-AS-IS** | Eliminate the `undefined`-branch-means-tenant-wide path entirely; that is the fail-open half. |
| **HI-02** | HIGH | **APPROVED-AS-IS** | Add a lint/grep test so `update({where:{id}})` on tenant tables cannot reappear. |
| **HI-03** | HIGH | **APPROVED-AS-IS** | Distinct `audience` per token type; validate the full payload before attaching to request context. |
| **HI-04** | HIGH | **APPROVED-AS-IS** | Must be applied to clinic **and** platform refresh flows — the review is right to call this out twice. |
| **HI-05** | HIGH | **NEEDS-DECISION** | **Decision required:** which half of `permission-matrix.md` is authoritative — §2 grid (current seed behaviour) or §Notes prose (lines 91, 94)? BA recommends **Option C** (§2.4): keep doctor `billing.view` and staff `reports.revenue.view` (both justified by workflow, neither grants mutation); remove staff `reports.cost.view` + `reports.export` (zero enforcement, zero regression risk). Also **DISAGREE-WITH-SEVERITY** on the split: HI-05a HIGH, HI-05b LOW. Cannot proceed to `/write-plan` without a ruling. Record as an ADR (R-04). |
| **HI-06** | HIGH | **APPROVED-AS-IS** | Collapse duplicates → add unique constraint → resolve from `User.roleId`, in that order. Also fix the stale `schema.prisma:927` comment that still advertises multi-role. |
| **HI-07** | HIGH | **APPROVED-AS-IS** | Verified fail-open. Must ship **with R2-HI-04** (§5 D3) — together they allow unauthenticated destruction of a tenant's reminder queue. |
| **HI-08** | HIGH | **APPROVED-AS-IS** | The swallowed frontend redemption failure (`ClinicBilling.tsx:146`) is the highest-value part; do not let it get lost behind the transaction work. |
| **HI-09** | HIGH | **APPROVED-AS-IS** | Both halves required: clear at transition **and** identity-scope the keys. Shared-tablet use makes this a real-world exposure. |
| **R2-HI-01** | HIGH | **DISAGREE-WITH-SEVERITY** *(sequencing)* | Severity HIGH agreed. **Must not gate this pass** — RLS under Prisma + pooled serverless Postgres is an application-wide refactor with outage risk (§5 D5). Dedicated phase after bucket 1, own BA + grill cycle. CR-01's composite FKs deliver most of the backstop first. |
| **R2-HI-02** | HIGH | **APPROVED-AS-IS** | Independent of CR-01 — existing malformed rows keep it live even after CR-01 lands. |
| **R2-HI-03** | HIGH | **DISAGREE-WITH-SEVERITY** *(raise)* | Unrecoverable identity destruction during rollback, fixed by a ~10-line guard. Treat as CRITICAL-adjacent and land **first**, ahead of bucket 1 (§5 D6). Unmapped in the review's own order. |
| **R2-HI-04** | HIGH | **NEEDS-DECISION** | **Confirmed live in production** — `server.ts:8` (hourly + on every boot) and `vercel.json` cron (daily 09:00), both marking rows `sent` with no provider. **Three decisions required:** (1) kill the write path — urgent, non-optional; (2) user-visible state semantics once dispatch is off; (3) remediation of rows already wrongly marked `sent`. Codex's fix covers only (1) (§5 D3). Bundle with HI-07. Unmapped in the review's own order. |
| **R3-HI-01** | HIGH | **APPROVED-AS-IS** | GiST exclusion constraint is the durable fix; advisory lock acceptable as an interim only. |
| **R3-HI-02** | HIGH | **APPROVED-AS-IS** | `Invoice.hospitalizationId @unique` is the invariant that makes the fix durable — do not ship the transaction without it. |
| **R3-HI-03** | HIGH | **APPROVED-AS-IS** | Highest clinical-harm potential in the set. Three sub-defects (donor race, bag race, unchecked volume) — all three need coverage. |
| **R3-HI-04** | HIGH | **NEEDS-DECISION** + **DISAGREE-WITH-FIX** | Severity HIGH agreed. **Recommended fix is non-functional**: `tenant_quotas` has no `resource` column and the row is optional, so `FOR UPDATE` locks nothing in the common case (§5 D1). Use `pg_advisory_xact_lock` or lock the always-present `tenants` row. **Decision required:** is quota a hard ceiling or a billing trigger, and is enforcement scoped to branches+users only (owners/pets are `null`/unlimited on seeded plans)? Must not reach `/write-plan` as written. |
| **R3-HI-05** | HIGH | **DISAGREE-WITH-SEVERITY** *(scope)* | Data-corruption half is HIGH and in scope: stop silently overwriting `lotNo`/`expiryDate`. The proposed `InventoryLot` model is a **new product capability** (FEFO, recall) and would fail the Ponytail scope gate inside a security pass — split to its own phase (§5 D4). Unmapped in the review's own order. |
| **R3-HI-06** | HIGH | **APPROVED-AS-IS** | Two independent fixes required: bound the Zod schemas (`z.any()` / `z.record(z.unknown())`) **and** make `sanitize()` iterative. Coordinate with the later ME-01 work — same files. |
| **R3-HI-07** | HIGH | **APPROVED-AS-IS** | Limits must run **before** the body is buffered; today memory is committed before MIME validation. |

**Totals: 18 APPROVED-AS-IS · 3 NEEDS-DECISION (HI-05, R2-HI-04, R3-HI-04) · 4 DISAGREE-WITH-SEVERITY/SCOPE/SEQUENCING (R2-HI-01, R2-HI-03, R3-HI-04, R3-HI-05)** — R3-HI-04 carries both a decision block and a fix rejection.

---

## 8. Definition of Ready — gate status

| Criterion | Status |
|---|---|
| Objective stated | ✅ Close all CRITICAL/HIGH findings blocking production sign-off |
| Actors & roles named | ✅ clinic_admin / doctor / clinic_staff / platform roles; permission codes cited |
| Permission codes assigned | ⚠️ **Blocked on HI-05 ruling** (§2.4) |
| Business rules listed | ✅ §1 |
| Exceptions covered | ✅ §3 (product decisions), §5 (disagreements) |
| NFR impact noted | ✅ Concurrency, memory bounds, availability (R3-HI-06/07); RLS performance & pooling (R2-HI-01) |
| Acceptance criteria testable by @qa-agent | ✅ One per finding, §4 |
| Risks & dependencies recorded | ✅ §6 |

**Ready for Step 3.5 (`/grill-with-docs`)?** — **YES for the 18 APPROVED-AS-IS findings.**
**NO for HI-05, R2-HI-04, R3-HI-04** until the three decisions in §7 are answered by a human. Per CLAUDE.md, `/write-plan` is blocked until `/grill-with-docs` runs **and all findings are resolved** — so the three decisions must be closed inside the grill, not deferred past it.

### Exact next action

1. **Human decides** the three NEEDS-DECISION items: HI-05 policy ruling (§2.4 — BA recommends Option C), R2-HI-04 reminder semantics + historical data (§3.1), R3-HI-04 quota semantics + scope (§3.2).
2. Run **Step 3.5 `/grill-with-docs`** against this document. Grill priorities: the three decisions above; D1's replacement locking strategy; D5's RLS sequencing; R-05's plan-splitting to survive the Ponytail gate.
3. Record the HI-05 ruling as an **ADR under `docs/adr/`** (R-04 — the cited spec file does not exist).
4. Hand to **@pm-agent** for Step 4 `/write-plan`, split per R-05 into Ponytail-sized plans.
