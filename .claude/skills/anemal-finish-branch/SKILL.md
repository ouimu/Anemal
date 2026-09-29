---
name: anemal-finish-branch
description: Finish a completed Anemal feature branch — preflight gh auth, run tests, create PR, verify main stays green after merge, then trigger the HTML-updater. Use when a feature's implementation and QA sign-off (Step 7) are done and it's time to ship (Step 8 + PR).
triggers:
  - "finish this branch"
  - "create the PR"
  - "ship this feature"
  - "open a pull request"
  - "merge this branch"
---

# anemal-finish-branch

Wraps the PR/merge ritual that has failed repeatedly across past sessions:
`gh` missing from PATH, `gh` unauthenticated, github MCP auth failure, PRs
created against a red test suite, merges that leave `main` broken, and
Step 8 (`/anemal-HTML-updater`) forgotten after merge. Run this only after
`@qa-agent` sign-off (Step 7).

## 1. Preflight — verify before touching anything

Run in order, stop on first failure and report it (don't retry blindly):

1. `gh auth status` — if not authenticated, STOP and tell the user to run
   `gh auth login` themselves. Do not attempt to paste or request a token.
2. `git status --short` — uncommitted changes? Ask whether to include them
   or stash; never silently commit unrelated work.
3. `git fetch origin` then check the branch is pushed and up to date with
   its remote tracking branch.
4. Confirm current branch is not `main`/`master`.
5. **Check `main`'s current backend suite status** — `git fetch origin`, then run the backend
   test suite against `origin/main` (or check the most recent CI result on `main` if available).
   If `main` is currently red:
   - **Exemption (self-fix branch):** if THIS branch's own backend suite is green AND it
     specifically resolves the tests currently failing on `main` — i.e. every test name
     failing on `main` is one this branch either turns green OR deliberately deletes with a
     recorded deleted-coverage justification — proceed, noting the pre-existing red state and
     which tests it fixes or removes in the PR body. (The delete case is not hypothetical:
     a branch repairing tests that assert a retired requirement resolves them by removal, and
     a green-only reading would deadlock exactly the branch that fixes `main`.) This is the only branch type allowed
     to merge while `main` is red; it is the mechanism by which `main` gets back to green.
   - **Otherwise:** STOP. Report which suite/tests are failing on `main` and that this is a
     pre-existing break, not introduced by the current branch. Do not create a PR until either
     a self-fix branch (per the exemption above) lands, or `main` is otherwise made green.
   (Rule added 2026-08-20 after a 2-week undetected red-`main` incident — see CLAUDE.md
   "Red-suite ship gate". The exemption was added the same day, before first use, once the
   original wording was found to deadlock the very branch written to fix `main`.)

## 2. Test gate

Run the project's test suite and typecheck (`npm test`, `npx tsc --noEmit`,
`npm run lint` — check `package.json` scripts for the exact names). All must
pass. If anything fails:
- Do NOT create the PR.
- Report the failing output and stop — this is a `systematic-debugging`
  task, not something to paper over with `--no-verify` or a forced push.

## 3. Create the PR

Use `gh pr create` (see root `CLAUDE.md` — gh CLI is canonical over the
github MCP for PR/issue actions in this project). Title from the branch's
commit history (Conventional Commits style, matches `git log` on this repo).
Body: Summary (1-3 bullets) + Test plan checklist, per the standard PR
template in this environment's instructions.

Never push --force, never skip hooks, never merge without being asked.

## 3.5 Merge gate — CI must be green

GitHub does **not** enforce this: the repo is private on the free plan, so
rulesets and branch protection are not applied and the merge button stays
clickable on a red PR. This gate is the only thing that holds the line.

Before merging — even when the user says "merge" — read the PR's check runs
on its **current head commit**:
1. `frontend` and `backend` (from `.github/workflows/ci.yml`) must both be
   `completed` / `success`.
2. Still running → wait for them; do not merge on a pending check.
3. Any red → do NOT merge. Report the failing job and step, and fix it
   first (Lane B). Only exception: the self-fix branch exemption in §1.5,
   and then only if CI's remaining failures are exactly the tests that
   branch fixes — say so in the PR body.
4. A new push after the checks passed resets this — re-read on the new head.

(Rule added 2026-09-29 with the CI workflow, after PR #92 merged with a red
test and left `main` red until PR #96.)

## 4. After merge — verify main

Once the user confirms the PR is merged (or merges it themselves):
1. `git checkout main && git pull`
2. Check the CI run that the merge triggered on `main` (or re-run the test
   suite locally if CI is unavailable). If anything is red, report it
   immediately — do not silently start a new feature on top of a broken
   main branch. (Past incident: a merge left 22 failing test files
   undetected until the next feature's plan cycle.)
3. If main is green, proceed to step 5.

## 5. Step 8 — trigger the HTML updater

Invoke the `anemal-HTML-updater` skill now, unprompted. This is
Step 8 of the CLAUDE.md pipeline and is easy to forget once the PR is
merged and attention has moved on — don't wait to be asked.

## 6. Report

One short summary: PR URL, test results before/after merge, HTML-updater
status. Do not repeat the diff or the full test output.
