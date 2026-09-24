# ADR-0031 — The Platform plane is English-only by design

**Status:** Accepted
**Date:** 2026-09-24
**Related:** ADR-0029 (date display follows the app language) · ADR-0030 (stored values stay English) ·
ADR-0027 (the shared modal is plane-neutral) · brainstorm §2.4 and §6.2 of
`docs/superpowers/plans/2026-09-23-i18n-completion-brainstorm.md` · BA answer 4.6 in
`docs/superpowers/plans/2026-09-23-i18n-completion-ba-signoff.md`
**Origin:** Human decision at Step 1 (brainstorm §6.2), recorded at the `/grill-with-docs` Step 3.5
gate, row **G-6** — `docs/superpowers/plans/2026-09-24-i18n-completion-grill.md`

## Context

Every i18n sweep so far has counted the six `/platform/*` views as 0% coverage — no `useT` import,
no keys, no stash material: `CustomerDetailView`, `CustomerListView`, `PlatformAuditView`,
`PlatformLoginView`, `PlatformPlansView`, `PlatformSettingsView` (under
`src/frontend/src/views/platform/`), plus `PlatformLayout`. Each sweep lists them as a gap, and each
time someone has to rediscover that nobody asked for them.

These views are operated by the SaaS owner's internal team, not by clinic staff. The Thai-language
requirement comes from clinics.

## Decision

**The Platform plane is English-only. That is the intended state, not an i18n gap, and it is not
backlogged.**

1. Future i18n sweeps, coverage counts and gap inventories exclude `views/platform/**` and
   `PlatformLayout`. Counting them as missing coverage is a reporting error.
2. Platform views do not import the translator and do not read `uiStore.language`.
3. **Shared plane-neutral components get their text from the caller**, as ADR-0027 already requires
   for the shared modal (no i18n import in its allowlist). Platform callers pass English; clinic
   callers pass `t(…)`. This is what keeps the Platform English even on a browser whose stored
   language is `th`.

## Consequences

**Positive**
- The Platform stops appearing as a gap in every coverage report, and the six views carry no
  translation-maintenance cost.
- No new coupling between the planes: the language preference stays a clinic-plane concern.

**Negative / risks**
- **The language setting is per browser, not per plane.** `uiStore.language` is persisted to
  `localStorage` (`vetclinic-ui`). A shared component that calls `useT` internally, rather than
  taking text as a prop, would render Thai inside the Platform for anyone who used that browser in
  Thai mode. Rule 3 exists to prevent this.
- **Revisit trigger.** If the Platform is ever operated by non-English-speaking staff, or any
  `/platform/*` screen becomes visible to clinic users, this decision must be reopened as a new ADR
  rather than handled as an i18n sweep item.
