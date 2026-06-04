# Functional Requirements — VetCare SaaS

**Version:** 1.1  
**Project:** VetCare Clinic Management SaaS  
**Target:** Multi-tenant SaaS for Veterinary Clinics (Tablet + Web + Multi-Branch)  
**Last Updated:** 2026-05-30

---

## 1. System Overview

VetCare SaaS เป็นระบบจัดการคลินิกสัตว์แบบ Multi-tenant Software-as-a-Service  
ออกแบบมาให้ทำงานได้ทั้งบน **Web Browser** (หน้าเคาน์เตอร์) และ **Tablet** (ระหว่างตรวจเคส) และขยายขีดความสามารถรองรับระบบ **Multi-Branch (หลายสาขา)** และ **Operations ขั้นสูง** เต็มรูปแบบ

### User Roles
| Role | Description | Access Level |
|---|---|---|
| Admin | เจ้าของคลินิก / ผู้จัดการระบบ | Full access within tenant (all branches) |
| Doctor | สัตวแพทย์ | EMR, Inpatient, Blood Bank, Appointment, Prescription |
| Staff | ผู้ช่วยสัตวแพทย์ / เคาน์เตอร์ / Groomer | Grooming, Appointment, Billing, Pet Profile, Retail POS |

---

## 2. Functional Requirements (FR)

### FR-01: Authentication & Authorization

| ID | Requirement | Priority |
|---|---|---|
| FR-01-01 | ระบบรองรับการ Login ด้วย email + password | Must |
| FR-01-02 | JWT Token ต้องฝัง `tenant_id`, `branch_id`, `user_id`, `role` ไว้ทุกครั้ง | Must |
| FR-01-03 | Token หมดอายุใน 8 ชั่วโมง (clinic work day) พร้อม Refresh Token | Must |
| FR-01-04 | Role-based Access Control (Admin/Doctor/Staff) | Must |
| FR-01-05 | Admin สามารถเพิ่ม/ลบ/ปิดการใช้งาน User และกำหนดสิทธิ์รายบุคคลได้ | Must |
| FR-01-06 | รองรับการจำกัดเวลาเข้าใช้งานของพนักงานรายบุคคล (Login Time Window Restrictions) | Should |

---

### FR-02: Multi-tenancy & Multi-Branch Setup

| ID | Requirement | Priority |
|---|---|---|
| FR-02-01 | แต่ละคลินิกมี subdomain เฉพาะ (e.g., `abc-clinic.vetcare.app`) | Must |
| FR-02-02 | ข้อมูลทุก Table ต้องแยกด้วย `tenant_id` อย่างเด็ดขาด | Must |
| FR-02-03 | ไม่มีทางที่ user คนหนึ่งจะเห็นข้อมูลของคลินิกอื่น | Must |
| FR-02-04 | รองรับโครงสร้าง Multi-Branch ภายใต้ Tenant เดียวกัน โดยแยกข้อมูลธุรกรรมด้วย `branch_id` | Must |
| FR-02-05 | Admin สามารถกำหนดข้อมูลสาขา เวลาเปิด-ปิด ที่อยู่ เบอร์โทรศัพท์ และเวรการทำงานของหมอ (Doctor Shifts) แยกรายสาขาได้ | Must |
| FR-02-06 | Super Admin (System level) ดูภาพรวมทุก Tenant ได้ | Should |

---

### FR-03: Pet & Owner Management (CRM)

