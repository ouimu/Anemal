# Analyst Q1 — Sessions ~Jun 1–11 (31 sessions in slice-1.json)

Scope: chronological quartile 1. Models used: mostly sonnet-4-6 (22 sessions), opus-4-8 (5), fable-5 (3). 114 tool errors total, 8 user interruptions, 4 hook blocks.

## Recurring intents

1. **"Update the HTML docs" ritual** — the single most repeated request. Variants: "Update our finished development progress to HTML" (cdcd8aea), "update HTML How to run to match with phase 2" (b326468a), "Please update the Upcoming work HTML" (adf358b8), "If development finished, please update the HTML upcoming task" (0ac20ea2), "update HTML upcoming work" (3e818c11), "Update all HTML pages in docs/" (1755d617), "update the HTML, how to run and upcoming work" (9af1a3d6), "Why HTML in docs/ -> The Upcoming Work page is not update, please update and add in gsd plan every time" (ca622e89). In 9af1a3d6 the user explicitly asks to make it a standing step of every plan/dev cycle. This intent later crystallized into the `anemal-HTML-updater` skill (present in current git status) — Q1 shows why.
2. **Phase-driven implementation with minimal steering** — "implement phase 3, always use CLAUDE.md as guideline", then long chains of "continue"/"Continue"/"yes" (0d256c31 ×10 prompts, 497d82fd ×14, d1aa1fbf). User drives by phase number, not feature description.
3. **Manually typed `@agent` delegation as plain text** — "@dev-agent Implement Session B — PDF Receipts. Load skill anemal-coding-rules..." (0ac20ea2), "@db-agent Implement Phase 1.5-A..." (3e818c11), "@dev-agent Implement Phase 1.5-B..." (8b652d2b), "@db-agent implement Task 1.1..." (ed4b0939), "@dev-agent Implement Session A — Screen Spec 03" (adf358b8). The user composes structured delegation prompts by hand, with skill names cited — a template they retype each time.
4. **Fixing the Claude setup itself** — "fix mcp MCP_DOCKER", "fix postgres" (e0ea1f99), "fix mcp github" / "why still show warning on MCP GITHUB" (3e818c11), "why sessionstart:startup hook error, please fix" + "Install Bun" (6d495cea), plus /doctor ×2, /mcp ×5, /plugin ×6, /reload-plugins ×3 (1e8e1e30, fc214dda, 4852dd3c).
5. **"What credentials do I log in with?"** — "What admin account and Password that use to login to verify", "should I use admin or superadmin?" (d1aa1fbf); "I cannot login using the Staff account... Invalid credentials" (497d82fd). Seed credentials are tribal knowledge re-asked per session.
6. **Heavy manual mode-switching** — /model ×13 and /effort ×9 across the slice (0d256c31, adf358b8, 497d82fd, 8b652d2b...), suggesting no settled model/effort default per task type.

## Friction & corrections

- **Fix-claimed-but-not-fixed loop (d1aa1fbf)**: "No, the admin URL now is /admin/dashboard and it's not redirect" → "it is not redirect yet, please fix". Two consecutive corrections after a claimed fix; no verification skill (superpowers:verification-before-completion) fired.
- **Paste-error-back loop (cdcd8aea)**: user runs `npm test` themselves, pastes the failure, Claude attempts, user pastes again: "still got error below PS ...". 34 tool errors in this one session, including flaky test reruns (Run 1: 2 failed / Run 2: 1 failed / Run 3: 1 failed...) — trial-and-error rerunning instead of systematic debugging.
- **Path disorientation after repo move**: project moved from `D:\...\AnimalClinic\AnimalClinic` (nested) to `D:\Development\AnimalClinic`. User asks "what is the home directory path now" / "what is this project home path" (cdcd8aea); Glob errors "Directory does not exist: D:\Development\AnimalClinic\AnimalClinic" (cdcd8aea); stale-path errors persist across sessions (12 path-notfound).
- **Doc-update distrust**: "Do you update 'How to run' and 'Upcoming Work' sections yet?" pattern — user re-checks doc updates after asking (also visible outside slice); in ca622e89 the user complains the Upcoming Work page was not updated despite prior instruction.
- **PR-creation friction (497d82fd)**: `<create-pr-command>` template pasted 3 times in one session, while `gh: command not found` and `mcp__github__create_pull_request` auth failed — the user retried the same broken path repeatedly.
- **Secret hygiene incident (3e818c11)**: user pasted a live GitHub PAT (`github_pat_11AAJCVCI0...`) in plaintext chat to fix MCP github auth — setup should have a safe credential path (env var / keychain), not chat paste.
- 8 interruptions across 7 sessions (0d256c31 ×2; cdcd8aea, b326468a, e0ea1f99, adf358b8, 0ac20ea2, 9af1a3d6 ×1), mostly followed by rephrased/corrective prompts.

## Skill usage gaps

