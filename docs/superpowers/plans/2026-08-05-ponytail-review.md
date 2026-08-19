# Ponytail Gate — `fix/codex-review-critical-high`

**Reviewer:** @ponytail-agent (independent simplicity gate, CLAUDE.md Step 5)
**Date:** 2026-08-05
**Branch:** `fix/codex-review-critical-high` (21 commits) vs `main`
**Inputs read:** branch diff only + `docs/superpowers/plans/2026-08-05-codex-review-ba-validation.md`
**Scope of this review:** the 7 simplicity criteria, applied **per finding**. Code quality,
style, test coverage, naming, and perf tuning belong to @qa-agent and are out of scope
except where noted explicitly as a hand-off.

---

## VERDICT: ✅ APPROVE — all 7 criteria pass on all 21 findings

No finding is rejected. Three minor cleanups (§4) and three hand-offs to other agents (§5)
are recorded but none of them gate execution.

---

## 1. Branch-level facts (measured, not estimated)

| Metric | Value | Gate threshold | Result |
|---|---|---|---|
| New dependencies | **0** (`package.json` / lockfile untouched) | >5 | ✅ |
| New endpoints / hooks / mutations | **0** (2 existing routes gained middleware) | >3 | ✅ |
| New source files | **2** (`json-depth.ts` 39 LOC, `queryClient.ts` 25 LOC) + 2 migration `.sql` | >15 | ✅ |
| Max files in any one finding | **9** (HI-02, R3-HI-04a) | >10 | ✅ |
| Max LOC added in any one finding | **164** (R3-HI-02) | >500/file | ✅ |
| Branch total | 64 files, +1231 / −418 | — | see note |

**Note on criterion 4 at branch scope.** The branch as a whole touches 64 files, which would
trip the ">10 files" line if read as a single unit. It is not one unit: it is 21
independently scoped, independently revertable commits, each mapping 1:1 to a named
finding, averaging 3 files and 78 lines. Criterion 4 exists to catch a *single change* doing
too much at once; that failure mode is absent here. Judged per finding, as instructed, every
commit is comfortably inside the threshold.

## 2. Per-finding verdicts

| # | Finding | Files | +/− | Verdict |
|---|---|---|---|---|
| 1 | CR-01 cross-tenant FK in write tx | 6 | +82/−24 | ✅ APPROVE |
| 2 | CR-02 receipt XSS + popup opener | 1 | +23/−6 | ✅ APPROVE |
| 3 | HI-01 branch-scope enforcement | 6 | +46/−17 | ✅ APPROVE |
| 4 | HI-02 bare-id → scoped `updateMany` | 9 | +48/−16 | ✅ APPROVE |
| 5 | HI-03 reject pending branch-select token | 1 | +8/−0 | ✅ APPROVE |
| 6 | HI-04 refresh-token rotation claim | 3 | +45/−17 | ✅ APPROVE |
| 7 | HI-05 RBAC matrix reconcile | 2 | +24/−5 | ✅ APPROVE (delivery gap → §5.1) |
| 8 | HI-06 one-role-per-user invariant | 5 | +88/−29 | ✅ APPROVE (migration is safe → §3.1) |
| 9 | HI-07 CRON_SECRET fail-closed | 3 | +17/−1 | ✅ APPROVE |
| 10 | HI-08 atomic payment + loyalty | 4 | +133/−84 | ✅ APPROVE (correctness → §5.2) |
| 11 | HI-09 clear query cache on identity change | 7 | +70/−16 | ✅ APPROVE |
| 12 | R2-HI-02 tenant-scope raw SQL joins | 3 | +13/−5 | ✅ APPROVE |
| 13 | R2-HI-03 rollback abort vs delete | 1 | +9/−2 | ✅ APPROVE |
| 14 | R2-HI-04 reminder flag + atomic claim | 3 | +56/−4 | ✅ APPROVE |
| 15 | R3-HI-01 appointment advisory lock | 2 | +39/−11 | ✅ APPROVE |
| 16 | R3-HI-02 atomic discharge + invoice | 5 | +164/−102 | ✅ APPROVE |
| 17 | R3-HI-03 blood bag / donor claims | 2 | +40/−13 | ✅ APPROVE |
| 18 | R3-HI-04a advisory-lock quota checks | 9 | +154/−58 | ✅ APPROVE (scope caveat → §3.3) |
| 19 | R3-HI-04b platform-customers `Tx` split | 2 | +36/−23 | ✅ APPROVE (→ §3.4) |
| 20 | R3-HI-06 iterative sanitizer + input caps | 4 | +120/−12 | ✅ APPROVE (→ §3.5) |
| 21 | R3-HI-07 upload rate limit | 3 | +45/−2 | ✅ APPROVE (→ §3.6) |

