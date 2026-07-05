# Analyst Q2 — Sessions Jun 11–17 (31 sessions, slice-2)

Totals: 16 interruptions, 41 tool errors, 4 hook blocks, 11 `/clear`. All prompts in English this quartile (0 Thai prompts detected). 8 of 31 sessions are tiny (60–65 KB, no prompts) — opened-and-abandoned or teammate stubs.

## Recurring intents
1. **"Continue / what next" resume loop** — the single most common prompt shape: "what to continue" (0794b404), "what next ?" (2bfb3085), "continue remaining talk", "Continue wth all related agent" (dca6c18a), "CONTINUE" (0cd51154, 27a3cd5a), "What is the next phase ?" (5b789de2), "CONTINUE from where it left" (27a3cd5a). User treats Claude as a phase-execution machine and constantly needs it re-oriented to the roadmap.
2. **Paste-terminal-error-and-fix** — user runs `npm test` / `npx tsc --noEmit` / `npm run lint` / `npx prisma generate` in his own PowerShell, then pastes the raw output: 2a67dafe ("i ran npm test at src/backend and got error as below"), a1a75de5 (tsc errors, then lint warnings), 104acae7 (tsc seed.ts error), b786814f (prisma generate output).
3. **"Update the HTML docs in /docs"** — asked manually and repeatedly: 2a67dafe ("update HTML in docs/ folder, upcoming work, dashboard, etc."), 104acae7 ("update the Project DashBoard, the How to Run and The Upcoming Work HTML in docs/"), 74ab5b4a ("please update all documents including the HTML in /docs"). The user later built `anemal-HTML-updater` — this week shows why.
4. **"Delegate to all agents"** — near-every planning prompt says "please use all agents" / "please diligate [sic] work to all agent" / "dedecate all agents" (104acae7, 74ab5b4a, 2a67dafe, 0cd51154). Recurring typo "diligate" shows it's a muscle-memory phrase.
5. **Tooling housekeeping** — /doctor fixes (a078e655), skill-listing truncation warning fix (981ec67d), plugin removal "please remove GSD" (05853edc), caveman mode toggling (876b0c98, 80566d5e, fb9828d5, a1a75de5).

## Friction & corrections
- **Teammate-notification interrupt storm** — ed13e1e9 (1.99 MB, 43 prompts, 2 compactions) logged 10 interruptions; drill-down shows nearly all were `teammate-message` idle notifications from parallel sessions (pre6-audit-writes, ba-t5f) landing mid-turn and cutting off the main session's work. Multi-session parallelism generates noise that reads as "interrupted by user" and forces manual "continue".
- **Forgotten doc step** — ed13e1e9: "do you forgot to update the document ?" — pipeline Step 8 (doc update) was skipped and the user had to police it.
- **Rerun churn on parallel workflows** — 74ab5b4a: "Rerun the workflow… T-5F-01 QA hit session limit (re-run needed)", then "rerun t5f-parallel", then "rerun t5f-parallel, please do only the task that is not finished yet." Three escalating re-asks because the parallel dispatch had no checkpoint/idempotency.
- **Repeat test-failure paste** — 2a67dafe: fix attempt, then "still got fail as follow" with the same test file — fix loop ran through the user's terminal instead of Claude verifying itself.
- **Workflow reset** — 05853edc "please remove GSD" (Jun 13): mid-quartile the user ripped out the GSD plugin pipeline (used Jun 11–12: e516a46e, d8691fca, 0794b404, 50b56431) and switched to the Superpowers + custom agent pipeline — a full methodology migration in one week.
- **Context exhaustion** — 4 sessions hit auto-compaction / "continued from a previous conversation" (104acae7, ed13e1e9, 27a3cd5a, 74ab5b4a); 981ec67d shows "Skill listing will be truncated, 50 descriptions dropped" — the plugin stack itself eats context.

