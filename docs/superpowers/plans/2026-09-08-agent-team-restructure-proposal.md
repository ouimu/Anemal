# ข้อเสนอ: ปรับโครงสร้างทีม Agent + Workflow (SDLC) ของ Anemal

**Date:** 2026-09-08 (อัปเดต 2026-09-09)
**Status:** ✅ **IMPLEMENTED — P0.5 · P1 · P2 · P3 ครบ** (2026-09-09) · เหลือ P4 retro หลังใช้จริง 3 feature
**Branch:** `chore/doc-estate-repair` (ยังไม่ commit)
**Scope:** เพิ่ม `@arch-agent` · ปรับ agent เดิม 6 ตัว · เพิ่ม lane bug/hotfix/refactor · จัดบ้าน markdown
**ยังไม่แตะ:** โค้ดใน `src/` — ข้อเสนอนี้เปลี่ยนแค่ orchestration layer (`.claude/`, `CLAUDE.md`, `docs/`)

---

## 0. สรุปสั้น

เพิ่ม agent **ตัวเดียว** (`@arch-agent`) ไม่ใช่ 4 ตัวตามภาพ — เพราะ Architecture Reviewer /
Implementation Planner / Code Reviewer ในภาพมีอยู่แล้วในทีม (`@ponytail-agent`, `@pm-agent`,
`@qa-agent`) แค่ต้องขยาย scope ไม่ต้องสร้างใหม่

พร้อมกันนั้นแตก pipeline เดียว (8 steps / 5 gates) ออกเป็น **4 lane** เพราะปัจจุบัน bug 1 บรรทัด
ต้องเดินผ่าน brainstorm → BA → grill → ponytail เหมือน feature ใหญ่ ซึ่งเป็นเหตุผลหลักที่งานเล็กแพง

พร้อมกับจัดบ้าน markdown — สแกน repo แล้วเจอของพังจริง 4 จุด (spec หายแต่ยังถูกอ้าง 9 บรรทัด,
schema ซ้ำและ drift, ไฟล์ตาย 28.7 KB ที่ยัง track, worktree 42 MB ที่ไม่ถูก ignore) — รายละเอียด §15

Step 6 แตกเป็น 4 คนงานขนาน (DBA · Dev A · Dev B · UIUX A) โดย **ไม่สร้างนิยาม agent ใหม่** —
เป็น instance ของ 3 ตัวเดิม ทำงานเป็นคลื่นตาม contract ที่ arch freeze ไว้ (§16)
· orchestrator = session หลัก กำกับทุก step ด้วยสัญญา PRE→BRIEF→POST→LOG (§17)
· model/effort ของทุก agent ระบุใน §18 · วิธีเข้าแต่ละ lane + คีย์เวิร์ด อยู่ §19

ตรวจแล้วพบว่า **ไม่มี agent ที่ถือเรื่อง git และเอกสาร** — ทั้งสองถูกแปะให้ `@pm-agent` ทำ "ทีหลังสุด"
และของพังทั้ง 4 อย่างข้างบนล้วนอยู่ในเขตนี้ → เสนอ `@scribe-agent` รับไปทั้งก้อน (§20)

**agent ใหม่ 2 ตัว:** `@arch-agent` (opus/max) · `@scribe-agent` (sonnet/high)
**ไฟล์ใหม่ 15 · ลบ/ยุบ 5 · สุทธิ +10** ทยอยตาม phase — ผ่าน Ponytail 7-point ของตัวเอง แบบชนเพดาน (§12)

---

## 1. Gap analysis — ปัญหาที่มีจริงในโปรเจกต์วันนี้

| # | Gap | หลักฐานใน repo | ผลกระทบ |
|---|-----|----------------|---------|
| G1 | **ไม่มีเจ้าของ architecture** | `ba-agent.md` description มี "solution-architecture trade-offs"; `db-agent` ออกแบบ schema; `dev-agent` เลือก layering/pattern เอง | การตัดสินใจเชิงโครงสร้างกระจาย 3 ที่ ไม่มีเอกสารกลาง — พอ feature ใหม่มาก็ตัดสินใหม่ทุกครั้ง |
| G2 | **ไม่มี class / interface design ก่อนลงมือ** | `plans/*.md` ทุกไฟล์เป็น task list (file path + test) ไม่มี class contract | `@dev-agent` ออกแบบขณะเขียน → pattern drift ระหว่าง module |
| G3 | **Pipeline เดียวใช้กับทุกงาน** | `.claude/commands/` มีคำสั่งเดียว (`grill-with-docs`); plan ทุกไฟล์เป็น feature-shaped | งานเล็ก (bug/refactor) ต้นทุน gate สูงเกินจริง หรือไม่ก็เลี่ยง pipeline = pipeline violation |
| G4 | **ไม่มี bug-fix workflow ที่เป็นทางการ** | ไม่มี command/skill ของ bugfix; `diagnosing-bugs` + `tdd` (global skill) ไม่ถูกผูกกับ pipeline | root cause ไม่ถูกบันทึก, regression test ไม่บังคับ |
| G5 | **ไม่มีกฎเรื่อง hardcode value → data** | ไม่มี standards file; `standards/` มีแค่ acceptance-criteria / doc-git-policy / tech-stack | ADR-0020 คือหลักฐาน: VAT 7% ถูก hardcode 2 ที่ (`invoice.service.ts`, `ClinicBilling.tsx TAX_RATE`) กว่าจะย้ายเป็น `TenantSettings` ก็หลัง PR ไปแล้ว |
| G6 | **Testing rule กระจาย** | ข้อกำหนดเทสอยู่ใน `qa-protocols.md` + `dev-agent.md` + `qa-agent.md` คนละชุด | ไม่มีคำตอบเดียวว่า layer ไหนต้อง unit / integration / contract |
| G7 | **ADR ไม่มีเจ้าของถาวร** | `docs/adr/` มี 25 ไฟล์ (0002–0026) เขียนผ่าน `grill-with-docs` → `domain-modeling` | ADR เกิดเฉพาะตอน grill; การตัดสินใจเชิงโครงสร้างนอก grill ไม่ถูกบันทึก |

---

## 2. หลักการที่ใช้ร่างข้อเสนอนี้

1. **เพิ่ม agent ให้น้อยที่สุด** — map ภาพที่ให้มาเข้าทีมเดิมก่อน แล้วค่อยสร้างส่วนที่ขาดจริง
2. **จำนวน gate ต้องไม่เพิ่ม** — ยังคง 5 gates (BA / grill / ponytail / QA / finish-branch)
3. **ใช้ skill ที่มีอยู่แล้ว** — `diagnosing-bugs`, `tdd`, `codebase-design`, `request-refactor-plan`
   เป็น global skill อยู่แล้ว ไม่ต้องเขียน methodology ใหม่ แค่ห่อด้วย command ของ Anemal
4. **ข้อเสนอต้องผ่าน Ponytail gate ของตัวเอง** — ดู §12

---

## 3. Mapping ภาพที่คุณให้มา → ทีมจริง

```
Requirement / User
        │
        ▼
  Senior Tech Architect   ──►  @arch-agent            [ NEW — ตัวเดียวที่ต้องสร้าง ]
        │
        ▼
  Architecture Reviewer   ──►  @ponytail-agent        [ ขยาย 7 → 9 criteria ]
        │
        ▼
  Implementation Planner  ──►  @pm-agent /write-plan  [ เดิม — เปลี่ยนแค่ input ]
        │
  ┌─────┴─────┬──────────┬──────────┐
  ▼           ▼          ▼          ▼
 DBA        Dev A      Dev B     UIUX A    ──►  @db · @dev ×2 · @uiux  [ เดิม แตกเป็น instance ]
  └─────┬─────┴──────────┴──────────┘             ทำงานเป็นคลื่น ไม่ใช่ปล่อยพร้อมกันดิบ ๆ (§16)
        ▼
   Code Reviewer          ──►  @qa-agent /code-review [ เดิม — เพิ่ม arch-conformance ]

  ทุกกล่องข้างบนถูกกำกับโดย Orchestrator = session หลัก (§17) ไม่ใช่ agent ตัวใหม่
```

**ข้อสรุป:** ภาพต้องการ 5 บทบาท — มีอยู่แล้ว 4 ขาดจริง 1
คนงาน 4 ตัวใน Step 6 ไม่ต้องสร้างไฟล์ใหม่ — เป็น instance ของ 3 นิยามเดิม (`@db` ×1, `@dev` ×2, `@uiux` ×1)

---

## 4. เส้นแบ่งความรับผิดชอบ (สำคัญที่สุดของข้อเสนอนี้)

ถ้าไม่ตกลงตารางนี้ก่อน `@arch-agent` จะทับ BA กับ DB ทันที

| การตัดสินใจ | เจ้าของ (R) | ปรึกษา (C) | หมายเหตุ |
|---|---|---|---|
| อะไรคือความต้องการ / ใครทำอะไรได้ (business rule, permission code) | `@ba-agent` | arch | BA ตอบ **WHAT + WHO** |
| Entity / relation / ownership / state machine (logical model) | `@arch-agent` | ba, db | arch ตอบ **HOW (โครงสร้าง)** |
| ค่าไหนเป็น code / enum / lookup table | `@arch-agent` | db | กฎอยู่ใน `architecture-rules.md` §lookup |
| DDL, index, migration, tenant isolation, query safety | `@db-agent` | arch | **db มีสิทธิ์ veto ทุก schema** — ไม่เปลี่ยน |
| Class / interface / layer contract / pattern | `@arch-agent` | dev | ส่งเป็น contract ให้ dev |
| การเขียนโค้ดจริง | `@dev-agent` | arch | ห้ามสร้าง abstraction ข้าม layer ใหม่โดยไม่ผ่าน arch |
| Layout / component / touch target / token | `@uiux-agent` | arch | arch กำหนดแค่ "state อยู่ที่ไหน" |
| แตกงาน / AC / priority / scope / work-partition manifest | `@pm-agent` | arch | plan อ้าง class จาก arch doc |
| Git hygiene · PR compliance · เอกสารทุกไฟล์ · ship | `@scribe-agent` | pm | ตรวจ **ความครบ/สอดคล้อง** ไม่ตัดสินเนื้อหา (§20) |
| ความเรียบง่าย (reject over-engineering) | `@ponytail-agent` | — | **มีอำนาจ reject arch ได้** |
| Test / edge case / isolation / RBAC verification | `@qa-agent` | arch | test strategy มาจาก arch doc |

**กฎกันชนสำคัญ:** `@arch-agent` ออกแบบ *logical* model, `@db-agent` เป็นเจ้าของ *physical* schema
และยัง veto ได้เหมือนเดิม — arch **ไม่ได้** อยู่เหนือกฎ multi-tenancy

---

## 5. Spec ของ `@arch-agent`

### 5.1 ตำแหน่งใน pipeline: **Step 3.4** (หลัง BA sign-off, ก่อน grill)

เหตุผลที่วางก่อน grill ไม่ใช่หลัง:
- `/grill-with-docs` จะได้ stress-test *ทั้ง* requirement และ architecture ในรอบเดียว → ไม่ต้องเพิ่ม gate
- transaction boundary / failure mode / state machine คือของที่ควรโดน grill มากที่สุด
- เลข 3.4 ทำให้ **ไม่ต้องแก้เลข Step 3.5 ของ grill** — command และ hard rule เดิมใช้ต่อได้ทั้งหมด

### 5.2 Trigger threshold — เมื่อไหร่ต้องเรียก / เมื่อไหร่ข้าม

เรียก `@arch-agent` เมื่อเข้าเงื่อนไข **ข้อใดข้อหนึ่ง**:
- มี table ใหม่ หรือแก้ relation ของ table เดิม
- แตะ service ตั้งแต่ 2 ตัวขึ้นไป หรือสร้าง module ใหม่
- มี external integration ใหม่ (storage, SMTP, payment, provider)
- มี state machine / status transition
- มี transaction คร่อมมากกว่า 1 aggregate
- เป็น cross-cutting concern (authz, audit, quota, tenancy)

