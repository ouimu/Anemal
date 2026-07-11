# Claude Execution Guide — ลำดับทำงานและ Definition of Done

## หลักสำคัญก่อนเริ่ม

อย่าใช้รายการสามข้อใน `remaining-tasks.md` เป็น source of truth เพียงแหล่งเดียว ให้ใช้ code + migration + tests + ADR ตามเอกสารชุดนี้ งาน 1 ถูก ship แล้ว ส่วนงาน 2/3 ยังไม่ ship

เอกสารนี้เป็น handoff guide ไม่ได้อนุญาตข้าม pipeline ใน `CLAUDE.md`

## Recommended delivery order

### Package A — Branch isolation security fix

ทำงาน 3 ก่อนและแยก branch/PR ของตัวเอง เหตุผล: เป็น unauthorized object access และแตะ backend contract หลาย operation ไม่ควรรวมกับ visual redesign

Expected files:

- `src/backend/controllers/hospitalization.controller.ts`
- `src/backend/services/hospitalization.service.ts`
- `src/backend/models/hospitalization.repository.ts`
- focused integration test file; เลือก extend `hospitalization-crud.test.ts` หรือสร้าง `hospitalization-branch-isolation.test.ts` ตามมาตรฐาน repo
- docs/ADR/status files ที่ pipeline กำหนด

TDD slices:

1. fixture/token สำหรับ two branches same tenant
2. failing GET other-branch = 404
3. thread `branchId` ผ่าน read path ให้ test ผ่าน
4. failing tests สำหรับ edit/delete/care/discharge พร้อม assert no side effect
5. thread branch through each mutation/repository write
6. failing active-list query override test
7. lock branch resolution to authenticated context
8. all-branch admin + cross-tenant regressions
9. full backend tests/build + QA audit

Gate questions ที่ grill ต้องตอบ:

- all-branch admin อ่านทุกสาขาได้โดย token null ใช่หรือไม่
- admin ต้อง switch branch ก่อน mutation/discharge ใช่หรือไม่
- admission ที่ branchId=null อนุญาตหรือควรถูกห้ามใน follow-up
- query `branchId` ของ `/active` ยังมี consumer ใดต้องใช้หรือไม่

### Package B — Log Care modal redesign

ทำงาน 2 เป็น frontend-only PR หลัง security fix merge เพื่อให้ modal detail GET ได้ branch-safe ก่อน

Expected files:

- `src/frontend/src/views/clinic/ClinicInpatient.tsx`
- `src/frontend/src/components/VitalStepper.tsx` (extract existing implementation)
- `src/frontend/src/views/clinic/ClinicEMR.tsx` (เปลี่ยน import)
- `src/frontend/src/__tests__/VitalStepper.test.tsx`
- `src/frontend/src/__tests__/ClinicInpatient.test.tsx`
- translation keys เฉพาะถ้าหน้านี้ใช้ i18n pattern ปัจจุบัน

TDD slices:

1. extract shared VitalStepper โดย behavior/tests เดิมไม่เปลี่ยน
2. extend `CareEntry` และ initial state
3. render 3 numeric vitals ด้วย shared control
4. feeding picklist + Other behavior
5. medication/notes controls + normalize payload
6. pending/error/success behavior
7. accessibility + 768/1024 viewport verification
8. full frontend tests/build

Gate questions ที่ clinical/BA ต้องตอบ:

- ยืนยัน controlled feeding vocabulary และคำแปล
- medication field เป็น documentation note เท่านั้น ไม่ใช่ MAR
- ทุก field optional จริงหรือมี task template ใดควร required
- ต้องเตือน outlier หรือไม่; ถ้าใช่ต้องให้ clinician กำหนด threshold ไม่ใช่ developer

### Package C — Documentation cleanup for completed staff-name task

หลัง verify PR #19 behavior ให้ลบ stale row ใน `remaining-tasks.md` และ sync canonical docs ตาม documentation-last ของ repo ไม่สร้าง code

## Commands สำหรับ verification

ใช้ script ของ workspace ปัจจุบันและอย่าทาย test count ล่วงหน้า:

```powershell
cd D:\Development\AnimalClinic\src\backend
npm test -- --runInBand
npm run build

cd D:\Development\AnimalClinic\src\frontend
npm test -- --run
npm run build
```

สำหรับ iteration ให้รัน focused file ก่อน แล้ว full suite ก่อนอ้างว่าเสร็จ ตรวจ command syntax กับ Jest/Vitest versionจริงหาก option ซ้ำกับ package script

## Functional checklist รวม

