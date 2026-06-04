# Phase 3 Tasks — Commercial & Billing

**Phase:** 3 of 4  
**Duration:** Week 13–16  
**Focus:** Inventory Management, POS, Billing, Subscription  
**Agent Responsible:** DB-Agent, Dev-Agent, QA-Agent  

---

## 🎯 Phase 3 Goal

ทำให้ระบบพร้อมสำหรับการใช้งานเชิงพาณิชย์จริง  
คลินิกสามารถ: จัดการคลังยา → ออกใบเสร็จ → รับชำระเงิน → ดูรายได้

---

## Module 3.1: Inventory Management

### Task 3.1.1 — Inventory API
**Agent:** @dev-agent  
**Effort:** L (4 days)

- [ ] `POST /api/products` — เพิ่มสินค้า/ยา
- [ ] `GET /api/products` — รายการสินค้า (filter by category, search by name/barcode)
- [ ] `PUT /api/products/:id` — แก้ไขราคา, ชื่อ, minimum stock
- [ ] `POST /api/products/:id/stock-in` — รับสินค้าเข้า (บันทึก lot no, expiry)
- [ ] `GET /api/products/alerts` — สินค้าสต็อกต่ำ + ใกล้หมดอายุ

---

### Task 3.1.2 — Auto Stock Deduction
**Agent:** @dev-agent  
**Effort:** M (2 days)

- [ ] Trigger: เมื่อสร้าง Prescription → ตัด `products.stock_qty` อัตโนมัติ
- [ ] Trigger: เมื่อยกเลิก Prescription → คืนสต็อก
- [ ] บันทึก `stock_movements` ทุกครั้ง (in/out/adjustment)
- [ ] ป้องกัน: ไม่ให้จ่ายยาเกินสต็อกที่มี

---

### Task 3.1.3 — Inventory UI (Tablet + Web)
**Agent:** @dev-agent + @uiux-agent  
**Effort:** L (4 days)

- [ ] รายการสินค้า: Search bar, Category filter, Stock level indicator
- [ ] Stock Alert panel: แดง (หมด), เหลือง (ใกล้หมด/ใกล้หมดอายุ)
- [ ] Barcode Scanner: ใช้กล้อง Tablet สแกน → ค้นหาสินค้า (ZXing.js)
- [ ] Form รับสินค้าเข้า (Stock In form)

---

## Module 3.2: Billing & POS

### Task 3.2.1 — Invoice Generation API
**Agent:** @dev-agent  
**Effort:** L (4 days)

- [ ] `POST /api/invoices` — สร้าง Invoice จาก `medical_record_id` (auto-pull items)
- [ ] Auto-generate `invoice_no` (format: INV-YYYY-MM-NNNN, per tenant)
- [ ] คำนวณ: subtotal, discount, VAT 7%, total
- [ ] `GET /api/invoices/:id` — ดู Invoice detail
- [ ] `PUT /api/invoices/:id/payment` — บันทึกการชำระเงิน

---

### Task 3.2.2 — PDF Receipt Generation
**Agent:** @dev-agent  
**Effort:** M (2 days)

- [ ] ใช้ `pdfkit` หรือ `puppeteer` สร้าง PDF ใบเสร็จ
- [ ] Template: Logo คลินิก, รายการบริการ/ยา, ยอดรวม, VAT
- [ ] `GET /api/invoices/:id/pdf` — download PDF
- [ ] `POST /api/invoices/:id/send-email` — ส่ง PDF ทาง email

---

### Task 3.2.3 — QR Payment (PromptPay)
**Agent:** @dev-agent  
**Effort:** M (3 days)

- [ ] Generate PromptPay QR Code จาก invoice total
- [ ] แสดง QR บนหน้าจอ Tablet (full-screen mode สำหรับให้ลูกค้าสแกน)
- [ ] Payment confirmation (manual หรือ webhook จาก payment gateway)
- [ ] Integration: Omise หรือ GB Prime Pay (สำหรับบัตรเครดิต)

---

### Task 3.2.4 — POS / Billing UI
**Agent:** @dev-agent + @uiux-agent  
**Effort:** L (5 days)

- [ ] หน้าสรุป Invoice: รายการ, ยอดรวม, ปุ่มชำระ
- [ ] Payment method selector: Cash / QR / Card (ปุ่มใหญ่)
- [ ] QR Payment screen: full-screen QR + countdown timer + "Confirm Payment" button
- [ ] Cash payment: คำนวณทอนเงิน (ใส่ยอดรับมา → แสดงเงินทอน)
- [ ] Success screen + Print/Share receipt options

---

## Module 3.3: Reports & Dashboard

### Task 3.3.1 — Revenue Reports API
**Agent:** @dev-agent  
**Effort:** M (2 days)

- [ ] `GET /api/reports/revenue?period=daily|monthly` — สรุปรายได้
- [ ] `GET /api/reports/top-services` — บริการที่ทำรายได้สูงสุด
- [ ] `GET /api/reports/inventory-usage` — สินค้าที่ใช้มากที่สุด

---

### Task 3.3.2 — Analytics Dashboard UI
**Agent:** @dev-agent  
**Effort:** M (3 days)

- [ ] Revenue chart: รายวัน / รายเดือน (Recharts / Chart.js)
- [ ] Today's summary: appointments, revenue, new patients
- [ ] Inventory alerts widget
- [ ] Upcoming vaccinations due widget

---

## Module 3.4: SaaS Subscription

### Task 3.4.1 — Subscription & Plan Management
**Agent:** @dev-agent  
**Effort:** L (4 days)

- [ ] Plan enforcement: ตรวจสอบ plan limit ก่อนทำ action (เช่น user limit per plan)
- [ ] `GET /api/subscription/status` — ดูสถานะ subscription
- [ ] Integration: Omise Subscription / Stripe สำหรับตัดเงินอัตโนมัติรายเดือน
- [ ] ส่ง Email แจ้งเตือน: trial หมด, subscription ใกล้หมด, ชำระเงินไม่สำเร็จ

---

## Phase 3 Completion Checklist

- [ ] ทดสอบ Full Flow: รับผู้ป่วย → EMR → จ่ายยา → ออกใบเสร็จ → รับชำระ QR
- [ ] ทดสอบ Inventory: สต็อกตัดถูกต้องทุกกรณี
- [ ] ทดสอบ PDF: ใบเสร็จออกมาถูกต้องตาม format
- [ ] QA: ทดสอบ Billing edge cases (ยกเลิก invoice, refund)
- [ ] Security: ทดสอบว่า invoice ข้าม tenant ไม่ได้

---

**Previous:** [Phase 2](./phase2-tasks.md) | **Next:** [Phase 4 — Advanced Operations & Scaling](./phase4-tasks.md)

*Last Updated: 2026-05-30*
