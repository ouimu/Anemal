# HANDOFF — i18n-completion

**Lane:** A (user-visible change)
**Branch:** `feature/i18n-completion` (from `main` @ `57ca371`). Planning docs committed `8ec6b48`.
**Orchestrator:** single session from 2026-09-24 (two parallel sessions merged into one; only this one works the branch).
**Current step:** STEP 6 (`/superpowers:execute-plan`), sequential (no frozen contract, so one wave at a time with an integration checkpoint after each wave).

## Wave status
| Wave | Tasks | Status |
|---|---|---|
| W0 | I18N-14 static integrity suite | ✅ `925bbb7` |
| W1 | I18N-15 shared date helper | ✅ `3e8eb91` |
| W2 | Grooming I18N-1, 2, 4 | ✅ `044267d` `4371caf` `70e711e`. Checkpoint green (tsc clean, 758/759, the one failure is the pre-existing main failure below) |
| W2 | I18N-3 browser QA + screenshots | 🟡 Browser pass ✅ for the empty list and BookingModal at all 3 sizes. **Still open:** BookingCard was not seen, because the dev DB has 0 bookings (the `nowrap` risk is untested). PR screenshots need a human to capture them |
| W3 | Inpatient I18N-5, 6, 8 | ✅ `bacfac6` `5e990e9` `f5e2bf9` |
| W3 | I18N-7 browser QA + screenshots (incl. A-14 date/duration) | ✅ Browser pass found 2 defects, both fixed: `7ea819b` (card labels broke mid-word), `aacb4b3` (vitals steppers overflowed). PR screenshots need a human to capture them |
| W3 | integration checkpoint (tsc + suite) | ✅ 2026-09-24: tsc clean, 775/776, the one failure is the known pre-existing ClinicBilling failure |
| W4 | EMR I18N-9, 10 | ❌ |
| W5 | Pets I18N-11, 12 | ❌ |
| W6 | I18N-16 `@ba-agent` Thai wording review (incl. discharge word) | ❌ |
| W7 | I18N-13 manual EN↔TH cross-check, mid-modal language switch, AdmitModal from Pets | ❌ |

Then STEP 7 `@qa-agent` `/code-review` + sign-off, then STEP 8 `@scribe-agent` `/anemal-finish-branch`.

## ⚠️ main frontend suite is RED (not caused by this branch)
`src/frontend/src/__tests__/ClinicBilling.characterization.test.tsx`, test "clicking Confirm Payment again after a QR is already pending creates a second invoice (no double-submit guard)". It fails deterministically (3/3). The test locks in the pre-#92 bug that PR #92 (`fa1c146`) fixed without updating the test. It needs its own Lane B branch (`/anemal-fix-bug`), outside this branch's file scope. This may affect the STEP 8 red-suite gate (check `anemal-finish-branch` §1.5).

## Pipeline history
- STEP 1 ✅ human-approved 2026-09-23 (brainstorm §6): Option A · Platform English-only · `@ba-agent` alone signs off Thai.
- STEP 2 ✅ `@pm-agent`: 13 tasks, I18N-1..13.
- STEP 3 ✅ `@ba-agent`: BA sign-off with binding amendments A-1..A-17 and new tasks I18N-14..16.
- STEP 3.4: **arch: skipped (below threshold)**.
- STEP 3.4b: n/a.
- STEP 3.5 ✅ `/grill-with-docs` passed 2026-09-24: 8 findings, 0 unresolved.
- STEP 4 ✅ plan [2026-09-24-i18n-completion.md](2026-09-24-i18n-completion.md). STEP 4b ✅ clean. STEP 5 ✅ `@ponytail-agent` APPROVE ([gate](2026-09-24-i18n-completion-ponytail-gate.md)).

## Docs produced
- [brainstorm](2026-09-23-i18n-completion-brainstorm.md) · [pm-tasks](2026-09-23-i18n-completion-pm-tasks.md) · [ba-signoff](2026-09-23-i18n-completion-ba-signoff.md) · [grill](2026-09-24-i18n-completion-grill.md) · [plan](2026-09-24-i18n-completion.md) · [ponytail gate](2026-09-24-i18n-completion-ponytail-gate.md)
- [ADR-0029](../../adr/0029-date-display-follows-app-language-not-browser.md) · [ADR-0030](../../adr/0030-stored-values-stay-english-only-labels-translate.md) · [ADR-0031](../../adr/0031-platform-plane-is-english-only.md) · `CONTEXT.md` § Localisation (i18n)
- The old stash is preserved on `archive/stash-i18n-wip` (`fdc8213`). Delete that branch after this feature merges.

## Backlog candidates found during QA (outside this branch's file scope)
- The TopNav page title wraps to 2 lines at 768 in Thai (e.g. "อาบน้ำตัดขน").
- The discharge and delete-admission confirmations use native `window.confirm`, so they can't be styled or checked visually.

## Next action
1. I18N-3 open item: see BookingCard with a real booking. This needs a grooming booking in the dev DB, and creating one means submitting a form, so ask the human first.
2. Hand W4 (I18N-9 EMR) to `@dev-agent` (Dev A), with file scope taken from the plan manifest.
3. Before the PR: the human captures the Thai screenshots (the browser pane can't save images to disk).
4. Dev login: subdomain `dev-clinic`, user `admin_a`. The human types the password.
