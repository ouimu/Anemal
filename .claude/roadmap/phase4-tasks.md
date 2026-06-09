# Phase 4 Tasks — Advanced Operations & Commercial Scaling

**Phase:** 4 of 4  
**Duration:** Week 17–20  
**Focus:** Hospitalization (Inpatient), Grooming, Blood Bank, Loyalty System, Auditing & Time Restrictions  
**Agent Responsible:** DB-Agent, Dev-Agent, UIUX-Agent, QA-Agent  

---

## 📊 Status (2026-06-09)

> **Backend: ✅ COMPLETE** — all 8 modules (Branch+Shifts, Transfers, Hospitalization, Grooming, Loyalty, Audit, Login-time restriction, Blood Bank, Reminders) built as Route→Controller→Service→Repository; migration `20260606090000_phase4_multibranch` applied; `auditMiddleware` wired; reminder background worker added; `tsc --noEmit` clean. Integration tests in `tests/integration/phase4.test.ts` — **full suite green: 152 tests / 15 suites** (was 131).
>
> **Frontend: ⏳ PENDING** — Inpatient cage board, Grooming calendar, Branch/Loyalty/Blood Bank pages, admin dashboard snapshot, `/api/reports/branch-revenue` chart. **← next session.**
>
> **Deferred:** real LINE/SMS dispatch in reminder worker (currently marks `sent`).

---

## 🎯 Phase 4 Goal

ขยายขีดความสามารถของระบบเพื่อให้รองรับการบริการสัตว์แพทย์เชิงลึกและการบริหารงานพาณิชย์ขนาดใหญ่  
เมื่อจบ Phase 4: คลินิกสามารถแอดมิทสัตว์ป่วย → บันทึกคิวอาบน้ำตัดขน → บริหารคลังเลือดดอนเนอร์ → สะสมแต้มสมาชิก → และมีระบบความปลอดภัย Audit Logs และเวลาเข้างานอย่างครบถ้วน

---

## Module 4.1: Multi-Branch & Transfers

### Task 4.1.1 — Branch Management API
**Agent:** @dev-agent + @db-agent  
**Effort:** M (3 days)  
**Priority:** High  

- [ ] `POST /api/branches` — สร้างข้อมูลสาขาใหม่ภายใต้ Tenant  
- [ ] `GET /api/branches` — เรียกดูรายการสาขาทั้งหมด (Admin เท่านั้น)  
- [ ] `PUT /api/branches/:id` — แก้ไขเวลาทำการ เบอร์โทร ที่อยู่สาขา  
- [ ] พัฒนาระบบตรวจสอบ `branch_id` ใน Session เพื่อยืนยันว่าพนักงานมีสิทธิ์เข้าถึงสาขานั้น  

**Acceptance Criteria:**  
- ✅ การเพิ่ม/แก้ไขข้อมูลสาขาต้องแยกสิทธิ์ความปลอดภัยผ่าน RLS อย่างถูกต้อง  
- ✅ สามารถจัดการเวลาเปิด-ปิดและวันหยุดแยกตามสาขาได้  

---

### Task 4.1.2 — Doctor Shifts Scheduling (เวรการทำงาน)
**Agent:** @dev-agent + @uiux-agent  
**Effort:** M (2 days)  
**Priority:** Medium  

- [ ] `POST /api/branches/:id/shifts` — กำหนดวันและเวลาทำงานของหมอแต่ละคนในสาขา (บันทึกใน `doctor_shifts`)  
- [ ] `GET /api/branches/:id/shifts` — ดูตารางเวรหมอในสาขาเพื่อนำมาตรวจสอบตารางนัดหมาย  
- [ ] พัฒนาฟังก์ชันล็อกตัวเลือกสัตวแพทย์ในหน้าจอนัดหมาย โดยดึงข้อมูลจาก `doctor_shifts` เพื่อป้องกันการจองหมอที่ไม่ได้เข้าเวรสาขานั้น  

**Acceptance Criteria:**  
- ✅ ระบบตรวจสอบความขัดแย้งของเวรแพทย์และแจ้งเตือนทันทีเมื่อทำนัดนอกเวลาเข้าเวร  

---

