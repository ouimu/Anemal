$ErrorActionPreference = 'Stop'

$root = 'D:\Development\AnimalClinic'
$screenDir = Join-Path $root 'docs\manuals\clinic-user-manual\screenshots'
$outputDir = Join-Path $root 'docs\manuals\clinic-user-manual\output'
$finalDocx = Join-Path $root 'docs\Anemal-คู่มือการใช้งาน-Clinic-Users-TH.docx'
$temp = Join-Path $env:TEMP ('anemal-docx-' + [guid]::NewGuid().ToString())

function Xml([string]$value) { [System.Security.SecurityElement]::Escape($value) }
function P([string]$text, [string]$style = 'Normal', [int]$size = 22, [bool]$bold = $false, [string]$color = '000000', [string]$align = 'left', [bool]$pageBreakBefore = $false) {
  $b = if ($bold) { '<w:b/>' } else { '' }
  $pb = if ($pageBreakBefore) { '<w:pageBreakBefore/>' } else { '' }
  $jc = if ($align -eq 'center') { '<w:jc w:val="center"/>' } elseif ($align -eq 'right') { '<w:jc w:val="right"/>' } else { '' }
  return "<w:p><w:pPr><w:pStyle w:val=`"$style`"/>$pb$jc<w:spacing w:after=`"110`" w:line=`"300`" w:lineRule=`"auto`"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii=`"Leelawadee UI`" w:hAnsi=`"Leelawadee UI`" w:eastAsia=`"Leelawadee UI`" w:cs=`"Leelawadee UI`"/>$b<w:color w:val=`"$color`"/><w:sz w:val=`"$size`"/><w:szCs w:val=`"$size`"/></w:rPr><w:t xml:space=`"preserve`">$(Xml $text)</w:t></w:r></w:p>"
}
function Note([string]$title, [string]$text) {
  return "<w:p><w:pPr><w:ind w:left=`"260`" w:right=`"260`"/><w:shd w:fill=`"E6F2EE`"/><w:spacing w:before=`"80`" w:after=`"100`" w:line=`"280`" w:lineRule=`"auto`"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii=`"Leelawadee UI`" w:hAnsi=`"Leelawadee UI`" w:eastAsia=`"Leelawadee UI`"/><w:b/><w:color w:val=`"1C7C54`"/><w:sz w:val=`"20`"/></w:rPr><w:t>$(Xml $title)</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii=`"Leelawadee UI`" w:hAnsi=`"Leelawadee UI`" w:eastAsia=`"Leelawadee UI`"/><w:sz w:val=`"20`"/></w:rPr><w:t xml:space=`"preserve`">  $(Xml $text)</w:t></w:r></w:p>"
}
function Table([string[]]$headers, [object[]]$rows) {
  $xml = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B8C9C3"/><w:left w:val="single" w:sz="4" w:color="B8C9C3"/><w:bottom w:val="single" w:sz="4" w:color="B8C9C3"/><w:right w:val="single" w:sz="4" w:color="B8C9C3"/><w:insideH w:val="single" w:sz="4" w:color="D8E2DE"/><w:insideV w:val="single" w:sz="4" w:color="D8E2DE"/></w:tblBorders></w:tblPr>'
  $xml += '<w:tr><w:trPr><w:tblHeader/></w:trPr>'
  foreach ($h in $headers) { $xml += "<w:tc><w:tcPr><w:shd w:fill=`"284B45`"/></w:tcPr>$(P $h 'Normal' 18 $true 'FFFFFF')</w:tc>" }
  $xml += '</w:tr>'
  foreach ($row in $rows) {
    $xml += '<w:tr>'
    foreach ($cell in $row) { $xml += "<w:tc><w:tcPr><w:tcMar><w:top w:w=`"80`" w:type=`"dxa`"/><w:bottom w:w=`"80`" w:type=`"dxa`"/></w:tcMar></w:tcPr>$(P ([string]$cell) 'Normal' 18 $false '000000')</w:tc>" }
    $xml += '</w:tr>'
  }
  return $xml + '</w:tbl>'
}

