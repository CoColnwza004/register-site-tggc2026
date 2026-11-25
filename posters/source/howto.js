// Usage: node posters/source/howto.js  → posters/คู่มือเจ้าหน้าที่.png + .pdf
// One-page staff how-to: real screenshots of /staff/ (demo mode) in 4 steps + colour legend + tips.
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..'), PUB = ROOT + '/public', OUT = path.resolve(__dirname, '..');
const b64 = f => fs.readFileSync(f).toString('base64');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const STAFF_URL = 'https://tggc2569-register.pages.dev/staff/?openExternalBrowser=1';

const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/config.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end('window.TGGC_CONFIG={ENDPOINT:""};'); }
  const f = path.join(PUB, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
}).listen(8741);

async function screens(br) {
  const c = await br.newContext({ ...devices['iPhone 13'], permissions: ['camera'] });
  const p = await c.newPage(), shot = {};
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await p.goto('http://localhost:8741/staff/'); await p.waitForTimeout(900);
  await p.fill('#station', 'ครูสมชาย'); await p.fill('#pin', '123456');
  shot.login = await p.screenshot();
  await p.click('#loginBtn'); await p.waitForSelector('#appView:not([hidden])'); await p.waitForTimeout(1200);
  // fake camera view: a ticket held up to the camera
  const tix = 'data:image/jpeg;base64,' + b64(__dirname + '/t0.jpg');
  await p.evaluate((src) => {
    const sc = document.querySelector('#scanner'); document.querySelector('#video').style.visibility = 'hidden';
    sc.classList.add('live'); document.querySelector('#scanHint').hidden = false; document.querySelector('#camHelp').hidden = true;
    sc.style.background = `radial-gradient(closest-side, transparent 60%, rgba(2,30,48,.55)), url(${src}) 50% 63% / 58% auto no-repeat, linear-gradient(160deg, #3d4f5a, #1b2a33)`;
  }, tix);
  await p.waitForTimeout(300);
  shot.scan = await p.screenshot();
  await p.fill('#q', 'TG-H4N8P'); await p.click('#searchForm button'); await p.waitForSelector('#sheet:not(.load) .btn.green');
  await p.waitForTimeout(450); shot.found = await p.screenshot();
  await p.click('#shActions .btn.green'); await p.waitForTimeout(450);
  shot.ok = await p.screenshot(); shot.okBar = await p.locator('#shStatus').screenshot();
  await p.click('#shActions .btn.ghost'); await p.waitForTimeout(300);
  await p.fill('#q', 'TG-7K2QM'); await p.click('#searchForm button'); await p.waitForSelector('#sheet.warn'); await p.waitForTimeout(450);
  shot.warnBar = await p.locator('#shStatus').screenshot();
  await p.click('#shActions .btn.ghost'); await p.waitForTimeout(300);
  await p.fill('#q', 'TG-99999'); await p.click('#searchForm button'); await p.waitForSelector('#sheet.bad'); await p.waitForTimeout(450);
  shot.badBar = await p.locator('#shStatus').screenshot();
  await c.close();
  const o = {}; for (const k in shot) o[k] = 'data:image/png;base64,' + shot[k].toString('base64'); return o;
}

