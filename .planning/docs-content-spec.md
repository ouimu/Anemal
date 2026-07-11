# Docs Content Spec — Guide Page Audit + Changelog

**Author:** @ba-agent · **Date:** 2026-06-18 · **Target file:** `docs/index.html`
**Scope:** Audit 3 existing guide pages for Phase-9 accuracy; specify the missing Changelog page content.
**Handoff:** @pm-agent → @dev-agent (HTML conversion). This is a content spec, not production code.

---

## 0. Cross-cutting findings (apply before per-page work)

| ID | Severity | Finding | Action |
|----|----------|---------|--------|
| X-1 | **High (bug)** | The User Manual's closing tag leaked into the Admin Setup page. Line ~3997–3998 inside `page-adminsetup` ends with `</section><!-- /usermanual -->` — there is no opening `<section>` and the comment is wrong. Malformed/mismatched markup. | @dev-agent: replace stray `</section><!-- /usermanual -->` with the correct `</div>` closing `page-adminsetup`. Verify each guide page opens/closes with a balanced `<div class="page guide-page">`. |
| X-2 | **High** | `page-changelog` div does **not exist**, but the nav item (line 208), the Home card (line 470), and the `pages` map entry (line 4009, `badge: 'History'`) all reference it. Clicking Changelog shows nothing. | @dev-agent: create the `<div class="page guide-page" id="page-changelog">` block using §4 content. Insert after `page-adminsetup` closes, before `</div><!-- /content -->`. |
| X-3 | Med | "Phase 5 / Phase 1.5" naming is inconsistent across docs. Git shows the settings work was committed as **Phase 1.5** (2026-06-10/11); CLAUDE.md folds RBAC + restructure under **Phase 8**. There is no standalone "Phase 5/6/7" in the changelog brief that maps cleanly to git. | Changelog (§4) uses the **CLAUDE.md linear 1–11 phase model** as the source of truth and notes the 1.5 settings sub-track inside the relevant entry. Keep one model; do not invent dates. |
| X-4 | Low | Date anchors verified against git: first commit **2026-06-05**; Phase 1.5 settings **2026-06-10/11**; Phase 7 UI sign-off **2026-06-14**; Phase 8 RBAC/Platform **2026-06-15→17**; Phase 9 i18n **2026-06-17→18**. Use these; mark pre-2026-06-05 phases as "approx." | n/a — already applied in §4. |

---

## 1. How to Run (`id="page-howtorun"`, ~line 2909)

### Accurate — keep as-is
- Prerequisites table (Node 20 LTS, npm 9+, PostgreSQL 15+, Docker, Git). ✅
- Clone & install (no root `npm install`; separate `src/backend` + `src/frontend`). ✅
- `.env` template: `PORT`, `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN=8h`, `SETTINGS_ENCRYPTION_KEY` (AES-256-GCM), storage + integration placeholders. Matches MEMORY + CLAUDE.md. ✅
- Docker `vetclinic-pg` on `-p 5432:5432`, postgres:15-alpine. ✅
- Prisma scripts (`db:migrate`, `db:seed`, `db:generate`, `db:studio`); seed creates default tenant/branch, system roles `clinic_admin`/`doctor`/`clinic_staff`, platform superadmin, permissions. ✅ (matches Phase 8 seed)
- Two-service start (backend :4000, frontend :5173, Vite proxies `/api/*`). ✅
- Test sections: backend Jest `--runInBand --forceExit`; `jest.setup.js` Node-24 supertest patch warning. ✅ (matches MEMORY note — do-not-remove)
- Troubleshooting (port, DB refused, JWT, migration, Node version, encryption key). ✅
- Quick-reference command table. ✅

### Needs update
| Ref | Issue | Fix |
|-----|-------|-----|
| HTR-1 | Test counts are **absent** from this page. Phase 9 state is ~394 backend + ~95 frontend. | Optional: add one line under "Running Tests" — "Current suite: ~394 backend (Jest) + ~95 frontend (Vitest) passing as of Phase 9." Keeps page self-describing without per-run churn. |
| HTR-2 | DB credentials drift: `.env` template uses `vetclinic:vetclinic_pw@…/vetclinic_dev`; MEMORY records an older `vetclinic-pg` container. The Docker run block and `DATABASE_URL` here are **internally consistent** — keep them, but ensure the seed/login example user matches. | Verify `admin@example.com` is the actual seeded clinic_admin email; if seed uses a different default, correct the login curl example (lines ~3074–3084). @dev-agent to confirm against `prisma/seed.ts`. |
| HTR-3 | `db:studio` comment says "Opens https://localhost:5555" — Prisma Studio serves **http**, not https. | Change `https://localhost:5555` → `http://localhost:5555`. |

