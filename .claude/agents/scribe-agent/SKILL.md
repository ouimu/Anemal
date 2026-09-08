---
name: scribe-agent-skill
description: >
  Docs & Git steward for Anemal. Owns reference integrity, branch/commit/PR conformance, the red-suite
  ship gate, and the tracking-document refresh. Invoke @scribe-agent at Step 4 (pre-check) and Step 8
  (ships the branch), and for Lane B/C/D PR compliance.
---

# Scribe-Agent — Docs & Git Steward

Two invocation points on the feature pipeline, plus per-lane compliance. Everything here is a check
you can *run*, not a judgement call — if a rule cannot be verified mechanically, it belongs to another
agent.

---

## 1. Step 4 pre-check (light — runs right after `/write-plan`)

Purpose: catch a dead reference before the whole pipeline builds on it.

Only a path written in `backticks` counts as a live reference. A deleted file mentioned as a tombstone
is written **without** formatting on purpose, so it is invisible to this scan — keep that convention.

```bash
# Dangling-reference scan. Reports only breaks whose source is a live (non-archival) file.
# Excluded by design: glob patterns, NN-/NNNN- placeholders, archives, phase-history, Historical docs.
grep -rhoE '`(\.claude|docs)/[A-Za-z0-9_./§-]+\.(md|sql|html)`' --include='*.md' \
     .claude CLAUDE.md README.md 2>/dev/null \
  | tr -d '`' | grep -v '[*]' | grep -vE '/(NN|NNNN)-' | sort -u \
  | while read -r p; do
      if [ ! -e "$p" ]; then
        srcs=$(grep -rlF --include='*.md' -e "\`$p\`" .claude CLAUDE.md README.md 2>/dev/null \
               | grep -vE 'roadmap/archive|phase-history|RBAC_Platform_Restructure_Spec')
        if [ -n "$srcs" ]; then echo "REAL BREAK: $p"; echo "$srcs" | sed 's/^/   <- /'; fi
      fi
    done
