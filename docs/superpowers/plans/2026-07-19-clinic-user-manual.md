# Thai Clinic User Manual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a polished, verified Thai Word manual for Staff, Doctor, and Clinic Admin users of Anemal, excluding every Platform Admin feature.

**Architecture:** Capture current Clinic-plane screens from the local seeded application, then use a reproducible Python document builder to compose a structured A4 Word manual with embedded, annotated screenshots. Render the final DOCX through LibreOffice to PDF and page PNGs; inspect every page and correct content, Thai glyph, or layout defects before delivery.

**Tech Stack:** React/Vite and Express application under test; Playwright/browser screenshots; Python `python-docx` and bundled OOXML/render helpers; LibreOffice PDF renderer.

## Global Constraints

- Cover only Clinic (`/clinic/*`), Clinic Admin (`/clinic-admin/*`), Settings (`/settings/*`), Preferences, and Login surfaces; omit all `/platform/*` material.
- Treat current UI source and permission guards in `src/frontend/src/App.tsx` as the route authority.
- Use only demonstration data and never show passwords, tokens, personally identifying clinic data, or platform-admin content in screenshots.
- Use `Leelawadee UI` for Thai and English body text; use A4 portrait as the document's named layout override.
- Apply real Word styles, real numbered lists, explicit table widths, and image captions/alt text.
- Render the final DOCX after every meaningful edit batch and inspect every page at 100% before declaring the work complete.

---

### Task 1: Establish the verified screen and permission inventory

**Files:**
- Read: `src/frontend/src/App.tsx`
- Read: `src/frontend/src/layouts/ClinicLayout.tsx`
- Read: `src/frontend/src/layouts/AdminLayout.tsx`
- Read: `src/frontend/src/layouts/SettingsLayout.tsx`
- Read: `src/frontend/src/views/clinic/*.tsx`
- Read: `src/frontend/src/views/admin/*.tsx`
- Read: `src/frontend/src/views/settings/*.tsx`
- Create: `docs/manuals/clinic-user-manual/screen-inventory.md`

**Interfaces:**
- Consumes: route and `RequirePermission` declarations from `App.tsx`.
- Produces: a screen inventory with route, purpose, expected role visibility, core user actions, and screenshot identifiers for Tasks 2 and 3.

- [ ] **Step 1: Enumerate the in-scope routes and permission gates**

Run:

```powershell
rg -n 'path=|RequirePermission' src\frontend\src\App.tsx
```

Expected: routes in `/clinic`, `/clinic-admin`, `/settings`, `/preferences`, and `/login`; do not copy any `/platform` route to the inventory.

- [ ] **Step 2: Extract visible actions from each in-scope view**

Read each listed view and record only controls that exist in its rendered UI. Use this exact inventory row format:

```markdown
| ID | Route / surface | Roles | Reader outcome | Screenshot ID |
| --- | --- | --- | --- | --- |
| `pets-owner-add` | `/clinic/pets` owner panel | Staff, Doctor with `crm.edit`, Clinic Admin by assigned permission | Add owner, then add a pet beneath that owner | `pets-owner-add` |
```

- [ ] **Step 3: Write the inventory**

Create `docs/manuals/clinic-user-manual/screen-inventory.md` with these sections in order: Access and navigation; front-clinic work; medical work; operations and sales; Clinic Admin; Settings; FAQ evidence. Mark a screen `permission-dependent` rather than asserting access when the route guard or screen source permits administrator-customized roles.

- [ ] **Step 4: Check scope mechanically**

Run:

```powershell
rg -n '/platform|Platform Admin|CustomerListView|PlatformSettingsView' docs\manuals\clinic-user-manual\screen-inventory.md
```

Expected: no matches.

- [ ] **Step 5: Commit the inventory**

```powershell
git add docs/manuals/clinic-user-manual/screen-inventory.md
git commit -m "docs: inventory clinic manual screens"
```

### Task 2: Capture and annotate demonstration screenshots

**Files:**
- Create: `docs/manuals/clinic-user-manual/screenshots/*.png`
- Create: `docs/manuals/clinic-user-manual/screenshot-manifest.md`
- Read: `docs/manuals/clinic-user-manual/screen-inventory.md`

**Interfaces:**
- Consumes: screenshot identifiers from the Task 1 inventory.
- Produces: one or more readable, sanitized PNGs per manual workflow and an image manifest mapping each file to its source screen, action, and caption.

- [ ] **Step 1: Start the local application with seeded demonstration data**

Use the repository's documented local-run steps in `HOW-TO-RUN.md`. Confirm the browser reaches the clinic login screen before recording any image. Do not capture platform-login or platform-console paths.

- [ ] **Step 2: Log in separately for Staff, Doctor, and Clinic Admin coverage**