### What the branch does well, in gate terms

The dominant pattern is **one primitive reused everywhere** rather than a new abstraction per
finding: a conditional `updateMany` + `count !== 1` check as an atomic claim. It is
established in HI-04 (refresh-token rotation), then reused verbatim in HI-08 (invoice paid),
R2-HI-04 (reminder claim), R3-HI-02 (discharge claim), and R3-HI-03 (bag + donor claims) —
with the R2-HI-04 comment explicitly naming its ancestors. That is the opposite of criterion-2
duplication: it is convergence on an existing in-repo pattern.

Second: the `tx`-threading seen across HI-08, R3-HI-02, and R3-HI-04 is **forced, not chosen**.
Prisma has no nested-transaction support, so any repository function that previously owned its
own `prisma.$transaction` must accept an external client to participate in a caller's
transaction. Every instance keeps the change minimal — either a defaulted trailing parameter
(`client: Prisma.TransactionClient | typeof prisma = prisma`) or a `...Tx` split with the
non-`Tx` wrapper retained only where it still has callers.

Third: several commits show active restraint where machinery could have crept in —
R2-HI-04 leaves the historical data-correction `UPDATE` as a documented manual step instead of
auto-running it; R3-HI-01 names the GiST exclusion constraint as the durable fix and the
advisory lock as an accepted interim; R3-HI-07 states plainly that streaming uploads are out
of scope. Honest scope boundaries, written down.

## 3. Specific sanity-checks requested

### 3.1 HI-06 migration `20260805090000_enforce_one_role_per_user` — is the dedup safe?

**Yes. It never silently picks a wrong role.** The design is fail-closed by construction:

- **Pass 1 deletes only provably-redundant rows.** The `DELETE` is guarded by an `EXISTS`
  requiring that a `user_roles` row matching the user's canonical `users."roleId"` FK already
  exists. It removes the *other* rows and keeps that canonical one. It cannot invent a winner
  — if the canonical row is absent, nothing is deleted.
- **Anything ambiguous aborts the migration.** After pass 1, any user still holding >1 row
  triggers `RAISE EXCEPTION` with an actionable message pointing at
  `prisma/scripts/collapse-multi-role.ts`. Deployment fails loudly rather than mutating RBAC
  by guesswork. This is precisely the right call — the migration explicitly declines to decide
  business identity for a human.
- **`NULL` roleId is handled correctly by accident of SQL semantics.** If `users."roleId"` is
  NULL, `ur."roleId" <> u."roleId"` evaluates to NULL (never true), so no row is deleted and
  the user falls through to the abort guard. Fail-closed.

Two observations, neither a defect:

1. The ambiguity guard uses `GROUP BY "userId"` while the constraint it protects is on
   `(tenantId, userId)`. The guard is therefore **stricter** than the constraint: a user
   somehow holding rows in two different tenants would abort the migration even though it
   would not violate the unique index. Wrong direction is impossible — it can false-abort, never
   false-pass. Given users belong to exactly one tenant, this should never fire in practice.
2. Pass 1 duplicates the "survivor rule" already implemented in `collapse-multi-role.ts`. This
   is **not** criterion-2 duplication: a `.sql` migration cannot invoke a TypeScript script, and
   the migration deliberately delegates the hard case *back* to that script. The split is correct.

**Operational note for @db-agent:** because the guard raises, `prisma migrate deploy` will fail
mid-run against any environment with ambiguous users, and Prisma will mark the migration failed
and block subsequent migrations until resolved. That is the intended behaviour, but it needs to
be in the deployment runbook — run `collapse-multi-role.ts` first.

### 3.2 HI-05 — does it match BA Option C?

**On substance, exactly.** Option C called for three things and the commit delivers all three:

| Option C says | Commit does |
|---|---|
| Doctor `billing.view` — KEEP, rewrite prose | ✅ kept in seed + prose rewritten |
| Staff `reports.revenue.view` — KEEP, rewrite prose | ✅ kept in seed + prose rewritten |
| Staff `reports.cost.view` + `reports.export` — REMOVE | ✅ removed from `seed-rbac.ts` + grid |

The commit message also correctly surfaces the live-data consequence the BA flagged
(`seedRbac()` deletes system-role permissions absent from the seed, so re-seeding revokes these
grants from existing tenants) rather than presenting it as a pure code change.

**Delivery gap (not a Ponytail rejection — see §5.1).** BA §2.5 constraint 1 mandated *five*
artefacts change atomically. Two landed: `permission-matrix.md` and `seed-rbac.ts`. Missing:
`roleRouteMatrix.test.ts`, `rbac-regression.test.ts`, and the ADR required by constraint 4.
This is under-delivery, and the 7 criteria only catch over-delivery — so it does not gate
execution here, but it must not be lost.