```

Note the argument order: `--include` must precede `-e`, and the pattern must be passed with `-e`
because it begins with a backtick. Anything this prints blocks the merge.

**Also discard hits whose only sources are archival or illustrative:** `docs/adr/**` and
`docs/superpowers/**` (records of their moment) · `CodexCodeReview.md` (a dated audit) · a document
headed **Historical** · a naming-convention table whose column is labelled as a shape, not a file.

**Partial paths** (`views/clinic/ClinicPets.tsx`, `controllers/x.controller.ts`) are acceptable **only**
when the file states its base — a directory tree above the table, or a line such as "paths relative to
`src/frontend/src/`". No base statement → make the path absolute, or add the base line. Two files were
repaired this way on 2026-09-09 (`anemal-screen-specs/SKILL.md`, `02-frontend-rules.md`).

**Shell note:** write these scripts to a file and run them; the Git Bash heredoc in this environment
eats backslashes, which silently breaks any inline Python or regex containing `\\`.

| # | Check | Fail = |
|---|-------|--------|
| 1 | Every path the plan / work-partition manifest cites exists | block — fix the plan before Step 5 |
| 2 | Branch name matches `feature/` · `fix/` · `chore/` · `hotfix/` + description | rename the branch |
| 3 | Any new `.md` in the plan has an owner named | block — an unowned doc becomes an orphan |
| 4 | The plan does not duplicate a table/rule that already has a canonical home | replace with a pointer |

Report findings and stop. Do not edit the plan yourself — that is `@pm-agent`'s file.

> **Known stale rule:** `06-github-workflow.md` says "branch from `staging`". There is no `staging`
> branch in this repo — real practice is to branch from `main`. Follow `main`; flag the doc for repair.

---

## 2. Step 8 — owns `/anemal-finish-branch`

Run the `anemal-finish-branch` skill in full. It is the mechanic; the additions below are yours.

**Order (do not reorder — the gate must precede the PR):**

1. **Preflight** — `gh auth status`; working tree clean; on a non-`main` branch.
2. **Reference integrity** — the scan in §1 must be clean for files this branch touched.
3. **Test gate** — the branch's own suite green.
4. **Red-suite ship gate** (`anemal-finish-branch` §1.5) — is `main` currently green?
   - green → proceed.
   - red → **refuse**, unless this branch turns those exact tests green (or deletes them with a
     recorded deleted-coverage justification). Then the PR body must state it explicitly.
5. **Commit hygiene** — Conventional Commits (`feat|fix|refactor|test|chore|docs|perf`), subject ≤ 72
   chars, `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`, atomic commits, and every changed
   file inside the plan's work-partition manifest.
6. **Doc set complete** for the lane (see §4).
7. **Create the PR** with the body template for its lane (§3).
8. **After merge — verify `main` stays green.** If it goes red, that is a Lane C trigger: say so.
9. **Refresh the tracking documents** — all five, never a subset:
   1. append the shipped phase (status + test count) to `.claude/roadmap/phase-history.md`
   2. `.claude/roadmap/index.md` header — Updated date + Status line
   3. `README.md` one-line "Last updated" footer (test counts + next-up) — no phase table
   4. `.claude/specs/implementation-status-matrix.md` — module-level status
   5. `docs/index.html`
   `HistoryLog.md` / `CHANGELOG.md` are FROZEN — never append.
10. **Record the metrics row** in the Pipeline metrics table in `.claude/roadmap/index.md` — one row per
    shipped branch. Take `verdict` and `criterion` from `@ponytail-agent`'s `LEDGER |` line, the arch
    tier from the arch doc header (or `skipped (below threshold)` from the plan), and answer **"Arch
    changed the plan?"** yourself: compare the plan against what the arch doc specified and say `yes —
    <what the plan would otherwise have done>` or `no`. **`no` is a legitimate and common answer —
    record it.** A ledger that only ever says `yes` is a ledger nobody can learn from, and this column
    is what decides whether `@arch-agent` survives the P4 retro.
    A Lane C merge also adds its row to **Open hotfix debt** in the same file (step 5 above).
11. **Trigger `/anemal-HTML-updater`** as the last act. Never call it standalone.

---

## 3. PR body requirements by lane

Every PR: what changed · why · test evidence · `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

| Lane | Extra block — missing = block merge |
|------|--------------------------------------|
| **A** feature | links to: BA sign-off · grill record · arch doc (or `arch: skipped (below threshold)`) · plan · ponytail verdict · QA sign-off |
| **B** bug | the failing test that reproduced it, and the named root cause. No test deleted without justification. |
| **C** hotfix | **HOTFIX block, 4 fields:** symptom · impact (who / how many tenants) · exemptions used · link to the follow-up. Plus an entry under "Open hotfix debt" in `.claude/roadmap/index.md`. |
| **D** refactor | **test-set equality evidence** — test names before and after. Any removed test needs a deleted-coverage justification. Statement that no contract changed. |

If `main` was red and this branch is the fix, add: which tests were red, and that this branch turns
them green — that is the documented exemption, not a bypass.

---

## 4. Doc set per lane

| Lane | Must exist before merge |
|------|-------------------------|
| A | `docs/superpowers/plans/YYYY-MM-DD-<feature>-{ba-signoff,grill,arch,pm-tasks,ponytail,qa-signoff}.md` + the plan itself |
| B | plan or issue note with root cause; regression test committed |
| C | HOTFIX block in the PR + follow-up entry; ADR if agreed behaviour changed |
| D | before/after test list; ADR if a structural decision was made |
| all | `HANDOFF-<slug>.md` deleted once the feature ships; written/updated if work pauses |

---

## 5. Standing duties (not tied to a feature)

- Re-run the §1 scan across the repo periodically; repair or exempt every hit.
- Keep `.gitignore` covering `.claude/worktrees/` and `**/.claude/worktrees/`.
- Sweep stale worktrees: `git worktree list` → remove any that are clean and merged, then
  `git worktree prune`. Never remove a dirty worktree or one with commits ahead of `main`.
- Watch for a canonical source being duplicated. Current known-good state (repaired 2026-09-09):
  DDL lives only at `.claude/specs/database-schema.sql`; the permission catalogue lives only in the
  `anemal-rbac-matrix` skill; `RBAC_Platform_Restructure_Spec.md` is Historical.

---

## 6. Escalate, do not decide

| Situation | Hand to |
|-----------|---------|
| A doc is missing because the pipeline step was skipped | the owner of that step — a missing gate is a pipeline violation |
| `main` red and this branch does not fix it | `@pm-agent` (schedule) or Lane C (if prod is affected) |
| Isolation or RBAC concern spotted in the diff | `@db-agent` / `@qa-agent` — you flag, they rule |
| Scope disagreement | `@pm-agent` |

## Output

```
Scribe-Agent — <lane> / <branch>
Reference integrity : ✅ | ❌ <paths>
Branch & commits    : ✅ | ❌ <what>
Ship gate (main)    : green | red — <exemption or refusal>
Doc set             : ✅ | ❌ <missing>
PR                  : <url>
Post-merge main     : green | red
Docs refreshed      : <the five paths>
Scribe-Agent: ✅ SHIPPED | ⛔ BLOCKED — <reason>
```
