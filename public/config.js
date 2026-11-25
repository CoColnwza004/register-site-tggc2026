/*
 * ตั้งค่าเว็บลงทะเบียน
 * ENDPOINT: วาง URL ของ Google Apps Script Web App (ลงท้ายด้วย /exec) ที่ได้จากขั้นตอน Deploy
 *           ถ้าเว้นว่าง เว็บจะทำงานแบบ "โหมดตัวอย่าง" (ออกบัตรได้ แต่ไม่ส่งข้อมูลเข้า Google Sheet)
 * EVENT_START: เวลาเริ่มงาน ใช้กับตัวนับถอยหลัง (เวลาไทย +07:00)
 * LOGO_URL: โลโก้ (เฉพาะสัญลักษณ์ ไม่มีตัวหนังสือ) ใช้บนบัตรและไอคอน · เว้นว่าง = ใช้โลโก้เวกเตอร์สำรองในตัว
 */
window.TGGC_CONFIG = {
  ENDPOINT: "https://script.google.com/macros/s/AKfycbxl4saZgQY5lk0Gz832CwZRRYBZAMvSQSIUs1wGkKZgVtXBich5v9MnQMUKNk7BrT4_/exec",
  EVENT_START: "2026-11-28T08:00:00+07:00",
  LOGO_URL: "assets/logo-mark.png",
};
