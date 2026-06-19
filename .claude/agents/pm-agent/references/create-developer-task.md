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
  - [ ] <criterion>
Dependencies: <task IDs>
```

**Constraints:**
- Every user story must specify the actor (Admin / Doctor / Staff).
- The device context MUST be specified (Tablet / Web / Both).
- Acceptance criteria must be explicitly testable by the `@qa-agent`.
