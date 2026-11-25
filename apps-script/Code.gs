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
 * หน้าเจ้าหน้าที่ (สแกนบัตร/มอบของที่ระลึก) อยู่ที่ <เว็บ>/staff/ ใช้ PIN ที่ตั้งจากเมนู "TGGC 2569 → ตั้ง/ดู PIN เจ้าหน้าที่"
 *
 * คอลัมน์ในแท็บ "ลงทะเบียน":
 *  A ลำดับ | B รหัสบัตร | C วันเวลาลงทะเบียน | D คำนำหน้า | E ชื่อ | F นามสกุล | G ตำแหน่ง
 *  H โรงเรียน | I จังหวัด | J สังกัด | K เบอร์โทร | L รับของที่ระลึก (☑) | M เวลารับของ | N หมายเหตุ
 *  O เจ้าหน้าที่ผู้สแกน (ชื่อที่เจ้าหน้าที่กรอกตอนเข้าหน้า /staff)
 */

var SHEET_NAME = 'ลงทะเบียน';
var NCOL = 14;     // columns written by the registration form (A–N)
var NCOL_ALL = 15; // + O เจ้าหน้าที่ผู้สแกน
var COL = { NO: 1, ID: 2, TIME: 3, PREFIX: 4, FIRST: 5, LAST: 6, POSITION: 7, SCHOOL: 8, PROVINCE: 9, AFF: 10, PHONE: 11, GOT: 12, GOT_AT: 13, NOTE: 14, BY: 15 };

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action) return staff_(body);          // หน้าเจ้าหน้าที่ /staff (ต้องมี PIN)
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
      var last = lastDataRow_(sh);
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
      var no = rows.length + 1; // rows = registrations up to the last ticket id
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
  return json_({ ok: true, service: 'TGGC 2569 registration', registered: lastDataRow_(sh) - 1 });
}

/** ติ๊กช่อง "รับของที่ระลึก" แล้วลงเวลาให้อัตโนมัติ */
function onEdit(e) {
  var r = e && e.range;
  if (!r || r.getSheet().getName() !== SHEET_NAME || r.getColumn() !== COL.GOT || r.getRow() < 2) return;
  var target = r.getSheet().getRange(r.getRow(), COL.GOT_AT, r.getNumRows(), 1);
  var vals = r.getValues().map(function (v) { return [v[0] === true ? new Date() : '']; });
  target.setValues(vals);
  r.getSheet().getRange(r.getRow(), COL.BY, r.getNumRows(), 1)
    .setValues(vals.map(function (v) { return [v[0] ? '(ติ๊กใน Sheet)' : '']; }));
}

/* ---------------- เมนูใน Google Sheet ---------------- */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TGGC 2569')
    .addItem('รีเซ็ตข้อมูลลงทะเบียน (หลังทดสอบ)…', 'resetRegistrations')
    .addItem('ล้างช่องค้นหาบัตร', 'clearLookup')
    .addSeparator()
    .addItem('ตั้ง/ดู PIN เจ้าหน้าที่ (หน้าสแกนบัตร)…', 'setStaffPin')
    .addToUi();
}

/* ---------------- หน้าเจ้าหน้าที่: สแกนบัตร → มอบของที่ระลึก ---------------- */
var STAFF_ACTIONS = { login: 1, lookup: 1, redeem: 1, undo: 1, stats: 1, roster: 1, batch: 1 };

/** เมนู: ตั้ง PIN ใหม่ (เว้นว่าง = สุ่ม 6 หลักให้) · ตั้งใหม่แล้ว PIN เดิมใช้ไม่ได้ทันที และปลดล็อกกรณีใส่ผิดหลายครั้ง */
function setStaffPin() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var cur = props.getProperty('STAFF_PIN');
  var res = ui.prompt('PIN เจ้าหน้าที่ (หน้าสแกนบัตร)',
    (cur ? 'PIN ปัจจุบัน: ' + cur + '\n\n' : 'ยังไม่ได้ตั้ง PIN\n\n') +
    'พิมพ์ PIN ใหม่ (ตัวเลข 6–12 หลัก) หรือเว้นว่างแล้วกด OK เพื่อสุ่มให้\nกด Cancel ถ้าไม่ต้องการเปลี่ยน',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var pin = res.getResponseText().replace(/\s/g, '');
  if (!pin) { pin = ''; for (var i = 0; i < 6; i++) pin += Math.floor(Math.random() * 10); }
  if (!/^\d{6,12}$/.test(pin)) { ui.alert('PIN ต้องเป็นตัวเลข 6–12 หลัก ยังไม่ได้เปลี่ยน'); return; }
  props.setProperty('STAFF_PIN', pin);
  CacheService.getScriptCache().remove('pinFails');
  ui.alert('ตั้ง PIN เรียบร้อย', 'PIN เจ้าหน้าที่: ' + pin + '\n\nแจ้ง PIN นี้เฉพาะเจ้าหน้าที่จุดแลกของที่ระลึกเท่านั้น', ui.ButtonSet.OK);
}

