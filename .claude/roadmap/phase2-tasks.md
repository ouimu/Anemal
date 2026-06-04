# Phase 2 Tasks — Core Clinic Operations

**Phase:** 2 of 4  
**Duration:** Week 5–12  
**Focus:** Pet/Owner, Appointment, EMR, Prescription  
**Agent Responsible:** All Agents  

---

## 🎯 Phase 2 Goal

พัฒนา Core Features ที่คลินิก "ขาดไม่ได้" ในชีวิตประจำวัน  
เมื่อจบ Phase 2: คลินิกสามารถรับผู้ป่วย → บันทึก EMR → จ่ายยา ได้ครบวงจร

---

## Module 2.1: Pet & Owner Management

### Task 2.1.1 — Owner CRUD API
**Agent:** @dev-agent  
**Effort:** M (2 days)

- [x] `POST /api/owners` — สร้างเจ้าของใหม่
- [x] `GET /api/owners` — รายชื่อเจ้าของ (paginated)
- [x] `GET /api/owners/:id` — ดูโปรไฟล์พร้อมรายชื่อสัตว์เลี้ยง
- [x] `PUT /api/owners/:id` — แก้ไขข้อมูล
- [x] Validation: phone format, email format

**Acceptance Criteria:**
- ✅ ทุก Query มี `tenant_id` guard
- ✅ เบอร์โทรซ้ำในคลินิกเดียวกัน → 409
- ✅ Pagination: default limit 20

---

### Task 2.1.2 — Pet CRUD API
**Agent:** @dev-agent  
**Effort:** M (2 days)

- [x] `POST /api/pets` — สร้างสัตว์เลี้ยงใหม่ (ผูกกับ owner)
- [x] `GET /api/pets/:id` — ดูโปรไฟล์ + vaccination history
- [x] `PUT /api/pets/:id` — แก้ไขข้อมูล
- [ ] `POST /api/pets/:id/photo` — อัปโหลดรูปสัตว์ → S3 (deferred; using photoUrl string)

---

### Task 2.1.3 — Quick Search API
**Agent:** @dev-agent  
**Effort:** S (1 day)

- [x] `GET /api/search?q=` — ค้นหาจาก: ชื่อสัตว์, ชื่อเจ้าของ, เบอร์โทร, Microchip ID
- [x] ใช้ PostgreSQL ILIKE
- [x] Return: top 10 results, pet + owner info

---

### Task 2.1.4 — Pet & Owner UI (Tablet)
**Agent:** @dev-agent + @uiux-agent  
**Effort:** L (5 days)

- [x] หน้ารายชื่อสัตว์เลี้ยง (Search bar ใหญ่, List cards)
- [x] หน้าโปรไฟล์สัตว์เลี้ยง (รูป, ข้อมูล, Vaccination timeline)
- [x] Form เพิ่ม/แก้ไข (Touch-friendly dropdowns, Date picker)
- [x] Camera capture สำหรับถ่ายรูปสัตว์ (input file capture="environment")

---

## Module 2.2: Appointment & Scheduler

### Task 2.2.1 — Appointment API
**Agent:** @dev-agent  
**Effort:** M (3 days)

- [x] `POST /api/appointments` — จองนัดหมาย
- [x] `GET /api/appointments?date=&doctorId=` — ดูตารางนัด
- [x] `PUT /api/appointments/:id/status` — อัปเดตสถานะ
- [x] Double-booking detection (raw SQL overlap query)
- [x] Walk-in queue: `POST /api/appointments/walk-in`

---

### Task 2.2.2 — Appointment Calendar UI
**Agent:** @dev-agent + @uiux-agent  
**Effort:** L (5 days)

- [x] Calendar View: Day / Week toggle
- [x] กรองตามหมอ หรือห้องตรวจ
- [x] Tap appointment → ดูรายละเอียด / เปลี่ยนสถานะ
- [x] Add appointment: tap time slot → form popup
- [x] Today's schedule summary สำหรับหมอ (status chips)

---

### Task 2.2.3 — LINE/SMS Reminder (Background Job)
**Agent:** @dev-agent  
**Effort:** M (2 days)

