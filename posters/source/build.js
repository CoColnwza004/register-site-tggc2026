// Usage: node posters/source/build.js  → posters/*.png + *.pdf
// Builds the two A4 posters (participant + staff) as HTML, renders PNG (300 dpi) + PDF with Playwright,
// and checks that each QR code decodes back to the right URL.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const HERE = __dirname, OUT = process.argv[2] || path.resolve(__dirname, '..');
const b64 = f => fs.readFileSync(f).toString('base64');
const LOGO_FULL = 'data:image/png;base64,' + b64(ROOT + '/public/assets/logo-full.png');
const LOGO_MARK = 'data:image/png;base64,' + b64(ROOT + '/public/assets/logo-mark.png');
const T = [0, 1, 2].map(i => 'data:image/jpeg;base64,' + b64(HERE + `/t${i}.jpg`));
const QRJS = fs.readFileSync(ROOT + '/public/vendor/qrcode.js', 'utf8');
const JSQR = fs.readFileSync(ROOT + '/public/vendor/jsqr.min.js', 'utf8');
const LAND = fs.readFileSync(HERE + '/landscape.svg', 'utf8').replace('class="landscape"', 'class="land" preserveAspectRatio="xMidYMax slice"');
const app = fs.readFileSync(ROOT + '/public/app.js', 'utf8');
const TOPO = app.slice(app.indexOf('  function makeNoise('), app.indexOf('  function paintCanvas('));

const SITE = 'https://tggc2569-register.pages.dev/';
const POSTERS = {
  register: { url: SITE + '?openExternalBrowser=1', short: 'tggc2569-register.pages.dev' },
  staff: { url: SITE + 'staff/?openExternalBrowser=1', short: 'tggc2569-register.pages.dev/staff' },
};

