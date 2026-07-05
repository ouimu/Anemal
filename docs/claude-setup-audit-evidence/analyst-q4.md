# Analyst Q4 (Jun 25 – Jul 5) — 31 sessions in slice-4 + 2 IPT sessions

## Recurring intents

1. **Feature pipeline runs (brainstorm → grill → write-plan → execute)** — 5 feature threads:
   - Dashboard redesign (89d71422, 28aa8c27, 69fe9695, 0ce26e0a) — Thai prompt: "top-left corner: change app name to company name, show branch below…"
   - Company-admin branch bypass (a1706606, 6cd09264)
   - Idle logout (f16f5f6e, f5ffecab, 2f15f30e) — feature born mid-grill of branch-bypass: "can we add idle time to logout for all roles, e.g. 30 min?"
   - Pets & Owner UI fixes + Owner ID-card field (2f15f30e, 0a4575de, 21c01d36, 8ae1e6a3, b59404d7)
2. **"Update all documents" / HTML docs** — repeated asks ("please update all documents" ×2, "Update HTML document in /docs", "Do you update 'How to run' and 'Upcoming Work' yet?") in 001019ed (Jun 24) plus Step-8 HTML-updater in 2f15f30e.
3. **Resume ritual** — literal repeated prompt "Read CLAUDE.md. Continue interrupted workflow (on Task 2)" (1a64a86b, 69fe9695, 28aa8c27); "/executing-plans start from task 6 / task 10" (0ce26e0a).
4. **Claude-setup housekeeping** — statusline configuration/removal (c7af28ad, a4bd0b0b, afb06bb0, c3aab723, 76a62ff5, 1ecd689c, 158745ab, 45d9345d, 4dbb8f4d), plugin reloads (e30ba330, a4bd0b0b, 5777c4be), config audits "recheck all my config global+local, clean unused, keep claudemem/caveman/ponytail without conflict" (45d9345d), fix ponytail spawnability (986ceda6), fix classifier/plugin (0a4575de, 0a34de43). ~11 of 31 sessions are setup maintenance, not product work.
5. **"Test it for me"** — asks for QA runs, test credentials, docker postgres start, smoke tests, and data cleanup in Thai ("clear branch data down to 2 branches for easier testing") (2f15f30e, 21c01d36, f5ffecab).
6. **Caveman mode re-enabled per session** (e30ba330, c7af28ad ×2, 0a4575de) — not persistent.
7. **IPT project (signals-ipt)**: meta-work — validate/reorganize agent+skill markdown into a generic reusable project template; split an oversized CLAUDE.md (2da3d137, c0867999). Same setup-curation theme.

## Friction & corrections

- **"Why cannot use Agent?"** — the dominant frustration. User quotes the failure back verbatim: "Why got this message when running QA by agent: Still blocked by the same recurring harness-level issue" (f5ffecab); "why fail? Failed to implement Task 6" (8ae1e6a3); "Agent dispatch fully blocked this session (context-mode injection pattern, matches known idle-logout precedent)… Why cannot use Agent ?" (b59404d7); "subagent-spawn issue will likely recur, please help to fix the classifier/plugin situation first" (0a34de43, 0a4575de).
- **Skill not loadable mid-pipeline**: "The Superpowers writing-plans skill isn't loadable in this session, why ?? Please fix" (89d71422, 2× `Unknown skill` errors) — forced a new session (28aa8c27) to run /writing-plans.
- **Flashing terminal window saga** (Jul 1–4, ≥6 sessions): user re-asked at least 4 times in different sessions to find/remove whatever spawns terminal popups (76a62ff5, 1ecd689c, 158745ab, 4dbb8f4d); root cause statusline command on Windows; final fix attempt itself classifier-blocked ([Security Weaken], 45d9345d). Statusline was configured (c7af28ad, a4bd0b0b), cleared (afb06bb0 "Yes remove it entirely"), reconfigured (c3aab723), converted json→.njs (76a62ff5), removed again (1ecd689c).
- **PR creation retried 3×**: create-pr-command sent three times in f5ffecab, plus "can you do for me ?" — blocked by gh CLI missing from bash PATH / not authenticated / "No commits between main and feature/idle-logout".
- **"Can you break now ?"** (28aa8c27) and "reload claude.md" ×2 back-to-back (21c01d36) — user nudging a stalled/looping orchestrator.
- **Change-of-mind during brainstorm** ("Can I change my mind for the previous question to use Option B…", a1706606) — normal, but shows long A/B interview chains (20+ single-letter "A"/"B" replies per feature in 89d71422, a1706606).

