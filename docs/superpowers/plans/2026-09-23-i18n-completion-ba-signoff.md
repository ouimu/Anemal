# BA Sign-off: i18n Completion (Option A) — STEP 3

**Date:** 2026-09-24
**Author:** @ba-agent
**Gate:** STEP 3, validate the requirement and design authorization. The verdict is below.
**Inputs:** `2026-09-23-i18n-completion-brainstorm.md` (STEP 1, human-approved §6), `2026-09-23-i18n-completion-pm-tasks.md` (STEP 2, 13 tasks)
**Evidence base:** `main` @ `57ca371` on branch `feature/i18n-completion`; files read: `i18n/index.ts`, the 4 in-scope views, `ClinicDashboard.tsx`, `App.tsx` route guards, `components/{Dialog,VitalStepper}.tsx`, `utils/errorMessage.ts`, existing tests under `src/__tests__/` and `views/clinic/__tests__/`, `archive/stash-i18n-wip:src/frontend/src/i18n/index.ts`, `anemal-rbac-matrix/references/permission-matrix.md`, backend `grooming.service.ts`, `pet.controller.ts`, `pet.repository.ts`.

**Skills loaded:** `.claude/agents/ba-agent/SKILL.md`, `anemal-ba-toolkit`, `anemal-functional-reqs`, `anemal-rbac-matrix`, `anemal-screen-specs`, `.claude/standards/acceptance-criteria.md`.

---

## 0. Verdict

### BA SIGN-OFF, with binding amendments

The requirement is sound and Option A is the right scope. It is presentation-only and changes no route or permission (§3). The PM task list does have **7 factual errors and 4 missing tasks** (§1, §6). Each one is fixed below with a decided answer, so nothing waits on a human decision. The sign-off holds **only if** the Step 4 plan (`/superpowers:write-plan`, @pm-agent) includes amendments **A-1 to A-17** (§6) word for word or with the same meaning. @scribe-agent (Step 4b) and @ponytail-agent (Step 5) should reject a plan that leaves any of them out.

Items for /grill-with-docs (Step 3.5) are in §8.3. They are decisions made here that the human should stress-test. None of them blocks this gate.

---

## 1. Evidence check: corrections to STEP 1 and STEP 2

| # | Claim in brainstorm / PM list | Evidence (current `main`) | Consequence |
|---|---|---|---|
| F-1 | Inpatient has **no test file** (PM §0.1, I18N-6, I18N-8) | `src/__tests__/ClinicInpatient.test.tsx` and `src/__tests__/ClinicInpatient.characterization.test.tsx` exist | I18N-8 must not claim a first test file. The existing tests are the no-regression net (A-9) |
| F-2 | EMR / Pets have no test file, or "check for one" | EMR: 5 files (`ClinicEMR.{attachments,characterization,petAvatar,petIdParam,weightSync}.test.tsx`). Pets: 5 files, **including an existing `ClinicPets.i18n.test.tsx`** | I18N-12 extends `ClinicPets.i18n.test.tsx` and does not create a new file |
| F-3 | i18n tests go inside `ClinicGrooming.test.tsx` / `views/clinic/__tests__/` (I18N-4, I18N-8) | The project convention is a separate `src/__tests__/<Screen>.i18n.test.tsx` (Dashboard, ClinicPets, LoginView, ClinicAppointments, RoleComponents, ClinicOps). A global `src/__tests__/i18n.coverage.test.ts` also exists | New files: `ClinicGrooming.i18n.test.tsx`, `ClinicInpatient.i18n.test.tsx`, `ClinicEMR.i18n.test.tsx` in `src/__tests__/`. Final path belongs to the Step 4 plan; the convention wins over the PM's "do not create a new file" (A-10) |
| F-4 | A role without permission is "denied access (404)" (I18N-2/6/9/11) | 404 is only for **cross-tenant** access. A permission denial is a server **403** and a frontend `<RequirePermission>` renders the ADR-0026 forbidden view (`forbidden.title`) | Fix the AC wording (A-8) |
| F-5 | Grooming actors are "Staff, Vet, Groomer" | No `groomer` system role exists. `/clinic/grooming` is guarded by `grooming.view`, which is held by `clinic_admin` and `clinic_staff`. **`doctor` is denied** (`App.tsx:164-165`) | Fix the actors (§3.1) |
| F-6 | EMR has "~10" and Pets "~30" hardcoded lines left | Line-level sweep: EMR has about **35** visible literals (Prescriptions panel, SOAP tab labels, anatomy templates and tools, Attachments, empty state). Pets has about **50** (New Owner/Pet modals, species/gender options, Overview field labels, 3 tabs, Vaccination modal, confirm/error text). Estimates are ±5 | The Should items are about **3× larger** than the brainstorm said. Re-plan effort (A-17). The PM's "re-count first" AC stays |
| F-7 | `ClinicDashboard` is "Done" and is the reference pattern for dates/numbers (brainstorm 4.2) | `ClinicDashboard.tsx:17` `toLocaleString('en-US')` for baht, and `:38` `toLocaleDateString('en-US', …)`. **In Thai mode the dashboard date renders in English** | Dashboard is **not** a valid formatting reference. Its date/currency localisation goes to the backlog (§7.4). It does not join this branch |
| F-8 | (not raised) `AdmitModal` belongs to Inpatient | `AdmitModal` is **exported from `ClinicInpatient.tsx` and rendered inside `ClinicPets.tsx:687`** ("Admit to Inpatient" button, gated `inpatient.manage`) | Converting Inpatient changes what Pets shows. I18N-12/13 must check the modal from the Pets entry point too (A-13) |
| F-9 | (not raised) Strings are "string-only substitution" | Several displayed strings are **also stored data values or state values** (§4 R-1): Grooming `SERVICE_TYPES` (sent as `serviceType`, a free-text VARCHAR, so any string is valid server-side), Inpatient `FEEDING_OPTIONS.value`, EMR `TEMPLATES` (stored in the annotation JSON), EMR `SOAP_TABS` and Pets `TABS` (React state keys). Also: EMR `saveMsg === 'Saved'` **drives the success/error colour** (`ClinicEMR.tsx:684`), and the loop variable `t` **shadows the translator** in `SOAP_TABS.map(t => …)` (`:613`) and `TEMPLATES.map(t => …)` | Naive find-and-replace would corrupt stored data or break logic. Rule R-1 and dev constraints C-1 and C-2 apply (§4) |
| F-10 | (not raised) Dates | Grooming/Inpatient hardcode `'en-GB'`. EMR/Pets call `toLocaleDateString()` with **no locale**, so the result follows the *browser* locale, not the app toggle | Rule R-2 (§4). This is required to meet "100% Thai" |

PM counts of `t()` calls (0/0/7/51) and line counts are correct. The key convention the PM observed (`clinic.<screen>.<camelCase>`) is correct.

---

## 2. Answers to BA questions

| Q | Answer (one line) | Evidence |
|---|---|---|
| **4.1** | Keep `clinic.<screen>.<camelCase>` (main and the stash already agree). **Reuse stash key names only where the same English string still exists**. Treat stash Thai values as drafts that the §5 glossary overrides, and never add screen-local copies of `common.*` strings | Stash has `clinic.grooming.*` (56 lines) and `clinic.inpatient.*` (66 lines) in this convention. Stash predates the current Inpatient (edit/delete/history/feeding vocabulary), has obsolete keys (`lastCare`, `hoursAgo`), and duplicates `common.cancel` as `clinic.grooming.cancel` |
| **4.2** | `t()` does **not** cover formatting (no interpolation API; the house pattern is `t(key).replace('{n}', …)`), and no locale-aware formatter exists yet. **Required:** dates on the 4 screens come from the *app language* through one shared language→locale mapping (R-2). Thai uses Gregorian year and Thai month abbreviations. Numbers stay Arabic numerals | `i18n/index.ts:706-717`; F-7, F-10 |
| **4.3** | N/A to Option A (AdminAudit is backlog). Related finding in scope: **server error text (`response.data.error`) stays English in Thai mode**. This is exemption E-1, and localising it needs a backend error-code mapping (backlog §7.4) | `utils/errorMessage.ts`, 3 inline `?.response?.data?.error ??` sites per screen |
| **4.4** | **No RBAC impact.** Presentation-only. Exactly **one** permission-conditioned string exists in scope (Pets medical tab, `hasPermission('emr.view') ? 'No medical records yet.' : "You don't have access to clinical records."`). Both branches must be translated **without changing which branch shows or what it reveals**. The server already strips medical records without `emr.view` (`pet.controller.ts:20` → `findPetById(…, includeEmr)`). No other string differs by permission or language | §3 |
| **4.5** | Delivered: **§5 glossary, 118 entries**: 96 numbered term rows, 7 enum value→label sets, and 15 safety-critical sentences, plus 14 wording rules. It is binding for Dev, and BA reviews the final `th` diff (new task I18N-16) | §5 |
| **4.6** | Decided by human §6.2 (Platform English-only). Record it as an ADR at Step 3.5 | — |
| **4.7** | **Both, split by cost.** (a) *Static* checks are app-wide and run automatically in `i18n.coverage.test.ts` in this branch: two-way en↔th key parity, every literal `t('…')` key exists in `en` (**already passes app-wide today**, verified), and placeholder-token parity. (b) The *render* pattern (Thai render, Latin-residue, raw-key) is per screen, is added for the 4 screens here, and is documented as a reusable convention in `.claude/roadmap/qa-protocols.md` by @qa-agent at Step 7 | Verified with a scan of 107 source files: 0 missing literal keys |

