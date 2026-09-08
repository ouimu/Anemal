# Documentation Maintenance — Anemal

> **Owner:** `@scribe-agent` (since 2026-09-09) · **Decides what shipped:** `@pm-agent`
> Moved out of `CLAUDE.md` § Tracking so it is loaded when documents are written, not on every turn.
> Git tracking policy lives in `.claude/standards/doc-git-policy.md`; the registry of every document
> and its owner lives in `.claude/standards/doc-map.md`.

---

## 1. The five documents — refresh ALL of them, never a subset

Run at the end of Step 8, after merge, as the last act before `/anemal-HTML-updater`.

| # | File | What to write |
|---|------|---------------|
| 1 | `.claude/roadmap/phase-history.md` | append the shipped phase — status + test count + PR mapping. **Canonical changelog.** |
| 2 | `.claude/roadmap/index.md` | header only: Updated date + Status line (test counts, latest shipped phase, what is blocked) |
| 3 | `README.md` | the one-line "Last updated" footer (test counts + next-up). **Do not re-add a phase table** — it is a pointer to `phase-history.md`. |
| 4 | `.claude/specs/implementation-status-matrix.md` | module-level implementation status. **Canonical** for module status. |
| 5 | `docs/index.html` | via `/anemal-HTML-updater`, invoked by `/anemal-finish-branch` as its last step |

**Frozen — never append:** `HistoryLog.md`, `CHANGELOG.md`. Both were untracked in `13a39e3` and are
historical only.
**Deleted and not to be recreated** (written without code formatting on purpose — a tombstone must not
look like a live path to the reference-integrity scan): docs/functional_spec_detailed.html ·
.claude/roadmap/ACTIVE/remaining-tasks.md (retired 2026-08-20 — `index.md` carries the counts now).

`CLAUDE.md` itself is touched **only** when an orchestration rule changes — never for per-phase status.

---

## 2. Who writes what

| Document class | Author | Committer |
|----------------|--------|-----------|
| Specifications in `.claude/specs/` | `@ba-agent` | `@scribe-agent` |
| Architecture docs + ADRs in `docs/adr/` | `@arch-agent` | `@scribe-agent` |
| Plans in `docs/superpowers/plans/` | `@pm-agent` | `@scribe-agent` |
| The five tracking documents above | `@scribe-agent` | `@scribe-agent` |
| Screen specs, design tokens | `@uiux-agent` | `@scribe-agent` |

`@pm-agent` decides *what* shipped and at which phase; `@scribe-agent` records it.

---

## 3. Rules that keep the estate healthy

1. **One canonical source per topic.** A table or rule that appears twice must have one copy replaced
   by a pointer. Known-good canonical assignments are listed in `doc-map.md`.
2. **No dangling reference merges.** Every `.claude/…` / `docs/…` path cited by a touched file must
   exist. Exempt: `roadmap/archive/**`, `phase-history.md`, files explicitly marked Historical, and
   placeholder patterns such as `NN-name.md`.
3. **Every new `.md` gets a row in `doc-map.md`** before it merges. A document nobody loads is an
   orphan; an orphan drifts and then misleads.
4. **Searches exclude** `.claude/worktrees/` and `*/archive/*`. `.gitignore` covers the first for git;
   agents must exclude both when using Glob/Grep.

---

## 4. Handoff files

`docs/superpowers/plans/HANDOFF-<feature-slug>.md` — written or overwritten whenever work on a
multi-step feature pauses for any reason, read first when resuming. Delete it once the feature ships.
The rule itself is in `CLAUDE.md` because every session needs it before reading anything else; the
deletion at ship time is `@scribe-agent`'s.
