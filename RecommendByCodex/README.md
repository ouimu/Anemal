# AnimalClinic — วิเคราะห์ 3 งาน Inpatient และคู่มือส่งต่อ Claude

วันที่ตรวจ: 2026-07-11  
ฐานที่ตรวจ: working tree ปัจจุบันที่ commit `60e88e5` และ `remaining-tasks.md`

## คำตอบสั้นที่สุด

| งาน | สถานะจริงจาก source code | ควรทำอะไร | ลำดับ |
|---|---|---|---:|
| 1. Care History แสดงชื่อ staff | **ทำเสร็จแล้วใน PR #19** แต่ backlog ยังไม่อัปเดต | ห้าม implement ซ้ำ; รัน regression test แล้วลบรายการเก่าใน `remaining-tasks.md` | 3 |
| 2. เพิ่ม Vitals ใน Log Care | **ยังไม่ทำ**; API รับ 4 field แล้ว แต่ UI ไม่ส่ง | redesign เฉพาะ frontend โดยใช้ numeric input ที่มีอยู่ใน EMR, picklist สำหรับ feeding, และข้อความ medication ที่ไม่อ้างว่าเป็น MAR | 2 |
| 3. Branch isolation | **ยังเป็นช่องโหว่จริง และกว้างกว่า GET เดียว** | ส่ง `branchId` จาก authenticated context ผ่าน controller → service → repository ทุก read/write ที่อ้าง hospitalization ID; ปิด query override ของ active list; คืน 404 | 1 |

## ข้อสรุปเชิงผลิตภัณฑ์

ระบบ inpatient ที่ใช้จริง เช่น Vetspire NOVA และ ezyVet Vet Radar ออกแบบรอบ “patient sheet/treatment sheet”: เห็นผู้ป่วยเฉพาะ location, เห็นงานตามเวลา, บันทึกค่าหรือ note ตอนทำงาน และเก็บผู้ปฏิบัติงาน/การเปลี่ยนแปลงไว้ตรวจสอบได้ AnimalClinic ยังเป็นรุ่นเล็กกว่า—หนึ่ง care entry ต่อ time slot—จึงควรยืม pattern ที่เข้ากับ data model ปัจจุบัน ไม่ควรสร้าง scheduler/MAR ใหม่ในงานนี้

แหล่งเทียบหลัก:

- [Vetspire NOVA](https://manual.vetspire.com/vetspire-user-manual/ok/Commercial/use-the-novasheet): board แสดง active sheet “at your location”, treatment ตามชั่วโมง, care team และ provider
- [Vetspire encounter sections](https://manual.vetspire.com/vetspire-user-manual/ok/Commercial/encounter-sections): vitals เป็น section ชัดเจนและดูค่าก่อนหน้าได้
- [ezyVet Vet Radar — complete a treatment task](https://docs.ezyvet.com/en/browse-documentation/vet-radar/patient-whiteboard/treatment-tasks/complete-a-treatment-task): งานบางชนิดบังคับ value, รองรับ actual time และ notes
- [ezyVet Vet Radar — patient sheets](https://docs.ezyvet.com/en/browse-documentation/vet-radar/patient-whiteboard/patient-sheets/about-patient-sheets): hospital sheet ใช้บันทึก care/treatments และ monitor vitals
- [NIH animal medical-record guideline](https://oacu.oir.nih.gov/system/files/media/file/2023-12/a2_medical_records.pdf): entry ต้องมีวันที่และระบุผู้สร้างรายการ
- [OWASP API1:2023 BOLA](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/): endpoint ที่รับ object ID ต้องตรวจสิทธิ์ระดับ object
- [OWASP Multi-Tenant Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html): derive scope จาก authenticated session และ enforce ที่ data-access layer

## ลำดับอ่าน

1. `01-care-history-staff-name.md` — ทำไมงานนี้จบแล้ว และอะไรยังเป็นข้อจำกัด
2. `02-log-care-vitals-modal.md` — functional/UI/technical specification
3. `03-hospitalization-branch-isolation.md` — threat model และ contract ที่ต้องแก้ทั้งสาย
4. `04-claude-execution-guide.md` — ลำดับ pipeline, file map, tests, definition of done

## ขอบเขตของเอกสารชุดนี้

นี่คือ evidence-based recommendation และ implementation guide ตามที่ผู้ใช้ขอ ไม่ใช่ production implementation และยังไม่ถือเป็น plan ที่ผ่าน gate ของ repo เอง ก่อนลงโค้ด Claude ต้องทำ pipeline ใน `CLAUDE.md`: brainstorm → BA sign-off → grill-with-docs → write-plan → Ponytail approval → execute → QA → finish branch

Folder นี้ถูกสร้างใหม่จากสภาพว่าง (`RecommendByCodex` ไม่มีอยู่ก่อนเริ่ม) จึงไม่มีข้อมูลเก่าหลงเหลืออยู่