ไม่เข้าเลย → **ข้าม Step 3.4** และเขียนบรรทัดเดียวในไฟล์ plan ว่า `arch: skipped (below threshold)`
(กันไม่ให้ pipeline หนักขึ้นกับงานเล็ก — และทำให้การข้ามเป็นสิ่งที่ตรวจสอบได้)

### 5.3 Output — 2 ระดับ (ข้อนี้คือการ "ค้าน" spec ที่ให้มา)

spec ที่ส่งมามี output 12–18 section ถ้าใช้ทุก feature จะได้เอกสารที่ไม่มีใครอ่าน
(ตอนนี้ 1 feature มีเอกสารอยู่แล้ว ~6 ไฟล์: design, ba-signoff, grill, plan, ponytail, qa-signoff)
จึงเสนอแยกเป็น 2 tier:

| Tier | ใช้เมื่อ | ความยาว | มีอะไร |
|---|---|---|---|
| **Arch Brief** (default) | feature ปกติที่เข้า threshold | ≤ 1 หน้า | complexity hotspot, logical model delta, class/interface contract, pattern ที่เลือก + ปัญหาที่มันแก้, transaction/error boundary, test strategy, risk |
| **Arch Design Doc** | module/subsystem ใหม่, เปลี่ยน layering, integration ใหม่ | เต็ม 12 section ตาม spec ที่ให้มา | + domain decomposition, relationship diagram (Mermaid), option comparison A/B/C, SOLID review, implementation order, simplification review |

ทั้งสอง tier เขียนที่ `docs/superpowers/plans/YYYY-MM-DD-<feature>-arch.md`
(ใช้ naming เดิมของโปรเจกต์ ไม่สร้างโฟลเดอร์ใหม่)
การตัดสินใจที่อยู่ข้ามหลาย feature → ออกเป็น ADR ที่ `docs/adr/` (arch เป็นเจ้าของถาวร แก้ G7)

### 5.4 Hard rules ของ arch-agent (กัน pattern abuse)

นี่คือความเสี่ยงอันดับ 1 ของการเพิ่ม agent นี้ — Anemal มี architecture ที่ตัดสินใจไปแล้ว
(Route → Controller → Service → Repository, Prisma, ไม่มี domain layer แยก)

1. **Conform first.** ต้อง fit feature เข้ากับ layer ที่มีอยู่ ห้ามเสนอ Hexagonal / DDD / CQRS
   เป็น default — เสนอได้เฉพาะเมื่อพิสูจน์ได้ว่า layer เดิมรับไม่ไหว **และต้องออกเป็น ADR**
2. **Pattern ต้องมีปัญหากำกับ.** ทุก pattern ที่เสนอต้องเขียน `Problem: / Why: / Alternative: / Trade-off:`
   ครบ 4 บรรทัด ถ้าเขียนไม่ได้ = ห้ามใช้
3. **Interface ต้องมี implementation ที่ 2 (จริงหรือกำลังจะมี)** — mock ไม่นับเป็นเหตุผลเดียว
4. **ห้ามแตะ security invariant:** deny-by-default, server เป็น security boundary,
   plane ไม่ผสมกัน, `WHERE tenant_id` ทุก query — arch ทำได้แค่ *เข้มขึ้น* ไม่ใช่ผ่อน
5. **ไม่เขียน production code** — ส่ง contract ให้ `@dev-agent` เท่านั้น

### 5.5 ไฟล์ที่ต้องสร้าง

| ไฟล์ | เนื้อหา |
|---|---|
| `.claude/agents/arch-agent.md` | frontmatter (`model: opus`, `effort: max`) + method ย่อ + hard rules ตาม §5.4 ตามรูปแบบเดียวกับ agent เดิม |
| `.claude/agents/arch-agent/SKILL.md` | ขั้นตอนเต็ม + template ของ Arch Brief / Arch Design Doc + decision table (interface vs abstract vs concrete, inheritance vs composition) + pattern catalogue ย่อ |

---

## 6. Lane A — Feature pipeline (ของเดิม + Step 3.4)

```
STEP 1  /brainstorm                    @pm + @ba
STEP 2  tasks + AC                     @pm
STEP 3  validate + authz design        @ba          ⛔ gate: BA sign-off
STEP 3.4 architecture design           @arch        ← NEW (มี threshold, ข้ามได้ถ้าไม่เข้าเงื่อนไข)
STEP 3.5 /grill-with-docs              human + @ba  ⛔ gate: grill ครอบ requirement + architecture
STEP 4  /write-plan                    @pm          ← input เพิ่ม arch doc
STEP 5  simplicity gate                @ponytail    ⛔ gate: review {arch doc + plan} 9 criteria
STEP 6  /execute-plan                  W0 DBA → W1 Dev A ∥ UIUX A ∥ Dev B → W2 Dev B   (§16)
                                       🔗 integration checkpoint ท้ายทุกคลื่น
STEP 7  /code-review + QA sign-off      @qa          ⛔ gate: + arch conformance
STEP 8  /anemal-finish-branch          @pm          ⛔ gate: red-suite ship gate
```

Gate ยังเท่าเดิม 5 อัน — Step 3.4 ไม่ใช่ gate มันคือขั้นตอนผลิตเอกสารที่ถูก gate 3.5 และ 5 ตรวจอีกที
ทุก step มี orchestrator กำกับด้วยสัญญา PRE → BRIEF → POST → LOG (§17.2)

---

## 7. Lane B/C/D — workflow ที่ขาด (ตอบโจทย์ SDLC)

### Lane B — Bug fix · `/anemal-fix-bug`

```
1. Reproduce      เขียน failing test ที่ reproduce ได้จริง (ใช้ skill `tdd`)
2. Root cause     ใช้ skill `diagnosing-bugs` — ต้องระบุ root cause เป็นข้อความได้
   ⛔ GATE เดียวของ lane นี้: ห้ามแก้โค้ดก่อนมี (failing test + root cause) ครบทั้งคู่
3. Fix            @dev-agent แก้ให้ test เขียว
4. Regression     @qa-agent — test เดิมทั้งหมดต้องเขียว + test ใหม่ต้องอยู่ถาวร
5. Ship           /anemal-finish-branch
```

**Escalation (สำคัญ):** ถ้าการแก้ทำให้ต้อง (ก) แก้ schema, (ข) เปลี่ยน API contract,
(ค) แตะไฟล์ > 3, หรือ (ง) root cause เป็นความผิดพลาดเชิงออกแบบ → **หยุด แล้วย้ายไป Lane A ที่ Step 3.4**
(นี่คือช่องที่ทำให้ Lane B ไม่กลายเป็นทางลัดหนี pipeline)

### Lane C — Hotfix · `/anemal-hotfix`

**ใครสั่งได้:** มนุษย์เท่านั้น — agent ห้ามประกาศเองว่าเป็น hotfix (นี่คือช่องโกงหลักของ lane นี้)

**เข้าเงื่อนไขเมื่อ (ต้องเข้าข้อใดข้อหนึ่ง):**
- prod ล่ม / 5xx บน endpoint ที่ใช้งานจริง
- ข้อมูลกำลังเสียหาย (เขียนผิด, ทับกัน, หาย)
- security: auth bypass · cross-tenant leak · PII หลุดใน log
- `main` แดง (backend suite) — ผูกกับ red-suite ship gate 2026-08-20

**ไม่ใช่ hotfix:** UI เพี้ยน · typo · ช้าแต่ทำงานได้ · feature ไม่ครบ → ไป Lane B

```
0. มนุษย์ประกาศ + ระบุอาการ + ผลกระทบ (ใครเจอ, กี่ tenant)
1. Pin behavior — เขียน test 1 ตัวที่ล็อกพฤติกรรมที่ถูก (ไม่ต้อง TDD เต็ม)
2. Patch เล็กที่สุด — HARD CAP: ห้ามแก้ schema · ห้ามเพิ่ม migration ·
   ห้ามเปลี่ยน API contract   (ถ้าจำเป็นต้องแก้ = ไม่ใช่ hotfix แล้ว → เด้งเข้า Lane A/B ทันที
   เพราะ schema change แบบรีบ อันตรายกว่าบั๊กเดิม)
3. QA ย่อ — backend suite เต็ม + isolation/RBAC subset ที่เกี่ยวข้อง (ไม่ต้อง smoke ทั้งระบบ)
   ⛔ ถ้าเป็น cross-tenant leak: isolation test ที่เขียนต้องอยู่ถาวร ห้าม temp
4. Ship — /anemal-finish-branch, PR body ต้องมี HOTFIX block:
   อาการ · ผลกระทบ · exemption ที่ใช้ · ลิงก์ follow-up
5. ⛔ GATE: merge ไม่ได้ถ้าไม่มี follow-up — บันทึกลง "Open hotfix debt" ใน
   .claude/roadmap/index.md (pm-agent ดูแลอยู่แล้ว ไม่ต้องเพิ่มไฟล์)
6. ADR — บังคับเมื่อ hotfix เปลี่ยนพฤติกรรมที่เคยตกลงไว้ใน ADR/spec เดิม
```

**สิ่งที่ Lane C ข้ามได้ (exemption ที่บันทึกไว้):** brainstorm · BA · grill · arch · ponytail
**สิ่งที่ข้ามไม่ได้เด็ดขาด:** test อย่างน้อย 1 ตัว · tenant isolation · follow-up entry

### Lane D — Refactor / tech debt · `/anemal-refactor`

**นิยาม:** พฤติกรรมภายนอกต้องไม่เปลี่ยนเลย ถ้าเปลี่ยนแม้นิดเดียว = ไม่ใช่ refactor ไป Lane A

**เจ้าของ:** `@arch-agent` เสนอ · `@dev-agent` ลงมือ · `@ponytail-agent` โหมด reverse · `@qa-agent` ตรวจ baseline

```
0. ⛔ GATE บังคับ — Characterization test
   ถ้าโค้ดที่จะ refactor ยังไม่มี test คลุม ต้องเขียน test ที่ "ล็อกพฤติกรรมปัจจุบัน" ก่อน
   (แม้พฤติกรรมนั้นจะดูแปลก) ไม่มี baseline = refactor แบบตาบอด ห้ามเริ่ม
1. Capture baseline — บันทึกรายชื่อ + จำนวน test และผลรัน ก่อนแตะโค้ด
2. @arch-agent ระบุเป้าหมายเชิงโครงสร้าง (ใช้ skill `codebase-design` / `request-refactor-plan`)
3. แก้ทีละ commit เล็ก atomic — ทุก commit ต้องเขียว (revert ทีละชิ้นได้)
4. ⛔ GATE: Test-set equality — รายชื่อ test หลัง = ก่อน และเขียวทั้งคู่
   ห้ามลบ/แก้ test เพื่อให้ผ่าน ถ้าจำเป็นต้องลบ ต้องมี deleted-coverage justification
   (แบบเดียวกับที่ใช้ใน ADR-0019 / plan 2026-08-20-deleted-coverage)
5. ⛔ GATE: Contract unchanged — route list + response envelope + permission code เท่าเดิม
6. ⛔ GATE: Reverse-Ponytail — ต้อง "ลด" อย่างน้อย 1 ใน {จำนวนไฟล์, LOC, abstraction, dependency}
   และห้ามเพิ่มตัวอื่น  ถ้าเพิ่มทุกอย่าง = feature ปลอมตัว → REJECT
```

**กฎแยกสาขา:** ห้าม refactor ปนกับ feature ใน branch เดียวกัน — ถ้าปน review แยกไม่ออกว่าอะไรทำพัง

### Lane E — Spike / POC (ยังไม่ทำ)

