# HANDOFF — Cross-Tenant Relation Isolation (Lane A)

**Status as of 2026-09-11:** Step 3.4b (`@ponytail-agent` arch-precheck) returned **BLOCK**.
Back at Step 3.4 for rework — arch design is NOT complete.

## Next action — literally this

```
@arch-agent   Step 3.4 REWORK (not a fresh design — fix these 5 items only)
input:  the BLOCK report below + docs/superpowers/plans/2026-09-11-cross-tenant-relation-isolation-arch.md
```

**BLOCK reason (criterion #1 — over-engineering: analyzer contract contradicts the code it must read):**
The conformance-test analyzer (arch doc §6.2/§6.4) defines "guarded" only over a literal `where`/
`include` on the Prisma call itself. Three shapes it cannot resolve already exist live in 17 of 35
model files — `where`/`include` behind a call expression (`pet`, `owner`, `invoice`, `audit`,
`product`), behind an identifier (`pet.listInclude`, platform-customers ×6), and conditional spreads
(57 occurrences / 17 files). Worse: **R-4 mandates the exact call-expression shape the analyzer can't
resolve**, landing directly on the flagship T1 cases (`pet.findPets`, `pet.findPetById`) — the files
holding the PII defect the mechanism exists to catch would be exempt from it.

**5 required fixes (arch owns all 5, do not exceed this list):**
1. State the analyzer's resolution model explicitly for all 4 shapes (same-module call expr,
   same-module identifier, cross-module identifier, conditional spread) — resolved or fail-closed,
   per shape. Re-cost the "~200 lines" estimate against this.
