# งาน 3 — Branch isolation สำหรับ hospitalization object access

## Verdict

นี่เป็นช่องโหว่ object-level authorization จริง (BOLA/IDOR ภายใน tenant) และควรทำก่อนงาน UX

คำอธิบายเดิมระบุ GET แต่ source code แสดงว่าปัญหากระทบ read และ mutation ที่อ้าง `:id` เพราะ controller/service/repository ส่งเพียง `tenantId` หลายจุด การแก้เฉพาะ GET จะทำให้ staff ที่มี `inpatient.manage` ยัง edit/delete/log care/discharge record ต่างสาขาได้ถ้ารู้ ID

## หลักฐาน AS-IS

- route มี permission guard ถูกต้อง: `hospitalization.routes.ts:11-17` ใช้ `inpatient.view/manage`
- `hospitalization.controller.ts:18,23,29,35` ไม่ส่ง authenticated `branchId` ไป service
- `hospitalization.service.ts:50-89` เรียก `findById`, `findByIdWithCareCount`, update/mark discharge ด้วย tenant+id
- `hospitalization.repository.ts:25-75` ใช้ `where: {id, tenantId}` ใน single-record read และ writes
- test มี cross-tenant 404 แต่ไม่มี cross-branch 404
- JWT semantics ใน repo: selected-branch staff มี `branchId`; admin/all-branch session ใช้ `null/undefined`

นอกจากนี้ `listActive` รับ `req.query.branchId` ก่อน `req.context.branchId` (`controller:12`) จึงมี adjacent gap: branch-scoped user อาจส่ง `?branchId=<other>` ได้ แม้หน้าจอไม่เปิด control นี้ UI ไม่ใช่ security boundary

## Threat model

Actor: clinic-plane user ที่ authenticate แล้วและมี `inpatient.view` หรือ `inpatient.manage` แต่ session ถูกจำกัดสาขา A

Attack:

1. เปลี่ยน numeric ID ใน `/api/hospitalizations/:id` เป็นของสาขา B
2. server ตรวจ tenant และ permission ผ่าน เพราะ user อยู่คลินิกเดียวกัน
3. query ไม่ตรวจ branch จึงคืน pet, owner, admission notes และ care history ของสาขา B
4. ถ้ามี manage permission สามารถลอง PUT/DELETE/POST care/discharge กับ ID เดียวกัน

Impact: เปิดเผย/เปลี่ยน clinical data ข้ามสาขา, care attribution ผิด, discharge สร้าง invoice ใน branch context ที่ไม่ตรง admission

จัดประเภทตาม OWASP API1:2023 เพราะ user มีสิทธิ์ใช้ function แต่ไม่มีสิทธิ์ต่อ object นั้น OWASP กำหนดให้ทุก endpoint ที่รับ object ID ตรวจ object-level access และแนะนำ enforce ใน data-access layer: [BOLA](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/), [Multi-Tenant Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)

## เปรียบเทียบกับระบบจริง

