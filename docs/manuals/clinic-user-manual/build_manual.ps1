$ErrorActionPreference = 'Stop'

$root = 'D:\Development\AnimalClinic'
$outDir = Join-Path $root 'docs\manuals\clinic-user-manual\output'
$screenDir = Join-Path $root 'docs\manuals\clinic-user-manual\screenshots'
$docxPath = Join-Path $outDir 'Anemal-Clinic-User-Manual-TH.docx'
$pdfPath = Join-Path $outDir 'Anemal-Clinic-User-Manual-TH.pdf'
$tracePath = Join-Path $outDir 'build-trace.txt'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Set-Content -Path $tracePath -Value 'started' -Encoding utf8

function Trace([string]$message) { Add-Content -Path $script:tracePath -Value ("$(Get-Date -Format o)  $message") -Encoding utf8 }

function Set-RunFont($range, [int]$size, [bool]$bold = $false, [int]$color = 0) {
  $range.Font.Name = 'Leelawadee UI'
  $range.Font.Size = $size
  $range.Font.Bold = $(if ($bold) { 1 } else { 0 })
  $range.Font.Color = $color
}

function Add-Text($doc, [string]$text, [int]$size = 11, [bool]$bold = $false, [int]$color = 0, [int]$align = 0, [int]$spaceAfter = 6) {
  $sel = $doc.Application.Selection
  $sel.ParagraphFormat.Alignment = $align
  $sel.ParagraphFormat.SpaceAfter = $spaceAfter
  $sel.ParagraphFormat.LineSpacingRule = 0
  Set-RunFont $sel.Range $size $bold $color
  $sel.TypeText($text)
  $sel.TypeParagraph()
}

function Add-Heading($doc, [string]$text, [int]$level = 1) {
  $sel = $doc.Application.Selection
  if ($level -eq 1) {
    $sel.Style = 'Heading 1'
    $sel.ParagraphFormat.SpaceBefore = 18
    $sel.ParagraphFormat.SpaceAfter = 8
    Set-RunFont $sel.Range 20 $true 2639642
  } else {
    $sel.Style = 'Heading 2'
    $sel.ParagraphFormat.SpaceBefore = 12
    $sel.ParagraphFormat.SpaceAfter = 5
    Set-RunFont $sel.Range 14 $true 1880084
  }
  $sel.TypeText($text)
  $sel.TypeParagraph()
}

function Add-Note($doc, [string]$title, [string]$text) {
  $sel = $doc.Application.Selection
  $start = $sel.Range.Start
  $sel.ParagraphFormat.LeftIndent = 18
  $sel.ParagraphFormat.RightIndent = 18
  $sel.ParagraphFormat.SpaceAfter = 8
  Set-RunFont $sel.Range 10 $false 0
  $sel.TypeText("$title  $text")
  $sel.TypeParagraph()
  $end = $sel.Range.Start
  $r = $doc.Range($start, $end)
  $r.Shading.BackgroundPatternColor = 15921906
  $r.ParagraphFormat.LeftIndent = 18
  $r.ParagraphFormat.RightIndent = 18
  $sel.ParagraphFormat.LeftIndent = 0
  $sel.ParagraphFormat.RightIndent = 0
}

function Add-Steps($doc, [string[]]$items) {
  $i = 1
  foreach ($item in $items) {
    Add-Text $doc ("$i. $item") 11 $false 0 0 3
    $i++
  }
  Add-Text $doc '' 4 $false 0 0 2
}

function Add-Figure($doc, [string]$file, [string]$caption, [string]$alt) {
  $path = Join-Path $script:screenDir $file
  if (-not (Test-Path $path)) { throw "Missing screenshot: $file" }
  $sel = $doc.Application.Selection
  $sel.ParagraphFormat.Alignment = 1
  $shape = $sel.InlineShapes.AddPicture($path, $false, $true)
  $shape.AlternativeText = $alt
  if ($shape.Width -gt 460) { $shape.Width = 460 }
  $sel.TypeParagraph()
  $sel.ParagraphFormat.Alignment = 1
  Set-RunFont $sel.Range 9 $false 8421504
  $sel.TypeText($caption)
  $sel.TypeParagraph()
  $sel.TypeParagraph()
}