### Task 4.1.3 — Multi-Branch Inventory Transfers
**Agent:** @dev-agent  
**Effort:** L (4 days)  
**Priority:** High  

- [ ] `POST /api/inventory/transfers` — สร้างคำขอโอนย้ายยา/สินค้าจากสาขา A ไปสาขา B  
- [ ] `PUT /api/inventory/transfers/:id/status` — ยืนยันการส่งหรือรับสินค้า (อนุมัติแล้วตัดสต็อกสาขาต้นทางเพิ่มสต็อกสาขาปลายทางใน transaction เดียว)  
- [ ] บันทึกความเคลื่อนไหว `stock_movements` คู่ขนานทั้ง `transfer_out` และ `transfer_in`  

**Acceptance Criteria:**  
- ✅ สต็อกของสาขาต้นทางต้องถูกตัดออก และสาขาปลายทางต้องเพิ่มเข้าตามจำนวนที่อนุมัติรับของ  
- ✅ การทำธุรกรรมโอนย้ายทั้งหมดต้องล้อมรอบด้วย Database Transaction (All-or-Nothing)  

---

## Module 4.2: Hospitalization (Inpatient) Care

### Task 4.2.1 — Admit & Discharge Inpatient API
**Agent:** @dev-agent  
**Effort:** M (3 days)  
**Priority:** High  

- [ ] `POST /api/hospitalizations` — บันทึกการแอดมิทสัตว์ป่วย (ระบุกรง อาการ หมอผู้รับผิดชอบ)  
- [ ] `PUT /api/hospitalizations/:id/discharge` — จำหน่ายสัตว์ป่วยกลับบ้าน (เปลี่ยนสถานะเป็น discharged และดึงเวลาบริการไปสะสมออกบิล)  
- [ ] `GET /api/hospitalizations/active` — รายชื่อสัตว์ป่วยที่กำลังแอดมิทอยู่ในสาขา  

**Acceptance Criteria:**  
- ✅ สัตว์เลี้ยงที่แอดมิทอยู่ต้องเปลี่ยนสถานะในระบบเป็น `inpatient` ในบอร์ดโปรไฟล์  
- ✅ ขั้นตอนจำหน่ายออกต้องดึงรายการค่าห้องแอดมิทส่งไปหา Billing/POS ได้ทันที  

---

### Task 4.2.2 — Daily Inpatient Care Logging (Time Slots)
**Agent:** @dev-agent + @uiux-agent  
**Effort:** L (4 days)  
**Priority:** High  

- [ ] `POST /api/hospitalizations/:id/care` — บันทึกผลการดูแลพยาบาลตามกะเวลา (Vital signs, การให้ยา, ให้อาหาร)  
- [ ] UI Dashboard บอร์ดกรงผู้ป่วยใน (Grid view of cages with quick status badges)  
- [ ] ฟอร์มบันทึกอาการดีไซน์ปุ่ม Steppers ขนาดใหญ่ เพื่อให้ผู้ช่วยพยาบาลจิ้มบันทึกบน Tablet หน้ากรงสัตว์ได้ง่าย  

**Acceptance Criteria:**  
- ✅ ระบบจัดเก็บประวัติการดูแลพยาบาลแยกตามช่วงเวลากะที่กำหนด (08:00, 12:00, 16:00, 20:00) อย่างเป็นระบบ  
- ✅ หน้าบอร์ดกรงต้องอัปเดตแบบ Real-time ตามความเคลื่อนไหวของสัตว์ป่วย  

---

## Module 4.3: Grooming Scheduler Upgrades

### Task 4.3.1 — Grooming Booking & Capacity Management
**Agent:** @dev-agent + @uiux-agent  
**Effort:** L (4 days)  
**Priority:** Medium  

- [ ] `POST /api/grooming/bookings` — จองนัดหมายอาบน้ำตัดขนสัตว์เลี้ยง กำหนดช่าง สเปคบริการ  
- [ ] พัฒนาโมดูลตรวจสอบความจุคิวสูงสุด (Grooming Capacity Monitor) เพื่อป้องกันการจองตัดขนเกินกำลังช่าง  
- [ ] UI ปฏิทินคิวงานตัดขนแยกต่างหากจากคิวตรวจแพทย์หลัก  

