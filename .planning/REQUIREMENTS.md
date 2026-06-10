# Requirements — Phase 1.5 Settings Frontend

## v1 Requirements

### Layout & Navigation

- [ ] **LAYOUT-01**: User sees a settings sidebar with nav links filtered by their role (admin sees all sections; staff sees only My Preferences; superadmin sees only System Settings)
- [ ] **LAYOUT-02**: User can navigate between settings sections without a full page reload
- [ ] **LAYOUT-03**: Each settings section shows a sticky "Save Changes" button and a "Last updated by [name] at [time]" footer
- [ ] **LAYOUT-04**: Settings sidebar collapses to icons-only on tablet portrait (768px), expanding on tap

### Clinic Profile

- [ ] **CLINIC-01**: Clinic admin can update Clinic Name, Address, Phone, Tax ID, and Website URL from the Clinic Profile page
- [ ] **CLINIC-02**: Clinic admin can upload or replace the clinic logo (drag & drop or camera — stored as URL; actual S3 upload deferred to Session E)
- [ ] **CLINIC-03**: Clinic admin sees validation errors inline before the form is submitted (required field, invalid URL format)

### Operating Hours

- [ ] **HOURS-01**: Clinic admin can toggle each day of the week open/closed independently
- [ ] **HOURS-02**: For each open day, clinic admin can set open and close times using a native time picker (touch-friendly, ≥44px target)
- [ ] **HOURS-03**: Saving hours persists to `PUT /api/v1/settings/clinic/hours` and shows a success toast

### Notifications

- [ ] **NOTIF-01**: Clinic admin can enter and save a LINE OA Channel Access Token; the stored value is displayed masked (`••••••••xxxx`)
- [ ] **NOTIF-02**: Clinic admin can reveal the masked token via a 👁 toggle and hide it again
- [ ] **NOTIF-03**: Clinic admin can select an SMS provider (ThaiBulkSMS / THSMS / Disabled), enter an API Key (masked) and Sender Name
- [ ] **NOTIF-04**: Clinic admin can click "Send Test Message" for LINE and SMS; the UI shows ✅ success or ❌ error detail without navigating away
- [ ] **NOTIF-05**: A warning banner states "API keys are encrypted before storage" on the Notifications page

### Payment

- [ ] **PAYMENT-01**: Clinic admin can enter and save a PromptPay ID (phone or tax ID format)
- [ ] **PAYMENT-02**: Clinic admin can upload a static PromptPay QR image; a preview renders below the upload control
- [ ] **PAYMENT-03**: GB PrimePay public key and secret key fields are present but marked as inactive placeholder (Phase 4)

### Integrations

- [ ] **INTEGR-01**: Clinic admin can enter and save a Lab API Base URL and Lab API Key (masked)
- [ ] **INTEGR-02**: Clinic admin can click "Test Connection"; the UI shows ✅ success with response time or ❌ error message
- [ ] **INTEGR-03**: Placeholder cards for X-ray/DICOM Viewer and Accounting Software are visible but non-interactive

### System Settings (Superadmin)

- [ ] **SYSADM-01**: Superadmin sees a System Settings page with tabs: Platform, Email/SMTP, Feature Flags
- [ ] **SYSADM-02**: Superadmin can edit Platform settings (App Name, Base URL, Maintenance toggle, Trial Days)
- [ ] **SYSADM-03**: Superadmin can edit SMTP settings (Host, Port, User, Password masked) and click "Test SMTP" to verify reachability
- [ ] **SYSADM-04**: Feature Flags tab shows a placeholder (no settings yet; reserved for Phase 4)

### Cross-Cutting

- [ ] **UX-01**: All secret fields (tokens, API keys, passwords) display masked values (`••••••••xxxx`) on load; saving an unchanged masked value does NOT overwrite the stored secret
- [ ] **UX-02**: All interactive elements have a minimum tap target of 44×44px
- [ ] **UX-03**: All settings pages render correctly at 768px (iPad portrait) and 1024px (iPad landscape)

### QA

- [ ] **QA-01**: TC-S010 — `POST /api/v1/settings/clinic/integrations/test` with a URL that never responds returns an error within 10 seconds (timeout enforced)

---

## v2 Requirements (Deferred)

- Real S3 logo upload (needs AWS credentials — Session E)
- LINE OA real message dispatch (needs LINE token — Session G)
- SMS real dispatch (needs Twilio/ThaiBulkSMS keys — Session G)
- Payment gateway live integration (needs Omise — Session F)
- Barcode scanning (Session D)
- Feature Flags UI (Phase 4 placeholder → real implementation later)

---

## Out of Scope

- Email notification dispatch — deferred to Session G (needs SMTP credentials)
- SaaS subscription billing UI — future milestone
- Multi-language UI (i18n) — backend language preference stored; UI rendering deferred
- Dark mode — not in design system

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| LAYOUT-01 to LAYOUT-04 | Phase 1 — Settings Shell | Pending |
| CLINIC-01 to CLINIC-03 | Phase 1 — Settings Shell | Pending |
| HOURS-01 to HOURS-03 | Phase 2 — Operational Pages | Pending |
| NOTIF-01 to NOTIF-05 | Phase 2 — Operational Pages | Pending |
| PAYMENT-01 to PAYMENT-03 | Phase 2 — Operational Pages | Pending |
| INTEGR-01 to INTEGR-03 | Phase 3 — Integrations + Admin | Pending |
| SYSADM-01 to SYSADM-04 | Phase 3 — Integrations + Admin | Pending |
| UX-01 to UX-03 | All phases | Pending |
| QA-01 | Phase 3 — Integrations + Admin | Pending |
