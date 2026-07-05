# Claude Setup Audit — Diagnosis (2026-07-05)

Scope: 124 AnimalClinic sessions (Jun 5 – Jul 5) + 2 InitalProjectTeam sessions, analyzed by 4 sub-agents over extracted signals (per-quartile reports: `analyst-q1..q4.md` in session scratchpad), plus full config-conflict scan (global `~/.claude` + project `.claude`).

Aggregate: 603 user prompts, 66 Skill calls, 329 Agent calls, 345 tool errors.
**Status: DIAGNOSIS ONLY — nothing has been changed.**

---

## Part 1 — Cross-session clusters & verdicts

### Cluster A — Pipeline gates exist on paper only → **FIX (enforce via hooks, shrink pipeline)**
- Q1 (Jun 5–11): pipeline never ran. User hand-typed `@dev-agent ...` as plain text; main thread did work inline (ed4b0939, adf358b8, 0ac20ea2, 3e818c11, 8b652d2b).
- Q2: zero ponytail/brainstorm/grill across 31 sessions while `/writing-plans` ran 3× and execution proceeded anyway (104acae7, 74ab5b4a, 2a67dafe).
- Q3: ponytail-agent 0 invocations despite 4+ plan executions; grilling fired once — only after user manually edited CLAUDE.md (7aef4fd8, baeedd17).
- Q4: pipeline partially honored, but ba-agent sign-off skipped, ponytail-agent unspawnable ("Agent type not found", 0a4575de), Step 8 ran 1 of 5 features.
- Diagnosis: prose rules in CLAUDE.md don't self-enforce, and an 8-step mandatory pipeline is heavier than actual usage supports. Two options (pick one):
  1. Enforcement: PreToolUse hook that blocks `/execute-plan` unless gate marker files exist (grill report, ponytail APPROVE).
  2. Right-size: cut pipeline to the steps that demonstrably happen (brainstorm → grill → write-plan → execute → QA) and drop the rest.
- Also fix: `.claude/agents/ponytail-agent.md` vs `.claude/agents/ponytail-agent/` duplication that made the agent unspawnable.

### Cluster B — "Update the HTML docs" ritual → **AUTOMATION (trigger, not new skill)**
- Asked manually in 8 Q1 sessions (cdcd8aea, b326468a, adf358b8, 1755d617, …), caught forgotten in Q2 ("do you forgot to update the document?" — ed13e1e9), recurring broken-HTML fix loops in Q3 (001019ed, 69214d25, df8c0684), ran once in 5 features in Q4.
- `anemal-HTML-updater` skill already exists but never triggers by itself.
- Verdict: don't write a new skill — wire the existing one into branch finishing (Cluster F skill calls it as final step), and add a verification checklist to its output (links resolve, sections updated).

### Cluster C — Windows shell-dialect errors → **FIX (docs/config), no skill**
- ~25% of all tool errors: bash-isms in PowerShell (`head`, `&&`, heredocs), PowerShell cmdlets under bash (`Get-Content: command not found`), backslash paths eaten by bash (`cd D:DevelopmentAnimalClinic...`) — e0ea1f99, 8b652d2b, d1aa1fbf, e516a46e, d8691fca, 50b56431, 5aa5839e, b5b24540, 85537386.
- Verdict: add a short "shell rules" block to CLAUDE.md (POSIX → Bash tool with forward slashes; PowerShell tool for Windows-native; never mix). Cheap, kills the biggest error class. A hook rewriting commands = over-engineering.

### Cluster D — context-mode hook vs safety classifier → **FIX (highest-leverage config change)**
- context-mode's PreToolUse hook injects its `context_window_protection` block into subagent prompts; classifier flags it ([Auto-Mode Bypass]/[Data Exfiltration]) and blocks Agent dispatch — 17 blocked spawns (f5ffecab×8, 2f15f30e×4, 0a4575de, 21c01d36); b59404d7/8ae1e6a3 fully blocked. Fix attempts themselves blocked as [Self-Modification].
- This single conflict caused most of the Jul 1–2 idle-logout cascade (see Cluster F).
- Verdict: disable context-mode's PreToolUse injection (or the plugin entirely — see Cluster M). Nothing else on the list pays back faster.

### Cluster E — Statusline / flashing-terminal saga → **FIX (finish the migration)**
- 12 sessions burned across Q3+Q4 (6fc2e624, 5a075e72, 8241865e, 76a62f5, 1ecd689c, 158745ab, 4dbb8f4d, …). Node statusline (`statusline-command.mjs`) already fixed the main issue.
- Residue: `patch-ponytail-windows.ps1` still runs via `powershell.exe` on every SessionStart (itself a window flash + prints noise into session context) and is now redundant — `statusline-command.mjs` already renders the ponytail segment, so the `.mjs` file the patch creates is used by nothing. `hooks/combined-statusline.ps1` is orphaned.
- Verdict: remove the ps1 SessionStart hook from global settings, delete/park both orphan scripts. If ponytail's own hooks.json still needs the Get-Command patch after plugin updates, port that one regex to a node script.