### Missing for Phase 9
- HTR-4: No mention that the frontend ships **EN/TH i18n** with a custom lightweight (no-library) implementation via `uiStore.language`. A one-line "Internationalization" note under Verify Installation would help a new dev know the toggle is expected behaviour, not a bug. (Low priority.)

---

## 2. User Manual (`id="page-usermanual"`, ~line 3207)

### Accurate — keep as-is
- Hero tags (Receptionist / Doctor / Clinic Admin / Tablet+Web); "Version: Phase 9 (i18n complete)". ✅
- §1.1 multi-tenant login, one account = one tenant, audit-trail warning. ✅
- §1.2 Language Toggle (Thai/English, immediate, no reload) — correct and matches Phase 9. ✅
- §1.3 Dashboard widgets; §1.4 role-based menu visibility. ✅ (see RBAC note below)
- §2 Pets & Owners (CRUD, photo upload, search by name/pet/chip, edit/archive). ✅ FR-03.
- §3 Appointments (day/week, booking, double-book prevention, edit/cancel). ✅ FR-04.
- §4 EMR (SOAP, anatomy canvas, prescription auto-deduct, history timeline). ✅ FR-05.
- §5 Inventory (stock list, receive/adjust, branch transfer, expiry alerts, barcode). ✅ FR-06.
- §6 Billing (invoice, loyalty/discount, PromptPay QR, payment methods, receipt/refund). ✅ FR-07/11.
- §7 Clinic Settings (profile, staff, notifications, payments, branches). ✅
- §7.2 multi-role note ("union of all assigned roles") — correct, matches Phase 8 FR-14b multi-role. ✅
- §8 workflows; §9 FAQ; platform-vs-clinic escalation note (staff cannot access platform admin). ✅ Correct plane boundary.

### Needs update
| Ref | Issue | Fix |
|-----|-------|-----|
| UM-1 | §1.4 + §7.2 use the legacy label **"Receptionist"**. The system role key is **`clinic_staff`** (Phase 8 RBAC). "Receptionist" is fine as a friendly UI label but should be reconciled with the role catalogue. | Add a parenthetical the first time it appears: "Receptionist (`clinic_staff`)". Do not rename throughout — keep user-facing wording. |
| UM-2 | §3.4 "SMS Notification Trigger" and §7.3 "Notification Settings / SMS Templates" describe SMS reminders as a usable feature. **LINE/SMS dispatch is Phase 11 — PAUSED (no credentials).** This manual over-promises. | Add a callout to §3.4 and §7.3: "Coming Soon (Phase 11) — SMS/LINE reminders are not yet active; the toggle/templates are present but dispatch is disabled until Phase 11." Align wording with the Admin Setup page, which already labels this correctly (line ~3841). |
| UM-3 | §6.5 refund + §6.4 card payment imply card processing works. Card gateway is **Phase 10 — PAUSED**. Cash/PromptPay/manual are live; card capture is record-only. | Clarify in §6.4 "Credit/Debit Card" bullet: "card details are recorded for the receipt only — automated card processing arrives in Phase 10." |
| UM-4 | Footer "Covers Phases 1–9 features." ✅ accurate — keep. | none |

### Missing for Phase 9
- UM-5: No note that the language toggle persists via `uiStore.language` (Zustand). §1.2 says "stored per session" — close enough for end-users; keep. (No change required.)
- UM-6: Custom roles are mentioned in Settings (§7.2 "or a custom role") ✅ — consistent with Phase 8 Role Editor. Good.

---

## 3. Admin Setup Guide (`id="page-adminsetup"`, ~line 3710)

### Accurate — keep as-is
- ~75-min onboarding framing, ordered sections with time estimates. ✅
- §1 first login, forced password change, empty-state dashboard, language toggle. ✅
- §2 clinic profile (name, address, phone, business hours, logo). ✅
- §3 invite staff + role quick-reference table (Admin/Doctor/Receptionist/Custom); custom-role guidance under Settings → Roles. ✅ Matches Phase 8 Role Editor.
- §4 appointment config; **Notification Setup correctly flagged "Coming Soon (Phase 11)"** (line ~3841). ✅ This is the correct pattern — UM-2 should match it.
- §5 inventory setup (items, opening stock, reorder points, barcode/SKU). ✅
- §6 PromptPay setup; **Credit Card Processor correctly flagged "Coming Soon (Phase 10)"** (line ~3908). ✅ Correct.
- §7 smoke test end-to-end. ✅
- §8 next steps, weekly admin tasks, support channels, version info. ✅