For each role, navigate only to screens allowed by the current UI. Use generic/seeded test data and redact the browser address bar, credentials, tokens, and any sensitive values before saving screenshots.

- [ ] **Step 3: Save screenshots using deterministic names**

Use this naming contract:

```text
01-login.png
02-clinic-navigation.png
03-appointments-create.png
04-pets-owner-add.png
05-emr-soap.png
06-inpatient-log-care.png
07-inventory-adjust.png
08-billing-payment.png
09-grooming-status.png
10-admin-users.png
11-admin-roles.png
12-settings-clinic-profile.png
```

Add further numbered files where the screen inventory shows a distinct workflow that cannot be explained by one of these images.

- [ ] **Step 4: Add non-destructive callouts**

For each workflow screenshot, add numbered translucent callouts only for controls referenced in the adjacent instructions. Preserve the underlying UI text and ensure callout labels do not cover required controls.

- [ ] **Step 5: Write the screenshot manifest**

For every PNG, create one manifest row:

```markdown
| File | Route / dialog | Role used | Caption | Callouts |
| --- | --- | --- | --- | --- |
| `03-appointments-create.png` | `/clinic/appointments`, new appointment dialog | Staff | หน้าต่างสร้างนัดหมายใหม่ | 1 เลือกเจ้าของและสัตว์เลี้ยง; 2 เลือกวันและเวลา; 3 บันทึก |
```

- [ ] **Step 6: Inspect every screenshot at native resolution**

Open each PNG and verify Thai UI labels are readable, no credential is exposed, and each callout matches the manifest. Correct the source image before continuing.

- [ ] **Step 7: Commit the screenshot set and manifest**

```powershell
git add docs/manuals/clinic-user-manual/screenshots docs/manuals/clinic-user-manual/screenshot-manifest.md
git commit -m "docs: capture clinic manual screenshots"
```

### Task 3: Author the reproducible Word manual

**Files:**
- Create: `docs/manuals/clinic-user-manual/build_manual.py`
- Create: `docs/manuals/clinic-user-manual/manual-content.md`
- Create: `docs/Anemal-คู่มือการใช้งาน-Clinic-Users-TH.docx`
- Read: `docs/manuals/clinic-user-manual/screen-inventory.md`
- Read: `docs/manuals/clinic-user-manual/screenshot-manifest.md`
- Read: `docs/manuals/clinic-user-manual/screenshots/*.png`

**Interfaces:**
- Consumes: source-verified inventory, screenshot manifest, and screenshot files from Tasks 1-2.
- Produces: a `.docx` with A4 sections, embedded screenshots, a linked/manual table of contents, role labels, detailed Thai steps, visible captions, image alt text, and an appendix of permissions and troubleshooting.

- [ ] **Step 1: Draft the canonical Thai copy**

Write `manual-content.md` using these exact top-level headings:

```markdown
# คู่มือการใช้งานระบบ Anemal
## 1. เริ่มต้นใช้งาน
## 2. บทบาทและสิทธิ์การใช้งาน
## 3. งานหน้าคลินิก
## 4. เวชระเบียนและการดูแลผู้ป่วย
## 5. คลังสินค้า การเงิน และบริการ
## 6. การดูแลระบบคลินิก
## 7. คำถามที่พบบ่อย
## ภาคผนวก ก: ตารางสิทธิ์และคำศัพท์
```

For every task procedure, use: `ใช้ได้โดย`, `ก่อนเริ่ม`, numbered action steps, `ผลลัพธ์ที่ควรเห็น`, and `ข้อควรระวัง` only when the view source confirms a limitation. Use Thai terms consistently and do not include undocumented workflows.

- [ ] **Step 2: Implement document styles and page geometry**

In `build_manual.py`, create named `Normal`, `Title`, `Subtitle`, `Heading 1`, `Heading 2`, `Heading 3`, `RoleLabel`, `Caption`, and `Note` styles. Set A4 page size; 19 mm left/right margins and 18 mm top/bottom margins; `Leelawadee UI` for all Latin/Thai run font mappings; body 11.5 pt with 1.25 line spacing; title 30 pt; H1 20 pt; H2 15 pt; H3 12.5 pt. Add a muted running header and right-aligned page number in the footer.

- [ ] **Step 3: Build the cover, contents, and role guide**

Create a clean editorial cover with the manual title, covered roles, explicit statement `ไม่ครอบคลุม Platform Admin`, version, and document purpose. Follow it with a readable contents page, an explanation of role labels, and a permission matrix that uses `ขึ้นอยู่กับสิทธิ์ที่ Clinic Admin กำหนด` for custom-role cases.

- [ ] **Step 4: Build the procedure chapters and figures**

For each row in the screenshot manifest, insert the PNG below its matching procedure, cap it to the usable A4 width, add meaningful alt text, and add a Thai figure caption. Keep figures with their first explanatory paragraph where page geometry allows. Use a light blue note box for safety or permission warnings and a green role pill for role labels.