## Skill usage gaps (pipeline compliance)

- **Steps followed well**: /brainstorm, /grill(-me/-with-docs), /write-plan sequence honored in all 5 feature threads (89d71422, a1706606, f16f5f6e, 2f15f30e, 0a4575de).
- **Step 3 ba-agent sign-off mostly skipped**: ba-agent spawned only in f16f5f6e and 2f15f30e; dashboard-redesign and idcard threads went brainstorm→grill→plan with no BA gate.
- **Step 5 Ponytail gate broken by tooling**: `Agent type 'ponytail-agent' not found` ×2 (0a4575de); user had to ask "fix the @ponytail-agent spawnable" (986ceda6) — fix created `.claude/agents/ponytail-agent.md` (still untracked in git status). Ponytail did run in 0a4575de, 986ceda6, 21c01d36 after fixes.
- **Step 7 qa-agent inconsistent**: used in f5ffecab, 21c01d36 and on request in 2f15f30e, but the idle-logout QA fell back to inline review when the agent spawn was classifier-blocked — pipeline mandate silently degraded to manual work.
- **Step 8 anemal-HTML-updater fired once** (2f15f30e) across 5 completed features; doc updates otherwise triggered by manual "please update all documents" prompts.
- **Execution fragmented across sessions**: dashboard-redesign execution spans 4 sessions (28aa8c27 → 1a64a86b → 69fe9695 → 0ce26e0a) with compactions and manual resume prompts; no persistent state file despite CLAUDE.md mandating "save resume state to file".
- **Idle-logout post-mortem (Jul 1–2)**: f16f5f6e (plan) → f5ffecab (execute, 3 MB) → 2f15f30e (10 MB mega-session). What went wrong: (1) all dev/QA subagent dispatches blocked by auto-mode classifier flagging the context-mode plugin's injected `context_window_protection` block as prompt-injection ([Auto-Mode Bypass]/[Data Exfiltration]) — 8 blocked Agent calls in f5ffecab alone, work re-done inline by 11 `general` agents; (2) PR/merge ritual failed: gh not on PATH, gh not authenticated, github MCP auth failed, then direct merge/push to main classifier-blocked ([Merge Without Review], [Git Push to Default Branch]); (3) merge left 22 failing test files → a second "create plan to fix 22 test files and merge all" cycle inside 2f15f30e; (4) manual browser QA via claude-in-chrome burned ~30 failed tool calls (frozen-renderer screenshots, malformed form_input). One feature ≈ 14 MB of transcript, three overlapping sessions re-doing plans/PRs.

## Error patterns (with counts)

