# QA Protocols — Anemal SaaS

**Owner:** QA-Agent  
**Applies To:** All Phases  
**Review Cycle:** Every Sprint End + Before every Production Deploy  

---

## Protocol 1: Code Review & Security Check

**ทำโดย:** @qa-agent + @db-agent  
**ทริกเกอร์:** ทุก Pull Request ที่เกี่ยวกับ Database queries หรือ API endpoints

### Checklist

#### Database Security
- [ ] ทุก Query มี `WHERE tenant_id = :tenantId` (หรือ Prisma where clause)
- [ ] ไม่มีการ query แบบ `findUnique({ where: { id: X } })` โดยไม่ระบุ `tenant_id`
- [ ] ไม่มี Raw SQL ที่ไม่ผ่าน parameterized query
- [ ] RLS session variable ถูก set ก่อน Query ทุกครั้ง

#### API Security
- [ ] ทุก route ผ่าน `tenantGuard` middleware
- [ ] RBAC ตรวจสอบ role ก่อน action (ไม่ใช้ client-provided role)
- [ ] Response ไม่ include `password_hash` หรือ field ที่ sensitive
- [ ] File upload: ตรวจสอบ MIME type จาก magic bytes (ไม่ใช่ extension)
- [ ] Input validation ด้วย Zod ทุก endpoint

#### Cross-Tenant Test (Run Automatically)
```bash
# รัน security test suite ก่อน merge ทุก PR
npm run test:security
```

---

## Protocol 2: Responsive & Touch Interaction Review

**ทำโดย:** @uiux-agent  
**ทริกเกอร์:** ทุก UI feature ที่ complete

### Device Test Matrix

| Device | Resolution | OS | Priority |
|---|---|---|---|
| iPad 10th Gen | 1080×1668 | iPadOS 17 | Critical |
| Samsung Galaxy Tab S8 | 1600×2560 | Android 13 | Critical |
| MacBook Chrome (Desktop) | 1440×900 | macOS | High |
| Windows Chrome (Desktop) | 1920×1080 | Windows 11 | High |

### Touch Interaction Checklist

- [ ] ทุก button, link, input: min 44×44px (วัดด้วย DevTools element inspector)
- [ ] Spacing ระหว่าง tappable elements: ≥ 8px
- [ ] ไม่มี hover-only states (ต้องทำงานโดยไม่ hover ได้)
- [ ] Virtual keyboard ไม่บัง primary action button
- [ ] Scroll behavior ลื่นไม่กระตุก (ใช้ momentum scrolling)
- [ ] ทดสอบ Portrait + Landscape orientation ทั้งสอง
- [ ] Form: Auto-focus และ Auto-scroll ไปยัง active field
- [ ] Date/Time picker ใช้ native หรือ scroll wheel (ไม่ใช้ keyboard)

---

## Protocol 3: Edge Case Simulation

**ทำโดย:** @qa-agent  
**ทริกเกอร์:** ก่อน Phase sign-off ทุก Phase

### 3.1 Data Validation Edge Cases

| Scenario | Expected Behavior |
|---|---|
| ใส่ค่าน้ำหนักสัตว์เป็นค่าติดลบ | Validation error 400 |
| ใส่ค่ายาเกิน stock ที่มี | Error: Insufficient stock |
| เบอร์โทรซ้ำในคลินิกเดียวกัน | Conflict error 409 |
| Email ไม่ถูก format | Validation error 400 |
| อัปโหลดไฟล์ .exe | Rejected (MIME type check) |
| อัปโหลดไฟล์ > 20MB | Rejected 413 |
| ชื่อสัตว์เลี้ยงว่าง | Validation error 400 |
| วันนัดหมายในอดีต | Validation error 400 |
| นัดหมายซ้อนทับหมอเดิม | Conflict error 409 |

### 3.2 Concurrent/Race Condition Tests

