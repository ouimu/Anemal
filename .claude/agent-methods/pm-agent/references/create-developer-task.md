# Create Developer Task

**Skill Description:** Translates an approved feature into a developer-ready task.

## Instructions
When creating a task for the `@dev-agent`, you MUST use the following output format:

```markdown
Task ID: <module>-<number>
Actor: <role>
Device: Tablet | Web | Both
Description: <what needs to be built>
Acceptance Criteria:
  @AC-<module>-<number>-1
  Scenario: <one behaviour>
    Given <state>
    When <one event>
    Then <observable outcome>
Dependencies: <task IDs>
```

**Constraints:**
- Every user story must specify the actor (Admin / Doctor / Staff).
- The device context MUST be specified (Tablet / Web / Both).
- Acceptance criteria MUST be Gherkin, per `.claude/standards/acceptance-criteria.md` — including the
  `@authz`, `@tenant` and `@validation` Scenarios for protected work — so `@qa-agent` can map one test
  to each Scenario.