function staff_(b) {
  if (!STAFF_ACTIONS[b.action]) return json_({ ok: false, error: 'คำสั่งไม่ถูกต้อง' });
  var pinErr = checkPin_(b.pin);
  if (pinErr) return json_({ ok: false, auth: false, error: pinErr });
  var station = clean_(b.station, 40).replace(/^'/, '') || 'เจ้าหน้าที่'; // ชื่อเจ้าหน้าที่ที่กรอกตอนเข้าระบบ
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);

  if (b.action === 'login' || b.action === 'stats') return json_({ ok: true, stats: stats_(readRows_(sh)) });

  // รายชื่อทั้งหมดแบบย่อ (ไม่มีเบอร์เต็ม) ให้เครื่องเจ้าหน้าที่เก็บไว้ค้นเองได้ทันที — เรียกซ้ำทุก ~15 วินาที
  if (b.action === 'roster') {
    var all0 = readRows_(sh), list = [];
    all0.forEach(function (x) { if (String(x[COL.ID - 1]).trim()) list.push(rosterRow_(x)); });
    return json_({ ok: true, rows: list, stats: stats_(all0) });
  }

  // ส่งการมอบของหลายรายการในครั้งเดียว (คิวจากเครื่องเจ้าหน้าที่) · ล็อกครั้งเดียว อ่านเฉพาะคอลัมน์ที่ต้องใช้
  if (b.action === 'batch') return json_(batch_(sh, b.ops, station));

  if (b.action === 'lookup') {
    var rows = readRows_(sh), q = String(b.q || '').trim(), out = [];
    var id = ticketId_(q), digits = q.replace(/\D/g, '');
    rows.forEach(function (x, i) {
      if (out.length >= 8) return;
      var hit = id ? String(x[COL.ID - 1]) === id
        : digits.length >= 9 ? String(x[COL.PHONE - 1]).replace(/\D/g, '') === digits
        : q.length >= 2 && (x[COL.FIRST - 1] + ' ' + x[COL.LAST - 1]).toLowerCase().indexOf(q.toLowerCase()) >= 0;
      if (hit) out.push(rec_(x));
    });
    return json_({ ok: true, results: out, stats: stats_(rows) });
  }

  // redeem / undo: lock so two scanners can never hand out twice for the same ticket
  var tid = ticketId_(b.id);
  if (!tid) return json_({ ok: false, error: 'รหัสบัตรไม่ถูกต้อง' });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var all = readRows_(sh), at = -1;
    for (var k = 0; k < all.length; k++) if (String(all[k][COL.ID - 1]) === tid) { at = k; break; }
    if (at < 0) return json_({ ok: true, found: false });
    var r = at + 2, row = all[at], now = new Date();
    var stamp = Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM HH:mm');
    if (b.action === 'redeem') {
      if (row[COL.GOT - 1] === true) return json_({ ok: true, found: true, already: true, rec: rec_(row), stats: stats_(all) });
      sh.getRange(r, COL.GOT, 1, 2).setValues([[true, now]]);
      sh.getRange(r, COL.NOTE, 1, 2).setValues([[addNote_(row[COL.NOTE - 1], 'มอบของโดย ' + station + ' ' + stamp), station]]);
      row[COL.GOT - 1] = true; row[COL.GOT_AT - 1] = now; row[COL.BY - 1] = station;
      return json_({ ok: true, found: true, redeemed: true, rec: rec_(row), stats: stats_(all) });
    }
    // undo (staff tapped by mistake)
    sh.getRange(r, COL.GOT, 1, 2).setValues([[false, '']]);
    sh.getRange(r, COL.NOTE, 1, 2).setValues([[addNote_(row[COL.NOTE - 1], 'ยกเลิกการรับโดย ' + station + ' ' + stamp), '']]);
    row[COL.GOT - 1] = false; row[COL.GOT_AT - 1] = ''; row[COL.BY - 1] = '';
    return json_({ ok: true, found: true, undone: true, rec: rec_(row), stats: stats_(all) });
  } finally {
    lock.releaseLock();
  }
}

