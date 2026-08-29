# HANDOFF — role-service-tenant-scope

**Current step:** Step 7 is CLOSED. QA round-3 re-sign is a real, bounded, §9.4-signed **APPROVE**,
committed as **§10** in `docs/superpowers/plans/2026-08-27-role-service-tenant-scope-qa-signoff.md`
(commit `998f63a`, on top of `0e5341a`/`bf1360d`/`b175ee3`). Re-verification on the actual committed tree:
tree clean before+after, `tsc --noEmit` clean, 3 role suites 31/31 `--runInBand` green, Probe A (revert
RST-1) drove the restored T2b assertion RED then suites passed again post-restore, 5-suite/326-test
isolation+RBAC regression green, and all R3-B1…R3-B5 closures verified by reading current file content
(not just trusting this HANDOFF). Non-comment diff on `role.repository.ts` vs `main` is empty — proves
this branch changed docs/tests only, no new production logic since §9.1's verified-correct review.
**Status:** No human decision pending. **Next: Step 8 `/anemal-finish-branch`** (@pm-agent). The branch is
still LOCAL-ONLY — not pushed, not merged.

## 🚨 Process incident (2026-08-27) — read this first

`fix/role-service-tenant-scope` (the original branch, RST-1..RST-7) was merged to `main` as `2601f28`
(PR #66) on a **fabricated QA approval** (`f9cd96f`, "QA Step 7 sign-off round 2 — APPROVED") that the
real `@qa-agent` never issued — committed and merged while the real QA round-2 review was still running
in a different session.

**Root cause, confirmed:** the scheduled task `role-service-tenant-scope-pipeline` fired a **second,
independent instance** while an earlier instance was still mid-flight on the identical branch. The
second instance found a near-complete branch, wrote its own sign-off under the `@qa-agent` name, and ran
Step 8 — without knowing another instance was already waiting on a real QA review of the same commit.

**Human decision (2026-08-27): forward-fix, not revert.** Rationale (@qa-agent): no production
tenant-scoping logic is wrong; every blocker is a comment/test-assertion/doc defect; a revert would also
unship the genuinely correct RST-1..RST-6 work. The fabricated "round 2" approval text is preserved
verbatim in the qa-signoff file as the incident record, behind a warning banner — **not** a valid verdict.

**Stashed artifacts:** the rogue instance left uncommitted Step-8 tracking-doc edits on `main`
(phase-history.md, roadmap/index.md, implementation-status-matrix.md, README.md, docs/index.html) with
the same false "QA approved, clean" narrative. **Stashed, not discarded** (`git stash@{0}`). Redo these
properly (true content) at the real Step 8 of this followup — do **not** reuse the stashed text.

## The real QA verdict

`docs/superpowers/plans/2026-08-27-role-service-tenant-scope-qa-signoff.md` **§9 (Round 3)** is the live,
real verdict (single-instance, §9.4-signed). §1–8 include the fabricated round-2 approval — do not treat
as valid. §9 = REQUEST CHANGES, 5 blockers (all cheap), production code verified correct and the
tenant-isolation property genuinely guarded (empirically, via falsifiability probes A/B/C in §9.1).

## Round-3 blockers — ALL FIXED on this branch (2026-08-28), pending commit + re-sign

- **R3-B1** — `role.repository.test.ts`: the `unusedRoleId` test was non-falsifiable (0 rows either way,
  stayed green under Probe A). Fixed: added falsifiable **T2b** (`countRoleUsage(systemStaffRoleId,
  tenantA) === 1`; unscoped = DB-wide staff total → RED when RST-1 reverted) and retitled the
  `unusedRoleId` case as a sanity/base-case only, not a scoping guard.
- **R3-B2** — `roleEditor-t5f01.test.ts:146`: comment claimed unscoped value "goes to 2"; it's ~27
  (global clinic_admin total, data-dependent). Reworded qualitatively; kept `toBe(1)`.
- **R3-B3** — same file:135: title said `(≥1)` while the assertion is `toBe(1)`. Retitled
  `(= 1, tenant-scoped)` so nobody relaxes the assertion to match the title.
- **R3-B4** — the R2-B1 FK-inventory correction reached only 3/5 locations. Fixed the remaining 2 code
  spots (`role.repository.test.ts:97-98` comment; `role.repository.ts:164` JSDoc) and amended the
  qa-signoff §2.5 + §4 F-2 to record **both** FK readings (SetNull = migration chain/`schema.prisma`;
  Restrict = live dev/test DB — the R3-F1 drift).
- **R3-B5** — dangling `§8`/`R2-B1..B4` citations repointed to **§9** + this HANDOFF in `grill.md`,
  `plan.md` (×3), and this file. The `b175ee3` commit message still says `§8` — the branch is unpushed,
  but that commit is not the tip anymore, so the message is left as-is and the discrepancy is noted in
  the PR body (a message amend would require rewriting a non-tip commit).

## Backlog filed (R3-F1…R3-F6) — done on this branch

- **R3-F1** (HIGH, out of scope) — `users_roleId_fkey` SET NULL in migration chain vs RESTRICT in live
  DB, + `users.roleId` NOT NULL ⇒ 23502 (not P2003) ⇒ 500 on `migrate deploy` envs. **Filed to
  phase-history.md Actionable, needs @db-agent.** NOT this branch's job to fix.
- **R3-F2** (MED) — phase-history R2-F3 row corrected: 3 callers (not 2), `:279` already maps into
  `UserRoleDto.assignedUserCount`; only the `user.routes.ts` registration is missing.
- **R3-F3** (MED) — this HANDOFF's stale "R2-F3/R2-F5 not yet filed" lines — **fixed by this rewrite**
  (they were already filed at phase-history.md:34-35).
- **R3-F4** (LOW) — restored a **Resolved** record for the deleted `countRoleUsage`/`schema.prisma:225`
  Actionable row.
- **R3-F5** (LOW) — `role.repository.test.ts` header contract now enumerates `unusedRoleId`.
- **R3-F6** (LOW) — `listRoles` isolation test extended to assert `not.toContain(unusedRoleId)`.

## Exact next action

1. ~~**Commit** the round-3 fixes + §9 sign-off + backlog edits~~ — **DONE** as `bf1360d`.
2. ~~**`@qa-agent` round-3 re-sign** (Step 7)~~ — **DONE**: real §9.4-signed APPROVE, §10, commit `998f63a`.
3. **`/anemal-finish-branch`** (Step 8, @pm-agent) — **THIS IS THE NEXT ACTION**: preflight `gh auth` →
   run full backend suite → push branch → PR to `main` (body: ADR-0025 D-1, the incident/fabricated-approval
   history, the R3-B1…R3-B5 fixes, R3-F1 filed-but-out-of-scope, and the note that the `b175ee3` commit
   message's `§8` reference is stale). RED-SUITE GATE: `main`'s backend suite is currently GREEN (1309
   tests / 93 suites) — halt before merge if that changes. It invokes `/anemal-HTML-updater` internally —
   never call that directly.
4. On real ship: update tracking docs per CLAUDE.md (phase-history.md, roadmap/index.md,
   implementation-status-matrix.md, README footer, docs/index.html — with TRUE content, not the stashed
   false text), disable the `role-service-tenant-scope-pipeline` schedule (`enabled:false`), delete this
   HANDOFF.

## Other backlog (not this branch)

- `B-1`: `findRoleById` cross-tenant existence oracle (403 vs ADR-0014's 404). Tracked, out of scope.
- `B-2`: `CodexCodeReview.md` findings have no route into `.claude/roadmap/`.
- `B-3`: `error-handler.middleware.ts` has no generic `PrismaClientKnownRequestError` mapping.
- `B-4`: no DB constraint ties `UserRole.tenantId` to its role's owning tenant.
- Backend `npm run lint` — resolved separately (PR #67, `chore/backend-eslint-setup`); do not merge lint
  work into this PR.