### Cluster F — PR / finish-branch ritual keeps failing → **NEW SKILL: `anemal-finish-branch`**
- gh not on bash PATH, gh unauthenticated, github MCP auth failure — PR creation failed 3× in one feature (Q4, idle-logout); S66 blocked entirely on gh auth; post-merge left 22 failing test files that spawned a whole new plan cycle (2f15f30e, 10 MB session).
- Verdict: one skill that does preflight (gh auth status, remote, branch state) → run tests → create PR → after merge, verify main is green → call anemal-HTML-updater (Cluster B). Replaces the most expensive repeated failure in the corpus.

### Cluster G — "continue / what next" resume ritual → **NEW SKILL (small): `resume-work`**
- 8+ resume prompts in Q2 (2bfb3085, 0794b404, dca6c18a, 0cd51154, 27a3cd5a, 5b789de2), manual handoff pastes in Q3 (b5b24540, 4464650d, 85537386), hand-typed "Read CLAUDE.md. Continue interrupted workflow" in Q4 (3 sessions).
- Verdict: tiny command skill that reads `docs/superpowers/plans/*.md` checkboxes + git status and states the next task. No new state files — plans are already the state.

### Cluster H — Role-based smoke walkthrough → **NEW SKILL: `anemal-smoke-walkthrough`**
- Requested 6+ times in near-identical words: "login as Staff/Doctor/Admin/Platform admin, walk every page, report errors" (5a44558b, d68b3697, df8c0684, 5f646d53, 89b38fc3).
- Related: ~30 failed claude-in-chrome QA calls (frozen renderer screenshots) in Q4 — the skill should standardize on `preview_*` tools instead.
- Verdict: skill encoding the role matrix, test credentials, page list, and error-report format.

### Cluster I — Manual verify loop → **NO NEW THING (enforcement problem, folds into A/F)**
- User runs `npm test`/`tsc`/`lint` in his own terminal and pastes output, incl. "still got fail" re-pastes (2a67dafe, a1a75de5, 104acae7, b786814f); claimed fixes that weren't (d1aa1fbf "it is not redirect yet, please fix" ×2).
- `superpowers:verification-before-completion` exists but doesn't fire. Verdict: covered by Cluster A enforcement + Cluster F preflight; no separate artifact.

### Cluster J — Setup maintenance eats sessions → **FIX (cleanup batch, see Part 2)**
- ~11 of 31 Q4 sessions were Claude-setup maintenance; whole Q1 sessions on MCP fixing; skill-listing truncation warning (981ec67d) shows the plugin stack itself eats context.
- Verdict: the Part 2 cleanup list below is the fix; no skill.

### Cluster K — Credentials in chat → **FIX (security)**
- Live GitHub PAT pasted in plaintext chat (3e818c11) and inline into a settings Edit (a078e655). Both tokens should be considered exposed → revoke/rotate, keep only `${GITHUB_TOKEN}` env references.
- `settings.local.json` grants `Read(//c/Users/ouimu/**)` — whole home dir read allow. Narrow it.

### Cluster L — Methodology churn (GSD → Superpowers → custom) → **NOTHING (already settled), but delete residue**
- Jun 10–13: pivot to GSD (d637a5eb, d1aa1fbf), then "please remove GSD" (05853edc). 33 dead `gsd-*` agents still in `~/.claude/agents/` polluting every session's agent list. Delete them.

### Cluster M — Four overlapping memory systems → **DECISION NEEDED (recommend: keep one)**
- claude-mem (PostToolUse `*`, spawns bash+node per tool call), context-mode (PreToolUse+PostToolUse on ~everything, bun), built-in auto-memory (MEMORY.md), productivity plugin memory. Every tool call pays 2 hook spawns; every prompt pays caveman+ponytail+claude-mem UserPromptSubmit hooks.
- Recommendation: keep **claude-mem** (its observations were demonstrably useful in prompts) + built-in auto-memory; disable **context-mode** (also resolves Cluster D). If you value ctx sandbox tools, keep the MCP server but strip its hooks.

---

## Part 2 — Configuration conflicts (global vs project)