function Add-Table($doc, [string[]]$headers, [object[]]$rows, [int[]]$widths) {
  $sel = $doc.Application.Selection
  $table = $doc.Tables.Add($sel.Range, $rows.Count + 1, $headers.Count)
  $table.Borders.Enable = 1
  $table.AllowAutoFit = $false
  for ($c = 1; $c -le $headers.Count; $c++) {
    $cell = $table.Cell(1, $c)
    $cell.Range.Text = $headers[$c - 1]
    $cell.Shading.BackgroundPatternColor = 2639642
    Set-RunFont $cell.Range 9 $true 16777215
    if ($widths) { $cell.Width = $widths[$c - 1] }
  }
  for ($r = 0; $r -lt $rows.Count; $r++) {
    for ($c = 1; $c -le $headers.Count; $c++) {
      $cell = $table.Cell($r + 2, $c)
      $cell.Range.Text = [string]$rows[$r][$c - 1]
      Set-RunFont $cell.Range 9 $false 0
      if ($widths) { $cell.Width = $widths[$c - 1] }
    }
  }
  $doc.Application.Selection.SetRange($table.Range.End, $table.Range.End)
  $doc.Application.Selection.TypeParagraph()
}

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $word.Documents.Add()

try {
  $doc.PageSetup.TopMargin = 50
  $doc.PageSetup.BottomMargin = 50
  $doc.PageSetup.LeftMargin = 55
  $doc.PageSetup.RightMargin = 55
  $doc.Styles.Item('Normal').Font.Name = 'Leelawadee UI'
  $doc.Styles.Item('Normal').Font.Size = 11
  $doc.Styles.Item('Heading 1').Font.Name = 'Leelawadee UI'
  $doc.Styles.Item('Heading 2').Font.Name = 'Leelawadee UI'

  # Header and footer
  $header = $doc.Sections.Item(1).Headers.Item(1).Range
  $header.Text = 'ANEMAL  |  คู่มือผู้ใช้คลินิก'
  Set-RunFont $header 8 $true 8421504
  $header.ParagraphFormat.Alignment = 2
  $footer = $doc.Sections.Item(1).Footers.Item(1).Range
  $footer.Text = 'เอกสารใช้งานภายในคลินิก  |  '
  Set-RunFont $footer 8 $false 8421504
  $footer.ParagraphFormat.Alignment = 1
  $footer.Fields.Add($footer, -1) | Out-Null
  Trace 'document configured'

  # Cover
  Add-Text $doc 'ANEMAL' 18 $true 2639642 1 8
  Add-Text $doc 'คู่มือการใช้งานระบบคลินิก' 30 $true 2639642 1 10
  Add-Text $doc 'สำหรับ Clinic Admin, Doctor และ Clinic Staff' 16 $false 1880084 1 16
  Add-Text $doc 'ฉบับภาษาไทยสำหรับผู้เริ่มต้น' 13 $false 8421504 1 28
  Add-Text $doc 'เริ่มต้นจากการเข้าสู่ระบบ จัดการงานประจำวัน บันทึกเวชระเบียน ไปจนถึงการตั้งค่าระดับคลินิก' 11 $false 0 1 8
  Add-Note $doc 'ขอบเขตคู่มือ' 'ครอบคลุมเฉพาะการใช้งานภายในคลินิก ทั้งบทบาทผู้ดูแลคลินิก แพทย์ และพนักงานคลินิก โดยไม่ครอบคลุมส่วนผู้ดูแลแพลตฟอร์ม'
  Add-Text $doc 'เวอร์ชันเอกสาร: 19 กรกฎาคม 2026' 9 $false 8421504 1 0
  $doc.Application.Selection.InsertBreak(7)
  Trace 'cover created'

  # TOC
  Add-Heading $doc 'สารบัญ' 1
  Add-Text $doc '1. เริ่มต้นใช้งาน' 11 $false 0 0 2
  Add-Text $doc '2. บทบาทและสิทธิ์การใช้งาน' 11 $false 0 0 2
  Add-Text $doc '3. งานหน้าร้านและข้อมูลผู้รับบริการ' 11 $false 0 0 2
  Add-Text $doc '4. งานทางการแพทย์' 11 $false 0 0 2
  Add-Text $doc '5. คลังสินค้า การชำระเงิน และบริการ' 11 $false 0 0 2
  Add-Text $doc '6. Clinic Admin: การดูแลคลินิก' 11 $false 0 0 2
  Add-Text $doc '7. Clinic Admin: ตั้งค่าคลินิก' 11 $false 0 0 2
  Add-Text $doc '8. วิธีทำงานที่ปลอดภัยและแก้ปัญหาเบื้องต้น' 11 $false 0 0 2
  Add-Text $doc 'ภาคผนวก: คำศัพท์ที่ใช้ในคู่มือ' 11 $false 0 0 2
  $doc.Application.Selection.InsertBreak(7)
  Trace 'contents created'

  Add-Heading $doc '1. เริ่มต้นใช้งาน' 1
  Add-Text $doc 'ระบบจะแสดงเมนูตามสิทธิ์ของผู้ใช้ จึงอาจเห็นเมนูไม่เท่ากันในแต่ละบทบาท หากเมนูที่ต้องใช้ไม่ปรากฏ ให้ติดต่อ Clinic Admin เพื่อตรวจสอบสิทธิ์ก่อนเริ่มงาน' 11
  Add-Heading $doc '1.1 เข้าสู่ระบบ' 2
  Add-Steps $doc @('เปิดหน้าเข้าสู่ระบบของคลินิก', 'กรอก Clinic ID ของคลินิกในช่อง Select Clinic', 'กรอก Username ในช่อง Username — ช่องนี้ไม่ใช่อีเมล', 'กรอกรหัสผ่าน แล้วกด Sign In', 'เลือกสาขาที่ต้องการใช้งาน หากระบบแสดงหน้าจอเลือกสาขา', 'ตรวจสอบชื่อคลินิกและชื่อผู้ใช้บริเวณมุมซ้ายล่างก่อนเริ่มทำงาน')
  Add-Note $doc 'ความปลอดภัย' 'ห้ามบันทึกรหัสผ่านลงในเอกสารหรือส่งต่อผ่านแชต และควรออกจากระบบทุกครั้งเมื่อเลิกใช้งานหรือเปลี่ยนผู้ใช้งาน'
  Add-Figure $doc '01-login.png' 'ภาพที่ 1 หน้าจอเข้าสู่ระบบ: ใช้ Clinic ID, Username และรหัสผ่าน' 'หน้าจอเข้าสู่ระบบของ Anemal มีช่อง Clinic ID ชื่อผู้ใช้ และรหัสผ่าน'
  Add-Heading $doc '1.2 รู้จักหน้าจอหลัก' 2
  Add-Text $doc 'แถบเมนูด้านซ้ายใช้สลับโมดูลการทำงาน ส่วนแถบด้านบนมีช่องค้นหา การแจ้งเตือน ความช่วยเหลือ และเมนูบัญชีผู้ใช้ หน้าแดชบอร์ดช่วยสรุปนัดหมาย รายได้ วัคซีน และการแจ้งเตือนคลังสินค้าในจุดเดียว' 11
  Add-Figure $doc '02-dashboard.png' 'ภาพที่ 2 แดชบอร์ดคลินิก: จุดเริ่มต้นสำหรับตรวจงานประจำวัน' 'แดชบอร์ดคลินิกแสดงสรุปนัดหมาย รายได้ วัคซีน และสถานะคลังสินค้า'
  Trace 'chapter 1 created'

  Add-Heading $doc '2. บทบาทและสิทธิ์การใช้งาน' 1
  Add-Text $doc 'ใช้บัญชีของตนเองเสมอ สิทธิ์ถูกกำหนดตามบทบาทและอาจมีการปรับโดย Clinic Admin เมนูที่มองเห็นจริงจึงเป็นแหล่งอ้างอิงสุดท้าย' 11
  Add-Table $doc @('บทบาท','งานหลัก','ข้อควรทราบ') @(
    @('Clinic Admin','ตั้งค่าคลินิก ผู้ใช้ บทบาท การชำระเงิน รายงาน คลังสินค้า และตรวจสอบประวัติ','รับผิดชอบการกำหนดสิทธิ์และข้อมูลระดับคลินิก'),
    @('Doctor','เวชระเบียน EMR บันทึก SOAP ใบสั่งยา ไฟล์แนบผลตรวจ และผู้ป่วยใน','ตรวจสอบสัตว์เลี้ยงและเจ้าของก่อนบันทึกข้อมูลทางการแพทย์'),
    @('Clinic Staff','นัดหมาย ข้อมูลลูกค้า/สัตว์เลี้ยง การชำระเงิน จุดขาย คลังสินค้า จ่ายยา อาบน้ำตัดขน และสะสมแต้ม','ทำงานตามสิทธิ์ที่ได้รับ และส่งต่อเคสทางคลินิกให้แพทย์')
  ) @(95,245,150)
  Add-Note $doc 'กรณีเข้าเมนูไม่ได้' 'ไม่ควรยืมบัญชีผู้อื่น ให้บันทึกชื่อเมนูและเวลาที่พบปัญหา แล้วแจ้ง Clinic Admin เพื่อตรวจสิทธิ์'

  Add-Heading $doc '3. งานหน้าร้านและข้อมูลผู้รับบริการ' 1
  Add-Heading $doc '3.1 ตารางนัดหมาย' 2
  Add-Text $doc 'เมนู Schedule ใช้ดูนัดหมายตามช่วงเวลา สร้างนัดใหม่ และติดตามสถานะนัดหมาย ควรค้นหาข้อมูลสัตว์เลี้ยงหรือเจ้าของก่อนสร้างนัดเพื่อป้องกันข้อมูลซ้ำ' 11
  Add-Steps $doc @('เลือกเมนู Schedule', 'เลือกวันที่หรือมุมมองปฏิทินที่ต้องการ', 'กด New Appointment', 'เลือกหรือค้นหาเจ้าของและสัตว์เลี้ยง', 'กำหนดวัน เวลา เหตุผลนัดหมาย และผู้เกี่ยวข้องตามที่หน้าจอร้องขอ', 'ตรวจสอบข้อมูลทั้งหมด แล้วบันทึก', 'เมื่อผู้รับบริการมาถึง ให้ปรับสถานะนัดตามขั้นตอนของคลินิก')
  Add-Figure $doc '03-appointments.png' 'ภาพที่ 3 หน้าจอตารางนัดหมาย' 'ตารางนัดหมายใช้ดูและจัดการนัดหมายของคลินิก'
  Add-Heading $doc '3.2 ข้อมูลสัตว์เลี้ยงและเจ้าของ' 2
  Add-Text $doc 'เมนู Pets & Owners เป็นศูนย์กลางข้อมูลผู้รับบริการ ควรเก็บชื่อ เบอร์ติดต่อ และข้อมูลสัตว์ให้ครบถ้วนก่อนทำรายการอื่น เช่น นัดหมาย EMR หรือออกใบแจ้งหนี้' 11
  Add-Steps $doc @('เลือกเมนู Pets & Owners', 'ค้นหาด้วยชื่อสัตว์เลี้ยงหรือเจ้าของก่อนเสมอ', 'หากไม่พบข้อมูล ให้เลือกสร้างรายการใหม่', 'กรอกข้อมูลเจ้าของและข้อมูลพื้นฐานของสัตว์เลี้ยงตามฟอร์ม', 'ตรวจคำสะกด ชนิด เพศ และวันเกิดก่อนบันทึก', 'กลับมาที่โปรไฟล์เพื่อแก้ไขข้อมูลเมื่อมีการเปลี่ยนแปลง')
  Add-Figure $doc '04-pets.png' 'ภาพที่ 4 หน้าจอข้อมูลสัตว์เลี้ยงและเจ้าของ' 'หน้าจอจัดการข้อมูลสัตว์เลี้ยงและเจ้าของ'
  Trace 'chapter 3 created'

  Add-Heading $doc '4. งานทางการแพทย์' 1
  Add-Text $doc 'เนื้อหาในบทนี้ใช้โดย Doctor เป็นหลัก ส่วนพนักงานคลินิกอาจเห็นเฉพาะบางรายการตามสิทธิ์ หลีกเลี่ยงการบันทึกข้อมูลทางการแพทย์ลงในโปรไฟล์ผิดตัว และตรวจชื่อสัตว์เลี้ยงทุกครั้งก่อนบันทึก' 11
  Add-Heading $doc '4.1 เวชระเบียน EMR และบันทึก SOAP' 2
  Add-Steps $doc @('เปิดเมนู EMR', 'ค้นหาและเลือกสัตว์เลี้ยงที่ถูกต้อง', 'เปิดประวัติเดิมก่อนเริ่มบันทึก เพื่อดูปัญหาสำคัญและการรักษาก่อนหน้า', 'สร้างบันทึกใหม่ แล้วบันทึกข้อมูล S: อาการ, O: ผลตรวจ, A: การประเมิน, P: แผนการรักษา ตามแนวทางคลินิก', 'เพิ่มใบสั่งยา ผลตรวจ หรือไฟล์แนบเมื่อมี', 'ทวนชื่อผู้ป่วย วันที่ และรายการสำคัญ แล้วบันทึก')
  Add-Note $doc 'คำแนะนำ' 'ใช้ภาษาทางการแพทย์ที่ชัดเจน ระบุหน่วยยาและคำสั่งใช้ให้ครบ หากต้องแก้ไขข้อมูลสำคัญให้เป็นไปตามแนวทางเวชระเบียนของคลินิก'
  Add-Figure $doc '05-emr.png' 'ภาพที่ 5 หน้าจอ EMR สำหรับค้นหาและจัดการเวชระเบียน' 'หน้าจอเวชระเบียนอิเล็กทรอนิกส์ EMR'
  Add-Heading $doc '4.2 ติดตามวัคซีน' 2
  Add-Text $doc 'หน้าวัคซีนแสดงรายการที่ใกล้ถึงกำหนด ใช้ตรวจติดตามก่อนโทรเตือนหรือสร้างนัดหมาย ควรยืนยันสัตว์เลี้ยงและวันที่กำหนดซ้ำก่อนติดต่อเจ้าของ' 11
  Add-Figure $doc '06-vaccinations.png' 'ภาพที่ 6 รายการวัคซีนที่ถึงกำหนด' 'หน้าจอรายการวัคซีนที่ถึงกำหนด'
  Add-Heading $doc '4.3 ผู้ป่วยใน' 2
  Add-Steps $doc @('เลือกเมนู Inpatient', 'ค้นหาเคสหรือเลือกสร้างรายการรับไว้รักษาตามสิทธิ์', 'ระบุข้อมูลการรับไว้รักษา พื้นที่พัก และผู้ดูแลตามแบบฟอร์ม', 'อัปเดตสถานะ การสังเกตอาการ และแผนการรักษาเป็นระยะ', 'ก่อนจำหน่าย ตรวจสอบคำสั่งแพทย์ รายการยา และคำแนะนำกลับบ้านให้ครบ')
  Add-Figure $doc '07-inpatient.png' 'ภาพที่ 7 หน้าจอผู้ป่วยใน' 'หน้าจอจัดการผู้ป่วยในของคลินิก'
  Trace 'chapter 4 created'

  Add-Heading $doc '5. คลังสินค้า การชำระเงิน และบริการ' 1
  Add-Heading $doc '5.1 คลังสินค้า' 2
  Add-Steps $doc @('เลือกเมนู Inventory', 'ค้นหารายการสินค้าก่อนสร้างรายการใหม่', 'ตรวจชื่อสินค้า หน่วยนับ ราคา และจุดสั่งซื้อก่อนบันทึก', 'บันทึกรับเข้า จ่ายออก หรือปรับยอดตามประเภทงานที่หน้าจอรองรับ', 'ตรวจรายการเตือนสินค้าต่ำหรือใกล้หมดอายุจากแดชบอร์ดและหน้า Inventory', 'เมื่อพบยอดผิดปกติ ให้ตรวจเอกสารอ้างอิงก่อนปรับยอด')
  Add-Figure $doc '08-inventory.png' 'ภาพที่ 8 หน้าจอคลังสินค้า' 'หน้าจอคลังสินค้าสำหรับติดตามรายการและยอดคงเหลือ'
  Add-Heading $doc '5.2 การชำระเงินและใบแจ้งหนี้' 2
  Add-Steps $doc @('เลือกเมนู Billing', 'ค้นหาเจ้าของและสัตว์เลี้ยงให้ถูกต้อง', 'เพิ่มรายการบริการ ยา หรือสินค้า โดยตรวจจำนวนและราคาทุกบรรทัด', 'ตรวจส่วนลด ภาษี และยอดสุทธิที่ระบบแสดง', 'เลือกวิธีชำระเงินตามที่รับจริง แล้วบันทึกรายการ', 'ส่งหรือพิมพ์ใบเสร็จตามขั้นตอนของคลินิก', 'หากต้องยกเลิกหรือคืนเงิน ให้ปฏิบัติตามสิทธิ์และนโยบายอนุมัติของคลินิก')
  Add-Figure $doc '09-billing.png' 'ภาพที่ 9 หน้าจอการชำระเงินและใบแจ้งหนี้' 'หน้าจอ Billing สำหรับสร้างและติดตามใบแจ้งหนี้'
  Add-Heading $doc '5.3 อาบน้ำตัดขน' 2
  Add-Text $doc 'เมนู Grooming ใช้ติดตามคิวและบริการอาบน้ำตัดขน ก่อนรับงานให้ยืนยันสัตว์เลี้ยง บริการที่เลือก เวลา และข้อควรระวังของสัตว์ จากนั้นอัปเดตสถานะงานตามการทำงานจริง' 11
  Add-Figure $doc '10-grooming.png' 'ภาพที่ 10 หน้าจอบริการอาบน้ำตัดขน' 'หน้าจอจัดการบริการ Grooming'
  Trace 'chapter 5 created'

  Add-Heading $doc '6. Clinic Admin: การดูแลคลินิก' 1
  Add-Text $doc 'บทนี้สำหรับผู้ได้รับสิทธิ์ Clinic Admin การตั้งค่าที่เปลี่ยนแปลงจะมีผลต่อผู้ใช้งานทั้งคลินิก จึงควรตรวจทานให้ครบและแจ้งทีมงานเมื่อมีการเปลี่ยนแปลงสำคัญ' 11
  Add-Heading $doc '6.1 แดชบอร์ดผู้ดูแลคลินิก' 2
  Add-Text $doc 'ใช้ดูภาพรวมการดำเนินงานและเป็นทางเข้าของเมนูบริหาร ผู้ดูแลควรตรวจการแจ้งเตือนและรายการค้างอย่างสม่ำเสมอ' 11
  Add-Figure $doc '11-admin-dashboard.png' 'ภาพที่ 11 แดชบอร์ดของ Clinic Admin' 'แดชบอร์ดสำหรับผู้ดูแลคลินิก'
  Add-Heading $doc '6.2 ผู้ใช้และทีมงาน' 2
  Add-Steps $doc @('เปิดเมนูจัดการผู้ใช้', 'ค้นหาชื่อผู้ใช้ก่อนเพิ่มรายใหม่', 'เมื่อสร้างผู้ใช้ ให้ใส่ชื่อ บทบาท และข้อมูลที่จำเป็นตามฟอร์ม', 'กำหนดบทบาทให้ตรงหน้าที่จริง แล้วตรวจสิทธิ์ที่ผู้ใช้จะได้รับ', 'เมื่อพนักงานเปลี่ยนหน้าที่หรือสิ้นสุดการทำงาน ให้ปรับบทบาทหรือระงับการใช้บัญชีตามนโยบายคลินิก', 'ไม่ส่งรหัสผ่านผ่านเอกสารหรือช่องทางที่ไม่ปลอดภัย')
  Add-Figure $doc '12-admin-users.png' 'ภาพที่ 12 หน้าจอจัดการผู้ใช้' 'หน้าจอจัดการผู้ใช้และสมาชิกทีม'
  Add-Heading $doc '6.3 บทบาทและสิทธิ์' 2
  Add-Text $doc 'การแก้ไขสิทธิ์ควรทำเท่าที่จำเป็น ใช้หลัก “ให้สิทธิ์เท่าที่ต้องใช้” และทดสอบเมนูสำคัญหลังแก้ไข ก่อนแจ้งผู้ใช้ว่าใช้งานได้' 11
  Add-Figure $doc '13-admin-roles.png' 'ภาพที่ 13 หน้าจอบทบาทและสิทธิ์' 'หน้าจอสำหรับกำหนดบทบาทและสิทธิ์'
  Add-Heading $doc '6.4 ธนาคารเลือดและประวัติการใช้งาน' 2
  Add-Text $doc 'เมนู Blood Bank ใช้ติดตามรายการที่เกี่ยวข้องกับคลังเลือด ส่วน Audit Log ใช้ตรวจสอบลำดับเหตุการณ์การใช้งาน เมื่อตรวจเหตุผิดปกติให้จดช่วงเวลา ผู้ใช้ และข้อมูลอ้างอิงก่อนประสานทีมที่เกี่ยวข้อง' 11
  Add-Figure $doc '14-blood-bank.png' 'ภาพที่ 14 หน้าจอธนาคารเลือด' 'หน้าจอจัดการธนาคารเลือด'
  Add-Figure $doc '15-admin-audit.png' 'ภาพที่ 15 หน้าจอประวัติการใช้งาน' 'หน้าจอ Audit Log สำหรับตรวจสอบกิจกรรม'
  Trace 'chapter 6 created'

  Add-Heading $doc '7. Clinic Admin: ตั้งค่าคลินิก' 1
  Add-Heading $doc '7.1 ข้อมูลคลินิกและสาขา' 2
  Add-Steps $doc @('เปิด Settings แล้วเลือกหัวข้อที่ต้องการ', 'แก้ไขเฉพาะข้อมูลที่ได้รับการยืนยันแล้ว เช่น ชื่อคลินิก ที่อยู่ หรือข้อมูลติดต่อ', 'บันทึกและเปิดตรวจซ้ำว่าข้อมูลแสดงผลถูกต้อง', 'สำหรับสาขา ให้ตรวจชื่อสาขาและข้อมูลที่เกี่ยวข้องก่อนนำไปใช้กับทีมงาน', 'แจ้งผู้ใช้งานเมื่อข้อมูลที่มีผลต่อการนัดหมายหรือการออกเอกสารเปลี่ยนแปลง')
  Add-Figure $doc '16-settings-profile.png' 'ภาพที่ 16 การตั้งค่าข้อมูลคลินิก' 'หน้าจอการตั้งค่าข้อมูลระดับคลินิก'
  Add-Figure $doc '18-settings-branches.png' 'ภาพที่ 17 การจัดการสาขา' 'หน้าจอจัดการสาขาของคลินิก'
  Add-Heading $doc '7.2 เวลาทำการ' 2
  Add-Text $doc 'กำหนดเวลาทำการให้ตรงกับเวลาที่เปิดรับบริการจริง เพราะข้อมูลนี้ส่งผลต่อการวางแผนนัดหมายและการสื่อสารกับลูกค้า หลังบันทึกให้ทดสอบดูวันที่ทำการที่เกี่ยวข้อง' 11
  Add-Figure $doc '17-settings-hours.png' 'ภาพที่ 18 การตั้งค่าเวลาทำการ' 'หน้าจอการตั้งค่าเวลาทำการของคลินิก'
  Add-Heading $doc '7.3 การรับชำระเงินและการตั้งค่าส่วนบุคคล' 2
  Add-Text $doc 'ตั้งค่าวิธีชำระเงินให้สอดคล้องกับช่องทางที่คลินิกรับจริง ส่วน Preferences ใช้กำหนดค่าการใช้งานที่ระบบเปิดให้แต่ละบัญชี ควรตรวจสอบผลกระทบก่อนปรับค่า' 11
  Add-Figure $doc '19-settings-payment.png' 'ภาพที่ 19 การตั้งค่าการรับชำระเงิน' 'หน้าจอการตั้งค่าการรับชำระเงิน'
  Add-Figure $doc '20-preferences.png' 'ภาพที่ 20 การตั้งค่าความต้องการใช้งาน' 'หน้าจอการตั้งค่าความต้องการใช้งาน'
  Trace 'chapter 7 created'

  Add-Heading $doc '8. วิธีทำงานที่ปลอดภัยและแก้ปัญหาเบื้องต้น' 1
  Add-Heading $doc '8.1 เช็กลิสต์ก่อนบันทึกข้อมูล' 2
  Add-Steps $doc @('ยืนยันชื่อสัตว์เลี้ยงและเจ้าของก่อนบันทึกทุกครั้ง', 'ตรวจวันที่ เวลา และสาขา โดยเฉพาะนัดหมายและใบแจ้งหนี้', 'ตรวจจำนวนสินค้า ยา หรือบริการก่อนยืนยันยอด', 'อ่านข้อความแจ้งเตือนของระบบก่อนกดบันทึกซ้ำ', 'ออกจากระบบเมื่อใช้อุปกรณ์ร่วมกัน')
  Add-Heading $doc '8.2 ปัญหาที่พบบ่อย' 2
  Add-Table $doc @('อาการ','ตรวจสอบก่อน','แนวทางดำเนินการ') @(
    @('เข้าเมนูไม่ได้','บทบาทและชื่อผู้ใช้','แจ้ง Clinic Admin เพื่อตรวจสิทธิ์ ห้ามใช้บัญชีผู้อื่น'),
    @('ค้นหาสัตว์ไม่พบ','การสะกดชื่อ เจ้าของ และสาขา','ค้นหาด้วยข้อมูลอื่นก่อนสร้างรายการใหม่'),
    @('ยอดชำระเงินไม่ตรง','รายการบริการ จำนวน ส่วนลด และวิธีชำระ','หยุดยืนยันรายการและตรวจเอกสารอ้างอิง'),
    @('ข้อมูลแสดงผลผิดหรือโหลดนาน','การเชื่อมต่ออินเทอร์เน็ตและการเข้าสู่ระบบ','รีเฟรชอย่างระมัดระวัง หากยังพบให้บันทึกภาพ/เวลาและแจ้งผู้ดูแล')
  ) @(120,160,210)
  Add-Note $doc 'เมื่อแจ้งปัญหา' 'ระบุชื่อเมนู ขั้นตอนที่ทำ เวลาที่พบปัญหา และภาพหน้าจอที่ไม่มีข้อมูลอ่อนไหว เพื่อให้ทีมช่วยตรวจสอบได้รวดเร็ว'

  Add-Heading $doc 'ภาคผนวก: คำศัพท์ที่ใช้ในคู่มือ' 1
  Add-Table $doc @('คำ','ความหมาย') @(
    @('Clinic ID','รหัสระบุคลินิกที่ใช้เข้าสู่ระบบ'),
    @('Username','ชื่อผู้ใช้สำหรับเข้าสู่ระบบ ไม่ใช่อีเมล'),
    @('EMR','เวชระเบียนอิเล็กทรอนิกส์ของสัตว์เลี้ยง'),
    @('SOAP','โครงสร้างบันทึกทางการแพทย์: อาการ ผลตรวจ การประเมิน และแผน'),
    @('Audit Log','ประวัติรายการกิจกรรมที่ใช้ตรวจสอบการใช้งาน')
  ) @(130,360)
  Add-Text $doc 'จบคู่มือ' 10 $true 2639642 1 0
  Trace 'content completed'

  Trace 'saving docx'
  $doc.SaveAs2($docxPath, 16)
  Trace 'exporting pdf'
  $doc.ExportAsFixedFormat($pdfPath, 17)
  Trace 'completed'
} finally {
  $doc.Close([ref]0)
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

Write-Output $docxPath
Write-Output $pdfPath
