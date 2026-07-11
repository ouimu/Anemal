# งาน 2 — เพิ่ม Vitals และ nursing fields ใน Log Care modal

## Verdict

งานนี้ยังเหลือจริงและเป็น frontend/UX redesign แต่คำว่า “backend พร้อม” ต้องตีความให้ตรง: backend รับและบันทึก field ได้แล้ว ไม่ได้แปลว่ามี clinical range validation ครบ

ปัจจุบัน `careSchema` รับ `heartRateBpm`, `respRateRpm`, `feedingStatus`, `medicationGiven` และ repository บันทึกครบ แต่ `CareEntry` กับ modal ส่งเพียง `timeSlot`, `temperatureC`, `notes`

## งานนี้คืออะไร

เป้าหมายไม่ใช่ “เอา input 4 ช่องมาแปะ” แต่ทำให้ staff บันทึก observation หนึ่งรอบได้เร็วและไม่กำกวมบน tablet:

1. เลือกรอบเวลา
2. บันทึก temperature / heart rate / respiratory rate
3. บันทึก feeding / medication-treatment note / general notes
4. save เป็น care entry เดียว พร้อม user จาก server และ recorded timestamp

ยังไม่ใช่ medication administration record (MAR), treatment scheduler, dosage verification หรือ alert engine

## สิ่งที่ระบบจริงทำ และสิ่งที่ควรยืม

### ezyVet Vet Radar

