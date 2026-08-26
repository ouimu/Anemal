# Brainstorm — Role Service Tenant Scope (ป้องกันชั้นลึก) + แก้ Comment ตกยุค ADR-0019

**วันที่:** 2026-08-27
**Step:** 1 (Superpowers `/brainstorm`, input ให้ `@pm-agent`)
**สถานะ:** ⛔ รอ HUMAN APPROVE — ห้ามเขียนโค้ด/plan ก่อน sign-off (CLAUDE.md Step 1 hard gate)

## ที่มา

Scheduled task `role-service-tenant-scope-pipeline`. ตรวจกับโค้ดจริงแล้ว (verified 2026-08-27):

- [src/backend/models/role.repository.ts:163-165](src/backend/models/role.repository.ts#L163) — `countRoleUsage(roleId)` query `prisma.userRole.count({ where: { roleId } })` ตัวมันเองไม่มี tenant filter.
- [src/backend/services/role.service.ts:172-189](src/backend/services/role.service.ts#L172) — `deleteRole(tenantId, roleId)` เป็น caller เดียว. บรรทัด ~181 กัน cross-tenant ไว้ก่อนแล้ว (`if (role.tenantId !== tenantId) throw ForbiddenError`) **ก่อน** เรียก `countRoleUsage` ที่บรรทัด 184. **ไม่มีช่องโหว่ใช้งานจริงตอนนี้** — นี่คือป้องกันชั้นลึก (defence-in-depth) เท่านั้น.
- [prisma/schema.prisma:935-947](src/backend/prisma/schema.prisma#L935) — `UserRole` มีคอลัมน์ `tenantId` denormalized อยู่แล้ว (`tenantId Int // denormalized for isolation — must match user's tenantId`) พร้อม `@@unique([tenantId, userId])`. เพราะงั้นแก้แค่ `where: { roleId, tenantId }` — ไม่ต้อง join relation.
- [prisma/schema.prisma:225](src/backend/prisma/schema.prisma#L225) — comment `// Phase 8 (5-A): primary role reference (display/fallback); effective perms come from userRoles union` ตกยุคหลัง ADR-0019 แล้ว. [docs/adr/0019-single-role-per-user-retires-multi-role.md](docs/adr/0019-single-role-per-user-retires-multi-role.md) ยืนยันว่า effective perms มาจาก `roleRef` เดี่ยว ไม่ใช่ union แล้ว; `UserRole` ยังอยู่แค่เป็น assignment join table.

## แผนแก้ (ตรงตาม task spec เดิม — ยืนยันทำได้จริง)

1. `countRoleUsage(roleId, tenantId)` → `prisma.userRole.count({ where: { roleId, tenantId } })`. แก้จุดเรียกใช้ที่ `role.service.ts:184` ให้ส่ง `tenantId` เข้าไปด้วย. เพิ่ม/ปรับ unit test พิสูจน์ว่า UserRole row ที่ `roleId` เดียวกันแต่ `tenantId` ต่างกัน ไม่ถูกนับ.
2. แก้ comment ที่ schema.prisma:225 ให้ตรง ADR-0019 — ตัด "effective perms come from userRoles union" ออก เปลี่ยนเป็นประมาณ "effective perms come from this single role (ADR-0019); userRoles is the assignment join table only." แก้แค่ comment เฉยๆ ไม่กระทบ runtime, ไม่ต้อง migration.

## ตรวจ scope (Ponytail pre-check แบบไม่เป็นทางการ)

- แก้ signature query 1 ตัว + แก้จุดเรียก 1 จุด + แก้ comment 1 บรรทัด + แตะ test 1 ไฟล์. ไฟล์ที่แตะ ≤3 (role.repository.ts, role.service.ts, schema.prisma) + test 1 ไฟล์ = 4. ต่ำกว่าเกณฑ์ Ponytail ทั้ง 7 ข้อมาก (ไม่มี subsystem ใหม่, ไม่ duplicate, ไม่มี lib ที่ทำแทนได้, <10 ไฟล์, dep ใหม่ 0, endpoint ใหม่ 0).
- ไม่ต้อง migration (แก้ schema.prisma แค่ comment — ไม่ต้อง `prisma migrate`).

## ความเสี่ยง/edge case ให้ grill (Step 3.5)

- เช็คให้ชัวร์ว่าไม่มี caller อื่นเรียก `countRoleUsage` นอกจาก `role.service.ts` (ต้อง grep ทั้ง repo ก่อน write-plan).
- เช็คว่า test เดิมของ role-repository ไม่ได้ assert signature แบบ 1-arg ไว้ที่อื่น (เปลี่ยน signature จะ breaking กับ caller/test อื่นถ้ามี).
- เช็คว่า `ClinicRole.tenantId` กับ `UserRole.tenantId` sync กันเสมอ (ควรจะใช่ เพราะมี FK+unique constraint บังคับ) — ถ้าไม่ sync กรณี data-integrity ผิดพลาด อาจทำให้ count น้อยไป ควรโน้ตไว้ใน PR บรรทัดเดียว ไม่ต้องแก้ schema.

## ต้องการคำตัดสินจาก Human

Approve brainstorm นี้ (scope, แนวทาง, และข้อเท็จจริงว่าเป็น fix เชิงป้องกันไม่ใช่ bug ที่ใช้งานจริง) เพื่อให้ `@pm-agent` ไปต่อ Step 2 (แตกงาน + AC) แล้ว `@ba-agent` Step 3 sign-off แล้วต่อ mandatory Step 3.5 `/grill-with-docs`.

ตอบ "approved" (หรือขอแก้) เพื่อไปต่อ.