- **The CLAUDE.md pipeline never ran in Q1.** Zero calls to /brainstorm, /grill, /write-plan, /execute-plan; zero Task-tool invocations of ba-agent, pm-agent, dev-agent, db-agent, qa-agent, ponytail-agent. Agent calls were 24× generic `Explore` + gsd-* agents. The user typed "@dev-agent ..." as text (ed4b0939 even asked "Please read the agents from ...\.claude\agents\"), and the main thread did the work inline. The elaborate router in CLAUDE.md was aspirational, not operational, during this period.
- **Mid-quartile pivot to the GSD plugin** (d637a5eb, 1755d617, 3a023918, 03f0afe6, d1aa1fbf, 6b8417a0, a4e6a4b9, ca622e89 — Jun 10–11): gsd-new-project/plan-phase/execute-phase/code-review with real subagents (gsd-executor, gsd-verifier, gsd-code-fixer). This effectively replaced the home-grown pipeline — evidence the custom pipeline was too heavy or not wired to actually execute.
- **Debugging without a debugging skill**: flaky-jest loop (cdcd8aea), login/redirect bugs (497d82fd, d1aa1fbf), UI color bugs (682c8964, 5fc10828) — none triggered systematic-debugging/diagnosing-bugs; all ad-hoc.
- **Anemal domain skills underused**: only anemal-coding-rules ×2, anemal-screen-specs ×1, anemal-db-context ×1 in 31 sessions — and mostly because the user manually said "Load skill X before starting".
- **Doc updates done by hand every time** despite being the top recurring ask — no skill existed yet (anemal-HTML-updater appears only later).

## Error patterns (with counts)

Total 114 tool errors. By tool: PowerShell 36, Bash 34, Edit 13, Write 7, ExitPlanMode 5, Read 4, preview_* 6, MCP github 2, misc 7.

1. **Cross-shell syntax confusion — ~15+**: PowerShell cmdlets run under bash: `Get-Content/Select-String/Write-Output: command not found` (e0ea1f99), `New-Item/Out-Null` (0ac20ea2), `$env:GOOGLE_API_KEY; if (-not ...)` parsed by bash (4852dd3c), `$null: ambiguous redirect` (ed4b0939); conversely Unix `tail` run in PowerShell (cdcd8aea). Plus backslash paths eaten by bash: `cd: D:DevelopmentAnimalClinicsrcbackend` (8b652d2b), `grep: D:DevelopmentAnimalClinicsrcbackendcontrollers*.ts` (d1aa1fbf), `ls: D:DevelopmentAnimalClinic.planningphases...` (a4e6a4b9).
2. **Edit/Write staleness — 20** (13 Edit + 7 Write/Read): "File has not been read yet", "File has been modified since read" (ed4b0939, b326468a, 8b652d2b), "String to replace not found" (0ac20ea2). Correlates with linters/hooks mutating files mid-edit.
3. **Path-not-found — 12**: mostly the nested-repo-path legacy (cdcd8aea, 497d82fd `HistoryLog.md`, ed4b0939, 8b652d2b).
4. **Toolchain not on PATH / environment gaps — ~10**: `jest is not recognized` + jest multiple-config error (cdcd8aea), `gh: command not found` (497d82fd), `claude: command not found` (6e46a05a), `psql` connecting to wrong socket / db "vetclinic" does not exist (497d82fd), git author identity unset (b326468a).
5. **MCP failures — 9**: GitHub MCP "Authentication Failed" on create_repository (b326468a) and create_pull_request (497d82fd); MCP_DOCKER config broken (e0ea1f99); Read InputValidationError (b326468a); Claude Preview stack failures — no launch.json, screenshot timeout, fill #email/#password failed, eval target closed (497d82fd).
6. **Hook blocks — 4**: two jest-run failures surfaced as hook blocks (cdcd8aea), auto-mode classifier denying force-remove of the persistent dev DB container (497d82fd — good save), bash hook `/c/Use: Permission denied` from an unquoted `C:\Users` path with space handling (adf358b8).
7. **Flaky tests — recurring**: cdcd8aea shows 6+ rerun batches with nondeterministic pass/fail counts (later memorialized as the supertest/Node-24 ECONNRESET memory note).

## Automation candidates

1. **HTML docs updater skill** — name: `anemal-HTML-updater` (since created; Q1 is the justification). Evidence: 8 sessions asking the same doc-update dance, plus explicit "add this step every time" (cdcd8aea, b326468a, adf358b8, 0ac20ea2, 3e818c11, 1755d617, 9af1a3d6, ca622e89). Remaining gap: verification — user still re-asks "did you update X yet"; the skill should print a per-page updated/skipped checklist.
2. **Delegation prompt template / real agent wiring** — the user hand-types "@dev-agent Implement ... Load skill X ... " repeatedly (ed4b0939, adf358b8, 0ac20ea2, 3e818c11, 8b652d2b). Either wire these as actual subagents (Task tool) or provide a slash command that expands the delegation template.
3. **Windows test-runner wrapper** — a skill/hook that runs backend jest the one correct way (`node node_modules/jest/bin/jest.js --runInBand` from src/backend, single config) and handles flaky reruns with a fixed protocol. Evidence: cdcd8aea (34 errors, jest-not-recognized, multiple-config, flaky reruns), 0ac20ea2, 8b652d2b TS/type errors surfaced only via ad-hoc shell.
4. **Dev credentials/seed reference** — a small skill or CLAUDE.md note answering "what account/password to log in as admin/superadmin/staff on the seeded dev DB". Evidence: d1aa1fbf, 497d82fd; likely recurs in later quartiles.
5. **MCP/plugin health-check runbook** — one command that validates MCP servers (github auth via env var, MCP_DOCKER, postgres), hooks, and Bun/claude-mem deps, instead of ad-hoc "fix mcp X" sessions. Evidence: e0ea1f99, 3e818c11 (incl. plaintext PAT paste), 6d495cea, 4852dd3c, 1e8e1e30, fc214dda.
6. **Session checkpoint/resume skill** — user manually pastes a "SESSION CHECKPOINT" template (adf358b8) and repeatedly resumes from compaction summaries (497d82fd, 3e818c11, 8b652d2b, c6b43fa1). A /checkpoint skill writing the resume file (per CLAUDE.md's own "interrupted work" rule) would remove the manual template.
7. **Preview launch config** — create `.claude/launch.json` once; 497d82fd shows the whole Claude Preview verification flow failing for lack of it (then screenshot/fill failures during manual login verification).