## Skill usage gaps
- **Ponytail gate never ran** — 0 ponytail-agent calls in 31 sessions despite CLAUDE.md making it a mandatory gate before execute-plan. `/superpowers:writing-plans` fired 3x (2a67dafe, 104acae7, 74ab5b4a) and execution proceeded directly.
- **No brainstorm / grilling** — 0 `brainstorming` and 0 `grilling`/`grill-with-docs` invocations; write-plan was invoked cold with pasted phase specs (104acae7, 74ab5b4a). The mandatory Step 1/1.5 gates existed on paper only.
- **Debugging done ad hoc** — repeated test/tsc failure fixing (2a67dafe, a1a75de5, 104acae7) never triggered `systematic-debugging`/`debug` skills; fixes were freehand.
- **execute-plan skill unused** — execution went through raw Agent dispatch (dev-agent 31x, pm-agent 12x, qa-agent 11x) rather than `superpowers:executing-plans`; only dca6c18a used `subagent-driven-development`.
- **Skills that DID fire**: gsd-* (5x, pre-removal), anemal-coding-rules (2x), update-config (2x), verify (1x), writing-plans (1 recorded skill call), dispatching-parallel-agents (1x, 74ab5b4a).

## Error patterns (41 total)
| Category | Count | Representative |
|---|---|---|
| cmd-exit-nonzero (misc build/test) | 13 | 0794b404: npm ERESOLVE; `$null: ambiguous redirect` (PowerShell idiom run in bash) |
| Windows-backslash paths fed to bash `cd` | 4 | e516a46e/d8691fca/50b56431: `cd: D:DevelopmentAnimalClinicsrcbackend: No such file` (backslashes eaten) |
| Wrong-path guesses (cwd confusion) | 5+4 "other" | d8691fca: `prisma/schema.prisma` assumed at repo root (it's under src/backend); dca6c18a: doubled `src/backend/src/backend/`; ed13e1e9: `cd src/frontend` from wrong cwd |
| Edit-tool mismatch | 2 | a078e655: old_string not found (note: the edit embedded a GitHub PAT in settings — secret-in-config signal); 74ab5b4a: file-not-read-first |
| Hook blocks | 4 | 50b56431/dca6c18a: git CRLF warnings escalated to blocking exit codes; 8ace09c5: user rejected a tool use; 74ab5b4a: grep/sed on non-existent hook file |
| Misc tool errors | remainder | 0794b404: SendUserFile pointed at `/tmp/pw-verify/...` which doesn't exist on Windows |

Cross-cutting: the dominant error family is **shell/path dialect confusion on Windows** (bash-with-backslash paths, PowerShell `$null` in bash, `/tmp` paths) — roughly 10 of 41 errors.

## Automation candidates
1. **"next-task" resume skill** — reads roadmap/plan state and answers "what next / continue" deterministically. Evidence: 2bfb3085, 0794b404, dca6c18a, 0cd51154, 27a3cd5a, 5b789de2 — at least 8 continue-style prompts across 6 sessions.
2. **Docs/HTML updater as post-QA hook** (later realized as anemal-HTML-updater) — user manually chased pm-agent to update docs/ HTML 3+ times and once caught it forgotten. Evidence: 2a67dafe, 104acae7, 74ab5b4a, ed13e1e9 ("do you forgot to update the document ?").
3. **Test/tsc/lint verify-in-loop skill** — run `npm test`, `npx tsc --noEmit`, `npm run lint` inside the session instead of the user pasting terminal output; would kill the paste→fix→"still got fail" cycle. Evidence: 2a67dafe, a1a75de5, 104acae7, b786814f.
4. **Checkpointed parallel-workflow rerun** — parallel agent dispatch (T-5F) needs a state file so "rerun only unfinished" is automatic, not typed 3 times. Evidence: 74ab5b4a; teammate idle-notification interruption noise in ed13e1e9 is the same underlying gap.
5. **Windows path/shell guard** — a PreToolUse hook or CLAUDE.md rule converting `D:\...` backslash paths to forward slashes for Bash and rejecting PowerShell idioms in bash. Evidence: e516a46e, d8691fca, 50b56431, 0794b404, ed13e1e9 (~10 errors).
6. **(Hygiene) secret handling** — a GitHub PAT appeared inline in an Edit to settings (a078e655); worth a guard.