const ICON = {
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.6"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3.5-5-1s3 1 5 1c2 0 5 1.5 5-1s-3.5-2-5 1"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v3M8 20h8M9 17h6"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

const FONTS = '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=Chakra+Petch:wght@500;600;700&family=Kanit:wght@400;500;600;700;800&display=block" rel="stylesheet">';

const BASE_CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
:root { --navy:#075f98; --sea:#0a98c7; --teal:#15a8a0; --mint:#2cc394; --green:#148e64; --mist:#a7d5db; --white:#fcfdfd;
  --ink:#0a2b42; --deep:#04324f; --muted:#3f6577;
  --fd:"Kanit",sans-serif; --fb:"IBM Plex Sans Thai",sans-serif; --ft:"Chakra Petch","Kanit",monospace; }
html, body { width: 794px; height: 1123px; }
body { font-family: var(--fb); color: var(--ink); -webkit-font-smoothing: antialiased; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.poster { position: relative; width: 794px; height: 1123px; overflow: hidden; isolation: isolate; }
.layer { position: absolute; inset: 0; z-index: -1; }
canvas.layer { width: 794px; height: 1123px; }
.qr-card { position: relative; background: #fff; border-radius: 30px; }
.qr-card canvas { display: block; }
.brk { position: absolute; width: 38px; height: 38px; border: 5px solid var(--mint); }
.brk.tl { left: -12px; top: -12px; border-right: 0; border-bottom: 0; border-radius: 18px 0 0 0; }
.brk.tr { right: -12px; top: -12px; border-left: 0; border-bottom: 0; border-radius: 0 18px 0 0; }
.brk.bl { left: -12px; bottom: -12px; border-right: 0; border-top: 0; border-radius: 0 0 0 18px; }
.brk.br { right: -12px; bottom: -12px; border-left: 0; border-top: 0; border-radius: 0 0 18px 0; }
.coord { position: absolute; font-family: var(--ft); font-size: 8.5px; font-weight: 600; letter-spacing: .26em; white-space: nowrap; }
.coord.l { left: 12px; top: 50%; transform-origin: 0 0; transform: rotate(-90deg) translate(-50%, 0); }
.coord.r { right: 12px; top: 50%; transform-origin: 100% 0; transform: rotate(90deg) translate(50%, 0); }
`;

/* -------- participant poster -------- */
const REGISTER = `
<div class="poster reg">
  <div class="layer bg"></div>
  <canvas class="layer" id="topo" width="1588" height="2246"></canvas>
  <div class="layer grid"></div>
  <span class="sun"></span>
  <span class="coord l">LAT 13.9°N · LONG 100.5°E · NONTHABURI · THAILAND</span>
  <span class="coord r">TGGC 2026 · GEOGRAPHY &amp; GEOINFORMATICS · WGS 84</span>

  <header class="top">
    <img class="logo" src="${LOGO_FULL}" alt="">
    <div class="date"><b>28.11.69</b><span>SAT · NOV 28 · 2026</span></div>
  </header>

  <span class="chip"><i></i>เปิดลงทะเบียนล่วงหน้าแล้ว · สำหรับครูและผู้เข้าร่วมกิจกรรม</span>
  <h1><span>อัจฉริยภาพ</span><span class="grad">ภูมิศาสตร์</span><span><em>และ</em> ภูมิสารสนเทศ</span></h1>
  <p class="lede">การแข่งขันอัจฉริยภาพทางด้านภูมิศาสตร์และภูมิสารสนเทศแห่งประเทศไทย<br><b>ระดับมัธยมศึกษา ครั้งที่ 3 พ.ศ. 2569</b></p>

  <section class="mid">
    <div class="qr-wrap">
      <div class="qr-card"><canvas id="qr" width="560" height="560" style="width:204px;height:204px"></canvas>
        <i class="brk tl"></i><i class="brk tr"></i><i class="brk bl"></i><i class="brk br"></i></div>
      <div class="qr-cap"><span class="scan">${ICON.scan}</span><div><b>สแกนเพื่อลงทะเบียนรับบัตร</b><small>${POSTERS.register.short}</small></div></div>
    </div>
    <div class="tix">
      <span class="glow"></span>
      <img class="t t2" src="${T[2]}" alt=""><img class="t t1" src="${T[1]}" alt=""><img class="t t0" src="${T[0]}" alt="">
      <span class="badge"><b>24</b><small>ลายบัตร<br>สุ่มไม่ซ้ำ</small></span>
    </div>
  </section>

  <ol class="steps">
    <li><i>01</i><b>สแกน QR</b><small>กรอกข้อมูล 3 ขั้นสั้น ๆ<br>ไม่ถึง 1 นาที</small></li>
    <li><i>02</i><b>รับบัตรทันที</b><small>บัตร QR เฉพาะตัว<br>บันทึกเป็นรูปในมือถือ</small></li>
    <li><i>03</i><b>แลกของที่ระลึก</b><small>แสดงบัตรที่จุดแลกของ<br>ในวันงาน</small></li>
  </ol>

  <div class="info">
    <div><span class="ic">${ICON.cal}</span><p><small>วันงาน</small><b>เสาร์ 28 พฤศจิกายน 2569</b></p></div>
    <div><span class="ic">${ICON.pin}</span><p><small>สนามแข่งขัน</small><b>โรงเรียนชลประทานวิทยา</b></p></div>
    <div><span class="ic">${ICON.gift}</span><p><small>จุดแลกของที่ระลึก</small><b>อาคาร 100 ปี ชูชาติอนุสรณ์ ชั้น 1</b></p></div>
  </div>

  <div class="foot">
    ${LAND}
    <p class="royal"><span>${ICON.trophy}</span>ชิงถ้วยพระราชทาน สมเด็จพระกนิษฐาธิราชเจ้า กรมสมเด็จพระเทพรัตนราชสุดาฯ สยามบรมราชกุมารี</p>
  </div>
</div>`;

const REGISTER_CSS = `
.reg .bg { background:
  radial-gradient(60% 34% at 88% 4%, #fff 0%, rgba(255,255,255,0) 70%),
  radial-gradient(70% 40% at 0% 52%, rgba(44,195,148,.16), transparent 70%),
  radial-gradient(70% 40% at 100% 70%, rgba(10,152,199,.14), transparent 70%),
  linear-gradient(180deg, #cdeaf2 0%, #e4f4f7 34%, #f2faf9 62%, #e3f4ee 100%); }
.reg .grid { background:
  url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='132' height='132'%3E%3Cpath d='M0 -6V6M-6 0H6M132 -6V6M126 0H138M0 126V138M-6 132H6M132 126V138M126 132H138' stroke='%23075f98' stroke-opacity='.3' stroke-width='1.3'/%3E%3C/svg%3E"),
  repeating-linear-gradient(0deg, rgba(7,95,152,.06) 0 1px, transparent 1px 66px),
  repeating-linear-gradient(90deg, rgba(7,95,152,.06) 0 1px, transparent 1px 66px);
  background-size: 132px 132px, auto, auto; background-position: 30px 24px, 30px 24px, 30px 24px; }
.reg .sun { position: absolute; right: 58px; top: 120px; width: 120px; height: 120px; border-radius: 50%; z-index: -1;
  background: radial-gradient(circle, #fff 0 44%, rgba(255,255,255,.6) 46%, rgba(44,195,148,.14) 70%, rgba(44,195,148,0) 72%); }
.reg .coord { color: rgba(7,95,152,.38); }
.reg .top { display: flex; align-items: center; justify-content: space-between; padding: 30px 48px 0; }
.reg .logo { height: 60px; }
.reg .date { text-align: right; font-family: var(--ft); line-height: 1.05; }
.reg .date b { display: block; font-size: 34px; color: var(--navy); letter-spacing: .02em; }
.reg .date span { font-size: 11px; font-weight: 700; letter-spacing: .24em; color: var(--green); }
.reg .chip { display: inline-flex; align-items: center; gap: 8px; margin: 16px 0 0 48px; padding: 6px 14px; border-radius: 999px;
  background: rgba(44,195,148,.16); border: 1px solid rgba(44,195,148,.4); color: var(--green); font-weight: 600; font-size: 14px; }
.reg .chip i { width: 9px; height: 9px; border-radius: 50%; background: var(--mint); box-shadow: 0 0 0 4px rgba(44,195,148,.22); }
.reg h1 { margin: 8px 48px 0; font-family: var(--fd); font-weight: 800; font-size: 60px; line-height: 1.04; letter-spacing: -.005em; color: var(--navy); }
.reg h1 span { display: block; }
.reg h1 .grad { background: linear-gradient(100deg, var(--sea) 0%, var(--teal) 45%, var(--mint) 100%); -webkit-background-clip: text; background-clip: text; color: transparent; padding-bottom: 4px; }
.reg h1 em { font-style: normal; font-weight: 600; font-size: .62em; color: var(--teal); }
.reg .lede { margin: 8px 48px 0; font-size: 15px; line-height: 1.5; color: var(--muted); }
.reg .lede b { color: var(--ink); }
.reg .mid { position: relative; display: grid; grid-template-columns: 280px 1fr; gap: 26px; margin: 16px 48px 0; align-items: center; }
.reg .qr-wrap { display: grid; gap: 14px; justify-items: center; }
.reg .qr-card { padding: 22px; box-shadow: 0 2px 4px rgba(7,95,152,.08), 0 26px 60px rgba(7,95,152,.22); }
.reg .qr-cap { display: flex; align-items: center; gap: 10px; }
.reg .qr-cap .scan { width: 42px; height: 42px; border-radius: 14px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, var(--sea), var(--navy)); flex: none; }
.reg .qr-cap .scan svg { width: 24px; height: 24px; }
.reg .qr-cap b { display: block; white-space: nowrap; font-family: var(--fd); font-weight: 700; font-size: 18px; color: var(--navy); line-height: 1.2; }
.reg .qr-cap small { font-family: var(--ft); font-size: 12.5px; font-weight: 600; color: var(--green); letter-spacing: .02em; }
.reg .tix { position: relative; height: 318px; }
.reg .tix .glow { position: absolute; inset: 0 -40px; background: radial-gradient(closest-side, rgba(10,152,199,.32), rgba(44,195,148,.12) 65%, transparent); }
.reg .tix .t { position: absolute; width: 150px; border-radius: 16px; box-shadow: 0 22px 44px rgba(4,50,79,.32); }
.reg .t0 { left: 158px; top: 18px; transform: rotate(7deg); z-index: 3; }
.reg .t1 { left: 80px; top: 30px; transform: rotate(-4deg); z-index: 2; }
.reg .t2 { left: 8px; top: 48px; transform: rotate(-14deg); z-index: 1; opacity: .95; }
.reg .badge { position: absolute; right: 0; bottom: -4px; z-index: 4; width: 96px; height: 96px; border-radius: 50%; display: grid; place-items: center; align-content: center;
  background: linear-gradient(135deg, var(--mint), var(--green)); color: #fff; box-shadow: 0 12px 28px rgba(20,142,100,.4); border: 4px solid #fff; text-align: center; }
.reg .badge b { font-family: var(--ft); font-size: 34px; line-height: .9; }
.reg .badge small { font-size: 11px; font-weight: 600; line-height: 1.2; }
.reg .steps { position: relative; z-index: 2; list-style: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 18px 48px 0; }
.reg .steps li { display: grid; grid-template-columns: 36px 1fr; column-gap: 10px; align-items: center; padding: 12px 14px; border-radius: 20px; background: rgba(255,255,255,.78); border: 1px solid rgba(255,255,255,.95); box-shadow: 0 10px 26px rgba(7,95,152,.1); }
.reg .steps i { display: inline-grid; place-items: center; width: 36px; height: 36px; border-radius: 12px; font-style: normal; font-family: var(--ft); font-weight: 700; font-size: 14px; color: #fff; background: linear-gradient(135deg, var(--sea), var(--navy)); }
.reg .steps li:nth-child(2) i { background: linear-gradient(135deg, var(--mint), var(--teal)); }
.reg .steps li:nth-child(3) i { background: linear-gradient(135deg, var(--mint), var(--green)); }
.reg .steps b { display: block; font-family: var(--fd); font-weight: 700; font-size: 18px; color: var(--ink); line-height: 1.2; }
.reg .steps small { grid-column: 1 / -1; display: block; margin-top: 6px; font-size: 12.5px; color: var(--muted); line-height: 1.45; }
.reg .info { position: relative; z-index: 2; display: grid; grid-template-columns: 1.08fr 1.08fr 1.34fr; margin: 12px 48px 0; border-radius: 20px; overflow: hidden;
  background: linear-gradient(110deg, var(--deep), var(--navy) 60%, #0b7aa8); box-shadow: 0 16px 36px rgba(4,50,79,.28); }
.reg .info > div { display: flex; align-items: center; gap: 9px; padding: 14px 12px; color: #fff; }
.reg .info > div + div { border-left: 1px solid rgba(167,213,219,.22); }
.reg .info .ic { width: 34px; height: 34px; flex: none; border-radius: 11px; display: grid; place-items: center; background: rgba(44,195,148,.22); color: var(--mint); }
.reg .info .ic svg { width: 20px; height: 20px; }
.reg .info small { display: block; font-size: 11px; color: var(--mist); font-weight: 500; }
.reg .info b { display: block; white-space: nowrap; font-size: 13px; font-weight: 600; line-height: 1.3; }
.reg .foot { position: absolute; left: 0; right: 0; bottom: 0; }
.reg .land { display: block; width: 100%; height: 168px; filter: drop-shadow(0 -6px 18px rgba(7,95,152,.12)); }
.reg .land g[stroke="#fcfdfd"] { filter: drop-shadow(0 0 1.2px rgba(7,95,152,.45)); }
.reg .royal { position: absolute; left: 0; right: 0; bottom: 18px; display: flex; justify-content: center; align-items: center; gap: 8px;
  color: #fff; font-size: 13.5px; font-weight: 600; text-shadow: 0 1px 3px rgba(4,50,79,.45); }
.reg .royal span { width: 22px; height: 22px; display: inline-grid; } .reg .royal svg { width: 22px; height: 22px; }
`;

/* -------- staff poster -------- */
const STAFF = `
<div class="poster staff">
  <div class="layer bg"></div>
  <canvas class="layer" id="topo" width="1588" height="2246"></canvas>
  <div class="layer grid"></div>
  <svg class="globe" viewBox="-120 -120 240 240"><circle r="100"/><ellipse rx="34" ry="100"/><ellipse rx="70" ry="100"/><path d="M0-100V100M-100 0H100"/><ellipse rx="94" ry="28" transform="translate(0 -50)"/><ellipse rx="94" ry="28" transform="translate(0 50)"/><ellipse class="orb" rx="160" ry="40" transform="rotate(-20)"/><circle class="sat" r="4" cx="150" cy="-54"/></svg>
  <span class="coord l">LAT 13.9°N · LONG 100.5°E · SOUVENIR POINT · TGGC 2026</span>
  <span class="coord r">STAFF ONLY · AUTHORISED PERSONNEL · WGS 84</span>

  <header class="top">
    <img class="mark" src="${LOGO_MARK}" alt="">
    <div class="word"><b>TGGC <em>2026</em></b><span>Thailand Geography &amp; Geoinformatics Competition</span></div>
    <span class="only">STAFF ONLY</span>
  </header>

  <span class="tag">สำหรับเจ้าหน้าที่จุดแลกของที่ระลึกเท่านั้น</span>
  <h1>จุดแลก<br><span class="grad">ของที่ระลึก</span></h1>
  <p class="lede">ระบบสแกนบัตรผู้เข้าร่วมงาน · บันทึกการมอบของเข้า Google Sheet ทันที</p>

  <section class="scan">
    <div class="frame">
      <i class="brk tl"></i><i class="brk tr"></i><i class="brk bl"></i><i class="brk br"></i>
      <div class="qr-card"><canvas id="qr" width="560" height="560" style="width:216px;height:216px"></canvas></div>
      <b class="laser"></b>
    </div>
    <div class="cap"><b>สแกนเพื่อเปิดหน้าเจ้าหน้าที่</b><small>${POSTERS.staff.short}</small></div>
  </section>

  <ol class="steps">
    <li><i>1</i><div><b>สแกน QR นี้</b><small>เปิดด้วย Safari หรือ Chrome</small></div></li>
    <li><i>2</i><div><b>ใส่ชื่อเจ้าหน้าที่ + PIN</b><small>PIN 6 หลัก ขอจากผู้ดูแลระบบ</small></div></li>
    <li><i>3</i><div><b>ตั้งกล้องเป็น “อนุญาต” ถาวร</b><small>กดปุ่มใต้กล้อง ระบบบอกวิธีตามรุ่นมือถือ</small></div></li>
    <li><i>4</i><div><b>สแกนบัตร → มอบของ</b><small>กด “ยืนยันมอบของที่ระลึก” ระบบบันทึกชื่อผู้มอบ</small></div></li>
  </ol>

  <ul class="tips">
    <li><span>${ICON.check}</span>ช่วงคนเยอะ เปิด <b>“มอบทันทีเมื่อสแกนเจอ”</b></li>
    <li><span>${ICON.check}</span>สแกนซ้ำ ระบบ<b>เตือนทันที</b> ไม่บันทึกซ้ำ</li>
    <li><span>${ICON.check}</span>เน็ตหลุดไม่หาย <b>ส่งเข้า Sheet ให้เอง</b></li>
    <li><span>${ICON.check}</span>ไม่มีบัตร? ค้นด้วย<b>เบอร์โทร / ชื่อ</b></li>
  </ul>

  <footer class="foot">
    <div><span>${ICON.pin}</span>อาคาร 100 ปี ชูชาติอนุสรณ์ ชั้น 1 · โรงเรียนชลประทานวิทยา</div>
    <div><span>${ICON.cal}</span>เสาร์ 28 พฤศจิกายน 2569</div>
  </footer>
  <p class="keep">โปรดติดโปสเตอร์นี้เฉพาะบริเวณจุดเจ้าหน้าที่</p>
</div>`;

const STAFF_CSS = `
.staff { color: #fff; }
.staff .bg { background:
  radial-gradient(70% 40% at 100% 0%, rgba(10,152,199,.55), transparent 70%),
  radial-gradient(60% 35% at 0% 62%, rgba(44,195,148,.32), transparent 70%),
  radial-gradient(80% 40% at 50% 110%, rgba(21,168,160,.35), transparent 70%),
  linear-gradient(170deg, #064c78 0%, #04324f 45%, #021e30 100%); }
.staff .grid { background:
  url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='132' height='132'%3E%3Cpath d='M0 -6V6M-6 0H6M132 -6V6M126 0H138M0 126V138M-6 132H6M132 126V138M126 132H138' stroke='%23a7d5db' stroke-opacity='.4' stroke-width='1.3'/%3E%3C/svg%3E"),
  repeating-linear-gradient(0deg, rgba(167,213,219,.07) 0 1px, transparent 1px 66px),
  repeating-linear-gradient(90deg, rgba(167,213,219,.07) 0 1px, transparent 1px 66px);
  background-size: 132px 132px, auto, auto; background-position: 30px 24px, 30px 24px, 30px 24px; }
.staff .globe { position: absolute; z-index: -1; width: 520px; height: 520px; right: -190px; top: 150px; fill: none; stroke: rgba(167,213,219,.22); stroke-width: 1; overflow: visible; }
.staff .globe .orb { stroke: rgba(44,195,148,.55); stroke-dasharray: 2 5; }
.staff .globe .sat { fill: var(--mint); stroke: none; filter: drop-shadow(0 0 6px var(--mint)); }
.staff .coord { color: rgba(167,213,219,.45); }
.staff .top { display: flex; align-items: center; gap: 12px; padding: 34px 48px 0; }
.staff .mark { width: 62px; height: 62px; filter: drop-shadow(0 6px 16px rgba(0,0,0,.3)); }
.staff .word { flex: 1; line-height: 1.1; }
.staff .word b { font-family: var(--ft); font-size: 28px; letter-spacing: .02em; }
.staff .word em { font-style: normal; color: var(--mint); }
.staff .word span { display: block; font-size: 11px; letter-spacing: .14em; color: var(--mist); text-transform: uppercase; font-weight: 600; }
.staff .only { font-family: var(--ft); font-weight: 700; font-size: 14px; letter-spacing: .28em; padding: 8px 14px; border-radius: 10px; border: 2px solid var(--mint); color: var(--mint); }
.staff .tag { display: inline-block; margin: 24px 0 0 48px; padding: 6px 14px; border-radius: 999px; background: rgba(44,195,148,.18); border: 1px solid rgba(44,195,148,.5); color: #b9f3de; font-weight: 600; font-size: 14px; }
.staff h1 { margin: 8px 48px 0; font-family: var(--fd); font-weight: 800; font-size: 68px; line-height: 1.02; }
.staff h1 .grad { background: linear-gradient(100deg, var(--mist) 0%, var(--mint) 60%, #7fe6c1 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.staff .lede { margin: 8px 48px 0; font-size: 16px; color: var(--mist); }
.staff .scan { display: grid; justify-items: center; gap: 12px; margin-top: 20px; }
.staff .frame { position: relative; padding: 26px; border-radius: 36px; background: rgba(2,30,48,.55); border: 1px solid rgba(167,213,219,.18); box-shadow: 0 30px 70px rgba(0,0,0,.35), inset 0 0 60px rgba(44,195,148,.12); }
.staff .brk { width: 50px; height: 50px; border-width: 6px; }
.staff .brk.tl { left: 8px; top: 8px; } .staff .brk.tr { right: 8px; top: 8px; } .staff .brk.bl { left: 8px; bottom: 8px; } .staff .brk.br { right: 8px; bottom: 8px; }
.staff .qr-card { position: relative; z-index: 1; padding: 18px; border-radius: 22px; }
.staff .laser { position: absolute; z-index: 0; left: 6px; right: 6px; top: 46%; height: 3px; border-radius: 3px; background: linear-gradient(90deg, transparent, var(--mint), transparent); box-shadow: 0 0 16px var(--mint); opacity: .9; }
.staff .cap { text-align: center; }
.staff .cap b { display: block; font-family: var(--fd); font-weight: 700; font-size: 24px; }
.staff .cap small { font-family: var(--ft); font-size: 13.5px; font-weight: 600; color: var(--mint); letter-spacing: .03em; }
.staff .steps { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 20px 48px 0; }
.staff .steps li { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 20px; background: rgba(252,253,253,.07); border: 1px solid rgba(167,213,219,.2); }
.staff .steps i { flex: none; width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; font-style: normal; font-family: var(--ft); font-weight: 700; font-size: 18px; color: #032a42; background: linear-gradient(135deg, #7fe6c1, var(--mint)); }
.staff .steps b { display: block; font-family: var(--fd); font-weight: 600; font-size: 18px; line-height: 1.25; }
.staff .steps small { display: block; margin-top: 2px; font-size: 13px; color: var(--mist); line-height: 1.4; }
.staff .tips { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 12px 48px 0; padding: 14px 16px; border-radius: 20px; background: rgba(252,253,253,.95); color: var(--ink); }
.staff .tips li { display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 1.35; }
.staff .tips b { color: var(--navy); font-weight: 700; }
.staff .tips span { flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--green); color: #fff; }
.staff .tips svg { width: 13px; height: 13px; }
.staff .foot { position: absolute; left: 48px; right: 48px; bottom: 40px; display: flex; justify-content: space-between; gap: 12px; padding-top: 14px; border-top: 1px solid rgba(167,213,219,.25); font-size: 14px; font-weight: 600; }
.staff .foot div { display: flex; align-items: center; gap: 8px; }
.staff .foot span { width: 20px; height: 20px; color: var(--mint); } .staff .foot svg { width: 20px; height: 20px; }
.staff .keep { position: absolute; left: 0; right: 0; bottom: 18px; text-align: center; font-size: 11px; color: rgba(167,213,219,.7); letter-spacing: .04em; }
`;

function page(kind) {
  const body = kind === 'register' ? REGISTER : STAFF, css = BASE_CSS + (kind === 'register' ? REGISTER_CSS : STAFF_CSS);
  const topoOpt = kind === 'register'
    ? `{ seed: 1969, levels: 18, scale: 0.0019, cell: 12, minorAlpha: .55, lineWidth: 1.6, color: function (p) { return p < .5 ? "rgba(10,152,199,0.20)" : "rgba(20,142,100,0.22)"; } }`
    : `{ seed: 404, levels: 18, scale: 0.0017, cell: 12, minorAlpha: .5, lineWidth: 1.6, color: function (p) { return p < .5 ? "rgba(167,213,219,0.16)" : "rgba(44,195,148,0.22)"; } }`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>TGGC poster</title>${FONTS}<style>${css}</style></head><body>${body}
<script>${QRJS}</script><script>${JSQR}</script>
<script>
(function(){
${TOPO}
  var cv = document.getElementById('topo'), cx = cv.getContext('2d'); cx.scale(2, 2);
  drawTopo(cx, 794, 1123, ${topoOpt});
  // QR: error-correction H so the logo in the middle is safe; rounded finder eyes, square data modules
  var q = qrcode(0, 'H'); q.addData(${JSON.stringify(POSTERS[kind].url)}); q.make();
  var n = q.getModuleCount(), qc = document.getElementById('qr'), S = qc.width, g = qc.getContext('2d');
  var m = S / n, ink = ${kind === 'register' ? '"#04324f"' : '"#032a42"'};
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function eye(r, c) { return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7); }
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  g.fillStyle = ink;
  for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (!eye(r, c) && q.isDark(r, c)) g.fillRect(Math.floor(c * m), Math.floor(r * m), Math.ceil(m), Math.ceil(m));
  [[0, 0], [0, n - 7], [n - 7, 0]].forEach(function (p) {
    var x = p[1] * m, y = p[0] * m;
    g.fillStyle = ink; rr(x, y, 7 * m, 7 * m, 2.2 * m); g.fill();
    g.fillStyle = '#fff'; rr(x + m, y + m, 5 * m, 5 * m, 1.5 * m); g.fill();
    g.fillStyle = ${kind === 'register' ? '"#0a98c7"' : '"#148e64"'}; rr(x + 2 * m, y + 2 * m, 3 * m, 3 * m, 1 * m); g.fill();
  });
  var logo = new Image(); logo.onload = function () {
    var L = S * 0.22, x = (S - L) / 2;
    g.fillStyle = '#fff'; rr(x - m * 0.6, x - m * 0.6, L + m * 1.2, L + m * 1.2, m * 1.6); g.fill();
    g.drawImage(logo, x + L * 0.06, x + L * 0.06, L * 0.88, L * 0.88);
    var d = g.getImageData(0, 0, S, S), hit = jsQR(d.data, S, S);
    window.__qr = hit ? hit.data : 'FAIL';
  };
  logo.src = ${JSON.stringify(LOGO_MARK)};
})();
</script></body></html>`;
}

(async () => {
  const br = await chromium.launch();
  for (const kind of ['register', 'staff']) {
    const html = page(kind), f = path.join(HERE, `poster-${kind}.html`);
    fs.writeFileSync(f, html);
    const pg = await br.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 3.125 });
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto('file://' + f); await pg.waitForFunction(() => window.__qr, null, { timeout: 20000 });
    await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(600);
    const decoded = await pg.evaluate(() => window.__qr);
    const over = await pg.evaluate(() => { const f = document.querySelector('.poster > .foot').getBoundingClientRect().top;
      const lim = document.querySelector('.reg') ? f + 70 : f; // hills: the top of the svg is sky
      return [...document.querySelectorAll('.poster > *:not(.layer):not(.coord):not(.globe):not(.sun):not(.foot):not(.keep)')].filter(e => e.getBoundingClientRect().bottom > lim).map(e => e.className + ':' + Math.round(e.getBoundingClientRect().bottom) + '>' + Math.round(lim)); });
    const png = path.join(OUT, `poster-${kind === 'register' ? 'ลงทะเบียน' : 'เจ้าหน้าที่'}.png`);
    await pg.screenshot({ path: png });
    const shot = 'data:image/png;base64,' + fs.readFileSync(png).toString('base64');
    const fromShot = await pg.evaluate(async (src) => { const im = new Image(); im.src = src; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width / 2; c.height = im.height / 2; const x = c.getContext('2d'); x.drawImage(im, 0, 0, c.width, c.height);
      const r = jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height); return r ? r.data : 'FAIL'; }, shot);
    console.log('  printed poster image decodes to:', fromShot);
    await pg.pdf({ path: png.replace('.png', '.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
    console.log(kind, 'qr→', decoded, decoded === POSTERS[kind].url ? 'OK' : 'MISMATCH', 'overflow', JSON.stringify(over), 'errors', JSON.stringify(errs));
    await pg.close();
  }
  await br.close();
})();
