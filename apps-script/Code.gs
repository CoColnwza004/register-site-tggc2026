/**
 * TGGC 2569 – รับข้อมูลลงทะเบียนจากเว็บ แล้วเขียนลง Google Sheet แบบเรียลไทม์
 *
 * วิธีติดตั้ง (ทำครั้งเดียว):
 *  1) เปิด Google Sheet "ลงทะเบียน TGGC 2569" → เมนู ส่วนขยาย (Extensions) → Apps Script
 *  2) ลบโค้ดเดิมทั้งหมด แล้ววางไฟล์นี้ → กดบันทึก
 *  3) กด "การทำให้ใช้งานได้" (Deploy) → "การทำให้ใช้งานได้รายการใหม่" (New deployment)
 *     - ประเภท: เว็บแอป (Web app)
 *     - เรียกใช้ในฐานะ (Execute as): ฉัน (Me)
 *     - ผู้มีสิทธิ์เข้าถึง (Who has access): ทุกคน (Anyone)
 *  4) อนุญาตสิทธิ์ แล้วคัดลอก URL ที่ลงท้ายด้วย /exec ไปใส่ใน public/config.js → ENDPOINT
 *
 * อัปเดตโค้ดนี้ทับของเดิม: วางทับ → บันทึก → รีเฟรชหน้า Sheet จะเห็นเมนู "TGGC 2569"
 * (เมนูรีเซ็ตไม่ต้อง Deploy ใหม่ · ถ้าแก้ doPost ต้องไปที่ Deploy → Manage deployments → Edit → New version)
 *
 * คอลัมน์ในแท็บ "ลงทะเบียน":
 *  A ลำดับ | B รหัสบัตร | C วันเวลาลงทะเบียน | D คำนำหน้า | E ชื่อ | F นามสกุล | G ตำแหน่ง
 *  H โรงเรียน | I จังหวัด | J สังกัด | K เบอร์โทร | L รับของที่ระลึก (☑) | M เวลารับของ | N หมายเหตุ
 */

var SHEET_NAME = 'ลงทะเบียน';
var NCOL = 14;
var COL = { NO: 1, ID: 2, TIME: 3, PREFIX: 4, FIRST: 5, LAST: 6, POSITION: 7, SCHOOL: 8, PROVINCE: 9, AFF: 10, PHONE: 11, GOT: 12, GOT_AT: 13, NOTE: 14 };

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.website) return json_({ ok: true }); // honeypot: bots fill hidden fields

    var d = {
      id: String(body.id || '').toUpperCase().trim(),
      prefix: clean_(body.prefix, 40),
      first: clean_(body.first, 60),
      last: clean_(body.last, 60),
      position: clean_(body.position, 80),
      school: clean_(body.school, 120),
      province: clean_(body.province, 40),
      affiliation: clean_(body.affiliation, 80),
      phone: String(body.phone || '').replace(/\D/g, '')
    };
    var err = validate_(d);
    if (err) return json_({ ok: false, error: err });

    var lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
      var last = sh.getLastRow();
      var rows = last >= 2 ? sh.getRange(2, 1, last - 1, NCOL).getValues() : [];

      // 1) same ticket id (edit from the same phone/browser)  2) same phone number → update that row
      var hit = -1;
      for (var i = 0; i < rows.length; i++) { if (String(rows[i][COL.ID - 1]) === d.id && d.id) { hit = i; break; } }
      if (hit < 0) for (var j = 0; j < rows.length; j++) { if (String(rows[j][COL.PHONE - 1]).replace(/\D/g, '') === d.phone) { hit = j; break; } }

      if (hit >= 0) {
        var r = hit + 2;
        sh.getRange(r, COL.PREFIX, 1, 8).setValues([[d.prefix, d.first, d.last, d.position, d.school, d.province, d.affiliation, phoneText_(d.phone)]]);
        sh.getRange(r, COL.NOTE).setValue('แก้ไขข้อมูลล่าสุด ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm'));
        return json_({ ok: true, updated: true, id: rows[hit][COL.ID - 1], no: rows[hit][COL.NO - 1] });
      }

      var ids = {};
      rows.forEach(function (x) { ids[x[COL.ID - 1]] = 1; });
      var id = /^TG-[2-9A-HJ-NP-Z]{5}$/.test(d.id) && !ids[d.id] ? d.id : newId_(ids);
      var no = rows.length + 1;
      var row = last + 1;
      sh.getRange(row, 1, 1, NCOL).setValues([[
        no, id, new Date(), d.prefix, d.first, d.last, d.position,
        d.school, d.province, d.affiliation, phoneText_(d.phone), false, '', ''
      ]]);
      sh.getRange(row, COL.GOT).insertCheckboxes();
      return json_({ ok: true, id: id, no: no });
    } finally {
      lock.releaseLock();
    }
  } catch (ex) {
    return json_({ ok: false, error: 'ระบบขัดข้องชั่วคราว (' + ex.message + ')' });
  }
}