---

## 3. Authorization: confirmed presentation-only

**No route, permission code, guard, API or DB change.** Deny-by-default is untouched. The server stays the security boundary. No plane is crossed: all 4 screens are clinic-plane (`/clinic/*`), and the Platform plane is excluded by human decision §6.2.

### 3.1 Actors per screen (corrects F-5)

| Screen | Route guard (`App.tsx`) | Server perms (view / write) | Roles that can reach it (default matrix) |
|---|---|---|---|
| Grooming | `grooming.view` | `grooming.view` / `grooming.manage` | `clinic_admin`, `clinic_staff`. **`doctor` denied** |
| Inpatient | `inpatient.view` | `inpatient.view` / `inpatient.manage` | all three (`clinic_admin`, `doctor`, `clinic_staff`), all with manage |
| EMR | `emr.view` | `emr.view` / `emr.create`, `emr.edit`, `emr.attach`, `prescriptions.*` | all three view. Writing SOAP notes is `doctor` only. Attach: admin and doctor edit, staff view |
| Pets | `crm.view` | `crm.view` / `crm.create`, `crm.edit`, `crm.delete` | all three view. Delete (deactivate) owner is `clinic_admin` only. The embedded AdmitModal needs `inpatient.manage` |

Custom roles follow whatever codes they hold, and nothing here changes that.

### 3.2 Authz rules for this change
- **AZ-1** No change to any `<RequirePermission>`, `<Can>`, `hasPermission()` call, or its condition. Reviewer check: the diff contains no added, removed or altered `perm=` / `hasPermission(` token.
- **AZ-2** A translated string inside a `<Can>` block stays inside it, and no translated string moves out of one.
- **AZ-3** The Pets no-access message (Thai: see §5.4 S-15) must not state or imply that records exist.
- **AZ-4** The regression authz check is **the existing guard tests plus AZ-1 diff inspection**. A per-language authz test is not needed: language does not reach the guard code, because `useT` reads only `uiStore.language`.

Permission decision record:
```
Module.Action: none added/changed   Default roles: unchanged   Configurable: n/a
Rationale: string-only presentation change; guards read permissions, never language
Risk if wrong: a moved <Can> boundary would expose a control; mitigated by AZ-1/AZ-2 review
```

---

## 4. Requirement rules (binding for I18N-1..16)

- **R-1 Value vs. label.** When a string is also a stored, sent or state value, **only the display label is translated**. The stored/sent value stays byte-identical to today's English.
  - Grooming `serviceType`: POST body still sends `'Bath & Dry'` etc. Existing bookings are displayed through a value→label map. **A value not in the map renders raw** (the backend accepts any string; test data uses `'bath'`).
  - Inpatient `feedingStatus`: POST still sends `'Ate all'` etc. The Care History "Feeding:" line maps known values to Thai labels, and free-text "Other" entries render as typed.
  - EMR anatomy `template` value is unchanged, and only the chip label is translated. SOAP tabs and Pets tabs keep English state keys, with labels from `t()`.
  - Pets `species`/`gender` option values (`canine`, `male`, …) are unchanged. The Overview tab's `Species`/`Gender` **display values** go through the same map (today they show raw `canine`). Unknown values render raw.
  - Status badges (Grooming, Inpatient) map status code → label key. Unknown codes render raw, as today.
- **R-2 Dates/times follow the app language, not the browser.** One shared language→locale mapping; no per-screen locale literals.
  - `en` → `en-GB` with the **current option sets**. Grooming and Inpatient English output stays byte-identical. EMR/Pets English changes from browser-default to `en-GB` numeric (`21/09/2026`). This is a deliberate, visible change for users on an en-US browser (grill item G-2).
  - `th` → Thai month/weekday abbreviations, **Gregorian year (ค.ศ.)** (grill item G-1), 24-hour times. Examples: Grooming nav `จ. 21 ก.ย.`, Inpatient `21 ก.ย. 2026`, history `21 ก.ย. 2026 14:30`.
  - Time-slot labels (`08:00`) and hour labels stay as they are.
- **R-3 Interpolation.** Use `{name}`, `{n}`, `{date}`, `{status}`, `{file}` tokens with the existing `.replace()` pattern. **Never build a sentence by concatenating translated fragments** (for example `'Cage ' + no` becomes `t('clinic.inpatient.cageNo')` with `{no}`), because Thai word order differs. `en` and `th` values of one key carry the same token set (static test, A-11).
- **R-4 Plurals.** Where English inflects, use two keys `…One` / `…Other`. The `th` values may be identical, since Thai has no plural. The th≠en check ignores them.
- **R-5 No dynamic keys** in the 4 files (`t(\`…${x}\`)` is forbidden). Enum maps hold literal keys so the static key-exists scan covers them.
- **R-6 Reuse before adding.** Use `common.*` (`save`, `cancel`, `close`, `delete`, `edit`, `loading`, `saving`) and existing `clinic.pets.*` / `clinic.emr.*` keys when the English string is identical. Add a screen key only when the English differs.
- **R-7 In-scope surfaces:** visible JSX text, `placeholder`, `title`, `aria-label`, `<option>` text, `window.confirm` / `confirm` messages, client-side fallback error strings, and `VitalStepper` `label`/`unit` props passed from the 4 files.
- **Exemptions** (render in English in Thai mode, accepted for this branch, each recorded in §7.4 backlog):
  - **E-1** Server-originated error text (`response.data.error`, `describeSaveError` field names).
  - **E-2** User and data content: pet/owner names, breed, colour, cage no, reason, notes, drug names, file names, free-text feeding "Other", unknown enum values.
  - **E-3** Shared-component strings outside the 4 files: `Dialog.tsx:179` `aria-label="Close dialog"` (used app-wide; backlog).
  - **E-4** Clinical tokens kept Latin: `°C`, `NPO` (shown after the Thai term), SOAP letters `S/O/A/P`.
- **Dev constraints** (technical traps flagged to @arch/@dev; how to solve them is theirs):
  - **C-1** `ClinicEMR` success/error styling compares `saveMsg === 'Saved'`, so translating the literal breaks the colour logic. Success/failure must not be inferred from display text.
  - **C-2** The loop variable `t` shadows the translator in `ClinicEMR` (`SOAP_TABS.map(t => …)`, `TEMPLATES.map(t => …)`), so `t('…')` inside those callbacks would call a string.

---

## 5. Thai terminology glossary (BA-owned, binding)

The dev writes Thai values straight from this glossary; there are no `TODO` placeholders. Terms that do not appear here follow the §5.1 rules and the nearest glossary term. @ba-agent reviews the final `th` diff (I18N-16).

