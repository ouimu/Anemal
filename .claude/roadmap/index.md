# Roadmap Index

> **Updated:** 2026-06-16  
> **Status:** Phases 1–4 complete; Phases 1.5 & 5 active

---

## Active Phases

Current development and priority work:

- **[Phase 1.5](ACTIVE/phase1.5-settings-tasks.md)** — Settings & Configuration Module
  - Clinic settings, system settings, encryption infrastructure
  - Status: Mostly complete (waiting for API implementation)

- **[Phase 5](ACTIVE/phase5-rbac-platform-tasks.md)** — RBAC & Platform Authorization
  - Two-plane authorization model (Clinic vs. Platform)
  - Configurable roles, permission matrix enforcement
  - Platform Console domain

- **[Remaining Tasks](ACTIVE/remaining-tasks.md)** — Deferred Work & Dependencies
  - Tasks blocked until Phase 1.5 / 5 complete
  - External credential-dependent work

---

## Completed Phases (Archive)

For historical reference and understanding prior decisions:

- **Phase 1–4:** See [archive/](archive/) directory
  - Phase 1: Foundation & Security (weeks 1–4)
  - Phase 2: Core Clinic Operations (weeks 5–8)
  - Phase 3: Reporting & Integration (weeks 9–11)
  - Phase 4: Production Hardening (weeks 12–15)

Use archives when you need context on prior design decisions.

---

## QA Protocols

Detailed QA procedures for every task:
- See [qa-protocols.md](qa-protocols.md) — independent file, shared reference

---

**Rule:** Active development always references only ACTIVE/ phases.  
**Archive access:** When understanding prior decisions or audit trail.