**Acceptance Criteria:**  
- ✅ การจองต้องติดการตรวจสอบโควตาคิวว่างในแต่ละวัน  
- ✅ ช่างตัดขน (Groomer) สามารถเข้าถึงคิวงานและเปลี่ยนสถานะเป็น in_progress/completed บนแท็บเล็ตได้สะดวก  

---

## Module 4.4: Loyalty & Membership System

### Task 4.4.1 — Points Calculation & Tiered Discounts
**Agent:** @dev-agent  
**Effort:** M (3 days)  
**Priority:** Medium  

- [ ] Trigger: เมื่อทำการชำระเงินบิล POS สำเร็จ -> คำนวณสะสมแต้มคะแนน loyalty points ตามสัดส่วนของยอดซื้อ (e.g. 100 บาท = 1 คะแนน)  
- [ ] ตรวจเช็คระดับสมาชิก (Membership Tiers e.g. Gold, Platinum) และคำนวณส่วนลดท้ายบิลจากคะแนนอัตโนมัติ  
- [ ] `POST /api/loyalty/redeem` — ดึงคะแนนสะสมแลกส่วนลดเงินสดในขั้นตอนการชำระเงินที่เคาน์เตอร์  

**Acceptance Criteria:**  
- ✅ แต้มและคะแนนสะสมต้องถูกหักลบและบันทึกประวัติลงใน `loyalty_transactions` อย่างแม่นยำ  
- ✅ ระบบ Discount Engine ต้องแสดงข้อมูลส่วนลดตรงกับบิลและระดับสิทธิ์สมาชิกของเจ้าของสัตว์  

---

## Module 4.5: Security Auditing & Login Restrictions

### Task 4.5.1 — User Activity Logs (Audit Logs)
**Agent:** @dev-agent + @db-agent  
**Effort:** M (2 days)  
**Priority:** High  

- [ ] พัฒนาระบบบันทึกความเคลื่อนไหว (Audit Log Interceptor) ใน API Gateway เพื่อบันทึกทุกคำสั่งแก้ไขหรือลบ EMR, บิลการเงิน และการปรับปรุงคลังสินค้า  
- [ ] จัดเก็บข้อมูลลงตาราง `audit_logs` (รวมถึง user ID, IP address, payload change, timestamps)  
- [ ] หน้าจอเปิดดูประวัติ Audit Log สำหรับ Admin  

**Acceptance Criteria:**  
- ✅ การลบประวัติการเงินหรือ EMR ต้องสร้าง Log ที่ไม่สามารถทำลายหรือแก้ไขย้อนหลังได้ (Write-once data)  

---

### Task 4.5.2 — Login Time Window Restrictions
**Agent:** @dev-agent  
**Effort:** S (1 day)  
**Priority:** Medium  

- [ ] `PUT /api/users/:id/restrictions` — ตั้งค่าเวลาอนุญาตเข้าใช้งานระบบของพนักงาน (Allowed start/end times)  
- [ ] ตรวจสอบเวลาปัจจุบันใน `tenantGuard` หรือ `authMiddleware` หากอยู่นอกกรอบเวลาทำการของพนักงานรายนั้นจะถูกปฏิเสธสิทธิ์เข้าสู่ระบบ  

**Acceptance Criteria:**  
- ✅ หากพนักงานพยายามเข้าใช้ระบบนอกเวลาทำงานที่กำหนด จะส่งการตอบสนอง 403 Forbidden  

---

## Module 4.6: Blood Bank Management

### Task 4.6.1 — Blood Donor Registry & Collection Logs
**Agent:** @dev-agent + @db-agent  
**Effort:** M (3 days)  
**Priority:** Medium  

- [ ] `POST /api/blood-bank/donors` — ลงทะเบียนสุนัข/แมวผู้บริจาคโลหิตพร้อมตรวจกรุ๊ปเลือด  
- [ ] `POST /api/blood-bank/collections` — บันทึกถุงเลือดที่รับบริจาค ระบุปริมาณ วันหมดอายุ และแพทย์ผู้ดูแล  
- [ ] บอร์ดสรุปถุงเลือดพร้อมใช้งาน (Blood bag inventory list with status available/used/expired)  

