/* TGGC 2569 registration app — no build step, plain JS. */
(function () {
  "use strict";

  var CFG = window.TGGC_CONFIG || {};
  var ENDPOINT = (CFG.ENDPOINT || "").trim();
  var EVENT_START = new Date(CFG.EVENT_START || "2026-11-28T08:00:00+07:00");
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var IS_IOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------- logo ----------------
     Vector redraw of the TGGC 2026 mark. Set TGGC_CONFIG.LOGO_URL to use the original image file instead. */
  var LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">' +
    '<defs>' +
    '<radialGradient id="lgG" cx="0.36" cy="0.3" r="0.85"><stop offset="0" stop-color="#46c6ea"/><stop offset="0.5" stop-color="#0a98c7"/><stop offset="1" stop-color="#075f98"/></radialGradient>' +
    '<linearGradient id="lgO" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#075f98"/><stop offset="1" stop-color="#0a98c7"/></linearGradient>' +
    '<linearGradient id="lgL" x1="0.1" y1="1" x2="0.9" y2="0"><stop offset="0" stop-color="#15a8a0"/><stop offset="0.55" stop-color="#2cc394"/><stop offset="1" stop-color="#5fdcae"/></linearGradient>' +
    '<radialGradient id="lgS" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#a7d5db" stop-opacity="0.9"/><stop offset="1" stop-color="#a7d5db" stop-opacity="0"/></radialGradient>' +
    '<clipPath id="lgC"><circle cx="68" cy="78" r="31"/></clipPath>' +
    '</defs>' +
    '<path d="M93 30 C 70 14, 26 26, 13 58 C 6 76, 14 92, 30 100" fill="none" stroke="url(#lgO)" stroke-width="3.2" stroke-linecap="round"/>' +
    '<circle cx="68" cy="78" r="31" fill="url(#lgG)"/>' +
    '<g clip-path="url(#lgC)" fill="none" stroke="#e8f7fb" stroke-width="1.7" opacity="0.95">' +
    '<ellipse cx="72" cy="78" rx="11" ry="33" transform="rotate(18 72 78)"/><ellipse cx="72" cy="78" rx="24" ry="33" transform="rotate(18 72 78)"/>' +
    '<path d="M34 66 Q 68 58 102 66 M34 80 Q 68 72 102 80 M36 94 Q 68 86 100 94"/></g>' +
    '<path d="M36 96 C 28 74, 46 62, 58 50 C 68 40, 70 28, 82 18 C 86 34, 82 48, 70 60 C 58 72, 44 78, 36 96 Z" fill="url(#lgL)"/>' +
    '<path d="M44 84 C 52 70, 64 60, 76 30" fill="none" stroke="#fcfdfd" stroke-width="2.2" stroke-linecap="round"/>' +
    '<circle cx="45" cy="34" r="15" fill="url(#lgS)"/>' +
    '<path d="M45 6 L48.2 29 L60 34 L48.2 38 L45 50 L41.8 38 L30 34 L41.8 29 Z" fill="#2cc394"/>' +
    '<path d="M22 106 C 52 122, 96 108, 112 72 C 116 62, 112 52, 104 46" fill="none" stroke="url(#lgO)" stroke-width="3.2" stroke-linecap="round"/>' +
    '</svg>';
  var LOGO_URL = (CFG.LOGO_URL || "").trim();
  var LOGO_SRC = LOGO_URL || "data:image/svg+xml;charset=utf-8," + encodeURIComponent(LOGO_SVG);
  function mountLogos() {
    $$("[data-logo]").forEach(function (el) {
      el.innerHTML = LOGO_URL ? '<img src="' + LOGO_URL + '" alt="">' : LOGO_SVG.replace(/id="lg(\w)"/g, function (m, k) { return 'id="lg' + k + el.dataset.uid + '"'; }).replace(/url\(#lg(\w)\)/g, function (m, k) { return "url(#lg" + k + el.dataset.uid + ")"; });
    });
  }
  var logoImg = null;
  function loadLogo() {
    if (logoImg) return Promise.resolve(logoImg);
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () { logoImg = im; res(im); };
      im.onerror = function () { res(null); };
      im.src = LOGO_SRC;
    });
  }

  /* ---------------- storage (never trusted to exist) ---------------- */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  var K_TICKETS = "tggc69.tickets";
  var K_QUEUE = "tggc69.queue";

  /* ---------------- toast ---------------- */
  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  /* ================================================================
     Topographic contours: value-noise field + marching squares.
     Every 5th line is drawn heavier, like index contours on a topo map.
     ================================================================ */
  function makeNoise(seed) {
    var s = seed >>> 0 || 1;
    function rnd() { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }
    var N = 64, g = new Float32Array(N * N);
    for (var i = 0; i < g.length; i++) g[i] = rnd();
    function at(x, y) { return g[((y & (N - 1)) * N) + (x & (N - 1))]; }
    function sm(t) { return t * t * (3 - 2 * t); }
    function v(x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      var a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      var u = sm(xf), w = sm(yf);
      return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
    }
    return function (x, y) { return v(x, y) * 0.6 + v(x * 2.1 + 17, y * 2.1 + 9) * 0.28 + v(x * 4.3 + 3, y * 4.3 + 41) * 0.12; };
  }

  function drawTopo(ctx, w, h, o) {
    o = o || {};
    var noise = makeNoise(o.seed || 7);
    var cell = o.cell || 10, scale = o.scale || 0.006, levels = o.levels || 14;
    var cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / cell) + 1;
    var f = new Float32Array(cols * rows), mn = 1e9, mx = -1e9;
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
      var px = x * cell, py = y * cell;
      var val = noise(px * scale + (o.ox || 0), py * scale + (o.oy || 0));
      if (o.bias) val += o.bias(px / w, py / h);
      f[y * cols + x] = val; if (val < mn) mn = val; if (val > mx) mx = val;
    }
    ctx.save();
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (var li = 0; li < levels; li++) {
      var t = mn + (mx - mn) * (li + 0.5) / levels;
      var isIndex = li % 5 === 0;
      ctx.beginPath();
      for (var yy = 0; yy < rows - 1; yy++) for (var xx = 0; xx < cols - 1; xx++) {
        var a = f[yy * cols + xx], b = f[yy * cols + xx + 1], c = f[(yy + 1) * cols + xx + 1], d = f[(yy + 1) * cols + xx];
        var k = (a > t ? 8 : 0) | (b > t ? 4 : 0) | (c > t ? 2 : 0) | (d > t ? 1 : 0);
        if (k === 0 || k === 15) continue;
        var x0 = xx * cell, y0 = yy * cell;
        var T = [x0 + cell * (t - a) / (b - a), y0];
        var R = [x0 + cell, y0 + cell * (t - b) / (c - b)];
        var B = [x0 + cell * (t - d) / (c - d), y0 + cell];
        var L = [x0, y0 + cell * (t - a) / (d - a)];
        var segs;
        switch (k) {
          case 1: case 14: segs = [L, B]; break;
          case 2: case 13: segs = [B, R]; break;
          case 3: case 12: segs = [L, R]; break;
          case 4: case 11: segs = [T, R]; break;
          case 6: case 9: segs = [T, B]; break;
          case 7: case 8: segs = [L, T]; break;
          case 5: segs = [L, T, B, R]; break;
          case 10: segs = [T, R, L, B]; break;
        }
        for (var s = 0; s < segs.length; s += 2) { ctx.moveTo(segs[s][0], segs[s][1]); ctx.lineTo(segs[s + 1][0], segs[s + 1][1]); }
      }
      var col = typeof o.color === "function" ? o.color(li / levels) : (o.color || "rgba(255,255,255,0.3)");
      ctx.strokeStyle = col;
      ctx.globalAlpha = isIndex ? 1 : (o.minorAlpha || 0.55);
      ctx.lineWidth = (o.lineWidth || 1) * (isIndex ? 1.9 : 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function paintCanvas(cv, opts) {
    var r = cv.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width === w && cv.height === h && cv.dataset.done) return;
    cv.width = w; cv.height = h; cv.dataset.done = "1";
    var ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    opts.cell = Math.round((opts.cell || 9) * dpr);
    opts.scale = (opts.scale || 0.006) / dpr;
    opts.lineWidth = (opts.lineWidth || 1) * dpr;
    drawTopo(ctx, w, h, opts);
  }

  function paintBackgrounds() {
    var hero = $("#topo");
    if (hero) paintCanvas(hero, {
      seed: 1969, levels: 16, scale: 0.0045, minorAlpha: 0.5,
      color: function (p) { return p < 0.5 ? "rgba(10,152,199,0.20)" : "rgba(44,195,148,0.26)"; },
      bias: function (x, y) { return -0.3 * ((x - 0.15) * (x - 0.15) + (y - 0.85) * (y - 0.85)); },
    });
    var bg = $("#bgTopo");
    if (bg) paintCanvas(bg, { seed: 77, levels: 14, scale: 0.0028, cell: 12, minorAlpha: 0.5, color: "rgba(7,95,152,0.07)" });
    $$("canvas[data-topo]").forEach(function (cv) {
      paintCanvas(cv, { seed: 300 + Number(cv.dataset.topo) * 37, levels: 12, scale: 0.012, cell: 6, minorAlpha: 0.6, color: "rgba(255,255,255,0.32)" });
    });
  }

  /* ---------------- countdown ---------------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function tickCountdown() {
    var now = new Date();
    var diff = EVENT_START - now;
    var grid = $("#cdGrid"), lab = $("#cdLabel");
    if (diff > 0) {
      var s = Math.floor(diff / 1000);
      $("#cdD").textContent = Math.floor(s / 86400);
      $("#cdH").textContent = pad(Math.floor(s % 86400 / 3600));
      $("#cdM").textContent = pad(Math.floor(s % 3600 / 60));
      $("#cdS").textContent = pad(s % 60);
    } else {
      var endOfDay = new Date(EVENT_START.getTime()); endOfDay.setHours(23, 59, 59);
      grid.innerHTML = "";
      var msg = document.createElement("div");
      msg.className = "cd-cell"; msg.style.gridColumn = "1 / -1";
      msg.innerHTML = now <= endOfDay
        ? '<div class="cd-num" style="font-family:var(--f-display);font-size:24px;color:var(--mint)">วันนี้คือวันงาน!</div><div class="cd-lab">แสดงบัตรเพื่อแลกของที่ระลึก ณ อาคาร 100 ปี ชูชาติอนุสรณ์ ชั้น 1</div>'
        : '<div class="cd-num" style="font-family:var(--f-display);font-size:22px">ขอบคุณที่ร่วมงาน</div><div class="cd-lab">พบกันใหม่ในการแข่งขันครั้งต่อไป</div>';
      grid.appendChild(msg);
      lab.textContent = "เสาร์ 28 พ.ย. 2569";
      return false;
    }
    return true;
  }

  /* ---------------- provinces ---------------- */
  var PROVINCES = ["กรุงเทพมหานคร", "กระบี่", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", "จันทบุรี", "ฉะเชิงเทรา", "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร", "เชียงราย", "เชียงใหม่", "ตรัง", "ตราด", "ตาก", "นครนายก", "นครปฐม", "นครพนม", "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส", "น่าน", "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี", "ปัตตานี", "พระนครศรีอยุธยา", "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์", "แพร่", "ภูเก็ต", "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน", "ยโสธร", "ยะลา", "ร้อยเอ็ด", "ระนอง", "ระยอง", "ราชบุรี", "ลพบุรี", "ลำปาง", "ลำพูน", "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ", "สมุทรสงคราม", "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี", "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์", "อุทัยธานี", "อุบลราชธานี"];
  function fillProvinces() {
    var sel = $("#province");
    var near = document.createElement("optgroup"); near.label = "ใกล้สนามแข่งขัน";
    ["นนทบุรี", "กรุงเทพมหานคร", "ปทุมธานี"].forEach(function (p) { near.appendChild(new Option(p, p)); });
    var all = document.createElement("optgroup"); all.label = "ทุกจังหวัด (77)";
    PROVINCES.forEach(function (p) { all.appendChild(new Option(p, p)); });
    sel.appendChild(near); sel.appendChild(all);
  }

  /* ================================================================
     Form
     ================================================================ */
  var form = $("#regForm");
  var FIELDS = ["prefix", "first", "last", "position", "phone", "school", "province", "affiliation"];
  var touched = {};
  var editingId = null;

  function digits(s) { return String(s || "").replace(/\D/g, ""); }
  function formatPhone(raw) {
    var d = digits(raw).slice(0, 10);
    if (d.indexOf("02") === 0) {
      if (d.length > 5) return d.slice(0, 2) + "-" + d.slice(2, 5) + "-" + d.slice(5, 9);
      if (d.length > 2) return d.slice(0, 2) + "-" + d.slice(2);
      return d;
    }
    if (d.length > 6) return d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6);
    if (d.length > 3) return d.slice(0, 3) + "-" + d.slice(3);
    return d;
  }
  function clean(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  function readForm() {
    var pr = form.querySelector('input[name="prefix"]:checked');
    var prefix = pr ? (pr.value === "__other" ? clean($("#prefixOther").value) : pr.value) : "";
    return {
      prefix: prefix,
      first: clean($("#first").value),
      last: clean($("#last").value),
      position: clean($("#position").value),
      phone: digits($("#phone").value),
      school: clean($("#school").value),
      province: $("#province").value,
      affiliation: clean($("#affiliation").value),
      consent: $("#consent").checked,
    };
  }
  function validField(k, d) {
    if (k === "phone") return /^0\d{8,9}$/.test(d.phone);
    return !!d[k];
  }
  function fieldEl(k) { return form.querySelector('.field[data-key="' + k + '"]'); }

  var STEPS = { 1: ["prefix", "first", "last", "position", "phone"], 2: ["school", "province", "affiliation"] };
  var step = 1;
  var attemptedStep = {};
  function stepOf(k) { return STEPS[1].indexOf(k) >= 0 ? 1 : 2; }

  function refresh() {
    var d = readForm(), done = 0;
    FIELDS.forEach(function (k) {
      var ok = validField(k, d);
      if (ok) done++;
      var el = fieldEl(k);
      el.classList.toggle("ok", ok);
      el.classList.toggle("bad", !ok && !!(touched[k] || attemptedStep[stepOf(k)]));
    });
    $("#consentBox").classList.toggle("bad", !!attemptedStep[3] && !d.consent);
    var stepOk = step === 3 ? d.consent && done === FIELDS.length : STEPS[step].every(function (k) { return validField(k, d); });
    var left = step === 3 ? 0 : STEPS[step].filter(function (k) { return !validField(k, d); }).length;
    $("#nextTxt").textContent = step === 3
      ? (editingId ? "บันทึกและออกบัตรใหม่" : "ยืนยันและออกบัตร")
      : (left ? "ถัดไป · เหลืออีก " + left + " ช่อง" : "ถัดไป");
    $("#nextBtn").dataset.ready = stepOk ? "1" : "0";
    return { data: d, done: done, stepOk: stepOk };
  }

  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function buildReview() {
    var d = readForm();
    $("#review").innerHTML =
      '<div class="rv-top"><span>ATTENDEE · ผู้เข้าร่วมงาน</span><span>TGGC 2026</span></div>' +
      '<div class="rv-name"><span>' + esc(d.prefix + d.first) + '</span> <span>' + esc(d.last) + '</span></div>' +
      '<span class="rv-pos">' + esc(d.position) + '</span>' +
      '<dl class="rv-rows">' +
      '<div class="full"><dt>โรงเรียน</dt><dd>' + esc(schoolName(d.school)) + '</dd></div>' +
      '<div><dt>จังหวัด</dt><dd>' + esc(d.province) + '</dd></div>' +
      '<div><dt>สังกัด</dt><dd>' + esc(d.affiliation) + '</dd></div>' +
      '<div class="full"><dt>เบอร์โทร (บนบัตรแสดงแค่ 4 ตัวท้าย)</dt><dd>' + esc(formatPhone(d.phone)) + '</dd></div>' +
      '</dl>' +
      '<div class="rv-edit"><button type="button" data-step="1">แก้ไขข้อมูลผู้เข้าร่วม</button><button type="button" data-step="2">แก้ไขหน่วยงาน</button></div>';
  }

  var STEP_NAMES = { 1: "ข้อมูลผู้เข้าร่วม", 2: "หน่วยงาน", 3: "ตรวจสอบและยืนยัน" };
  function goStep(n, instant) {
    var back = n < step;
    step = n;
    $$(".step", form).forEach(function (fs) {
      var on = Number(fs.dataset.step) === n;
      fs.hidden = !on;
      if (on && !instant) { fs.classList.toggle("back", back); fs.style.animation = "none"; void fs.offsetWidth; fs.style.animation = ""; }
    });
    $$("#stepper li").forEach(function (li) {
      var k = Number(li.dataset.s);
      li.classList.toggle("on", k === n);
      li.classList.toggle("done", k < n);
    });
    $("#stepTxt").textContent = "ขั้นที่ " + n + " จาก 3 · " + STEP_NAMES[n];
    $("#prevBtn").hidden = n === 1;
    if (n === 3) buildReview();
    $("#formError").hidden = true;
    refresh();
    if (!instant) window.scrollTo({ top: 0, behavior: "auto" });
  }

  function nextStep() {
    var st = refresh();
    if ($("#website").value) return; // bot
    if (!st.stepOk) {
      attemptedStep[step] = true; refresh();
      if (step === 3) {
        var missing = FIELDS.filter(function (k) { return !validField(k, st.data); })[0];
        if (missing) { attemptedStep[stepOf(missing)] = true; goStep(stepOf(missing)); return; }
        scrollToEl($("#consentBox"));
      } else {
        var firstBad = STEPS[step].filter(function (k) { return !validField(k, st.data); })[0];
        var target = fieldEl(firstBad);
        scrollToEl(target);
        if (firstBad !== "prefix" && firstBad !== "province") { var inp = target.querySelector(".input"); if (inp) setTimeout(function () { inp.focus({ preventScroll: true }); }, 300); }
      }
      if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
      return;
    }
    if (step < 3) { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); goStep(step + 1); }
    else issue(st.data);
  }
  function prevStep() { if (step > 1) goStep(step - 1); else go("home"); }

  function bindForm() {
    // prefix chips
    $$('input[name="prefix"]').forEach(function (r) {
      r.addEventListener("change", function () {
        var other = $("#prefixOther");
        other.hidden = r.value !== "__other" || !r.checked;
        if (!other.hidden) other.focus();
        touched.prefix = true; refresh();
      });
    });
    $("#prefixOther").addEventListener("input", refresh);

    // quick-fill chips
    $$("[data-fill]").forEach(function (wrap) {
      var target = $("#" + wrap.dataset.fill);
      wrap.addEventListener("click", function (e) {
        var b = e.target.closest(".chip-btn");
        if (!b) return;
        target.value = b.textContent.trim();
        touched[wrap.dataset.fill] = true;
        refresh();
        if (navigator.vibrate) navigator.vibrate(8);
      });
    });

    var phone = $("#phone");
    phone.addEventListener("input", function () {
      var pos = phone.value.length;
      phone.value = formatPhone(phone.value);
      if (pos === phone.value.length) { try { phone.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
      refresh();
    });

    $("#province").addEventListener("change", function () {
      var p = $("#province").value;
      var sug = $("#affSuggest");
      sug.textContent = p === "กรุงเทพมหานคร" ? "สพม.กรุงเทพมหานคร เขต 1" : "สพม." + p;
      touched.province = true; refresh();
    });

    ["first", "last", "position", "school", "affiliation"].forEach(function (k) {
      $("#" + k).addEventListener("input", refresh);
    });
    FIELDS.forEach(function (k) {
      var el = fieldEl(k);
      el.addEventListener("focusout", function () { touched[k] = true; setTimeout(refresh, 0); });
    });
    $("#consent").addEventListener("change", refresh);

    // Enter = next field within the step; last field blurs (mobile keyboards)
    [["first", "last", "position", "phone"], ["school", "province", "affiliation"]].forEach(function (order) {
      order.forEach(function (id, i) {
        $("#" + id).addEventListener("keydown", function (e) {
          if (e.key !== "Enter") return;
          e.preventDefault();
          var nx = order[i + 1];
          if (nx) $("#" + nx).focus(); else e.target.blur();
        });
      });
    });

    form.addEventListener("submit", function (e) { e.preventDefault(); nextStep(); });
    $("#nextBtn").addEventListener("click", nextStep);
    $("#prevBtn").addEventListener("click", prevStep);
    $("#regBack").addEventListener("click", prevStep);
    $("#review").addEventListener("click", function (e) {
      var b = e.target.closest("[data-step]");
      if (b) goStep(Number(b.dataset.step));
    });
  }

  function resetForm() {
    form.reset();
    $("#prefixOther").hidden = true;
    $("#affSuggest").textContent = "สพม.นนทบุรี";
    touched = {}; attemptedStep = {}; editingId = null; step = 1;
    $("#formError").hidden = true;
    refresh();
  }

  function fillForm(t) {
    resetForm();
    var std = ["นาย", "นาง", "นางสาว", "ดร."];
    var radio = form.querySelector('input[name="prefix"][value="' + (std.indexOf(t.prefix) >= 0 ? t.prefix : "__other") + '"]');
    if (radio) radio.checked = true;
    if (std.indexOf(t.prefix) < 0) { $("#prefixOther").hidden = false; $("#prefixOther").value = t.prefix; }
    $("#first").value = t.first; $("#last").value = t.last;
    $("#position").value = t.position; $("#phone").value = formatPhone(t.phone);
    $("#school").value = t.school; $("#province").value = t.province;
    $("#affiliation").value = t.affiliation;
    $("#consent").checked = true;
    editingId = t.id;
    refresh();
  }

  /* ---------------- ids ---------------- */
  var ALPHA = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  function genId() {
    var out = "", buf = new Uint8Array(5);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (var i = 0; i < 5; i++) out += ALPHA[buf[i] % 32];
    return "TG-" + out;
  }

  /* ---------------- network ---------------- */
  function post(payload) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (r) { return r.json(); }).finally(function () { clearTimeout(timer); });
  }

  function send(payload) {
    if (!ENDPOINT) return Promise.resolve({ state: "demo" });
    return post(payload).then(function (j) {
      if (j && j.ok) return { state: "ok", id: j.id, no: j.no, updated: j.updated };
      return { state: "error", message: (j && j.error) || "ระบบไม่สามารถบันทึกข้อมูลได้" };
    }, function () {
      var q = store.get(K_QUEUE, []);
      q = q.filter(function (p) { return p.id !== payload.id; });
      q.push(payload); store.set(K_QUEUE, q);
      return { state: "queued" };
    });
  }

  var flushing = false;
  function flushQueue() {
    if (!ENDPOINT || flushing) return;
    var q = store.get(K_QUEUE, []);
    if (!q.length) return;
    flushing = true;
    var p = q[0];
    post(p).then(function (j) {
      store.set(K_QUEUE, store.get(K_QUEUE, []).filter(function (x) { return x.id !== p.id; }));
      if (j && j.ok) {
        updateTicket(p.id, { sync: "ok", id: j.id, no: j.no });
        toast("ส่งข้อมูลเข้าระบบเรียบร้อยแล้ว");
      }
      flushing = false; flushQueue();
    }, function () { flushing = false; });
  }

  /* ---------------- tickets in this browser ---------------- */
  function tickets() { return store.get(K_TICKETS, []); }
  function saveTicketRecord(t) {
    var list = tickets().filter(function (x) { return x.id !== t.id && x.phone !== t.phone; });
    list.unshift(t); store.set(K_TICKETS, list.slice(0, 20));
  }
  function updateTicket(oldId, patch) {
    var list = tickets();
    list.forEach(function (t) { if (t.id === oldId) Object.assign(t, patch); });
    store.set(K_TICKETS, list);
    if (current && current.id === oldId) { Object.assign(current, patch); if (view === "ticket") showTicket(current, false); }
  }

  /* ---------------- submit ---------------- */
  function scrollToEl(el) {
    var y = el.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top: y, behavior: REDUCED ? "auto" : "smooth" });
  }

  function issue(d) {
    var payload = {
      id: editingId || genId(),
      prefix: d.prefix, first: d.first, last: d.last, position: d.position,
      school: d.school, province: d.province, affiliation: d.affiliation, phone: d.phone,
      clientTime: new Date().toISOString(),
    };
    var btn = $("#nextBtn");
    btn.classList.add("loading");
    $("#nextTxt").textContent = "กำลังออกบัตร…";
    var spin = document.createElement("span"); spin.className = "spin"; btn.insertBefore(spin, btn.firstChild);
    $("#formError").hidden = true;

    send(payload).then(function (res) {
      btn.classList.remove("loading"); spin.remove();
      if (res.state === "error") {
        var fe = $("#formError"); fe.textContent = res.message + " กรุณาลองอีกครั้ง"; fe.hidden = false;
        refresh(); scrollToEl(fe); return;
      }
      var t = Object.assign({}, payload, {
        id: res.id || payload.id,
        no: res.no || null,
        createdAt: payload.clientTime,
        sync: res.state, // ok | queued | demo
      });
      saveTicketRecord(t);
      var wasEdit = !!editingId;
      resetForm();
      current = t; celebrateNext = !wasEdit;
      location.replace("#ticket");
      if (res.updated) toast("อัปเดตข้อมูลบัตรเดิมเรียบร้อย");
    });
  }

  /* ================================================================
     Ticket image (canvas → PNG). What you see is what you save.
     ================================================================ */
  var W = 1080, H = 1920;
  var segmenter = (typeof Intl !== "undefined" && Intl.Segmenter) ? new Intl.Segmenter("th", { granularity: "word" }) : null;
  function segs(text) {
    if (segmenter) return Array.from(segmenter.segment(text), function (s) { return s.segment; });
    return text.match(/[\s\S][ัิ-ฺ็-๎]*/g) || [];
  }
  function font(ctx, weight, size, fam) { ctx.font = weight + " " + size + "px " + fam; }
  var F_DISPLAY = '"Kanit", "Noto Sans Thai", Tahoma, sans-serif';
  var F_BODY = '"IBM Plex Sans Thai", "Noto Sans Thai", Tahoma, sans-serif';
  var F_MONO = '"Chakra Petch", "Kanit", Menlo, monospace';

  function wrap(ctx, text, maxW) {
    var lines = [], line = "";
    segs(text).forEach(function (sg) {
      var test = line + sg;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line.trim()); line = sg.replace(/^\s+/, ""); }
      else line = test;
    });
    if (line.trim()) lines.push(line.trim());
    return lines;
  }
  function fit(ctx, text, maxW, maxLines, size, min, weight, fam) {
    var lines;
    for (var s = size; s >= min; s -= 2) {
      font(ctx, weight, s, fam); lines = wrap(ctx, text, maxW);
      if (lines.length <= maxLines) return { size: s, lines: lines };
    }
    font(ctx, weight, min, fam); lines = wrap(ctx, text, maxW);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines - 1];
      while (last.length > 1 && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
      lines[maxLines - 1] = last + "…";
    }
    return { size: min, lines: lines };
  }
  // draw explicit lines, shrinking the whole block until the widest line fits
  function fitBlock(ctx, lines, maxW, size, min, weight, fam) {
    for (var s2 = size; s2 > min; s2 -= 2) {
      font(ctx, weight, s2, fam);
      if (lines.every(function (l) { return ctx.measureText(l).width <= maxW; })) return s2;
    }
    return min;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function schoolName(s) { return /^โรงเรียน/.test(s) ? s : "โรงเรียน" + s; }
  function maskPhone(p) { var d = digits(p); return "•••-•••-" + d.slice(-4); }
  function thDate(iso) {
    try {
      return new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) + " น.";
    } catch (e) { return ""; }
  }

  function loadFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var sample = "กขคงบัตรผู้เข้าร่วมงานTGGC0123";
    var all = Promise.all([
      document.fonts.load("800 80px Kanit", sample), document.fonts.load("700 60px Kanit", sample),
      document.fonts.load("600 40px Kanit", sample), document.fonts.load("500 30px Kanit", sample),
      document.fonts.load('400 30px "IBM Plex Sans Thai"', sample), document.fonts.load('600 30px "IBM Plex Sans Thai"', sample),
      document.fonts.load('700 60px "Chakra Petch"', "TG-0123"), document.fonts.load('600 30px "Chakra Petch"', "ATTENDEE"),
    ]).catch(function () {});
    return Promise.race([all, new Promise(function (r) { setTimeout(r, 2500); })]);
  }

  /* ---- security-print motifs (banknote / certificate style) ---- */
  function guilloche(c, cx, cy, R, amp, k, copies, color, lw) {
    c.save(); c.strokeStyle = color; c.lineWidth = lw;
    for (var j = 0; j < copies; j++) {
      var ph = j * (Math.PI * 2 / k) / copies;
      c.beginPath();
      for (var i = 0; i <= 900; i++) {
        var a = i / 900 * Math.PI * 2;
        var r = R + amp * Math.sin(k * (a + ph)) + amp * 0.35 * Math.sin(3 * k * (a - ph));
        var x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
    }
    c.restore();
  }
  function waveBand(c, x0, x1, y, n, gap, amp, freq, color, lw) {
    c.save(); c.strokeStyle = color; c.lineWidth = lw;
    for (var i = 0; i < n; i++) {
      c.beginPath();
      for (var x = x0; x <= x1; x += 6) {
        var yy = y + i * gap + amp * Math.sin(x * freq + i * 0.42) * Math.sin(x * freq * 0.23 + 1.3);
        if (x === x0) c.moveTo(x, yy); else c.lineTo(x, yy);
      }
      c.stroke();
    }
    c.restore();
  }
  function microText(c, text, x, y, w, size, color) {
    c.save();
    c.beginPath(); c.rect(x, y - size, w, size * 1.6); c.clip();
    font(c, 600, size, F_MONO); c.fillStyle = color;
    var unit = text, line = "";
    while (c.measureText(line).width < w) line += unit;
    c.fillText(line, x, y);
    c.restore();
  }
  function ringText(c, text, cx, cy, r, size, color) {
    c.save(); font(c, 700, size, F_MONO); c.fillStyle = color; c.textAlign = "center";
    var n = text.length;
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + i / n * Math.PI * 2;
      c.save(); c.translate(cx + r * Math.cos(a), cy + r * Math.sin(a)); c.rotate(a + Math.PI / 2);
      c.fillText(text[i], 0, 0); c.restore();
    }
    c.restore();
  }
  function holoSeal(c, cx, cy, R) {
    c.save();
    var foil = c.createConicGradient ? c.createConicGradient(0.4, cx, cy) : c.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    ["#a7d5db", "#ffffff", "#2cc394", "#0a98c7", "#e9fbff", "#5ba1a5", "#2cc394", "#ffffff", "#a7d5db"].forEach(function (col, i, arr) { foil.addColorStop(i / (arr.length - 1), col); });
    // scalloped rosette edge
    c.beginPath();
    for (var i = 0; i <= 120; i++) {
      var a = i / 120 * Math.PI * 2, rr2 = i % 2 ? R * 0.935 : R;
      var x = cx + rr2 * Math.cos(a), y = cy + rr2 * Math.sin(a);
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath();
    c.shadowColor = "rgba(0,0,0,0.35)"; c.shadowBlur = 18; c.shadowOffsetY = 6;
    c.fillStyle = foil; c.fill();
    c.shadowColor = "transparent";
    // inner disc
    var disc = c.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 4, cx, cy, R * 0.82);
    disc.addColorStop(0, "#0d8ec4"); disc.addColorStop(1, "#043a5e");
    c.beginPath(); c.arc(cx, cy, R * 0.8, 0, Math.PI * 2); c.fillStyle = disc; c.fill();
    c.lineWidth = 2.5; c.strokeStyle = "rgba(233,251,255,0.9)"; c.stroke();
    // engraved rays
    c.save(); c.beginPath(); c.arc(cx, cy, R * 0.55, 0, Math.PI * 2); c.clip();
    c.strokeStyle = "rgba(167,213,219,0.16)"; c.lineWidth = 1;
    for (var k = 0; k < 72; k++) { var b = k / 72 * Math.PI * 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + R * Math.cos(b), cy + R * Math.sin(b)); c.stroke(); }
    c.restore();
    c.beginPath(); c.arc(cx, cy, R * 0.56, 0, Math.PI * 2); c.lineWidth = 1.5; c.strokeStyle = "rgba(167,213,219,0.7)"; c.stroke();
    ringText(c, "OFFICIAL PASS ★ TGGC 2026 ★ ", cx, cy + R * 0.04, R * 0.67, Math.round(R * 0.13), "#e9fbff");
    // centre
    c.textAlign = "center";
    font(c, 600, Math.round(R * 0.15), F_DISPLAY); c.fillStyle = "#a7d5db"; c.fillText("ครั้งที่", cx, cy - R * 0.17);
    font(c, 700, Math.round(R * 0.5), F_MONO); c.fillStyle = "#ffffff"; c.fillText("3", cx, cy + R * 0.3);
    // gloss
    var gl = c.createLinearGradient(cx - R, cy - R, cx + R * 0.2, cy + R * 0.2);
    gl.addColorStop(0, "rgba(255,255,255,0.45)"); gl.addColorStop(0.5, "rgba(255,255,255,0)");
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fillStyle = gl; c.fill();
    c.restore();
  }

  /* ---- 24 designs: 6 colour themes × 4 GIS patterns, picked from the ticket id ---- */
  var THEMES = [
    { key: "OCEAN", th: "มหาสมุทร", bg: ["#0a7fb5", "#075f98", "#032d4b"], glowA: "44,195,148", glowB: "10,152,199", line: "167,213,219", line2: "44,195,148",
      fg: "#ffffff", soft: "rgba(220,240,244,0.9)", label: "rgba(167,213,219,0.92)", accent: "#2cc394", pill: ["#2cc394", "#148e64"], band: ["#2cc394", "#15a8a0", "#0a98c7"], bandText: "#ffffff", stub: "#064c78", stubText: "#a7d5db" },
    { key: "EMERALD", th: "มรกต", bg: ["#1aa67d", "#0f6e55", "#053528"], glowA: "167,213,219", glowB: "44,195,148", line: "200,240,226", line2: "167,213,219",
      fg: "#ffffff", soft: "rgba(225,245,238,0.9)", label: "rgba(200,240,226,0.9)", accent: "#a7d5db", pill: ["#0a98c7", "#075f98"], band: ["#fcfdfd", "#a7d5db"], bandText: "#0b5a42", stub: "#0b5040", stubText: "#c8efe3" },
    { key: "LAGOON", th: "ลากูน", bg: ["#1bb5a8", "#0a8aa8", "#065a80"], glowA: "252,253,253", glowB: "44,195,148", line: "233,251,255", line2: "167,213,219",
      fg: "#ffffff", soft: "rgba(236,250,252,0.92)", label: "rgba(225,247,250,0.9)", accent: "#e3fbf3", pill: ["#075f98", "#043a5e"], band: ["#075f98", "#0a98c7"], bandText: "#ffffff", stub: "#08617e", stubText: "#e3fbf3" },
    { key: "MIDNIGHT", th: "ราตรี", bg: ["#0b3a5e", "#052640", "#021627"], glowA: "44,195,148", glowB: "10,152,199", line: "167,213,219", line2: "44,195,148",
      fg: "#ffffff", soft: "rgba(214,236,242,0.88)", label: "rgba(167,213,219,0.88)", accent: "#2cc394", pill: ["#0a98c7", "#075f98"], band: ["#2cc394", "#0a98c7"], bandText: "#ffffff", stub: "#06304d", stubText: "#a7d5db" },
    { key: "PEARL", th: "ไข่มุก", light: true, bg: ["#ffffff", "#eef8f9", "#cfe8ec"], glowA: "44,195,148", glowB: "10,152,199", line: "7,95,152", line2: "20,142,100",
      fg: "#063f66", soft: "#2d6b80", label: "#4f8f94", accent: "#148e64", pill: ["#075f98", "#0a98c7"], band: ["#075f98", "#0a98c7", "#15a8a0"], bandText: "#ffffff", stub: "#e2f2f4", stubText: "#075f98", ground: ["#0a6c9e", "#043a5e"] },
    { key: "SEAGLASS", th: "แก้วทะเล", bg: ["#6fb3b6", "#3a8c98", "#11506a"], glowA: "252,253,253", glowB: "44,195,148", line: "233,251,255", line2: "167,213,219",
      fg: "#ffffff", soft: "rgba(236,250,252,0.92)", label: "rgba(225,247,250,0.9)", accent: "#d6f7ec", pill: ["#2cc394", "#148e64"], band: ["#fcfdfd", "#a7d5db"], bandText: "#11506a", stub: "#1f6577", stubText: "#e3fbf3" },
  ];
  var MOTIFS = [
    { key: "CONTOUR", th: "เส้นชั้นความสูง" },
    { key: "GRATICULE", th: "เส้นกริดโลก" },
    { key: "HEXBIN", th: "หกเหลี่ยม GIS" },
    { key: "RASTER", th: "ภาพราสเตอร์" },
  ];
  function hashStr(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function designOf(t, force) {
    var h = hashStr(String(t.id || ""));
    var ti = force ? force[0] : h % THEMES.length, mi = force ? force[1] : (h >>> 8) % MOTIFS.length;
    return { T: THEMES[ti], M: MOTIFS[mi], n: ti * MOTIFS.length + mi + 1, seed: (h >>> 3) || 7 };
  }
  function rgba(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }

  function motifGraticule(c, T, seed) {
    var cx = W - 120 - (seed % 140), cy = 800 + (seed % 220), R = 440, la = T.light ? 0.16 : 0.24;
    c.save(); c.translate(cx, cy); c.rotate(-0.35 - (seed % 7) * 0.04);
    c.strokeStyle = rgba(T.line, la); c.lineWidth = 1.6;
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.stroke();
    for (var k = 1; k < 6; k++) { var rx = R * Math.sin(k * Math.PI / 12); c.beginPath(); c.ellipse(0, 0, rx, R, 0, 0, Math.PI * 2); c.stroke(); }
    c.beginPath(); c.moveTo(0, -R); c.lineTo(0, R); c.stroke();
    for (var lat = -75; lat <= 75; lat += 15) {
      var y = R * Math.sin(lat * Math.PI / 180), hw = R * Math.cos(lat * Math.PI / 180);
      c.beginPath(); c.ellipse(0, y, hw, hw * 0.16, 0, 0, Math.PI); c.stroke();
    }
    c.strokeStyle = rgba(T.line2, la + 0.08); c.lineWidth = 2.4;
    c.beginPath(); c.ellipse(0, 0, R * 1.3, R * 0.32, 0.35, 0, Math.PI * 2); c.stroke();
    c.restore();
    drawTopo(c, W, H, { seed: seed, levels: 10, cell: 14, scale: 0.0026, minorAlpha: 0.5, lineWidth: 1.2, color: rgba(T.line, T.light ? 0.06 : 0.09) });
  }
  function motifHex(c, T, seed) {
    var nz = makeNoise(seed), sz = 30, hstep = sz * 1.5, vstep = Math.sqrt(3) * sz;
    c.save(); c.lineWidth = 1.2;
    for (var col = 0; col * hstep < W + sz; col++) {
      for (var row = 0; row * vstep < H + sz; row++) {
        var cx = col * hstep, cy = row * vstep + (col % 2 ? vstep / 2 : 0);
        var v = nz(cx * 0.0035, cy * 0.0035);
        c.beginPath();
        for (var k = 0; k < 6; k++) { var a = k * Math.PI / 3; var x = cx + (sz - 2) * Math.cos(a), y = cy + (sz - 2) * Math.sin(a); if (k) c.lineTo(x, y); else c.moveTo(x, y); }
        c.closePath();
        if (v > 0.56) { c.fillStyle = rgba(T.line2, Math.min(0.3, (v - 0.56) * (T.light ? 0.9 : 1.3))); c.fill(); }
        c.strokeStyle = rgba(T.line, T.light ? 0.09 : 0.13); c.stroke();
      }
    }
    c.restore();
  }
  function motifRaster(c, T, seed) {
    var nz = makeNoise(seed), st = 20;
    c.save(); c.fillStyle = rgba(T.line, T.light ? 0.16 : 0.22);
    for (var y = st / 2; y < H; y += st) for (var x = st / 2; x < W; x += st) {
      var v = nz(x * 0.003, y * 0.003), r = 0.6 + 7.4 * Math.pow(Math.max(0, v - 0.25) / 0.75, 1.8);
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  function renderTicket(t, opt) {
    opt = opt || {};
    var D = designOf(t, opt.design), T = D.T, seed = D.seed;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d");

    // page ground
    var gr = T.ground || ["#e6f4f6", "#a7d5db"];
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, gr[0]); g.addColorStop(1, gr[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // card on its own layer so the perforation notches can be punched through
    var M = 56, CW = W - M * 2, CH = H - M * 2, PERF = 1240;
    var card = document.createElement("canvas"); card.width = W; card.height = H;
    var c = card.getContext("2d");
    rr(c, M, M, CW, CH, 56); c.save(); c.clip();
    var cg = c.createLinearGradient(0, M, 0, H - M);
    cg.addColorStop(0, T.bg[0]); cg.addColorStop(0.42, T.bg[1]); cg.addColorStop(1, T.bg[2]);
    c.fillStyle = cg; c.fillRect(0, 0, W, H);
    var glow = c.createRadialGradient(W * 0.9, 240, 10, W * 0.9, 240, 620);
    glow.addColorStop(0, rgba(T.glowA, T.light ? 0.22 : 0.42)); glow.addColorStop(1, rgba(T.glowA, 0));
    c.fillStyle = glow; c.fillRect(0, 0, W, H);
    var glow2 = c.createRadialGradient(120, PERF + 300, 10, 120, PERF + 300, 640);
    glow2.addColorStop(0, rgba(T.glowB, T.light ? 0.2 : 0.4)); glow2.addColorStop(1, rgba(T.glowB, 0));
    c.fillStyle = glow2; c.fillRect(0, 0, W, H);

    // the GIS pattern — its geometry comes from the ticket id, so no two tickets match
    var la = T.light ? 0.13 : 0.17;
    if (D.M.key === "CONTOUR") drawTopo(c, W, H, { seed: seed, levels: 22, cell: 12, scale: 0.0032, minorAlpha: 0.5, lineWidth: 1.4, color: function (q) { return q < 0.5 ? rgba(T.line, la) : rgba(T.line2, la + 0.04); } });
    else if (D.M.key === "GRATICULE") motifGraticule(c, T, seed);
    else if (D.M.key === "HEXBIN") motifHex(c, T, seed);
    else motifRaster(c, T, seed);

    // guilloche rosette with the logo watermark
    var gx = W - 170, gy = 930, gk = seed % 5;
    guilloche(c, gx, gy, 300, 18, 24 + gk * 2, 7, rgba(T.line, T.light ? 0.10 : 0.13), 1.2);
    guilloche(c, gx, gy, 220, 24, 16 + gk * 2, 12, rgba(T.line, T.light ? 0.14 : 0.18), 1.2);
    guilloche(c, gx, gy, 140, 16, 12 + gk, 10, rgba(T.line2, T.light ? 0.2 : 0.24), 1.2);
    if (logoImg) { c.save(); c.globalAlpha = T.light ? 0.08 : 0.12; c.drawImage(logoImg, gx - 95, gy - 95, 190, 190); c.restore(); }
    waveBand(c, M, W - M, 642, 12, 3.2, 14, 0.011, rgba(T.line, T.light ? 0.16 : 0.22), 1.1);
    guilloche(c, 220, PERF + 420, 230, 14, 20, 8, rgba(T.line, T.light ? 0.08 : 0.10), 1.1);
    var gl = c.createLinearGradient(0, 0, W * 0.65, H * 0.4);
    gl.addColorStop(0, "rgba(255,255,255," + (T.light ? 0.5 : 0.13) + ")"); gl.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gl; c.fillRect(0, 0, W, H);
    c.restore();

    // metallic outer frame + engraved inner frame + corner marks
    var mf = c.createLinearGradient(0, 0, W, H);
    ["#a7d5db", "#ffffff", "#2cc394", "#0a98c7", "#ffffff", "#5ba1a5", "#a7d5db"].forEach(function (col, i, a) { mf.addColorStop(i / (a.length - 1), col); });
    rr(c, M + 3, M + 3, CW - 6, CH - 6, 53); c.strokeStyle = mf; c.lineWidth = 6; c.stroke();
    rr(c, M + 20, M + 20, CW - 40, CH - 40, 38); c.strokeStyle = rgba(T.line, T.light ? 0.3 : 0.35); c.lineWidth = 1.5; c.stroke();
    c.strokeStyle = T.light ? "rgba(20,142,100,0.9)" : "rgba(44,195,148,0.9)"; c.lineWidth = 3; c.lineCap = "round";
    [[M + 34, M + 34, 1, 1], [W - M - 34, M + 34, -1, 1], [M + 34, H - M - 34, 1, -1], [W - M - 34, H - M - 34, -1, -1]].forEach(function (q) {
      c.beginPath(); c.moveTo(q[0], q[1] + 26 * q[3]); c.lineTo(q[0], q[1]); c.lineTo(q[0] + 26 * q[2], q[1]); c.stroke();
    });
    c.globalCompositeOperation = "destination-out";
    [M, W - M].forEach(function (x) { c.beginPath(); c.arc(x, PERF, 38, 0, Math.PI * 2); c.fill(); });
    c.globalCompositeOperation = "source-over";
    [M, W - M].forEach(function (x, i) { c.beginPath(); c.arc(x, PERF, 41, i ? Math.PI / 2 : -Math.PI / 2, i ? Math.PI * 1.5 : Math.PI / 2); c.strokeStyle = mf; c.lineWidth = 4; c.stroke(); });
    c.save(); c.setLineDash([14, 12]); c.strokeStyle = T.light ? "rgba(7,95,152,0.35)" : "rgba(233,251,255,0.35)"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(M + 60, PERF); c.lineTo(W - M - 60, PERF); c.stroke(); c.restore();
    ctx.shadowColor = "rgba(4,50,79,0.35)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
    ctx.drawImage(card, 0, 0);
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    var X = 128, CWID = W - X * 2;
    ctx.textBaseline = "alphabetic";

    // header
    rr(ctx, 124, 116, 108, 108, 30); ctx.fillStyle = "#fcfdfd"; ctx.fill();
    if (T.light) { ctx.strokeStyle = "rgba(7,95,152,0.18)"; ctx.lineWidth = 2; ctx.stroke(); }
    if (logoImg) ctx.drawImage(logoImg, 130, 122, 96, 96);
    font(ctx, 700, 44, F_MONO); ctx.fillStyle = T.light ? "#075f98" : "#ffffff"; ctx.fillText("TGGC", 256, 166);
    var tw = ctx.measureText("TGGC ").width; ctx.fillStyle = T.light ? "#148e64" : T.accent; ctx.fillText("2026", 256 + tw, 166);
    ctx.fillStyle = T.label; font(ctx, 600, 23, F_BODY); ctx.fillText("บัตรเข้าร่วมงาน · OFFICIAL PASS", 256, 204);
    holoSeal(ctx, W - X - 66, 174, 84);

    // title
    var y = 300;
    var TL = ["การแข่งขันอัจฉริยภาพทางด้าน", "ภูมิศาสตร์และภูมิสารสนเทศ", "แห่งประเทศไทย"];
    var ts = fitBlock(ctx, TL, CWID, 52, 38, 600, F_DISPLAY);
    font(ctx, 600, ts, F_DISPLAY); ctx.fillStyle = T.fg;
    TL.forEach(function (l) { ctx.fillText(l, X, y); y += Math.round(ts * 1.3); });
    y += 2;
    font(ctx, 500, 36, F_DISPLAY); ctx.fillStyle = T.accent;
    ctx.fillText("ระดับมัธยมศึกษา ครั้งที่ 3 พ.ศ. 2569", X, y); y += 54;
    var RL = ["ชิงถ้วยพระราชทาน สมเด็จพระกนิษฐาธิราชเจ้า", "กรมสมเด็จพระเทพรัตนราชสุดาฯ สยามบรมราชกุมารี"];
    var rs = fitBlock(ctx, RL, CWID, 27, 20, 400, F_BODY);
    font(ctx, 400, rs, F_BODY); ctx.fillStyle = T.soft;
    RL.forEach(function (l) { ctx.fillText(l, X, y); y += Math.round(rs * 1.45); });

    // divider + microtext
    y += 16;
    var dg = ctx.createLinearGradient(X, 0, W - X, 0);
    dg.addColorStop(0, T.accent); dg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = dg; ctx.fillRect(X, y, CWID, 2);
    microText(ctx, "TGGC2026·GEOGRAPHY·GEOINFORMATICS·ภูมิศาสตร์·ภูมิสารสนเทศ·ครั้งที่3·", X, y + 22, CWID, 12, rgba(T.line, 0.55));
    y += 64;

    // attendee
    ctx.fillStyle = T.accent; font(ctx, 700, 24, F_MONO); ctx.fillText("ATTENDEE · ผู้เข้าร่วมงาน", X, y);
    y += 18;
    var full = t.prefix + t.first + " " + t.last, NL, ns;
    font(ctx, 700, 74, F_DISPLAY);
    if (ctx.measureText(full).width <= CWID) { NL = [full]; ns = fitBlock(ctx, NL, CWID, 86, 74, 700, F_DISPLAY); }
    else { NL = [t.prefix + t.first, t.last]; ns = fitBlock(ctx, NL, CWID, 80, 40, 700, F_DISPLAY); }
    font(ctx, 700, ns, F_DISPLAY); ctx.fillStyle = T.fg;
    if (!T.light) { ctx.shadowColor = rgba(T.line2, 0.45); ctx.shadowBlur = 26; }
    NL.forEach(function (l) { y += Math.round(ns * 1.1); ctx.fillText(l, X, y); });
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
    y += 32;

    // position pill
    var pos = fit(ctx, t.position, CWID - 52, 1, 30, 22, 600, F_BODY);
    font(ctx, 600, pos.size, F_BODY);
    var ppw = Math.min(CWID, ctx.measureText(pos.lines[0]).width + 52);
    var ppg = ctx.createLinearGradient(X, 0, X + ppw, 0);
    ppg.addColorStop(0, T.pill[0]); ppg.addColorStop(1, T.pill[1]);
    rr(ctx, X, y, ppw, 58, 29); ctx.fillStyle = ppg; ctx.fill();
    ctx.strokeStyle = "rgba(233,251,255,0.5)"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.fillText(pos.lines[0], X + 26, y + 39);
    y += 58 + 48;

    function kv(label, value, x, yy, w, size) {
      ctx.fillStyle = T.label; font(ctx, 500, 22, F_BODY); ctx.fillText(label, x, yy);
      var f = fit(ctx, value, w, 1, size, 22, 600, F_BODY);
      font(ctx, 600, f.size, F_BODY); ctx.fillStyle = T.fg; ctx.fillText(f.lines[0], x, yy + 44);
    }
    kv("โรงเรียน", schoolName(t.school), X, y, CWID, 34);
    kv("จังหวัด", t.province, X, y + 100, CWID / 2 - 20, 32);
    kv("สังกัด", t.affiliation, X + CWID / 2 + 10, y + 100, CWID / 2 - 10, 32);

    // perforation label
    font(ctx, 600, 19, F_BODY);
    var stubTxt = "ส่วนแลกของที่ระลึก · SOUVENIR STUB", stw = ctx.measureText(stubTxt).width + 40;
    rr(ctx, (W - stw) / 2, PERF - 20, stw, 40, 20); ctx.fillStyle = T.stub; ctx.fill();
    ctx.strokeStyle = T.light ? "rgba(7,95,152,0.35)" : "rgba(44,195,148,0.7)"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = T.stubText; ctx.fillText(stubTxt, (W - stw) / 2 + 20, PERF + 7);

    // ---------- stub ----------
    var sy = PERF + 66, QR = 316;
    rr(ctx, X, sy, QR, QR, 28); ctx.fillStyle = "#ffffff"; ctx.fill();
    rr(ctx, X - 8, sy - 8, QR + 16, QR + 16, 34); ctx.strokeStyle = mf; ctx.lineWidth = 3; ctx.stroke();
    try {
      var qr = window.qrcode(0, "M"); qr.addData(t.id); qr.make();
      var n = qr.getModuleCount(), pad = 26, cell = Math.floor((QR - pad * 2) / n), off = Math.floor((QR - cell * n) / 2);
      ctx.fillStyle = "#043a5e";
      for (var r = 0; r < n; r++) for (var cc = 0; cc < n; cc++) if (qr.isDark(r, cc)) ctx.fillRect(X + off + cc * cell, sy + off + r * cell, cell, cell);
    } catch (e) {
      ctx.fillStyle = "#043a5e"; font(ctx, 700, 40, F_MONO); ctx.fillText(t.id, X + 40, sy + QR / 2);
    }

    var rx = X + QR + 48, rw = W - X - rx;
    ctx.fillStyle = T.label; font(ctx, 600, 20, F_MONO); ctx.fillText("TICKET ID · รหัสบัตร", rx, sy + 26);
    var idf = fit(ctx, t.id, rw, 1, 64, 40, 700, F_MONO);
    font(ctx, 700, idf.size, F_MONO); ctx.fillStyle = T.fg; ctx.fillText(t.id, rx, sy + 92);
    if (t.no) { ctx.fillStyle = T.accent; font(ctx, 700, 26, F_MONO); ctx.fillText("Nº " + String(t.no).padStart(4, "0"), rx, sy + 132); }
    ctx.fillStyle = rgba(T.line, 0.35); ctx.fillRect(rx, sy + 152, rw, 1.5);
    ctx.fillStyle = T.label; font(ctx, 600, 18, F_MONO);
    ctx.fillText("ลาย " + String(D.n).padStart(2, "0") + "/24 · " + T.key + " " + D.M.key, rx, sy + 182);
    ctx.fillStyle = T.accent; font(ctx, 600, 32, F_DISPLAY); ctx.fillText("เสาร์ 28 พ.ย. 2569", rx, sy + 232);
    var ven = fit(ctx, "โรงเรียนชลประทานวิทยา จังหวัดนนทบุรี", rw, 2, 25, 20, 400, F_BODY);
    font(ctx, 400, ven.size, F_BODY); ctx.fillStyle = T.soft;
    ven.lines.forEach(function (l, i) { ctx.fillText(l, rx, sy + 270 + i * 34); });

    ctx.fillStyle = T.label; font(ctx, 400, 22, F_BODY);
    ctx.fillText("ลงทะเบียน " + thDate(t.createdAt) + "  ·  โทร " + maskPhone(t.phone), X, sy + QR + 52);

    // redemption band
    var by = H - M - 56 - 100;
    var bg = ctx.createLinearGradient(X, 0, W - X, 0);
    T.band.forEach(function (col, i, a) { bg.addColorStop(a.length === 1 ? 0 : i / (a.length - 1), col); });
    rr(ctx, X, by, CWID, 100, 50); ctx.fillStyle = bg; ctx.fill();
    var bsh = ctx.createLinearGradient(0, by, 0, by + 100);
    bsh.addColorStop(0, "rgba(255,255,255,0.28)"); bsh.addColorStop(0.5, "rgba(255,255,255,0)");
    ctx.fillStyle = bsh; ctx.fill();
    var band = fit(ctx, "แลกของที่ระลึก · อาคาร 100 ปี ชูชาติอนุสรณ์ ชั้น 1", CWID - 80, 1, 32, 22, 600, F_DISPLAY);
    font(ctx, 600, band.size, F_DISPLAY); ctx.fillStyle = T.bandText;
    var bw = ctx.measureText(band.lines[0]).width;
    ctx.fillText(band.lines[0], X + (CWID - bw) / 2, by + 50 + band.size * 0.36);
    microText(ctx, "TGGC2026·OFFICIAL·PASS·", X + 30, H - M - 22, CWID - 60, 11, rgba(T.line, 0.45));

    if (opt.sample) {
      ctx.save(); ctx.translate(W / 2, 1000); ctx.rotate(-0.2);
      rr(ctx, -340, -78, 680, 156, 28); ctx.fillStyle = "rgba(4,50,79,0.6)"; ctx.fill();
      ctx.strokeStyle = "rgba(252,253,253,0.9)"; ctx.lineWidth = 8; ctx.stroke();
      font(ctx, 700, 64, F_DISPLAY); ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
      ctx.fillText("ตัวอย่างบัตร", 0, 24);
      ctx.restore();
    }
    return cv;
  }

  /* ---------------- views (hash routes: #home, #register, #ticket) ---------------- */
  var current = null, currentCanvas = null, celebrateNext = false, view = "home";
  var VIEWS = { home: "#homeView", register: "#registerView", ticket: "#ticketView" };
  function go(name) { if (location.hash.slice(1) === name) route(); else location.hash = name; }
  function route() {
    var name = location.hash.slice(1);
    if (!VIEWS[name]) name = "home";
    if (name === "ticket" && !current) { var l = tickets(); if (l.length) current = l[0]; else name = "home"; }
    view = name;
    Object.keys(VIEWS).forEach(function (k) { $(VIEWS[k]).hidden = k !== name; });
    $("#dockHome").hidden = name !== "home";
    $("#dockReg").hidden = name !== "register";
    $("#dockTicket").hidden = name !== "ticket";
    var has = tickets().length > 0;
    $("#myTicketBtn").hidden = !has; $("#dockMine").hidden = !has;
    window.scrollTo(0, 0);
    if (name === "home") requestAnimationFrame(paintBackgrounds);
    if (name === "register") goStep(step, true);
    if (name === "ticket") { showTicket(current, celebrateNext); celebrateNext = false; }
  }

  function setSync(t) {
    var pill = $("#syncPill"), txt = $("#syncTxt");
    pill.className = "sync " + (t.sync === "ok" ? "ok" : t.sync === "queued" ? "wait" : "demo");
    txt.textContent = t.sync === "ok" ? "บันทึกเข้าระบบแล้ว" + (t.no ? " · ลำดับที่ " + t.no : "")
      : t.sync === "queued" ? "ออกบัตรแล้ว · รอส่งข้อมูลเมื่อมีสัญญาณ"
      : "โหมดตัวอย่าง · ยังไม่เชื่อม Google Sheet";
  }

  function showTicket(t, celebrate) {
    current = t;
    setSync(t);
    $(".tv-head").classList.toggle("again", !celebrate);
    $("#tvTitle").textContent = celebrate ? "ออกบัตรสำเร็จ" : "บัตรของคุณ";
    var img = $("#ticketImg"), tilt = $("#ticketTilt");
    var D = designOf(t);
    $("#designNote").innerHTML = "ลายบัตรของคุณ: <b>ลายที่ " + D.n + " จาก 24</b> · " + D.T.th + " × " + D.M.th;
    if (celebrate) img.style.visibility = "hidden";
    Promise.all([loadFonts(), loadLogo()]).then(function () {
      currentCanvas = renderTicket(t);
      img.src = currentCanvas.toDataURL("image/png");
      img.style.visibility = "";
      if (celebrate && !REDUCED) {
        tilt.classList.remove("ticket-print"); void tilt.offsetWidth; tilt.classList.add("ticket-print");
        setTimeout(confetti, 1000);
        if (navigator.vibrate) navigator.vibrate([30, 60, 30]);
      }
    });
  }

  var SAMPLE = { id: "TG-S4MPL", no: 1, prefix: "นาย", first: "ภูมิ", last: "สารสนเทศ", position: "ครู", school: "ตัวอย่างวิทยา", province: "นนทบุรี", affiliation: "สพม.นนทบุรี", phone: "0800000000", createdAt: new Date().toISOString() };
  function renderTeaser() {
    var picks = [[0, 0], [4, 2], [1, 3], [3, 1], [2, 0], [5, 2]];
    var stack = $("#teaserStack"), imgs = [];
    Promise.all([loadFonts(), loadLogo()]).then(function () {
      (function next(i) {
        if (i >= picks.length) return rotate();
        var big = renderTicket(SAMPLE, { sample: true, design: picks[i] });
        var sm = document.createElement("canvas"); sm.width = 540; sm.height = 960;
        sm.getContext("2d").drawImage(big, 0, 0, 540, 960);
        var im = new Image(); im.alt = ""; im.src = sm.toDataURL("image/jpeg", 0.88);
        if (i === 0) im.className = "on";
        stack.appendChild(im); imgs.push(im);
        setTimeout(function () { next(i + 1); }, 60);
      })(0);
    });
    function rotate() {
      if (REDUCED) return;
      var k = 0;
      setInterval(function () {
        if (view !== "home") return;
        imgs[k].classList.remove("on"); k = (k + 1) % imgs.length; imgs[k].classList.add("on");
      }, 2600);
    }
  }

  /* ---------------- tilt + holo ---------------- */
  function bindTilt() {
    var stage = $(".ticket-stage"), tilt = $("#ticketTilt"), holo = $(".holo", tilt);
    var active = false, t0 = performance.now();
    function apply(nx, ny) {
      tilt.style.transform = "rotateY(" + (nx * 10).toFixed(2) + "deg) rotateX(" + (-ny * 8).toFixed(2) + "deg)";
      holo.style.setProperty("--hx", (50 + nx * 50).toFixed(1) + "%");
      holo.style.setProperty("--hy", (50 + ny * 50).toFixed(1) + "%");
    }
    stage.addEventListener("pointermove", function (e) {
      var r = tilt.getBoundingClientRect();
      active = true;
      apply(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2);
    });
    stage.addEventListener("pointerleave", function () { active = false; });
    if (REDUCED) return;
    (function idle(now) {
      if (!active && !$("#ticketView").hidden) {
        var s = (now - t0) / 1000;
        apply(Math.sin(s * 0.7) * 0.35, Math.cos(s * 0.9) * 0.25);
      }
      requestAnimationFrame(idle);
    })(t0);
  }

  /* ---------------- save / share ---------------- */
  function canvasBlob() {
    return new Promise(function (res) { currentCanvas.toBlob(res, "image/png"); });
  }
  function fileName() { return "TGGC2569-" + current.id + ".png"; }

  function saveImage() {
    if (!currentCanvas) return;
    canvasBlob().then(function (blob) {
      var file = null;
      try { file = new File([blob], fileName(), { type: "image/png" }); } catch (e) { /* old browsers */ }
      if (IS_IOS && file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: "บัตรเข้าร่วมงาน TGGC 2026" }).catch(function () {});
        return;
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast("บันทึกรูปบัตรแล้ว · ถ้าไม่พบไฟล์ ให้กดค้างที่บัตรแล้วเลือกบันทึกรูป");
    });
  }
  function shareImage() {
    canvasBlob().then(function (blob) {
      var file = new File([blob], fileName(), { type: "image/png" });
      var data = { title: "บัตรเข้าร่วมงาน TGGC 2026", text: "บัตรเข้าร่วมงาน TGGC 2026 · รหัส " + current.id };
      if (navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
      navigator.share(data).catch(function () {});
    });
  }

  /* ---------------- confetti ---------------- */
  function confetti() {
    var cv = $("#confetti"), ctx = cv.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    var cols = ["#075f98", "#0a98c7", "#15a8a0", "#2cc394", "#148e64", "#a7d5db"];
    var P = [];
    for (var i = 0; i < 140; i++) P.push({
      x: cv.width / 2, y: cv.height * 0.38,
      vx: (Math.random() - 0.5) * 26 * dpr, vy: (-Math.random() * 22 - 6) * dpr,
      s: (Math.random() * 7 + 5) * dpr, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      c: cols[i % cols.length], life: 0,
    });
    var start = performance.now();
    (function frame(now) {
      var el = now - start;
      ctx.clearRect(0, 0, cv.width, cv.height);
      P.forEach(function (p) {
        p.vy += 0.55 * dpr; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - el / 2200);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      });
      if (el < 2200) requestAnimationFrame(frame); else ctx.clearRect(0, 0, cv.width, cv.height);
    })(start);
  }

  /* ---------------- boot ---------------- */
  function boot() {
    $$("[data-logo]").forEach(function (el, i) { el.dataset.uid = String(i); });
    mountLogos();
    fillProvinces();
    bindForm();
    bindTilt();
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { $$("canvas[data-done]").forEach(function (c) { delete c.dataset.done; }); if (view === "home") paintBackgrounds(); }, 200); });

    if (tickCountdown()) { var iv = setInterval(function () { if (!tickCountdown()) clearInterval(iv); }, 1000); }

    document.addEventListener("click", function (e) {
      var a = e.target.closest("[data-go]");
      if (!a) return;
      e.preventDefault(); go(a.dataset.go);
    });
    $("#saveBtn").addEventListener("click", saveImage);
    if (navigator.share && !IS_IOS) { $("#shareBtn").hidden = false; $("#shareBtn").addEventListener("click", shareImage); }
    function openMine() { var l = tickets(); if (l.length) { current = l[0]; go("ticket"); } }
    $("#myTicketBtn").addEventListener("click", openMine);
    $("#dockMine").addEventListener("click", openMine);
    $("#editBtn").addEventListener("click", function () { if (!current) return; fillForm(current); go("register"); });
    $("#newBtn").addEventListener("click", function () { resetForm(); go("register"); });

    window.addEventListener("hashchange", route);
    route();
    setTimeout(renderTeaser, 200);
    window.addEventListener("online", flushQueue);
    flushQueue();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
