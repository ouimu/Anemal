---
name: anemal-ba-toolkit
description: >
  Business-analysis method & templates for the Anemal project, used by @ba-agent (and @pm-agent).
  Use when writing a specification, a requirement/user story, a gap analysis, an acceptance-criteria
  set, a solution-option comparison, or a risk register; or when validating that a requirement is
  "ready" for development. Provides the standard structures so every BA artefact in Anemal looks the
  same and is testable. Pair with anemal-functional-reqs (scope), anemal-rbac-matrix (authz), and
  anemal-platform-console (SaaS domain).
---

# Anemal BA Toolkit

Method and templates so business analysis in Anemal is consistent, testable, and developer-ready.

## Working method (apply to every requirement)
1. Objective — the business value, in one sentence.
2. Stakeholders & actors — name the roles (use `anemal-rbac-matrix` role keys).
3. Business rules — invariants the system must uphold.
4. AS-IS — how it works today (cite files/endpoints when known).
5. TO-BE — the target behaviour.
6. Exceptions & edge cases — what can go wrong; the system response.
7. Integrations & dependencies — external systems, other modules.
8. Security & compliance — permissions (which codes?), PII, audit, plane boundary.
9. NFR impact — performance, scalability, availability, maintainability.
10. Recommendation — the option to take and why (use the option template when >1 exists).

## Definition of Ready (hand to @pm-agent)
Objective stated · actors/roles named · permission codes assigned · business rules listed ·
exceptions covered · NFR impact noted · acceptance criteria testable by @qa-agent · risks &
dependencies recorded. Anything missing -> not ready.

## Templates
Full copy-paste templates (spec, user story, gap-analysis row, acceptance criteria,
solution-option, risk register, requirement matrix): `references/templates.md`.

## House style (matches CLAUDE.md preferences)
- Tables and short bullets over prose. Be concise but comprehensive.
- Every requirement gets a stable ID (`<AREA>-<n>`); reference FR IDs from `anemal-functional-reqs`.
- State assumptions explicitly; challenge the request when the objective is unclear.
- Recommend standard configuration before custom development.
