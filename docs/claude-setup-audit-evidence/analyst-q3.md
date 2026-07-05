# Analyst Q3 — Sessions Jun 17–25 (31 sessions, slice-3)

Totals: 80 tool errors, 15 interruptions, 9 hook blocks, 7 user-rejected tool uses. Models: mostly sonnet; opus for meta/setup work (7aef4fd8, 8dcbd15b, baeedd17, df8c0684).

## Recurring intents

1. **"Update all documents" / HTML docs in /docs** — the single most repeated request. "please update all documents" (001019ed x2), "Update HTML document in /docs" (001019ed), "@pm-agent update all document?" (b5b24540), create+link HOW_TO_RUN/USER_MANUAL/ADMIN_SETUP + index.html dashboard (69214d25), "all HTML pages are messing up, help fix" + theme/scroll complaints (df8c0684 x3), "add test login data for all roles into 'how to run' page" (c4daaaef). Docs constantly drift and break (dead links, theme mismatch, no scrolling).
2. **Role-based app walkthroughs** — "login as Staff/Doctor/Admin/Platform admin, walk every page, report errors": 5a44558b (x3, spawning qa-agent), d68b3697, df8c0684 ("Staff clicks sidebar, nothing happens", "Pet&Owner shows access denied"), 5f646d53 (platform admin walkthrough x3), 89b38fc3 (subscription not accessible for admin role).
3. **Plan → execute → run-out-of-context → resume** — executing Superpowers plans with subagents, then manually carrying state across sessions: b5b24540, e2363b8c, 20852da5, 5aa5839e, 8dcbd15b, 85537386, def56d8b, f3babf75 ("give me a prompt to choose subagent-driven after I restart claude").
4. **Claude-setup meta-maintenance** — cleaning CLAUDE.md/agents/skills of duplicates (1894b157), making /grill-me mandatory in CLAUDE.md (7aef4fd8), installing launch-your-agent skill (599ca483), statusline configure/reconfigure/remove (eb050d16, 6455f22e, 5a075e72), diagnosing flashing terminal windows (6fc2e624, 5a075e72, 8241865e).
5. **Git rituals** — "Push and commit current code to git" (7a2e6727), "push to main" x2 + "Do I need to create PR? I saw on status line" (8dcbd15b), create-pr-command flows (5f646d53, def56d8b, baeedd17).

## Friction & corrections

- **4464650d**: the same long Thai requirement prompt ("แก้ไขโครงสร้างของคลีนิค สาขา และผู้ใช้" — restructure clinic/branch/user model; use QA agents to gap-check vs current dev and create a plan) was sent **5 times verbatim**, with 3 user-rejected tool uses in between — user kept rejecting the agent's approach and re-submitting. Ended with "accept only this and do the /handoff to another session".
- **df8c0684**: "How to Run / User Manual / Admin Setup / Changelog cannot scroll down, theme is diff from dashboard" repeated **3x** — fixes didn't land the first two times.
- **5a44558b**: identical frontend-login bug report sent twice; d358e697: "please proceed all deferred" twice; 5f646d53: "implement the fix as implementation plan" twice.
- **Context exhaustion**: 6+ sessions contain "continued from a previous conversation that ran out of context" (b5b24540, df8c0684, d68b3697, 85537386, 20852da5, 5aa5839e). User manually pastes plan-task prompts into fresh sessions ("You are implementing Task 4 of Branch Selection..." — 5aa38441, then again in 5aa5839e after 5aa38441 got 2 user-rejections).
- **Chasing incomplete work**: "Do you update 'How to run' and 'Upcoming Work' sections yet?" (001019ed); "เสร็จแล้ว หรอ" ("is it actually done?") (5aa5839e); "can we undo the last completed task?" / "recover docs/index.html to yesterday version?" (69214d25 — a doc task overwrote work).
- **Permission classifier blocks**: bare "Yes" not accepted as authorization to push to main (8dcbd15b); transient stage-2 classifier error blocking a Bash call (599ca483).

## Skill usage gaps

The CLAUDE.md pipeline (brainstorm → grill → ba sign-off → write-plan → **ponytail gate** → execute-plan → qa → HTML-updater) is largely **not followed**:

- **ponytail-agent: 0 invocations across all 31 sessions**, despite 4+ plan executions (b5b24540, e2363b8c, 5aa5839e, 8dcbd15b). The mandatory Step 5 gate never fires.
- **grilling: fired once** (baeedd17, Jun 25) — and only after the user manually edited CLAUDE.md on Jun 24 to make /grill-me mandatory (7aef4fd8). Earlier features went brainstorm → write-plan directly (20852da5, f3babf75).
- **anemal-HTML-updater (Step 8) never fired**; all doc/HTML updates in this slice were done manually via ad-hoc prompts (001019ed, 69214d25, df8c0684) — precisely the pain the skill was later created for.
- **anemal-* domain skills nearly silent**: anemal-coding-rules and anemal-design-system fired once each (85537386) despite heavy frontend/RBAC work all week. anemal-rbac-matrix, anemal-screen-specs, anemal-db-context: 0.
- **pm-agent underused as coordinator** (4 calls vs dev-agent 40) — the user acts as PM, manually delegating "@dev-agent create docs/..." (69214d25).
- De facto working pipeline is Superpowers brainstorm → write-plan → subagent-driven-development (4 uses) with caveman cavecrew reviewers (15 review calls) — bypassing ba sign-off and ponytail entirely.