### 3.3 R3-HI-04 — is the advisory-lock helper over-generalized?

**No.** The entire helper is eight lines:

```ts
export async function createWithQuotaLock<T>(
  tenantId: number, resource: QuotaResource, create: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const lockKey = `quota:${tenantId}:${resource}`
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`
    await QUOTA_ASSERTS[resource](tx, tenantId)
    return create(tx)
  })
}
```

One function plus a four-entry lookup table, serving five call sites. The alternative — four
near-identical lock helpers — would be strictly more code. It also uses **BA D1's own
first-preference remedy** (`pg_advisory_xact_lock(hashtext(...))`, chosen precisely because it
binds whether or not a `tenant_quotas` row exists), so it lands inside the validated design
rather than freelancing. Not over-generalized.

**Caveat worth recording (perf, → @db-agent, §5.3).** The lock is acquired *before* the quota
assert short-circuits on `null`. On the seeded default plans `maxOwners` and `maxPets` are
`null` (unlimited), so every owner and pet create now opens a transaction, takes a per-tenant
advisory lock, and runs a `tenant + plan + quota` join — to enforce a limit that is not
configured. BA D1 explicitly scoped this fix to branches and users, calling a lock on every pet
create "not proportionate."

I am approving anyway, and the reason matters for the gate: narrowing the fix would require a
pre-lock quota read plus a conditional branch, i.e. **more** code and a second code path, to
save a lock that only ever contends between two simultaneous creates of the same resource in
the same tenant. Ponytail rejects complexity; the deviation here runs toward less of it. Flagged
as a perf item, not a simplicity failure.

### 3.4 R3-HI-04b — is the `platform-customers.service.ts` `Tx` split over-engineered?

**No — it is the minimum possible change.** The constraint is hard: Prisma cannot nest
transactions, so a repository function that owns its own `prisma.$transaction` can never run
inside a caller's transaction. To put the quota check and the insert under one lock, that
wrapper *must* go. The commit does exactly and only that:

- renames `createTenantAdminUser` → `createTenantAdminUserTx`, taking `tx` as the first parameter
- deletes the internal `prisma.$transaction` wrapper (body otherwise unchanged)
- removes the now-redundant pre-check `assertCanAddUser` from the service
- wraps the single call site in `createWithQuotaLock(tenantId, 'users', ...)`

Two files, +36/−23. It did not even retain a backward-compatible non-`Tx` wrapper, which is the
correct call given there is one caller. Scope-appropriate.

### 3.5 R3-HI-06 — could the iterative sanitizer have used a library?

**No, and it shouldn't have.** The defect *is* unbounded native recursion in a function running
inside `res.on('finish')` — outside Express's error-handling chain, so a
`RangeError: Maximum call stack size exceeded` there is unrecoverable and recycles the process.
An explicit-stack rewrite is the fix, not an embellishment of it. The new `json-depth.ts` is
39 lines; pulling in a JSON-depth dependency to replace it would trip criterion 5 to save
39 lines of straightforward traversal. Correct trade.

One nit (§4.2): `MAX_DEPTH = 12` / `MAX_NODES = 2000` are declared as literals independently in
both `audit-sanitize.ts` and `json-depth.ts`, with a comment noting they mirror each other.
Drift is fail-safe in both directions, so this is cosmetic — but exporting them from one module
would remove the possibility entirely.

### 3.6 R3-HI-07 — hand-rolled rate limiter?

**No — and this is the cleanest criterion-3 outcome on the branch.** It reuses the
already-installed `express-rate-limit` dependency and appends to the existing
`rate-limit.middleware.ts` alongside `loginRateLimiter`. No new dependency, no new file, no new
route. The only judgement call is the per-identity `keyGenerator` (falling back to IP), which is
correctly justified: `authMiddleware` runs first on these routers so `req.context` is populated,
and per-IP would be wrong for shared-clinic-tablet deployments where staff share an egress IP.
Placed before `upload.single(...)` in the chain so multer never buffers for a rejected caller.

## 4. Minor cleanups (non-blocking)

**4.1 — Dead export left by R3-HI-04.** `createUserWithRole` at
`src/backend/models/user.repository.ts:65` now has **zero call sites** repo-wide; `user.service.ts`
moved to `createUserWithRoleTx` under `createWithQuotaLock`. Delete the six-line wrapper.
(Contrast `createInvoice` in `invoice.repository.ts`, whose non-`Tx` wrapper *is* still used —
that one stays.)

**4.2 — Duplicated bound constants.** Export `MAX_DEPTH` / `MAX_NODES` from
`src/backend/utils/audit-sanitize.ts` and import them in `src/backend/utils/json-depth.ts`
instead of redeclaring the literals.

**4.3 — Commit hygiene.** Commit `d34f8db` (HI-07) also added `REMINDER_DISPATCH_ENABLED` to
`.env.example`, which belongs to R2-HI-04 (`5428d8d`, a later commit). Zero functional impact;
noted only so the per-finding commit mapping stays honest for audit.

## 5. Hand-offs to other agents (outside the Ponytail gate)

**5.1 → @pm-agent / @qa-agent — HI-05 delivery gap.** BA §2.5 required five artefacts changed
atomically plus an ADR. Delivered: `permission-matrix.md`, `seed-rbac.ts`. Not delivered:
`src/backend/tests/integration/roleRouteMatrix.test.ts`,
`src/backend/tests/integration/rbac-regression.test.ts`, and an ADR under `docs/adr/` recording
the Option C ruling. BA §2.5 constraints 2 and 3 (pre-seed SQL diff, manual `seedRbac()` runbook
step) also remain open — the remediation is not complete at merge.

**5.2 → @qa-agent / @db-agent — HI-08 `redeem()` may not close its race.** The commit wraps
read-check-write in `prisma.$transaction` and the comment claims two concurrent redemptions
"cannot both pass the check against a stale balance." Under PostgreSQL READ COMMITTED (Prisma's
default) that does not hold: both transactions can read `loyaltyPoints = 100`, both pass
`points > owner.loyaltyPoints`, and both apply `decrement` — overdrawing the ledger. The
transaction buys atomicity, not isolation. **Minimal fix, consistent with the rest of the
branch:** make `applyRedeem`'s `updateMany` conditional —
`where: { id: ownerId, tenantId, loyaltyPoints: { gte: points } }` with a `count !== 1` throw.
That is the exact atomic-claim primitive already used in HI-04, HI-08's invoice claim, R2-HI-04,
R3-HI-02 and R3-HI-03, so it *reduces* inconsistency rather than adding anything. Raised here
because it bears directly on whether the added transaction complexity buys the defect closure it
claims; the correctness call itself is QA's.

**5.3 → @db-agent — R3-HI-04 lock breadth.** Per §3.3, owner and pet creates now serialize per
tenant and pay an extra join even when their quotas are unlimited (the seeded default). If
measurement shows this matters at clinic write rates, the narrow change is to resolve the quota
before entering the transaction and skip the lock entirely when the relevant limit is `null`.
Recommend measuring before changing anything — the current uniform code path is simpler.

**5.4 → @qa-agent — known-broken test shipping on the branch.** Commit `63ad449` states plainly
that `src/backend/tests/scripts/collapse-multi-role.test.ts` creates multiple `user_roles` rows
per user and asserts the old union behaviour of `resolvePermissions` — both now impossible under
the enforced invariant. It was left untouched because PostgreSQL was unavailable in that
environment. It must be retired or rewritten before this branch is considered green. Separately,
the branch adds **no regression tests** for 21 security findings (only `promptpay-qr.test.ts` was
touched, as a signature ripple) — BA Bucket 10 named tests as the gate for the whole pass. Test
coverage is explicitly outside the Ponytail gate; recording it so it reaches the agent who owns it.

---

## Gate statement

```
@dev-agent — Ponytail gate ✅ APPROVE — all 7 pass. Proceed to execute-plan.
```

1. Over-engineering? **No** — every fix is the minimal shape for its defect; `tx`-threading and
   the advisory locks are forced by Prisma/PostgreSQL semantics, not chosen for elegance.
2. Duplicate work? **No** — the branch converges five findings onto one existing atomic-claim
   primitive rather than inventing a mechanism per finding.
3. Existing solution? **No gap** — `express-rate-limit` reused for R3-HI-07; the `required()`
   config helper reused for HI-07; the 39-line traversal and 6-line HTML escape are correctly
   preferred over new dependencies.
4. Scope too large? **No** — max 9 files / 164 LOC in any single finding; 21 independently
   revertable commits mapped 1:1 to named findings.
5. Too many dependencies? **No** — zero added.
6. Too many files? **No** — 2 new source files (64 LOC combined) + 2 migration `.sql`.
7. Too many APIs? **No** — zero new endpoints; new exports are internal `...Tx` variants and one
   middleware constant.

Items in §4 and §5 are recorded for their owning agents and do not block `/execute-plan`.
Per `.claude/standards/doc-git-policy.md`, this file lives under `docs/superpowers/plans/` and is
local-only — do not `git add` it.
