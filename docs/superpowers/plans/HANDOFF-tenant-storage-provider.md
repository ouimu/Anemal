# Handoff — Tenant Storage Provider Feature (ADR-0023)

**Last updated:** 2026-07-24 (live session)
**Branch:** `feature/tenant-storage-provider` (up to date with origin, do not create a new branch)

---

## Sub-project status

1. **Custom network-share (SMB)** — ✅ SHIPPED. Sub-PR A = PR #46 (merged), Sub-PR B = PR #47 (merged), both on `main`.
2. **Google Drive OAuth** — ✅ SHIPPED. Sub-PR A (driver core) + Sub-PR B (OAuth endpoints + UI) = PR #48 (merged to `main`).
3. **Microsoft OneDrive** — 🔶 IN PROGRESS. See below.

## OneDrive sub-project — exact current state

- Design: `docs/superpowers/specs/2026-07-23-storage-onedrive-driver-design.md` — final, all findings folded in (Q1-Q4 product decisions, BA sign-off F-OD-1/2/3, grill round 1 G1-G4, grill round 2 (Fable independent review) findings 1-8 incl. F-OD-4, all resolved).
- BA sign-off: `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-ba-signoff.md` — APPROVE-WITH-FINDINGS (findings folded into design).
- Grill round 1: `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-grill.md`
- Grill round 2 (independent adversarial re-check): `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-grill-round2.md`
- **Write-plan: DONE.** `docs/superpowers/plans/2026-07-24-storage-onedrive-driver.md` — 13 tasks (Task 0 = OD-13 verification spike gate, Tasks 1-7 = proposed Sub-PR A driver core + retrofits to shipped Google Drive code, Tasks 8-12 = proposed Sub-PR B OAuth endpoints + frontend). Zero new runtime deps, 2 new endpoints.

## Exact next action

**Run the CLAUDE.md Step 5 Ponytail gate (`@ponytail-agent`) against the write-plan** at `docs/superpowers/plans/2026-07-24-storage-onedrive-driver.md`. The plan itself proposes a 2-PR split (mirroring how Google Drive and SMB both shipped) but explicitly flags that as a proposal for Ponytail to rule on, not a decision already made.

`/execute-plan` (Step 6) is BLOCKED until Ponytail returns APPROVE. If Ponytail REJECTs or requires changes, the plan doc needs another revision pass before re-submitting — do not proceed to execute-plan on a rejected plan.

**No PENDING-DECISION is currently open** for this sub-project — all business/product questions raised so far (Q1-Q4, G1-G4, F-OD-4) are answered and committed into the design doc. The only remaining pre-implementation item is **OD-13** (design's risk register) — a technical verification spike (not a business decision) confirming the OAuth-scope assumptions behind M-11/I-16, already scheduled as write-plan Task 0.

## After Ponytail approves

Step 6 `/execute-plan` (dev-agent, TDD style per the plan's exact tasks) → Step 7 `/code-review` + QA sign-off → Step 8 `/anemal-finish-branch` (creates PR, does NOT merge — human merges). If Ponytail's plan-split proposal is upheld, expect two sequential PRs same as sub-projects 1-2.

Once OneDrive ships and is merged: update CLAUDE.md's Phases table + `.claude/specs/implementation-status-matrix.md`, and this HANDOFF file can be deleted — all three sub-projects of ADR-0023 will be complete.
