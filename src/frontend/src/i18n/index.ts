// Lightweight, dependency-free i18n for Anemal (EN / TH).
//
// Why no library: keeps the bundle lean and avoids a provider. `useT()` reads the
// active language straight from the persisted uiStore, so any component re-renders
// when the language toggle flips. Unknown keys fall back to English, then to the
// key itself — so partially-translated screens degrade gracefully.
//
// To translate more of the app: add the English string under `en` with a dotted
// key, then its Thai counterpart under `th`, and replace the literal in the
// component with `t('your.key')`.
import { useUiStore, type Language } from '../store/uiStore'

type Dict = Record<string, string>

const en: Dict = {
  // Profile menu (avatar popup)
  'menu.account': 'Account',
  'menu.language': 'Language',
  'menu.appearance': 'Appearance',
  'menu.darkMode': 'Dark mode',
  'menu.lightMode': 'Light mode',
  'menu.signOut': 'Sign out',
  'menu.english': 'English',
  'menu.thai': 'ไทย',

  // TopNav
  'top.searchPlaceholder': 'Search patients, appointments…',
  'top.notifications': 'Notifications',
  'top.help': 'Help',

  // Page titles (keyed by route)
  'page./clinic/dashboard': 'Dashboard',
  'page./clinic/appointments': 'Schedule',
  'page./clinic/pets': 'Pets & Owners',
  'page./clinic/emr': 'EMR',
  'page./clinic/inventory': 'Inventory',
  'page./clinic/billing': 'Billing',
  'page./clinic/inpatient': 'Inpatient',
  'page./clinic/grooming': 'Grooming',
  'page./admin/dashboard': 'Overview',
  'page./admin/users': 'Users & Roles',
  'page./admin/profile': 'Clinic Profile',
  'page./admin/usage': 'Usage Stats',
  'page./admin/settings': 'Settings',
  'page./admin/subscription': 'Subscription',
  'page./admin/branches': 'Branches',
  'page./admin/blood-bank': 'Blood Bank',
  'page./admin/audit': 'Audit Log',
  'page./settings/clinic-profile': 'Clinic Profile',
  'page./settings/hours': 'Operating Hours',
  'page./settings/notifications': 'Notifications',
  'page./settings/payment': 'Payment',
  'page./settings/integrations': 'Integrations',
  'page./settings/preferences': 'My Preferences',
  'page./settings/system': 'System Settings',

  // Sidebar nav — clinic
  'nav.dashboard': 'Dashboard',
  'nav.pets': 'Pets & Owners',
  'nav.schedule': 'Schedule',
  'nav.emr': 'EMR',
  'nav.inventory': 'Inventory',
  'nav.billing': 'Billing',
  'nav.inpatient': 'Inpatient',
  'nav.grooming': 'Grooming',
  // Sidebar nav — admin
  'nav.overview': 'Overview',
  'nav.users': 'Users & Roles',
  'nav.clinicProfile': 'Clinic Profile',
  'nav.usage': 'Usage Stats',
  'nav.settings': 'Settings',
  'nav.subscription': 'Subscription',
  'nav.branches': 'Branches',
  'nav.bloodBank': 'Blood Bank',
  'nav.auditLog': 'Audit Log',
  'nav.clinicPortal': 'Clinic Portal',
  'nav.adminPanel': 'Admin Panel',

  // Preferences page
  'prefs.title': 'My Preferences',
  'prefs.saved': 'Preferences saved',
  'prefs.appearance': 'Appearance',
  'prefs.darkModeDesc': 'Switch to a darker interface',
  'prefs.language': 'Language',
  'prefs.displayLanguage': 'Display language',
  'prefs.personalNotifications': 'Personal Notifications',
  'prefs.notifyAppointment': 'Notify me when an appointment is booked for me',
  'prefs.notifyLab': 'Notify me of new lab results',
  'prefs.save': 'Save Changes',

  // Common UI actions and labels
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.loading': 'Loading…',
  'common.saving': 'Saving…',
  'common.search': 'Search',
  'common.add': 'Add',
  'common.edit': 'Edit',
  'common.close': 'Close',
  'common.confirm': 'Confirm',
  'common.error': 'Something went wrong.',
  'common.required': 'Required',
  'common.name': 'Name',
  'common.email': 'Email',
  'common.phone': 'Phone',
  'common.active': 'Active',
  'common.inactive': 'Inactive',
  'common.noResults': 'No results found.',

  // Login page
  'login.title': 'Welcome back',
  'login.subtitle': 'Sign in to your clinic account',
  'login.subdomain': 'Clinic subdomain',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.signIn': 'Sign In',
  'login.signingIn': 'Signing in…',
  'login.invalidCredentials': 'Invalid credentials. Please try again.',
  'login.contactSupport': 'Contact System Support',
  'login.privacy': 'Privacy Policy',
  'login.terms': 'Terms of Service',

  // Clinic dashboard
  'clinic.dashboard.title': 'Clinic Overview',
  'clinic.dashboard.newAppointment': 'New Appointment',
  'clinic.dashboard.registerPet': 'Register Pet',
  'clinic.dashboard.newEMR': 'New EMR Record',
  'clinic.dashboard.createInvoice': 'Create Invoice',
  'clinic.dashboard.appointmentsToday': 'Appointments today',
  'clinic.dashboard.totalAppointments': 'Total appointments',
  'clinic.dashboard.revenueToday': 'Revenue today',
  'clinic.dashboard.lowStock': 'Critical / low stock',
  'clinic.dashboard.expiringSoon': 'Expiring soon',
  'clinic.dashboard.unpaidInvoices': 'Unpaid invoices',
  'clinic.dashboard.vaccinationsDue': 'Vaccinations due soon',
  'clinic.dashboard.revenue': 'Revenue',
  'clinic.dashboard.inventoryAlerts': 'Inventory Alerts',
  'clinic.dashboard.inpatientsNow': 'Inpatients now',
  'clinic.dashboard.groomingToday': 'Grooming today',

  // Clinic appointments
  'clinic.appointments.bookNew': 'Book Appointment',
  'clinic.appointments.searchPet': 'Search pet or owner…',
  'clinic.appointments.chiefComplaint': 'Chief complaint or visit type…',
  'clinic.appointments.patient': 'Patient',
  'clinic.appointments.doctor': 'Doctor',
  'clinic.appointments.date': 'Date',
  'clinic.appointments.time': 'Time',
  'clinic.appointments.duration': 'Duration',
  'clinic.appointments.reason': 'Reason (optional)',
  'clinic.appointments.booking': 'Booking…',
  'clinic.appointments.selectPet': 'Please select a pet',
  'clinic.appointments.selectDoctor': 'Please select a doctor',
  'clinic.appointments.failedToBook': 'Failed to book. Please try again.',

  // Admin dashboard
  'admin.dashboard.welcome': 'Welcome back, {name}',
  'admin.dashboard.subtitle': 'Clinic overview · Admin panel',
  'admin.dashboard.plan': 'Plan',
  'admin.dashboard.currentTier': 'Current subscription tier',
  'admin.dashboard.quickActions': 'Quick actions',
  'admin.dashboard.revenueByBranch': 'Revenue by Branch',
}