- [ ] Staff name task ไม่ถูก implement ซ้ำ
- [ ] stale backlog ของงาน 1 ถูกลบหลัง regression verification
- [ ] Care modal บันทึก HR/RR/feeding/medication ได้จริง
- [ ] blank field และ numeric type ตรง API contract
- [ ] UI ไม่อ้างว่า medication text เป็น verified administration system
- [ ] branch-scoped staff เห็นและแก้เฉพาะ hospitalization ของ branch context
- [ ] list endpoint ไม่รับ client branch override เกิน scope
- [ ] all-branch/admin semantics มี test
- [ ] cross-tenant tests เดิมยังผ่าน
- [ ] 404 ไม่เปิดเผย object existence
- [ ] ไม่มี endpoint/migration/dependency ใหม่สำหรับงาน 2/3

## Technical review checklist

- [ ] ทุก hospitalization query มี `tenantId`
- [ ] single-record query/write มี conditional `branchId`
- [ ] branch scope derive จาก verified request context
- [ ] service signature บังคับ caller ส่ง scope; ไม่มี unsafe default
- [ ] repository defense ไม่พึ่ง UI guard
- [ ] care performer select มีเฉพาะ `id,name`
- [ ] shared VitalStepper ไม่ duplicate logic
- [ ] touch targets ≥44px และไม่มี horizontal overflow
- [ ] labels/errors accessible
- [ ] no raw hex/generic Tailwind color/emoji
- [ ] negative tests assert DB unchanged

## Definition of Done

แต่ละ package จบเมื่อ:

1. acceptance criteria ในเอกสารของงานนั้นผ่าน
2. focused และ full relevant suites ผ่านจาก output รอบล่าสุด
3. TypeScript/build ผ่าน
4. BA/DB/UIUX/QA review ตาม router ของ repo ผ่าน
5. Ponytail gate ไม่มี scope/dependency/API flag
6. docs/status matrix/ADR/remaining tasks sync หลัง code
7. finish-branch pipeline จบและ main ยัง green

## สิ่งที่ห้าม Claude ทำ

- ห้ามเพิ่ม staff lookup endpoint เพราะ feature ถูกแก้ด้วย relation แล้ว
- ห้ามแก้เฉพาะ `GET /:id` แล้วประกาศว่าปิด branch gap ทั้งหมด
- ห้ามเชื่อ `req.query.branchId` มากกว่า authenticated branch context
- ห้าม hard-code normal vital ranges โดยไม่มี clinical sign-off
- ห้ามสร้าง full treatment scheduler/MAR ใน PR modal
- ห้าม copy numeric input logic จาก EMR เป็น component ชุดที่สอง
- ห้ามแก้ unrelated modules หรือรวม security + UI ใน PR เดียว

## Evidence index

Repo:

- `.claude/roadmap/ACTIVE/remaining-tasks.md`
- `docs/adr/0011-care-history-scoped-to-admitted-board.md`
- `docs/adr/0013-billing-pipeline-thai-font-receipt-filters-staffname.md`
- `src/backend/prisma/schema.prisma`
- `src/backend/prisma/migrations/20260711140000_add_care_performed_by_fk/`
- `src/backend/models/hospitalization.repository.ts`
- `src/backend/services/hospitalization.service.ts`
- `src/backend/controllers/hospitalization.controller.ts`
- `src/backend/routes/hospitalization.routes.ts`
- `src/backend/tests/integration/phase4.test.ts`
- `src/backend/tests/integration/hospitalization-crud.test.ts`
- `src/frontend/src/views/clinic/ClinicInpatient.tsx`
- `src/frontend/src/views/clinic/ClinicEMR.tsx`
- `src/frontend/src/__tests__/ClinicInpatient.test.tsx`
- `src/frontend/src/__tests__/VitalStepper.test.tsx`

External primary/vendor references:

- [OWASP API1:2023 Broken Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)
- [OWASP Multi-Tenant Application Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
- [Prisma referential actions](https://www.prisma.io/docs/orm/v6/prisma-schema/data-model/relations/referential-actions)
- [Vetspire NOVA Board](https://manual.vetspire.com/vetspire-user-manual/ok/Commercial/use-the-novasheet)
- [Vetspire encounter sections](https://manual.vetspire.com/vetspire-user-manual/ok/Commercial/encounter-sections)
- [ezyVet Vet Radar patient sheets](https://docs.ezyvet.com/en/browse-documentation/vet-radar/patient-whiteboard/patient-sheets/about-patient-sheets)
- [ezyVet complete a treatment task](https://docs.ezyvet.com/en/browse-documentation/vet-radar/patient-whiteboard/treatment-tasks/complete-a-treatment-task)
- [NIH animal medical-record guideline](https://oacu.oir.nih.gov/system/files/media/file/2023-12/a2_medical_records.pdf)
- [Apple touch target guidance](https://developer.apple.com/design/tips/)
- [WCAG 2.2 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