const ICON = {
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1.2" fill="currentColor"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

function html(S) {
  const step = (n, img, title, text) => `<li><div class="phone"><img src="${img}" alt=""></div><div class="cap"><i>${n}</i><b>${title}</b><small>${text}</small></div></li>`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=Chakra+Petch:wght@600;700&family=Kanit:wght@500;600;700;800&display=block" rel="stylesheet">
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
:root { --navy:#075f98; --sea:#0a98c7; --teal:#15a8a0; --mint:#2cc394; --green:#148e64; --mist:#a7d5db; --ink:#0a2b42; --deep:#04324f; --muted:#3f6577;
  --fd:"Kanit",sans-serif; --fb:"IBM Plex Sans Thai",sans-serif; --ft:"Chakra Petch",monospace; }
html, body { width: 794px; height: 1123px; }
body { font-family: var(--fb); color: var(--ink); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.p { position: relative; width: 794px; height: 1123px; overflow: hidden; isolation: isolate;
  background:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='132' height='132'%3E%3Cpath d='M0 -6V6M-6 0H6M132 -6V6M126 0H138M0 126V138M-6 132H6M132 126V138M126 132H138' stroke='%23075f98' stroke-opacity='.22' stroke-width='1.2'/%3E%3C/svg%3E") 30px 24px / 132px 132px,
    repeating-linear-gradient(0deg, rgba(7,95,152,.05) 0 1px, transparent 1px 66px) 30px 24px,
    repeating-linear-gradient(90deg, rgba(7,95,152,.05) 0 1px, transparent 1px 66px) 30px 24px,
    radial-gradient(60% 30% at 100% 100%, rgba(44,195,148,.14), transparent 70%),
    linear-gradient(180deg, #e7f5f8, #f4fbfa 60%, #e6f5ef); }
/* header band */
.head { position: relative; padding: 30px 40px 26px; color: #fff; display: grid; grid-template-columns: 1fr auto; gap: 20px; align-items: center;
  background: radial-gradient(70% 120% at 100% 0%, rgba(10,152,199,.55), transparent 70%), radial-gradient(60% 120% at 0% 100%, rgba(44,195,148,.3), transparent 70%), linear-gradient(160deg, #064c78, #04324f 60%, #022a43);
  border-radius: 0 0 36px 36px; box-shadow: 0 18px 40px rgba(4,50,79,.25); overflow: hidden; }
.head::before { content: ""; position: absolute; inset: 0; z-index: 0; opacity: .5;
  background: repeating-linear-gradient(0deg, rgba(167,213,219,.08) 0 1px, transparent 1px 44px), repeating-linear-gradient(90deg, rgba(167,213,219,.08) 0 1px, transparent 1px 44px); }
.head > * { position: relative; }
.brand { display: flex; align-items: center; gap: 10px; }
.brand img { width: 46px; height: 46px; }
.brand span { font-family: var(--ft); font-weight: 700; font-size: 13px; letter-spacing: .22em; color: var(--mint); }
.brand em { font-style: normal; display: block; font-size: 10px; letter-spacing: .16em; color: var(--mist); font-weight: 600; }
h1 { margin-top: 12px; font-family: var(--fd); font-weight: 800; font-size: 46px; line-height: 1.05; }
h1 span { background: linear-gradient(100deg, var(--mist), var(--mint)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.sub { margin-top: 8px; font-size: 15px; color: var(--mist); }
.qr { background: #fff; border-radius: 20px; padding: 10px; text-align: center; box-shadow: 0 12px 30px rgba(0,0,0,.3); }
.qr canvas { display: block; width: 122px; height: 122px; }
.qr b { display: block; margin-top: 6px; font-size: 11.5px; color: var(--navy); font-weight: 700; line-height: 1.25; }
/* steps */
.steps { list-style: none; display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 26px 40px 0; position: relative; }
.steps li { position: relative; }
.steps li + li::before { content: ""; position: absolute; left: -15px; top: 150px; width: 16px; height: 16px; z-index: 2;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232cc394' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 4l8 8-8 8'/%3E%3C/svg%3E") center/contain no-repeat; }
.phone { width: 100%; aspect-ratio: 390 / 664; padding: 6px; border-radius: 26px; background: linear-gradient(160deg, #0b3a5e, #021e30); box-shadow: 0 16px 34px rgba(4,50,79,.28); }
.phone img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; border-radius: 20px; }
.cap { margin-top: 12px; display: grid; grid-template-columns: 30px 1fr; column-gap: 8px; align-items: center; }
.cap i { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; font-style: normal; font-family: var(--ft); font-weight: 700; font-size: 15px; color: #fff; background: linear-gradient(135deg, var(--sea), var(--navy)); }
.steps li:nth-child(3) .cap i, .steps li:nth-child(4) .cap i { background: linear-gradient(135deg, var(--mint), var(--green)); }
.cap b { font-family: var(--fd); font-weight: 700; font-size: 17px; line-height: 1.2; }
.cap small { grid-column: 1 / -1; margin-top: 5px; font-size: 12.5px; line-height: 1.45; color: var(--muted); }
.cap small b { font-family: var(--fb); font-size: inherit; color: var(--ink); font-weight: 700; }
/* colour legend */
h2 { margin: 26px 40px 10px; font-family: var(--fd); font-weight: 700; font-size: 21px; color: var(--navy); display: flex; align-items: center; gap: 10px; }
h2::after { content: ""; flex: 1; height: 1px; background: rgba(7,95,152,.18); }
.legend { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 0 40px; }
.legend > div { border-radius: 18px; padding: 10px; background: #fff; border: 1px solid #dcecef; box-shadow: 0 8px 20px rgba(7,95,152,.08); }
.legend img { display: block; width: 100%; height: 46px; object-fit: cover; object-position: left center; border-radius: 12px; }
.legend b { display: block; margin-top: 8px; font-family: var(--fd); font-weight: 700; font-size: 16px; }
.legend small { display: block; font-size: 12.5px; color: var(--muted); line-height: 1.4; }
.legend .g b { color: var(--green); } .legend .o b { color: #a8620a; } .legend .r b { color: #b3232f; }
/* tips */
.tips { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0 40px; }
.tips li { display: flex; gap: 10px; align-items: flex-start; padding: 11px 12px; border-radius: 16px; background: rgba(255,255,255,.85); border: 1px solid #dcecef; }
.tips span { flex: none; width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, var(--sea), var(--navy)); }
.tips li:nth-child(2) span { background: linear-gradient(135deg, #f0a43a, #c9801a); }
.tips li:nth-child(3) span { background: linear-gradient(135deg, var(--mint), var(--green)); }
.tips li:nth-child(4) span { background: linear-gradient(135deg, var(--teal), var(--navy)); }
.tips svg { width: 18px; height: 18px; }
.tips b { display: block; font-size: 14px; font-weight: 700; line-height: 1.3; }
.tips small { display: block; font-size: 12px; color: var(--muted); line-height: 1.4; }
.foot { position: absolute; left: 40px; right: 40px; bottom: 22px; display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); font-weight: 600; }
.foot b { color: var(--navy); }
</style></head><body><div class="p">
  <header class="head">
    <div>
      <div class="brand"><img src="data:image/png;base64,${b64(PUB + '/assets/logo-mark.png')}" alt=""><span>TGGC 2026<em>STAFF GUIDE · จุดแลกของที่ระลึก</em></span></div>
      <h1>คู่มือเจ้าหน้าที่ <span>ใช้งาน 4 ขั้น</span></h1>
      <p class="sub">สแกนบัตรผู้เข้าร่วม → มอบของที่ระลึก · ระบบบันทึกเข้า Google Sheet ให้เอง</p>
    </div>
    <div class="qr"><canvas id="qr" width="400" height="400"></canvas><b>สแกนเปิด<br>หน้าเจ้าหน้าที่</b></div>
  </header>

  <ol class="steps">
    ${step(1, S.login, 'เข้าสู่ระบบ', 'สแกน QR มุมขวาบน ใส่<b>ชื่อของคุณ</b> + <b>PIN</b> แล้วกด “อนุญาต” ให้ใช้กล้อง')}
    ${step(2, S.scan, 'เล็ง QR บนบัตร', 'ให้ผู้เข้าร่วมเปิดบัตรในมือถือ เล็ง QR ให้อยู่ใน<b>กรอบสีเขียว</b>')}
    ${step(3, S.found, 'ตรวจชื่อ แล้วกดยืนยัน', 'ดูชื่อให้ตรงกับคนตรงหน้า กดปุ่มเขียว<b>“ยืนยันมอบของที่ระลึก”</b>')}
    ${step(4, S.ok, 'มอบของ · สแกนคนถัดไป', 'ขึ้น<b>“มอบได้เลย”</b> ส่งของให้ หน้าจอปิดเองใน 3 วิ พร้อมสแกนต่อ')}
  </ol>

  <h2>ดูสีให้เป็น</h2>
  <div class="legend">
    <div class="g"><img src="${S.okBar}" alt=""><b>เขียว · มอบได้</b><small>บันทึกแล้ว ส่งของให้ได้เลย</small></div>
    <div class="o"><img src="${S.warnBar}" alt=""><b>ส้ม · รับไปแล้ว</b><small>ห้ามมอบซ้ำ — ดูเวลาและชื่อผู้มอบบนจอ</small></div>
    <div class="r"><img src="${S.badBar}" alt=""><b>แดง · ไม่พบบัตร</b><small>ค้นด้วยเบอร์โทร / ชื่อ ในช่องค้นหาแทน</small></div>
  </div>

  <h2>รู้ไว้ช่วยได้</h2>
  <ul class="tips">
    <li><span>${ICON.bolt}</span><div><b>คนเยอะ? เปิด “มอบทันทีเมื่อสแกนเจอ”</b><small>สแกนปุ๊บบันทึกปั๊บ ไม่ต้องกดยืนยันทีละคน</small></div></li>
    <li><span>${ICON.undo}</span><div><b>กดผิด → “ยกเลิกการรับ”</b><small>ลิงก์สีแดงใต้ปุ่ม ระบบเอาเครื่องหมายออกจาก Sheet</small></div></li>
    <li><span>${ICON.search}</span><div><b>ไม่มีบัตร / ลบรูปไปแล้ว</b><small>พิมพ์เบอร์โทรหรือชื่อในช่องค้นหาใต้กล้อง</small></div></li>
    <li><span>${ICON.wifi}</span><div><b>ป้ายมุมขวา: ส้ม/แดง = รอส่ง</b><small>เน็ตหลุดไม่ต้องตกใจ สแกนต่อได้ ระบบส่งเข้า Sheet ให้เอง</small></div></li>
  </ul>

  <div class="foot"><span>อาคาร 100 ปี ชูชาติอนุสรณ์ ชั้น 1 · โรงเรียนชลประทานวิทยา · เสาร์ 28 พ.ย. 2569</span><b>มีปัญหา ติดต่อผู้ดูแลระบบ</b></div>
</div>
<script>${fs.readFileSync(PUB + '/vendor/qrcode.js', 'utf8')}</script>
<script>${fs.readFileSync(PUB + '/vendor/jsqr.min.js', 'utf8')}</script>
<script>
  var q = qrcode(0, 'M'); q.addData(${JSON.stringify(STAFF_URL)}); q.make();
  var n = q.getModuleCount(), c = document.getElementById('qr'), S = c.width, g = c.getContext('2d'), m = S / n;
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); g.fillStyle = '#04324f';
  for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(Math.floor(k * m), Math.floor(r * m), Math.ceil(m), Math.ceil(m));
  var hit = jsQR(g.getImageData(0, 0, S, S).data, S, S); window.__qr = hit ? hit.data : 'FAIL';
</script></body></html>`;
}

(async () => {
  const br = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const S = await screens(br);
  const f = path.join(__dirname, 'howto.html'); fs.writeFileSync(f, html(S));
  const pg = await br.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 3.125 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + f); await pg.waitForFunction(() => window.__qr); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(500);
  const over = await pg.evaluate(() => { const f = document.querySelector('.foot').getBoundingClientRect().top;
    return [...document.querySelectorAll('.tips, .legend, .steps')].filter(e => e.getBoundingClientRect().bottom > f - 6).map(e => e.className); });
  const png = path.join(OUT, 'คู่มือเจ้าหน้าที่.png');
  await pg.screenshot({ path: png });
  await pg.pdf({ path: png.replace('.png', '.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  console.log('qr', await pg.evaluate(() => window.__qr), 'overlap', JSON.stringify(over), 'errors', JSON.stringify(errs));
  fs.unlinkSync(f); await br.close(); srv.close();
})();