| ID | Requirement | Priority |
|---|---|---|
| FR-03-01 | สร้าง/แก้ไข/ปิดการใช้งานโปรไฟล์เจ้าของสัตว์เลี้ยง | Must |
| FR-03-02 | รองรับระบบ Smart Onboarding เจ้าของสัตว์เลี้ยงด้วยการเชื่อมต่อเครื่องอ่านบัตรประชาชน (ID Card Reader) อัตโนมัติ | Should |
| FR-03-03 | สร้าง/แก้ไขโปรไฟล์สัตว์เลี้ยง (ชื่อ, สายพันธุ์, วันเกิด, เพศ, สี, microchip) | Must |
| FR-03-04 | บันทึกประวัติการแพ้ยา (Drug Allergies) และโรคประจำตัว (Underlying Conditions) ของสัตว์เลี้ยงแยกเป็นสัดส่วนชัดเจนเพื่อความปลอดภัยในการสั่งยา | Must |
| FR-03-05 | ถ่ายรูปสัตว์เลี้ยงจากกล้อง Tablet หรืออัปโหลดไฟล์ | Must |
| FR-03-06 | Quick Search: ค้นหาจากชื่อสัตว์, ชื่อเจ้าของ, เบอร์โทร, Microchip ID | Must |
| FR-03-07 | ระบบแจ้งเตือนเคสเฝ้าระวัง (infectious disease flag / watch flag) | Should |
| FR-03-08 | แสดงไทม์ไลน์ประวัติวัคซีน (Vaccination Records) ในโปรไฟล์สัตว์เลี้ยง | Must |
| FR-03-09 | ระบบบริหารการแจ้งเตือนดูแลสุขภาพสัตว์เลี้ยงเชิงรุก (Proactive Pet Reminders) เช่น กำหนดฉีดวัคซีน ถ่ายพยาธิ เพื่อสร้างความสัมพันธ์ต่อเนื่องกับลูกค้า | Must |

---

### FR-04: Appointment & Scheduler

| ID | Requirement | Priority |
|---|---|---|
| FR-04-01 | ปฏิทินนัดหมายแบบ Weekly/Daily View แยกตามสาขา | Must |
| FR-04-02 | กรองนัดหมายตามหมอ ห้องตรวจ หรือประเภทการนัดหมาย | Must |
| FR-04-03 | สถานะนัดหมาย: Scheduled / Confirmed / In-Progress / Completed / Cancelled / No-show | Must |
| FR-04-04 | ส่ง LINE/SMS แจ้งเตือนนัดหมายล่วงหน้า 24 ชั่วโมง อัตโนมัติ | Should |
| FR-04-05 | Doctor เห็น Today's Schedule แบบย่อบน Tablet ได้ทันที | Must |
| FR-04-06 | ตรวจจับและบล็อกการนัดซ้อนทับ (Double Booking) ของสัตวแพทย์และห้องตรวจ | Must |
| FR-04-07 | Walk-in Queue — เพิ่มสัตว์เลี้ยงเข้าคิวบริการได้โดยไม่ต้องนัดล่วงหน้า | Must |

---

### FR-05: Electronic Medical Record (EMR) & Clinical

| ID | Requirement | Priority |
|---|---|---|
| FR-05-01 | บันทึกประวัติการตรวจรักษาด้วยรูปแบบสากล SOAP Note (Subjective, Objective, Assessment, Plan) และรองรับระเบียบแบบแผน Problem Solving Pattern | Must |
| FR-05-02 | บันทึก Vital Signs (น้ำหนัก, อุณหภูมิ, ชีพจร, อัตราการหายใจ) ด้วย Touch-friendly steppers บน Tablet | Must |
| FR-05-03 | ระบบวิเคราะห์ภาพถ่ายทางการแพทย์ (PACS) รองรับการแสดงผลและบันทึกภาพเอกซเรย์ (X-ray) และอัลตราซาวด์ด้วยมาตรฐานภาพ DICOM ผ่าน Cornerstone.js | Should |
| FR-05-04 | รองรับ Mobile Image Capture ถ่ายภาพรอยโรคหรือขั้นตอนการรักษาจากอุปกรณ์มือถือแล้วส่งเชื่อมเข้า EMR ทันที | Should |
| FR-05-05 | สั่งจ่ายยา (Prescription) เชื่อมคลังยาอัตโนมัติ พร้อมตรวจเช็คสต็อกแบบ Real-time และประวัติการแพ้ยา | Must |
| FR-05-06 | สั่งตรวจทางห้องปฏิบัติการ (Lab Tests) และบันทึกผล Lab แบบเป็นโครงสร้างค่าวัดเพื่อนำมาสร้างกราฟแนวโน้ม (Lab Trending) และอัปโหลดไฟล์ PDF สรุปผล | Should |
| FR-05-07 | วาดคำอธิบายประกอบการตรวจรักษา (Visual Annotation) บนแผนภาพร่างกายสัตว์ (Anatomy Canvas/Templates) หรือบนภาพถ่ายรอยโรคโดยใช้ Stylus/Touch | Should |
| FR-05-08 | ระบบส่งออกประวัติ EMR ทั้งหมดหรือบางส่วนเป็นไฟล์ PDF สำหรับการส่งตัว (Referral) | Could |