Vet Radar แยก patient sheet เป็น treatment tasks; ตอน complete งานสามารถบังคับกรอก value, ใส่ actual time และ note ได้ ระบบแสดงสถานะงานตาม timeline: [complete a treatment task](https://docs.ezyvet.com/en/browse-documentation/vet-radar/patient-whiteboard/treatment-tasks/complete-a-treatment-task), [patient sheet](https://docs.ezyvet.com/en/browse-documentation/vet-radar/getting-started/the-patient-sheet)

สิ่งที่ยืม: ค่า clinical ควรอยู่ใกล้งาน/เวลา, required เฉพาะค่าที่ workflow กำหนด, note เป็น optional, completion ต้องชัดเจน

สิ่งที่ไม่ยืมใน task นี้: task scheduler, overdue state, backdate, approval workflow เพราะ schema AnimalClinic ยังเป็น care entry ต่อ time slot

### Vetspire NOVA

NOVA เป็น electronic whiteboard/treatment sheet แสดง treatment รายชั่วโมง, provider/care team และ active sheet ตาม location: [NOVA Board](https://manual.vetspire.com/vetspire-user-manual/ok/Commercial/use-the-novasheet). Encounter ของ Vetspire แยก Vitals section เพื่อ record และดูค่าก่อนหน้า: [Encounter sections](https://manual.vetspire.com/vetspire-user-manual/ok/Commercial/encounter-sections)

สิ่งที่ยืม: จัดกลุ่ม Vitals แยกจาก treatment/nursing observation และคง visibility ของค่าก่อนหน้าใน Care History

### Touch/accessibility

Apple แนะนำ hit target อย่างน้อย 44×44 pt และ WCAG 2.2 AA กำหนดขั้นต่ำ 24×24 CSS px พร้อมข้อยกเว้นเรื่อง spacing: [Apple UI guidance](https://developer.apple.com/design/tips/), [WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Project กำหนด 44px จึงใช้ค่าที่เข้มกว่าและต้องคงไว้

## Design ที่แนะนำ

คง wizard 3 step เดิมเพื่อไม่เพิ่มความจำและไม่เปลี่ยน API:

### Step 1 — Care time

- ปุ่ม 08:00 / 12:00 / 16:00 / 20:00 แบบเดิม
- แสดง patient name ชัดเจน
- ไม่เพิ่ม backdate/actual time เพราะ backend ไม่มี field รองรับ

### Step 2 — Vital signs

วาง 3 controls ใน responsive grid:

- Temperature, `°C`, decimal step 0.1
- Heart rate, `bpm`, integer step 1
- Respiratory rate, `rpm`, integer step 1

ที่ 768px portrait ใช้ 1 column ถ้าพื้นที่ไม่พอ; ที่ 1024px landscape/desktop ใช้ 2–3 columnsตามพื้นที่ modal ห้ามบังคับ horizontal scroll

อย่าใช้ปุ่ม `+` จากศูนย์เป็นวิธีหลัก เพราะกรอก 38.5°C ต้องกดหลายร้อยครั้ง ให้ใช้ numeric input ที่พิมพ์ได้และมี +/- เป็นตัวช่วยแบบ `VitalStepper` ใน EMR ซึ่ง repo มี implementation/test อยู่แล้ว

### Step 3 — Nursing care & notes

1. **Feeding status**: ใช้ native/select หรือ touch picklist ไม่ใช้ free text เป็นทางหลัก
   - ไม่ได้ประเมิน / Not assessed → ส่ง `null`
   - กินได้ทั้งหมด / Ate all
   - กินได้บางส่วน / Ate some
   - ไม่กิน / Refused
   - งดอาหารตามแผน / NPO
   - ช่วยป้อน / Assisted feeding
   - อื่น ๆ / Other → เปิด text input สั้น
2. **Medication / treatment note (optional)**: multiline text ระบุว่าเป็น documentation field ไม่ใช่ verified medication order ตัวอย่าง placeholder “ชื่อยา/การรักษา, ขนาด, route หรือหมายเหตุ” แต่ไม่ auto-claim ว่า administered อย่างปลอดภัย
3. **Care notes (optional)**: observation/instructions ที่ไม่ซ้ำ medication

เหตุผลที่ feeding ใช้ picklist: Vet Radar ใช้ template/picklist สำหรับ treatment ที่ใช้บ่อย ลดการค้นหาและข้อความไม่สม่ำเสมอ: [treatment template picklists](https://docs.ezyvet.com/en/browse-documentation/vet-radar/patient-whiteboard/treatment-tasks/about-treatment-template-picklists)

ค่าข้างต้นเป็น initial controlled vocabulary สำหรับ UI เท่านั้น เพราะ DB ยังเก็บ String และ history เดิมอาจมีค่าอื่น จึงต้องแสดง legacy string ได้ตามเดิม

## Functional contract

### Initial state

```ts
type CareEntry = {
  timeSlot: '08:00' | '12:00' | '16:00' | '20:00'
  temperatureC: number | null
  heartRateBpm: number | null
  respRateRpm: number | null
  feedingStatus: string | null
  medicationGiven: string | null
  notes: string | null
}
```

ทุก clinical field optional ตาม backend ปัจจุบัน ค่า blank ต้องส่ง `null` ไม่ส่ง `''` ยกเว้นทีมเลือกคง `notes: ''` เพื่อ compatibility; ทางที่สะอาดกว่าคือ normalize ทุก optional string เป็น null ก่อน POST

### Numeric behavior

- input ว่าง = `null`
- temperature รับทศนิยม 1 ตำแหน่ง
- HR/RR รับ integer เท่านั้น
- value ≤ 0 ไม่ควรถูกส่ง; แสดง inline error และให้ staff แก้
- อย่ากำหนด “normal range” เป็น hard validation เพราะต่างตาม species/age/clinical state และ outlier อาจเป็นค่าจริงที่ต้องบันทึก
- หากต้องมี plausibility guard ให้เป็น soft warning และต้องผ่าน clinical sign-off ก่อน; งานนี้ยังไม่ควรคิด threshold เอง

ข้อสังเกตสำคัญ: `careSchema` ปัจจุบันใช้ `z.number()` / `z.number().int()` แต่ไม่มี `.positive()` จึงยังรับ negative ผ่าน API ได้ UI constraint ป้องกันความผิดพลาดทั่วไปแต่ไม่ใช่ security/data-integrity boundary ควรเปิด follow-up backend-hardening แยก หาก BA ต้องการ guarantee จากทุก client

### Error/saving behavior

- Save กดซ้ำไม่ได้ขณะ pending
- API error ต้องแสดงใน modal และเก็บค่าที่กรอกไว้
- success: invalidate `['inpatient-active']` และ `['hospitalization', id]` เหมือนเดิม
- close/back ห้าม submit
- เมื่อมีข้อมูลแล้วกดปิด ควรเตือน unsaved changes เฉพาะถ้า repo มี pattern นี้อยู่; ถ้าไม่มีให้ defer ไม่ขยาย scope

## Technical guideline

### File map

- Modify `src/frontend/src/views/clinic/ClinicInpatient.tsx`
- Prefer extract/reuse `VitalStepper` จาก `src/frontend/src/views/clinic/ClinicEMR.tsx` เป็น `src/frontend/src/components/VitalStepper.tsx`
- Update import ใน `ClinicEMR.tsx`
- Update `src/frontend/src/__tests__/VitalStepper.test.tsx` ให้ import shared component
- Extend `src/frontend/src/__tests__/ClinicInpatient.test.tsx`
- ถ้า screen นี้เข้า i18n แล้ว ให้เพิ่ม keys ใน translation store ตาม pattern เดิม; ห้ามเพิ่ม library

ไม่ควร copy `VitalStepper` อีกชุดไว้ใน CareModal เพราะ behavior เรื่อง typed value, Enter/blur, rounding, clamp และ wheel guard มี test แล้ว การ extract ทำให้สอง workflow ใช้ semantics เดียวกัน

### Layout/classes

- modal `w-full`, เพิ่มได้ถึง `max-w-xl`; body ใช้ `max-h-[min(80vh,...)] overflow-y-auto`
- interactive controls `min-h-[44px] min-w-[44px]`
- ใช้ design tokens เท่านั้น: `bg-surface`, `bg-surface-container-low`, `border-outline-variant`, `text-on-surface`, `text-error`
- ห้าม raw hex, `gray-*`, emoji
- label ต้องผูกกับ input ด้วย `htmlFor/id` หรือ `aria-label`; unit ไม่ใช่ label เพียงอย่างเดียว
- error ใช้ `aria-describedby` และ status ที่ screen reader อ่านได้

## Test matrix

1. เปิด modal แล้ว field ใหม่ทั้ง 4 ปรากฏและ accessible by label
2. กรอก 38.5 / 90 / 20 แล้ว POST เป็น number ถูก field
3. blank numeric/string normalize เป็น null
4. HR/RR ไม่ส่ง decimal; negative/zero ถูกบล็อกใน UI
5. feeding preset ส่ง string canonical; Other ส่งข้อความที่ผู้ใช้ระบุ
6. medication and notes ไม่สลับ field
7. API failure แสดง error, modal ยังเปิด, draft ไม่หาย
8. pending disables save; success invalidatesสอง query
9. keyboard: Tab order ถูก, Enter ใน numeric commit แต่ไม่ submit wizard โดยไม่ตั้งใจ, Escape/close ตาม modal pattern
10. viewport 768×1024 และ 1024×768 ไม่มี horizontal overflow; ทุก target ≥44px
11. Care History ยังแสดง field ทั้งหมดและ legacy feeding string ได้
12. backend focused integration ยืนยัน schema ยังรับ payload ใหม่ (ไม่จำเป็นต้องแก้ backend)

## Acceptance criteria

- staff บันทึก 7 data fields ของ care entry ได้จาก UI เดียว
- payload ตรง `careSchema` ทุกชื่อและชนิด
- tablet ใช้งานได้โดยไม่ต้องกด + หลายสิบ/ร้อยครั้ง
- ไม่มี dependency/endpoint/migration ใหม่
- ไม่สื่อให้ผู้ใช้เข้าใจว่า text field นี้เป็น MAR ที่ตรวจ dose/order แล้ว
- frontend tests และ build ผ่าน

## Out of scope

- scheduled treatments, overdue alerts, actual administration timestamp
- medication order linkage, dose/route enum, barcode verification, approval/co-sign
- species-specific reference range/clinical alert
-แก้ schema เป็น feeding enum หรือเพิ่ม historical vitals chart