### Needs update
| Ref | Issue | Fix |
|-----|-------|-----|
| AS-1 | **Structural bug (= X-1).** Section 8 "Version Information" `<blockquote>` is not closed and the page ends with `</section><!-- /usermanual -->` instead of `</div>`. | Close the `<blockquote>`/`<p>` properly and replace `</section><!-- /usermanual -->` with `</div>` to close `page-adminsetup`. |
| AS-2 | §3 role table label "Receptionist" — same reconciliation as UM-1. | Add `(clinic_staff)` parenthetical once. |
| AS-3 | §8 Support: "LINE OA @anemal — Coming Soon" ✅ accurate. support@anemal.app — confirm this is a real address before publishing or mark as placeholder. | @pm-agent to confirm support email; otherwise label "(example)". |
| AS-4 | §1 password rule "minimum 8 characters, at least one number" — confirm this matches the actual backend validation (bcrypt cost ≥12 is hashing, not a complexity rule). | @dev-agent to confirm the real password policy; correct the text if it differs. |

### Missing for Phase 9
- AS-5: No "Role Editor" walkthrough. Phase 8 shipped a clinic Role Editor (clone system role, edit permissions, no-escalation, assign multiple roles). §3 mentions custom roles only in a tip. Consider a short §3.x "Creating a Custom Role" (Settings → Roles → Clone → toggle permissions → Save) since this is a flagship Phase 8 admin capability. (Should-have.)
- AS-6: No mention that Platform-plane settings (plans, quotas, tenant provisioning) are **not** visible to Clinic Admin. The manual's plane boundary note (UM §9) covers staff; Admin Setup should restate that even Clinic Admin cannot reach `/platform/*`. (Low priority — one sentence in §1 Admin Menu Overview.)

---

## 4. Changelog page content (NEW — create `id="page-changelog"`)

**Placement:** new `<div class="page guide-page" id="page-changelog">` inserted after `page-adminsetup` closes (post-X-1 fix), before `</div><!-- /content -->`. Use the same hero/section styling as the other guide pages. `pages` map entry already exists (`badge: 'History'`).

**Source of truth:** CLAUDE.md linear phase model 1–11. Dates anchored to git (see X-4). Pre-2026-06-05 phases marked "approx." Newest first.

### Hero
- Title: **Changelog — Anemal SaaS**
- Subtitle: *Release history by phase. Multi-tenant veterinary clinic platform (Thailand). Newest first.*

### Entries (render newest → oldest)

#### Phase 11 — LINE / SMS Dispatch · ⏸ Paused
*Status: planned — blocked on provider credentials.*
- LINE Messaging API integration for appointment reminders and prescription-ready alerts.
- SMS reminder dispatch (24h-before booking) via provider (Twilio/local gateway).
- Notification template management already scaffolded in clinic Settings; dispatch disabled until credentials provisioned.
- *Tests: n/a (paused).*

#### Phase 10 — Payment Gateway + SaaS Billing · ⏸ Paused
*Status: planned — blocked on payment-provider credentials.*
- Card payment gateway integration (Omise / 2C2P) for automated card capture.
- SaaS subscription billing for platform plans.
- PromptPay QR + cash + manual card-record remain the live payment methods until this ships.
- *Tests: n/a (paused).*

#### Phase 9 — Internationalization (Thai / English) · ✅ 2026-06-17 → 2026-06-18
- Full EN/TH i18n rollout across **16 clinic screens** (260+ key pairs).
- Custom lightweight i18n (no external library); language state via Zustand `uiStore.language`.
- In-app language toggle — switches immediately, no page reload.
- Platform Console intentionally excluded from i18n (operator-only, EN).
- *Milestone: ~95 frontend tests passing.*

#### Phase 8 — RBAC + Platform Console + Restructure · ✅ 2026-06-15 → 2026-06-17
- Two-plane authorization: **clinic plane** (`/clinic/*`) and **platform plane** (`/platform/*`), deny-by-default, `requirePlane` + `requirePermission` on every route.
- Permission catalogue (`<module>.<action>`); system roles `clinic_admin` / `doctor` / `clinic_staff` + **configurable custom roles**.
- **Clinic Role Editor** (clone, edit permissions, no privilege escalation) and **multi-role assignment** (effective permissions = union).
- **Platform Console**: customer/tenant CRUD, plan/package management, per-tenant quotas (max branches/staff/owners), per-tenant provisioning, platform settings — operates SaaS, never touches clinic PII.
- *Milestone: ~394 backend tests passing.*

#### Phase 7 — UI Redesign Sign-off (Compassionate Care) · ✅ approx. 2026-06-14
- Adopted the **Compassionate Care** design system across all clinic screens.
- White sidebar (`bg-surface shadow-sm`), right-border active nav, fixed `h-16` top nav.
- Plus Jakarta Sans / DM Sans / Fira Code typography; Material Symbols Outlined icons (no emoji in nav).
- Touch-first: all interactive elements ≥ 44×44px; verified at 768px and 1024px.