**Acceptance Criteria:**  
- ✅ ถุงเลือดมีสถานะอัปเดตสัมพันธ์กับวันหมดอายุและการสั่งตรวจเลือดในแล็บ  

---

### Task 4.6.2 — Transfusion Records & Safety Guards
**Agent:** @dev-agent  
**Effort:** M (2 days)  
**Priority:** Medium  

- [ ] `POST /api/blood-bank/transfusions` — บันทึกประวัติสุนัขที่ได้รับเลือด โยงถุงเลือดที่ใช้ และผลปฏิกิริยาข้างเคียง (Reactions)  
- [ ] พัฒนาระบบแจ้งเตือนความปลอดภัยเพื่อยืนยันการจับคู่หมู่เลือดระหว่าง Donor และ Recipient  

**Acceptance Criteria:**  
- ✅ การจับคู่กรุ๊ปเลือดที่ไม่เข้ากันจะแจ้งเตือนคำเตือนความเสี่ยงบนหน้าจอก่อนบันทึก  

---

## Module 4.7: Proactive Care Reminders
**Agent:** @dev-agent  
**Effort:** M (2 days)  
**Priority:** Medium  

- [ ] `POST /api/reminders` — กำหนดแจ้งเตือนดูแลสัตว์เลี้ยงเชิงรุก เช่น วันฉีดวัคซีนครั้งถัดไป วันกำหนดถ่ายพยาธิ (บันทึกใน `pet_reminders`)  
- [ ] `GET /api/reminders/due` — รายการที่ถึงกำหนดส่งแจ้งเตือนในแต่ละวัน  
- [ ] Background Worker: ค้นหารายการแจ้งเตือนที่ถึงกำหนดส่ง แล้วส่ง SMS/LINE อัตโนมัติ พร้อมอัปเดตสถานะเป็น `sent` ใน `pet_reminders`  

**Acceptance Criteria:**  
- ✅ แจ้งเตือนสุขภาพสัตว์เลี้ยงเชิงรุกถูกบันทึกและส่งอัตโนมัติอย่างแม่นยำตาม `due_date`  

---

## Module 4.8: Reports & Dashboard Upgrades

### Task 4.8.1 — Branch Revenue & Operational Analytics
**Agent:** @dev-agent + @uiux-agent  
**Effort:** M (2 days)  
**Priority:** Medium  

- [ ] `GET /api/reports/branch-revenue` — ดึงข้อมูลสรุปยอดขายแยกรายสาขา (สถิติตามประเภทสินค้า ยา การตรวจรักษา)  
- [ ] พัฒนาหน้าจอ Dashboard Snapshot สำหรับ Admin (แสดงผลจำนวนสัตว์ป่วยครองเตรง inpatient, คิวอาบน้ำตัดขน grooming, ยอดขาย POS)  
- [ ] สร้างกราฟ Recharts/Chart.js วิเคราะห์แนวโน้มบริการที่ทำรายได้สูงสุด (Top Services)  

**Acceptance Criteria:**  
- ✅ ข้อมูลแยกตามสาขาและ tenant อย่างเด็ดขาด และโหลดรวดเร็วไม่มีค้าง  

---

## Phase 4 Completion Checklist

- [ ] ทุกตารางใหม่ในฐานข้อมูลรันผ่าน SQL script แบบไม่มีข้อผิดพลาด  
- [ ] QA: ผ่านการทดสอบความปลอดภัยข้ามสาขา (Cross-branch isolation tests) 100%  
- [ ] QA: ทดสอบความถูกต้องของ RLS ใน 10 ตารางใหม่  
- [ ] UIUX: ปฏิทินจอง Grooming และแผงควบคุม Inpatient Cages รันสวยงามและรองรับ Touch targets บนแท็บเล็ต  
- [ ] Demo: Flow สมบูรณ์แบบ (บันทึกผู้ป่วยใน -> ให้การรักษา -> โอนย้ายยา -> สะสมคะแนนสะมาชิก -> ออกบิล)  

---

**Previous Phase:** [Phase 3 — Commercial & Billing](./phase3-tasks.md)

*Last Updated: 2026-05-30*
