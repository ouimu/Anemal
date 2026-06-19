# Remaining Tasks — Post-Phase 4 Deferred Work
> Created: 2026-06-09 | All 4 phases complete (155 tests)
> Updated: 2026-06-10 — Phase 1.5 Settings module added as 🔴 CRITICAL top priority
> Rule: Use ≤60% of session token budget per session. Defer any task requiring external API credentials to a separate session.

---

## 🔴 PHASE 1.5 — Settings & Configuration Module *(CRITICAL — Do First)*
> **Full task spec:** `.claude/roadmap/phase1.5-settings-tasks.md`
> **Why top priority:** Sessions C, G, and F are blocked until this is complete. PromptPay QR, LINE/SMS dispatch, and the payment gateway all require `clinic_settings` + encryption infrastructure to exist first.

### Dependency Summary
| Session blocked | Requires from Phase 1.5 |
|---|---|
| Session C (PromptPay QR UI) | S3.5 Payment Page + S1.1 `promptpay_id` column |
| Session G (LINE/SMS dispatch) | S3.4 Notifications Page + S1.1 `line_oa_token` / `sms_api_key` columns |
| Session F (Payment Gateway) | S3.5 + S2.1 Payment API + S1.4 Encryption utility |
| Lab Integration | S3.6 Integrations Page + S1.1 `lab_api_url` / `lab_api_key` columns |

### Sub-sessions for Phase 1.5

#### Phase 1.5-A — DB + Encryption Foundation *(no credentials needed)*
| Task | Agent | Effort |
|---|---|---|
| S1.1 — `clinic_settings` table + trigger | @db-agent | M |
| S1.2 — `system_settings` table + seed data | @db-agent | S |
| S1.3 — `settings_audit_log` table | @db-agent | S |
| S1.4 — Encryption utility AES-256-GCM | @dev-agent | M |
| S2.4 — Auto-create settings on tenant register | @dev-agent | S |
| Prisma migration + generate | @dev-agent | S |

**Token estimate:** ~40% of budget.

#### Phase 1.5-B — Clinic Settings API ✅ DONE (2026-06-10, 206 tests)
| Task | Agent | Effort |
|---|---|---|
| S2.1 — Clinic Settings API (GET/PUT + test endpoints) ✅ | @dev-agent | L |
| S2.2 — System Settings API (pulled forward, minimal: `superadmin` role + 4 endpoints) ✅ | @dev-agent | M |
| S2.3 — Personal Preferences API ✅ | @dev-agent | S |
| S4.1 — Tenant isolation tests (TC-S001–S004) ✅ | @qa-agent | M |
| S4.2 — Encryption validation tests (TC-S005–S007, plus TC-S008/S009) ✅ | @qa-agent | M |

#### Phase 1.5-C — System Settings Admin UI *(no credentials needed)*
| Task | Agent | Effort |
|---|---|---|
| ~~S2.2 — System Settings API~~ ✅ done in 1.5-B | @dev-agent | — |
| S3.7 — System Settings Page (Admin UI) | @dev-agent | M |
| S4.3 — TC-S010 (10s-timeout URL test; TC-S008/S009 already pass) | @qa-agent | S |

**Token estimate:** ~25% of budget.

#### Phase 1.5-D — Frontend Settings Pages *(no credentials needed)*
| Task | Agent | Effort |
|---|---|---|
| S3.1 — Settings Layout & Navigation | @uiux-agent + @dev-agent | M |
| S3.2 — Clinic Profile Page | @dev-agent | M |
| S3.3 — Operating Hours Page | @dev-agent | M |
| S3.4 — Notifications Page ← **Session G blocker** | @dev-agent | M |
| S3.5 — Payment Page ← **Session C blocker** | @dev-agent | M |
| S3.6 — Integrations Page | @dev-agent | M |

**Token estimate:** ~55% of budget.

---


---

## Session A — Screen Specs 03–05 ✅ DONE (2026-06-10)
**Goal:** Add formal UI spec docs for the 3 unspecced screens, then wire them into the `anemal-screen-specs` skill.

| Task | Effort | Notes |
|------|--------|-------|
| Write `.claude/skills/anemal-screen-specs/references/03-appointments.md` | Low | Read `stitch_vet_clinic_design_system/appointment_scheduling_1024x768/code.html`, extract layout rules |
| Write `references/04-pet-owner.md` | Low | Read `pet_owner_management_1024x768/code.html` |
| Write `references/05-emr.md` | Medium | Read `emr_1024x768/code.html` — anatomy canvas section is complex |
| Update `anemal-screen-specs/SKILL.md` index table | Low | Mark screens 03–05 as specced |

**Token estimate:** ~25% of budget.

---

## Session B — PDF Receipts + Prescription Slips ✅ DONE (2026-06-10)
**Goal:** Generate PDF for invoices and prescription slips; no external email required in this session.

