# HANDOFF — Cross-Tenant Relation Isolation (Lane A)

**Status as of 2026-09-10:** Step 3 (BA sign-off) complete. Blocked before Step 3.4 (arch) on two
open conditions — see "Next action" below.

## What this is

Lane A follow-up to the 2026-09-10 Lane C hotfix (PR #73, `hotfix/vaccination-due-soon-cross-tenant-pii-leak`,
merged) which fixed a cross-tenant PII leak in `findDueSoon` (`src/backend/models/vaccination.repository.ts`).
A read-only audit found the same pattern — a tenant-filtered query with an `include`/raw-SQL join that
follows a forward FK without re-checking `tenantId` on the related row — in **11 files**, and confirmed
the root cause is structural: **zero composite/compound FKs on `tenantId` exist anywhere in the schema**
(70 `@relation` declarations checked, 0 reference `tenantId`).

Recorded as open hotfix debt in `.claude/roadmap/index.md` (2026-09-10 row).

## Work so far

1. Explore-agent audit (this session, no artifact file — findings summarized in conversation and
   carried into the BA brief below).
2. **BA sign-off complete**: `docs/superpowers/plans/2026-09-10-cross-tenant-relation-isolation-ba-signoff.md`
   — read this first, it supersedes the audit summary. Key corrections it made to the original brief:
   - **F-1**: `findDueSoonWorklist`'s raw SQL (`vaccination.repository.ts`) is NOT already fixed as
     the hotfix commit's comment claims — its `JOIN pets`/`JOIN owners` carry no tenant predicate.
     That comment (merged in `1add331`) is now known-false and needs correcting whenever this ships.
   - **F-2**: severity is inverted from the original assumption — 5 sites use `owner: true`, leaking
     Thai national ID/passport (`idCardNumber`) and address, which is worse than what PR #73 fixed.
   - Recommends **one coordinated fix**, not a fast-follow per file — explicit reasoning in the BA doc.
   - Ruled RLS (`.claude/specs/database-schema.sql` §10, "NOT DEPLOYED") **out of scope** — infra
     precondition too large to couple to this fix.
   - Flagged two things arch must resolve that weren't in the original brief: E-7/C-4 (post-filter
     pattern breaks `take`/`count` pagination consistency — `pet.service.ts:34-40` is the example) and
     E-1 (`reminder.repository.ts` `listAllDue()` is *deliberately* cross-tenant for the background
     dispatcher — needs a named exemption, not an accidental pass).

## Next action — one blocker remaining before Step 3.4

- **C-7 — CLEARED 2026-09-11.** Human (kritsapon) explicitly approved scope for this Lane A work
  proceeding via hotfix-debt escalation (no separate brainstorm needed).
- **C-1 — IN PROGRESS.** `@qa-agent` dispatched 2026-09-11 to attempt a live write-path reproduction
  of a cross-tenant FK mismatch (not just the direct-DB-insert the hotfix test used). **If any
  app-reachable write path is found, this flips to Lane C immediately** (per BA's stated trigger) —
  do not proceed to Step 3.4 arch design until this resolves either way (HIT/MISS/INCONCLUSIVE).

Once C-1 resolves: invoke `@arch-agent` at Step 3.4 with the BA sign-off doc as input.

## Files to read, in order

1. `docs/superpowers/plans/2026-09-10-cross-tenant-relation-isolation-ba-signoff.md` — full BA analysis,
   all 49 file:line citations verified against source.
2. `.claude/roadmap/index.md` — "Open hotfix debt" section, 2026-09-10 row.
3. `src/backend/models/vaccination.repository.ts` — the already-hotfixed `findDueSoon` (reference
   pattern for the post-filter fix) and the still-broken `findDueSoonWorklist`.
4. `src/backend/models/product.repository.ts:242,254,266` — correct raw-SQL tenant-guard pattern to
   mirror for other raw-SQL sites.

## No PENDING-DECISION file exists for this

The two blockers above (C-7, C-1) are the decision points — ask the human directly rather than creating
a separate pending-decision doc, since this HANDOFF already states both clearly.