---

### FR-06: Inventory & Multi-Branch Transfers

| ID | Requirement | Priority |
|---|---|---|
| FR-06-01 | เพิ่ม/แก้ไข/ปิดการใช้งานสินค้า (ยา, วัคซีน, วัสดุสิ้นเปลือง, สินค้าทั่วไป) | Must |
| FR-06-02 | ระบบคลังยาและสินค้าแยกจำนวนสต็อกรายสาขา (Branch Inventory Stock) | Must |
| FR-06-03 | ตัดสต็อกสินค้าในสาขานั้นๆ อัตโนมัติทุกครั้งที่มีการจ่ายยาหรือขายสินค้าหน้าร้าน | Must |
| FR-06-04 | บันทึกความเคลื่อนไหวสินค้าอย่างละเอียดผ่านระบบ Stock Card และ Stock Ledger เพื่อตรวจนับและตรวจสอบประวัติได้ง่าย | Must |
| FR-06-05 | รองรับการโอนย้ายยาและสินค้าระหว่างสาขาโดยตรง (Multi-Branch Transfer) พร้อมระบบอนุมัติรับ-ส่งสินค้า | Must |
| FR-06-06 | แจ้งเตือนเมื่อสต็อกในสาขาต่ำกว่าเกณฑ์ขั้นต่ำ (Min Stock Alert) และแจ้งเตือนยาใกล้หมดอายุแยก Lot | Must |
| FR-06-07 | สแกนบาร์โค้ดผ่านกล้อง Tablet/มือถือ หรือเครื่องสแกนเพื่อค้นหาคลังสินค้าและลงทะเบียนรับเข้า | Should |

---

### FR-07: Billing, POS & Discount Engine

| ID | Requirement | Priority |
|---|---|---|
| FR-07-01 | ดึงรายการยาและการรักษาจาก EMR มาสร้าง Invoice และใบเสร็จรับเงินอัตโนมัติ | Must |
| FR-07-02 | รองรับโหมด Retail POS สำหรับขายสินค้าสัตว์เลี้ยง (Pet Shop) หน้าร้านด้วยเครื่องสแกนบาร์โค้ดและการค้นหารวดเร็ว | Must |
| FR-07-03 | ระบบ Discounting Engine รองรับการกำหนดรูปแบบส่วนลดล่วงหน้า ส่วนลดตามสมาชิก หรือส่วนลดเฉพาะกลุ่มสินค้า | Must |
| FR-07-04 | รองรับชำระเงินหลากหลาย: เงินสด (พร้อมคำนวณเงินทอน), บัตรเครดิต, เงินโอน, และการแสดงผล Dynamic QR Code (PromptPay) บนจอ Tablet | Must |
| FR-07-05 | ออกใบเสร็จรับเงิน/ใบกำกับภาษี (VAT 7%) และส่งเข้าอีเมล/LINE ของลูกค้าได้ | Must |

---

### FR-08: Inpatient (Hospitalization) Management

