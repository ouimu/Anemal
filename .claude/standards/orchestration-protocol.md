# Orchestration Protocol — Anemal

> **Who is the orchestrator:** the main session — not a subagent, not `@pm-agent`.
> **Why this file exists:** an orchestrator with nothing concrete to check is just vibes. Every item
> below is verifiable. Read it when coordinating a pipeline run; agents do not need it.

---

## 1. The contract — four moves, every step, no exceptions

```
1. PRE    inputs complete?  the previous gate actually passed?  every file to be read exists?
2. BRIEF  send: agent · task · specs/skills to load · exact output path · file scope (Step 6)
3. POST   output produced as briefed?  paths it cites exist?  gate passed or failed — state which
4. LOG    write the result into docs/superpowers/plans/HANDOFF-<slug>.md before the next step
```

At Step 3.4b and Step 5, LOG also means carrying `@ponytail-agent`'s `LEDGER |` line forward so
`@scribe-agent` can file it at Step 8. The P4 retro is decided from those counts, and a verdict that
was only ever spoken is a verdict nobody can count.

PRE is what catches a reference to a file that no longer exists — the failure that let a deleted spec
sit referenced in four agent definitions for weeks.
LOG makes the handoff rule a rhythm rather than something remembered at the end.

---

## 2. Per-step table — feature pipeline (Lane A)

| Step | PRE — must exist first | Call | POST — passes when |
|------|------------------------|------|--------------------|
| 1 | a request from the human | `@pm-agent` + `@ba-agent` | human approves the brainstorm output |
| 2 | brainstorm output | `@pm-agent` | acceptance criteria are testable |
| 3 | task list + AC | `@ba-agent` | BA sign-off file written |
| 3.4 | BA sign-off · trigger threshold met (`.claude/agents/arch-agent/SKILL.md` §0) | `@arch-agent` | arch doc written — Brief or full — with a frozen contract section |
| 3.4b | arch doc | `@ponytail-agent` mode `arch-precheck` | verdict is not `BLOCK` |
| 3.5 | arch doc + BA sign-off | human + `@ba-agent` (`/grill-with-docs`) | every finding resolved or recorded |
| 4 | grill record | `@pm-agent` | plan **and** work-partition manifest written |
| 4b | plan + manifest | `@scribe-agent` pre-check | no dangling reference; branch name conforms |
| 5 | arch doc + plan | `@ponytail-agent` mode `gate` | APPROVE on all 9, no arch↔plan drift |
| 6 | manifest | W0 `DBA` → W1 `Dev A` ∥ `UIUX A` ∥ `Dev B` → W2 `Dev B` | every wave clears the checkpoint (§3) |
| 7 | code complete | `@qa-agent` | `/code-review` findings closed + QA sign-off |
| 8 | QA sign-off | `@scribe-agent` | PR merged and `main` verified green |

Skipping a step is a pipeline violation: restart from the step that was skipped.

Lanes B, C and D use the same four moves with fewer rows — see the `anemal-dev-lanes` skill.

---

## 3. Step 6 — waves and the integration checkpoint

Parallel work is safe only because `@arch-agent` froze the contract at Step 3.4. **No frozen contract
→ do not parallelise; run the tasks in sequence.**

```
W0  DBA                       migration + repository signatures   (only if the schema changes)
W1  Dev A ∥ UIUX A ∥ Dev B    backend · screen spec · frontend shell against the frozen contract
W2  Dev B                     wire the frontend to the real API
```

At the end of **every** wave, the orchestrator runs — not an agent:

1. typecheck the whole project
2. run the tests covering what changed
3. **files actually modified ⊆ files the manifest allows** — anything outside its lane's scope stops
   the run until explained
4. **signatures as written == the contract in the arch doc** — a mismatch is drift: fix the code or
   amend the arch doc *before* the next wave

Checks 3 and 4 are what stop "parallel and fast" from becoming "parallel and rebuilt".

**File ownership:** one owner per file per wave. Two tasks needing the same file must merge into one
task or move to different waves. One branch, disjoint file sets — do not create a worktree per worker.

---

## 4. Conflict routing — the orchestrator does not decide content

| Dispute | Decided by |
|---------|------------|
| business rule, permission, who-may-do-what | `@ba-agent` |
| structure, pattern, contract shape | `@arch-agent` |
| tenant isolation, query safety | `@db-agent` — **veto, not overrulable** |
| scope, priority, what ships this phase | `@pm-agent` |
| "is this too much?" | `@ponytail-agent` |
| test adequacy, RBAC verification | `@qa-agent` |
| architecture versus simplicity | **the human** — not `@pm-agent` |

---

## 5. Briefing template

```
Agent:    @<name>            (Step 6: label — DBA | Dev A | Dev B | UIUX A)
Task:     <one sentence>
Load:     <skills / standards / spec paths — each must exist>
Contract: <the frozen signatures this work must match, if Step 6>
Files:    <exclusive write scope from the manifest>
Output:   <exact path to write>
Done when: <the POST condition from §2>
```

A brief without `Output` or, in Step 6, without `Files`, is incomplete — do not send it.
