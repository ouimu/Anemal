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
| W2 | I18N-3 browser QA + screenshots | ✅ Browser pass complete, BookingCard included (2026-09-25). PR screenshots need a human to capture them |
| W3 | Inpatient I18N-5, 6, 8 | ✅ `bacfac6` `5e990e9` `f5e2bf9` |
| W3 | I18N-7 browser QA + screenshots (incl. A-14 date/duration) | ✅ Browser pass found 2 defects, both fixed: `7ea819b` (card labels broke mid-word), `aacb4b3` (vitals steppers overflowed). PR screenshots need a human to capture them |
| W3 | integration checkpoint (tsc + suite) | ✅ 2026-09-24: tsc clean, 775/776, the one failure is the known pre-existing ClinicBilling failure |
| W4 | EMR I18N-9, 10 | ✅ code `0b57d53` `1fa56fb` `03df946`, plus the browser-QA fix `304b6ac`. Browser QA done 2026-09-25 (768 blocked by the pre-existing layout bug, see backlog). Dev flagged 3 items for W6: `pet.species` chip is still English (feline/canine); 8 new Thai strings were not in the glossary; weight shows "kg" untranslated next to the translated vitals units |
| W5 | Pets I18N-11, 12 | ✅ code `5d24902` `0533ce2` `7ffd2e7` `b81096f`, plus `2cebfe8`: PetOverview.test updated. That is a **human-approved exception to A-9**, because the test locked in the raw canine/male bug; the PR body must say so. Suite 823/824 (only the known ClinicBilling failure), tsc clean. Browser QA done 2026-09-25. For W6: 3 new Thai strings are not in the glossary. The species→Thai map lives only in ClinicPets.tsx, so the EMR sidebar still shows raw species; that needs a shared map (cross-file, BA decision) |
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
- The TopNav page title wraps at 768 in Thai: 2 lines for "อาบน้ำตัดขน", 3 lines for "สัตว์เลี้ยงและเจ้าของ".
- The discharge and delete-admission confirmations use native `window.confirm`, so they can't be styled or checked visually.
- **EMR at 768 portrait is unusable in either language (pre-existing on main).** The fixed `w-56` patient list plus the `w-72` attachments panel plus the app sidebar leave the SOAP editor about 30px wide. This needs a responsive EMR layout; open a Lane B bug.
- **The Pets layout doesn't stay within the screen height (pre-existing).** The `h-full` container grows with the owner list (about 4000px), so the details panel content is centered far below the screen. Lane B bug.
- Pets: the "show inactive" checkbox row is 38px tall, and the owner header's edit/delete icon buttons are under 44px (pre-existing, same in both languages).

## Browser QA 2026-09-25 (one login)
- Grooming BookingCard (test booking #7, Muffin, "Teeth Cleaning", in_progress, 2026-09-25 10:00): fits at all 3 sizes, no overflow, no horizontal scroll. **I18N-3 closed.** Test booking #7 is safe to delete.
- EMR: Thai strings fine. One defect was caused by this branch: the SOAP tab labels broke mid-word and the 4th tab was clipped at 1024. Fixed in `304b6ac` (tabs stay whole and wrap to a second row). 1024/1280 are clean. 768 is blocked by the pre-existing layout bug above.
- Pets: no Thai-caused overflow at 768/1024/1280. The species chip shows "Cat" because the dev DB has non-canonical stored species values (`Cat`/`cat`/`Dog`/`dog`, 13 rows) that the canonical map (canine/feline/avian/other) doesn't cover. Decision for W6: add aliases, or clean the data.

## Next action
1. W6: `@ba-agent` runs I18N-16, the Thai wording review. Inputs: the W4 flags (8 new EMR strings, the "kg" unit, the EMR species chip needing a shared map), the W5 flags (3 new Pets strings), the Cat/Dog alias question, and the discharge word.
2. W7: I18N-13, the manual EN↔TH cross-check.
3. Before the PR: the human captures the Thai screenshots (the browser pane can't save images to disk).
4. Dev login: subdomain `dev-clinic`, user `admin_a`, and the human types the password. **Preview servers stop when the orchestrator's turn ends**, so keep the turn open (poll) while the human logs in.