| ID | Requirement | Priority |
|---|---|---|
| FR-08-01 | บันทึกการรับสัตว์ป่วยเข้ารักษาตัวในฐานะผู้ป่วยใน (Admit Inpatient) กำหนดหมายเลขกรงและแพทย์ผู้รับผิดชอบ | Must |
| FR-08-02 | บันทึกแผนการพยาบาลรายวันและประเมินอาการแยกตามช่วงเวลา (Daily Inpatient Care Time Slots, e.g., 08:00, 12:00, 16:00, 20:00) | Must |
| FR-08-03 | บันทึกการให้ยากลางวัน การให้อาหาร สัญญาณชีพ และการตรวจอาการเพื่อส่งมอบเวรพยาบาลอย่างเป็นระบบ | Must |
| FR-08-04 | บันทึกการจำหน่ายสัตว์ป่วยกลับบ้าน (Discharge) พร้อมรวบรวมค่าใช้จ่ายการแอดมิทไปออกบิลโดยอัตโนมัติ | Must |

---

### FR-09: Grooming Management

| ID | Requirement | Priority |
|---|---|---|
| FR-09-01 | ระบบจองคิวบริการตัดขน-อาบน้ำ (Grooming Booking) กำหนดช่างตัดขน (Groomer) และสเปคบริการ | Must |
| FR-09-02 | บริหารจัดการความจุคิวบริการรายวัน (Capacity Tracking) เพื่อจำกัดจำนวนสัตว์เลี้ยงไม่ให้เกินกำลังของช่าง | Must |
| FR-09-03 | แสดงสถานะคิวบริการอาบน้ำ-ตัดขนแบบ Real-time แยกออกจากคิวรักษาหลัก | Must |

---

### FR-10: Blood Bank Management

| ID | Requirement | Priority |
|---|---|---|
| FR-10-01 | บันทึกทะเบียนสัตว์เลี้ยงที่เป็นผู้บริจาคเลือด (Blood Donor Registry) พร้อมระบุหมู่เลือด (Blood Type) และผลการตรวจร่างกาย | Must |
| FR-10-02 | บันทึกประวัติการเก็บเลือด (Blood Collection Logs) ปริมาณ วันหมดอายุ และการติดตามสถานะถุงเลือด (Available, Used, Expired) | Must |
| FR-10-03 | บันทึกประวัติการได้รับเลือด (Blood Transfusion Logs) บันทึกปฏิกิริยาหลังได้รับเลือด (Reactions) และการโยงจับคู่เลือดดอนเนอร์ | Must |

---

### FR-11: Loyalty & Membership System

| ID | Requirement | Priority |
|---|---|---|
| FR-11-01 | ระบบสมาชิกแบ่งระดับชั้นความสำคัญ (Tiered Memberships e.g. Gold, Platinum) และสิทธิพิเศษส่วนลด | Must |
| FR-11-02 | สะสมแต้มคะแนนความภักดี (Loyalty Points) จากยอดการใช้บริการและการซื้อสินค้าตามสัดส่วนที่ตั้งไว้ | Must |
| FR-11-03 | รองรับการแลกแต้มสะสมเป็นส่วนลดเงินสดหรือของรางวัลในขั้นตอนชำระเงิน | Must |

---

### FR-12: Security & Activity Monitoring

| ID | Requirement | Priority |
|---|---|---|
| FR-12-01 | ระบบลงบันทึกประวัติการทำงาน of พนักงานอย่างละเอียด (Audit Logs/Activity Monitoring) ทุกการบันทึก ลบ หรือแก้ไขข้อมูลสำคัญ | Must |
| FR-12-02 | เก็บรักษารอยจารึกธุรกรรมการเงินและการสั่งจ่ายยาเพื่อความปลอดภัยระดับสูงสุดในการตรวจสอบภายใน | Must |

---

### FR-13: Reports & Analytics Dashboard

