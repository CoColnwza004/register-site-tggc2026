# ลงทะเบียน TGGC 2569

เว็บลงทะเบียนล่วงหน้า **การแข่งขันอัจฉริยภาพทางด้านภูมิศาสตร์และภูมิสารสนเทศแห่งประเทศไทย ระดับมัธยมศึกษา ครั้งที่ 3 พ.ศ. 2569**
วันเสาร์ที่ 28 พฤศจิกายน 2569 ณ โรงเรียนชลประทานวิทยา จังหวัดนนทบุรี

- ออกแบบสำหรับมือถือเป็นหลัก (static site ไม่ต้อง build) แยก 3 หน้า: หน้าหลัก `#home` · ลงทะเบียน 3 ขั้น `#register` · บัตร `#ticket`
- กรอกข้อมูลครบ → ได้บัตรเข้าร่วมงานเป็นรูป PNG (1080×1920) พร้อม QR รหัสบัตร บันทึกลงเครื่องได้
- ข้อมูลส่งเข้า Google Sheet แบบเรียลไทม์ผ่าน Google Apps Script
- ถ้าเน็ตหลุด บัตรยังออกได้ และระบบจะส่งข้อมูลให้อัตโนมัติเมื่อกลับมาออนไลน์
- กรอกซ้ำด้วยเบอร์เดิม = แก้ไขข้อมูลแถวเดิม (รหัสบัตรเดิม)
- ลายบัตร 24 แบบ (6 โทนสี × 4 ลายแผนที่) เลือกจากรหัสบัตร และลายเส้นสร้างจากรหัสบัตร จึงไม่ซ้ำกัน
- เมนู **TGGC 2569 → รีเซ็ตข้อมูลลงทะเบียน** ใน Google Sheet (สำรองข้อมูลเดิมเป็นแท็บใหม่ก่อนลบเสมอ)
- **หน้าเจ้าหน้าที่แยกลิงก์** `/staff/` สำหรับจุดแลกของที่ระลึก: สแกน QR บนบัตร → ยืนยันมอบของ → ติ๊กใน Sheet พร้อมเวลาและชื่อจุดทันที, สแกนซ้ำจะเตือน "รับไปแล้ว", ค้นด้วยเบอร์/ชื่อได้, ยกเลิกกรณีกดผิดได้ (ใช้ PIN ที่ตั้งจากเมนู Sheet)

## โครงสร้าง

| ไฟล์ | หน้าที่ |
|---|---|
| `public/index.html`, `styles.css`, `app.js` | หน้าเว็บ |
| `public/config.js` | ตั้งค่า `ENDPOINT` (URL Apps Script), เวลาเริ่มงาน, ไฟล์โลโก้ |
| `public/vendor/qrcode.js` | ไลบรารีสร้าง QR (MIT) |
| `public/staff/` | หน้าเจ้าหน้าที่ สแกนบัตร/มอบของที่ระลึก (ไม่มีลิงก์จากหน้าผู้เข้าร่วม, noindex) |
| `public/vendor/jsqr.min.js` | ไลบรารีอ่าน QR จากกล้อง สำหรับเครื่องที่ไม่มี BarcodeDetector เช่น iPhone (Apache-2.0) |
| `public/_headers` | header ของ Cloudflare Pages (noindex หน้า staff, อนุญาตกล้อง) |
| `apps-script/Code.gs` | โค้ดรับข้อมูลลง Google Sheet |
| `scripts/build-preview.mjs`, `build-staff-preview.mjs` | รวมไฟล์เป็นหน้าเดียวสำหรับพรีวิว |
| `scripts/cut-logo.py`, `public/assets/` | ตัดพื้นหลังโลโก้ → PNG โปร่งใส |

## เชื่อม Google Sheet

Sheet: แท็บ **สรุป** (ยอดรวม/แยกตามตำแหน่ง จังหวัด สังกัด), **ค้นหาบัตร** (พิมพ์รหัสบัตรหรือเบอร์ที่จุดแลกของที่ระลึก), **ลงทะเบียน** (ข้อมูลดิบ + ช่องติ๊กรับของที่ระลึก ลงเวลาให้อัตโนมัติ)

1. เปิด Sheet → ส่วนขยาย → Apps Script → วางโค้ดจาก `apps-script/Code.gs` → บันทึก
2. Deploy → New deployment → Web app → Execute as: **Me**, Who has access: **Anyone** → Deploy → อนุญาตสิทธิ์
3. คัดลอก URL ที่ลงท้าย `/exec` ใส่ใน `public/config.js` ที่ `ENDPOINT`

## หน้าเจ้าหน้าที่ (จุดแลกของที่ระลึก)

1. วางโค้ด `apps-script/Code.gs` ล่าสุด → บันทึก → **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy** (URL `/exec` เดิมใช้ต่อได้)
2. รีเฟรช Sheet → เมนู **TGGC 2569 → ตั้ง/ดู PIN เจ้าหน้าที่** → เว้นว่างแล้วกด OK เพื่อสุ่ม PIN 6 หลัก
3. เจ้าหน้าที่เปิด `https://<โดเมน>/staff/` ในมือถือ → ใส่ชื่อจุด + PIN → อนุญาตกล้อง
   - ใส่ PIN ผิดรวม 20 ครั้งใน 15 นาที ระบบล็อกชั่วคราว (ตั้ง PIN ใหม่เพื่อปลดล็อกทันที)
   - เปลี่ยน PIN เมื่อไหร่ เครื่องที่ล็อกอินอยู่จะถูกให้ล็อกอินใหม่

## Deploy (Cloudflare Pages)

เว็บจริง: **https://tggc2569-register.pages.dev** · หน้าเจ้าหน้าที่ **https://tggc2569-register.pages.dev/staff/**

```bash
node scripts/build-worker.mjs
npx wrangler pages deploy dist --project-name tggc2569-register --branch main
```

`build-worker.mjs` รวมทุกไฟล์ใน `public/` เป็น `dist/_worker.js` ไฟล์เดียว (Pages advanced mode) ถ้า wrangler ติดขั้นอัปโหลดไฟล์
(`/pages/assets/check-missing` Authorization failed) ให้ส่ง `_worker.bundle` เข้า API `.../pages/projects/<name>/deployments` ตรง ๆ แทน
