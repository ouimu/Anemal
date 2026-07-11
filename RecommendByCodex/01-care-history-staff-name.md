# งาน 1 — Care History แสดงชื่อ staff จริง

## Verdict

**งานนี้ทำเสร็จแล้ว ไม่ควรสร้าง endpoint หรือ migration เพิ่มอีก** สิ่งที่ค้างคือ `remaining-tasks.md` ไม่ตรงกับ code ปัจจุบัน

หลักฐานใน repo:

- `src/backend/prisma/schema.prisma:169-170, 644-651` มี relation `DailyInpatientCare.performedBy → User` ชื่อ `CarePerformedBy`
- migration `src/backend/prisma/migrations/20260711140000_add_care_performed_by_fk/` ล้าง orphan ก่อนเพิ่ม FK และใช้ `ON DELETE SET NULL`
- `src/backend/models/hospitalization.repository.ts:25-35` include `performedByUser` และ select เฉพาะ `id,name`
- `src/frontend/src/views/clinic/ClinicInpatient.tsx:460` แสดง `performedByUser.name` แล้ว fallback เป็น `Staff #id` และ `—`
- `src/backend/tests/integration/hospitalization-crud.test.ts:171-181` ตรวจชื่อจริงและ tenant isolation
- `src/frontend/src/__tests__/ClinicInpatient.test.tsx:255-282` ตรวจ fallback chain
- `docs/adr/0013-billing-pipeline-thai-font-receipt-filters-staffname.md` บันทึก decision; git มี PR #19 ที่ commit `0b6c130`

ตรงกันข้าม `remaining-tasks.md:57` ยังบอกว่าไม่มี FK จึงเป็น stale backlog entry

## งานนี้คืออะไรในมุมธุรกิจ

Care log เป็น medical-record entry ไม่ใช่เพียงข้อความ activity feed ผู้ใช้งานต้องตอบได้ว่า “ใครเป็นผู้วัด/ให้การดูแลนี้” โดยไม่ต้องจำเลข user การแสดงชื่อจึงช่วย handover, review และ accountability

นี่สอดคล้องกับระบบจริง:

- Vetspire NOVA แสดง provider/care-team ของผู้ป่วยบน board และจำกัด board ตาม location
- Vet Radar ระบุการเปลี่ยนแปลง patient sheet ตาม user account และมี approval role
- แนวทาง NIH ระบุว่า medical-record entry ต้อง dated และ indicate originator

ดังนั้น UX ที่แสดงชื่อจริงมีฐานจาก workflow จริง ไม่ใช่การตกแต่งตามความเห็นส่วนตัว

## เปรียบเทียบสองทางเลือกเดิม

### A. FK relation + join — ทางที่ระบบใช้อยู่ และควรคงไว้

ข้อดี:

- response เดิมได้ชื่อใน request เดียว; ไม่เกิด N+1 หรือ client orchestration
- FK ป้องกัน dangling ID ใหม่
- ไม่เพิ่ม endpoint/permission surface
- controller บันทึก `performedBy` จาก `req.context.userId` ไม่รับจาก client จึง spoof ผู้ปฏิบัติงานไม่ได้
- select เฉพาะ `id,name` ลดข้อมูล staff ที่เปิดเผย

ข้อเสีย/ข้อจำกัด:

- ต้อง migration และเคลียร์ orphan เดิม
- ชื่อที่แสดงเป็น **ชื่อปัจจุบัน** ของ User ไม่ใช่ historical snapshot
- เมื่อ User ถูกลบ `ON DELETE SET NULL` ทำให้แสดง `—`

### B. Staff-name lookup endpoint — ไม่แนะนำ

ข้อดีคือไม่แตะ schema แต่ต้นทุนสูงกว่า: เพิ่ม API และ permission contract, ต้อง batch IDs เพื่อไม่ให้ N+1, ต้องรับมือ partial failure/cache/stale name และสร้าง endpoint ที่อาจเผย directory staff เกินจำเป็น ถ้าทำ endpoint ต่อ id จะยิ่งช้าเมื่อ history ยาว

การมี endpoint lookup ไม่ช่วย referential integrity และยังต้องตัดสินใจเรื่องผู้ใช้ถูกลบอยู่ดี จึงไม่มีเหตุผลให้สร้างซ้ำหลัง relation ถูก deploy แล้ว

## การลบ User และความถูกต้องทางประวัติศาสตร์

`SET NULL` ถูกต้องกว่าการ cascade เพราะการลบ account ต้องไม่ลบ clinical record Prisma ระบุว่า `SetNull` ใช้กับ optional relation และจะตั้ง FK column เป็น null เมื่อ parent ถูกลบ: [Prisma referential actions](https://www.prisma.io/docs/orm/v6/prisma-schema/data-model/relations/referential-actions)

อย่างไรก็ตาม ถ้าผลิตภัณฑ์ต้องผ่านข้อกำกับที่ต้องคง identity ตลอดอายุเอกสาร ทาง relation ปัจจุบันยังไม่สมบูรณ์ เพราะ rename/delete เปลี่ยนสิ่งที่แสดง แนวทางระยะถัดไปคือเก็บ immutable snapshot เช่น `performedByNameSnapshot` ตอน insert ควบคู่ `performedBy` แต่ **ห้ามยัดเข้า task นี้** จน BA/clinical/compliance ยืนยัน requirement; ไม่เช่นนั้นเป็น scope creep

## สิ่งที่ Claude ต้องทำตอนหยิบงานนี้

1. ยืนยัน migration directory, schema relation, repository include และ 2 test suites ข้างต้นยังอยู่
2. รัน focused tests ของ backend/frontend
3. ถ้าผ่าน ให้ลบ row “Resolve DailyInpatientCare.performedBy…” จาก `.claude/roadmap/ACTIVE/remaining-tasks.md`
4. ตรวจข้อความอื่นที่ยังกล่าวว่า `Staff #id` เป็น behavior ปัจจุบัน แล้วแก้เฉพาะ canonical/status docs ตามขั้นตอน documentation-last ของ repo
5. ไม่สร้าง API, migration หรือ component ใหม่

## Acceptance criteria

- GET hospitalization ของ tenant เดียวคืน `performedByUser: {id,name}`
- tenant อื่นได้ 404 และไม่เห็นชื่อ
- UI แสดงชื่อเมื่อ relation มีค่า; fallback ปลอดภัยเมื่อข้อมูล legacy/null
- clinical care row ไม่ถูกลบเมื่อ User ถูกลบ
- backlog ไม่กล่าวว่างานนี้ยังไม่ทำ

## Risk ที่ต้องไม่สับสน

การ join staff name ถูก tenant-scoped ที่ query hospitalization แล้ว แต่ยัง **ไม่ branch-scoped** นั่นเป็นงาน 3 ไม่ใช่เหตุให้ rollback relation