- [ ] **Step 5: Build the appendices and PDF-ready navigation**

Add a concise glossary, a complete role/permission summary, and FAQ entries grounded in LoginView, route guards, and settings views. Include a manually maintained contents list with page-independent section links or clear page references; do not rely on unmaterialized Word fields for the reader to find a chapter.

- [ ] **Step 6: Generate the Word file**

Run:

```powershell
python docs\manuals\clinic-user-manual\build_manual.py
```

Expected: `docs/Anemal-คู่มือการใช้งาน-Clinic-Users-TH.docx` exists and is non-empty.

- [ ] **Step 7: Run structural audits**

Run:

```powershell
python C:\Users\ouimu\.codex\plugins\cache\openai-primary-runtime\documents\26.715.12143\skills\documents\scripts\heading_audit.py docs\Anemal-คู่มือการใช้งาน-Clinic-Users-TH.docx
python C:\Users\ouimu\.codex\plugins\cache\openai-primary-runtime\documents\26.715.12143\skills\documents\scripts\images_audit.py docs\Anemal-คู่มือการใช้งาน-Clinic-Users-TH.docx
python C:\Users\ouimu\.codex\plugins\cache\openai-primary-runtime\documents\26.715.12143\skills\documents\scripts\a11y_audit.py docs\Anemal-คู่มือการใช้งาน-Clinic-Users-TH.docx
```

Expected: headings are hierarchical, all manual screenshots have alt text, and no blocking accessibility error remains.

- [ ] **Step 8: Commit the source and DOCX**

```powershell
git add docs/manuals/clinic-user-manual docs/Anemal-คู่มือการใช้งาน-Clinic-Users-TH.docx
git commit -m "docs: add Thai clinic user manual"
```

### Task 4: Render, proofread, and deliver the PDF-ready manual

**Files:**
- Create: `docs/manuals/clinic-user-manual/rendered/Anemal-คู่มือการใช้งาน-Clinic-Users-TH.pdf`
- Create: `docs/manuals/clinic-user-manual/proofreading-checklist.md`
- Modify: `docs/manuals/clinic-user-manual/manual-content.md`
- Modify: `docs/manuals/clinic-user-manual/build_manual.py`
- Modify: `docs/Anemal-คู่มือการใช้งาน-Clinic-Users-TH.docx`

**Interfaces:**
- Consumes: final candidate DOCX from Task 3.
- Produces: visually verified DOCX, a PDF created from it, and a checklist proving scope, Thai typography, language, and layout checks.

- [ ] **Step 1: Render DOCX to PDF and page PNGs**

Run:

```powershell
python C:\Users\ouimu\.codex\plugins\cache\openai-primary-runtime\documents\26.715.12143\skills\documents\render_docx.py docs\Anemal-คู่มือการใช้งาน-Clinic-Users-TH.docx --output_dir docs\manuals\clinic-user-manual\rendered --emit_pdf
```

Expected: one non-empty PDF and sequential `page-*.png` files in the rendered directory.

- [ ] **Step 2: Inspect every rendered page**

Open every `page-*.png` at 100% and record results in `proofreading-checklist.md`. Check exactly: no missing Thai glyphs; no mojibake; Thai tone marks and vowel positions remain readable; screenshots are sharp and captions stay attached; tables do not clip; no empty accidental pages; header/footer location is consistent; and no Platform Admin text or screen is present.

- [ ] **Step 3: Proofread the Thai content in two passes**

Pass 1 checks terminology and the accuracy of every action against the screen inventory. Pass 2 checks spelling, sentence clarity, headings, punctuation, and consistency of Staff/Doctor/Clinic Admin labels. Add a dated checklist row for each completed chapter and list the exact correction for every issue found.

- [ ] **Step 4: Correct and re-render until clean**

When a visual or textual defect is found, update `manual-content.md` or `build_manual.py`, regenerate the DOCX, and repeat Step 1 and Step 2. Do not retain a defect list with unresolved entries.

- [ ] **Step 5: Run final scope and file checks**

Run:

```powershell
rg -n '/platform|Platform Admin|CustomerListView|PlatformSettingsView' docs\manuals\clinic-user-manual\manual-content.md
Get-Item docs\Anemal-คู่มือการใช้งาน-Clinic-Users-TH.docx, docs\manuals\clinic-user-manual\rendered\Anemal-คู่มือการใช้งาน-Clinic-Users-TH.pdf | Select-Object Name, Length
```

Expected: no scope matches and both deliverables have non-zero file sizes.

- [ ] **Step 6: Commit the final QA artifacts and PDF**

```powershell
git add docs/manuals/clinic-user-manual docs/Anemal-คู่มือการใช้งาน-Clinic-Users-TH.docx
git commit -m "docs: verify Thai clinic user manual"
```
