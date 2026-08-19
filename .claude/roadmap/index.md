# Anemal — Roadmap Index

**Updated:** 2026-08-06
**Status:** Codex security review remediation shipped — CRITICAL 2/2 and HIGH 20/20 findings closed, merged to `main` via PR #53. Ponytail-agent and QA-agent both APPROVED. R2-HI-01 (row-level security) closed via documented deferral, not deployment — see `.claude/roadmap/phase-history.md` and `ebc07dd` for rationale (single-pool/single-role Prisma setup would deny every query under full RLS as originally scoped). MEDIUM/LOW findings intentionally out of scope for that branch.
**Latest tests:** 1243+ backend (2 new regression suites; exact cumulative count unverified this session — local Postgres unreachable) / 330 frontend (unchanged). `tsc --noEmit` clean both sides, verified on `main` post-merge.
**Blocked:** Phase 10 (payment gateway + SaaS billing) and Phase 11 (LINE/SMS dispatch) both paused, pending external credentials.

See `.claude/roadmap/phase-history.md` for the full shipped-phase changelog and ADR index. See `.claude/roadmap/ACTIVE/remaining-tasks.md` for the current task backlog. See `.claude/specs/implementation-status-matrix.md` for module-level implementation status.