timebox · branch ทิ้ง · output = ADR อย่างเดียว · ห้าม merge เข้า main — เลื่อนไว้ก่อน ยังไม่มีความจำเป็น

### ตารางเลือก lane

| งาน | Lane | Gate ที่ต้องผ่าน | ใครเริ่มได้ |
|---|---|---|---|
| Feature / เปลี่ยน behavior | A | 5 gates เต็ม | ใครก็ได้ |
| Bug ไม่แตะ schema/contract, ≤3 ไฟล์ | B | root-cause + QA + ship | ใครก็ได้ |
| prod ล่ม / data เสีย / security / main แดง | C | test + isolation + follow-up + ship | **มนุษย์เท่านั้น** |
| ไม่เปลี่ยน behavior | D | characterization + test-set equality + contract + reverse-ponytail | ใครก็ได้ |

### เมทริกซ์การเด้งข้าม lane (กันการใช้ lane ผิด)

| จาก | เจอว่า | ไป |
|---|---|---|
| B | ต้องแก้ schema / เปลี่ยน contract / >3 ไฟล์ / root cause = design flaw | A ที่ Step 3.4 |
| C | patch ต้องแตะ schema หรือ migration | A/B ทันที (หยุด hotfix) |
| D | พฤติกรรมเปลี่ยน (test เดิมแดงและ "ควรแดง") | A |
| A | ระหว่างทำเจอ prod ล่ม | แตก branch C ต่างหาก ห้ามยัดใน branch feature |

---

## 8. การแก้ agent เดิม (ไฟล์ต่อไฟล์)

| ไฟล์ | แก้อะไร | ทำไม |
|---|---|---|
| `CLAUDE.md` | เพิ่มแถว `@arch-agent` ใน Agent Router; เพิ่ม Step 3.4; เพิ่มหัวข้อ Lane B/C/D; ปรับ Ponytail 7 → 9 | จุดเดียวที่ทุก agent อ่าน |
| `.claude/agents/ba-agent.md` | ตัด "solution-architecture trade-offs" ออกจาก description; handoff เปลี่ยนเป็น "→ @arch-agent → @pm-agent" | แก้ G1 (ทับซ้อน) |
| `.claude/agents/ponytail-agent.md` + SKILL | เพิ่ม criterion **#8 abstraction ที่ไม่มี implementation ที่ 2** และ **#9 pattern ที่ไม่มีปัญหากำกับ**; input เปลี่ยนเป็น {arch doc + plan}; เพิ่มโหมด reverse สำหรับ Lane D | ทำหน้าที่ Architecture Reviewer ตามภาพ โดยไม่สร้าง agent ใหม่ |
| `.claude/agents/db-agent.md` | ระบุ logical (arch) vs physical (db); คงสิทธิ์ veto · **`model: sonnet → opus`** | กัน arch ทับ db · db เป็น gate (§18.2) |
| `.claude/agents/dev-agent.md` | โหลด arch doc เป็นข้อ 3; กฎ "ห้ามสร้าง abstraction ข้าม layer ใหม่โดยไม่ผ่าน arch"; รับ **เขตไฟล์จาก manifest** · **`effort: medium → high`** | แก้ G2 pattern drift · กันไฟล์ทับตอนขนาน |
| `.claude/agents/qa-agent.md` | เพิ่ม arch conformance ใน Step 7 (โค้ดตรง class contract ไหม); test strategy อ้าง arch doc | แก้ G6 |
| `.claude/agents/pm-agent.md` | `/write-plan` ต้องอ่าน arch doc; task อ้าง class/interface จริง; **ผลิต work-partition manifest (§16.3)**; โหลด `doc-maintenance.md` · **`effort: medium → high`** | ลดการคิดเองตอน plan · manifest คุมความปลอดภัยของงานขนาน |
| `.claude/agents/uiux-agent.md` | รับป้าย **UIUX A** + เขตไฟล์จาก manifest · model/effort คงเดิม (sonnet/low) | สเปกครบอยู่แล้ว |
| `.claude/roadmap/qa-protocols.md` | เพิ่ม section "test level ต่อ layer" (repository = integration + isolation, service = unit ไม่มี DB, controller = contract, UI = component) | แก้ G6 โดยไม่สร้างไฟล์ใหม่ |

---

## 9. เอกสารมาตรฐานใหม่ (1 ไฟล์)

`.claude/standards/architecture-rules.md` — เจ้าของ `@arch-agent`:

1. **Layer contract** — ทิศทาง dependency ที่อนุญาต, อะไรห้ามอยู่ใน controller/repository
2. **Interface vs abstract vs concrete** — decision table + กฎ "ต้องมี implementation ที่ 2"
3. **Pattern whitelist** — pattern ที่ใช้ได้ + ปัญหาที่มันแก้ + ตัวอย่างจริงใน Anemal
4. **Error taxonomy** — business / validation / integration / retryable vs non-retryable → map เข้า envelope `{ success, error }` ที่มีอยู่
5. **Transaction boundary** — เมื่อไหร่ต้อง `$transaction`, idempotency, ห้ามคร่อม external call
6. **State machine** — ห้ามใช้ boolean กระจาย (`isPaid`/`isCancelled`) แทน status ที่มี transition จริง
7. **Lookup table rule (ตอบโจทย์ "table เก็บ HardCode Variable")**

   | ประเภทค่า | เก็บที่ไหน | ตัวอย่าง |
   |---|---|---|
   | ค่าที่ tenant ต่างกันได้ | **ตาราง tenant-scoped** (บังคับ) | VAT mode/rate → `TenantSettings` (ADR-0020) |
   | ค่าที่ผู้ใช้แก้ได้ / เพิ่มแถวได้ | **lookup table + seed** | species, breed, payment method, appointment type |
   | ค่าที่ผูกกับ logic ใน code และเปลี่ยนไม่ได้โดยไม่ deploy | **Prisma enum / TS union** (ปัจจุบันมี 4 enum) | plane, role type |
   | ค่าที่ platform ตั้งให้ tenant | **platform-plane table** | plan, quota |

   **กฎตัดสิน:** ถ้าค่าเปลี่ยนแล้ว *ไม่ต้อง* แก้ logic → เป็น data. ถ้าเปลี่ยนแล้วต้องแก้ `switch`/`if` → เป็น enum
   **ห้าม:** magic number/string ในโค้ด (ซ้ำรอย `TAX_RATE = 7` ใน ADR-0020)

8. **Testing rule (ระดับ architecture)** — business logic ต้อง test ได้โดยไม่ต้องมี DB/network/UI;
   ทุก repository ต้องมี isolation test; รายละเอียดการรันอยู่ที่ `qa-protocols.md` (ไม่เขียนซ้ำ)

---

## 10. Rollout — 4 phase

| Phase | ทำอะไร | ผลลัพธ์ที่วัดได้ | ขึ้นกับ |
|---|---|---|---|
| **P0 — ตกลงขอบเขต** | ยืนยัน §4 RACI + Step 3.4 + output 2 tier | เอกสารนี้ถูก approve | — |
| **P0.5 — จัดบ้าน markdown** ✅ **ทำแล้ว 2026-09-09** | ซ่อม B1–B4 + ลบของตาย + `.gitignore` | dangling ref ในไฟล์ปฏิบัติการ = **0** · `.claude` 43 MB → **1.3 MB** · md 831 → **287** | เสร็จ |
| **P1.5 — `@scribe-agent`** ✅ **ทำแล้ว 2026-09-09** (ทำก่อนกำหนด ตามที่สั่ง) | สร้าง agent 2 ไฟล์ + ต่อเข้า CLAUDE.md ทุกจุด (router · Step 4 pre-check · Step 8 owner · Tracking) | git/doc มีเจ้าของแล้ว · Step 8 ย้ายจาก pm → scribe | เสร็จ |
| **P1 — arch-agent** ✅ **ทำแล้ว 2026-09-09** | `arch-agent.md` + `SKILL.md` + `standards/architecture-rules.md` + โหมด `arch-precheck`/`gate` 9 ข้อ/`reverse` ใน ponytail | Step 3.4/3.4b ใช้ได้ · shadow run กับ feature ถัดไป | เสร็จ |
| **P2 — เปิดเป็น gate** ✅ **ทำแล้ว 2026-09-09** | ผ่าตัด `CLAUDE.md` ตาม §15.C · แก้ agent 7 ไฟล์ตาม §8 · เปิด 9-point · สร้าง `doc-maintenance.md` + `doc-map.md` + `orchestration-protocol.md` · ปรับ model/effort ตาม §18.2 (`@scribe-agent` ทำไปแล้วใน P1.5) | pipeline ใหม่ใช้จริง · CLAUDE.md 192 → ~100 บรรทัด | P1 ผ่าน |
| **P3 — Lane B/C/D** ✅ **ทำแล้ว 2026-09-09** | skill `anemal-dev-lanes` (SKILL + 3 references) + 3 command + section สั้นใน CLAUDE.md | bug/hotfix/refactor มีทางเดินของตัวเอง | P2 |
| **P4 — Retro** | หลัง 3 feature + 3 bug: วัด (ก) % arch doc เปลี่ยน plan (ข) ponytail reject กระจุกที่ #8/#9 หรือ #1–7 (ค) cycle time Lane B (ง) hotfix debt ค้าง | ตัดสินเก็บ/ตัด/แยก arch reviewer | P3 |

**ทางถอย:** ถ้า P4 พบว่า arch doc ไม่เคยเปลี่ยน plan → ยุบ `@arch-agent` กลับเข้า `@ba-agent`
เสียแค่ 2 ไฟล์ ไม่มีผลกับโค้ด · Lane B/C/D ถอยได้อิสระจาก arch (คนละชุดไฟล์)

**ลำดับที่แนะนำให้ลงมือ:** P0.5 → P0 → P1 → P2 → P3
(P0.5 ขึ้นก่อนเพราะเป็นการซ่อมของที่พังอยู่แล้ว ไม่ใช่ของใหม่ — และซ่อมก่อนทำให้ P1/P2 ไม่ไปต่อยอดบนของเสีย)

---

## 11. ความเสี่ยง

| # | ความเสี่ยง | ความรุนแรง | ทางกัน |
|---|---|---|---|
| R1 | **Gate fatigue** — pipeline ยาวขึ้น งานช้าลง | สูง | trigger threshold (§5.2) + Arch Brief 1 หน้า + Lane B/C/D |
| R2 | **arch-agent เสนอ over-engineering** (Hexagonal/DDD ทับของเดิม) | สูง | hard rule "conform first" + ponytail #8/#9 มีอำนาจ reject arch |
| R3 | **ทับซ้อน BA ↔ arch** | กลาง | §4 RACI: BA = WHAT/WHO, arch = HOW |
| R4 | **ทับซ้อน arch ↔ db** | กลาง | logical vs physical + db คง veto |
| R5 | **เอกสารบวม** (จาก 6 ไฟล์/feature เป็น 7) | กลาง | brief tier + ADR เฉพาะการตัดสินใจข้าม feature |
| R6 | **Lane B กลายเป็นทางลัดหนี pipeline** | สูง | escalation rule ที่ §7 (schema/contract/>3 ไฟล์ = เด้งเข้า Lane A) |
| R7 | **ต้นทุน token** — arch = opus/max เพิ่มอีก 1 ตัว/feature + `db-agent` ขึ้น opus | กลาง | arch ข้ามได้เมื่อไม่เข้า threshold · brief tier สั้น · db รันเฉพาะงานที่แตะ schema ซึ่งไม่ใช่ทุก task |
| R8 | **งานขนานเขียนไฟล์ทับกัน** — Dev A/Dev B แก้ไฟล์เดียวกัน = งานหาย | **สูง** | work-partition manifest (§16.3) เจ้าของไฟล์คนเดียวต่อคลื่น + integration checkpoint ข้อ 3 ตรวจว่าไฟล์ที่แก้จริงอยู่ในเขต |
| R9 | **ขนานแล้ว signature ไม่ตรงกัน** — backend เปลี่ยน contract หลัง frontend เริ่มแล้ว | **สูง** | ห้ามขนานถ้า arch ยังไม่ freeze contract ที่ 3.4 · checkpoint ข้อ 4 เทียบ signature จริงกับ arch doc ทุกคลื่น |
| R10 | **พิมพ์ภาษาคนแล้วไม่เข้า lane** (หรือเข้าผิด lane) | กลาง | lane selector ใน CLAUDE.md + คำไทย/อังกฤษใน skill description + กฎ "เดาไม่ออกให้ถาม" (§19.2) |
| R11 | **Orchestrator กลายเป็นพิธีกรรม** — เช็กลิสต์ครบแต่ไม่มีใครดู | กลาง | สัญญา PRE/POST ผูกกับของที่ตรวจได้จริง (ไฟล์มีจริงไหม · gate ผ่านไหม · ไฟล์นอกเขตไหม) ไม่ใช่คำถามปลายเปิด |

