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

## ✅ Status (2026-06-05) — IMPLEMENTED

Phase 3 core delivered & green (131 backend tests pass, FE+BE tsc clean). Flat tenant-scoped
inventory model (per decision); branch scoping stays Phase 4.

**Done:**
- **3.1 Inventory** — `Product` API (`/api/products` CRUD, `stock-in`, `alerts`, `:id/movements`), tenant-scoped `StockMovement` ledger, auto-deduct on prescription dispense (+restock on cancel). `ClinicInventory.tsx` (search/filter, KPI alerts, add/edit/stock-in modals).
- **3.2 Billing/POS** — `Invoice` API (`/api/invoices` create + auto-pull from visit + retail stock deduction, `INV-YYYY-MM-NNNN`, payment), 7% VAT + discount. `ClinicBilling.tsx` POS (cart, cash change, payment methods, success modal, browser-print receipt).
- **3.3 Reports** — `/api/reports/{revenue,top-services,inventory-usage,snapshot}`; dashboard revenue chart (recharts) + inventory-alerts + revenue KPIs.
- **3.4 Subscription** — `/api/subscription/status` + plan user-limit enforcement (402) wired into user creation; `SubscriptionTab` shows usage vs limit.

**Deferred to Phase 4** (per scope decision): camera barcode scanning, PDF receipts (pdfkit) + email send, real PromptPay QR (node-qrcode/EMVCo) & Omise/Stripe gateway + webhooks, per-branch `branch_inventory` + transfers, full subscription billing tables/cron.

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

- [x] Full Flow: รับผู้ป่วย → EMR → จ่ายยา (ตัดสต็อก+ledger) → ออกใบเสร็จ → รับชำระ → พิมพ์ใบเสร็จ
- [x] Inventory: stock-in/auto-deduct/alerts ถูกต้อง (inventory.test — 10 cases)
- [x] Billing: invoice generation, invoiceNo, retail deduction, payment (invoice.test — 9 cases)
- [x] Reports: revenue/top-services/snapshot tenant-scoped (reports.test — 5 cases)
- [x] Subscription: status + user-limit 402 (subscription.test — 3 cases)
- [x] Security: cross-tenant 404 ทุก module (inventory/invoice/reports)
- [ ] PDF receipt (deferred → Phase 4; Phase 3 uses browser-print)
- [ ] QR PromptPay gateway + refund flow (deferred → Phase 4)

---

**Previous:** [Phase 2](./phase2-tasks.md) | **Next:** [Phase 4 — Advanced Operations & Scaling](./phase4-tasks.md)

*Last Updated: 2026-06-05 — Phase 3 core COMPLETE (131 tests passing)*