Vetspire NOVA ระบุว่า NOVABoard แสดง active sheets “at your location” และ filter ตาม provider/department/care team/ward นั่นยืนยันว่า location/branch เป็น business boundary ของ inpatient workflow ไม่ใช่แค่ visual filter: [NOVA Board](https://manual.vetspire.com/vetspire-user-manual/ok/Commercial/use-the-novasheet)

สำหรับ AnimalClinic `branchId` ใน verified JWT คือ location scope ที่เชื่อถือได้ จึงต้อง propagate ลง query; ห้ามเชื่อ query param หรือ object ID ว่าอยู่สาขาถูกต้อง

## Authorization contract ที่แนะนำ

กำหนด convention เดียวกับ appointment/invoice modules:

```ts
type BranchScope = number | null | undefined

// branchId เป็น number: record ต้องอยู่ branch นี้
// branchId เป็น null/undefined: all-branch session, ไม่เติม branch predicate
where: {
  id,
  tenantId,
  ...(branchId != null ? { branchId } : {}),
}
```

ผลลัพธ์เมื่อ record มีจริงแต่ต่าง branch = 404 ไม่ใช่ 403 เพื่อไม่ยืนยัน existence และให้เหมือน cross-tenant behavior

`branchId` ต้องมาจาก `req.context` ที่ auth middleware สร้างจาก verified token ไม่รับจาก request body/path/query สำหรับ single-record access

## Scope ที่ต้องแก้

### Controller

ส่ง `req.context?.branchId` ไปทุก operation ที่อ้าง hospitalization ID:

- `getHospitalization`
- `edit`
- `remove`
- `logCare`
- `discharge` ใช้ concrete `requireBranchId(req)` อยู่แล้ว ให้ใช้ค่าเดียวกันทั้ง authorization lookup และ invoice creation

สำหรับ `listActive`:

- ถ้า session มี branchId: ใช้ session branch เท่านั้นและ ignore/reject query branch อื่น
- ถ้า session เป็น all-branch: อนุญาต no filter หรือ optional branch filterตาม product requirement
- validate optional query branch เป็น positive integerและอยู่ใน tenant ก่อนใช้ ถ้าจะรองรับ admin filter

### Service

เปลี่ยน signature ให้ branch scope เป็น required argument เชิงโค้ด (ค่าข้างใน nullable ได้):

```ts
getHospitalization(tenantId, branchId, id)
logCare(tenantId, branchId, id, data, performedBy)
editHospitalization(tenantId, branchId, id, data)
deleteHospitalization(tenantId, branchId, id)
discharge(tenantId, branchId, id, createdBy)
```

อย่าทำ optional parameter ท้าย function แบบเงียบ ๆ เพราะ call site เก่า compile ผ่านและยังรั่ว ให้แทรก branchId ก่อน id เพื่อให้ TypeScript บังคับแก้ทุก caller

### Repository

เปลี่ยนทุก helper ที่ lookup/update/delete hospitalization row:

- `findById`
- `findByIdWithCareCount`
- `update`
- `remove`
- `markDischarged`

ให้รับ branch scope และใส่ predicate แบบเดียวกัน แม้ service guard ทำแล้ว เพราะ defense ต้องอยู่ data-access layer ด้วย

`findActive` ใช้ branch predicate อยู่แล้ว แต่ caller ต้องแก้ query override

`addCare` ไม่มี branchId column; service ต้องผ่าน branch-scoped hospitalization lookup ก่อน create หากต้องการ defense-in-depth เพิ่ม ให้ transaction ตรวจ parent ด้วย tenant+branch แล้วค่อย insert แต่ไม่ควรเพิ่ม transaction โดยไม่มีเหตุผล/benchmarkใน patch แรก

## ประเด็น nullable branch

`Hospitalization.branchId` เป็น nullable จึงต้องมี policy ชัด:

- selected-branch session ห้ามเห็น record ที่ `branchId = null`
- all-branch admin เห็นได้
- admission ใหม่จาก session ที่ไม่มี concrete branch อาจสร้าง `branchId=null` ปัจจุบัน ควรเปิด follow-up ว่าควร require branch ตอน admit หรือไม่

อย่าใช้ truthy check `branchId ? {branchId} : {}`; ใช้ `branchId != null` เพื่อให้ semantics explicit

## Test matrix บังคับ

สร้างอย่างน้อย 2 branches ใน tenant A และ 1 tenant B พร้อม user/token scope ชัด:

| Operation | same branch | other branch same tenant | other tenant | all-branch admin |
|---|---:|---:|---:|---:|
| GET `/:id` | 200 | 404 | 404 | 200 |
| GET `/active` | เห็นเฉพาะ A | ห้าม query override ไป B | ไม่เห็น | เห็น all/filter ตาม contract |
| PUT `/:id` | 200 | 404 + DB unchanged | 404 | 200 |
| DELETE `/:id` | 204 | 404 + row remains | 404 | allowed per scope |
| POST `/:id/care` | 201 | 404 + no care row | 404 | allowed per scope |
| PUT `/:id/discharge` | 200 | 404 + status/invoice unchanged | 404 | ต้องมี concrete selected branch |

เพิ่ม unit/repository assertion ถ้าทำได้ว่า branch predicate ถูกส่งจริง และ integration test ต้องตรวจ **negative side effect** ไม่ใช่แค่ status code

Regression:

- tenant isolation test เดิมยังผ่าน
- care performer-name join ยังผ่าน
- active board ของ branch ปัจจุบันยังโหลด
- branch switcher ทำให้ query cache key/refresh เปลี่ยนถูกต้อง
- admin null scope behavior ไม่พัง

## Migration/API/dependency impact

- ไม่ต้อง migration: index `(tenantId, branchId, status)` มีแล้ว
- ไม่เพิ่ม endpoint/permission/dependency
- response shape เดิม; เปลี่ยนเฉพาะ object visibility
- internal TypeScript signatures เปลี่ยนแบบ breaking เพื่อบังคับ compiler หา call sites
- ควรถือเป็น security fix และ release note ไม่ควรเปิดเผยวิธี enumerate ID ละเอียดใน public changelog

## Acceptance criteria

- branch-scoped token ไม่สามารถ read หรือ mutate hospitalization ต่าง branch ด้วย ID
- all-branch session ยังทำงานตาม policy
- server derive scope จาก JWT context เท่านั้น
- unavailable object คืน 404 เหมือน tenant isolation
- every repository path ที่แตะ single hospitalization มี tenant + conditional branch predicate
- no new endpoint/permission/migration/dependency
- backend tests/build ผ่าน และ QA มี adversarial ID-swap test

## Out of scope แต่ต้องบันทึก

- เปลี่ยน ID เป็น UUID ไม่ใช่ fix หลัก; OWASP ระบุ random ID เป็น defense-in-depth แต่ authorization ยังจำเป็น
- database row-level security ทั้งระบบ
- redesign branch RBAC หรือ user-branch assignment
- historical transfer workflow (`status='transferred'`)