#### Phase 6 — Dashboard Redesign & Analytics · ✅ approx. mid-2026
- Real-time clinic dashboard with Today's Appointments, Revenue Summary, Inventory Alerts, Quick Actions.
- Analytics widgets and revenue/stock/appointment summary surfaces.
- *(Date approximate — folded into the Phase 4 frontend + Phase 7 UI track in git.)*

#### Phase 1.5 / Settings & Clinic Profile + RBAC Foundations · ✅ 2026-06-10 → 2026-06-11
- Settings module: DB schema + **AES-256-GCM** secret encryption (1.5-A) and settings API (1.5-B).
- Settings shell with role-filtered sidebar; Clinic Profile, Operating Hours, Notifications, Payment, Integrations, System pages.
- Early RBAC foundations: superadmin role, role-aware settings access.
- *(Numbered "Phase 1.5" in git; superseded by the full two-plane RBAC in Phase 8.)*

#### Phase 4 — Advanced Operations · ✅ 2026-06-09
- Multi-branch support, **Inpatient/hospitalization** board, **Grooming** queue, **Blood Bank** donor/transfusion logs.
- **Loyalty & membership** points (accrual + redemption at POS).
- Appointment reminders scaffolding and **audit log**.
- Admin frontends: branches, blood bank, audit log, loyalty at POS.

#### Phase 3 — Billing / POS, Reports & Inventory · ✅ 2026-06-05 → 2026-06-12
- Invoicing from EMR + retail POS; **PromptPay QR** real generation (`promptpay-qr` + `qrcode`), two-step payment flow.
- 7% VAT receipts; loyalty points at checkout.
- **Inventory** management: per-branch stock, auto-deduct on prescription, min-stock + expiry alerts, ZXing camera barcode scan.
- Revenue/stock reports + subscription scaffolding.

#### Phase 2 — Core Clinic Features · ✅ approx. early 2026-06 (repo layer 2026-06-05)
- **Appointments & scheduler** (daily/weekly calendar, double-booking block, walk-in queue).
- **Pets & Owners CRM** (full CRUD, drug allergies, vaccination timeline, quick search).
- **EMR / clinical** (SOAP notes, vital signs, prescriptions with real-time stock check).
- *(Repository layer for these committed 2026-06-05; pre-refactor work predates the public git history.)*

#### Phase 1 — Foundation · ✅ approx. (snapshot 2026-06-05)
- Node.js + Express + PostgreSQL 15 + Prisma + React 18/Vite scaffold.
- **Multi-tenancy**: `tenant_id` on every table, enforced in JWT middleware + repository layer.
- **JWT auth** (`{ userId, tenantId, branchId, … }`, 8h TTL).
- Unified error handling + structured logging; layered Route→Controller→Service→Repository architecture.

### Footer note (changelog page)
> Phases 1–9 complete. Phases 10 (payments) and 11 (LINE/SMS) are paused pending third-party credentials.
> Current test baseline: ~394 backend + ~95 frontend.

---

## 5. Acceptance criteria (for @qa-agent / @dev-agent)

| AC | Criterion |
|----|-----------|
| AC-1 | All four guide pages (`howtorun`, `usermanual`, `adminsetup`, `changelog`) open via nav and Home cards with no JS error and no blank screen. |
| AC-2 | Each `<div class="page guide-page" id="page-…">` is balanced (no stray `</section>`); X-1 fixed. |
| AC-3 | Changelog page renders all entries Phase 11→1, newest first; Phases 10/11 marked Paused; Phases 1–9 marked complete with the milestone test counts in §4. |
| AC-4 | UM-2/UM-3 callouts: SMS/LINE = Phase 11, card processing = Phase 10, both labelled "Coming Soon" consistent with the Admin Setup page. |
| AC-5 | No raw test-count claim contradicts CLAUDE.md (~394 backend / ~95 frontend). |
| AC-6 | "Receptionist" reconciled with `clinic_staff` at first mention on both UM and Admin pages. |

## 6. Risks & dependencies

| ID | Risk | Mitigation / owner |
|----|------|--------------------|
| R-1 | Pre-Phase-3 dates are approximate (public git starts 2026-06-05; earlier work was a pre-refactor snapshot). | Marked "approx." in §4. Do not assert false precision. @pm-agent owns final date sign-off. |
| R-2 | Seed login email / password policy in How to Run + Admin Setup may not match `prisma/seed.ts` / validation. | @dev-agent verifies against source (HTR-2, AS-4) before publish. |
| R-3 | Phase 6 has no clean git marker; risk of double-counting with Phase 4/7. | §4 notes the overlap explicitly; keep as a single brief entry. |
| R-4 | support@anemal.app may be a placeholder. | @pm-agent confirms (AS-3). |

**Definition of Ready:** met — objective, per-page findings, changelog content, acceptance criteria, risks, and dependencies all present. Ready to hand to @pm-agent for task breakdown, then @dev-agent for HTML conversion.