New-Item -ItemType Directory -Force -Path $temp, (Join-Path $temp '_rels'), (Join-Path $temp 'word'), (Join-Path $temp 'word\_rels'), (Join-Path $temp 'word\media'), (Join-Path $temp 'docProps') | Out-Null
$rels = New-Object System.Collections.Generic.List[string]
$body = New-Object System.Text.StringBuilder
$imageId = 0
$drawingId = 0

function Add-P([string]$text, [string]$style = 'Normal', [int]$size = 22, [bool]$bold = $false, [string]$color = '000000', [string]$align = 'left', [bool]$pageBreakBefore = $false) { [void]$script:body.Append((P $text $style $size $bold $color $align $pageBreakBefore)) }
function Add-H1([string]$text, [bool]$newPage = $true) { Add-P $text 'Heading1' 34 $true '284B45' 'left' $newPage }
function Add-H2([string]$text) { Add-P $text 'Heading2' 26 $true '1C7C54' 'left' $false }
function Add-Steps([string[]]$items) { $n = 1; foreach ($item in $items) { Add-P "$n. $item" 'Normal' 21 $false '000000'; $n++ } }
function Add-Note([string]$title, [string]$text) { [void]$script:body.Append((Note $title $text)) }
function Add-Table([string[]]$headers, [object[]]$rows) { [void]$script:body.Append((Table $headers $rows)); Add-P '' 'Normal' 6 $false '000000' }
function Add-Figure([string]$file, [string]$caption, [string]$alt) {
  $source = Join-Path $script:screenDir $file
  if (!(Test-Path $source)) { throw "Missing screenshot: $file" }
  $script:imageId++; $script:drawingId++
  $target = "image$($script:imageId).png"
  Copy-Item -LiteralPath $source -Destination (Join-Path $temp "word\media\$target") -Force
  $rid = "rId$($script:imageId)"
  $script:rels.Add("<Relationship Id=`"$rid`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image`" Target=`"media/$target`"/>")
  $name = Xml $caption; $desc = Xml $alt
  $drawing = "<w:p><w:pPr><w:jc w:val=`"center`"/><w:spacing w:before=`"60`" w:after=`"60`"/></w:pPr><w:r><w:drawing><wp:inline distT=`"0`" distB=`"0`" distL=`"0`" distR=`"0`"><wp:extent cx=`"5486400`" cy=`"3086100`"/><wp:docPr id=`"$($script:drawingId)`" name=`"$name`" descr=`"$desc`"/><a:graphic><a:graphicData uri=`"http://schemas.openxmlformats.org/drawingml/2006/picture`"><pic:pic><pic:nvPicPr><pic:cNvPr id=`"0`" name=`"$name`"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed=`"$rid`"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x=`"0`" y=`"0`"/><a:ext cx=`"5486400`" cy=`"3086100`"/></a:xfrm><a:prstGeom prst=`"rect`"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"
  [void]$script:body.Append($drawing)
  Add-P $caption 'Caption' 18 $false '666666' 'center'
}

# Cover
Add-P 'ANEMAL' 'Title' 32 $true '1C7C54' 'center'
Add-P 'คู่มือการใช้งานระบบคลินิก' 'Title' 50 $true '284B45' 'center'
Add-P 'สำหรับ Clinic Admin, Doctor และ Clinic Staff' 'Subtitle' 28 $false '1C7C54' 'center'
Add-P 'ฉบับภาษาไทยสำหรับผู้เริ่มต้น' 'Subtitle' 22 $false '666666' 'center'
Add-P '' 'Normal' 20 $false '000000' 'center'
Add-P 'จากการเข้าสู่ระบบและงานประจำวัน สู่การบันทึกเวชระเบียน การขาย และการตั้งค่าคลินิก' 'Normal' 22 $false '000000' 'center'
Add-Note 'ขอบเขตคู่มือ' 'ครอบคลุมการใช้งานภายในคลินิกสำหรับ Clinic Admin, Doctor และ Clinic Staff โดยไม่ครอบคลุมส่วนผู้ดูแลแพลตฟอร์ม'
Add-P 'เวอร์ชันเอกสาร: 19 กรกฎาคม 2026' 'Caption' 18 $false '666666' 'center'

Add-H1 'สารบัญ'
foreach ($item in @('1. เริ่มต้นใช้งาน','2. บทบาทและสิทธิ์การใช้งาน','3. งานหน้าร้านและข้อมูลผู้รับบริการ','4. งานทางการแพทย์','5. คลังสินค้า การชำระเงิน และบริการ','6. Clinic Admin: การดูแลคลินิก','7. Clinic Admin: ตั้งค่าคลินิก','8. วิธีทำงานที่ปลอดภัยและแก้ปัญหาเบื้องต้น','ภาคผนวก: คำศัพท์ที่ใช้ในคู่มือ')) { Add-P $item 'Normal' 22 $false '000000' }

Add-H1 '1. เริ่มต้นใช้งาน'
Add-P 'ระบบจะแสดงเมนูตามสิทธิ์ของผู้ใช้ จึงอาจเห็นเมนูไม่เท่ากันในแต่ละบทบาท หากเมนูที่ต้องใช้ไม่ปรากฏ ให้ติดต่อ Clinic Admin เพื่อตรวจสอบสิทธิ์ก่อนเริ่มงาน'
Add-H2 '1.1 เข้าสู่ระบบ'
Add-Steps @('เปิดหน้าเข้าสู่ระบบของคลินิก','กรอก Clinic ID ของคลินิกในช่อง Select Clinic','กรอก Username ในช่อง Username — ช่องนี้ไม่ใช่อีเมล','กรอกรหัสผ่าน แล้วกด Sign In','เลือกสาขาที่ต้องการใช้งาน หากระบบแสดงหน้าจอเลือกสาขา','ตรวจสอบชื่อคลินิกและชื่อผู้ใช้บริเวณมุมซ้ายล่างก่อนเริ่มทำงาน')
Add-Note 'ความปลอดภัย' 'ห้ามบันทึกรหัสผ่านลงในเอกสารหรือส่งต่อผ่านแชต และควรออกจากระบบทุกครั้งเมื่อเลิกใช้งานหรือเปลี่ยนผู้ใช้งาน'
Add-Figure '01-login.png' 'ภาพที่ 1 หน้าจอเข้าสู่ระบบ: ใช้ Clinic ID, Username และรหัสผ่าน' 'หน้าจอเข้าสู่ระบบของ Anemal มีช่อง Clinic ID ชื่อผู้ใช้ และรหัสผ่าน'
Add-H2 '1.2 รู้จักหน้าจอหลัก'
Add-P 'แถบเมนูด้านซ้ายใช้สลับโมดูลการทำงาน ส่วนแถบด้านบนมีช่องค้นหา การแจ้งเตือน ความช่วยเหลือ และเมนูบัญชีผู้ใช้ หน้าแดชบอร์ดช่วยสรุปนัดหมาย รายได้ วัคซีน และการแจ้งเตือนคลังสินค้าในจุดเดียว'
Add-Figure '02-dashboard.png' 'ภาพที่ 2 แดชบอร์ดคลินิก: จุดเริ่มต้นสำหรับตรวจงานประจำวัน' 'แดชบอร์ดคลินิกแสดงสรุปนัดหมาย รายได้ วัคซีน และสถานะคลังสินค้า'

Add-H1 '2. บทบาทและสิทธิ์การใช้งาน'
Add-P 'ใช้บัญชีของตนเองเสมอ สิทธิ์ถูกกำหนดตามบทบาทและอาจมีการปรับโดย Clinic Admin เมนูที่มองเห็นจริงจึงเป็นแหล่งอ้างอิงสุดท้าย'
Add-Table @('บทบาท','งานหลัก','ข้อควรทราบ') @(@('Clinic Admin','ตั้งค่าคลินิก ผู้ใช้ บทบาท การชำระเงิน รายงาน คลังสินค้า และตรวจสอบประวัติ','รับผิดชอบการกำหนดสิทธิ์และข้อมูลระดับคลินิก'),@('Doctor','เวชระเบียน EMR บันทึก SOAP ใบสั่งยา ไฟล์แนบผลตรวจ และผู้ป่วยใน','ตรวจสอบสัตว์เลี้ยงและเจ้าของก่อนบันทึกข้อมูลทางการแพทย์'),@('Clinic Staff','นัดหมาย ข้อมูลลูกค้า/สัตว์เลี้ยง การชำระเงิน คลังสินค้า และบริการอาบน้ำตัดขน','ทำงานตามสิทธิ์ที่ได้รับ และส่งต่อเคสทางคลินิกให้แพทย์'))
Add-Note 'กรณีเข้าเมนูไม่ได้' 'ไม่ควรยืมบัญชีผู้อื่น ให้บันทึกชื่อเมนูและเวลาที่พบปัญหา แล้วแจ้ง Clinic Admin เพื่อตรวจสิทธิ์'

Add-H1 '3. งานหน้าร้านและข้อมูลผู้รับบริการ'
Add-H2 '3.1 ตารางนัดหมาย'
Add-P 'เมนู Schedule ใช้ดูนัดหมายตามช่วงเวลา สร้างนัดใหม่ และติดตามสถานะนัดหมาย ควรค้นหาข้อมูลสัตว์เลี้ยงหรือเจ้าของก่อนสร้างนัดเพื่อป้องกันข้อมูลซ้ำ'
Add-Steps @('เลือกเมนู Schedule','เลือกวันที่หรือมุมมองปฏิทินที่ต้องการ','กด New Appointment','เลือกหรือค้นหาเจ้าของและสัตว์เลี้ยง','กำหนดวัน เวลา เหตุผลนัดหมาย และผู้เกี่ยวข้องตามที่หน้าจอร้องขอ','ตรวจสอบข้อมูลทั้งหมด แล้วบันทึก','เมื่อผู้รับบริการมาถึง ให้ปรับสถานะนัดตามขั้นตอนของคลินิก')
Add-Figure '03-appointments.png' 'ภาพที่ 3 หน้าจอตารางนัดหมาย' 'ตารางนัดหมายใช้ดูและจัดการนัดหมายของคลินิก'
Add-H2 '3.2 ข้อมูลสัตว์เลี้ยงและเจ้าของ'
Add-P 'เมนู Pets & Owners เป็นศูนย์กลางข้อมูลผู้รับบริการ ควรเก็บชื่อ เบอร์ติดต่อ และข้อมูลสัตว์ให้ครบถ้วนก่อนทำรายการอื่น เช่น นัดหมาย EMR หรือออกใบแจ้งหนี้'
Add-Steps @('ค้นหาด้วยชื่อสัตว์เลี้ยงหรือเจ้าของก่อนเสมอ','หากไม่พบข้อมูล ให้เลือกสร้างรายการใหม่','กรอกข้อมูลเจ้าของและข้อมูลพื้นฐานของสัตว์เลี้ยงตามฟอร์ม','ตรวจคำสะกด ชนิด เพศ และวันเกิดก่อนบันทึก','กลับมาที่โปรไฟล์เพื่อแก้ไขข้อมูลเมื่อมีการเปลี่ยนแปลง')

Add-H1 '4. งานทางการแพทย์'
Add-P 'เนื้อหาในบทนี้ใช้โดย Doctor เป็นหลัก ส่วนพนักงานคลินิกอาจเห็นเฉพาะบางรายการตามสิทธิ์ หลีกเลี่ยงการบันทึกข้อมูลทางการแพทย์ลงในโปรไฟล์ผิดตัว และตรวจชื่อสัตว์เลี้ยงทุกครั้งก่อนบันทึก'
Add-H2 '4.1 เวชระเบียน EMR และบันทึก SOAP'
Add-Steps @('เปิดเมนู EMR','ค้นหาและเลือกสัตว์เลี้ยงที่ถูกต้อง','เปิดประวัติเดิมก่อนเริ่มบันทึก เพื่อดูปัญหาสำคัญและการรักษาก่อนหน้า','สร้างบันทึกใหม่ แล้วบันทึกข้อมูล S: อาการ, O: ผลตรวจ, A: การประเมิน, P: แผนการรักษา ตามแนวทางคลินิก','เพิ่มใบสั่งยา ผลตรวจ หรือไฟล์แนบเมื่อมี','ทวนชื่อผู้ป่วย วันที่ และรายการสำคัญ แล้วบันทึก')
Add-Note 'คำแนะนำ' 'ใช้ภาษาทางการแพทย์ที่ชัดเจน ระบุหน่วยยาและคำสั่งใช้ให้ครบ หากต้องแก้ไขข้อมูลสำคัญให้เป็นไปตามแนวทางเวชระเบียนของคลินิก'
Add-Figure '05-emr.png' 'ภาพที่ 4 หน้าจอ EMR สำหรับค้นหาและจัดการเวชระเบียน' 'หน้าจอเวชระเบียนอิเล็กทรอนิกส์ EMR'
Add-H2 '4.2 ติดตามวัคซีน'
Add-P 'หน้าวัคซีนแสดงรายการที่ใกล้ถึงกำหนด ใช้ตรวจติดตามก่อนโทรเตือนหรือสร้างนัดหมาย ควรยืนยันสัตว์เลี้ยงและวันที่กำหนดซ้ำก่อนติดต่อเจ้าของ'
Add-Figure '06-vaccinations.png' 'ภาพที่ 5 รายการวัคซีนที่ถึงกำหนด' 'หน้าจอรายการวัคซีนที่ถึงกำหนด'
Add-H2 '4.3 ผู้ป่วยใน'
Add-Steps @('เลือกเมนู Inpatient','ค้นหาเคสหรือเลือกสร้างรายการรับไว้รักษาตามสิทธิ์','ระบุข้อมูลการรับไว้รักษา พื้นที่พัก และผู้ดูแลตามแบบฟอร์ม','อัปเดตสถานะ การสังเกตอาการ และแผนการรักษาเป็นระยะ','ก่อนจำหน่าย ตรวจสอบคำสั่งแพทย์ รายการยา และคำแนะนำกลับบ้านให้ครบ')
Add-Figure '07-inpatient.png' 'ภาพที่ 6 หน้าจอผู้ป่วยใน' 'หน้าจอจัดการผู้ป่วยในของคลินิก'

Add-H1 '5. คลังสินค้า การชำระเงิน และบริการ'
Add-H2 '5.1 คลังสินค้า'
Add-Steps @('เลือกเมนู Inventory','ค้นหารายการสินค้าก่อนสร้างรายการใหม่','ตรวจชื่อสินค้า หน่วยนับ ราคา และจุดสั่งซื้อก่อนบันทึก','บันทึกรับเข้า จ่ายออก หรือปรับยอดตามประเภทงานที่หน้าจอรองรับ','ตรวจรายการเตือนสินค้าต่ำหรือใกล้หมดอายุจากแดชบอร์ดและหน้า Inventory','เมื่อพบยอดผิดปกติ ให้ตรวจเอกสารอ้างอิงก่อนปรับยอด')
Add-H2 '5.2 การชำระเงินและใบแจ้งหนี้'
Add-Steps @('เลือกเมนู Billing','ค้นหาเจ้าของและสัตว์เลี้ยงให้ถูกต้อง','เพิ่มรายการบริการ ยา หรือสินค้า โดยตรวจจำนวนและราคาทุกบรรทัด','ตรวจส่วนลด ภาษี และยอดสุทธิที่ระบบแสดง','เลือกวิธีชำระเงินตามที่รับจริง แล้วบันทึกรายการ','ส่งหรือพิมพ์ใบเสร็จตามขั้นตอนของคลินิก','หากต้องยกเลิกหรือคืนเงิน ให้ปฏิบัติตามสิทธิ์และนโยบายอนุมัติของคลินิก')
Add-Figure '09-billing.png' 'ภาพที่ 7 หน้าจอการชำระเงินและใบแจ้งหนี้' 'หน้าจอ Billing สำหรับสร้างและติดตามใบแจ้งหนี้'
Add-H2 '5.3 อาบน้ำตัดขน'
Add-P 'เมนู Grooming ใช้ติดตามคิวและบริการอาบน้ำตัดขน ก่อนรับงานให้ยืนยันสัตว์เลี้ยง บริการที่เลือก เวลา และข้อควรระวังของสัตว์ จากนั้นอัปเดตสถานะงานตามการทำงานจริง'
Add-Figure '10-grooming.png' 'ภาพที่ 8 หน้าจอบริการอาบน้ำตัดขน' 'หน้าจอจัดการบริการ Grooming'

Add-H1 '6. Clinic Admin: การดูแลคลินิก'
Add-P 'บทนี้สำหรับผู้ได้รับสิทธิ์ Clinic Admin การตั้งค่าที่เปลี่ยนแปลงจะมีผลต่อผู้ใช้งานทั้งคลินิก จึงควรตรวจทานให้ครบและแจ้งทีมงานเมื่อมีการเปลี่ยนแปลงสำคัญ'
Add-H2 '6.1 แดชบอร์ดผู้ดูแลคลินิก'
Add-P 'ใช้ดูภาพรวมการดำเนินงานและเป็นทางเข้าของเมนูบริหาร ผู้ดูแลควรตรวจการแจ้งเตือนและรายการค้างอย่างสม่ำเสมอ'
Add-Figure '11-admin-dashboard.png' 'ภาพที่ 9 แดชบอร์ดของ Clinic Admin' 'แดชบอร์ดสำหรับผู้ดูแลคลินิก'
Add-H2 '6.2 ผู้ใช้และทีมงาน'
Add-Steps @('เปิดเมนูจัดการผู้ใช้','ค้นหาชื่อผู้ใช้ก่อนเพิ่มรายใหม่','เมื่อสร้างผู้ใช้ ให้ใส่ชื่อ บทบาท และข้อมูลที่จำเป็นตามฟอร์ม','กำหนดบทบาทให้ตรงหน้าที่จริง แล้วตรวจสิทธิ์ที่ผู้ใช้จะได้รับ','เมื่อพนักงานเปลี่ยนหน้าที่หรือสิ้นสุดการทำงาน ให้ปรับบทบาทหรือระงับการใช้บัญชีตามนโยบายคลินิก','ไม่ส่งรหัสผ่านผ่านเอกสารหรือช่องทางที่ไม่ปลอดภัย')
Add-H2 '6.3 บทบาทและสิทธิ์'
Add-P 'การแก้ไขสิทธิ์ควรทำเท่าที่จำเป็น ใช้หลักให้สิทธิ์เท่าที่ต้องใช้ และทดสอบเมนูสำคัญหลังแก้ไข ก่อนแจ้งผู้ใช้ว่าใช้งานได้'
Add-Figure '13-admin-roles.png' 'ภาพที่ 10 หน้าจอบทบาทและสิทธิ์' 'หน้าจอสำหรับกำหนดบทบาทและสิทธิ์'
Add-H2 '6.4 ธนาคารเลือดและประวัติการใช้งาน'
Add-P 'เมนู Blood Bank ใช้ติดตามรายการที่เกี่ยวข้องกับคลังเลือด ส่วน Audit Log ใช้ตรวจสอบลำดับเหตุการณ์การใช้งาน เมื่อตรวจเหตุผิดปกติให้จดช่วงเวลา ผู้ใช้ และข้อมูลอ้างอิงก่อนประสานทีมที่เกี่ยวข้อง'
Add-Figure '14-blood-bank.png' 'ภาพที่ 11 หน้าจอธนาคารเลือด' 'หน้าจอจัดการธนาคารเลือด'
Add-Figure '15-admin-audit.png' 'ภาพที่ 12 หน้าจอประวัติการใช้งาน' 'หน้าจอ Audit Log สำหรับตรวจสอบกิจกรรม'

Add-H1 '7. Clinic Admin: ตั้งค่าคลินิก'
Add-H2 '7.1 ข้อมูลคลินิกและสาขา'
Add-Steps @('เปิด Settings แล้วเลือกหัวข้อที่ต้องการ','แก้ไขเฉพาะข้อมูลที่ได้รับการยืนยันแล้ว เช่น ชื่อคลินิก ที่อยู่ หรือข้อมูลติดต่อ','บันทึกและเปิดตรวจซ้ำว่าข้อมูลแสดงผลถูกต้อง','สำหรับสาขา ให้ตรวจชื่อสาขาและข้อมูลที่เกี่ยวข้องก่อนนำไปใช้กับทีมงาน','แจ้งผู้ใช้งานเมื่อข้อมูลที่มีผลต่อการนัดหมายหรือการออกเอกสารเปลี่ยนแปลง')
Add-Figure '16-settings-profile.png' 'ภาพที่ 13 การตั้งค่าข้อมูลคลินิก' 'หน้าจอการตั้งค่าข้อมูลระดับคลินิก'
Add-Figure '18-settings-branches.png' 'ภาพที่ 14 การจัดการสาขา' 'หน้าจอจัดการสาขาของคลินิก'
Add-H2 '7.2 เวลาทำการ'
Add-P 'กำหนดเวลาทำการให้ตรงกับเวลาที่เปิดรับบริการจริง เพราะข้อมูลนี้ส่งผลต่อการวางแผนนัดหมายและการสื่อสารกับลูกค้า หลังบันทึกให้ทดสอบดูวันที่ทำการที่เกี่ยวข้อง'
Add-Figure '17-settings-hours.png' 'ภาพที่ 15 การตั้งค่าเวลาทำการ' 'หน้าจอการตั้งค่าเวลาทำการของคลินิก'
Add-H2 '7.3 การรับชำระเงินและการตั้งค่าส่วนบุคคล'
Add-P 'ตั้งค่าวิธีชำระเงินให้สอดคล้องกับช่องทางที่คลินิกรับจริง ส่วน Preferences ใช้กำหนดค่าการใช้งานที่ระบบเปิดให้แต่ละบัญชี ควรตรวจสอบผลกระทบก่อนปรับค่า'
Add-Figure '19-settings-payment.png' 'ภาพที่ 16 การตั้งค่าการรับชำระเงิน' 'หน้าจอการตั้งค่าการรับชำระเงิน'
Add-Figure '20-preferences.png' 'ภาพที่ 17 การตั้งค่าความต้องการใช้งาน' 'หน้าจอการตั้งค่าความต้องการใช้งาน'

Add-H1 '8. วิธีทำงานที่ปลอดภัยและแก้ปัญหาเบื้องต้น'
Add-H2 '8.1 เช็กลิสต์ก่อนบันทึกข้อมูล'
Add-Steps @('ยืนยันชื่อสัตว์เลี้ยงและเจ้าของก่อนบันทึกทุกครั้ง','ตรวจวันที่ เวลา และสาขา โดยเฉพาะนัดหมายและใบแจ้งหนี้','ตรวจจำนวนสินค้า ยา หรือบริการก่อนยืนยันยอด','อ่านข้อความแจ้งเตือนของระบบก่อนกดบันทึกซ้ำ','ออกจากระบบเมื่อใช้อุปกรณ์ร่วมกัน')
Add-H2 '8.2 ปัญหาที่พบบ่อย'
Add-Table @('อาการ','ตรวจสอบก่อน','แนวทางดำเนินการ') @(@('เข้าเมนูไม่ได้','บทบาทและชื่อผู้ใช้','แจ้ง Clinic Admin เพื่อตรวจสิทธิ์ ห้ามใช้บัญชีผู้อื่น'),@('ค้นหาสัตว์ไม่พบ','การสะกดชื่อ เจ้าของ และสาขา','ค้นหาด้วยข้อมูลอื่นก่อนสร้างรายการใหม่'),@('ยอดชำระเงินไม่ตรง','รายการบริการ จำนวน ส่วนลด และวิธีชำระ','หยุดยืนยันรายการและตรวจเอกสารอ้างอิง'),@('ข้อมูลแสดงผลผิดหรือโหลดนาน','การเชื่อมต่ออินเทอร์เน็ตและการเข้าสู่ระบบ','รีเฟรชอย่างระมัดระวัง หากยังพบให้บันทึกภาพ/เวลาและแจ้งผู้ดูแล'))
Add-Note 'เมื่อแจ้งปัญหา' 'ระบุชื่อเมนู ขั้นตอนที่ทำ เวลาที่พบปัญหา และภาพหน้าจอที่ไม่มีข้อมูลอ่อนไหว เพื่อให้ทีมช่วยตรวจสอบได้รวดเร็ว'

Add-H1 'ภาคผนวก: คำศัพท์ที่ใช้ในคู่มือ'
Add-Table @('คำ','ความหมาย') @(@('Clinic ID','รหัสระบุคลินิกที่ใช้เข้าสู่ระบบ'),@('Username','ชื่อผู้ใช้สำหรับเข้าสู่ระบบ ไม่ใช่อีเมล'),@('EMR','เวชระเบียนอิเล็กทรอนิกส์ของสัตว์เลี้ยง'),@('SOAP','โครงสร้างบันทึกทางการแพทย์: อาการ ผลตรวจ การประเมิน และแผน'),@('Audit Log','ประวัติรายการกิจกรรมที่ใช้ตรวจสอบการใช้งาน'))
Add-P 'จบคู่มือ' 'Caption' 20 $true '1C7C54' 'center'

$documentXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>$($body.ToString())<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>
"@
$stylesXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Leelawadee UI" w:hAnsi="Leelawadee UI" w:eastAsia="Leelawadee UI" w:cs="Leelawadee UI"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:outlineLvl w:val="0"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:outlineLvl w:val="1"/></w:style><w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:basedOn w:val="Normal"/></w:style></w:styles>
"@
$contentTypes = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>
"@
$rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'
$docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' + ($rels -join '') + '</Relationships>'
$core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>คู่มือการใช้งานระบบคลินิก Anemal</dc:title><dc:creator>Anemal</dc:creator><dc:language>th-TH</dc:language></cp:coreProperties>'
$app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office Word</Application></Properties>'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $temp '[Content_Types].xml'), $contentTypes, $utf8)
[System.IO.File]::WriteAllText((Join-Path $temp '_rels\.rels'), $rootRels, $utf8)
[System.IO.File]::WriteAllText((Join-Path $temp 'word\document.xml'), $documentXml, $utf8)
[System.IO.File]::WriteAllText((Join-Path $temp 'word\styles.xml'), $stylesXml, $utf8)
[System.IO.File]::WriteAllText((Join-Path $temp 'word\_rels\document.xml.rels'), $docRels, $utf8)
[System.IO.File]::WriteAllText((Join-Path $temp 'docProps\core.xml'), $core, $utf8)
[System.IO.File]::WriteAllText((Join-Path $temp 'docProps\app.xml'), $app, $utf8)
if (Test-Path $finalDocx) { Remove-Item -LiteralPath $finalDocx -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$archive = [System.IO.Compression.ZipFile]::Open($finalDocx, [System.IO.Compression.ZipArchiveMode]::Create)
Get-ChildItem -LiteralPath $temp -File -Recurse | ForEach-Object {
  $relative = $_.FullName.Substring($temp.Length + 1).Replace('\', '/')
  $entry = $archive.CreateEntry($relative, [System.IO.Compression.CompressionLevel]::Optimal)
  $input = [System.IO.File]::OpenRead($_.FullName)
  $output = $entry.Open()
  $input.CopyTo($output)
  $output.Dispose()
  $input.Dispose()
}
$archive.Dispose()
Remove-Item -LiteralPath $temp -Recurse -Force
Write-Output $finalDocx