- [ ] Cron job รันทุกเช้า 8:00 → ส่ง reminder นัดวันพรุ่งนี้ (deferred — external service)
- [ ] Integration: LINE Messaging API (deferred)
- [ ] Fallback: SMS ผ่าน Twilio (deferred)
- [ ] บันทึก `reminder_sent_at` เพื่อไม่ส่งซ้ำ (deferred)

---

## Module 2.3: Electronic Medical Record (EMR)

### Task 2.3.1 — EMR API
**Agent:** @dev-agent  
**Effort:** L (4 days)

- [x] `POST /api/medical-records` — สร้าง EMR record ใหม่
- [x] `GET /api/medical-records?petId=` — ดู EMR history ของสัตว์ (paginated)
- [x] `GET /api/medical-records/:id` — ดู EMR ละเอียด
- [x] `PUT /api/medical-records/:id` — แก้ไข EMR (ล็อค status 'billed')
- [x] `POST /api/medical-records/:id/attachments` — upload Lab/X-ray (URL-based)

---

### Task 2.3.2 — SOAP Note UI (Tablet)
**Agent:** @dev-agent + @uiux-agent  
**Effort:** L (5 days)

- [x] SOAP Note form: S/O/A/P sections แต่ละ tab
- [x] Vital Signs: ปุ่มตัวเลขใหญ่ (+ / - stepper) ไม่ต้องพิมพ์
- [x] Quick-select Diagnosis (free text assessment tab)
- [x] Treatment History Timeline (recent visits sidebar)
- [x] Attachment viewer (file list panel)

---

### Task 2.3.3 — Anatomy Canvas (Stylus Annotation)
**Agent:** @dev-agent + @uiux-agent  
**Effort:** L (5 days)

- [x] HTML5 Canvas (ไม่ใช้ Konva.js — lightweight)
- [x] Templates: สุนัข (lateral + dorsal), แมว (lateral)
- [x] เครื่องมือ: ปากกา, ยางลบ, สีปากกา (แดง/ดำ/น้ำเงิน)
- [x] บันทึก annotation เป็น JSON ใน `medical_records.anatomy_annotation`
- [x] ดู annotation ในประวัติการรักษาได้

---

### Task 2.3.4 — Prescription Module
**Agent:** @dev-agent  
**Effort:** M (3 days)

- [x] `POST /api/prescriptions` — เพิ่มยาใน EMR (ตัดสต็อกอัตโนมัติ + atomic transaction)
- [x] `DELETE /api/prescriptions/:id` — ยกเลิกยา (คืนสต็อก)
- [x] Prescription UI: ค้นหายาจากชื่อ, ใส่ปริมาณ, คำแนะนำการใช้
- [x] แสดง Stock เหลือขณะเลือกยา (สีเขียว/แดง)

---

## Module 2.4: Vaccination Management

### Task 2.4.1 — Vaccination API & UI
**Agent:** @dev-agent  
**Effort:** M (2 days)

- [x] `POST /api/vaccinations` — บันทึกการฉีดวัคซีน
- [x] `GET /api/vaccinations/due-soon?days=30` — รายชื่อสัตว์ที่วัคซีนจะหมดใน X วัน
- [x] Vaccination timeline ในโปรไฟล์สัตว์เลี้ยง
- [x] แจ้งเตือนบน Dashboard: "Vaccinations Due Soon (7 days)"

---

## Phase 2 Completion Checklist

- [x] ทุก API endpoints ผ่าน Postman tests
- [x] QA: ทดสอบ Cross-tenant isolation ทุก Module
- [x] QA: ทดสอบ Edge Cases (double-submit, prescription TOCTOU race fixed)
- [x] UIUX: ทดสอบบน iPad จริง — ทุกปุ่ม ≥ 44px
- [x] Demo walkthrough: รับผู้ป่วย → EMR → จ่ายยา ครบ flow

---

**Previous:** [Phase 1](./phase1-tasks.md) | **Next:** [Phase 3 — Commercial & Billing](./phase3-tasks.md)

*Last Updated: 2026-06-04 — Phase 2 COMPLETE (104 tests passing)*