### 5.1 Wording rules
1. Register: polite-neutral and professional. **No ครับ/ค่ะ**. Use **กรุณา** only for instructions that ask the user to act.
2. Optional-field suffix: **(ไม่จำเป็น)** (existing house style in `clinic.pets.*`; do not use "ไม่บังคับ").
3. Numerals: always Arabic (0-9), never Thai digits.
4. Ellipsis: the single character `…`, attached with no space, as in `en`.
5. Lists within a phrase use a space in Thai, not a comma (`ภูมิแพ้ นิสัย…`).
6. Confirmations: `<action> <object> ใช่หรือไม่?`. Irreversible actions add `การดำเนินการนี้ย้อนกลับไม่ได้`.
7. Failures: `<verb>ไม่สำเร็จ`, adding the remedy `กรุณา…` only when the English has one.
8. Units in Thai mode: kg → **กก.**, bpm → **ครั้ง/นาที**, rpm → **ครั้ง/นาที**, `°C` and `฿` unchanged.
9. Animal sex is **เพศผู้ / เพศเมีย**, never ชาย/หญิง.
10. Grooming is a service, so its subject is **สัตว์เลี้ยง**. Clinical screens (Inpatient, EMR) use **ผู้ป่วย**.
11. **Module name vs. record:** EMR the module/screen is **เวชระเบียน** (matches `nav.emr`). One visit entry is **บันทึกการรักษา** (matches `clinic.emr.newRecord`).
12. Keep terms consistent with existing keys: `nav.grooming` อาบน้ำตัดขน, `nav.inpatient` ผู้ป่วยใน, `clinic.appointments.doctor` สัตวแพทย์, `clinic.pets.colorOptional` สีขน.
13. Button labels are verbs or verb phrases of 2-4 syllables where possible, because tablet buttons are narrow.
14. No English words in Thai values except E-4 tokens and brand/product names.

### 5.2 Terms (96)

**Shared / general**

| # | English | Thai | Note |
|---|---|---|---|
| 1 | Patient (clinical) | ผู้ป่วย | EMR/Inpatient only (rule 10) |
| 2 | Patient (grooming modal label) | สัตว์เลี้ยง | Rule 10. The English stays "Patient" |
| 3 | Owner | เจ้าของ | |
| 4 | Pet | สัตว์เลี้ยง | |
| 5 | Doctor / Vet | สัตวแพทย์ | existing |
| 6 | Staff (person) | เจ้าหน้าที่ | "Staff #{id}" → `เจ้าหน้าที่ #{id}` |
| 7 | Today | วันนี้ | |
| 8 | Back | ย้อนกลับ | |
| 9 | Next | ถัดไป | |
| 10 | Refresh | รีเฟรช | |
| 11 | Other (option) | อื่นๆ | |
| 12 | Unknown | ไม่ทราบ | |
| 13 | Unassigned (doctor) | ยังไม่ระบุสัตวแพทย์ | |
| 14 | Saved (status msg) | บันทึกแล้ว | C-1 applies |
| 15 | Failed to save | บันทึกไม่สำเร็จ | |
| 16 | Failed to delete | ลบไม่สำเร็จ | |
| 17 | Failed to add | เพิ่มไม่สำเร็จ | |
| 18 | Uploading… / Upload | กำลังอัปโหลด… / อัปโหลด | |
| 19 | Adding… | กำลังเพิ่ม… | |
| 20 | Search (placeholder prefix) | ค้นหา… | |

**Grooming**

| # | English | Thai | Note |
|---|---|---|---|
| 21 | Grooming | อาบน้ำตัดขน | = `nav.grooming` |
| 22 | Grooming Queue (title) | คิวอาบน้ำตัดขน | |
| 23 | Booking (noun) | การจอง / คิว | "คิว" in counts, "การจอง" in actions |
| 24 | {n} booking(s) today | วันนี้มี {n} คิว | One/Other keys, same th (R-4) |
| 25 | New Booking | จองคิวใหม่ | |
| 26 | New Grooming Booking (modal) | จองคิวอาบน้ำตัดขน | |
| 27 | Add booking (empty slot) | เพิ่มการจอง | |
| 28 | Book Appointment (modal submit) | ยืนยันการจอง | Not "นัดหมาย": this is not a vet appointment |
| 29 | Booking… | กำลังจอง… | |
| 30 | Service | บริการ | |
| 31 | Groomer (optional) | ช่างตัดขน (ไม่จำเป็น) | |
| 32 | Any available groomer | ช่างคนใดก็ได้ที่ว่าง | |
| 33 | Time slot | ช่วงเวลา | |
| 34 | Special instructions (optional) | ข้อควรระวังพิเศษ (ไม่จำเป็น) | Content is allergies/temperament, so "ข้อควรระวัง" fits better than "คำแนะนำ" |
| 35 | Allergies, temperament notes… | ภูมิแพ้ นิสัยหรืออารมณ์ของสัตว์… | |
| 36 | Search by pet name, owner name, or phone… | ค้นหาด้วยชื่อสัตว์เลี้ยง ชื่อเจ้าของ หรือเบอร์โทร… | |
| 37 | Advance to {status} (tooltip) | เปลี่ยนสถานะเป็น "{status}" | |
| 38 | Failed to load grooming schedule. | โหลดตารางอาบน้ำตัดขนไม่สำเร็จ | |

**Inpatient**