function batch_(sh, ops, station) {
  ops = (Array.isArray(ops) ? ops : []).slice(0, 50);
  if (!ops.length) return { ok: false, error: 'ไม่มีรายการ' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var last = lastDataRow_(sh), n = Math.max(0, last - 1);
    var ids = n ? sh.getRange(2, COL.ID, n, 1).getValues() : [];
    var st = n ? sh.getRange(2, COL.GOT, n, 4).getValues() : []; // L รับของ | M เวลารับ | N หมายเหตุ | O ผู้สแกน
    var idx = {};
    ids.forEach(function (v, i) { var s = String(v[0]).trim(); if (s && !(s in idx)) idx[s] = i; });
    var out = ops.map(function (op) {
      var tid = ticketId_(op && op.id), k = String((op && op.k) || '').slice(0, 40);
      if (!tid || !(tid in idx)) return { k: k, id: tid || String(op && op.id), s: 'notfound' };
      var i = idx[tid], row = st[i];
      var who = clean_(op.by, 40).replace(/^'/, '') || station;
      var when = opTime_(op.at), stamp = Utilities.formatDate(when, 'Asia/Bangkok', 'dd/MM HH:mm');
      if (op.a === 'redeem') {
        if (row[0] === true) {
          // the same request sent again (reply lost on bad signal) → not a second hand-over
          var prevBy = String(row[3] || '') || lastBy_(row[2]);
          var same = row[1] instanceof Date && Math.abs(row[1].getTime() - when.getTime()) < 1500 && prevBy === who;
          return { k: k, id: tid, s: same ? 'redeemed' : 'already', gotAt: fmtAt_(row[1]), by: prevBy };
        }
        row[0] = true; row[1] = when; row[2] = addNote_(row[2], 'มอบของโดย ' + who + ' ' + stamp); row[3] = who;
        sh.getRange(i + 2, COL.GOT, 1, 4).setValues([row]);
        return { k: k, id: tid, s: 'redeemed', gotAt: fmtAt_(when) };
      }
      if (op.a === 'undo') {
        if (row[0] !== true) return { k: k, id: tid, s: 'notgot' };
        row[0] = false; row[1] = ''; row[2] = addNote_(row[2], 'ยกเลิกการรับโดย ' + who + ' ' + stamp); row[3] = '';
        sh.getRange(i + 2, COL.GOT, 1, 4).setValues([row]);
        return { k: k, id: tid, s: 'undone' };
      }
      return { k: k, id: tid, s: 'bad' };
    });
    return { ok: true, results: out };
  } finally {
    lock.releaseLock();
  }
}
// time the staff actually scanned (sent by the phone; may arrive later from the offline queue)
function opTime_(ms) {
  var n = Number(ms);
  return n && Math.abs(n - Date.now()) < 2 * 86400000 ? new Date(n) : new Date();
}
function fmtAt_(at) { return at instanceof Date ? Utilities.formatDate(at, 'Asia/Bangkok', 'HH:mm น. · dd/MM/yyyy') : ''; }
// "มอบของโดย ครูสมชาย 28/11 09:15" → "ครูสมชาย" (latest hand-over in the note)
function lastBy_(note) {
  var parts = String(note || '').split(' | ');
  for (var i = parts.length - 1; i >= 0; i--) {
    var m = parts[i].match(/^มอบของโดย (.+?) \d\d\/\d\d \d\d:\d\d$/);
    if (m) return m[1];
  }
  return '';
}
function by_(x) { return String(x[COL.BY - 1] || '') || lastBy_(x[COL.NOTE - 1]); }
function rosterRow_(x) {
  return [String(x[COL.ID - 1]).trim(), x[COL.NO - 1], String(x[COL.PREFIX - 1]), String(x[COL.FIRST - 1]), String(x[COL.LAST - 1]),
    String(x[COL.POSITION - 1]), String(x[COL.SCHOOL - 1]), String(x[COL.PROVINCE - 1]), String(x[COL.AFF - 1]),
    String(x[COL.PHONE - 1]).replace(/\D/g, '').slice(-4), x[COL.GOT - 1] === true ? 1 : 0, fmtAt_(x[COL.GOT_AT - 1]), x[COL.GOT - 1] === true ? by_(x) : ''];
}

// global brake on wrong PINs: 20 wrong tries → locked 15 min (setting a new PIN unlocks)
function checkPin_(pin) {
  var real = PropertiesService.getScriptProperties().getProperty('STAFF_PIN');
  if (!real) return 'ยังไม่ได้ตั้ง PIN เจ้าหน้าที่ (ใน Google Sheet: เมนู TGGC 2569 → ตั้ง/ดู PIN เจ้าหน้าที่)';
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('pinFails') || 0);
  if (fails >= 20) return 'ใส่ PIN ผิดหลายครั้งเกินไป ระบบล็อกชั่วคราว 15 นาที (หรือตั้ง PIN ใหม่ในเมนู Sheet เพื่อปลดล็อก)';
  if (String(pin || '') !== real) { cache.put('pinFails', String(fails + 1), 900); return 'PIN ไม่ถูกต้อง'; }
  return '';
}