---

## 12. Ponytail self-check ของข้อเสนอนี้

| # | เกณฑ์ | ผล |
|---|---|---|
| 1 | Over-engineering? | **NO** — สร้าง agent 1 ตัวจาก 5 บทบาทในภาพ, ที่เหลือ map เข้าของเดิม; arch reviewer = โหมดของ ponytail; orchestrator = session หลัก; คนงาน 4 ตัวใน Step 6 = instance ไม่ใช่นิยามใหม่ |
| 2 | ทำซ้ำของที่มี? | **NO** — ponytail/pm/qa ใช้ตัวเดิม · lane B/D ใช้ `diagnosing-bugs`, `tdd`, `codebase-design` ที่มีอยู่ · testing rule เติมไฟล์เดิม ไม่สร้างไฟล์ที่ 3 |
| 3 | มี solution สำเร็จรูปอยู่แล้ว? | **NO** — orchestration เป็นของเฉพาะโปรเจกต์ |
| 4 | Scope ใหญ่เกิน? | **NO** — แตะเฉพาะ `.claude/` + `CLAUDE.md` + `docs/` ไม่แตะ `src/` |
| 5 | Dependency ใหม่เยอะ? | **NO** — 0 dependency |
| 6 | ไฟล์ใหม่เยอะ? | **⚠ ชนเพดานพอดี** — ใหม่ 15 (agent 4 · standards 4 · skill 4 · command 3) ลบ/ยุบ 5 → **สุทธิ +10** · เพดาน 15 คือ ">15 = REJECT" จึงยัง**ผ่านแบบไม่มีที่เหลือ** |
| 7 | API ใหม่เยอะ? | **NO** — 0 endpoint |

→ **ผ่าน** (เมื่อทำเป็น phase ตาม §10 ไม่ทำรวดเดียว)

**ข้อ 6 ชนเพดาน — ทางลดถ้าต้องการ (เลือกได้ 1):**
- ยุบ `anemal-dev-lanes/references/{bugfix,hotfix,refactor}.md` เข้า `SKILL.md` ไฟล์เดียว → เหลือใหม่ **12**
  แลกกับการโหลดกฎทั้ง 3 lane ทุกครั้งที่เรียก lane ใดก็ตาม (~6 KB)
- ยุบ `doc-map.md` เข้า `doc-maintenance.md` → เหลือ **14** (ทั้งคู่ scribe เป็นเจ้าของอยู่แล้ว)
- **ไม่แนะนำให้ยุบ** `orchestration-protocol.md` หรือ `architecture-rules.md` — คนละผู้อ่าน คนละจังหวะโหลด

---

## 13. การตัดสินใจ — LOCKED (2026-09-08)

| # | คำถาม | ผลตัดสิน |
|---|---|---|
| Q1 | วาง arch ไว้ตรงไหน | ✅ **Step 3.4 ก่อน grill** — grill (3.5) ครอบทั้ง requirement + architecture, ไม่แก้เลข step เดิม |
| Q2 | Architecture Reviewer | ✅ **ขยาย `@ponytail-agent` เป็น 9 criteria** — ไม่สร้าง agent reviewer ใหม่ |
| Q3 | ทำ lane ไหนบ้าง | ✅ **B + C + D ทั้งหมดในรอบเดียว** (แก้จากเดิมที่จะทำแค่ B) — E เลื่อน |
| Q4 | Ponytail รีวิว arch กี่รอบ | ✅ **gate รอบเดียวที่ Step 5** + เพิ่ม **arch-precheck แบบ advisory ที่ 3.4b** (ดู §14) |
| Q5 | เริ่มยังไง | ✅ **Shadow mode** — Phase 1 สร้างไฟล์แต่ยังไม่ block pipeline |
| Q6 | จัดบ้าน markdown | ✅ **ทำเป็น Phase 0.5 ก่อนทุกอย่าง** — เจอของพังจริง 4 จุด (ดู §15) |

### ขอบเขต Phase 1 (shadow mode) — 3 ไฟล์ ไม่แตะ CLAUDE.md

1. `.claude/agents/arch-agent.md`
2. `.claude/agents/arch-agent/SKILL.md` — รวมโหมด output 2 tier
3. `.claude/standards/architecture-rules.md`

