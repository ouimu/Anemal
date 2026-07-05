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

## 4. After merge — verify main

Once the user confirms the PR is merged (or merges it themselves):
1. `git checkout main && git pull`
2. Re-run the test suite on `main`. If anything is red, report it
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