| Task | Effort | Notes |
|------|--------|-------|
| Install `pdfkit` in `src/backend` | Low | ✅ Done |
| `services/pdf.service.ts` — `generateInvoicePdf(invoice)` → Buffer | Medium | ✅ Done — A4, NotoSansThai, itemized table, VAT row |
| `services/pdf.service.ts` — `generatePrescriptionPdf(prescription)` → Buffer | Medium | ✅ Done |
| `controllers/invoice.controller.ts` — `GET /api/invoices/:id/pdf` | Low | ✅ Done |
| `controllers/prescription.controller.ts` — `GET /api/prescriptions/:id/pdf` | Low | ✅ Done |
| Frontend: "Download PDF" button in `ClinicBilling.tsx` | Low | ✅ Done — axios blob download (JWT-authenticated) |
| Tests: PDF endpoint returns 200 + `application/pdf` header | Low | ✅ Done — 6 tests (happy path + 404 + isolation) |

**Token estimate:** ~40% of budget. **Prerequisite:** No external APIs needed.

---

## Session C — PromptPay QR Code (UI only, no gateway)
**Goal:** Display a real EMVCo PromptPay QR image at checkout. No Omise/Stripe — just the QR standard.

| Task | Effort | Notes |
|------|--------|-------|
| Install `qrcode` package (`npm install qrcode @types/qrcode`) | Low | |
| `services/promptpay.service.ts` — `generateQr(amount, merchantId)` → base64 PNG | Medium | EMVCo payload format: `00020101021229370016A000000677010111011300668XXXXXXXX5303764540X.XX5802TH` |
| `POST /api/invoices/:id/promptpay-qr` | Low | Returns `{ qrDataUrl }` |
| Frontend: show QR image in ClinicBilling payment modal | Low | |
| Tests | Low | |

**Token estimate:** ~25% of budget. **Note:** Full payment gateway (Omise/Stripe webhooks) deferred to Session F — needs real credentials.

---

## Session D — Barcode Scanning (ZXing)
**Goal:** Enable camera barcode scan in ClinicInventory for product lookup.

| Task | Effort | Notes |
|------|--------|-------|
| Install `@zxing/browser` + `@zxing/library` in `src/frontend` | Low | |
| `components/BarcodeScanner.tsx` — modal with camera stream, scan → callback | Medium | `BrowserMultiFormatReader`, stop stream on unmount |
| Wire into `ClinicInventory.tsx` — scan icon button → open scanner → auto-fill search | Low | |
| Backend: `GET /api/products?barcode=<code>` filter | Low | Prisma `where: { barcode, tenantId }` |

**Token estimate:** ~30% of budget.

---

## Session E — S3 Photo Upload
**Goal:** Real pre-signed URL pet photo upload (replaces FileReader preview).

| Task | Effort | Notes |
|------|--------|-------|
| Install `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | Low | |
| `config/storage.ts` — S3 client init from env vars | Low | `AWS_REGION`, `AWS_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| `POST /api/upload/presign` — returns `{ uploadUrl, publicUrl }` for a given filename | Medium | Scoped to `tenants/{tenantId}/pets/` prefix |
| Frontend: `hooks/usePhotoUpload.ts` — PUT to presigned URL, then save `publicUrl` | Low | |
| Update `ClinicPets.tsx` photo upload flow | Low | |
| Tests: mock S3 client, verify URL scoping | Low | |

**Token estimate:** ~35% of budget. **Prerequisite:** AWS credentials in `.env`.

---

## Session F — Payment Gateway (Omise/Stripe)
**Goal:** Real card payment + PromptPay via gateway. Highest complexity, requires credentials.

| Task | Effort | Notes |
|------|--------|-------|
| Choose gateway (Omise for Thai market recommended) | Decision | Omise supports PromptPay natively |
| `services/payment.service.ts` — charge card, charge PromptPay source | High | Omise Node SDK |
| Webhook endpoint `POST /webhooks/omise` — verify signature, mark invoice paid | High | |
| SaaS subscription billing tables + cron | High | Separate migration needed |
| Trial expiry email notifications | Medium | Requires SMTP config |

**Token estimate:** ~55% of budget. **Prerequisite:** Omise API keys + SMTP credentials.

---

## Session G — LINE/SMS Real Dispatch
**Goal:** Wire the existing reminder worker to real LINE Messaging API + Twilio.

| Task | Effort | Notes |
|------|--------|-------|
| `services/line.service.ts` — `pushMessage(userId, text)` via LINE Messaging API | Medium | `LINE_CHANNEL_ACCESS_TOKEN` env var |
| `services/sms.service.ts` — `sendSms(phone, text)` via Twilio | Medium | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| Update `workers/reminder.worker.ts` to call services | Low | Replace "mark sent" no-op |
| Store LINE userId on owner record | Medium | Migration + UI to capture during owner create/edit |
| Tests: mock LINE/Twilio SDK | Low | |

**Token estimate:** ~35% of budget. **Prerequisite:** LINE channel token + Twilio credentials.

---

## Priority Order
1. ~~**Session A** — Screen specs~~ ✅ Done 2026-06-10
2. ~~**Session B** — PDF receipts~~ ✅ Done 2026-06-10
3. **Session C** — PromptPay QR (UI value, no credentials)
4. **Session D** — Barcode (UX improvement)
5. **Session E** — S3 photo (needs AWS)
6. **Session G** — LINE/SMS (needs LINE + Twilio)
7. **Session F** — Payment gateway (highest complexity, needs Omise)