## Error patterns (80 total)

| Category | Count | Representative example |
|---|---|---|
| command-failed (test/build failures in fix loops) | 23 | jest RBAC/plane-isolation failures 403-vs-401, Prisma errors (5aa5839e x7, 85537386, b5b24540) |
| other/misc | 13 | "fatal: not a git repository... bad BASE" in worktree (b5b24540) |
| mcp/tool-schema | 8 | preview_eval "ReferenceError: show is not defined", "Server not found" (df8c0684) |
| path-not-found | 7 | Bash ate backslashes: `cd D:DevelopmentAnimalClinicsrcfrontend: No such file` (b5b24540); Grep on non-existent test path (5aa5839e) |
| edit-before-read | 7 | Edit/Write "File has not been read yet" (b5b24540, 85537386 x2, 5aa5839e, df8c0684, d68b3697) |
| user-rejected | 7 | 3 in 4464650d, 2 in 5aa38441 |
| cmd-not-found (bash-ism in PS) | 4 | `head` not recognized (b5b24540); `.\node_modules\.bin\tsc` not recognized (85537386) |
| PS-&&-operator | 2 | `&&` parser error (df8c0684, d358e697) |
| shell-syntax | 2 | `git commit -m "$(cat <<'EOF'` heredoc in PowerShell (5aa5839e) |
| edit-mismatch | 2 | old_string not found (df8c0684, d68b3697) |
| permission (classifier) | 2 | 599ca483, 8dcbd15b |
| network/timeout | 2 | preview_screenshot 30s timeout (c4daaaef) |

**Windows shell-dialect confusion cluster (~10 errors)**: bash-isms in PowerShell (`head`, `&&`, heredoc commit messages) and Windows paths fed to bash (backslashes stripped). Recurs across b5b24540, 85537386, 5aa5839e, df8c0684, d358e697.

**Hook blocks (9)**: test-failure verification hooks (5aa5839e x3, def56d8b, b5b24540), missing superpowers plugin module path after update (20852da5: `Cannot find module ...superpowers\6.0.3\skills\subagent-driven...`), preview port conflict (df8c0684), classifier denials (599ca483, 8dcbd15b).

**Windows hook UX bug (root-caused in-session)**: flashing console windows on every prompt/response. 6fc2e624 traced it to powershell.exe statusline (fixed with `-WindowStyle Hidden -NonInteractive`); 8241865e traced remaining flashes to caveman's `UserPromptSubmit` node hook firing every message — user disabled caveman entirely ("1 disable it"). Three sessions burned on this (6fc2e624, 5a075e72, 8241865e).

## Automation candidates

1. **Docs/HTML sync skill (auto Step 8)** — Evidence: repeated manual "update all documents" dances and broken HTML fixes; sessions 001019ed, 69214d25, df8c0684, c4daaaef, b5b24540. The user has since created `anemal-HTML-updater`, validating the need — but it never fired in this slice; it needs an automatic trigger (post-QA hook or checklist) rather than relying on the user to remember.
2. **Role-matrix smoke-walkthrough skill** — scripted login as Staff/Doctor/ClinicAdmin/PlatformAdmin, visit every sidebar route, report access-denied/blank/console errors. Requested in nearly identical words 6+ times: 5a44558b, d68b3697, df8c0684, 5f646d53, 89b38fc3.
3. **Session handoff/resume skill** — auto-save plan state + generate resume prompt when context runs low; today the user does this by hand ("save session and give me a prompt to continue" b5b24540; "/handoff" 4464650d; hand-pasted Task-N prompts 5aa38441/5aa5839e; resume-handoff files 85537386, def56d8b).
4. **Pipeline-gate enforcement hooks** — ponytail 0/31 and grilling 1/31 show the CLAUDE.md prose gates don't self-enforce; user already hand-hardened /grill-me into CLAUDE.md (7aef4fd8). A PreToolUse hook (or plan-file marker check) that blocks execute-plan without a recorded grill + ponytail verdict would make the gates real.
5. **Windows-safe command conventions/snippets** — a small skill or CLAUDE.md cheat-block for: git commit via here-string (not heredoc), no `&&`/`head` in PS 5.1, quote Windows paths for bash, `npx tsc` not `.\node_modules\.bin\tsc`. Evidence: 5aa5839e, 85537386, b5b24540, df8c0684, d358e697, 7a2e6727 (`Remove-Item nul` cleanup of a stray `nul` file created by a bad redirect).
6. **Hidden-window hook hygiene** — default `-WindowStyle Hidden -NonInteractive` (or node `windowsHide`) for all hooks/statusline on Windows; cost was 3 sessions of diagnosis and losing the caveman plugin (6fc2e624, 5a075e72, 8241865e).