**+ แก้ 1 ไฟล์:** `.claude/agents/ponytail-agent/SKILL.md` เพิ่ม **โหมด `arch-precheck`**
(criteria #1/#8/#9, verdict `BLOCK/FLAG/PASS`, advisory ไม่ block ตอน shadow) — ยังไม่แตะ 7-point เดิม

**Phase 1 ยังไม่ทำ:** ไม่แก้ `CLAUDE.md`, ไม่แก้ agent เดิมอีก 6 ไฟล์, ไม่เปิด 9-point,
ไม่สร้าง command lane — อยู่ Phase 2/3
ระหว่าง shadow run `@arch-agent` ถูกเรียกด้วยมือ ไม่ใช่ gate — plan เดินต่อได้แม้ arch doc ยังไม่เสร็จ

---

## 14. แยก Architecture Reviewer ออกจาก Ponytail — ผลดี/ผลเสีย

วิเคราะห์นอกเหนือจากเรื่อง "step เพิ่ม"

### ผลดีของการแยก

**D1 — กัน rework ที่แพงที่สุด คือเวลาคน**
`/grill-with-docs` เป็น human-driven ตาม Agent Router. ถ้ารวมกับ ponytail → arch ถูก reject ที่ Step 5
แปลว่ามนุษย์นั่ง grill ไปแล้วฟรี และ grill record กลายเป็นของเสีย ต้องวน 3.4 → 3.5 → 4 ใหม่
แยก = reject ที่ 3.4b วนแค่ขั้นเดียว ไม่กินเวลาคน · **นี่คือข้อได้เปรียบที่แรงที่สุด**

**D2 — verdict shape ต่างกันได้**
ponytail = binary `ANY yes = REJECT` เหมาะกับเกณฑ์ที่นับได้ (>10 ไฟล์, >3 endpoint)
architecture ไม่ binary ควรเป็น `BLOCK / FLAG / PASS`
ยัดคำถามเชิงดุลพินิจ (#8 abstraction, #9 pattern) เข้ากลไก binary → **over-reject**:
design ที่โครงถูกอาจถูกตีตกเพราะนับไฟล์เกิน
ตัวอย่างจริง: ADR-0022 + ADR-0023 (local disk + per-tenant network share) คือ interface ที่มี
implementation ที่ 2 จริง สมเหตุสมผล — แต่ถ้ามาพร้อมไฟล์เกิน 15 เกณฑ์ #6 ตีตกทันที

**D3 — ใช้ซ้ำได้ใน workflow อื่นที่ ponytail ทำแทนไม่ได้**

| workflow | แยกแล้วได้ | ponytail ทำแทนได้ไหม |
|---|---|---|
| Lane D refactor | ตอบ "โครงดีขึ้นจริงไหม" | ไม่ได้ — นับได้แค่ไฟล์ลด |
| Lane B escalation | ตัดสิน "root cause นี้เป็น design flaw ไหม" | ไม่ได้ — ponytail เป็น plan gate |
| ADR review (25 ไฟล์ ไม่มีคนรีวิว) | รีวิว ADR นอก pipeline | ไม่ได้ |
| Step 7 arch conformance | เจ้าของเดียวกับ 3.4b มาตรฐานเดียวกัน | ตอนนี้ยัดให้ qa ซึ่งไม่ถนัด |

**D4 — ponytail ไม่เสียความคม** — 7 ข้อเดิม tune มาเพื่อ "นับ scope" ผสมข้อเชิงดุลพินิจแล้วจะจมเช็กลิสต์

### ผลเสียของการแยก

**X1 — เสียการตรวจ arch ↔ plan drift**
plan ถูกสร้างจาก arch doc. reviewer เดียวที่เห็นทั้งคู่จับได้ว่า plan หลุดจาก arch
แยกแล้ว arch reviewer เห็นแค่ arch, ponytail เห็นแค่ plan → **ไม่มีใครตรวจรอยต่อ**
ต้องไปเจอตอน Step 7 ซึ่งโค้ดเขียนเสร็จแล้ว = สายเกินไป

**X2 — reviewer ที่เป็นมิตรเกินไป**
ponytail มีค่าเพราะ worldview คนละขั้ว (build less). arch reviewer ที่คิดแบบ architecture
เหมือน arch-agent มักเห็นด้วยกัน → แยกแล้วได้ reviewer ที่ยอมง่ายขึ้น
และผลักตัวที่ค้านจริงออกไปไกลอีก 1 ขั้น

**X3 — เปิดปัญหาอำนาจซ้อน**
CLAUDE.md ระบุ Ponytail Gate มี **HIGHEST authority**. เพิ่ม gate ที่เขตอำนาจทับกัน
ต้องเขียนกฎตัดสินใหม่ + tie-break. escalation ปัจจุบันชี้ `@pm-agent` (sonnet) —
ให้ PM ตัดสินข้อพิพาท architecture คือ arbiter ที่อ่อน ต้องเปลี่ยนเป็นมนุษย์

**X4 — review sprawl** — มี `/code-review`, `cavecrew-reviewer`, qa, ponytail อยู่แล้ว เพิ่มเสียงที่ 5
router 7 → 9 agent ความกำกวม "เรียกตัวไหน" เพิ่ม

**X5 — +1 opus/max ต่อ feature** — pipeline รัน opus อยู่แล้ว 4 ตัว จะเป็น 5 · เอกสาร/feature 7 → 8

### ทางออกที่เลือก — agent เดียว 2 โหมด

ได้ D1 + D2 โดยไม่จ่าย X1–X5:

```
3.4   @arch-agent        ออกแบบ
3.4b  @ponytail-agent    โหมด arch-precheck — เกณฑ์ #1 / #8 / #9 เท่านั้น
                         verdict = BLOCK / FLAG / PASS  (ไม่นับไฟล์ เพราะยังไม่มี plan)
                         Phase 1: advisory ไม่ block · Phase 2: BLOCK เท่านั้นที่หยุด
3.5   /grill-with-docs   มนุษย์กริลล์บน arch ที่ผ่านตาแล้ว
5     @ponytail-agent    โหมดเต็ม 9 ข้อ binary — input = {arch doc + plan}
                         ← ยังเห็นทั้งคู่ ⇒ drift check ไม่หาย (แก้ X1)
```

| ได้ | เสีย |
|---|---|
| ปกป้องเวลา grill (D1) · verdict 3 ระดับ (D2) · ยังตรวจ drift (X1) · ไม่มี tie-break ใหม่ (X3) · ไม่เพิ่ม agent (X4) | +1 invocation/feature (ตัวเดิม ถูกกว่า agent ใหม่) · ponytail ถือ 2 โหมด ต้องเขียน SKILL ให้แยกโหมดชัด |

**ตัวชี้วัดว่าเมื่อไหร่ควรแยกจริง (วัดใน P4):** บันทึกเหตุผล reject ของ ponytail
ถ้ากระจุกที่ **#8/#9** (architecture) → เป็นงานคนละชนิดจริง ค่อยแยก
ถ้ากระจุกที่ **#1–7** (ขนาด) → ไม่ต้องแยก

---

## 15. จัดบ้าน Markdown — ตรวจของจริง + แผนย้าย/ยุบ/เพิ่ม

> ตัวเลขทั้งหมดในหัวข้อนี้มาจากการสแกน repo จริงวันที่ 2026-09-08 ไม่ใช่การประมาณ

### 15.A ชั้นต้นทุนของเอกสาร — กรอบตัดสินว่าอะไรควรอยู่ไฟล์ไหน

| ชั้น | ไฟล์ | โหลดเมื่อไหร่ | ต้นทุน |
|---|---|---|---|
| **T0 — always** | `CLAUDE.md` (14.4 KB / 192 บรรทัด) | อยู่ใน context ทุกครั้ง ทุก session | **สูงสุด** |
| **T1 — per spawn** | `.claude/agents/*.md` (7 ไฟล์ 1.5–2 KB) | ตอน spawn agent นั้น | ปานกลาง |
| **T2 — per task** | `agents/*/SKILL.md`, `skills/*/SKILL.md` | เมื่อ agent อ่านตามคำสั่ง | ต่ำ (จ่ายเมื่อใช้) |
| **T3 — on demand** | `skills/*/references/*` | เฉพาะเมื่อ SKILL ชี้ | ต่ำสุด |
| **T4 — ไม่ควรโหลด** | `archive/`, `worktrees/` | ไม่ตั้งใจโหลด แต่โดน Glob/Grep กิน | **แอบแพง** |

**กฎเดียวที่ใช้ตัดสิน:** ของที่ *ทุก* agent ต้องรู้ → T0 · ของที่ *agent เดียว* ต้องรู้ → T2/T3
ปัจจุบัน CLAUDE.md ถือของ T2 ไว้เยอะ

### 15.B ของที่พังอยู่จริง (ต้องซ่อมก่อน = Phase 0.5)

| # | ปัญหา | หลักฐาน | ผลกระทบ | วิธีซ่อม |
|---|---|---|---|---|
| **B1** | **ไฟล์ spec หาย แต่ยังถูกอ้าง 9 บรรทัดใน 7 ไฟล์ live** | `.claude/specs/RBAC_Platform_Restructure_Spec.md` ไม่มีบนดิสก์ · ถูก untrack ใน `13a39e3` · อ้างที่ `ba-agent.md:21`, `ba-agent/SKILL.md:25`, `db-agent.md:19`, `anemal-db-context/SKILL.md:82`, `RBAC_index.md:5,99`, `standards/tech-stack.md:77`, `CLAUDE.md:120,132` | **ทุกครั้งที่ spawn @ba-agent หรือ @db-agent จะพยายามอ่านไฟล์ที่ไม่มี** — เสียเทิร์น และ agent ทำงานโดยขาด §9 proposed DDL | กู้จาก git: `git show 13a39e3^:.claude/specs/RBAC_Platform_Restructure_Spec.md` (30,919 bytes) แล้ว track กลับ — สอดคล้อง `doc-git-policy.md` ฉบับ 2026-08-19 ที่กลับมา track เอกสารแล้ว |
| **B2** | **schema ซ้ำ 2 ที่ และ drift แล้ว** | `.claude/specs/database-schema.sql` 32,417 B md5 `6488b3…` vs `.claude/skills/anemal-db-context/references/database-schema.sql` 34,875 B md5 `5f4329…` | @db-agent อ่านคนละไฟล์ได้ตามเส้นทางที่เข้ามา → ออกแบบบน schema ผิดฉบับ | diff ก่อน แล้วเลือก `.claude/specs/` เป็น canonical (agent .md ชี้ทางนี้ 2 จุด) · อีกไฟล์แทนด้วย pointer 1 บรรทัด |
| **B3** | **ไฟล์ตายขนาด 28.7 KB ยัง track อยู่** | `.claude/skills/anemal-coding-rules/references/coding-rules.md.old` (tracked) | ถ้า skill glob โฟลเดอร์ references จะโหลดกฎเก่า 28.7 KB ทับกฎปัจจุบัน | ลบทิ้ง — git history เก็บให้แล้ว |
| **B4** | **worktree 42 MB / 545 ไฟล์ .md ไม่อยู่ใน .gitignore** | `.claude/worktrees` 42 MB · md ใน worktree 545 vs นอก worktree 286 → **66% ของ markdown ทั้งโปรเจกต์เป็นสำเนา** · `.gitignore` ไม่มีบรรทัด worktree | ทุก Glob/Grep/Explore เจอผลซ้ำ 2–3 เท่า · agent อ่าน CLAUDE.md ฉบับเก่า (worktree มี CLAUDE.md 21,271 B ของเก่า) ได้ | ดู 15.B-4 ข้างล่าง |

**B4 — รายละเอียด worktree (ตรวจแล้วทุกตัว ปลอดภัยที่จะลบ)**

| path | สถานะใน `git worktree list` | dirty | commit นำหน้า main | ข้อเสนอ |
|---|---|---|---|---|
| `.claude/worktrees/wizardly-kowalevski-14f642` | **ไม่อยู่ในลิสต์** = ผี ไฟล์ล่าสุดก่อน 2026-08-01 | — | — | ลบทิ้งได้เลย |
| `.claude/worktrees/check-animalclinic-folder-da20f7` | registered, detached @ `35cd37f` | สะอาด (0) | — | `git worktree remove` |
| `src/backend/.claude/worktrees/exciting-volhard-2256e8` | registered, branch `claude/git-worktree-clone-check-6d4f82` | สะอาด (0) | **0 commit** | `git worktree remove` — และตัวนี้อยู่ใน `src/backend` จึงโดน grep โค้ดทุกครั้ง แย่ที่สุดใน 3 ตัว |

ตามด้วย: `git worktree prune` · เพิ่ม `.claude/worktrees/` และ `**/.claude/worktrees/` ลง `.gitignore`
· เพิ่มกฎ 1 บรรทัดใน CLAUDE.md ว่าการค้นหาต้องไม่รวม `worktrees/` และ `*/archive/*`
(gitignore ไม่ได้กัน Glob/Grep ของ agent — ต้องมีกฎกำกับด้วย)

**ของหายอื่นที่ตรวจเจอ (ลำดับรอง):** `13a39e3` untrack ไป 19 ไฟล์ · กู้กลับแล้ว 2
(`roadmap/index.md`, `implementation-status-matrix.md`) · ยังหายอยู่และมีคนอ้าง:
`RBAC_Platform_Restructure_Spec.md` (B1) และ `System_Specification.md` (อ้างที่ `README.md:37` เท่านั้น
— แก้ที่ README ก็พอ ไม่ต้องกู้) · `CHANGELOG.md` / `HistoryLog.md` หายจากดิสก์แล้วแต่ CLAUDE.md
ยังมีกฎ "FROZEN ห้าม append" → กฎนี้กลายเป็นบรรทัดที่กันของที่ไม่มีอยู่ ตัดได้ตอนผ่าตัด

### 15.C ผ่าตัด CLAUDE.md — 192 → ~100 บรรทัด

| บรรทัด | หัวข้อ | ตัดสิน | เหตุผล |
|---|---|---|---|
| 1–6 | Header | **คงไว้** | — |
| 7–23 | Agent Router | **คงไว้** + เพิ่มแถว `@arch-agent` | routing คือความรู้กลางจริง = T0 |
| 24–82 | Standard Pipeline (59 บรรทัด) | **คงไว้แต่บีบ ~35** | เนื้อ T0 จริง แต่ hard rules เขียนซ้ำกับ ASCII block |
| 83–92 | Tech Stack | **ย้ายออก** → `.claude/standards/tech-stack.md` (มีอยู่แล้ว) เหลือ pointer 2 บรรทัด | ซ้ำกับไฟล์ที่มีอยู่ · dev/db เท่านั้นที่ต้องรู้รายละเอียด = T2 |
| 93–110 | Ponytail Gate 7 Criteria | **ย้ายออก** → `ponytail-agent/SKILL.md` (มีตารางเดียวกันอยู่แล้ว) เหลือ pointer 3 บรรทัด | **ซ้ำ 3 ที่**: CLAUDE.md + `ponytail-agent.md` + `ponytail-agent/SKILL.md` · กำลังจะเป็น 9 ข้อ = ต้องแก้ 3 ที่ทุกครั้ง |
| 111–123 | Critical Rules (multi-tenancy, two planes) | **คงไว้** บีบเล็กน้อย | ทุก agent ต้องรู้ = T0 แท้ |
| 124–147 | Project Structure (24 บรรทัด) | **บีบเหลือ ~6** | tree ที่ derive จาก filesystem ได้ ไม่มีใครต้องท่อง |
| 148–153 | Phases & Shipped-Work | **คงไว้** | เป็น pointer อยู่แล้ว สั้นดี |
| 154–181 | Tracking & Documentation (28 บรรทัด) | **ย้ายออก** → `.claude/standards/doc-maintenance.md` (ใหม่) เหลือ 4 บรรทัด | เป็นวิธีทำงานของ `@pm-agent` ล้วน = T2 · ยกเว้นกฎ **handoff on start/stop** ที่ทุก session ต้องรู้ → เก็บไว้ T0 แบบสั้น |
| 182–192 | Superpowers Integration | **บีบเหลือ ~5** | ครึ่งหนึ่งพูดซ้ำ hard rules ของ Standard Pipeline |

**ผลที่คาด:** ~14.4 KB → ~7 KB · ลดของที่อยู่ในทุก context window ราว 1.5–1.8k tokens
**ความเสี่ยงของการย้าย & ทางกัน:** ย้าย Tracking ออกแล้ว pm อาจลืม → `pm-agent.md` ต้องโหลด
`doc-maintenance.md` เป็นข้อบังคับ และ CLAUDE.md คงบรรทัด "pm documents LAST → ดู doc-maintenance.md" ไว้

### 15.D ยุบ / ลบ

| ทำอะไร | กับไฟล์ | ได้อะไร |
|---|---|---|
| ลบ | `anemal-coding-rules/references/coding-rules.md.old` | −28.7 KB · ตัดความเสี่ยงโหลดกฎเก่า |
| ยุบเป็น pointer | `anemal-db-context/references/database-schema.sql` | −34.9 KB · เหลือ schema แหล่งเดียว |
| ย้าย+ลบต้นทาง | Ponytail 7-criteria ใน CLAUDE.md | เหลือ canonical ที่เดียว |
| ย้าย+ลบต้นทาง | Tech Stack ใน CLAUDE.md | เหลือ canonical ที่เดียว |
| ลบไดเรกทอรี | worktree 3 ตัว (ตรวจแล้วสะอาดทั้งหมด) | −42 MB · −545 ไฟล์จากผลค้นหา |
| **ไม่ทำ** | ไม่สร้าง `standards/testing-rules.md` | มี `anemal-coding-rules/references/03-testing-rules.md` + `roadmap/qa-protocols.md` อยู่แล้ว → เติมของเดิม 2 ที่ ไม่เพิ่มไฟล์ที่ 3 |

**กฎ agent สองไฟล์ (ลดความซ้ำ `.md` ↔ `SKILL.md`):**
ตอนนี้ `ba-agent.md:19–21` กับ `ba-agent/SKILL.md:22,31–35` ลิสต์สกิลชุดเดียวกันซ้ำกัน
→ กำหนดให้ `.md` = frontmatter + trigger + "โหลดอะไรบ้าง" (≤25 บรรทัด),
`SKILL.md` = method เต็ม + template · **ห้ามลิสต์สกิลซ้ำสองที่**

### 15.E เพิ่ม (รวม 12 ไฟล์ ทยอยตาม phase)

| ไฟล์ | ชั้น | phase | ทำไมต้องเป็นไฟล์ใหม่ ไม่ใช่ยัดใน CLAUDE.md |
|---|---|---|---|
| `.claude/agents/arch-agent.md` | T1 | P1 | โหลดเฉพาะตอน spawn arch |
| `.claude/agents/arch-agent/SKILL.md` | T2 | P1 | method + template ยาว จ่ายเมื่อใช้ |
| `.claude/standards/architecture-rules.md` | T2 | P1 | arch/dev/db อ่าน ไม่ใช่ทุก agent |
| `.claude/standards/doc-maintenance.md` | T2 | P2 | ย้ายจาก CLAUDE.md 154–181 — pm อ่านคนเดียว |
| `.claude/standards/doc-map.md` | T2 | P2 | ดู 15.F |
| `.claude/standards/orchestration-protocol.md` | T2 | P2 | สัญญาต่อ step + integration checkpoint (§17) — orchestrator อ่านตอนคุมงาน ไม่ใช่ทุก agent |
| `.claude/agents/scribe-agent.md` | T1 | P2 | โหลดตอน spawn scribe (§20) |
| `.claude/agents/scribe-agent/SKILL.md` | T2 | P2 | checklist git/PR/doc ยาว จ่ายเมื่อใช้ |
| `.claude/skills/anemal-dev-lanes/SKILL.md` | T2 | P3 | selector สั้น ๆ + กฎร่วม (escalation, ship gate, debt ledger) |
| `.claude/skills/anemal-dev-lanes/references/bugfix.md` | T3 | P3 | โหลดเฉพาะตอนทำ Lane B |
| `.claude/skills/anemal-dev-lanes/references/hotfix.md` | T3 | P3 | โหลดเฉพาะตอนทำ Lane C |
| `.claude/skills/anemal-dev-lanes/references/refactor.md` | T3 | P3 | โหลดเฉพาะตอนทำ Lane D |
| `.claude/commands/anemal-fix-bug.md` | on-invoke | P3 | thin (~1 KB) เรียกสกิล — ตามแบบ `grill-with-docs.md` |
| `.claude/commands/anemal-hotfix.md` | on-invoke | P3 | thin |
| `.claude/commands/anemal-refactor.md` | on-invoke | P3 | thin |

**ทำไมแยก SKILL + 3 references แทนที่จะเขียนรวมในแต่ละ command:**
กฎร่วม (เมทริกซ์เด้ง lane, ship-gate, debt ledger) จะซ้ำ 3 ที่ถ้าเขียนใน command
· และ references โหลดเฉพาะ lane ที่ใช้จริง (T3) ไม่ใช่โหลดทั้ง 3 lane ทุกครั้ง

**สิ่งที่จะเพิ่มใน CLAUDE.md จริง ๆ มีแค่:** แถว arch ใน router · Step 3.4/3.4b ใน pipeline ·
ตารางเลือก lane 5 บรรทัด · กฎกันค้นหา worktree 1 บรรทัด — รวม ~12 บรรทัด
(ชดเชยด้วยการย้ายออก ~90 บรรทัด → สุทธิยังลดลง)

### 15.F กฎกันไม่ให้พังซ้ำ

1. **`doc-map.md` — ทะเบียนเอกสาร** ตารางเดียว คอลัมน์: `ไฟล์ · เจ้าของ · ใครโหลด · โหลดตอนไหน (T0–T3) · เป็น canonical ของเรื่องอะไร`
   **กฎ:** ไฟล์ `.md` ใหม่ที่ไม่มีแถวใน doc-map = orphan → ห้าม merge
   (นี่คือกลไกที่จะกันไม่ให้เกิด B1/B2 ซ้ำ — ตอนนี้ไม่มีใครรู้ว่าไฟล์ไหนถูกใครอ่าน)
2. **Canonical เดียวต่อหนึ่งเรื่อง** — ห้ามคัดลอกตาราง/กฎข้ามไฟล์ ให้ใช้ pointer
   (ผู้ต้องหาปัจจุบัน: ponytail criteria ×3, tech stack ×2, database schema ×2)
3. **ลิงก์ต้องชี้ของที่มีอยู่** — เพิ่ม step ใน `/anemal-finish-branch`: สแกน `.md` ที่แตะใน PR
   ว่าเส้นทาง `.claude/...` / `docs/...` ที่อ้างมีจริง (grep + test -f ไม่กี่บรรทัด) ไม่มีจริง = block
   — ถ้าเคยมี step นี้ B1 คงไม่ค้างมาถึงวันนี้
4. **การค้นหาต้องยกเว้น** `worktrees/` และ `*/archive/*` — เขียนเป็นกฎใน CLAUDE.md ไม่ใช่แค่ `.gitignore`

---

## 16. Step 6 — ทีมลงมือแบบขนาน (Dev A / Dev B / DBA / UIUX A)

### 16.1 แตกเป็น "instance" ไม่ใช่ agent ใหม่

4 คนงานนี้ใช้ **นิยาม agent เดิม** ไม่ต้องสร้างไฟล์ใหม่เลย — แตกด้วยการเรียกหลาย instance พร้อมกัน

| ป้าย | นิยามที่ใช้ | ขอบเขตไฟล์ที่เป็นเจ้าของ |
|---|---|---|
| **DBA** | `@db-agent` | `prisma/schema.prisma`, `migrations/**`, `src/backend/**/repositories/**` |
| **Dev A** | `@dev-agent` (instance 1) | `src/backend/**/{routes,controllers,services,middlewares}/**` |
| **Dev B** | `@dev-agent` (instance 2) | `src/frontend/src/**` |
| **UIUX A** | `@uiux-agent` | `docs/superpowers/plans/*-uiux.md` + design token/spec (ไม่แตะโค้ด) |

**เหตุผลที่แบ่งตามชั้น ไม่ใช่แบ่งตาม feature:** ชั้นคือเส้นที่ repo นี้ใช้อยู่แล้ว
(Route → Controller → Service → Repository) ทำให้เขต "ไฟล์ใครของใคร" ชัดโดยไม่ต้องตกลงใหม่ทุกรอบ

### 16.2 ขนานได้แค่ไหน — คลื่น (wave) ไม่ใช่ปล่อยพร้อมกันหมด

ปล่อย 4 ตัวพร้อมกันดิบ ๆ จะพังด้วย 3 อย่าง: **ไฟล์ทับกัน · signature ไม่ตรงกัน · ต่อยอดบน schema ที่ยังไม่มี**
จึงต้องเป็นคลื่นที่มีลำดับ:

```
W0  DBA            migration + repository signature        (ถ้า feature แตะ schema — ต้องจบก่อน)
     │
     ├──────────────┬──────────────┐
     ▼              ▼              ▼
W1  Dev A          UIUX A         (Dev B เริ่มได้ถ้า API contract ถูก freeze ที่ Step 3.4)
    backend        screen spec     frontend shell + hook signature
     │              │              │
     └──────┬───────┴──────────────┘
            ▼
      🔗 Integration checkpoint  — typecheck + test ที่เกี่ยวข้อง ต้องเขียว ก่อนขึ้นคลื่นถัดไป
            │
            ▼
W2  Dev B          ต่อ frontend เข้ากับ API จริง
            │
            ▼
      🔗 Integration checkpoint → ส่งต่อ Step 7
```

**เงื่อนไขที่ทำให้ขนานปลอดภัย:** `@arch-agent` ต้อง freeze **seam** ไว้ที่ Step 3.4 —
ชื่อ class/interface, signature ของ repository (พร้อม `tenantId` ตัวแรก), รูปร่าง request/response,
permission code ที่ใช้ · **ไม่มี contract = ห้ามขนาน ให้ทำเรียงตัว**
(นี่คือเหตุผลเชิงปฏิบัติที่สุดของการมี `@arch-agent` — ไม่ใช่แค่คุณภาพ แต่คือสิ่งที่ทำให้ทำงานขนานได้จริง)

### 16.3 Work-partition manifest — ของใหม่ที่ `@pm-agent` ต้องผลิต

`/write-plan` (Step 4) ต้องเพิ่มตารางนี้ในไฟล์ plan เดิม **ไม่ต้องสร้างไฟล์ใหม่**:

| Task | คลื่น | เจ้าของ | ไฟล์ที่จะเขียน (exclusive) | ขึ้นกับ task | contract ที่อ้าง |
|---|---|---|---|---|---|

**กฎเหล็ก:** ไฟล์หนึ่งไฟล์มีเจ้าของได้คนเดียวต่อคลื่น · ถ้า 2 task ต้องแก้ไฟล์เดียวกัน
→ ต้องยุบเป็น task เดียว หรือแยกคนละคลื่น · ห้ามให้ 2 instance เขียนไฟล์เดียวกันพร้อมกัน

**สาขา/worktree:** ใช้ branch เดียว ไฟล์ไม่ทับกัน — **ไม่แนะนำ worktree ต่อคน**
(ดู §15.B4 ว่า worktree ที่ค้างสร้างปัญหาอะไรไว้แล้ว)

### 16.4 Integration checkpoint — ใครทำ ทำอะไร

จบทุกคลื่น orchestrator รัน (ไม่ใช่ agent):
1. typecheck ทั้งโปรเจกต์
2. รันเทสเฉพาะส่วนที่แตะ
3. เทียบว่าไฟล์ที่ถูกแก้จริง ⊆ ไฟล์ที่ manifest อนุญาต — **ถ้ามีไฟล์นอกเขต = หยุด สอบสวนก่อนไปต่อ**
4. เทียบ signature ที่เขียนจริงกับ contract ใน arch doc — ต่างเมื่อไหร่ = drift ต้องแก้ arch doc หรือแก้โค้ด ก่อนคลื่นถัดไป

ข้อ 3 และ 4 คือสิ่งที่กันไม่ให้ "ขนานแล้วเร็ว" กลายเป็น "ขนานแล้วต้องรื้อ"

---

## 17. Orchestrator — ใครกำกับ และกำกับด้วยอะไร

### 17.1 Orchestrator คือ session หลัก ไม่ใช่ agent ตัวใหม่

พิจารณา 3 ทาง:

| ทาง | ปัญหา |
|---|---|
| สร้าง `@orchestrator-agent` | subagent สั่ง subagent ไม่ได้/ไม่คุ้ม · มันจะกลายเป็นชั้นที่ส่งต่อคำสั่งเฉย ๆ = ตรงเกณฑ์ Ponytail #1 |
| ให้ `@pm-agent` เป็น orchestrator | pm เป็นเจ้าของ scope/tasks/ship อยู่แล้ว → จะกลายเป็นคนตรวจงานตัวเอง |
| **session หลักเป็น orchestrator** ✅ | ตรงกับที่ CLAUDE.md เขียนไว้แล้ว ("returns to coordinator") · เป็นตัวเดียวที่เห็นทุก step จริง |

**ปัญหาที่แท้จริงไม่ใช่ "ไม่มี orchestrator" แต่คือ "orchestrator ไม่มีของให้เช็ค"**
ตอนนี้การกำกับอยู่ในหัว ไม่ได้เขียนไว้ → เพิ่มไฟล์ 1 ไฟล์: `.claude/standards/orchestration-protocol.md`

### 17.2 สัญญาต่อ step — orchestrator ต้องทำ 4 อย่างทุกครั้ง

ทุก step ไม่มีข้อยกเว้น:

```
ก่อนเรียก agent   1. PRE  — input ครบไหม (gate ก่อนหน้าผ่านแล้ว? ไฟล์ที่ต้องอ่านมีจริง?)
                  2. BRIEF — ส่ง: ชื่อ agent · งาน · สเปก/สกิลที่ต้องโหลด · path ที่ต้องเขียน · เขตไฟล์
หลัง agent จบ     3. POST — ได้ output ตามที่สั่งไหม · path ที่อ้างมีจริงไหม · gate ผ่านหรือไม่ผ่าน
                  4. LOG  — บันทึกผลลง HANDOFF file ก่อนไป step ถัดไป
```

ข้อ 1 คือข้อที่จะจับ B1 ได้ (spec หายแต่ยังถูกอ้าง) · ข้อ 4 คือกฎ handoff ที่ CLAUDE.md มีอยู่แล้ว
แค่ทำให้เป็นจังหวะทุก step แทนที่จะทำตอนจะหยุด

### 17.3 ตารางกำกับต่อ step (เนื้อหาของ orchestration-protocol.md)

| Step | ก่อนเรียก ต้องมี | เรียกใคร | ผ่านเมื่อ |
|---|---|---|---|
| 1 | คำขอจากมนุษย์ | pm + ba | มนุษย์อนุมัติ brainstorm |
| 2 | brainstorm output | pm | มี AC ที่ทดสอบได้ |
| 3 | task list + AC | ba | BA sign-off file |
| 3.4 | BA sign-off · เข้า trigger threshold | arch | arch doc (brief หรือเต็ม) |
| 3.4b | arch doc | ponytail (โหมด arch-precheck) | ไม่มี BLOCK |
| 3.5 | arch doc + BA sign-off | มนุษย์ + ba | ทุก finding ปิด |
| 4 | grill record | pm | plan + **work-partition manifest** (§16.3) |
| 5 | arch doc + plan | ponytail (9 ข้อ) | APPROVE |
| 6 | manifest | DBA → Dev A ∥ UIUX A → Dev B | ทุกคลื่นผ่าน integration checkpoint |
| 7 | โค้ดครบ | qa | `/code-review` ปิดหมด + QA sign-off |
| 8 | QA sign-off | pm | PR merge + main เขียว |

Lane B/C/D ใช้สัญญาเดียวกัน แค่แถวน้อยกว่า (เขียนไว้ในไฟล์เดียวกัน)

### 17.4 เมื่อ agent ขัดแย้งกัน

orchestrator **ไม่ตัดสินเนื้อหา** — ส่งให้เจ้าของเรื่องตาม §4 RACI:

| ข้อพิพาท | คนตัดสิน |
|---|---|
| business rule / permission | `@ba-agent` |
| โครงสร้าง / pattern / contract | `@arch-agent` |
| tenant isolation / query safety | `@db-agent` (**veto ไม่มีใครคว่ำได้**) |
| scope / ลำดับความสำคัญ | `@pm-agent` |
| "มากเกินไปไหม" | `@ponytail-agent` |
| arch ปะทะ ponytail | **มนุษย์** (ไม่ใช่ pm) |

---

## 18. Model / Effort ของทุก agent

### 18.1 หลักที่ใช้ตัดสิน

1. **agent ที่เป็น gate หรือมีอำนาจ reject/veto → opus** (ตัดสินผิดแล้วของเสียไหลลงน้ำทั้งสาย)
2. **agent ที่ผลิตของให้คนอื่นต่อยอด → effort สูง** (พลาดแล้วลามหลายคน)
3. **agent ที่ทำตามสเปกที่มีอยู่ครบแล้ว → sonnet + effort ต่ำ** (งานแปลสเปกเป็นโค้ด/เลย์เอาต์)
4. **งานเชิงกลไก (เช็กว่าไฟล์มีจริง, diff ชื่อ test) → ไม่ใช่ agent ให้เป็น script** — ไม่ตั้ง agent ราคาถูกมารับ

### 18.2 ตารางกำหนด (ค่าปัจจุบันอ่านจากไฟล์จริง 2026-09-09)

| Agent | ตอนนี้ | เสนอ | เปลี่ยน | เหตุผล |
|---|---|---|---|---|
| `@ba-agent` | opus / max | **opus / max** | คงเดิม | gate ความถูกต้องของ requirement + authz design |
| `@arch-agent` | — | **opus / max** | ใหม่ | เป็น gate ที่ plan/manifest/โค้ดทุกคนต่อยอด · เป็นตัว freeze contract ให้ทำงานขนานได้ |
| `@ponytail-agent` | opus / max | **opus / max** | คงเดิม | มีอำนาจ reject สูงสุด + ต้องรับ 2 โหมด (precheck / 9-point) |
| `@qa-agent` | opus / max | **opus / max** | คงเดิม | ตรวจ isolation + RBAC = ด่านสุดท้ายก่อนของขึ้น prod |
| `@db-agent` | sonnet / high | **opus / high** | ⬆ ขึ้น | มี **veto ที่ไม่มีใครคว่ำได้** = เป็น gate ตามหลักข้อ 1 · และโปรเจกต์มีประวัติบั๊ก scoping ซ้ำ ๆ (ADR-0009 inpatient-delete-scope, ADR-0011 care-history scope, ADR-0014 hospitalization-branch-isolation) → พลาดที่ชั้นนี้ = ข้อมูลข้าม tenant |
| `@dev-agent` | sonnet / **medium** | **sonnet / high** | ⬆ effort | เป็นคนเขียน `requirePermission` + ส่ง `tenantId` เข้า repository จริง · medium ต่ำไปสำหรับงานที่พลาดแล้วกลายเป็นช่องโหว่ · ยังคง sonnet เพราะเป็นงานแปลสเปกไม่ใช่งานตัดสิน |
| `@pm-agent` | sonnet / **medium** | **sonnet / high** | ⬆ effort | ตั้งแต่ §16 เป็นต้นไป pm ผลิต **work-partition manifest** ที่คุมความปลอดภัยของงานขนานทั้ง Step 6 · manifest ผิด = ไฟล์ทับกันทั้งคลื่น |
| `@uiux-agent` | sonnet / low | **sonnet / low** | คงเดิม | ทำงานบน `anemal-design-system` + `anemal-screen-specs` ที่มีสเปกครบแล้ว · **ยกเว้น** หน้าจอใหม่ที่ยังไม่มี screen-spec → orchestrator สั่ง bump เป็น medium เฉพาะครั้ง |
| `@scribe-agent` | — | **sonnet / high** | ใหม่ | ตรวจกฎ ไม่ตัดสิน → ไม่ต้อง opus · แต่เป็นด่านก่อน merge (red-suite gate, PR compliance, reference integrity) → ต่ำกว่า high ไม่ได้ (§20.3) |

**ไม่มี agent ตัวไหนใช้ haiku** — งานที่ควรถูกลงถึงระดับนั้น (เช็กว่า path ที่อ้างมีจริง, diff รายชื่อ test
ก่อน/หลัง refactor) เป็นงาน **script ใน `/anemal-finish-branch`** ไม่ใช่ agent (หลักข้อ 4)
การตั้ง agent ราคาถูกมาทำงานที่ `test -f` ทำได้ = เพิ่มชั้นที่ส่งต่อคำสั่งเปล่า ๆ

### 18.3 ข้อจำกัดที่ต้องรู้

- **Dev A / Dev B ใช้ frontmatter ตัวเดียวกัน** (เป็น instance ของ `dev-agent`) → ตั้ง effort ต่างกันไม่ได้
  ถ้างาน frontend ครั้งนั้นเบามาก orchestrator ระบุใน brief ได้ แต่ค่าใน frontmatter ยังเป็นค่าเดียว
- **ค่าใช้จ่ายที่เพิ่มจริง** มาจาก `@db-agent` sonnet → opus เป็นหลัก (อีก 2 รายการเป็นแค่ effort)
  ถ้าอยากประหยัด: ทางเลือกคือคง `db-agent` ไว้ที่ sonnet/high แล้วพึ่ง `@qa-agent` (opus/max)
  เป็นผู้ตรวจ isolation แทน — **แต่ไม่แนะนำ** เพราะจับตอน Step 7 คือหลังโค้ดเขียนเสร็จ ต้องรื้อ
  ส่วนจับตอน design ที่ Step 6 ต้นคลื่นคือแก้ก่อนใครต่อยอด

---

## 19. เข้า workflow ยังไง — คีย์เวิร์ดและการ route

### 19.1 ความจริงที่ต้องรู้ก่อน

มี 2 ทางเข้า และคุณภาพต่างกันมาก:

| ทาง | ความแน่นอน | ใช้เมื่อ |
|---|---|---|
| **slash command** เช่น `/anemal-refactor` | **แน่นอน 100%** — เข้า lane นั้นเสมอ | เมื่อรู้อยู่แล้วว่าเป็นงานประเภทไหน |
| **พิมพ์เป็นภาษาคน** เช่น "ช่วย refactor โค้ดส่วนนี้ที" | **ไม่แน่นอน** — ขึ้นกับว่า router/skill description จับคำได้ไหม | เมื่อยังไม่แน่ใจว่างานเป็นประเภทไหน |

**สภาพวันนี้:** พิมพ์ว่า "ตรวจสอบ code แล้ว refactor ใหม่ทั้งหมด" → **ไม่เข้า workflow ไหนเลย**
เพราะยังไม่มี Lane D และ CLAUDE.md ไม่มีตารางแปลงเจตนา → ผลคือลงมือแก้โค้ดตรง ๆ ไม่ผ่าน gate

### 19.2 กลไกที่จะทำให้ภาษาคนเข้า lane ได้ (3 ชั้น)

**ชั้น 1 — Lane selector ใน CLAUDE.md (T0, ~10 บรรทัด)**
ตารางสั้นแปลง "สัญญาณในคำสั่ง" → lane:

| สัญญาณในคำที่พิมพ์ | เข้า lane | หมายเหตุ |
|---|---|---|
| เพิ่ม/เปลี่ยนพฤติกรรม, "ทำฟีเจอร์", "เพิ่มหน้า" | A | เต็ม pipeline |
| "พัง", "error", "ไม่ทำงาน", "ผลลัพธ์ผิด", bug | B | ต้อง reproduce ก่อน |
| "prod ล่ม", "ข้อมูลเสีย", "หลุด/leak", "main แดง" | C | **มนุษย์ต้องยืนยัน** ก่อนเข้า |
| "refactor", "จัดโครงสร้างใหม่", "ทำให้อ่านง่ายขึ้น", "ลดโค้ดซ้ำ" | D | ต้องไม่เปลี่ยนพฤติกรรม |
| "review", "ตรวจโค้ด", "audit" | — | **ไม่ใช่ lane** — เป็น `/code-review` เดี่ยว ๆ ไม่แก้โค้ด |

**ชั้น 2 — description ของสกิล `anemal-dev-lanes`**
ต้องใส่คำจริงที่คนพิมพ์ ทั้งไทยและอังกฤษ ลงใน frontmatter description เพื่อให้สกิลถูกดึงอัตโนมัติ:
`refactor · รีแฟคเตอร์ · จัดโครงสร้างโค้ด · แก้บั๊ก · bug · พัง · error · hotfix · prod ล่ม · ข้อมูลเสีย · regression`

**ชั้น 3 — กฎ "เดาไม่ออกให้ถาม"**
ถ้าคำสั่งเข้าได้ ≥2 lane หรือไม่เข้าเลย → **ถามก่อน ห้ามเดา**
(เช่น "ทำให้เร็วขึ้น" = อาจเป็น D ถ้าไม่เปลี่ยนพฤติกรรม หรือ A ถ้าเปลี่ยน)

### 19.3 ตอบเคสที่ถาม — "ตรวจสอบ Code และทำ Refactoring ใหม่ทั้งหมด"

คำสั่งนี้มี **2 งานคนละชนิด** และคำว่า "ทั้งหมด" คือกับดัก:

```
"ตรวจสอบ Code"        →  /code-review   (อ่านอย่างเดียว ไม่แก้ ไม่ใช่ lane)
"Refactoring ทั้งหมด"  →  Lane D  แต่ผ่านตรง ๆ ไม่ได้
```

**ทำไมผ่านตรง ๆ ไม่ได้:** Lane D บังคับ characterization test + test-set equality + reverse-ponytail
· refactor ทั้ง codebase ในสาขาเดียว = ไม่มีทาง revert ทีละชิ้น, review ไม่ออก, และถ้าแดงจะไม่รู้ว่าตัวไหนทำ

**เส้นทางที่ถูกต้อง — เพิ่มขั้น "แตกงาน" ก่อนเข้า Lane D:**

```
/code-review ทั้ง repo           → รายการปัญหา (อ่านอย่างเดียว)
        ↓
@arch-agent จัดเป็น refactor backlog  → เรียงตาม {ความเสี่ยง, ผลตอบแทน, มี test คลุมหรือยัง}
        ↓
แต่ละรายการ = /anemal-refactor 1 รอบ 1 สาขา
```

**กฎ scope guard ที่จะเขียนไว้ใน Lane D:** เจอคำว่า "ทั้งหมด / ทั้ง repo / all / entire"
→ ห้ามเริ่มแก้ ให้ออก backlog ก่อนเสมอ

### 19.4 สรุปคำสั่งที่ใช้ได้หลังทำเสร็จ

| อยากได้ | พิมพ์ |
|---|---|
| ฟีเจอร์ใหม่ | `/superpowers:brainstorm <เรื่อง>` (เข้า Lane A) |
| แก้บั๊ก | `/anemal-fix-bug <อาการ>` |
| prod ล่ม | `/anemal-hotfix <อาการ>` (ต้องเป็นคนพิมพ์เอง) |
| จัดโครงสร้างโค้ด | `/anemal-refactor <ขอบเขต>` |
| ตรวจโค้ดเฉย ๆ | `/code-review` |
| ตรวจแล้วจัดใหม่ทั้งระบบ | `/code-review` → ให้ arch ออก backlog → `/anemal-refactor` ทีละชิ้น |
| ไม่รู้ว่าอันไหน | พิมพ์เป็นภาษาคนได้ — ระบบจะถามกลับถ้าจับ lane ไม่ชัด |

---

## 20. Git & Documentation — ตรวจแล้ว: **ไม่มีเจ้าของ** → เสนอ `@scribe-agent`

### 20.1 สภาพปัจจุบัน (ตรวจไฟล์จริง)

| ของที่มี | อยู่ที่ไหน | ใครถือ |
|---|---|---|
| กฎ branch naming · conventional commits · PR rules · CI/CD · deployment · pre-prod checklist | `.claude/skills/anemal-coding-rules/references/06-github-workflow.md` (3.7 KB, 9 หัวข้อ) | **สกิลนี้ถูกโหลดโดย `@dev-agent` และ `@qa-agent`** |
| ขั้นตอน ship จริง (preflight gh auth → test gate → สร้าง PR → เช็ค main หลัง merge → เรียก HTML-updater) | `.claude/skills/anemal-finish-branch/SKILL.md` (6 หัวข้อ) | `@pm-agent` |
| กฎอัปเดตเอกสาร 5 รายการ (phase-history, roadmap/index, README, docs/index.html, status matrix) | `CLAUDE.md:154–181` | `@pm-agent` (ทำ **LAST**) |
| กฎว่าเอกสารไหนต้อง track | `.claude/standards/doc-git-policy.md` | ไม่มีใครถือชัด |

**agent เฉพาะทางสำหรับ git หรือเอกสาร: ไม่มี** — ทั้งสองเรื่องถูกแปะเพิ่มให้ `@pm-agent`

### 20.2 หลักฐานว่าการไม่มีเจ้าของทำให้พังจริง

1. **คนที่ทำ git ไม่ได้โหลดกฎ git** — `pm-agent.md` โหลด `anemal-functional-reqs`, `anemal-ba-toolkit`,
   `roadmap/`, `specs/`, `anemal-rbac-matrix` · **ไม่มี `anemal-coding-rules`** ซึ่งเป็นที่อยู่ของ
   `06-github-workflow.md` → pm ship ของโดยไม่ได้อ่านกฎ branch/commit/PR ของโปรเจกต์ตัวเอง
2. **ของพัง 4 อย่างใน §15.B ล้วนเป็นงาน git/doc hygiene** — spec หายแต่ยังถูกอ้าง (B1),
   schema ซ้ำและ drift (B2), ไฟล์ตาย 28.7 KB ยัง track (B3), worktree 42 MB ไม่ถูก ignore (B4)
   → ไม่มีใครถือ = ไม่มีใครเจอ
3. **`13a39e3` untrack 19 ไฟล์ กู้กลับแค่ 2** — อีก 17 หายเงียบ ไม่มีคนเช็ค
4. **เอกสารถูกทำ "LAST"** โดย agent ที่ตอนนั้นเหนื่อยที่สุดของ pipeline — จังหวะที่แย่ที่สุดสำหรับงานละเอียด

### 20.3 ข้อเสนอ — `@scribe-agent` (Docs & Git steward)

**ทำไมรวม git กับ doc เป็นตัวเดียว ไม่แยก 2 ตัว:** ในโปรเจกต์นี้เอกสารถูก track ใน git
(`doc-git-policy.md` ฉบับ 2026-08-19) → การอัปเดตเอกสาร *คือ* การ commit
งานสองอย่างนี้เกิดที่จังหวะเดียวกัน แยกแล้วต้องคุยกันเอง = เพิ่มชั้นเปล่า

| | |
|---|---|
| **Model / Effort** | **sonnet / high** — เป็นงานตรวจกฎ ไม่ใช่งานตัดสิน (จึงไม่ใช่ opus) แต่เป็นด่านก่อน merge (จึงไม่ใช่ medium) |
| **ไฟล์** | `.claude/agents/scribe-agent.md` + `.claude/agents/scribe-agent/SKILL.md` |
| **โหลดอะไร** | `anemal-coding-rules/references/06-github-workflow.md` · `anemal-finish-branch` · `standards/doc-git-policy.md` · `standards/doc-maintenance.md` · `standards/doc-map.md` |
| **ไม่ทำอะไร** | ไม่เขียน production code · ไม่ตัดสิน scope (pm) · ไม่ตัดสินคุณภาพโค้ด (qa) — ตรวจ **ความครบและความสอดคล้อง** เท่านั้น |

**ชื่อทางเลือก:** `@release-agent` ถ้าอยากเน้นฝั่ง ship มากกว่าฝั่งเอกสาร — เนื้องานเดียวกัน

### 20.4 หน้าที่ และจุดที่ถูกเรียกในทุก flow

เรียก **2 จุดหลัก** ไม่ใช่ทุก step (เรียกทุก step = แพงและกลายเป็นพิธีกรรม):

| จุด | ทำอะไร | ผ่านเมื่อ |
|---|---|---|
| **Step 4 (หลัง write-plan)** — pre-check เบา | 1. ทุก path ที่ plan/manifest อ้างมีอยู่จริง (`test -f`) · 2. ไฟล์ `.md` ใหม่ในแผนมีแถวใน `doc-map.md` · 3. ชื่อ branch ตรงกฎ | ไม่มี path ตาย |
| **Step 8 (เจ้าของเต็ม)** — แทน `@pm-agent` | เจ้าของ `/anemal-finish-branch` ทั้งหมด: preflight → test gate → **red-suite ship gate** → PR body compliance → merge → main เขียว → `/anemal-HTML-updater` → อัปเดตเอกสาร 5 รายการ | PR merge + main เขียว + เอกสารครบ |

**เรียกเพิ่มเฉพาะกรณี:**

| flow | scribe บังคับอะไร |
|---|---|
| Lane B (bug) | commit มี regression test อยู่ในนั้นจริง · ไม่มี test ถูกลบเงียบ ๆ |
| Lane C (hotfix) | **PR body ต้องมี HOTFIX block ครบ 4 ช่อง** (อาการ · ผลกระทบ · exemption · ลิงก์ follow-up) · มี entry ใน "Open hotfix debt" — ไม่มี = block merge |
| Lane D (refactor) | **หลักฐาน test-set equality ต้องแนบใน PR** (รายชื่อ test ก่อน/หลัง) · ถ้ามี test หาย ต้องมี deleted-coverage justification |
| ทุก lane | commit format + `Co-Authored-By` · atomic commit · ไม่มีไฟล์นอกเขต manifest หลุดเข้า commit |

**งานประจำที่ scribe เป็นเจ้าของ (ไม่ผูกกับ feature):**
reference-integrity scan (§15.F ข้อ 3) · ดูแล `.gitignore` ให้ครอบ worktree · เก็บกวาด worktree ค้าง ·
รักษา `doc-map.md` ให้ตรงจริง · เฝ้าว่าไม่มี canonical ซ้ำสองที่

### 20.5 สิ่งที่ย้ายออกจาก `@pm-agent`

| ย้าย | ไปไหน | pm เหลืออะไร |
|---|---|---|
| `/anemal-finish-branch` (Step 8) | scribe | scope · task breakdown · AC · **work-partition manifest** |
| อัปเดตเอกสาร 5 รายการ | scribe | pm ยัง *ตัดสิน* ว่าอะไรคือ phase ที่ชิป scribe เป็นคน *เขียนลงไฟล์* |
| `CLAUDE.md:154–181` Tracking rules | `standards/doc-maintenance.md` (scribe เป็นเจ้าของ ไม่ใช่ pm) | — |
| `/anemal-HTML-updater` | scribe | — |

pm ยังอยู่ที่ Step 1, 2, 4 · Step 8 เปลี่ยนเป็น scribe
**ผลข้างเคียงที่ดี:** pm ไม่ต้องทำงานเอกสารตอนหมดแรง และไม่ต้องเป็นคนตรวจงานที่ตัวเองเป็นคนสั่ง

---

## ภาคผนวก — ตาราง Agent Router หลังปรับ

| งาน | Agent | ป้ายใน Step 6 | Model / Effort | Step |
|---|---|---|---|---|
| Requirement, authorization design, gap analysis | `@ba-agent` | — | opus / max | 3 |
| **Architecture, class/pattern, logical model, testing rule, freeze contract** | **`@arch-agent`** | — | **opus / max** ⭐ใหม่ | **3.4** |
| Scope, task breakdown, **work-partition manifest** | `@pm-agent` | — | sonnet / **high** ⬆ | 1, 2, 4 |
| **Git hygiene, PR compliance, เอกสารทั้งหมด, ship** | **`@scribe-agent`** | — | **sonnet / high** ⭐ใหม่ | **4 (pre-check), 8** |
| Screen/component design | `@uiux-agent` | **UIUX A** | sonnet / low | 6 W1 |
| Physical schema, migration, tenant isolation (**veto**) | `@db-agent` | **DBA** | **opus** ⬆ / high | 6 W0 |
| Backend implementation | `@dev-agent` (inst.1) | **Dev A** | sonnet / **high** ⬆ | 6 W1 |
| Frontend implementation | `@dev-agent` (inst.2) | **Dev B** | sonnet / **high** ⬆ | 6 W1–W2 |
| Simplicity gate (9 ข้อ) + โหมด arch-precheck | `@ponytail-agent` | — | opus / max | 3.4b, 5 |
| Tests, RBAC/isolation, arch conformance | `@qa-agent` | — | opus / max | 7 |
| **กำกับทุก step, integration checkpoint** | **session หลัก** (ไม่ใช่ agent) | — | — | ทุก step |

⭐ = agent ใหม่ · ⬆ = เสนอให้ปรับขึ้นจากค่าปัจจุบัน (เหตุผลใน §18.2)