| ID | Requirement | Priority |
|---|---|---|
| FR-13-01 | ระบบวิเคราะห์รายงานรายรับรายวัน / รายเดือน (Revenue Reports) แยกรายละเอียดตามประเภทสินค้า บริการ และยอดรายสาขา | Must |
| FR-13-02 | แสดงกราฟแนวโน้มแสดงบริการที่ทำรายได้สูงสุด (Top Services) และสินค้าขายดีเพื่อประกอบการตัดสินใจของฝ่ายจัดการ | Should |
| FR-13-03 | แสดงสถิติและสถานะการดำเนินงานของคลินิกแบบ Real-time (Dashboard Snapshot) เช่น ยอดนัดหมายของสัปดาห์ คิวบริการปัจจุบัน และอัตราครองเตียงผู้ป่วยใน | Should |

---

## 3. Non-Functional Requirements (NFR)

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Performance | ค้นหาประวัติสัตว์และข้อมูลคลังยาข้ามสาขาได้รวดเร็ว (< 500ms) | 
| NFR-02 | Performance | โหลดหน้าจอหลักและคิวการทำงานน้อยกว่า 2 วินาที (3G network) |
| NFR-03 | Security | HTTPS บังคับใช้อย่างเข้มงวดในทุก Endpoint และการเชื่อมต่อ |
| NFR-04 | Security | รหัสผ่านผู้ใช้งานเข้ารหัสด้วย bcrypt (cost factor ≥ 12) เท่านั้น |
| NFR-05 | Security | ข้อมูลธุรกรรมและประวัติการรักษาเข้ารหัสระหว่างจัดเก็บ (Data encrypted at rest - AWS RDS) |
| NFR-06 | Availability | ระบบทำงานได้อย่างต่อเนื่อง Uptime ≥ 99.5% |
| NFR-07 | Backup | ระบบสำรองข้อมูลอัตโนมัติรายวัน (Daily Backup) พร้อมเก็บประวัติย้อนหลัง 30 วัน |
| NFR-08 | Responsive | อินเตอร์เฟสรองรับ Tablet ≥ 768px และ Desktop ≥ 1024px |
| NFR-09 | Touch UX | องค์ประกอบปฏิสัมพันธ์และปุ่มกดบน Tablet ต้องมีขนาดไม่น้อยกว่า 44×44px |
| NFR-10 | Offline | รองรับการบันทึกข้อมูลอาการผู้ป่วยเบื้องต้นบน Tablet ชั่วคราวเมื่ออินเทอร์เน็ตขาดหาย |
| NFR-11 | Scalability | สถาปัตยกรรมแบบ Multi-Tenant รองรับการให้บริการคลินิกพร้อมกันไม่น้อยกว่า 1,000 คลินิก |

---

## 4. Integration Requirements

| System | Purpose | Priority |
|---|---|---|
| LINE Messaging API | ส่งแจ้งเตือนคิว นัดหมายล่วงหน้า และใบเสร็จรับเงินอิเล็กทรอนิกส์ให้เจ้าของสัตว์ | Should |
| Twilio / Short SMS | ส่งข้อความ SMS ทางโทรศัพท์มือถือกรณีลูกค้าไม่ได้เชื่อมต่อ LINE | Could |
| Omise / Stripe | ระบบรับชำระเงินออนไลน์และบริการชำระเงินตัดผ่านบัตรเครดิต | Must |
| AWS S3 / Cloudflare R2 | แหล่งจัดเก็บรูปภาพสัตว์ ผลตรวจ Lab และไฟล์ภาพเอกซเรย์/อัลตราซาวด์ DICOM | Must |
| PromptPay QR Engine | ระบบสร้างภาพ QR Code อัตโนมัติสำหรับการโอนเงินจ่ายผ่านแอปพลิเคชันธนาคาร | Must |
| Cornerstone.js Engine | ไลบรารีสำหรับแสดงผลและควบคุมภาพเอกซเรย์แบบ DICOM บนหน้าเว็บ EMR | Should |

---

*Document Version: 1.1 | VetCare SaaS | 2026-05-30*