| # | English | Thai | Note |
|---|---|---|---|
| 39 | Inpatient | ผู้ป่วยใน | = `nav.inpatient` |
| 40 | Inpatient Board (title) | กระดานผู้ป่วยใน | |
| 41 | Admission (noun) | การรับเข้ารักษา | |
| 42 | {n} active admission(s) | ผู้ป่วยในที่รักษาอยู่ {n} ราย | One/Other |
| 43 | Admit to Inpatient (title/button) | รับเป็นผู้ป่วยใน | Shared with Pets (F-8) |
| 44 | Admit Patient (submit) | รับเข้ารักษา | |
| 45 | Admitting… | กำลังรับเข้ารักษา… | |
| 46 | Admitted {date} | รับเข้า {date} | R-3 token |
| 47 | Edit Admission — {name} | แก้ไขการรับเข้ารักษา — {name} | |
| 48 | Edit admission (aria) | แก้ไขการรับเข้ารักษา | |
| 49 | Delete admission (aria) | ลบรายการรับเข้ารักษา | |
| 50 | Reason for admission | สาเหตุที่รับเข้ารักษา | |
| 51 | Cage / Cage {no} | กรง / กรง {no} | R-3 token, no concatenation |
| 52 | Cage number (optional) | หมายเลขกรง (ไม่จำเป็น) | |
| 53 | Doctor in charge (optional) | สัตวแพทย์ผู้รับผิดชอบ (ไม่จำเป็น) | |
| 54 | Daily rate | อัตราค่ารักษาต่อวัน (฿) | Keep the ฿ that the English implies |
| 55 | Discharge (action) | จำหน่ายผู้ป่วย | Formal hospital term |
| 56 | Log Care / Log Care — {name} | บันทึกการดูแล / บันทึกการดูแล — {name} | |
| 57 | Care History | ประวัติการดูแล | |
| 58 | View care history (aria) | ดูประวัติการดูแล | |
| 59 | Select Time Slot (step title) | เลือกรอบเวลา | "รอบ" = round of care |
| 60 | Select the care time slot: | เลือกรอบเวลาการดูแล: | |
| 61 | Record Vitals | บันทึกสัญญาณชีพ | |
| 62 | Vital Signs | สัญญาณชีพ | Also EMR |
| 63 | Temperature / Temp: | อุณหภูมิ / อุณหภูมิ: | |
| 64 | Heart Rate / HR: | อัตราการเต้นของหัวใจ / หัวใจ: | Short form in the history grid |
| 65 | Resp Rate / Resp: | อัตราการหายใจ / หายใจ: | |
| 66 | Care Notes (step) / Care notes (optional) | หมายเหตุการดูแล / หมายเหตุการดูแล (ไม่จำเป็น) | **Not** บันทึกการดูแล (collides with #56) |
| 67 | Observations, instructions… | สิ่งที่สังเกตพบ คำแนะนำ… | |
| 68 | Feeding status / Feeding: | การกินอาหาร / การกินอาหาร: | |
| 69 | Describe feeding status | ระบุการกินอาหาร | |
| 70 | Medication / treatment note (optional) | บันทึกยา/การรักษา (ไม่จำเป็น) | |
| 71 | Medication: | ยา/การรักษา: | |
| 72 | Medication/treatment name, dose, route, or note | ชื่อยาหรือการรักษา ขนาดยา วิธีให้ยา หรือหมายเหตุ | |
| 73 | By: | ผู้บันทึก: | |
| 74 | Save Care Record | บันทึกข้อมูลการดูแล | |
| 75 | No care history recorded yet | ยังไม่มีประวัติการดูแล | |
| 76 | No active admissions | ไม่มีผู้ป่วยในขณะนี้ | |

**EMR**

| # | English | Thai | Note |
|---|---|---|---|
| 77 | EMR / EMR Editor | เวชระเบียน / เวชระเบียน | Rule 11. The empty-state heading is "เวชระเบียน" |
| 78 | Find Patient | ค้นหาผู้ป่วย | |
| 79 | Pet or owner… | ชื่อสัตว์เลี้ยงหรือเจ้าของ… | |
| 80 | Visit (record fallback title) | การตรวจรักษา | Also Pets medical tab |
| 81 | Physical Examination Notes | บันทึกการตรวจร่างกาย | |
| 82 | Physical findings, auscultation, palpation… | สิ่งที่ตรวจพบ การฟังเสียงด้วยหูฟัง การคลำ… | |
| 83 | Anatomy Annotation | ภาพกายวิภาคประกอบ | |
| 84 | Eraser / Clear | ยางลบ / ล้างภาพ | |
| 85 | Prescriptions | รายการยา | Section of the record, not a paper "ใบสั่งยา" |
| 86 | Add Prescription | เพิ่มรายการยา | |
| 87 | Search drug by name or barcode… | ค้นหายาด้วยชื่อหรือบาร์โค้ด… | |
| 88 | Dosage instructions… | วิธีใช้และขนาดยา… | |
| 89 | Clear selected drug (aria) | ล้างยาที่เลือก | |
| 90 | Attachments / No attachments yet. | ไฟล์แนบ / ยังไม่มีไฟล์แนบ | |
| 91 | Delete attachment (aria) | ลบไฟล์แนบ | |

**Pets**

| # | English | Thai | Note |
|---|---|---|---|
| 92 | New Owner / Save Owner | เจ้าของใหม่ / บันทึกข้อมูลเจ้าของ | |
| 93 | New Pet / Save Pet | สัตว์เลี้ยงใหม่ / บันทึกข้อมูลสัตว์เลี้ยง | |
| 94 | Change photo / Add photo (optional) | เปลี่ยนรูป / เพิ่มรูป (ไม่จำเป็น) | |
| 95 | Species / Gender / Breed / Date of birth / Weight / Color / Microchip ID / Allergies / Underlying conditions | ชนิดสัตว์ / เพศ / สายพันธุ์ / วันเกิด / น้ำหนัก / สีขน / หมายเลขไมโครชิป / ภูมิแพ้ / โรคประจำตัว | Consistent with existing `clinic.pets.*Optional` |
| 96 | Pet Profile / Select an owner / Owner list search "Search owners, phone…" / No owners found. / Record Vaccination / Date administered / Next due date (optional) / Due: / Add Vaccination / View all in EMR / No medical records yet. | ข้อมูลสัตว์เลี้ยง / เลือกเจ้าของ / ค้นหาชื่อเจ้าของหรือเบอร์โทร… / ไม่พบเจ้าของ / บันทึกการฉีดวัคซีน / วันที่ฉีด / วันนัดฉีดครั้งถัดไป (ไม่จำเป็น) / ครบกำหนด: / เพิ่มบันทึกวัคซีน / ดูทั้งหมดในเวชระเบียน / ยังไม่มีประวัติการรักษา | |

### 5.3 Enumerated value → Thai label maps (7 sets; stored values unchanged per R-1)

| Set | Stored value → Thai label |
|---|---|
| Grooming status | `scheduled` นัดไว้แล้ว · `in_progress` กำลังดำเนินการ · `completed` เสร็จแล้ว · `cancelled` ยกเลิกแล้ว |
| Grooming service (`serviceType`) | `Bath & Dry` อาบน้ำ-เป่าขน · `Full Groom` อาบน้ำตัดขนครบชุด · `Trim & Tidy` เล็มขนแต่งทรง · `Nail Trim` ตัดเล็บ · `Teeth Cleaning` แปรงฟันทำความสะอาด (**not** ขูดหินปูน, which is a vet dental procedure under anaesthesia) |
| Inpatient status | `admitted` รับเข้ารักษา · `stable` อาการคงที่ · `attention` ต้องเฝ้าระวัง · `critical` วิกฤต · `discharged` จำหน่ายแล้ว |
| Feeding status | `''` ยังไม่ประเมิน · `Ate all` กินหมด · `Ate some` กินบางส่วน · `Refused` ไม่ยอมกิน · `NPO` งดน้ำงดอาหาร (NPO) · `Assisted feeding` ช่วยป้อนอาหาร · `__other__` อื่นๆ |
| SOAP tabs (labels only) | `Subjective` ประวัติและอาการ (S) · `Objective` ผลการตรวจ (O) · `Assessment` การประเมิน (A) · `Plan` แผนการรักษา (P) |
| Anatomy templates | `Canine - Lateral` สุนัข – ด้านข้าง · `Canine - Dorsal` สุนัข – มุมบน · `Feline - Lateral` แมว – ด้านข้าง |
| Species / Gender | `canine` สุนัข · `feline` แมว · `avian` นก · `other` อื่นๆ · (placeholder `Gender`) เพศ · `male` เพศผู้ · `female` เพศเมีย · `unknown` ไม่ทราบ |

Pets tabs: `Overview` ภาพรวม · `Medical` ประวัติการรักษา · `Vaccinations` วัคซีน.

### 5.4 Safety-critical sentences (15): exact meaning required, BA checks each one at I18N-16

| # | English | Thai (canonical) |
|---|---|---|
| S-1 | Documentation note only — not a verified medication administration record. | เป็นบันทึกประกอบเท่านั้น ไม่ใช่บันทึกการให้ยาที่ผ่านการตรวจสอบ |
| S-2 | Discharge {name}? This will generate the billing invoice. | จำหน่าย {name} ใช่หรือไม่? ระบบจะออกใบแจ้งหนี้ค่ารักษา |
| S-3 | Delete this admission for {name}? This cannot be undone. | ลบรายการรับเข้ารักษาของ {name} ใช่หรือไม่? การดำเนินการนี้ย้อนกลับไม่ได้ |
| S-4 | Delete "{file}"? This cannot be undone. | ลบ "{file}" ใช่หรือไม่? การดำเนินการนี้ย้อนกลับไม่ได้ |
| S-5 | Deactivate {name}? (existing `clinic.pets.deactivateConfirm`, reuse) | ปิดใช้งาน {name}? → align to `ปิดใช้งาน {name} ใช่หรือไม่?` |
| S-6 | Save the EMR first to add prescriptions. | กรุณาบันทึกเวชระเบียนก่อนเพิ่มรายการยา |
| S-7 | Failed to save care record | บันทึกข้อมูลการดูแลไม่สำเร็จ |
| S-8 | Failed to admit patient | รับเข้ารักษาไม่สำเร็จ |
| S-9 | Failed to save changes | บันทึกการเปลี่ยนแปลงไม่สำเร็จ |
| S-10 | Failed to load inpatient data. Please refresh. | โหลดข้อมูลผู้ป่วยในไม่สำเร็จ กรุณารีเฟรช |
| S-11 | Failed to load care history. | โหลดประวัติการดูแลไม่สำเร็จ |
| S-12 | All patients have been discharged or no admissions today. | ผู้ป่วยทุกรายจำหน่ายแล้ว หรือวันนี้ยังไม่มีการรับเข้ารักษา |
| S-13 | Search for a patient to start or continue a medical record. | ค้นหาผู้ป่วยเพื่อเริ่มหรือบันทึกเวชระเบียนต่อ |
| S-14 | Failed to reactivate | เปิดใช้งานอีกครั้งไม่สำเร็จ |
| S-15 | You don't have access to clinical records. | คุณไม่มีสิทธิ์เข้าถึงข้อมูลทางคลินิก (AZ-3: no hint that records exist) |

S-5 changes an existing `th` value (adds `ใช่หรือไม่`) to meet rule 6. English is unchanged. This is the only edit to an existing key that the glossary allows.

---

## 6. Binding amendments to the PM task list

### 6.1 Amendments to existing tasks

| ID | Applies to | Amendment |
|---|---|---|
| A-1 | I18N-1, 5, 9, 11 | Remove the "`// TODO-BA-WORDING` placeholder" AC. Replace it with: *"Thai values are authored from the §5 glossary; `grep -r TODO-BA-WORDING src/` returns 0 at merge."* |
| A-2 | I18N-1, 5, 9, 11 | Add: *"`en` values are byte-identical to the literals they replace"*. This keeps all existing English-matching tests green unmodified (see A-9). Only intended exception: R-2 EMR/Pets English date format |
| A-3 | I18N-1, 5, 9, 11 | Add: *"Keys follow R-3..R-6: token parity, One/Other plurals, no dynamic keys, `common.*` reused where the English is identical"* |
| A-4 | I18N-2, 6, 9, 11 | Replace the untestable "`grep -c t(` rises to the full count" AC with the **Latin-residue test** (A-10), which is the real proof of "100% Thai" |
| A-5 | I18N-2, 6, 9, 11 | Add R-1: *"In Thai mode, submitting the form sends the same English stored value as in English mode"* (Grooming `serviceType`, Inpatient `feedingStatus`, EMR anatomy `template`), asserted on the mocked POST body. *"An unknown stored value renders raw, with no crash and no key string"* |
| A-6 | I18N-2, 6, 9, 11 | Add R-2: *"Every date/time on the screen renders in the active language per R-2. In English, Grooming/Inpatient output is unchanged"* |
| A-7 | I18N-9 | Add C-1 and C-2 as ACs: *"the save success/error colour is correct in both languages"* and *"no `t` shadowing inside `.map` callbacks that render translated labels"* |
| A-8 | I18N-2, 6, 9, 11 | Replace the "denied (404)" negative AC with: *"AZ-1: the diff adds, removes or alters no `perm=`/`hasPermission(` token, and existing guard/`<Can>` tests pass unmodified. A role lacking the view permission still gets the forbidden view / 403, not 404"* |
| A-9 | I18N-2, 6, 9, 11 | Replace "pass unmodified except for text-matcher updates" with *"all existing tests for the screen pass **unmodified**"*. Files: Grooming 2 (`views/clinic/__tests__/`), Inpatient 2, EMR 5, Pets 5 (`src/__tests__/`). Any change needs a written reason in the PR |
| A-10 | I18N-4, 8, 10, 12 | Test location per F-3: `src/__tests__/ClinicGrooming.i18n.test.tsx`, `ClinicInpatient.i18n.test.tsx`, `ClinicEMR.i18n.test.tsx`, extend the existing `ClinicPets.i18n.test.tsx`. Each uses the existing `uiStore` mock pattern and asserts: **(a)** key Thai strings present; **(b) Latin-residue:** with Thai fixture data, collect visible text + `placeholder` + `title` + `aria-label` + `<option>` text, drop E-3 exact strings and E-4 tokens, then assert no `/[A-Za-z]{2,}/` remains; **(c)** no `/\bclinic\.[a-z]+\.[A-Za-z]+/` in rendered text; **(d)** `window.confirm` receives the Thai message (spy). Each render test must open every surface: Grooming main + BookingModal. Inpatient board + CareModal steps 1-3 + Edit + History + AdmitModal. EMR empty state + all 4 SOAP tabs + prescriptions + attachments. Pets list, owner detail, pet profile ×3 tabs, owner/pet add/edit, vaccination modal |
| A-11 | I18N-13 → new I18N-14 | Split the static checks out of the manual cross-check (see I18N-14) |
| A-12 | I18N-3, 7, 10, 12 | Viewports are **768×1024 portrait, 1024×768 landscape, 1280 desktop** (the standard lists 768 and 1280). Evidence is one screenshot per surface per viewport in Thai, attached to the PR. AC: no clipped label, no horizontal scroll, tap targets ≥ 44×44 px. **Watch:** Inpatient history 3-column vitals grid (#64/#65), Grooming 5 service chips, Grooming date label `min-w-[160px]`, EMR SOAP tab bar with 4 Thai labels |
| A-13 | I18N-12, 13 | Add: *"AdmitModal opened from Pets → Pet Profile → 'รับเป็นผู้ป่วยใน' renders fully in Thai"* (F-8) |
| A-14 | I18N-7 | Remove "log formatting oddities for BA, do not fix". R-2 now decides formatting, and I18N-15 implements it |
| A-15 | I18N-2 | Actor: `clinic_admin`, `clinic_staff` (doctor denied). I18N-6: all three roles. I18N-9: all three view, doctor writes. I18N-11: all three view, admin deletes (§3.1) |
| A-16 | I18N-13 | Keep it as the manual end-to-end pass, and add: *"switching language on an open modal re-renders it with no stale language"* |
| A-17 | Plan (Step 4) | Re-estimate I18N-9 (~35 strings) and I18N-11 (~50 strings) per F-6. Keep brainstorm §2's fallback to split them into their own PR if the diff can't be reviewed in one pass. They are Should, so they may be cut from this branch **only as whole screens**, never half-converted |

### 6.2 New tasks

**I18N-14: Static i18n integrity tests** · Must · Device n/a · Permission n/a · Depends: none (write first; red → green as keys land)
Extend `src/__tests__/i18n.coverage.test.ts`:
- [ ] Two-way key parity: every `th` key exists in `en` (today only en→th is checked)
- [ ] Every literal `t('…')` key in `src/**/*.{ts,tsx}` (excluding tests and `i18n/index.ts`) exists in `en`. Already true app-wide today, so the test is green on `main` and guards all future screens
- [ ] Every key's `en` and `th` values contain the same `{token}` set
- [ ] For keys in `clinic.grooming.*`, `clinic.inpatient.*`, and keys added to `clinic.emr.*` / `clinic.pets.*`: `th !== en` unless the key is on an explicit allow-list (plural pairs are compared among themselves, not against `en`)
- [ ] The 4 in-scope view files contain no template-literal `t(\``…`\`)` call (R-5)

**I18N-15: Language-aware date formatting for the 4 screens** · Must (Grooming/Inpatient) / Should (EMR/Pets) · Both devices · Permission n/a · Depends: none; blocks I18N-2/6/9/11 date ACs
- [ ] One shared language→locale mapping per R-2. No `toLocale*` call in the 4 files passes a hardcoded locale or no locale
- [ ] English: Grooming `formatDateLabel`, Inpatient `formatDate`/`formatDateTime` output byte-identical to today (unit-tested with a fixed date)
- [ ] Thai: the fixed date renders with Thai month abbreviation and Gregorian year (e.g. `21 ก.ย. 2026`)
- [ ] The rendered string does not depend on the browser/OS locale (test runs under two `navigator.language` values)

**I18N-16: BA Thai wording review** · Must · Gate before Step 7 · Owner @ba-agent · Depends: I18N-1, 5, 9, 11
- [ ] @ba-agent reviews the full `th` diff of `i18n/index.ts` against §5 and records APPROVED or a finding list in this file's §9 (appended at that time)
- [ ] All 15 §5.4 sentences match in meaning. Every §5.3 enum label is used exactly
- [ ] Findings are fixed before @qa-agent sign-off

(I18N-13 keeps its role as the integration check. Task count goes from 13 to 16: Must 12, Should 4.)

---

## 7. Definition of Ready check

| DoR item | Status |
|---|---|
| Objective | A clinic user who selects Thai sees Grooming, Inpatient, EMR and Pets entirely in Thai (except E-1..E-4), with no English fallback and no raw keys, on tablet and web |
| Actors & roles | §3.1 |
| Permission codes | No change (§3). Existing codes listed in §3.1 |
| Exceptions | §7.1 |
| NFR impact | §7.2 |
| Testable AC | PM AC as amended in §6. Every AC now has an automated or evidence-based check |
| Dependencies & risks | §7.3 |

### 7.1 Exception cases
- **X-1** Stored enum value not in the map (legacy `'bath'`, a future status): render raw, no crash, no key string (A-5).
- **X-2** Server error in Thai mode: English server text shown (E-1). The client fallback string is Thai.
- **X-3** Language toggled while a modal is open: labels switch immediately, and form input is preserved (A-16).
- **X-4** Missing `th` key at runtime: `translate()` falls back to English. I18N-14 parity makes this unreachable for literal keys.
- **X-5** A pet/owner name in Latin script: shown as entered (E-2). The Latin-residue test uses Thai fixture names to avoid false positives.
- **X-6** User lacks `emr.view` on the Pets medical tab: S-15 shown. The server already omits the records.

### 7.2 NFR impact
- **Performance:** `i18n/index.ts` grows by about 180 keys × 2 languages (~360 lines), to ~1,080 lines. That is below the brainstorm's 1,500-line split threshold. Lookup is a plain object read, so there is no runtime cost.
- **Usability (tablet):** Thai labels run 20-40% longer (A-12 covers it). Noto Sans Thai is already loaded (`tailwind.config.js:91-92`, `index.html:11`).
- **Accessibility:** `aria-label`s in the 4 files become Thai (R-7). `Dialog` close aria stays English (E-3).
- **Security / tenancy:** none (§3). No PII in any key (keys are static UI text).
- **Clinical safety:** mistranslating S-1..S-4 could mislead staff about medication records, billing, or irreversible deletes. I18N-16 is the control.

### 7.3 Risks & dependencies
| Risk | Impact | Mitigation |
|---|---|---|
| **No native-Thai human reviewer** (human decision §6.3) | Awkward or wrong clinical Thai ships | Binding glossary (§5), 15 safety sentences fixed in advance, I18N-16 review, and wording defects after release are fixed through Lane B |
| Value/label conflation (F-9) | Corrupted `serviceType`/`feedingStatus` data in the DB | R-1 plus the A-5 payload assertions |
| EMR `saveMsg` logic and `t` shadowing (C-1, C-2) | Wrong success colour, or runtime `t is not a function` | A-7 |
| Shared `AdmitModal` (F-8) | Pets regresses without anyone noticing | A-13 |
| Should screens are 3× larger than estimated (F-6) | Schedule slip | A-17 whole-screen cut rule |
| Shared-file contention on `i18n/index.ts` | Merge conflicts | Sequence the 4 namespace tasks (PM §2 default). No arch contract needed |

Dependencies: none external. Order: I18N-14 and I18N-15 run first, then the namespace + conversion tasks per screen, then layout and tests, then I18N-16, then I18N-13.

### 7.4 Backlog items raised by this review (for @pm-agent to record)
1. ClinicDashboard date/currency hardcoded `en-US` (F-7). Not "Done".
2. Server error localisation (E-1). Needs a backend error-code → key design. Architecture-level.
3. `Dialog` shared close aria-label (E-3), plus a general sweep of shared components.
4. Existing `th` inconsistencies outside scope: `clinic.dashboard.groomingToday` "บริการอาบน้ำวันนี้" vs `nav.grooming` "อาบน้ำตัดขน"; `clinic.dashboard.inpatientsNow` "ผู้ป่วยในขณะนี้", which is ambiguous ("patients at present"). Suggested replacements: "อาบน้ำตัดขนวันนี้" and "ผู้ป่วยในปัจจุบัน".
5. An optional Buddhist-Era (พ.ศ.) display preference per clinic, if G-1 is reversed or deferred.

---

## 8. Handoff

### 8.1 → @arch-agent (Step 3.4): **recommend `arch: skipped (below threshold)`**
None of the triggers apply: no table, no service, no integration, no state machine, no transaction, and no cross-cutting authz/audit/quota/tenancy concern. The only structural choices are small and local, and the Step 4 plan can settle them: where the language→locale mapping lives (I18N-15), how value→label maps are placed (R-1), and how C-1 is fixed. Because no contract is frozen, **Step 6 must sequence, not parallelise** (CLAUDE.md), which matches PM §2. The final call belongs to the orchestrator/@arch-agent.

### 8.2 → @pm-agent (Step 4)
Fold A-1..A-17 and I18N-14..16 into the plan and work-partition manifest. Record the §7.4 backlog items. The plan must state "arch: skipped (below threshold)" if @arch-agent agrees.

### 8.3 → /grill-with-docs (Step 3.5): topics to stress-test
- **G-1** Thai mode shows **Gregorian year (ค.ศ.)**, not Buddhist Era. Why: native `<input type="date">` pickers on the same screens (vaccination dates, birth date) show Gregorian, and a 543-year gap inside clinical records is a date-confusion hazard. The cost: it is less natural for Thai staff. Put it in an ADR.
- **G-2** In English mode, EMR/Pets dates change from browser-default to `en-GB` (D/M/Y). This is a visible change for en-US browsers.
- **G-3** Stored enum values stay English (R-1), so reports and exports keep showing English service/feeding values. Is that acceptable long-term, or should they become codes? (Backlog if yes.)
- **G-4** Server error text stays English in Thai mode (E-1). Accept it for this branch?
- **G-5** BA as the sole Thai authority (§7.3 top risk). Confirm the residual risk is accepted, and that post-release wording fixes go through Lane B.
- **G-6** Record human decision §6.2 (Platform plane English-only) as an ADR so it stops appearing as an i18n gap.

---

## 9. I18N-16 Thai wording review

**Date:** 2026-09-26 · **Reviewer:** @ba-agent (sole Thai authority, human decision STEP 1 §6.3, grill G-5)
**Step / wave:** STEP 6, W6 (plan `2026-09-24-i18n-completion.md`, task I18N-16)
**Reviewed:** every `th` value in `src/frontend/src/i18n/index.ts` for `clinic.grooming.*` (27), `clinic.inpatient.*` (67), `clinic.emr.*` (55), `clinic.pets.*` (88), plus the 13 `common.*` keys the four screens call (`back cancel close delete edit loading next other refresh save saving staffNumber today`), with `common.noResults` read for comparison. The complete set was reviewed, not a sample. Evidence base: branch `feature/i18n-completion` after `1815083`. I also read the four views, `i18n.coverage.test.ts`, the four `*.i18n.test.tsx` files, `pet.service.ts`, `blood-bank.service.ts` and `prisma/seed.ts`.

### 9.1 Verdict: **APPROVE WITH DEV TASKS**

The Thai wording is approved as it stands after this review's 11 value edits. Three dev tasks remain (§9.5). **T-1 blocks the W6 integration checkpoint**, because three test assertions pin the old wording and a BA may not edit tests. T-2 and T-3 are Must items for this branch and have to land before I18N-13 (W7) and STEP 7.

### 9.2 Conformance to §5

| Check | Result |
|---|---|
| §5.4 safety sentences S-1..S-15 | 13 match the canonical Thai word for word. **S-2 and S-12 carry an explicit BA substitution** because of the discharge ruling (§9.4 item 3). The meaning is unchanged. See the table in §9.3 |
| §5.3 enum maps | Grooming status, grooming service, feeding, SOAP, anatomy, species/gender and the Pets tabs are used exactly as specified. The inpatient status map has **two explicit BA substitutions**: `admitted` and `discharged` (§9.3) |
| §5.2 glossary (96 terms) | No drift in any of the four namespaces. Terms are consistent across screens: ผู้ป่วยใน, รับเข้ารักษา, สัญญาณชีพ, อัตราการเต้นของหัวใจ/อัตราการหายใจ, ครั้ง/นาที, การตรวจรักษา, ภูมิแพ้, ประวัติการรักษา, เวชระเบียน vs บันทึกการรักษา (rule 11), and สัตว์เลี้ยง vs ผู้ป่วย (rule 10) |
| Wording rules 1–14 | No ครับ/ค่ะ, and กรุณา appears only in instructions. `(ไม่จำเป็น)` is used throughout. Numerals are Arabic, and `…` is attached without a space. Confirmations follow `…ใช่หรือไม่?`, and failures follow `…ไม่สำเร็จ`. Findings against rules 1, 6, 7 and 14 are fixed in §9.3 (register, badge vs verb, em-dash in a sentence) |
| `{placeholder}` tokens | Unchanged in every edited value (`{name}` in S-2 kept). `i18n.coverage.test.ts` token-parity check passes |
| Structure | Values only, all inside the `th` block (9 hunks). No key added, removed or renamed, and no `en` value touched |

### 9.3 Values changed (11)

| Key | Before | After | Reason |
|---|---|---|---|
| `clinic.inpatient.discharge` | จำหน่ายผู้ป่วย | *(unchanged, confirmed)* | Discharge ruling, §9.4 item 3 |
| `clinic.inpatient.confirmDischarge` (**S-2**) | จำหน่าย {name} ใช่หรือไม่? ระบบจะออกใบแจ้งหนี้ค่ารักษา | จำหน่ายผู้ป่วย {name} ใช่หรือไม่? ระบบจะออกใบแจ้งหนี้ค่ารักษา | With a pet name directly after it, bare "จำหน่าย มะลิ" reads as "sell Mali", and the invoice clause that follows reinforces that reading. The substitution keeps S-2's meaning |
| `clinic.inpatient.allDischargedOrNoneToday` (**S-12**) | ผู้ป่วยทุกรายจำหน่ายแล้ว หรือ… | จำหน่ายผู้ป่วยครบทุกรายแล้ว หรือวันนี้ยังไม่มีการรับเข้ารักษา | Same rule: "จำหน่าย" always takes ผู้ป่วย as its object. Meaning unchanged |
| `clinic.inpatient.statusDischarged` (§5.3) | จำหน่ายแล้ว | จำหน่ายผู้ป่วยแล้ว | A bare "จำหน่ายแล้ว" badge is the retail phrase for "sold (out)". This is the worst case of the ambiguity |
| `clinic.inpatient.statusAdmitted` (§5.3) | รับเข้ารักษา | รับเข้ารักษาแล้ว | The status was identical to the `admitPatient` submit button, so a state read like an action. It now matches the other completed-state labels (นัดไว้แล้ว, เสร็จแล้ว, ยกเลิกแล้ว, จำหน่ายผู้ป่วยแล้ว) |
| `clinic.inpatient.noActiveAdmissions` (#76) | ไม่มีผู้ป่วยในขณะนี้ | ไม่มีผู้ป่วยในที่รักษาอยู่ | "ผู้ป่วยในขณะนี้" splits two ways ("no inpatients now" or "no patients at the moment"). §7.4 item 4 already flagged the same phrase on the Dashboard. The new value mirrors `activeAdmissionsOther` (ผู้ป่วยในที่รักษาอยู่ {n} ราย). This is the one change to a glossary term, and it is recorded here |
| `clinic.emr.fileTooLarge` | ไฟล์มีขนาดใหญ่เกินไป — ขนาดสูงสุดคือ 25 MB | ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 25 MB) | An em-dash joining two clauses is not Thai sentence style. The new value reuses the exact limit phrase from `attachmentTypesHint` (สูงสุด 25 MB) |
| `clinic.emr.noResults` | ไม่พบผลลัพธ์ | ไม่พบข้อมูล | Same concept, same word: `common.noResults` is ไม่พบข้อมูล |
| `clinic.pets.selectOwnerHint` | เลือกเจ้าของจากรายการเพื่อดูสัตว์เลี้ยงของเขา | เลือกเจ้าของจากรายการเพื่อดูข้อมูลสัตว์เลี้ยง | "ของเขา" is conversational (rule 1 register). The new value matches `petProfileHeading` ข้อมูลสัตว์เลี้ยง |
| `clinic.pets.inactiveBadge` | ปิดใช้งาน | ปิดใช้งานแล้ว | As a badge it read as the "Deactivate" action. It is a state, so it takes แล้ว |
| `clinic.pets.deleteBlockedActivePets` | …เจ้าของมีสัตว์เลี้ยงที่ยังใช้งานอยู่ | ไม่สามารถลบได้: เจ้าของยังมีสัตว์เลี้ยงที่เปิดใช้งานอยู่ | "สัตว์เลี้ยงที่ยังใช้งานอยู่" means "pets still in use", which is wrong for animals. The new value uses the screen's own vocabulary (ปิดใช้งาน / เปิดใช้งาน) |
| `clinic.pets.deleteOwner` | ลบเจ้าของ | ลบข้อมูลเจ้าของ | "Delete the owner" becomes "delete the owner's record". It is now parallel to `editOwner` แก้ไขข้อมูลเจ้าของ |

**Deliberately not changed:** `clinic.emr.anatomyInstruction` (…ใช้ปากกาสไตลัสหรือนิ้วในการวาด). It is slightly stiff but correct, and `ClinicEMR.i18n.test.tsx:240` pins it, so changing it isn't worth a test edit. `clinic.pets.weightOptional` (น้ำหนัก กก. (ไม่จำเป็น)) stays because the alternative stacks two parentheses. `clinic.emr.saveRecord` (บันทึกข้อมูล) stays because "บันทึกบันทึกการรักษา" would be worse.

### 9.4 Rulings on the flagged items

**Item 1: EMR (W4) strings not in the glossary.** All 8 are ruled as follows and are now part of the glossary.
| Key | Final Thai | Ruling |
|---|---|---|
| `attachmentTypesHint` | JPG, PNG, GIF, WebP, PDF, Word, Excel · สูงสุด 25 MB | **Keep.** File-format and product names fall under the rule 14 brand/product exemption. The commas stay because these are Latin tokens, not a Thai phrase (rule 5 does not apply). **`MB` is added to E-4** as a Latin technical unit ("เมกะไบต์" is longer and less recognisable to users) |
| `stockLabel` | คงเหลือ: {qty} {unit} | **Keep.** คงเหลือ ("remaining on hand") is the pharmacy counter term. `{unit}` is data (E-2) |
| `noResults` | ไม่พบข้อมูล | **Changed** (§9.3) to match `common.noResults` |
| `searching` | กำลังค้นหา… | **Keep.** Follows the กำลัง…… pattern (#18, #19) and rule 4 |
| `saveBeforeAttaching` | กรุณาบันทึกเวชระเบียนก่อนแนบไฟล์ | **Keep.** Deliberately parallel to S-6 (กรุณาบันทึกเวชระเบียนก่อนเพิ่มรายการยา). Rule 11 would give "บันทึกการรักษา", but "กรุณาบันทึกบันทึกการรักษา…" doubles the verb. กรุณา is allowed because the sentence asks the user to act |
| `fileTooLarge` | ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 25 MB) | **Changed** (§9.3). `ClinicEMR.i18n.test.tsx:357` matches `/ขนาดใหญ่เกินไป/` and still passes |
| `unsupportedFileType` | ไม่รองรับไฟล์ประเภทนี้ | **Keep** |
| `failedToDeleteAttachment` | ลบไฟล์แนบไม่สำเร็จ | **Keep.** Rule 7 + #16 + #91 |

**Item 2: Pets (W5) strings not in the glossary.**
| Key | Final Thai | Ruling |
|---|---|---|
| `noPetsYet` | ยังไม่มีสัตว์เลี้ยง เพิ่มได้จากด้านบน | **Keep.** Follows the ยังไม่มี… empty-state pattern, with a space between the clauses |
| `noVaccinationRecords` | ยังไม่มีประวัติการฉีดวัคซีน | **Keep.** Parallel to `noMedicalRecords` (ยังไม่มีประวัติการรักษา) |
| `selectOwnerHint` | เลือกเจ้าของจากรายการเพื่อดูข้อมูลสัตว์เลี้ยง | **Changed** (§9.3). Needs a test update (T-1) |

**Item 3: the discharge word. Ruling: keep "จำหน่าย", with a binding rule that it always takes ผู้ป่วย as its object.**
- Options weighed:
  - **"ให้กลับบ้าน / กลับบ้านแล้ว"** is clear, but it is **wrong for every non-home outcome**. In this system `discharged` also closes admissions that end in death, transfer or discharge against advice, because the invoice is generated either way. "กลับบ้านแล้ว" on a deceased patient's record is factually wrong and distressing for staff and owners. Rejected.
  - **"ออกจากโรงพยาบาล"** is neutral, but it is too long for a tablet button (rule 13), and many tenants are clinics, not hospitals. Rejected.
  - **"จำหน่ายออก"** is the accounting phrase for writing off stock or assets, so it adds a second ambiguity. Rejected.
  - **"จำหน่าย"** is the Thai medical-record term for discharge. It is outcome-neutral, the natural counterpart of รับเข้ารักษา, and short. The grill's risk (G-5) is real, but it appears **only when the word stands alone or sits directly before an animal's name**: "จำหน่าย มะลิ" reads as "sell Mali", and a bare "จำหน่ายแล้ว" badge reads as "sold". With ผู้ป่วย as the object ("จำหน่ายผู้ป่วย") it is a fixed clinical phrase that no one reads as selling.
- **Binding rule (added to §5.1 as rule 15):** "จำหน่าย" is never used bare and never directly before a pet name. It is always **จำหน่ายผู้ป่วย**.
- Applied in all four places: the action button `discharge` = จำหน่ายผู้ป่วย (confirmed), `statusDischarged` = จำหน่ายผู้ป่วยแล้ว, S-2 = จำหน่ายผู้ป่วย {name} ใช่หรือไม่? …, and S-12 = จำหน่ายผู้ป่วยครบทุกรายแล้ว…
- The sell-ambiguity is noted and mitigated by construction, not accepted as a residual risk. If staff still misread it after release, the fallback is a Lane B wording fix to "สิ้นสุดการรักษาใน…" (not "กลับบ้าน", for the outcome reason above).

**Item 4: EMR weight unit `kg` untranslated. Ruling: not acceptable, fix in this branch (Must).** It breaks rule 8 (kg → กก.) and rule 14. R-7 lists `VitalStepper` `unit` props as an in-scope surface. On screen, Thai mode shows the label "น้ำหนัก (กก.)" next to the unit "kg", two scripts for one unit, while ครั้ง/นาที in the same vitals block is translated. The fix is a one-line change that adds no key, because `clinic.pets.kgUnit` (kg / กก.) already exists and R-6 says to reuse it. → **T-2.**

**Item 5: EMR sidebar species chip shows raw `feline`/`canine`. Ruling: fix in this branch (Must), as a small shared map.** `canine`/`feline`/`avian`/`other` are *known* values with a §5.3 label, so they are not an E-2 "unknown enum value" exemption. Showing them raw breaks R-1 and the DoR objective ("no English fallback"). **The review found a second instance that QA did not flag: `ClinicInpatient.tsx:622` also renders `{hospit.pet.species}` raw on an in-scope screen.** Copying the map into two more views would make three copies of one value→label table, so it becomes one shared helper used by Pets, EMR and Inpatient. Module placement follows `.claude/standards/architecture-rules.md` and is Dev A's call. Blast radius: 1 new file and 3 view edits, all display-only. → **T-3.** `ClinicVaccinationsDue.tsx:80` has the same defect but is outside this branch's four screens, so it goes to the backlog (§9.6).

**Item 6: non-canonical stored species `Cat`/`cat`/`Dog`/`dog`. Ruling: add display aliases in the shared map now (in T-3), AND backlog the vocabulary cleanup. Do not accept it as it is.**
- Why not "accept": the values are not stray dev-DB rows. **`prisma/seed.ts` writes `'Dog'`/`'Cat'` (5 pets), and `pet.service.ts:10` accepts any string (`z.string().min(1).max(50)`)**, so every fresh environment, and any production row created through the API outside the Pets form, shows raw English in Thai mode.
- Why aliases are R-1/ADR-0030 compliant: an alias is a lookup on the *display* path only (`dog` → `clinic.pets.speciesCanine` label, `cat` → `clinic.pets.speciesFeline` label). The stored value stays byte-identical, no row is rewritten, and no payload changes. `speciesLabel()` already lower-cases, so `Cat`/`cat` both resolve.
- Why cleanup is backlog rather than this branch: rewriting stored values is a data migration (@db-agent veto scope), and the split vocabulary has a **behavioural consequence outside i18n** (§9.6 item 1). That needs its own Lane A/B item, not a presentation branch.

### 9.5 Dev tasks for the orchestrator to route (Dev A, sequential)

```
Task ID: I18N-16-T1   (BLOCKING: the W6 integration checkpoint is red until this lands)
Objective: Re-align 3 test assertions with the BA-approved Thai wording from §9.3
File scope: src/frontend/src/__tests__/ClinicInpatient.i18n.test.tsx,
            src/frontend/src/__tests__/ClinicPets.i18n.test.tsx   (test files only, no source change)
Exact change:
  - ClinicInpatient.i18n.test.tsx:129  getByText('รับเข้ารักษา')  → getByText('รับเข้ารักษาแล้ว')   // statusAdmitted
  - ClinicInpatient.i18n.test.tsx:338  toHaveBeenCalledWith('จำหน่าย มะลิ ใช่หรือไม่? ระบบจะออกใบแจ้งหนี้ค่ารักษา')
                                       → toHaveBeenCalledWith('จำหน่ายผู้ป่วย มะลิ ใช่หรือไม่? ระบบจะออกใบแจ้งหนี้ค่ารักษา')  // S-2
  - ClinicPets.i18n.test.tsx:214       'เลือกเจ้าของจากรายการเพื่อดูสัตว์เลี้ยงของเขา' → 'เลือกเจ้าของจากรายการเพื่อดูข้อมูลสัตว์เลี้ยง'
Note: this is a wording re-alignment, not an A-9 exception. The tests keep their intent; only the pinned
  literal changes, because the BA owns the wording (I18N-16 AC "finding fixed before @qa-agent sign-off").
AC:
  Scenario: the i18n suites are green after the BA wording review
    Given the §9.3 Thai values are in i18n/index.ts
    When `npx vitest run src/__tests__/i18n.coverage.test.ts src/__tests__/Clinic{Grooming,Inpatient,EMR,Pets}.i18n.test.tsx` runs
    Then all tests pass (84/84), and no other test file is modified
```

```
Task ID: I18N-16-T2   (Must, rule 8, R-7)
Objective: The EMR weight stepper shows the Thai unit in Thai mode
File scope: src/frontend/src/views/clinic/ClinicEMR.tsx, src/frontend/src/__tests__/ClinicEMR.i18n.test.tsx
Exact change: ClinicEMR.tsx:675  <VitalStepper … unit="kg" …>  → unit={t('clinic.pets.kgUnit')}
  (reuse the existing key per R-6. No new i18n key, no i18n/index.ts change. `t` is already the
  translator on this line: it renders `clinic.emr.weight`)
AC:
  Scenario: weight unit follows the app language
    Given the app language is "th" and a patient's EMR is open
    When the Vital Signs block renders
    Then the weight stepper unit reads "กก." and no "kg" text node is rendered in the vitals block
  Scenario: English is unchanged
    Given the app language is "en"
    Then the weight stepper unit reads "kg"
```

```
Task ID: I18N-16-T3   (Must, R-1, §5.3 species map, flagged items 5 + 6)
Objective: Species shows its Thai label on every in-scope screen, including legacy capitalised/short stored values
File scope: NEW shared species-label helper (placement per architecture-rules.md, e.g. src/frontend/src/utils/),
            src/frontend/src/views/clinic/ClinicPets.tsx (remove the local SPECIES_LABEL_KEYS/speciesLabel, import the shared one),
            src/frontend/src/views/clinic/ClinicEMR.tsx:609 (`{pet.species}` → shared label),
            src/frontend/src/views/clinic/ClinicInpatient.tsx:622 (`{hospit.pet.species}` → shared label),
            a unit test for the helper, plus one assertion each in ClinicEMR.i18n.test.tsx and ClinicInpatient.i18n.test.tsx
Exact change:
  - One value→label table, literal keys only (R-5): canine→clinic.pets.speciesCanine, feline→clinic.pets.speciesFeline,
    avian→clinic.pets.speciesAvian, other→common.other, PLUS display aliases dog→clinic.pets.speciesCanine,
    cat→clinic.pets.speciesFeline. Lookup is on the lower-cased value. An unmapped value renders raw (X-1).
  - Display path only. `pet.species` is never rewritten, and every form payload and the speciesChip colour lookup keep the
    stored value (R-1 / ADR-0030). Dev A decides whether speciesChip's colour lookup reuses the alias normaliser
    (a UX nicety, not required).
  - No i18n/index.ts change (every key already exists).
AC:
  Scenario Outline: stored species renders its label, stored value untouched
    Given the app language is "th" and a pet whose stored species is "<stored>"
    When the Pets profile, the EMR sidebar and the Inpatient card render that pet
    Then each shows "<label>"
    And any update request payload built from that pet still carries species "<stored>"
    Examples: canine→สุนัข · feline→แมว · avian→นก · other→อื่นๆ · Dog→สุนัข · dog→สุนัข · Cat→แมว · cat→แมว · ferret→ferret (raw, X-1)
  Scenario: every key in the shared table exists in both dictionaries
    Then the helper's unit test resolves each mapped key in `en` and `th` (the coverage scan only sees literal t('…') calls)
```

**Documentation follow-up (not a dev task, route to @scribe-agent at STEP 8, or to the orchestrator now):** `CONTEXT.md` § Localisation still says the Discharge Thai term is **PENDING**. Replace it with the §9.4 item 3 ruling: "จำหน่าย, always as จำหน่ายผู้ป่วย, never bare or directly before a pet name". This review's file scope does not include `CONTEXT.md`. Where §5.1–§5.4 disagree with §9, **§9 supersedes them**: #55, #76, the §5.3 inpatient `admitted`/`discharged` labels, S-2, S-12, the new rule 15, and `MB` added to E-4.

### 9.6 Backlog items raised by this review (for @pm-agent to record)
1. **Blood bank species check misses the canonical value (Lane B, clinical logic).** `blood-bank.service.ts:40` gives a 30-day donation interval only when the species starts with `'cat'`. A cat created through the Pets form is stored as `feline` and silently gets the 56-day canine interval. It is the same split vocabulary as item 6, with a behavioural effect.
2. **Species vocabulary canonicalisation (Lane A, @db-agent).** `seed.ts` writes `Dog`/`Cat`, the UI writes `canine`/`feline`, and `pet.service.ts` accepts any string. Decide on one vocabulary, add validation, and migrate the existing rows. After that the T-3 aliases can be removed.
3. `ClinicVaccinationsDue.tsx:80` renders `row.species` raw. It should adopt the T-3 shared helper.
4. `common.inactive` (ไม่ได้ใช้งาน) vs `clinic.pets.inactiveBadge` (ปิดใช้งานแล้ว) are two Thai words for one state. Align `common.inactive` to ปิดใช้งานแล้ว in an app-wide wording pass. It is outside this branch because `common.inactive` is not used by the four screens.