// rows 2..last registration (index i ↔ sheet row i + 2); not filtered so row numbers stay correct
function readRows_(sh) {
  var last = lastDataRow_(sh);
  var nc = Math.min(NCOL_ALL, sh.getMaxColumns()); // column O may not exist on an older copy of the Sheet
  return last >= 2 ? sh.getRange(2, 1, last - 1, nc).getValues() : [];
}
/**
 * แถวสุดท้ายที่มีรหัสบัตร (คอลัมน์ B) — ใช้แทน getLastRow() เพราะช่องติ๊กที่เตรียมไว้ล่วงหน้า
 * (FALSE ทั้งคอลัมน์ L) ทำให้ getLastRow() นับเกินไปถึงแถวสุดท้ายของช่องติ๊ก
 */
function lastDataRow_(sh) {
  var n = sh.getLastRow();
  if (n < 2) return 1;
  var ids = sh.getRange(2, COL.ID, n - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]).trim()) return i + 2;
  return 1;
}
function stats_(rows) {
  var got = 0, total = 0;
  rows.forEach(function (x) { if (!x[COL.ID - 1]) return; total++; if (x[COL.GOT - 1] === true) got++; });
  return { total: total, got: got };
}
function ticketId_(s) {
  var m = String(s || '').toUpperCase().match(/TG-?([2-9A-HJ-NP-Z]{5})/);
  return m ? 'TG-' + m[1] : '';
}
function rec_(x) {
  var at = x[COL.GOT_AT - 1];
  return {
    id: x[COL.ID - 1], no: x[COL.NO - 1],
    prefix: x[COL.PREFIX - 1], first: x[COL.FIRST - 1], last: x[COL.LAST - 1],
    position: x[COL.POSITION - 1], school: x[COL.SCHOOL - 1], province: x[COL.PROVINCE - 1],
    affiliation: x[COL.AFF - 1], phone4: String(x[COL.PHONE - 1]).replace(/\D/g, '').slice(-4),
    got: x[COL.GOT - 1] === true,
    gotAt: fmtAt_(at), by: x[COL.GOT - 1] === true ? by_(x) : '',
    note: String(x[COL.NOTE - 1] || '')
  };
}
function addNote_(old, line) {
  old = String(old || '');
  return (old ? old + ' | ' : '') + line;
}

/**
 * ลบข้อมูลผู้ลงทะเบียนทั้งหมด (เก็บหัวตาราง รูปแบบ และสูตรในแท็บสรุปไว้)
 * ก่อนลบจะสำรองข้อมูลเดิมไว้ในแท็บใหม่ "สำรอง วัน-เวลา" เสมอ
 */
function resetRegistrations() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_NAME);
  var count = lastDataRow_(sh) - 1;
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

    var last = lastDataRow_(sh);
    sh.getRange(2, 1, last - 1, Math.min(NCOL_ALL, sh.getMaxColumns())).clearContent().clearNote();
    sh.getRange(2, COL.GOT, last - 1, 1).uncheck(); // keep the ready-made checkboxes as unticked
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
  // ระบบนี้สำหรับครูเท่านั้น: นักเรียนลงทะเบียนวันงานที่ชั้น 3 อาคารหอประชุมชูชาติ กำภู 60 ปี
  if (/นักเรียน|นร\.|student/i.test(d.position)) return 'ระบบนี้สำหรับครูเท่านั้น นักเรียนให้ลงทะเบียนในวันงานที่ชั้น 3 อาคารหอประชุมชูชาติ กำภู 60 ปี (หน้าห้องประชุม)';
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
