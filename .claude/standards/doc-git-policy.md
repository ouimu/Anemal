# Documentation Git Policy

> **Status:** Authoritative — every agent/skill that creates a new `.md` file must follow this.
> **Created:** 2026-07-24 (mass cleanup — removed 149 tracking/history/status .md files from Git)

## The rule

Two categories. Every markdown file is one or the other — never "figure it out later."

### 1. Application-necessary → commit to Git
Defines how the app or the agent pipeline itself works. Someone cloning this repo fresh needs it.

- `CLAUDE.md`, `AGENTS.md`, `README.md`, `CONTEXT.md`, `DESIGN.md`, `HOW-TO-RUN.md`
- `.claude/agents/**`, `.claude/skills/**`, `.claude/commands/**`, `.claude/standards/**`
- `.claude/roadmap/qa-protocols.md` (active procedure, not a status log)
- `design_prototype/**` (read-only design reference)

### 2. History / tracking / status → local-only, NEVER commit
Chronological record of what happened. Useful to the current agent session, dead weight to Git — every reader clones it forever, and it churns every task.

- `HistoryLog.md`, `CHANGELOG.md`, `PHASE-RESEQUENCE.md`, `design-alignment-plan.md`, `RecommendByCodex/`
- `.claude/roadmap/index.md`, `.claude/roadmap/phase-history.md`, `.claude/roadmap/ACTIVE/**`, `.claude/roadmap/archive/**`
- `.claude/specs/RBAC_Platform_Restructure_Spec.md`, `System_Specification.md`, `implementation-status-matrix.md` (self-declared historical / superseded by phase-history.md)
- `docs/adr/**`, `docs/superpowers/plans/**`, `docs/superpowers/specs/**` — per-feature dated pipeline artifacts (brainstorm, BA sign-off, grill, plan, QA sign-off, ADR)
- Working checklists like `docs/manuals/*/proofreading-checklist.md`, `screen-inventory.md`

All of these are listed in `.gitignore` under "Local-only tracking/history docs". They still get created and read normally by the pipeline (grill-with-docs, BA sign-off, etc. still write real files) — they just never enter the Git index.

## Before creating any new .md file

1. **Check if it already exists.** Grep `.claude/`, `docs/`, and root for a file covering the same topic before writing a new one — don't spawn a duplicate tracker.
2. **Classify it** against the two lists above. If it's a dated/per-feature/status/history doc → it goes in a path already covered by a `.gitignore` pattern (or add a new pattern here + in `.gitignore` if it's a new *kind* of tracking doc, not just a new instance of an existing kind).
3. **If Application-necessary** → commit it normally, no exception process needed.
4. **Never `git add -f` an ignored doc.** If a file under an ignored path genuinely needs to ship in Git (rare — e.g. one specific ADR becomes load-bearing for a live security control), move it out of the ignored path into `.claude/standards/` or reference its content directly in the Application-necessary doc that needs it. Don't force-add a status-log path.

## Does a new doc need workflow refresh?

Ask: **is any agent/skill supposed to read this file's current state to act correctly?**

- **Yes** (e.g. `phase-history.md`, `implementation-status-matrix.md`, `roadmap/index.md`, `remaining-tasks.md`) → it must be wired into CLAUDE.md's "Tracking & Documentation" section as one of `@pm-agent`'s LAST-step refresh targets, so it never goes stale. Adding a new such file without adding it there is a bug.
- **No** (e.g. a one-off grill record, a completed BA sign-off) → it's a point-in-time artifact. Write it once, never revisit — don't add refresh duty for something frozen by design.
