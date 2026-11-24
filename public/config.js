/*
 * ตั้งค่าเว็บลงทะเบียน
 * ENDPOINT: วาง URL ของ Google Apps Script Web App (ลงท้ายด้วย /exec) ที่ได้จากขั้นตอน Deploy
 *           ถ้าเว้นว่าง เว็บจะทำงานแบบ "โหมดตัวอย่าง" (ออกบัตรได้ แต่ไม่ส่งข้อมูลเข้า Google Sheet)
 * EVENT_START: เวลาเริ่มงาน ใช้กับตัวนับถอยหลัง (เวลาไทย +07:00)
 * LOGO_URL: ถ้ามีไฟล์โลโก้ต้นฉบับ ให้วางไว้ที่ public/logo.png แล้วใส่ "logo.png" (เว้นว่าง = ใช้โลโก้เวกเตอร์ในตัว)
 */
window.TGGC_CONFIG = {
  ENDPOINT: "",
  EVENT_START: "2026-11-28T08:00:00+07:00",
  LOGO_URL: "",
};