2. Pick and state one of: (i) narrow the analyzer + explicitly exempt builder-based repos, (ii) specify
   resolution (then re-argue §3.3's helper rejection — same machinery would read `relGuard()`), or
   (iii) mandate literal `where`/`include` at guarded sites + say which builders get inlined.
3. Narrow R-4 to the checkable property actually needed: *`findX`/`countX` each carry the tenant
   predicate* — not a shared `where` expression (that's the construct breaking resolution).
4. Rule explicitly whether an unresolvable `select` value fails closed (affects §4.2's
   `ownerSummarySelect`/`petSummarySelect` cross-module consts at 5 T1 sites).
5. Mark the `scripts/tenant-integrity-scan.ts` build as conditional on BA accepting the AC-4 reword
   (§7), not decided — its only other customer is ADR-0028's deferred precondition.

**Explicitly NOT objected to — do not touch in rework:** the core rule (one rule, three spellings),
post-filter retirement, zero new dependencies, refusal to build a `relGuard()` helper, the 20-file
scope (defect width, not scope creep). Ponytail said it only needs to re-review §5/§6.2/§6.4 and the
ADR-0027 enforcement paragraph — not the whole doc.

After rework: re-run `@ponytail-agent` arch-precheck. Then, in order: `/grill-with-docs` (Step 3.5,
human + `@ba-agent`, MANDATORY) → `@pm-agent` `/write-plan` (Step 4) → `@scribe-agent` reference
pre-check (4b) → `@ponytail-agent` mode `gate` (Step 5) → `/superpowers:execute-plan` (Step 6).

## What this is

Lane A follow-up to the 2026-09-10 Lane C hotfix (PR #73, merged), which fixed a cross-tenant PII leak
in `findDueSoon`. Root cause is structural: **no FK in the schema references `tenantId`**, so the
database permits a child row in tenant A pointing at a parent row in tenant B, and any query that
follows that relation returns the other tenant's data. QA proved it leaks in **both** directions.

## Documents produced, in reading order

1. `docs/superpowers/plans/2026-09-10-cross-tenant-relation-isolation-ba-signoff.md` — BA sign-off
   (**corrected 2026-09-11** in §4.3 / §9 E-2 / new §17; read the corrected version).
2. `docs/superpowers/plans/2026-09-11-cross-tenant-relation-isolation-arch.md` — **arch brief
   (Step 3.4)**. Start at §0; it is written to be read first.
3. `docs/adr/0027-tenant-scoped-relation-traversal-carries-its-own-predicate.md` — the rule.
4. `docs/adr/0028-composite-tenant-foreign-keys-deferred.md` — the Option A ruling (answers B-4 from
   2026-08-27 for the third and final time).
5. `src/backend/tests/integration/crossTenantFkWritePathRepro.test.ts` — QA's C-1 reproduction
   (verdict MISS) and the `SIDE-FINDING` test that disproved the "reverse includes are safe" premise.

## Architecture decision in three lines

**Option D as BA defined it: Option C built now, Option A ruled on and deferred, Option B (RLS) out.**
One rule — *a tenant-scoped relation is only followed, or written, with a tenant predicate attached at
the point of traversal* — in three dialects (Prisma to-one via the root `where`, Prisma to-many via the
nested `where`, raw SQL via the `ON` clause). Enforced by a conformance test in the backend Jest suite,
because the repository has **no CI** and `npm run lint` is gated by nothing, while the test suite is
gated three times. Zero new abstractions; the post-filter pattern from PR #73 is **deleted**.

## Gate conditions — where each one stands

| Condition | Owner | Status |
|---|---|---|
| C-1 write-path reproduction | @qa-agent | ✅ MISS (2026-09-11), 38 probes, 0 HIT |
| C-7 human scope approval | human | ✅ approved (2026-09-11) |
| C-3 Option A preconditions (a)(b)(c)(d) | @arch-agent | ✅ answered — arch §A.3, ADR-0028 |
| C-4 E-7 pagination consistency | @arch-agent | ✅ resolved by construction — arch §5 |
| C-5 XTI-7 enforcement named + shown failing | @arch-agent | ✅ answered — arch §6, fixtures §6.3 |
| C-6 integrity-signal RBAC exposure | @arch-agent → @ba-agent | ✅ log/operator-script only, **no permission code**. One AC-4 rewording returned to @ba-agent — arch §7 |
| C-2 false comment + roadmap record | @dev-agent + @scribe-agent | ⏳ scheduled into W0 of the plan |
| Step 3.5 `/grill-with-docs` | human + @ba-agent | ⏳ **not yet run — MANDATORY, cannot be skipped** |

## Things the next agent must not get wrong

- **Scope is 20 model files, not 11.** BA's audit was forward-only; reverse includes add the rest
  (57 `include:` occurrences + 19 raw-SQL `JOIN`s across 7 files — some already guarded, some
  targeting models with no tenant). The *mechanism* does not grow — it covers both directions in one
  pass — but @pm-agent must plan against 20, and should size W1 from **W0's printed defect list**
  rather than from that estimate.
- **Lead with "one rule, N sites", not "N fixes."** Arch §0 exists for the ponytail gate; do not
  re-frame it as a file-by-file sweep (BA Risk #1).
- **W0 is serial.** The conformance test defines what "guarded" means. Four workers guessing at the
  spelling before the checker exists is how eleven inconsistent guards were written the first time.
- **Do not reintroduce the post-filter.** It breaks `take`/`count` and is being deleted, not extended.
- **Do not design around RLS** (BA §8 Option B is closed) and do not narrow T3/T4 (BA §5 ruled the
  invariant uniform).
- Searches must exclude `.claude/worktrees/` and `*/archive/*` — stale copies (BA Risk #8).

## Open items that leave this pipeline

- **Escalation for the human at Step 3.5:** if `db:integrity-scan` finds cross-tenant rows in
  production, who reassigns them, and is that inside this change? Arch's position: **outside** — it is
  per-row clinical judgement (arch §A.3a).
- **Back to @ba-agent:** AC-4 needs rewording from "a signal is emitted when the read executes" to an
  assertion about `npm run db:integrity-scan` (arch §7). Nothing else returns to BA.
- **New backlog:** B-6 (five repositories open their own transaction, deviating from
  `architecture-rules.md` §5 — Lane D + ADR) · B-7 (R3-F1 promoted to a precondition of Option A).
  BA's B-5 (no response-shaping layer) is acknowledged and deliberately **not** absorbed.

## No PENDING-DECISION file exists for this

Every open decision is listed above with its owner. The two that need a human are the Step 3.5 grill
itself and the production-data question, and both are stated here rather than duplicated elsewhere.