| Scenario | Expected Behavior |
|---|---|
| กดปุ่ม Save EMR รัว ๆ 3 ครั้ง | สร้าง record เพียงครั้งเดียว (idempotency) |
| 2 Staff จ่ายยาตัวเดียวกันพร้อมกัน | Optimistic lock → error สำหรับ 1 คน |
| สร้าง Invoice ขณะ EMR ยัง in_progress | Allow หรือ Warn (ตาม business rule) |

### 3.3 Network Resilience Tests

| Scenario | Expected Behavior |
|---|---|
| เน็ตหลุดขณะบันทึก EMR | แสดง "Offline mode" — save locally |
| กลับมาออนไลน์ | Auto-sync — แสดง success notification |
| Timeout ระหว่างชำระเงิน | ไม่ตัดเงิน 2 ครั้ง, แสดง error และให้ retry |
| Connection drop ระหว่าง file upload | Upload resume หรือ error message ชัดเจน |

### 3.4 Authorization Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Staff พยายาม delete Pet | 403 Forbidden |
| Doctor พยายาม manage Users | 403 Forbidden |
| Token หมดอายุ | 401 — redirect to login |
| ส่ง `tenant_id` ปลอมใน request body | ถูก ignore — ใช้ค่าจาก token เสมอ |
| เข้าถึง resource ของ tenant อื่น | 404 Not Found (ไม่ใช่ 403) |

---

## Protocol 4: Pre-Production Deploy Checklist

**ทำโดย:** @qa-agent + @dev-agent  
**ทริกเกอร์:** ทุกครั้งก่อน deploy to Production

```markdown
### Pre-Deploy Checklist — [Version] — [Date]

#### Code Quality
- [ ] npm run test — ผ่าน 100%
- [ ] npm run test:security — ผ่าน 100%
- [ ] TypeScript compile — ไม่มี error
- [ ] ไม่มี console.log ใน production code

#### Database
- [ ] Migration script ผ่าน dry-run
- [ ] Rollback plan เตรียมไว้
- [ ] Index ใหม่: ทำ CONCURRENTLY (ไม่ lock table)

#### Security
- [ ] Environment variables ไม่มีค่า default จาก dev
- [ ] JWT_SECRET เปลี่ยนจาก dev key
- [ ] S3 bucket permissions ถูกต้อง

#### Monitoring
- [ ] Health check endpoint ตอบสนอง
- [ ] Error tracking (Sentry) เชื่อมต่อ
- [ ] Database backup ล่าสุดถูก verify

#### Rollback Plan
- Previous version: ___________
- Rollback steps: ___________
- Rollback trigger: Error rate > 5% ใน 15 นาทีแรก
```

---

## QA Sign-off Template

ใช้ template นี้ก่อน merge PR ที่สำคัญ:

```markdown
## ✅ QA Sign-off

**Feature:** [ชื่อ Feature]  
**PR:** #[number]  
**Date:** YYYY-MM-DD  
**Reviewer:** [Name]

### Test Results

| Category | Tests | Passed | Failed |
|---|---|---|---|
| Unit Tests | X | X | 0 |
| Integration Tests | X | X | 0 |
| Security (Tenant Isolation) | X | X | 0 |
| Edge Cases | X | X | 0 |
| Tablet UX | Manual | ✅ | - |

### Issues Found
- [ ] None
- (หรือรายการ issues พร้อม severity)

### Approval
- [ ] ✅ Approved for Staging
- [ ] ✅ Approved for Production

**Notes:** [ข้อสังเกตเพิ่มเติม]
```

---

## Running Tests

```bash
# Unit + Integration tests
npm run test

# Security isolation tests only
npm run test:security

# E2E tests (Playwright)
npm run test:e2e

# Load test (k6)
k6 run tests/load/appointment-booking.js

# All tests with coverage
npm run test:coverage
```

---

*Protocol Version: 1.0 | Anemal SaaS | Updated: 2026-05-30*
