/* TGGC 2569 – staff page: scan a ticket QR → look it up in the Sheet → confirm souvenir hand-over.
   Talks to the same Apps Script as the participant site, but every call carries the staff PIN
   (checked on the server). With no ENDPOINT (preview) it runs against a small in-memory demo list. */
(function () {
  "use strict";
  var CFG = window.TGGC_CONFIG || {};
  var ENDPOINT = (CFG.ENDPOINT || "").trim();
  var JSQR_SRC = CFG.JSQR_SRC || "/vendor/jsqr.min.js";
  var KEY = "tggc69.staff", LOGKEY = "tggc69.staff.log";

  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var toastT;
  function toast(m) { var t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2600); }
  function ticketId(s) { var m = String(s || "").toUpperCase().match(/TG-?([2-9A-HJ-NP-Z]{5})/); return m ? "TG-" + m[1] : ""; }

  var ICON = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>',
    bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3.5-5-1s3 1 5 1c2 0 5 1.5 5-1s-3.5-2-5 1"/></svg>',
    load: '<span class="spin"></span>',
  };

  /* ---------------- API ---------------- */
  var session = load(KEY, null);
  function api(action, data) {
    var payload = Object.assign({ action: action, pin: session && session.pin, station: session && session.station }, data || {});
    if (!ENDPOINT) return demoApi(payload);
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    return fetch(ENDPOINT, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload), redirect: "follow", signal: ctrl ? ctrl.signal : undefined,
    }).then(function (r) { return r.json(); }).finally(function () { clearTimeout(timer); })
      .then(function (j) {
        if (j && j.auth === false && action !== "login") { logout(j.error); throw new Error(j.error); }
        return j;
      });
  }

  // preview / demo backend (PIN 123456)
  var DEMO = [
    ["TG-7K2QM", "นาย", "สมชาย", "ใจดี", "ครู", "โรงเรียนชลประทานวิทยา", "นนทบุรี", "สพม.นนทบุรี", "0812345678", true],
    ["TG-H4N8P", "นางสาว", "พิมพ์ชนก", "รักษ์โลก", "ครูผู้ช่วย", "โรงเรียนสตรีนนทบุรี", "นนทบุรี", "สพม.นนทบุรี", "0898765432", false],
    ["TG-3XW9R", "นาง", "วรรณา", "แผนที่ดี", "ผู้อำนวยการ", "โรงเรียนเบญจมราชานุสรณ", "นนทบุรี", "สพม.นนทบุรี", "0861112222", false],
    ["TG-MZ6TD", "ดร.", "กิตติ", "ภูมิสารสนเทศ", "รองผู้อำนวยการ", "โรงเรียนปากเกร็ด", "นนทบุรี", "สพม.นนทบุรี", "0823334444", false],
    ["TG-Q5VBE", "นาย", "ธนพล", "ดาวเทียม", "นักเรียน", "โรงเรียนสวนกุหลาบวิทยาลัย นนทบุรี", "นนทบุรี", "สพม.นนทบุรี", "0845556666", false],
  ].map(function (x, i) {
    return { id: x[0], no: i + 1, prefix: x[1], first: x[2], last: x[3], position: x[4], school: x[5], province: x[6], affiliation: x[7], phone: x[8], got: x[9], gotAt: x[9] ? "08:42 น. · 28/11/2026" : "" };
  });
  function demoApi(p) {
    return new Promise(function (res) {
      setTimeout(function () {
        if (p.pin !== "123456") return res({ ok: false, auth: false, error: "PIN ไม่ถูกต้อง (ตัวอย่าง: 123456)" });
        var st = { total: DEMO.length, got: DEMO.filter(function (r) { return r.got; }).length };
        function rec(r) { var o = Object.assign({}, r, { phone4: r.phone.slice(-4) }); delete o.phone; return o; }
        if (p.action === "login" || p.action === "stats") return res({ ok: true, stats: st });
        if (p.action === "lookup") {
          var q = String(p.q || "").trim(), id = ticketId(q), d = q.replace(/\D/g, "");
          var out = DEMO.filter(function (r) {
            return id ? r.id === id : d.length >= 9 ? r.phone === d : q.length >= 2 && (r.first + " " + r.last).indexOf(q) >= 0;
          }).map(rec);
          return res({ ok: true, results: out, stats: st });
        }
        var r = DEMO.filter(function (x) { return x.id === ticketId(p.id); })[0];
        if (!r) return res({ ok: true, found: false });
        if (p.action === "redeem") {
          if (r.got) return res({ ok: true, found: true, already: true, rec: rec(r), stats: st });
          r.got = true; r.gotAt = new Date().toTimeString().slice(0, 5) + " น. · วันนี้"; st.got++;
          return res({ ok: true, found: true, redeemed: true, rec: rec(r), stats: st });
        }
        r.got = false; r.gotAt = ""; st.got--;
        return res({ ok: true, found: true, undone: true, rec: rec(r), stats: st });
      }, 350);
    });
  }

  /* ---------------- login ---------------- */
  function showApp() {
    $("#loginView").hidden = true; $("#appView").hidden = false;
    $("#stationTxt").textContent = "เจ้าหน้าที่: " + (session.station || "—");
    renderLog();
    refreshStats();
    startCam();
  }
  function logout(msg) {
    stopCam();
    var station = session && session.station;
    session = null; store(KEY, null);
    closeSheet();
    $("#appView").hidden = true; $("#loginView").hidden = false;
    $("#station").value = station || "";
    $("#pin").value = "";
    var e = $("#loginErr"); e.hidden = !msg; e.textContent = msg || "";
  }
  $("#loginForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var pin = $("#pin").value.replace(/\D/g, ""), station = $("#station").value.trim().slice(0, 40);
    var e = $("#loginErr");
    if (!station) { e.hidden = false; e.textContent = "กรุณากรอกชื่อเจ้าหน้าที่"; $("#station").focus(); return; }
    if (pin.length < 6) { e.hidden = false; e.textContent = "กรุณาใส่ PIN อย่างน้อย 6 หลัก"; return; }
    var btn = $("#loginBtn"); btn.disabled = true; btn.textContent = "กำลังตรวจสอบ…";
    session = { pin: pin, station: station };
    api("login").then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || "เข้าสู่ระบบไม่สำเร็จ");
      store(KEY, session); e.hidden = true;
      setStats(j.stats);
      showApp();
    }).catch(function (err) {
      session = null;
      e.hidden = false;
      e.textContent = err.name === "AbortError" || err instanceof TypeError ? "เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง" : err.message;
    }).finally(function () { btn.disabled = false; btn.textContent = "เข้าสู่ระบบ"; });
  });
  $("#logoutBtn").addEventListener("click", function () { if (confirm("ออกจากระบบเจ้าหน้าที่?")) logout(); });

  /* ---------------- stats ---------------- */
  function setStats(s) {
    if (!s) return;
    $("#statGot").textContent = s.got; $("#statTotal").textContent = s.total;
    var pct = s.total ? Math.round((s.got / s.total) * 100) : 0;
    $("#statPct").textContent = "· " + pct + "%";
    $("#statBar").style.width = pct + "%";
  }
  function refreshStats() { if (session) api("stats").then(function (j) { if (j && j.ok) setStats(j.stats); }).catch(function () {}); }
  setInterval(function () { if (session && !document.hidden) refreshStats(); }, 30000);

  /* ---------------- feedback: beep + vibrate ---------------- */
  var actx;
  function beep(kind) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var seq = kind === "ok" ? [[880, 0, .09], [1320, .11, .14]] : kind === "warn" ? [[330, 0, .18], [330, .24, .18]] : [[660, 0, .06]];
      seq.forEach(function (s) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = kind === "warn" ? "square" : "sine"; o.frequency.value = s[0];
        g.gain.setValueAtTime(.0001, actx.currentTime + s[1]);
        g.gain.exponentialRampToValueAtTime(.25, actx.currentTime + s[1] + .01);
        g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + s[1] + s[2]);
        o.connect(g); g.connect(actx.destination); o.start(actx.currentTime + s[1]); o.stop(actx.currentTime + s[1] + s[2] + .02);
      });
    } catch (e) {}
    if (navigator.vibrate) navigator.vibrate(kind === "ok" ? [60, 40, 60] : kind === "warn" ? [200, 80, 200] : 30);
  }

  /* ---------------- result sheet ---------------- */
  var sheetOpen = false, autoT;
  function openSheet(kind, title, body, actions, autoMs) {
    var sh = $("#sheet");
    sh.className = "sheet " + (kind || "");
    $("#shIco").innerHTML = ICON[kind === "ok" ? "ok" : kind === "warn" ? "warn" : kind === "bad" ? "bad" : kind === "load" ? "load" : "gift"];
    $("#shTitle").textContent = title;
    $("#shBody").innerHTML = body || "";
    var box = $("#shActions"); box.innerHTML = "";
    (actions || []).forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button"; b.className = a.cls || "btn"; b.innerHTML = a.html || esc(a.label);
      b.addEventListener("click", a.fn); box.appendChild(b);
    });
    $("#sheetWrap").hidden = false; sheetOpen = true;
    clearTimeout(autoT);
    var tm = $("#shTimer");
    tm.hidden = !autoMs; tm.classList.remove("run");
    if (autoMs) { tm.style.setProperty("--t", autoMs + "ms"); void tm.offsetWidth; tm.classList.add("run"); autoT = setTimeout(closeSheet, autoMs); }
    var first = box.querySelector(".btn"); if (first && kind !== "load") setTimeout(function () { first.focus({ preventScroll: true }); }, 50);
  }
  // keep lastCode: the card that was just handled is often still in front of the camera
  function closeSheet() { clearTimeout(autoT); $("#sheetWrap").hidden = true; sheetOpen = false; lastAt = Date.now(); }
  $("#backdrop").addEventListener("click", function () { if (!$("#sheet").classList.contains("load")) closeSheet(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && sheetOpen) closeSheet(); });
  $("#sheet").addEventListener("pointerdown", function () { // touching the sheet stops the auto-close
    if (!$("#shTimer").hidden) { clearTimeout(autoT); $("#shTimer").hidden = true; }
  });

  function personHtml(r) {
    return '<div class="person"><div class="nm">' + esc(r.prefix + r.first + " " + r.last) + "</div>" +
      (r.position ? '<span class="pos">' + esc(r.position) + "</span>" : "") +
      '<dl class="kv"><dt>โรงเรียน</dt><dd>' + esc(r.school) + "</dd>" +
      "<dt>จังหวัด</dt><dd>" + esc(r.province) + (r.affiliation ? " · " + esc(r.affiliation) : "") + "</dd>" +
      '<dt>รหัสบัตร</dt><dd class="mono">' + esc(r.id) + (r.no ? " · ลำดับที่ " + esc(r.no) : "") + "</dd>" +
      '<dt>เบอร์โทร</dt><dd class="mono">•••-•••-' + esc(r.phone4) + "</dd></dl></div>";
  }
  var CLOSE = { label: "สแกนคนถัดไป", cls: "btn ghost", fn: closeSheet };

  function showRecord(r) {
    if (r.got) return showAlready(r);
    openSheet("", "พบข้อมูล · ยังไม่ได้รับของ", personHtml(r), [
      { html: ICON.gift + "ยืนยันมอบของที่ระลึก", cls: "btn green", fn: function () { redeem(r.id); } },
      { label: "ยกเลิก", cls: "btn ghost", fn: closeSheet },
    ]);
  }
  function showAlready(r) {
    beep("warn");
    openSheet("warn", "บัตรนี้รับของที่ระลึกไปแล้ว", personHtml(r) +
      '<div class="when">รับไปเมื่อ ' + esc(r.gotAt || "—") + "</div>", [
      CLOSE,
      { label: "ยกเลิกการรับ (กรณีกดผิด)", cls: "link", fn: function () { undo(r); } },
    ]);
    addLog(r, "warn");
  }
  function showError(msg, retry) {
    beep("warn");
    openSheet("bad", "ทำรายการไม่สำเร็จ", '<p class="msg">' + esc(msg) + "</p>",
      (retry ? [{ label: "ลองอีกครั้ง", cls: "btn", fn: retry }] : []).concat([{ label: "ปิด", cls: "btn ghost", fn: closeSheet }]));
  }
  function netMsg(err) {
    return err && (err.name === "AbortError" || err instanceof TypeError) ? "เชื่อมต่อระบบไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง" : (err && err.message) || "ระบบขัดข้อง";
  }

  function redeem(id) {
    openSheet("load", "กำลังบันทึกการรับของ…", '<p class="msg">' + esc(id) + "</p>");
    api("redeem", { id: id }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || "บันทึกไม่สำเร็จ");
      setStats(j.stats);
      if (!j.found) return notFound(id);
      if (j.already) return showAlready(j.rec);
      beep("ok");
      flash();
      openSheet("ok", "มอบของที่ระลึกเรียบร้อย", personHtml(j.rec) + '<div class="when">บันทึกเวลา ' + esc(j.rec.gotAt) + " แล้ว</div>",
        [CLOSE, { label: "ยกเลิกการรับ (กรณีกดผิด)", cls: "link", fn: function () { undo(j.rec); } }], 3500);
      addLog(j.rec, "ok");
    }).catch(function (err) { showError(netMsg(err), function () { redeem(id); }); });
  }
  function undo(r) {
    if (!confirm("ยกเลิกการรับของของ " + r.first + " " + r.last + " ?\nระบบจะเอาเครื่องหมายรับของออกจาก Sheet")) return;
    openSheet("load", "กำลังยกเลิก…", "");
    api("undo", { id: r.id }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || "ยกเลิกไม่สำเร็จ");
      setStats(j.stats);
      addLog(j.rec || r, "undo");
      toast("ยกเลิกการรับของแล้ว");
      if (j.rec) showRecord(j.rec); else closeSheet();
    }).catch(function (err) { showError(netMsg(err)); });
  }
  function notFound(q) {
    beep("warn");
    openSheet("bad", "ไม่พบข้อมูลในระบบ", '<p class="msg">ไม่พบ <b>' + esc(q) + "</b><br>" +
      "บัตรอาจออกตอนไม่มีสัญญาณและยังไม่ส่งเข้าระบบ ลองค้นด้วยเบอร์โทรหรือชื่อ หรือให้ผู้เข้าร่วมเปิดเว็บลงทะเบียนอีกครั้งเมื่อมีอินเทอร์เน็ต</p>", [
      { label: "ค้นด้วยเบอร์โทร / ชื่อ", cls: "btn", fn: function () { closeSheet(); $("#q").value = ""; $("#q").focus(); } },
      { label: "ปิด", cls: "btn ghost", fn: closeSheet },
    ]);
  }

  function lookup(q, fromScan) {
    q = String(q || "").trim();
    if (!q) return;
    var id = ticketId(q);
    if (fromScan && id && $("#autoRedeem").checked) return redeem(id);
    openSheet("load", "กำลังค้นหา…", '<p class="msg">' + esc(id || q) + "</p>");
    api("lookup", { q: id || q }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || "ค้นหาไม่สำเร็จ");
      setStats(j.stats);
      var rs = j.results || [];
      if (!rs.length) return notFound(id || q);
      if (rs.length === 1) { beep("tick"); return showRecord(rs[0]); }
      openSheet("", "พบ " + rs.length + " รายการ · เลือกคนที่ถูกต้อง",
        '<ul class="pick">' + rs.map(function (r, i) {
          return '<li><button type="button" data-i="' + i + '"><b>' + esc(r.prefix + r.first + " " + r.last) + "</b><span>" + esc(r.school) + " · " + esc(r.id) + "</span>" +
            '<em class="' + (r.got ? "got" : "") + '">' + (r.got ? "รับแล้ว" : "ยังไม่รับ") + "</em></button></li>";
        }).join("") + "</ul>", [{ label: "ปิด", cls: "btn ghost", fn: closeSheet }]);
      Array.prototype.forEach.call(document.querySelectorAll(".pick button"), function (b) {
        b.addEventListener("click", function () { showRecord(rs[Number(b.dataset.i)]); });
      });
    }).catch(function (err) { showError(netMsg(err), function () { lookup(q, fromScan); }); });
  }
  $("#searchForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = $("#q").value.trim();
    if (q.length < 2) { toast("พิมพ์รหัสบัตร เบอร์โทร หรือชื่ออย่างน้อย 2 ตัวอักษร"); return; }
    $("#q").blur();
    lookup(q, false);
  });

  /* ---------------- log (this device) ---------------- */
  function addLog(r, kind) {
    var l = load(LOGKEY, []);
    l.unshift({ id: r.id, name: r.prefix + r.first + " " + r.last, school: r.school, kind: kind, t: Date.now() });
    store(LOGKEY, l.slice(0, 30));
    renderLog();
  }
  function renderLog() {
    var l = load(LOGKEY, []), ol = $("#logList");
    if (!l.length) { ol.innerHTML = '<li class="empty">ยังไม่มีรายการ</li>'; return; }
    var lbl = { ok: "มอบแล้ว", warn: "สแกนซ้ำ · รับไปแล้ว", undo: "ยกเลิกการรับ" };
    ol.innerHTML = l.slice(0, 12).map(function (x) {
      var d = new Date(x.t);
      return '<li><i class="dot ' + (x.kind === "ok" ? "" : x.kind) + '"></i><div class="nm"><b>' + esc(x.name) + "</b><span>" + esc(x.id) + " · " + lbl[x.kind] + "</span></div>" +
        "<time>" + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + "</time></li>";
    }).join("");
  }

  /* ---------------- camera + QR ---------------- */
  var video = $("#video"), stream = null, detector = null, jsqrReady = null, scanCanvas = null, lastCode = "", lastAt = 0, loopT = 0, wantCam = true;
  function setCamMsg(t, s) { $("#camTitle").textContent = t; $("#camSub").textContent = s; }
  function flash() { var sc = $("#scanner"); sc.classList.remove("flash"); void sc.offsetWidth; sc.classList.add("flash"); }

  function loadJsQR() {
    if (window.jsQR) return Promise.resolve();
    if (!jsqrReady) jsqrReady = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = JSQR_SRC; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
    return jsqrReady;
  }
  function initDetector() {
    if (detector !== null) return Promise.resolve();
    if ("BarcodeDetector" in window) {
      return window.BarcodeDetector.getSupportedFormats().then(function (f) {
        detector = f.indexOf("qr_code") >= 0 ? new window.BarcodeDetector({ formats: ["qr_code"] }) : false;
        if (!detector) return loadJsQR();
      }).catch(function () { detector = false; return loadJsQR(); });
    }
    detector = false;
    return loadJsQR();
  }

  function startCam() {
    wantCam = true;
    $("#camBtn").textContent = "ปิดกล้อง";
    if (stream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCamMsg("เครื่องนี้เปิดกล้องจากเว็บไม่ได้", "ใช้ช่องพิมพ์รหัสบัตรด้านล่างแทน"); return;
    }
    setCamMsg("กำลังเปิดกล้อง…", "อนุญาตให้ใช้กล้องเมื่อมีหน้าต่างถาม");
    Promise.all([
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
      initDetector(),
    ]).then(function (r) {
      stream = r[0];
      if (!wantCam) return stopCam();
      video.srcObject = stream;
      return video.play();
    }).then(function () {
      if (!stream) return;
      $("#scanner").classList.add("live"); $("#scanHint").hidden = false;
      scanLoop();
    }).catch(function (err) {
      stopCam();
      var denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
      setCamMsg(denied ? "ยังไม่ได้อนุญาตให้ใช้กล้อง" : "เปิดกล้องไม่ได้",
        denied ? "อนุญาตกล้องในการตั้งค่าเบราว์เซอร์ แล้วแตะที่นี่อีกครั้ง · หรือพิมพ์รหัสบัตรด้านล่าง" : "แตะเพื่อลองอีกครั้ง · หรือพิมพ์รหัสบัตรด้านล่าง");
    });
  }
  function stopCam() {
    clearTimeout(loopT);
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null; video.srcObject = null;
    $("#scanner").classList.remove("live"); $("#scanHint").hidden = true;
    setCamMsg("แตะเพื่อเปิดกล้องสแกน QR", "เล็ง QR บนบัตรให้อยู่ในกรอบ");
  }
  $("#camBtn").addEventListener("click", function () {
    if (stream) { wantCam = false; stopCam(); $("#camBtn").textContent = "เปิดกล้อง"; } else startCam();
  });
  $("#scanner").addEventListener("click", function () { if (!stream) startCam(); });
  document.addEventListener("visibilitychange", function () {
    if (!session) return;
    if (document.hidden) { if (stream) { stopCam(); wantCam = true; } }
    else if (wantCam && !stream) startCam();
  });

  function onCode(text) {
    var now = Date.now();
    var id = ticketId(text);
    if (!id) {
      if (text !== lastCode || now - lastAt > 4000) { toast("QR นี้ไม่ใช่บัตรเข้าร่วมงาน TGGC"); beep("tick"); }
      lastCode = text; lastAt = now; return;
    }
    if (id === lastCode && now - lastAt < 6000) { lastAt = now; return; } // same card still in view: ignore until it leaves for 6s
    lastCode = id; lastAt = now;
    flash();
    lookup(id, true);
  }

  function scanLoop() {
    clearTimeout(loopT);
    if (!stream) return;
    var next = function (ms) { loopT = setTimeout(scanLoop, ms); };
    if (sheetOpen || video.readyState < 2) return next(250);
    if (detector) {
      detector.detect(video).then(function (codes) {
        if (codes && codes.length) onCode(codes[0].rawValue);
        next(120);
      }).catch(function () { next(300); });
      return;
    }
    if (!window.jsQR) return next(300);
    // centre crop, downscaled: fast enough on older phones
    var vw = video.videoWidth, vh = video.videoHeight, side = Math.min(vw, vh), size = 520;
    scanCanvas = scanCanvas || document.createElement("canvas");
    scanCanvas.width = size; scanCanvas.height = size;
    var cx = scanCanvas.getContext("2d", { willReadFrequently: true });
    cx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, size, size);
    var hit = window.jsQR(cx.getImageData(0, 0, size, size).data, size, size, { inversionAttempts: "dontInvert" });
    if (hit && hit.data) onCode(hit.data);
    next(140);
  }

  /* ---------------- boot ---------------- */
  if (!ENDPOINT) { $("#pin").placeholder = "ตัวอย่าง: 123456"; }
  if (session && session.pin) showApp();
  else { $("#station").value = (load(KEY + ".station", "") || ""); }
  $("#station").addEventListener("change", function () { store(KEY + ".station", $("#station").value.trim()); });
})();
