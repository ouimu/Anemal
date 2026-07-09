# Roadmap Index

> **Updated:** 2026-07-09 (post-Codex-audit doc cleanup)
> **Status:** Phases 1–9, D-1–D-5, and Codex Audit Batches 1–5 all complete
> (835 backend + 143 frontend tests green). Remaining work is credential-gated.

---

## Active

- **[Remaining Tasks](ACTIVE/remaining-tasks.md)** — the only live task list
  - Phase 10: Payment Gateway & SaaS billing (needs Omise + SMTP)
  - Phase 11: LINE/SMS dispatch (needs LINE + Twilio)
  - Pre-launch checklist + RBAC/UX/QA backlog
- `ACTIVE/codex-audit-remediation-tasks.md` — untracked session tracker for the
  2026-07 Codex audit closeout; remediation content is COMPLETE (kept only for the
  coordinator's closeout tail section).

Canonical module-level implementation status: `.claude/specs/implementation-status-matrix.md`.
Phase history + test counts: `CLAUDE.md` → Phases table, `README.md`, `HistoryLog.md`.

---

## Completed Phases (Archive)

For historical reference and understanding prior decisions — see [archive/](archive/):

- Phase 1–4 task lists + Phase 1 implementation log
- `phase1.5-settings-tasks.md` — Settings & Configuration (shipped as Phase 5)
- `phase5-rbac-platform-tasks.md` — RBAC & Platform Console (shipped as Phase 8;
  file keeps its stable `phase5`/`5-x`/`T-5x` identifiers per PHASE-RESEQUENCE.md)

---

## QA Protocols

Detailed QA procedures for every task:
- See [qa-protocols.md](qa-protocols.md) — independent file, shared reference

---

**Rule:** Active development always references only ACTIVE/ files.
**Archive access:** when understanding prior decisions or audit trail.