/** เปิด URL /exec ในเบราว์เซอร์เพื่อตรวจว่าระบบทำงาน */
function doGet() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  return json_({ ok: true, service: 'TGGC 2569 registration', registered: Math.max(0, sh.getLastRow() - 1) });
}

/** ติ๊กช่อง "รับของที่ระลึก" แล้วลงเวลาให้อัตโนมัติ */
function onEdit(e) {
  var r = e && e.range;
  if (!r || r.getSheet().getName() !== SHEET_NAME || r.getColumn() !== COL.GOT || r.getRow() < 2) return;
  var target = r.getSheet().getRange(r.getRow(), COL.GOT_AT, r.getNumRows(), 1);
  var vals = r.getValues().map(function (v) { return [v[0] === true ? new Date() : '']; });
  target.setValues(vals);
}

/* ---------------- เมนูใน Google Sheet ---------------- */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TGGC 2569')
    .addItem('รีเซ็ตข้อมูลลงทะเบียน (หลังทดสอบ)…', 'resetRegistrations')
    .addItem('ล้างช่องค้นหาบัตร', 'clearLookup')
    .addToUi();
}

/**
 * ลบข้อมูลผู้ลงทะเบียนทั้งหมด (เก็บหัวตาราง รูปแบบ และสูตรในแท็บสรุปไว้)
 * ก่อนลบจะสำรองข้อมูลเดิมไว้ในแท็บใหม่ "สำรอง วัน-เวลา" เสมอ
 */
function resetRegistrations() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_NAME);
  var count = Math.max(0, sh.getLastRow() - 1);
  if (!count) { ui.alert('ยังไม่มีข้อมูลผู้ลงทะเบียน ไม่ต้องรีเซ็ต'); return; }

  var ok = ui.alert('รีเซ็ตข้อมูลลงทะเบียน',
    'จะลบข้อมูลผู้ลงทะเบียนทั้งหมด ' + count + ' แถว\n(ระบบจะสำรองข้อมูลเดิมไว้ในแท็บใหม่ก่อนลบ)\n\nดำเนินการต่อหรือไม่?',
    ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;

  var typed = ui.prompt('ยืนยันอีกครั้ง', 'พิมพ์คำว่า RESET เพื่อยืนยันการลบ', ui.ButtonSet.OK_CANCEL);
  if (typed.getSelectedButton() !== ui.Button.OK || typed.getResponseText().trim().toUpperCase() !== 'RESET') {
    ui.alert('ยกเลิกแล้ว ข้อมูลไม่ถูกลบ');
    return;
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd-MM-yyyy HH:mm');
    var backup = sh.copyTo(ss).setName('สำรอง ' + stamp);
    backup.setTabColor('#a7d5db');
    ss.setActiveSheet(sh);

    var last = sh.getLastRow();
    sh.getRange(2, 1, last - 1, NCOL).clearContent().clearNote();
    clearLookup();
  } finally {
    lock.releaseLock();
  }
  ui.alert('รีเซ็ตเรียบร้อย', 'ลบข้อมูล ' + count + ' แถวแล้ว\nข้อมูลเดิมสำรองไว้ที่แท็บ "สำรอง ' + stamp + '"\n(ถ้าไม่ต้องการ ลบแท็บสำรองได้เลย)', ui.ButtonSet.OK);
}

function clearLookup() {
  var lk = SpreadsheetApp.getActive().getSheetByName('ค้นหาบัตร');
  if (lk) lk.getRange('C4').clearContent();
}

/* ---------------- helpers ---------------- */
function validate_(d) {
  var miss = [];
  if (!d.prefix) miss.push('คำนำหน้า');
  if (!d.first) miss.push('ชื่อ');
  if (!d.last) miss.push('นามสกุล');
  if (!d.position) miss.push('ตำแหน่ง');
  if (!d.school) miss.push('โรงเรียน');
  if (!d.province) miss.push('จังหวัด');
  if (!d.affiliation) miss.push('สังกัด');
  if (miss.length) return 'ข้อมูลไม่ครบ: ' + miss.join(', ');
  if (!/^0\d{8,9}$/.test(d.phone)) return 'เบอร์โทรไม่ถูกต้อง';
  return '';
}

// trims, caps length and blocks spreadsheet formula injection (=, +, -, @)
function clean_(v, max) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function phoneText_(p) {
  if (p.indexOf('02') === 0 && p.length === 9) return p.slice(0, 2) + '-' + p.slice(2, 5) + '-' + p.slice(5);
  return p.slice(0, 3) + '-' + p.slice(3, 6) + '-' + p.slice(6);
}

function newId_(taken) {
  var A = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ', id;
  do {
    id = 'TG-';
    for (var i = 0; i < 5; i++) id += A.charAt(Math.floor(Math.random() * A.length));
  } while (taken[id]);
  return id;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