| Category | Count (slice-4) | Representative | Sessions |
|---|---|---|---|
| Auto-mode classifier blocks Agent spawn (context-mode `context_window_protection` injection flagged as Auto-Mode Bypass / Data Exfiltration) | 17 blocked calls | "sub-agent dispatch prompt contains an injected 'context_window_protection'…" | f5ffecab(8), 2f15f30e(4), 0a4575de(2), 21c01d36(2), + total blocks reported in b59404d7, 8ae1e6a3 |
| Classifier blocks on self-fix attempts ([Self-Modification]/[Security Weaken] editing plugin hooks.json, settings.json, agents/*.md) | 6 | "Editing a plugin's hooks.json that controls agent routing…" | 0a34de43(2), 0a4575de(2), 45d9345d(1), 158745ab hook(1) |
| claude-in-chrome browser QA failures (CDP screenshot timeout 13, form_input bad JSON 6, cross-extension URL 3, misc) | ~30 | "Page.captureScreenshot timed out after 30000ms — renderer frozen" | 2f15f30e |
| Edit/Write "File has not been read yet" | 12 | — | 28aa8c27, 69fe9695, 0ce26e0a, a1706606(2), f5ffecab, 2f15f30e(2), 21c01d36(2), 4dbb8f4d |
| Git-destructive / merge-review classifier blocks | 5 | "[Git Push to Default Branch] Pushing merge-final-tmp:main…" ; "[Cloud Storage Mass Delete] deleting branches" | f5ffecab(2), 2f15f30e(3) |
| gh CLI missing from Git-Bash PATH / not authenticated (+ github MCP auth/NotFound) | 7 | "bash: gh: command not found"; "You are not logged into any GitHub hosts"; MCP -32603 Auth Failed | f5ffecab |
| Windows path mangling in bash (backslashes stripped: `D:DevelopmentAnimalClinicsrcbackend`) + wrong cwd `cd` failures | 5 | "ls: cannot access 'D:DevelopmentAnimalClinicdocssuperpowersplans'" | 28aa8c27, 0ce26e0a, 1a64a86b, 1ecd689c |
| PowerShell-vs-Unix command confusion | 1 (+ PS exit-1 noise 4) | "tail : not recognized as cmdlet" | 69fe9695, f5ffecab |
| Hook block: standalone `sleep` forbidden | 2 | "Blocked: standalone sleep 35, use Monitor" | f5ffecab, 21c01d36 |
| Skill registry stale (`Unknown skill: superpowers:writing-plans`) | 2 | — | 89d71422 |
| Agent type not found (ponytail-agent) | 2 | — | 0a4575de |
| claude-mem MCP API errors (worker 400 / wrong runtime) | 2 | "observation_search requires CLAUDE_MEM_RUNTIME=server-beta" | 0a34de43 |
| Grep uv_spawn EUNKNOWN | 2 | — | 6cd09264 |
| Model temporarily unavailable (auto-mode can't classify) | 3 | — | 69fe9695, 2f15f30e(2) |

Hook blocks total: 30 across f5ffecab(11), 2f15f30e(8), 0a4575de(4), 21c01d36(3), 0a34de43(2), 45d9345d(1), 158745ab(1).

## Automation candidates

1. **Resolve context-mode ↔ auto-mode classifier conflict** (highest impact). Evidence: 17 blocked Agent dispatches + user asked twice to "fix the classifier/plugin situation" and the fix itself was blocked. Options live outside source code: stop context-mode's PreToolUse hook from injecting into Agent prompts, or run agent-heavy sessions with the plugin disabled. Sessions: f5ffecab, 2f15f30e, 0a4575de, 0a34de43, 21c01d36, 8ae1e6a3, b59404d7.
2. **"finish-branch" skill: commit → push → gh-auth preflight → PR → post-merge test-suite check.** Evidence: create-pr-command retried 3×; gh missing/not authed; merge-to-main blocked; 22 broken tests discovered only after merge, spawning a whole repair cycle. Sessions: f5ffecab, 2f15f30e. Preflight `gh auth status` + PATH check alone would have saved an hour.
3. **"resume-plan" skill/hook.** Evidence: hand-typed "Read CLAUDE.md. Continue interrupted workflow on Task 2" in 3 sessions (1a64a86b, 69fe9695, 28aa8c27) and "/executing-plans start from task N" (0ce26e0a, 6cd09264 "skip the complete task"). CLAUDE.md already mandates a resume-state file — nothing writes it. A SessionStart hook that reads plan checkboxes and offers "continue from task N" would replace this.
4. **"local-stack-for-testing" skill: docker postgres up + seed + print test users/passwords + 2-branch dataset.** Evidence: "Can you start postgres in docker for me?" (21c01d36), "give me username and password to test" / "So, if I want to test, how can I do" (2f15f30e), Thai request to trim seed data to 2 branches (2f15f30e), "check user password and role to test" (001019ed, Q3/Q4 boundary).
5. **Windows statusline known-good preset (or leave it off).** Evidence: 9 sessions of configure/clear/reconfigure across Jul 1–4 chasing flashing terminal popups (c7af28ad, a4bd0b0b, afb06bb0, c3aab723, 76a62ff5, 1ecd689c, 158745ab, 45d9345d, 4dbb8f4d). Any statusline command on Windows must avoid spawning a visible console (use a non-console host or none).
6. **Doc-update (Step 8) auto-trigger.** Evidence: manual "please update all documents" prompts (001019ed) while anemal-HTML-updater ran only once (2f15f30e) across 5 features. A Stop-hook reminder or making qa-agent sign-off chain into the HTML-updater would close the loop.
7. **Persistent caveman preference.** Evidence: /caveman full re-invoked per session (e30ba330, c7af28ad ×2, 0a4575de) — one line in settings/output-style would remove the ritual.
8. **Grill answer ergonomics (minor).** 20+ single-letter "A"/"B" turns per feature (89d71422, a1706606) — the grill skills could batch options into numbered multi-choice rounds to cut round-trips.
