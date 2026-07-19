# บัญชีหน้าจอสำหรับคู่มือ Anemal

ตารางนี้เป็นต้นทางสำหรับตรวจความครอบคลุมของคู่มือฉบับภาษาไทย สถานะสิทธิ์ที่แท้จริงอาจแตกต่างตามบทบาทแบบกำหนดเองที่ Clinic Admin ตั้งไว้

| ID | หน้าจอ/เส้นทาง | ใช้ได้โดย | งานที่ต้องอธิบาย | ภาพประกอบ |
| --- | --- | --- | --- | --- |
| login | `/login` | ผู้ใช้คลินิกทุกบทบาท | กรอก Clinic ID, ชื่อผู้ใช้, รหัสผ่าน, จดจำชื่อผู้ใช้, เลือกสาขา | 01-login |
| navigation | Layout ของ `/clinic/*` | ตามสิทธิ์ | Sidebar, ค้นหา, ภาษา, บัญชี และออกจากระบบ | 02-clinic-navigation |
| dashboard | `/clinic/dashboard` | ผู้มี `dashboard.view` | อ่านสรุปงานประจำวันและการ์ดแจ้งเตือน | 03-dashboard |
| appointments | `/clinic/appointments` | ผู้มี `appointments.view` | ดูปฏิทิน, สร้าง, แก้ไข, เลื่อน และยกเลิกนัดหมายตามสิทธิ์ | 04-appointments |
| pets | `/clinic/pets` | ผู้มี `crm.view` | ค้นหาเจ้าของ, เพิ่ม/แก้ไขเจ้าของ, เพิ่ม/แก้ไขสัตว์เลี้ยง, ดูประวัติการรักษาและชำระเงิน | 05-pets-owner |
| emr | `/clinic/emr` | ผู้มี `emr.view` | ค้นหาผู้ป่วย, บันทึก SOAP, สัญญาณชีพ, น้ำหนัก, ใบสั่งยา และเอกสารแนบ | 06-emr-soap |
| vaccination | `/clinic/vaccinations-due` และ `/clinic/vaccinations-due/record` | ผู้มี `emr.view` / `vaccination.create` | ดูรายการถึงกำหนดและบันทึกวัคซีน | 07-vaccination |
| inpatient | `/clinic/inpatient` | ผู้มี `inpatient.view` | รับเข้า, แก้ไข, บันทึกการดูแล, ดูประวัติการดูแล และจำหน่ายผู้ป่วย | 08-inpatient |
| inventory | `/clinic/inventory` | ผู้มี `inventory.view` | ค้นหา, เพิ่ม/แก้ไขสินค้า, รับเข้า/ตัดจ่าย, สแกนบาร์โค้ด, แจ้งเตือนใกล้หมดอายุ และโอนสินค้า | 09-inventory |
| billing | `/clinic/billing` | ผู้มี `billing.create` | สร้างใบแจ้งหนี้, เพิ่มบริการ/สินค้า, ส่วนลด, รับชำระ, PromptPay และใบเสร็จ | 10-billing |
| transactions | `/clinic/transactions` | ผู้มี `billing.view` | ดูรายการเคลื่อนไหวและประวัติ | 11-transactions |
| grooming | `/clinic/grooming` | ผู้มี `grooming.view` | สร้างคิว, ระบุบริการ, อัปเดตสถานะ และจัดคิวอาบน้ำตัดขน | 12-grooming |
| admin-dashboard | `/clinic-admin/dashboard` | ผู้มี `clinic.profile.view` | อ่านภาพรวมสำหรับผู้ดูแลคลินิก | 13-admin-dashboard |
| users | `/clinic-admin/users` | ผู้มี `staff.view`/`staff.manage` | เพิ่ม แก้ไข เปิด/ปิดใช้งาน จัดการบทบาท และรีเซ็ตรหัสผ่านผู้ใช้ | 14-admin-users |
| roles | `/clinic-admin/roles` | ผู้มี `roles.view`/`roles.manage` | สร้างหรือแก้ไขบทบาทและกำหนดสิทธิ์ | 15-admin-roles |
| usage | `/clinic-admin/usage` | ผู้มี `clinic.profile.view` | ตรวจการใช้งานระบบ | 16-admin-usage |
| subscription | `/clinic-admin/subscription` | ผู้มี `clinic.profile.view` | ดูสถานะการสมัครใช้บริการ | 17-admin-subscription |
| blood-bank | `/clinic-admin/blood-bank` | ผู้มี `bloodbank.view` | จัดการผู้บริจาค เลือดคงเหลือ และสถานะถุงเลือด | 18-blood-bank |
| audit | `/clinic-admin/audit` | ผู้มี `audit.view` | ตรวจบันทึกกิจกรรมในระดับคลินิก | 19-admin-audit |
| clinic-profile | `/settings/clinic-profile` | ผู้มี `clinic.profile.view` | แก้ไขข้อมูลคลินิก | 20-settings-profile |
| hours | `/settings/hours` | ผู้มี `clinic.hours.edit` | กำหนดเวลาเปิดทำการ | 21-settings-hours |
| branches | `/settings/branches` | ผู้มี `clinic.branch.view` | เพิ่มหรือแก้ไขสาขาตามสิทธิ์ | 22-settings-branches |
| notifications | `/settings/notifications` | ผู้มี `clinic.integrations.edit` | ตั้งค่าการแจ้งเตือน | 23-settings-notifications |
| payment | `/settings/payment` | ผู้มี `clinic.payment.edit` | ตั้งค่าข้อมูลรับชำระและ PromptPay | 24-settings-payment |
| integrations | `/settings/integrations` | ผู้มี `clinic.integrations.edit` | ตั้งค่าการเชื่อมต่อ | 25-settings-integrations |
| preferences | `/preferences` | ผู้ใช้คลินิกทุกบทบาท | เปลี่ยนภาษา รูปแบบหน้าจอ และรหัสผ่านของตนเอง | 26-preferences |

## กติกาการอ้างอิง

- ภาพประกอบทุกภาพใช้ข้อมูลตัวอย่างเท่านั้น
- ไม่จัดทำหน้าจอหรือขั้นตอนใน `/platform/*`
- หากเมนูไม่แสดง ให้แนะนำผู้อ่านตรวจสิทธิ์กับ Clinic Admin แทนการอ้างว่าระบบทำงานผิดพลาด
