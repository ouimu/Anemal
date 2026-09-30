# Generate Test Cases

**Skill Description:** Generates structured test suites covering happy paths, edge cases, and UI interactions.

## Instructions
When writing tests for a completed task, use the following output format:

```markdown
Test Suite: <module>-<task-id>
Test: <test name>
Given: <precondition>
When: <action>
Then: <expected result>
Type: happy_path | edge_case | security | ui
```

**Required Coverage per Task:**
1. Happy path.
2. Input validation failures (e.g., negative values for doses, empty fields).
3. Concurrent/Network edge cases (e.g., double-submit, network drop).
4. RBAC checks (e.g., staff attempting doctor-only actions).
