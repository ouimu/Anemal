# Grill log — i18n-completion (STEP 3.5)

Human-driven, 2026-09-24. Questions asked in plain Thai, one at a time, orchestrator + `@ba-agent` agenda
(BA sign-off §8, G-1..G-6). Each row: the question, the recommendation, the human's answer.

| # | Topic | Recommendation | Human answer | Status |
|---|---|---|---|---|
| G-1 | Thai-mode date year: Gregorian (ค.ศ. 2026) vs Buddhist Era (พ.ศ. 2569) | Gregorian — native date pickers on the same screens show ค.ศ. and cannot easily change; mixing eras on one screen risks misread clinical dates (e.g. next vaccination due) | **Gregorian (ก)** | ✅ resolved → ADR |
| G-2 | English-mode date order on EMR/Pets currently follows the browser locale (en-US shows M/D/Y); unify all 4 screens to day-first | Day-first everywhere, every device — M/D vs D/M ambiguity (3/4) can misread appointment/vaccination dates when one clinic mixes devices; users on en-US browsers will see a visible format change (display only, data unchanged) | **Day-first always** | ✅ resolved |
| G-3 | Stored values (Grooming `serviceType`, Inpatient `feedingStatus`, EMR templates, tab names) stay English in the DB; only the displayed label is translated | Store English, display Thai — mixed-language storage would split one value into two names (breaks counts/search) and existing rows are all English. Verified 2026-09-24: `pdf.service.ts` does not render these fields, so no customer-facing document shows them today; raw exports would | **Accepted** | ✅ resolved |
| G-7 (new, found in grill) | Customer-facing invoice PDF is English end-to-end (`pdf.service.ts:66` "Tax Invoice / Receipt"); inpatient discharge auto-invoice line is server-built English, persisted (`hospitalization.service.ts:107` "Hospitalization (N days)"). Thai tax invoices may be legally required in Thai (Revenue Dept) — unverified, human to confirm with the clinic's accountant | Out of scope for Option A (backend + persisted text). Backlog as a separate HIGH-priority Lane A feature: "invoice / tax-invoice language" | **Defer — backlog HIGH.** Human: the receipt needs a full redesign anyway | ✅ resolved (deferred) → backlog |
| G-4 | Server-originated error text stays English in Thai mode (163 string throw sites across 37 backend files, counted 2026-09-24) | Recommended (a) leave English this round + backlog. Explained that translating technical errors literally is unreadable in any language: user-fixable errors get a rewritten plain-Thai "what happened + what to do" message; system errors show no technical text at all — a generic Thai message + a reference code, details to the log (also avoids leaking internals) | **Human chose (c): translate ALL errors app-wide**, using the two-tier model above — **as a separate follow-on Lane A feature**, not in this branch (would invalidate BA sign-off + arch-skip and force a restart at STEP 3). This branch keeps server errors English. | ✅ resolved → new feature "Thai error messages app-wide" (needs `@arch-agent`: cross-cutting error-code contract) |
| G-5 | `@ba-agent` is the sole Thai reviewer (human decision §6.3). Concrete risk raised: "จำหน่าย" (hospital term for discharge) can read as "sell" in a clinic that also sells goods (S-2) | Offered: (a) BA alone, (b) BA + human reviews the 15 safety sentences, (c) clinic staff review all | **BA reviews alone now; no pre-merge human review.** Before merge, the orchestrator publishes a side-by-side EN↔TH review page of every new string (15 safety sentences highlighted) for the human to read at leisure — non-blocking. Wording fixes after release = human names the change → small Lane B fix. **No in-app translation editor** (human: not needed). BA must still decide "จำหน่าย" vs alternatives (e.g. "ให้กลับบ้าน") at I18N-16 with the sell-ambiguity in mind | ✅ resolved |
| G-6 | Platform plane (6 `/platform/*` views) is English-only | Already decided by the human at STEP 1 (brainstorm §6.2) — not re-asked; recorded as ADR | **English-only by design** | ✅ resolved → ADR |
| G-8 | EMR/Pets are ~3× the brainstorm estimate (~35 / ~50 strings). Ship Grooming+Inpatient first if EMR/Pets hit trouble? | Do all 4, but allow shipping the 2 Must screens first as a fallback | **All 4 screens, shipped together in one release — no partial ship.** EMR + Pets are promoted from Should to Must for this branch; BA's whole-screen-cut rule no longer applies (nothing is cut) | ✅ resolved |

## Gate verdict — ✅ STEP 3.5 PASSED (2026-09-24)

All 8 findings resolved; **0 unresolved**. `/write-plan` (STEP 4) is unblocked.

### Docs recorded (via `domain-modeling`, `@arch-agent`)
- [ADR-0029](../../adr/0029-date-display-follows-app-language-not-browser.md) — date display follows the app language; Thai = Thai months + Gregorian year; day-first everywhere (G-1, G-2)
- [ADR-0030](../../adr/0030-stored-values-stay-english-only-labels-translate.md) — stored values stay English; only labels translate (G-3)
- [ADR-0031](../../adr/0031-platform-plane-is-english-only.md) — Platform plane English-only by design (G-6)
- `CONTEXT.md` § "Localisation (i18n)" — App language · Stored value vs display label · Discharge (Thai term PENDING BA at I18N-16)

### Binding changes to STEP 4 plan (beyond BA amendments A-1..A-17, I18N-14..16)
1. **EMR + Pets promoted to Must** (G-8) — all 4 screens ship together; no partial ship, no whole-screen cut.
2. **Server error text stays English in this branch** (G-4) — no backend change.
3. **Pre-merge review page** (G-5) — orchestrator publishes a side-by-side EN↔TH page of every new string, 15 safety sentences highlighted; non-blocking for merge.
4. BA decides the Thai word for **discharge** at I18N-16 with the "จำหน่าย" = "sell" ambiguity in mind.

### Backlog to file at STEP 8 (`@scribe-agent`)
- **HIGH** — Invoice / tax-invoice language, redesign receipt (G-7). Human to confirm Thai tax-invoice language rule with the clinic's accountant.
- **Feature** — Thai error messages app-wide, two-tier model (user-fixable → plain Thai; system → generic Thai + reference code) (G-4). Needs `@arch-agent`.
- BA sign-off §7.4 items (incl. ClinicDashboard hardcoded `en-US`).
- `ADR-DUP-1` row must now target **0032**, not 0029 (0029 taken by this feature).
- Note for future E-3 (`Dialog.tsx` aria-label): pass label as prop — ADR-0027 (modal) forbids `useT` inside `Dialog`.