const th: Dict = {
  'menu.account': 'บัญชี',
  'menu.language': 'ภาษา',
  'menu.appearance': 'การแสดงผล',
  'menu.darkMode': 'โหมดมืด',
  'menu.lightMode': 'โหมดสว่าง',
  'menu.signOut': 'ออกจากระบบ',
  'menu.english': 'English',
  'menu.thai': 'ไทย',

  'top.searchPlaceholder': 'ค้นหาสัตว์เลี้ยง การนัดหมาย…',
  'top.notifications': 'การแจ้งเตือน',
  'top.help': 'ช่วยเหลือ',

  'page./clinic/dashboard': 'แดชบอร์ด',
  'page./clinic/appointments': 'ตารางนัด',
  'page./clinic/pets': 'สัตว์เลี้ยงและเจ้าของ',
  'page./clinic/emr': 'เวชระเบียน',
  'page./clinic/inventory': 'คลังสินค้า',
  'page./clinic/billing': 'การชำระเงิน',
  'page./clinic/inpatient': 'ผู้ป่วยใน',
  'page./clinic/grooming': 'อาบน้ำตัดขน',
  'page./admin/dashboard': 'ภาพรวม',
  'page./admin/users': 'ผู้ใช้และบทบาท',
  'page./admin/profile': 'ข้อมูลคลินิก',
  'page./admin/usage': 'สถิติการใช้งาน',
  'page./admin/settings': 'ตั้งค่า',
  'page./admin/subscription': 'แพ็กเกจ',
  'page./admin/branches': 'สาขา',
  'page./admin/blood-bank': 'ธนาคารเลือด',
  'page./admin/audit': 'บันทึกการใช้งาน',
  'page./settings/clinic-profile': 'ข้อมูลคลินิก',
  'page./settings/hours': 'เวลาทำการ',
  'page./settings/notifications': 'การแจ้งเตือน',
  'page./settings/payment': 'การชำระเงิน',
  'page./settings/integrations': 'การเชื่อมต่อ',
  'page./settings/preferences': 'การตั้งค่าส่วนตัว',
  'page./settings/system': 'ตั้งค่าระบบ',

  'nav.dashboard': 'แดชบอร์ด',
  'nav.pets': 'สัตว์เลี้ยงและเจ้าของ',
  'nav.schedule': 'ตารางนัด',
  'nav.emr': 'เวชระเบียน',
  'nav.inventory': 'คลังสินค้า',
  'nav.billing': 'การชำระเงิน',
  'nav.inpatient': 'ผู้ป่วยใน',
  'nav.grooming': 'อาบน้ำตัดขน',
  'nav.overview': 'ภาพรวม',
  'nav.users': 'ผู้ใช้และบทบาท',
  'nav.clinicProfile': 'ข้อมูลคลินิก',
  'nav.usage': 'สถิติการใช้งาน',
  'nav.settings': 'ตั้งค่า',
  'nav.subscription': 'แพ็กเกจ',
  'nav.branches': 'สาขา',
  'nav.bloodBank': 'ธนาคารเลือด',
  'nav.auditLog': 'บันทึกการใช้งาน',
  'nav.clinicPortal': 'พอร์ทัลคลินิก',
  'nav.adminPanel': 'แผงผู้ดูแล',

  'prefs.title': 'การตั้งค่าส่วนตัว',
  'prefs.saved': 'บันทึกการตั้งค่าแล้ว',
  'prefs.appearance': 'การแสดงผล',
  'prefs.darkModeDesc': 'สลับเป็นหน้าจอโทนมืด',
  'prefs.language': 'ภาษา',
  'prefs.displayLanguage': 'ภาษาที่แสดง',
  'prefs.personalNotifications': 'การแจ้งเตือนส่วนตัว',
  'prefs.notifyAppointment': 'แจ้งเตือนเมื่อมีการนัดหมายสำหรับฉัน',
  'prefs.notifyLab': 'แจ้งเตือนเมื่อมีผลแล็บใหม่',
  'prefs.save': 'บันทึกการเปลี่ยนแปลง',

  // Common UI actions and labels
  'common.save': 'บันทึก',
  'common.cancel': 'ยกเลิก',
  'common.delete': 'ลบ',
  'common.loading': 'กำลังโหลด…',
  'common.saving': 'กำลังบันทึก…',
  'common.search': 'ค้นหา',
  'common.add': 'เพิ่ม',
  'common.edit': 'แก้ไข',
  'common.close': 'ปิด',
  'common.confirm': 'ยืนยัน',
  'common.error': 'เกิดข้อผิดพลาด',
  'common.required': 'จำเป็นต้องระบุ',
  'common.name': 'ชื่อ',
  'common.email': 'อีเมล',
  'common.phone': 'เบอร์โทรศัพท์',
  'common.active': 'ใช้งานอยู่',
  'common.inactive': 'ไม่ได้ใช้งาน',
  'common.noResults': 'ไม่พบข้อมูล',

  // Login page
  'login.title': 'ยินดีต้อนรับกลับ',
  'login.subtitle': 'เข้าสู่ระบบบัญชีคลินิกของคุณ',
  'login.subdomain': 'ชื่อย่อคลินิก',
  'login.email': 'อีเมล',
  'login.password': 'รหัสผ่าน',
  'login.signIn': 'เข้าสู่ระบบ',
  'login.signingIn': 'กำลังเข้าสู่ระบบ…',
  'login.invalidCredentials': 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
  'login.contactSupport': 'ติดต่อฝ่ายสนับสนุนระบบ',
  'login.privacy': 'นโยบายความเป็นส่วนตัว',
  'login.terms': 'ข้อกำหนดการใช้บริการ',

  // Clinic dashboard
  'clinic.dashboard.title': 'ภาพรวมคลินิก',
  'clinic.dashboard.newAppointment': 'นัดหมายใหม่',
  'clinic.dashboard.registerPet': 'ลงทะเบียนสัตว์เลี้ยง',
  'clinic.dashboard.newEMR': 'บันทึกการรักษาใหม่',
  'clinic.dashboard.createInvoice': 'สร้างใบแจ้งหนี้',
  'clinic.dashboard.appointmentsToday': 'นัดหมายวันนี้',
  'clinic.dashboard.totalAppointments': 'นัดหมายทั้งหมด',
  'clinic.dashboard.revenueToday': 'รายได้วันนี้',
  'clinic.dashboard.lowStock': 'สินค้าวิกฤต / ใกล้หมด',
  'clinic.dashboard.expiringSoon': 'ใกล้หมดอายุ',
  'clinic.dashboard.unpaidInvoices': 'ใบแจ้งหนี้ค้างชำระ',
  'clinic.dashboard.vaccinationsDue': 'วัคซีนที่ถึงกำหนด',
  'clinic.dashboard.revenue': 'รายได้',
  'clinic.dashboard.inventoryAlerts': 'แจ้งเตือนสินค้าคงคลัง',
  'clinic.dashboard.inpatientsNow': 'ผู้ป่วยในขณะนี้',
  'clinic.dashboard.groomingToday': 'บริการอาบน้ำวันนี้',

  // Clinic appointments
  'clinic.appointments.bookNew': 'นัดหมายใหม่',
  'clinic.appointments.searchPet': 'ค้นหาสัตว์เลี้ยงหรือเจ้าของ…',
  'clinic.appointments.chiefComplaint': 'อาการหลักหรือประเภทการเยี่ยม…',
  'clinic.appointments.patient': 'ผู้ป่วย',
  'clinic.appointments.doctor': 'สัตวแพทย์',
  'clinic.appointments.date': 'วันที่',
  'clinic.appointments.time': 'เวลา',
  'clinic.appointments.duration': 'ระยะเวลา',
  'clinic.appointments.reason': 'เหตุผล (ไม่จำเป็น)',
  'clinic.appointments.booking': 'กำลังนัดหมาย…',
  'clinic.appointments.selectPet': 'กรุณาเลือกสัตว์เลี้ยง',
  'clinic.appointments.selectDoctor': 'กรุณาเลือกสัตวแพทย์',
  'clinic.appointments.failedToBook': 'การนัดหมายล้มเหลว กรุณาลองอีกครั้ง',

  // Admin dashboard
  'admin.dashboard.welcome': 'ยินดีต้อนรับกลับ, {name}',
  'admin.dashboard.subtitle': 'ภาพรวมคลินิก · แผงผู้ดูแล',
  'admin.dashboard.plan': 'แพลน',
  'admin.dashboard.currentTier': 'ระดับการสมัครสมาชิกปัจจุบัน',
  'admin.dashboard.quickActions': 'การดำเนินการด่วน',
  'admin.dashboard.revenueByBranch': 'รายได้ตามสาขา',
}

const DICTS: Record<Language, Dict> = { en, th }

/** Translate a key for an explicit language (non-hook contexts). */
export function translate(lang: Language, key: string): string {
  return DICTS[lang]?.[key] ?? en[key] ?? key
}

/**
 * Hook returning a translator bound to the active language from uiStore.
 * Re-renders the calling component whenever the language changes.
 */
export function useT(): (key: string) => string {
  const lang = useUiStore(s => s.language)
  return (key: string) => translate(lang, key)
}
