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
      seed: 1969, levels: 18, scale: 0.0045, minorAlpha: 0.45,
      color: function (p) { return p < 0.5 ? "rgba(167,213,219,0.42)" : "rgba(44,195,148,0.5)"; },
      bias: function (x, y) { return -0.25 * ((x - 0.85) * (x - 0.85) + (y - 0.2) * (y - 0.2)); },
    });
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
  var attempted = false;
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

  function refresh() {
    var d = readForm(), done = 0;
    FIELDS.forEach(function (k) {
      var ok = validField(k, d);
      if (ok) done++;
      var el = fieldEl(k);
      el.classList.toggle("ok", ok);
      el.classList.toggle("bad", !ok && (touched[k] || attempted));
    });
    $("#consentBox").classList.toggle("bad", attempted && !d.consent);
    var pct = Math.round(done / FIELDS.length * 100);
    $("#progBar").style.width = pct + "%";
    $("#progTxt").textContent = "กรอกแล้ว " + done + " จาก " + FIELDS.length + " ช่อง";
    $("#progPct").textContent = pct + "%";
    $("#dockCount").style.setProperty("--p", pct);
    $("#dockNum").textContent = done + "/" + FIELDS.length;
    var txt = $("#submitTxt"), btn = $("#submitBtn");
    var all = done === FIELDS.length;
    if (done === 0) txt.textContent = "ลงทะเบียนรับบัตร";
    else if (!all) txt.textContent = "กรอกต่ออีก " + (FIELDS.length - done) + " ช่อง";
    else if (!d.consent) txt.textContent = "ติ๊กยินยอม แล้วออกบัตร";
    else txt.textContent = editingId ? "บันทึกและออกบัตรใหม่" : "ออกบัตรเข้าร่วมงาน";
    btn.setAttribute("aria-disabled", done === 0 || (all && d.consent) ? "false" : "true");
    return { data: d, done: done, valid: all && d.consent };
  }

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

    // Enter = next field (mobile keyboards)
    var order = ["first", "last", "position", "phone", "school", "province", "affiliation"];
    order.forEach(function (id, i) {
      $("#" + id).addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        var next = order[i + 1];
        if (next) $("#" + next).focus(); else e.target.blur();
      });
    });

    form.addEventListener("submit", onSubmit);
  }

  function resetForm() {
    form.reset();
    $("#prefixOther").hidden = true;
    $("#affSuggest").textContent = "สพม.นนทบุรี";
    touched = {}; attempted = false; editingId = null;
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
    $("#myTicketBtn").hidden = false;
  }
  function updateTicket(oldId, patch) {
    var list = tickets();
    list.forEach(function (t) { if (t.id === oldId) Object.assign(t, patch); });
    store.set(K_TICKETS, list);
    if (current && current.id === oldId) { Object.assign(current, patch); showTicket(current, false); }
  }

  /* ---------------- submit ---------------- */
  function scrollToEl(el) {
    var y = el.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top: y, behavior: REDUCED ? "auto" : "smooth" });
  }

  function onSubmit(e) {
    e.preventDefault();
    var st = refresh();
    if ($("#website").value) return; // bot
    if (!st.valid) {
      if (st.done === 0) { scrollToEl($("#register")); return; }
      attempted = true; refresh();
      var firstBad = FIELDS.filter(function (k) { return !validField(k, st.data); })[0];
      var target = firstBad ? fieldEl(firstBad) : $("#consentBox");
      scrollToEl(target);
      if (firstBad && firstBad !== "prefix" && firstBad !== "province") { var inp = target.querySelector(".input"); if (inp) setTimeout(function () { inp.focus({ preventScroll: true }); }, 350); }
      if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
      return;
    }

    var d = st.data;
    var payload = {
      id: editingId || genId(),
      prefix: d.prefix, first: d.first, last: d.last, position: d.position,
      school: d.school, province: d.province, affiliation: d.affiliation, phone: d.phone,
      clientTime: new Date().toISOString(),
    };
    var btn = $("#submitBtn");
    btn.classList.add("loading");
    $("#submitTxt").textContent = "กำลังออกบัตร…";
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
      editingId = null;
      showTicket(t, true);
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

  function renderTicket(t) {
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d");

    // page ground
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#dff1f3"); g.addColorStop(1, "#a7d5db");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // card on its own layer so the perforation notches can be punched through
    var M = 56, CW = W - M * 2, CH = H - M * 2, PERF = 1240;
    var card = document.createElement("canvas"); card.width = W; card.height = H;
    var c = card.getContext("2d");
    rr(c, M, M, CW, CH, 56); c.save(); c.clip();
    var cg = c.createLinearGradient(0, M, 0, H - M);
    cg.addColorStop(0, "#0a7fb5"); cg.addColorStop(0.42, "#075f98"); cg.addColorStop(1, "#032d4b");
    c.fillStyle = cg; c.fillRect(0, 0, W, H);
    var glow = c.createRadialGradient(W * 0.9, 260, 10, W * 0.9, 260, 620);
    glow.addColorStop(0, "rgba(44,195,148,0.45)"); glow.addColorStop(1, "rgba(44,195,148,0)");
    c.fillStyle = glow; c.fillRect(0, 0, W, H);
    var glow2 = c.createRadialGradient(120, PERF + 300, 10, 120, PERF + 300, 640);
    glow2.addColorStop(0, "rgba(10,152,199,0.4)"); glow2.addColorStop(1, "rgba(10,152,199,0)");
    c.fillStyle = glow2; c.fillRect(0, 0, W, H);
    drawTopo(c, W, H, { seed: 2569, levels: 22, cell: 12, scale: 0.0032, minorAlpha: 0.5, lineWidth: 1.6,
      color: function (p) { return p < 0.5 ? "rgba(167,213,219,0.26)" : "rgba(44,195,148,0.30)"; } });
    c.restore();
    // gold hairline
    rr(c, M + 1.5, M + 1.5, CW - 3, CH - 3, 55);
    var hl = c.createLinearGradient(0, 0, W, H);
    hl.addColorStop(0, "rgba(167,213,219,0.9)"); hl.addColorStop(0.5, "rgba(167,213,219,0.15)"); hl.addColorStop(1, "rgba(44,195,148,0.9)");
    c.strokeStyle = hl; c.lineWidth = 3; c.stroke();
    // notches
    c.globalCompositeOperation = "destination-out";
    [M, W - M].forEach(function (x) { c.beginPath(); c.arc(x, PERF, 38, 0, Math.PI * 2); c.fill(); });
    c.globalCompositeOperation = "source-over";
    // perforation
    c.save(); c.setLineDash([16, 14]); c.strokeStyle = "rgba(255,255,255,0.28)"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(M + 58, PERF); c.lineTo(W - M - 58, PERF); c.stroke(); c.restore();
    ctx.drawImage(card, 0, 0);

    var X = 128, CWID = W - X * 2;
    ctx.textBaseline = "alphabetic";

    // header: logo on a white tile + wordmark
    rr(ctx, 124, 116, 108, 108, 30); ctx.fillStyle = "#fcfdfd"; ctx.fill();
    if (logoImg) ctx.drawImage(logoImg, 130, 122, 96, 96);
    font(ctx, 700, 44, F_MONO); ctx.fillStyle = "#ffffff"; ctx.fillText("TGGC", 256, 166);
    var tw = ctx.measureText("TGGC ").width; ctx.fillStyle = "#2cc394"; ctx.fillText("2026", 256 + tw, 166);
    ctx.fillStyle = "#a7d5db"; font(ctx, 600, 24, F_BODY); ctx.fillText("บัตรเข้าร่วมงาน · ADMIT ONE", 256, 204);

    // edition pill
    font(ctx, 600, 26, F_DISPLAY);
    var pill = "ครั้งที่ 3", pw = ctx.measureText(pill).width + 44;
    rr(ctx, W - X - pw, 143, pw, 54, 27); ctx.strokeStyle = "rgba(44,195,148,0.95)"; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = "#2cc394"; ctx.fillText(pill, W - X - pw + 22, 180);

    // title
    var y = 300;
    var TL = ["การแข่งขันอัจฉริยภาพทางด้าน", "ภูมิศาสตร์และภูมิสารสนเทศ", "แห่งประเทศไทย"];
    var ts = fitBlock(ctx, TL, CWID, 52, 38, 600, F_DISPLAY);
    font(ctx, 600, ts, F_DISPLAY); ctx.fillStyle = "#ffffff";
    TL.forEach(function (l) { ctx.fillText(l, X, y); y += Math.round(ts * 1.3); });
    y += 2;
    font(ctx, 500, 36, F_DISPLAY); ctx.fillStyle = "#2cc394";
    ctx.fillText("ระดับมัธยมศึกษา ครั้งที่ 3 พ.ศ. 2569", X, y); y += 54;
    var RL = ["ชิงถ้วยพระราชทาน สมเด็จพระกนิษฐาธิราชเจ้า", "กรมสมเด็จพระเทพรัตนราชสุดาฯ สยามบรมราชกุมารี"];
    var rs = fitBlock(ctx, RL, CWID, 27, 20, 400, F_BODY);
    font(ctx, 400, rs, F_BODY); ctx.fillStyle = "rgba(220,240,244,0.85)";
    RL.forEach(function (l) { ctx.fillText(l, X, y); y += Math.round(rs * 1.45); });

    // divider
    y += 16;
    var dg = ctx.createLinearGradient(X, 0, W - X, 0);
    dg.addColorStop(0, "rgba(44,195,148,0.9)"); dg.addColorStop(1, "rgba(44,195,148,0)");
    ctx.fillStyle = dg; ctx.fillRect(X, y, CWID, 2);
    y += 58;

    // attendee
    ctx.fillStyle = "#2cc394"; font(ctx, 700, 24, F_MONO); ctx.fillText("ATTENDEE · ผู้เข้าร่วมงาน", X, y);
    y += 18;
    // one line if it fits large, otherwise break between first name and surname (never inside a name)
    var full = t.prefix + t.first + " " + t.last, NL, ns;
    font(ctx, 700, 74, F_DISPLAY);
    if (ctx.measureText(full).width <= CWID) { NL = [full]; ns = fitBlock(ctx, NL, CWID, 86, 74, 700, F_DISPLAY); }
    else { NL = [t.prefix + t.first, t.last]; ns = fitBlock(ctx, NL, CWID, 80, 40, 700, F_DISPLAY); }
    font(ctx, 700, ns, F_DISPLAY); ctx.fillStyle = "#ffffff";
    NL.forEach(function (l) { y += Math.round(ns * 1.1); ctx.fillText(l, X, y); });
    y += 34;

    // position pill
    var pos = fit(ctx, t.position, CWID - 52, 1, 30, 22, 600, F_BODY);
    font(ctx, 600, pos.size, F_BODY);
    var ppw = Math.min(CWID, ctx.measureText(pos.lines[0]).width + 52);
    var ppg = ctx.createLinearGradient(X, 0, X + ppw, 0);
    ppg.addColorStop(0, "#2cc394"); ppg.addColorStop(1, "#148e64");
    rr(ctx, X, y, ppw, 58, 29); ctx.fillStyle = ppg; ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.fillText(pos.lines[0], X + 26, y + 39);
    y += 58 + 50;

    // school (full width) + province / affiliation (two columns)
    function kv(label, value, x, yy, w, size) {
      ctx.fillStyle = "rgba(167,213,219,0.9)"; font(ctx, 500, 22, F_BODY); ctx.fillText(label, x, yy);
      var f = fit(ctx, value, w, 1, size, 22, 600, F_BODY);
      font(ctx, 600, f.size, F_BODY); ctx.fillStyle = "#fcfdfd"; ctx.fillText(f.lines[0], x, yy + 44);
    }
    var rowY = y;
    kv("โรงเรียน", schoolName(t.school), X, rowY, CWID, 34);
    kv("จังหวัด", t.province, X, rowY + 104, CWID / 2 - 20, 32);
    kv("สังกัด", t.affiliation, X + CWID / 2 + 10, rowY + 104, CWID / 2 - 10, 32);

    // ---------- stub ----------
    var sy = PERF + 62, QR = 320;
    rr(ctx, X, sy, QR, QR, 28); ctx.fillStyle = "#ffffff"; ctx.fill();
    try {
      var qr = window.qrcode(0, "M"); qr.addData(t.id); qr.make();
      var n = qr.getModuleCount(), pad = 26, cell = Math.floor((QR - pad * 2) / n), off = Math.floor((QR - cell * n) / 2);
      ctx.fillStyle = "#043a5e";
      for (var r = 0; r < n; r++) for (var cc = 0; cc < n; cc++) if (qr.isDark(r, cc)) ctx.fillRect(X + off + cc * cell, sy + off + r * cell, cell, cell);
    } catch (e) {
      ctx.fillStyle = "#043a5e"; font(ctx, 700, 40, F_MONO); ctx.fillText(t.id, X + 40, sy + QR / 2);
    }

    var rx = X + QR + 44, rw = W - X - rx;
    ctx.fillStyle = "rgba(167,213,219,0.9)"; font(ctx, 500, 22, F_BODY); ctx.fillText("รหัสบัตร", rx, sy + 30);
    var idf = fit(ctx, t.id, rw, 1, 66, 40, 700, F_MONO);
    font(ctx, 700, idf.size, F_MONO); ctx.fillStyle = "#ffffff"; ctx.fillText(t.id, rx, sy + 96);
    if (t.no) { ctx.fillStyle = "#2cc394"; font(ctx, 700, 26, F_MONO); ctx.fillText("No. " + String(t.no).padStart(4, "0"), rx, sy + 136); }
    ctx.fillStyle = "#2cc394"; font(ctx, 600, 32, F_DISPLAY); ctx.fillText("เสาร์ 28 พ.ย. 2569", rx, sy + 200);
    var ven = fit(ctx, "โรงเรียนชลประทานวิทยา จังหวัดนนทบุรี", rw, 2, 25, 20, 400, F_BODY);
    font(ctx, 400, ven.size, F_BODY); ctx.fillStyle = "rgba(232,245,248,0.88)";
    ven.lines.forEach(function (l, i) { ctx.fillText(l, rx, sy + 242 + i * 36); });

    // meta line
    ctx.fillStyle = "rgba(167,213,219,0.8)"; font(ctx, 400, 22, F_BODY);
    ctx.fillText("ลงทะเบียน " + thDate(t.createdAt) + "  ·  โทร " + maskPhone(t.phone), X, sy + QR + 48);

    // redemption band
    var by = H - M - 56 - 100;
    var bg = ctx.createLinearGradient(X, 0, W - X, 0);
    bg.addColorStop(0, "#2cc394"); bg.addColorStop(0.55, "#15a8a0"); bg.addColorStop(1, "#0a98c7");
    rr(ctx, X, by, CWID, 100, 50); ctx.fillStyle = bg; ctx.fill();
    var band = fit(ctx, "แลกของที่ระลึก · อาคาร 100 ปี ชูชาติอนุสรณ์ ชั้น 1", CWID - 80, 1, 32, 22, 600, F_DISPLAY);
    font(ctx, 600, band.size, F_DISPLAY); ctx.fillStyle = "#ffffff";
    var bw = ctx.measureText(band.lines[0]).width;
    ctx.fillText(band.lines[0], X + (CWID - bw) / 2, by + 50 + band.size * 0.36);

    return cv;
  }

  /* ---------------- views ---------------- */
  var current = null, currentCanvas = null;
  function showView(name) {
    var ticket = name === "ticket";
    $("#home").hidden = ticket;
    $("#ticketView").hidden = !ticket;
    $("#dockHome").hidden = ticket;
    $("#dockTicket").hidden = !ticket;
    $("#myTicketBtn").hidden = ticket || !tickets().length;
    if (!ticket) requestAnimationFrame(paintBackgrounds);
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
    showView("ticket");
    if (celebrate) window.scrollTo({ top: 0, behavior: "auto" });
    Promise.all([loadFonts(), loadLogo()]).then(function () {
      currentCanvas = renderTicket(t);
      var img = $("#ticketImg");
      img.src = currentCanvas.toDataURL("image/png");
      var tilt = $("#ticketTilt");
      if (celebrate && !REDUCED) {
        tilt.classList.remove("ticket-enter"); void tilt.offsetWidth; tilt.classList.add("ticket-enter");
        setTimeout(confetti, 450);
        if (navigator.vibrate) navigator.vibrate([30, 60, 30]);
      }
    });
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
      var data = { title: "บัตรเข้าร่วมงาน TGGC 2569", text: "บัตรเข้าร่วมงาน TGGC 2569 · รหัส " + current.id };
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
    refresh();
    bindTilt();
    paintBackgrounds();
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { $$("canvas[data-done]").forEach(function (c) { delete c.dataset.done; }); paintBackgrounds(); }, 200); });

    if (tickCountdown()) { var iv = setInterval(function () { if (!tickCountdown()) clearInterval(iv); }, 1000); }

    $("#saveBtn").addEventListener("click", saveImage);
    if (navigator.share && !IS_IOS) { $("#shareBtn").hidden = false; $("#shareBtn").addEventListener("click", shareImage); }
    $("#myTicketBtn").addEventListener("click", function () { var l = tickets(); if (l.length) showTicket(l[0], false); });
    $("#editBtn").addEventListener("click", function () {
      if (!current) return;
      fillForm(current); showView("home");
      setTimeout(function () { scrollToEl($("#register")); }, 50);
    });
    $("#newBtn").addEventListener("click", function () {
      resetForm(); showView("home");
      setTimeout(function () { scrollToEl($("#register")); }, 50);
    });

    if (tickets().length) $("#myTicketBtn").hidden = false;
    window.addEventListener("online", flushQueue);
    flushQueue();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
