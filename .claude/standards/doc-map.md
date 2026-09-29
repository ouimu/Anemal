# Document Map — Anemal

> **Owner:** `@scribe-agent` · **Created:** 2026-09-09
> Every operational document, who owns it, who loads it, when, and what it is canonical for.
> **Rule: a new `.md` without a row here is an orphan and does not merge.**

## Load tiers — the cost model

| Tier | Loaded | Cost | Put here |
|------|--------|------|----------|
| **T0** | in context on every turn, every session | highest | only what *every* agent must know |
| **T1** | when that agent spawns | medium | trigger + what to load |
| **T2** | when an agent reads it for a task | low | method, checklists, standards |
| **T3** | only when a T2 file points at it | lowest | bulk reference material |
| **T4** | never intentionally — but Glob/Grep hit it | hidden | archives; exclude from searches |

---

## T0

| File | Owner | Canonical for |
|------|-------|---------------|
| `CLAUDE.md` | human + `@pm-agent` | agent router · pipeline + gates · lane selector · multi-tenancy and two-plane invariants · handoff rules |

## T1 — agent definitions (`.claude/agents/<name>.md`)

| File | Owner | Model / Effort | Canonical for |
|------|-------|----------------|---------------|
| `ba-agent.md` | human | opus / high | requirement + authorization design trigger |
| `arch-agent.md` | human | opus / high | architecture trigger + hard rules |
| `pm-agent.md` | human | sonnet / medium | scope, task breakdown, work-partition manifest |
| `scribe-agent.md` | human | sonnet / medium | git hygiene, PR compliance, docs, ship |
| `db-agent.md` | human | opus / high | physical schema, isolation veto |
| `dev-agent.md` | human | sonnet / high | implementation (Dev A backend, Dev B frontend) |
| `uiux-agent.md` | human | sonnet / low | screen and component design (UIUX A) |
| `ponytail-agent.md` | human | opus / high | three review modes |
| `qa-agent.md` | human | opus / medium | tests, isolation/RBAC verification, arch conformance |

## T2 — methods, standards, status

| File | Owner | Loaded by | Canonical for |
|------|-------|-----------|---------------|
| `.claude/agent-methods/*/SKILL.md` | human | that agent | that agent's full method and templates |
| `.claude/standards/architecture-rules.md` | `@arch-agent` | arch, dev, db, qa | layer contract · abstraction choice · pattern whitelist · error taxonomy · transactions · state modelling · **where a value lives (code vs table)** |
| `.claude/standards/orchestration-protocol.md` | human | orchestrator (main session) | per-step PRE/BRIEF/POST/LOG · integration checkpoints · conflict routing |
| `.claude/standards/doc-maintenance.md` | `@scribe-agent` | scribe | the five tracking documents · who authors what · estate rules |
| `.claude/standards/doc-map.md` | `@scribe-agent` | scribe | **this registry** |
| `.claude/standards/doc-git-policy.md` | `@scribe-agent` | scribe | which documents are tracked in git |
| `.claude/standards/acceptance-criteria.md` | `@pm-agent` | pm, qa | AC format |
| `.claude/standards/tech-stack.md` | human | dev, db, arch | stack versions and choices |
| `.claude/roadmap/qa-protocols.md` | `@qa-agent` | qa | what runs at the end of every task |
| `.claude/roadmap/index.md` | `@scribe-agent` | anyone checking status | current status header · **Open hotfix debt** (Lane C gate) · **Pipeline metrics** (the P4 retro ledger and its pre-agreed decision rules) |
| `.claude/roadmap/phase-history.md` | `@scribe-agent` | anyone checking history | shipped-phase changelog + ADR index |
| `.claude/specs/implementation-status-matrix.md` | `@scribe-agent` | pm, ba | module-level implementation status |
| `.claude/skills/anemal-*/SKILL.md` | human | the agents named in each | that domain (see below) |
| `.claude/commands/*.md` | human | on slash-command invoke | lane and gate entry points |

### Skill canonical topics

| Skill | Canonical for | Read by |
|-------|---------------|---------|
| `anemal-rbac-matrix` | **permission catalogue + role matrix + route→permission map** | ba, db, dev, qa |
| `anemal-db-context` | isolation rules, query safety, migration rules | db, dev, qa, arch |
| `anemal-coding-rules` | code standards, backend/frontend/security/testing/github rules | dev, qa, scribe |
| `anemal-design-system` | tokens, icons, sidebar spec | uiux, dev |
| `anemal-screen-specs` | per-screen layout, anatomy, endpoints, AC | uiux, dev |
| `anemal-functional-reqs` | functional + non-functional requirements, priorities | pm, ba |
| `anemal-platform-console` | platform-plane domain | ba, db, dev |
| `anemal-ba-toolkit` | BA artefact templates | ba, pm |
| `anemal-dev-lanes` | Lane B/C/D mechanics | orchestrator, dev, qa, scribe |
| `anemal-finish-branch` | Step 8 ship mechanic + red-suite gate | scribe |
| `anemal-HTML-updater` | `docs/index.html` regeneration | scribe (via finish-branch only) |
| `anemal-smoke-walkthrough` | per-role manual page sweep | qa |
| `resume-work` | resuming mid-feature | orchestrator |

## T3 — bulk references

| Path | Owner | Canonical for |
|------|-------|---------------|
| `.claude/specs/database-schema.sql` | `@db-agent` | **the full DDL — single copy.** The former duplicate under `anemal-db-context/references/` was removed 2026-09-09 after the two drifted. |
| `.claude/skills/*/references/**` | the skill's owner | that skill's detail |
| `.claude/agent-methods/*/references/**` | that agent | that agent's task recipes |
| `docs/adr/NNNN-*.md` | `@arch-agent` | one accepted decision each — **immutable once accepted** |
| `docs/superpowers/plans/**` | `@pm-agent` (arch docs: `@arch-agent`) | per-feature record |

## T4 — never load, exclude from searches

`.claude/roadmap/archive/**` · `.claude/worktrees/**` (gitignored 2026-09-09) · `docs/manuals/**`

## Historical — readable, not authoritative

| File | Status |
|------|--------|
| `.claude/specs/RBAC_Platform_Restructure_Spec.md` | Phase 5 TO-BE rationale. Its permission catalogue is **stale** — `anemal-rbac-matrix` is canonical. Restored 2026-09-09. |
| `HistoryLog.md`, `CHANGELOG.md` | frozen, untracked; never append |
