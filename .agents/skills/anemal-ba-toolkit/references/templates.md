# Anemal BA Templates

## Specification skeleton
```
# <Title> Specification
> Spec ID · Status · Owner · Phase
1. Executive Summary
2. Business Context & Objectives
3. Scope (in / out)
4. Assumptions
5. AS-IS -> TO-BE Gap Analysis
6. Functional Requirements
7. Non-Functional Requirements
8. Data Model Impact
9. Risks / Constraints / Dependencies
10. Acceptance Criteria
11. Phased Delivery
12. Next Steps
```

## User story
```
US-<area>-<n>
As a <role key>, I want <capability> so that <business value>.
Actor/role: <clinic_admin|doctor|clinic_staff|platform_super_admin|custom>
Device: Tablet | Web | Both
Permission(s): <module.action codes>
Acceptance Criteria:
  - [ ] Given <context>, when <action>, then <observable result>
  - [ ] Negative: a role without <permission> gets 403 / control hidden
Exceptions: <edge cases>
Dependencies: <ids>
```

## Gap-analysis row
```
| ID | AS-IS | Gap / Risk | TO-BE | Priority | Owner-agent |
```

## Acceptance criteria (Given/When/Then)
```
AC-<n>: Given <precondition>, when <event>, then <measurable outcome>.
Include at least one negative/authorization case per protected feature.
```

## Solution-option comparison
```
Option A: <name>
  Pros:  ...
  Cons:  ...
  Risks: ...
  Complexity: L | M | H
Option B: <name> ...
Recommendation: <A|B> because <rationale tied to objective + NFRs>
```

## Risk register row
```
| # | Risk | Likelihood | Impact | Mitigation | Owner |
```

## Requirement matrix row
```
| Req ID | Description | Priority (Must/Should/Could) | FR ref | Permission | Status |
```