| # | Conflict | Where | Impact | Fix (not applied) |
|---|----------|-------|--------|-------------------|
| 1 | context-mode PreToolUse prompt injection vs safety classifier | plugin hooks.json | Blocks Agent dispatch (17×), blocked its own fix | Disable context-mode hooks or plugin (Cluster D/M) |
| 2 | `patch-ponytail-windows.ps1` SessionStart hook | `~/.claude/settings.json` | powershell window flash + noise every session; redundant with node statusline | Remove hook entry; delete script or port to node |
| 3 | Orphan statusline scripts | `~/.claude/hooks/combined-statusline.ps1`, caveman/ponytail `*.ps1` | Dead code, confusion (3 statusline generations coexist) | Delete orphans; keep only `statusline-command.mjs` |
| 4 | claude-mem PostToolUse `*` + context-mode PostToolUse big matcher | both plugins | 2 process spawns per tool call on Windows; double capture | Pick one memory plugin (Cluster M) |
| 5 | Project `settings.json` uses legacy keys (`allowedTools`, `bash.allowedCommands`, `contextPaths`, `_comment_agents`) | `.claude/settings.json` | Silently ignored by current Claude Code → intended allows never apply → permission prompts → junk piles into `settings.local.json` (hyper-specific one-off grep allows) | Migrate to `permissions.allow` syntax; prune local junk (or run /fewer-permission-prompts) |
| 6 | Grilling skill ×3: global skills `grilling`, `grill-me`, `grill-with-docs` + project command `grill-me.md`; CLAUDE.md references both `/grilling` and `/grill-with-docs` | global + project | Ambiguous trigger; pipeline docs point at two different names | Keep one (grill-with-docs per CLAUDE.md), delete/alias others, make CLAUDE.md consistent |
| 7 | Review skill ×6: built-in `review`/`code-review`, global `review` skill, `caveman-review`, `ponytail-review`, `engineering:code-review` | global + plugins | "review" request routes unpredictably | Decide canonical (/code-review); note others as specialized |
| 8 | 33 dead `gsd-*` agents | `~/.claude/agents/` | Agent-list bloat in every session; plugin was removed Jun 13 | Delete `gsd-*.md` |
| 9 | `ponytail-agent.md` + `ponytail-agent/` dir both in project agents; name-collides with ponytail plugin | `.claude/agents/` | "Agent type not found" (0a4575de) broke the mandatory gate | Keep one definition; consider renaming to `simplicity-gate` |
| 10 | Ponytail plugin philosophy (build less, skip steps) vs CLAUDE.md 8-step mandatory pipeline | prompt level | Model gets contradictory standing orders every session — plausibly contributes to gate-skipping (Cluster A) | Scope ponytail to implementation style, or exempt pipeline gates explicitly in CLAUDE.md |
| 11 | Global `model: sonnet` vs CLAUDE.md router (fable for ba/qa, opus for grilling/ponytail) | settings vs CLAUDE.md | Router table aspirational unless agent frontmatter sets model | Set `model:` in agent .md frontmatter or fix table |
| 12 | MCP duplication: filesystem MCP (native tools cover it), postgres MCP vs psql, github MCP vs gh CLI — both github paths failed auth at different times | `.mcp.json` | Startup cost, tool-list bloat, two half-authed GitHub paths | Drop filesystem MCP; pick ONE GitHub path (gh CLI recommended) and fix its auth once |
| 13 | 17 unauthenticated claude.ai connector MCPs announced every session | claude.ai settings | Noise in every session preamble | Disconnect unused connectors |
| 14 | Stale artifacts: `plugins/cache/temp_git_*`, superpowers 6.0.3/6.1.0, context-mode 1.0.162, project `.claude/worktrees/wf_*` | caches | Disk/clutter; worktrees show as perpetual git-status noise | Delete |
| 15 | Plugin skill sprawl: operations/engineering/data/design/anthropic packs + Matt Pocock global skills (~40) mostly never invoked (66 skill calls total, all from ~10 skills) | global | Skill listing hit truncation warning (981ec67d); context cost every session | Disable unused plugin packs; prune global skills |

---

## Part 3 — Candidate list (prioritized by leverage)

1. **Disable context-mode hooks** (D, M, #1/#4) — unblocks agent dispatch, halves per-tool hook overhead.
2. **Security scrub** (K) — rotate exposed PAT, narrow `Read(//c/Users/ouimu/**)`.
3. **`anemal-finish-branch` skill** (F, folds in B trigger + I verification) — kills the most expensive recurring failure.
4. **Statusline residue cleanup** (E, #2/#3) — last flash source + dead scripts.
5. **Pipeline right-size or hook-enforce** (A, #9/#10/#6) — decide, then make CLAUDE.md match reality.
6. **Config cleanup batch** (#5 legacy keys, #8 gsd agents, #12 MCP dedupe, #13 connectors, #14 stale, #15 skill sprawl).
7. **`anemal-smoke-walkthrough` skill** (H) — 6× repeated request, standardize on preview tools.
8. **`resume-work` mini-skill** (G).
9. **Shell-rules block in CLAUDE.md** (C).
10. **Memory-system consolidation decision** (M) — user call: claude-mem vs context-mode.

Per-quartile evidence: `analyst-q1.md` … `analyst-q4.md` in session scratchpad
(`C:\Users\ouimu\AppData\Local\Temp\claude\D--Development-AnimalClinic\bf341d00-6967-4b24-8d31-b2e5bce563cb\scratchpad\`).
Scratchpad is session-scoped — copy those four files somewhere permanent if you want to keep the raw evidence.
