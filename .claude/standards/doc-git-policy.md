# Documentation Git Policy

> **Status:** Authoritative — every agent/skill that creates a new `.md` file must follow this.
> **Created:** 2026-07-24 (mass cleanup — removed 149 tracking/history/status .md files from Git)
> **Superseded:** 2026-08-19 — reversed the "local-only" category. User develops across multiple
> machines (laptop A + laptop B) and needs full project-status continuity (current phase, remaining
> tasks, BA/QA sign-off records, pipeline artifacts) to survive a plain `git clone` on either one.
> Local-only docs silently failed that: a fresh clone had zero memory of where the project stood.

## The rule

**Everything commits.** All `.md`/`.sql`/planning docs the pipeline produces — status logs, phase
history, roadmap, specs, per-feature pipeline artifacts (brainstorm, BA sign-off, grill, plan,
QA sign-off, ADR) — are tracked in Git. There is no local-only doc category anymore.

Still `.gitignore`d, unrelated to this doc: secrets (`.env*`), build output (`dist/`, `build/`,
`coverage/`), `node_modules/`, `.vercel` (machine-specific project link), `attachments/`, `backups/`.
Those stay out because they're either sensitive or regenerable, not because they're "just history."

## Before creating any new .md file

1. **Check if it already exists.** Grep `.claude/`, `docs/`, and root for a file covering the same topic before writing a new one — don't spawn a duplicate tracker.
2. **Commit it.** No classification step, no exception process — every doc the pipeline writes goes into Git normally.

## Does a new doc need workflow refresh?

Ask: **is any agent/skill supposed to read this file's current state to act correctly?**

- **Yes** (e.g. `.claude/roadmap/phase-history.md`, `.claude/specs/implementation-status-matrix.md`, `.claude/roadmap/index.md`) → it must be listed in `.claude/standards/doc-maintenance.md` as one of `@scribe-agent`'s LAST-step refresh targets, and given a row in `.claude/standards/doc-map.md`, so it never goes stale or becomes an orphan. Adding a new such file without doing both is a bug.
- **No** (e.g. a one-off grill record, a completed BA sign-off) → it's a point-in-time artifact. Write it once, never revisit — don't add refresh duty for something frozen by design.
