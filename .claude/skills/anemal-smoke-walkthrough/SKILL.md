---
name: anemal-smoke-walkthrough
description: Login as each Anemal role, walk every reachable page, and report errors. Use when the user asks to "walk every page as X role", do a manual QA pass, or verify nothing broke across roles after a change.
triggers:
  - "login as staff and walk every page"
  - "walk every page as"
  - "smoke test all roles"
  - "check every screen for errors"
---

# anemal-smoke-walkthrough

Standardizes the role-by-role manual QA pass that got re-typed nearly
verbatim across many past sessions. Always use the `preview_*` tools
(`mcp__Claude_Preview__*`) for this, never `claude-in-chrome` — past runs
lost ~30 QA calls to frozen-renderer screenshots on that path.

## Roles to cover

Clinic plane (pick per request, or all four if unspecified):
- `clinic_admin` — clinic config, staff/role management, reports, integrations
- `doctor` — EMR/SOAP, lab/X-ray, diagnosis, prescriptions
- `clinic_staff` — front desk, CRM, inventory, POS/billing, dispensing

Platform plane:
- platform admin — Customer/tenant list, plans, platform settings, audit log

Use whatever seeded test credentials exist for the current dev DB (check
`.claude/roadmap/qa-protocols.md` or ask if none are seeded — never invent
credentials).

## Steps per role

1. `preview_start` (or confirm dev server already running).
2. Log in as the role via `preview_fill` + `preview_click`.
3. `preview_snapshot` to confirm the correct landing page/nav for that role
   (catches plane/role leakage — a role seeing routes it shouldn't).
4. For every nav item reachable by that role: navigate, then check
   `preview_console_logs` (errors/warnings) and `preview_network` (failed
   requests) before moving to the next page. `preview_screenshot` only
   for pages where the console/network check doesn't tell the full story.
5. Log out, move to next role.

## Report format

One table: role | page | status (OK / error) | detail. Only elaborate on
rows that aren't OK — don't narrate the pages that worked.
