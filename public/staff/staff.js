/* TGGC 2569 – staff page: scan a ticket QR → look it up → confirm souvenir hand-over.
   Built for several scanners working at once on event-day Wi-Fi:
   - each phone keeps the registration list in memory (refreshed every 15 s), so a scan answers instantly;
   - hand-overs are shown at once and sent to the Sheet in the background, in batches, through a queue
     that survives reloads and bad signal; the server (with a lock) stays the judge of "already received".
   Talks to the same Apps Script as the participant site; every call carries the staff PIN.
   With no ENDPOINT (preview) it runs against a small in-memory demo list. */
(function () {
  "use strict";
  var UA = navigator.userAgent || "";
  // LINE's in-app browser asks for the camera every time (and sometimes cannot use it): hand over to the real browser
  if (/\bLine\//i.test(UA) && !/openExternalBrowser=1/.test(location.search)) {
    location.replace(location.pathname + (location.search ? location.search + "&" : "?") + "openExternalBrowser=1" + location.hash);
    return;
  }

  var CFG = window.TGGC_CONFIG || {};
  var ENDPOINT = (CFG.ENDPOINT || "").trim();
  var JSQR_SRC = CFG.JSQR_SRC || "/vendor/jsqr.min.js";
  var KEY = "tggc69.staff", LOGKEY = "tggc69.staff.log", QKEY = "tggc69.staff.queue", RKEY = "tggc69.staff.roster";
  var POLL_MS = 15000;

  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var toastT;
  function toast(m) { var t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2600); }
  function ticketId(s) { var m = String(s || "").toUpperCase().match(/TG-?([2-9A-HJ-NP-Z]{5})/); return m ? "TG-" + m[1] : ""; }
  function pad(n) { return String(n).padStart(2, "0"); }
  function fmtAt(ms) { var d = new Date(ms); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + " น. · " + pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  var ICON = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>',
    bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3.5-5-1s3 1 5 1c2 0 5 1.5 5-1s-3.5-2-5 1"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.4-2h6.6l1.4 2h1.8A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.6"/></svg>',
    load: '<span class="spin"></span>',
  };

  /* ---------------- API ---------------- */
  var session = load(KEY, null), loggedIn = false, online = true;
  function api(action, data, timeoutMs) {
    var payload = Object.assign({ action: action, pin: session && session.pin, station: session && session.station }, data || {});
    if (!ENDPOINT) return demoApi(payload);
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 20000);
    return fetch(ENDPOINT, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload), redirect: "follow", signal: ctrl ? ctrl.signal : undefined,
    }).then(function (r) { return r.json(); }).finally(function () { clearTimeout(timer); })
      .then(function (j) {
        setOnline(true);
        if (j && j.auth === false && loggedIn) { logout(j.error); throw new Error(j.error); }
        return j;
      }, function (err) { setOnline(false); throw err; });
  }
  function oldServer(j) { return j && !j.ok && j.auth !== false && /คำสั่งไม่ถูกต้อง/.test(j.error || ""); }

  // preview / demo backend (PIN 123456)
  var DEMO = [
    ["TG-7K2QM", "นาย", "สมชาย", "ใจดี", "ครู", "โรงเรียนชลประทานวิทยา", "นนทบุรี", "สพม.นนทบุรี", "0812345678", true],
    ["TG-H4N8P", "นางสาว", "พิมพ์ชนก", "รักษ์โลก", "ครูผู้ช่วย", "โรงเรียนสตรีนนทบุรี", "นนทบุรี", "สพม.นนทบุรี", "0898765432", false],
    ["TG-3XW9R", "นาง", "วรรณา", "แผนที่ดี", "ผู้อำนวยการ", "โรงเรียนเบญจมราชานุสรณ", "นนทบุรี", "สพม.นนทบุรี", "0861112222", false],
    ["TG-MZ6TD", "ดร.", "กิตติ", "ภูมิสารสนเทศ", "รองผู้อำนวยการ", "โรงเรียนปากเกร็ด", "นนทบุรี", "สพม.นนทบุรี", "0823334444", false],
    ["TG-Q5VBE", "นาย", "ธนพล", "ดาวเทียม", "ศึกษานิเทศก์", "โรงเรียนสวนกุหลาบวิทยาลัย นนทบุรี", "นนทบุรี", "สพม.นนทบุรี", "0845556666", false],
  ].map(function (x, i) {
    return { id: x[0], no: i + 1, prefix: x[1], first: x[2], last: x[3], position: x[4], school: x[5], province: x[6], affiliation: x[7], phone: x[8], got: x[9], gotAt: x[9] ? "08:42 น. · 28/11/2026" : "", by: x[9] ? "ครูมานี" : "" };
  });
  function demoApi(p) {
    return new Promise(function (res) {
      setTimeout(function () {
        if (p.pin !== "123456") return res({ ok: false, auth: false, error: "PIN ไม่ถูกต้อง (ตัวอย่าง: 123456)" });
        var st = { total: DEMO.length, got: DEMO.filter(function (r) { return r.got; }).length };
        function rec(r) { var o = Object.assign({}, r, { phone4: r.phone.slice(-4) }); delete o.phone; return o; }
        if (p.action === "roster") {
          return res({ ok: true, rows: DEMO.map(function (r) { return [r.id, r.no, r.prefix, r.first, r.last, r.position, r.school, r.province, r.affiliation, r.phone.slice(-4), r.got ? 1 : 0, r.gotAt, r.by]; }), stats: st });
        }
        if (p.action === "login" || p.action === "stats") return res({ ok: true, stats: st });
        if (p.action === "lookup") {
          var q = String(p.q || "").trim(), id = ticketId(q), d = q.replace(/\D/g, "");
          return res({ ok: true, stats: st, results: DEMO.filter(function (r) {
            return id ? r.id === id : d.length >= 9 ? r.phone === d : q.length >= 2 && (r.first + " " + r.last).indexOf(q) >= 0;
          }).map(rec) });
        }
        if (p.action === "batch") {
          return res({ ok: true, results: (p.ops || []).map(function (op) {
            var r = DEMO.filter(function (x) { return x.id === op.id; })[0];
            if (!r) return { k: op.k, id: op.id, s: "notfound" };
            if (op.a === "redeem") {
              if (r.got) return { k: op.k, id: op.id, s: "already", gotAt: r.gotAt, by: r.by };
              r.got = true; r.gotAt = fmtAt(op.at); r.by = op.by;
              return { k: op.k, id: op.id, s: "redeemed", gotAt: r.gotAt };
            }
            if (!r.got) return { k: op.k, id: op.id, s: "notgot" };
            r.got = false; r.gotAt = ""; r.by = "";
            return { k: op.k, id: op.id, s: "undone" };
          }) });
        }
        res({ ok: false, error: "คำสั่งไม่ถูกต้อง" });
      }, 350);
    });
  }

  /* ---------------- local roster (in memory + this device) ---------------- */
  var roster = {}, rosterReady = false, legacy = false, syncing = false, lastSync = 0, confirmed = {};
  function fromRow(a) {
    return { id: String(a[0]), no: a[1], prefix: a[2] || "", first: a[3] || "", last: a[4] || "", position: a[5] || "", school: a[6] || "",
      province: a[7] || "", affiliation: a[8] || "", phone4: String(a[9] || ""), got: !!a[10], gotAt: a[11] || "", by: a[12] || "" };
  }
  function toRow(r) { return [r.id, r.no, r.prefix, r.first, r.last, r.position, r.school, r.province, r.affiliation, r.phone4, r.got ? 1 : 0, r.gotAt, r.by]; }
  // what this phone already knows better than a list fetched a moment ago: pending hand-overs and fresh server answers
  function overlay(map, since) {
    queue.forEach(function (op) {
      var r = map[op.id]; if (!r) return;
      if (op.a === "redeem") { r.got = true; r.gotAt = fmtAt(op.at); r.by = op.by; } else { r.got = false; r.gotAt = ""; r.by = ""; }
    });
    Object.keys(confirmed).forEach(function (id) {
      var c = confirmed[id];
      if (Date.now() - c.t > 120000) { delete confirmed[id]; return; }
      if (map[id] && c.t > since && !queue.some(function (o) { return o.id === id; })) Object.assign(map[id], c.v);
    });
  }
  function applyRoster(rows, since) {
    var map = {};
    rows.forEach(function (a) { var r = fromRow(a); if (r.id) map[r.id] = r; });
    overlay(map, since);
    roster = map; rosterReady = true; lastSync = Date.now();
    store(RKEY, { t: lastSync, rows: Object.keys(map).map(function (k) { return toRow(map[k]); }) });
    updateStats(); renderSync();
  }
  function upsert(rec) { // record that came from a server lookup
    var r = roster[rec.id] || {};
    Object.assign(r, { id: rec.id, no: rec.no, prefix: rec.prefix || "", first: rec.first || "", last: rec.last || "", position: rec.position || "",
      school: rec.school || "", province: rec.province || "", affiliation: rec.affiliation || "", phone4: rec.phone4 || "", got: !!rec.got, gotAt: rec.gotAt || "", by: rec.by || r.by || "" });
    roster[rec.id] = r;
    overlay((function () { var m = {}; m[r.id] = r; return m; })(), Date.now());
    return r;
  }
  function syncRoster() {
    if (!session || syncing) return Promise.resolve();
    if (legacy) return api("stats").then(function (j) { if (j && j.ok) { serverStats = j.stats; updateStats(); } }).catch(function () {});
    syncing = true;
    var since = Date.now();
    return api("roster", null, 25000).then(function (j) {
      if (oldServer(j)) { goLegacy(); return; }
      if (j && j.ok) applyRoster(j.rows || [], since);
    }).catch(function () {}).finally(function () { syncing = false; renderSync(); });
  }
  function goLegacy() {
    if (legacy) return;
    legacy = true; rosterReady = false;
    toast("หลังบ้าน (Code.gs) ยังเป็นรุ่นเก่า — ใช้งานได้ แต่ช้ากว่า ควรอัปเดต");
    syncRoster();
  }
  setInterval(function () { if (loggedIn && !document.hidden) syncRoster(); }, POLL_MS);
  window.addEventListener("online", function () { if (loggedIn) { syncRoster(); flush(); } });

  /* ---------------- login ---------------- */
  function showApp() {
    loggedIn = true;
    $("#loginView").hidden = true; $("#appView").hidden = false;
    $("#stationTxt").textContent = "เจ้าหน้าที่: " + (session.station || "—");
    var cached = load(RKEY, null);
    if (!rosterReady && cached && cached.rows) applyRoster(cached.rows, 0);
    renderLog(); updateStats(); renderSync();
    if (Date.now() - lastSync > 3000) syncRoster();
    flush();
    startCam();
    checkCamPerm();
  }
  function logout(msg) {
    if (queue.length && !msg && !confirm("ยังมี " + queue.length + " รายการที่รอส่งเข้า Sheet\nระบบจะเก็บไว้ส่งต่อเมื่อเข้าสู่ระบบครั้งถัดไป\n\nออกจากระบบ?")) return;
    loggedIn = false;
    releaseCam();
    var station = session && session.station;
    session = null; store(KEY, null);
    roster = {}; rosterReady = false; legacy = false; store(RKEY, null);
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
    var since = Date.now();
    api("roster", null, 25000).then(function (j) {
      if (oldServer(j)) { legacy = true; return api("login"); } // Code.gs not updated yet: still works, the slow way
      return j;
    }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || "เข้าสู่ระบบไม่สำเร็จ");
      store(KEY, session); store(KEY + ".station", station); e.hidden = true;
      if (j.rows) applyRoster(j.rows, since); else if (j.stats) serverStats = j.stats;
      showApp();
    }).catch(function (err) {
      session = null; legacy = false;
      e.hidden = false;
      e.textContent = err.name === "AbortError" || err instanceof TypeError ? "เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง" : err.message;
    }).finally(function () { btn.disabled = false; btn.textContent = "เข้าสู่ระบบ"; });
  });
  $("#logoutBtn").addEventListener("click", function () { if (queue.length || confirm("ออกจากระบบเจ้าหน้าที่?")) logout(); });

  /* ---------------- stats + sync status ---------------- */
  var serverStats = null;
  function updateStats() {
    var s = serverStats;
    if (rosterReady) {
      var got = 0, total = 0;
      for (var k in roster) { total++; if (roster[k].got) got++; }
      s = { total: total, got: got };
    }
    if (!s) return;
    $("#statGot").textContent = s.got; $("#statTotal").textContent = s.total;
    var pct = s.total ? Math.round((s.got / s.total) * 100) : 0;
    $("#statPct").textContent = "· " + pct + "%";
    $("#statBar").style.width = pct + "%";
  }
  function setOnline(v) { if (online !== v) { online = v; renderSync(); } }
  function renderSync() {
    var el = $("#syncPill"); if (!el) return;
    var n = queue.length, cls, txt;
    if (!online) { cls = "off"; txt = n ? "ออฟไลน์ · รอส่ง " + n : "ออฟไลน์"; }
    else if (n) { cls = "pend"; txt = "กำลังส่ง " + n + " รายการ"; }
    else { cls = "ok"; txt = lastSync ? "ซิงก์ " + pad(new Date(lastSync).getHours()) + ":" + pad(new Date(lastSync).getMinutes()) + ":" + pad(new Date(lastSync).getSeconds()) : "ออนไลน์"; }
    el.className = "sync-pill " + cls; el.textContent = txt;
  }

  /* ---------------- send queue (survives reloads / no signal) ---------------- */
  var queue = load(QKEY, []), flushing = false, backoff = 0, flushT;
  function saveQ() { store(QKEY, queue); renderSync(); }
  function enqueue(op) { queue.push(op); saveQ(); flush(); }
  function flush() {
    if (flushing || !queue.length || !session) return;
    flushing = true; clearTimeout(flushT);
    var ops = queue.slice(0, 25);
    var send = legacy ? sendLegacy(ops) : api("batch", { ops: ops }).then(function (j) {
      if (oldServer(j)) { goLegacy(); return sendLegacy(ops); }
      if (!j || !j.ok || !j.results || !j.results.length) throw new Error((j && j.error) || "ส่งไม่สำเร็จ");
      return j.results;
    });
    send.then(function (results) {
      backoff = 0;
      var done = {};
      results.forEach(function (res) { done[res.k] = 1; onResult(res, ops); });
      queue = queue.filter(function (o) { return !done[o.k]; });
      saveQ(); renderLog(); updateStats();
    }).catch(function () {
      backoff = Math.min(backoff ? backoff * 2 : 2000, 20000);
      flushT = setTimeout(flush, backoff);
    }).finally(function () {
      flushing = false; renderSync();
      if (queue.length && !backoff) flush();
    });
  }
  function sendLegacy(ops) { // old Code.gs: one request per hand-over
    var out = [];
    return ops.reduce(function (p, op) {
      return p.then(function () {
        return api(op.a, { id: op.id }).then(function (j) {
          if (!j || !j.ok) throw new Error((j && j.error) || "ส่งไม่สำเร็จ");
          out.push({ k: op.k, id: op.id, s: !j.found ? "notfound" : j.already ? "already" : j.redeemed ? "redeemed" : "undone",
            gotAt: j.rec && j.rec.gotAt, by: "" });
        });
      });
    }, Promise.resolve()).then(function () { return out; }, function (err) { if (out.length) return out; throw err; });
  }
  function onResult(res, ops) {
    var op = ops.filter(function (o) { return o.k === res.k; })[0] || {}, r = roster[res.id];
    var label = document.querySelector('[data-sync="' + res.k + '"]');
    if (res.s === "already" && op.a === "redeem") {
      if (r) { r.got = true; r.gotAt = res.gotAt || r.gotAt; r.by = res.by || ""; }
      confirmed[res.id] = { t: Date.now(), v: { got: true, gotAt: res.gotAt || "", by: res.by || "" } };
      setLogKind(res.k, "warn");
      beep("warn");
      if (r) openSheet("warn", "บัตรนี้รับของไปแล้วจากอีกเครื่อง", personHtml(r) +
        '<div class="when">รับไปก่อนแล้วเมื่อ ' + esc(res.gotAt || "—") + (res.by ? " โดย " + esc(res.by) : "") + "</div>" +
        '<p class="msg">การสแกนที่เครื่องนี้ (' + esc(new Date(op.at).toTimeString().slice(0, 5)) + " น.) ไม่ได้บันทึกซ้ำใน Sheet</p>", [CLOSE]);
      else toast(res.id + " รับของไปแล้วจากอีกเครื่อง");
      return;
    }
    if (res.s === "notfound") {
      if (r) { r.got = false; r.gotAt = ""; }
      setLogKind(res.k, "bad");
      beep("warn"); toast("ไม่พบ " + res.id + " ในระบบ — รายการนี้ไม่ได้บันทึก");
      return;
    }
    var got = res.s === "redeemed" || res.s === "already";
    confirmed[res.id] = { t: Date.now(), v: got ? { got: true, gotAt: res.gotAt || (r && r.gotAt) || "", by: (r && r.by) || "" } : { got: false, gotAt: "", by: "" } };
    if (r && res.gotAt && got) r.gotAt = res.gotAt;
    if (label) { label.textContent = "บันทึกใน Sheet แล้ว ✓"; label.classList.add("done"); }
  }
  window.addEventListener("beforeunload", function (e) { if (queue.length && ENDPOINT) { e.preventDefault(); e.returnValue = ""; } });

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
  // sheetScan: the camera keeps scanning while this sheet is up (a new card simply replaces it)
  var sheetOpen = false, sheetScan = false, autoT;
  function openSheet(kind, title, body, actions, autoMs, scanThrough) {
    var sh = $("#sheet");
    sh.className = "sheet " + (kind || "");
    $("#shIco").innerHTML = ICON[kind === "ok" ? "ok" : kind === "warn" ? "warn" : kind === "bad" ? "bad" : kind === "load" ? "load" : kind === "cam" ? "cam" : "gift"];
    $("#shTitle").textContent = title;
    $("#shBody").innerHTML = body || "";
    var box = $("#shActions"); box.innerHTML = "";
    (actions || []).forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button"; b.className = a.cls || "btn"; b.innerHTML = a.html || esc(a.label);
      b.addEventListener("click", a.fn); box.appendChild(b);
    });
    $("#sheetWrap").hidden = false; sheetOpen = true; sheetScan = !!scanThrough;
    clearTimeout(autoT);
    var tm = $("#shTimer");
    tm.hidden = !autoMs; tm.classList.remove("run");
    if (autoMs) { tm.style.setProperty("--t", autoMs + "ms"); void tm.offsetWidth; tm.classList.add("run"); autoT = setTimeout(closeSheet, autoMs); }
    var first = box.querySelector(".btn"); if (first && kind !== "load" && !scanThrough) setTimeout(function () { first.focus({ preventScroll: true }); }, 50);
  }
  // keep lastCode: the card that was just handled is often still in front of the camera
  function closeSheet() { clearTimeout(autoT); $("#sheetWrap").hidden = true; sheetOpen = false; sheetScan = false; lastAt = Date.now(); }
  $("#backdrop").addEventListener("click", function () { if (!$("#sheet").classList.contains("load")) closeSheet(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && sheetOpen) closeSheet(); });
  $("#sheet").addEventListener("pointerdown", function () { // touching the sheet stops the auto-close
    if (!$("#shTimer").hidden) { clearTimeout(autoT); $("#shTimer").hidden = true; sheetScan = false; }
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
      { html: ICON.gift + "ยืนยันมอบของที่ระลึก", cls: "btn green", fn: function () { redeem(r); } },
      { label: "ยกเลิก", cls: "btn ghost", fn: closeSheet },
    ]);
  }
  function showAlready(r) {
    beep("warn");
    openSheet("warn", "บัตรนี้รับของที่ระลึกไปแล้ว", personHtml(r) +
      '<div class="when">รับไปเมื่อ ' + esc(r.gotAt || "—") + (r.by ? " โดย " + esc(r.by) : "") + "</div>", [
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

  // shown at once; written to the Sheet by the queue (the server still refuses a second hand-over)
  function redeem(r) {
    r = roster[r.id] || r; // the list may have been refreshed while this sheet was open
    if (r.got) return showAlready(r);
    var op = { k: uid(), a: "redeem", id: r.id, at: Date.now(), by: session.station };
    r.got = true; r.gotAt = fmtAt(op.at); r.by = op.by;
    enqueue(op);
    beep("ok"); flash();
    var auto = $("#autoRedeem").checked;
    openSheet("ok", "มอบของที่ระลึกได้เลย", personHtml(r) +
      '<div class="when">บันทึกเวลา ' + esc(r.gotAt) + ' <span class="sync" data-sync="' + op.k + '">' + (online ? "กำลังส่งเข้า Sheet…" : "รอสัญญาณ จะส่งให้อัตโนมัติ") + "</span></div>",
      [CLOSE, { label: "ยกเลิกการรับ (กรณีกดผิด)", cls: "link", fn: function () { undo(r); } }], auto ? 2200 : 3200, true);
    addLog(r, "ok", op.k);
    updateStats();
  }
  function undo(r) {
    if (!confirm("ยกเลิกการรับของของ " + r.first + " " + r.last + " ?\nระบบจะเอาเครื่องหมายรับของออกจาก Sheet")) return;
    r = roster[r.id] || r;
    var waiting = queue.filter(function (o) { return o.id === r.id && o.a === "redeem"; })[0];
    if (waiting && !flushing) { queue = queue.filter(function (o) { return o !== waiting; }); saveQ(); } // never sent: just drop it
    else enqueue({ k: uid(), a: "undo", id: r.id, at: Date.now(), by: session.station });
    r.got = false; r.gotAt = ""; r.by = "";
    addLog(r, "undo");
    updateStats();
    toast("ยกเลิกการรับของแล้ว");
    showRecord(r);
  }
  function notFound(q) {
    beep("warn");
    openSheet("bad", "ไม่พบข้อมูลในระบบ", '<p class="msg">ไม่พบ <b>' + esc(q) + "</b><br>" +
      "บัตรอาจออกตอนไม่มีสัญญาณและยังไม่ส่งเข้าระบบ ลองค้นด้วยเบอร์โทรหรือชื่อ หรือให้ผู้เข้าร่วมเปิดเว็บลงทะเบียนอีกครั้งเมื่อมีอินเทอร์เน็ต</p>", [
      { label: "ค้นด้วยเบอร์โทร / ชื่อ", cls: "btn", fn: function () { closeSheet(); $("#q").value = ""; $("#q").focus(); } },
      { label: "ปิด", cls: "btn ghost", fn: closeSheet },
    ]);
  }
  function showPick(rs) {
    openSheet("", "พบ " + rs.length + " รายการ · เลือกคนที่ถูกต้อง",
      '<ul class="pick">' + rs.map(function (r, i) {
        return '<li><button type="button" data-i="' + i + '"><b>' + esc(r.prefix + r.first + " " + r.last) + "</b><span>" + esc(r.school) + " · " + esc(r.id) + "</span>" +
          '<em class="' + (r.got ? "got" : "") + '">' + (r.got ? "รับแล้ว" : "ยังไม่รับ") + "</em></button></li>";
      }).join("") + "</ul>", [{ label: "ปิด", cls: "btn ghost", fn: closeSheet }]);
    Array.prototype.forEach.call(document.querySelectorAll(".pick button"), function (b) {
      b.addEventListener("click", function () { var r = rs[Number(b.dataset.i)]; beep("tick"); showRecord(roster[r.id] || r); });
    });
  }

  function handleId(id, fromScan) {
    var r = rosterReady && roster[id];
    if (!r) return serverLookup(id, fromScan); // not on this phone yet (just registered?) → ask the server
    if (r.got) return showAlready(r);
    if (fromScan && $("#autoRedeem").checked) return redeem(r);
    beep("tick"); showRecord(r);
  }
  function serverLookup(q, fromScan) {
    var id = ticketId(q), digits = q.replace(/\D/g, "");
    openSheet("load", "กำลังค้นหา…", '<p class="msg">' + esc(id || q) + "</p>");
    api("lookup", { q: id || q }, 12000).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || "ค้นหาไม่สำเร็จ");
      if (!rosterReady && j.stats) { serverStats = j.stats; updateStats(); }
      var rs = (j.results || []).map(upsert);
      if (!rs.length) return notFound(id || q);
      if (rs.length === 1) {
        if (rs[0].got) return showAlready(rs[0]);
        if (fromScan && id && $("#autoRedeem").checked) return redeem(rs[0]);
        beep("tick"); return showRecord(rs[0]);
      }
      showPick(rs);
    }).catch(function (err) {
      // no signal: last 4 digits of the phone are on this device, offer those matches
      var local = digits.length >= 9 ? values().filter(function (r) { return r.phone4 && r.phone4 === digits.slice(-4); }) : [];
      if (local.length) { toast("ออฟไลน์ · แสดงรายชื่อที่เบอร์ลงท้าย " + digits.slice(-4)); return showPick(local); }
      showError(id && rosterReady ? "ไม่พบ " + id + " ในรายชื่อบนเครื่องนี้ และ" + netMsg(err) : netMsg(err), function () { serverLookup(q, fromScan); });
    });
  }
  function values() { return Object.keys(roster).map(function (k) { return roster[k]; }); }
  function lookup(q, fromScan) {
    q = String(q || "").trim();
    if (!q) return;
    var id = ticketId(q);
    if (id) return handleId(id, fromScan);
    if (!rosterReady || q.replace(/\D/g, "").length >= 9) return serverLookup(q, false);
    var ql = q.toLowerCase().replace(/\s+/g, " ");
    var rs = values().filter(function (r) { return (r.first + " " + r.last).toLowerCase().indexOf(ql) >= 0 || (r.prefix + r.first + " " + r.last).toLowerCase().indexOf(ql) >= 0; }).slice(0, 8);
    if (!rs.length) return serverLookup(q, false);
    if (rs.length === 1) { beep("tick"); return showRecord(rs[0]); }
    showPick(rs);
  }
  $("#searchForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = $("#q").value.trim();
    if (q.length < 2) { toast("พิมพ์รหัสบัตร เบอร์โทร หรือชื่ออย่างน้อย 2 ตัวอักษร"); return; }
    $("#q").blur();
    lookup(q, false);
  });

  /* ---------------- log (this device) ---------------- */
  function addLog(r, kind, k) {
    var l = load(LOGKEY, []);
    l.unshift({ id: r.id, name: r.prefix + r.first + " " + r.last, school: r.school, kind: kind, t: Date.now(), k: k || "" });
    store(LOGKEY, l.slice(0, 30));
    renderLog();
  }
  function setLogKind(k, kind) {
    var l = load(LOGKEY, []);
    l.forEach(function (x) { if (x.k === k) x.kind = kind; });
    store(LOGKEY, l); renderLog();
  }
  function renderLog() {
    var l = load(LOGKEY, []), ol = $("#logList");
    if (!l.length) { ol.innerHTML = '<li class="empty">ยังไม่มีรายการ</li>'; return; }
    var lbl = { ok: "มอบแล้ว", warn: "สแกนซ้ำ · รับไปแล้ว", undo: "ยกเลิกการรับ", bad: "ไม่พบในระบบ · ไม่ได้บันทึก" };
    var pend = {}; queue.forEach(function (o) { pend[o.k] = 1; });
    ol.innerHTML = l.slice(0, 12).map(function (x) {
      var d = new Date(x.t);
      return '<li><i class="dot ' + (x.kind === "ok" ? "" : x.kind) + '"></i><div class="nm"><b>' + esc(x.name) + "</b><span>" + esc(x.id) + " · " + lbl[x.kind] +
        (x.k && pend[x.k] ? ' <em class="pend">รอส่ง</em>' : "") + "</span></div>" +
        "<time>" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + "</time></li>";
    }).join("");
  }

  /* ---------------- camera + QR ---------------- */
  // The stream is opened once and kept: pausing/backgrounding only disables it, so the browser does not ask again.
  var video = $("#video"), stream = null, detector = null, jsqrReady = null, scanCanvas = null, lastCode = "", lastAt = 0, loopT = 0, wantCam = true, opening = false;
  function setCamMsg(t, s) { $("#camTitle").textContent = t; $("#camSub").textContent = s; }
  function flash() { var sc = $("#scanner"); sc.classList.remove("flash"); void sc.offsetWidth; sc.classList.add("flash"); }
  function camLive() { return !!stream && stream.getVideoTracks().some(function (t) { return t.readyState === "live"; }); }
  function setLiveUi(on) {
    $("#scanner").classList.toggle("live", on); $("#scanHint").hidden = !on;
    if (!on) setCamMsg(wantCam ? "แตะเพื่อเปิดกล้องสแกน QR" : "กล้องหยุดชั่วคราว", wantCam ? "เล็ง QR บนบัตรให้อยู่ในกรอบ" : "แตะเพื่อสแกนต่อ (ไม่ต้องกดอนุญาตใหม่)");
  }

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
    $("#camBtn").textContent = "หยุดกล้อง";
    if (camLive()) { // resume the stream we already have: no new permission prompt
      stream.getVideoTracks().forEach(function (t) { t.enabled = true; });
      var pl = video.play(); if (pl && pl.catch) pl.catch(function () {});
      setLiveUi(true); scanLoop(); return;
    }
    if (opening) return;
    releaseCam(true);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCamMsg("เครื่องนี้เปิดกล้องจากเว็บไม่ได้", "ใช้ช่องพิมพ์รหัสบัตรด้านล่างแทน"); return;
    }
    opening = true;
    setCamMsg("กำลังเปิดกล้อง…", "ถ้ามีหน้าต่างถาม ให้กด \"อนุญาต\"");
    Promise.all([
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
      initDetector(),
    ]).then(function (r) {
      stream = r[0];
      stream.getVideoTracks().forEach(function (t) {
        t.addEventListener("ended", function () { if (stream && !camLive()) { releaseCam(true); if (wantCam && loggedIn && !document.hidden) startCam(); } });
      });
      video.srcObject = stream;
      if (!wantCam) { pauseCam(); return; }
      return video.play();
    }).then(function () {
      if (!stream || !wantCam) return;
      setLiveUi(true);
      scanLoop();
      checkCamPerm();
    }).catch(function (err) {
      releaseCam(true);
      var denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
      setCamMsg(denied ? "ยังไม่ได้อนุญาตให้ใช้กล้อง" : "เปิดกล้องไม่ได้",
        denied ? "ดูวิธีตั้งค่าด้านล่าง แล้วแตะที่นี่อีกครั้ง · หรือพิมพ์รหัสบัตร" : "แตะเพื่อลองอีกครั้ง · หรือพิมพ์รหัสบัตรด้านล่าง");
      if (denied) { $("#camHelp").hidden = false; showCamHelp(); }
    }).finally(function () { opening = false; });
  }
  function pauseCam() { // keeps permission + stream; the camera light goes off on most phones
    wantCam = false;
    clearTimeout(loopT);
    if (stream) stream.getVideoTracks().forEach(function (t) { t.enabled = false; });
    setLiveUi(false);
    $("#camBtn").textContent = "เปิดกล้อง";
  }
  function releaseCam(keepWant) { // full stop: logout, or the browser already killed the stream
    clearTimeout(loopT);
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null; video.srcObject = null;
    if (!keepWant) wantCam = false;
    setLiveUi(false);
  }
  $("#camBtn").addEventListener("click", function () { if (wantCam && camLive()) pauseCam(); else startCam(); });
  $("#scanner").addEventListener("click", function () { if (!wantCam || !camLive()) startCam(); });
  document.addEventListener("visibilitychange", function () {
    if (!loggedIn) return;
    if (document.hidden) { clearTimeout(loopT); return; }
    syncRoster(); flush();
    if (wantCam) startCam(); // reuses the stream when the browser kept it alive
  });

  /* ---- "always allow" help: the browser owns this setting, so show the exact steps for this phone ---- */
  function camHelpHtml() {
    var ios = /iP(hone|ad|od)/.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var inApp = /FBAN|FBAV|FB_IAB|Instagram|Messenger|\bLine\//i.test(UA);
    var steps, name;
    if (inApp) {
      name = "แอปแชต (Facebook / Messenger / LINE)";
      steps = ["แตะเมนู ⋯ มุมขวาบน", "เลือก <b>เปิดในเบราว์เซอร์</b> (Safari / Chrome)", "เข้าสู่ระบบอีกครั้ง แล้วทำตามขั้นตอนของเบราว์เซอร์นั้น"];
    } else if (ios && /CriOS/.test(UA)) {
      name = "Chrome บน iPhone";
      steps = ["แนะนำให้ใช้ <b>Safari</b> แทน — ตั้งค่าอนุญาตถาวรได้แน่นอนกว่า", "ถ้าใช้ Chrome: เปิดแอป <b>ตั้งค่า</b> ของ iPhone → <b>Chrome</b> → เปิด <b>กล้อง</b>", "กลับมาหน้านี้ เมื่อถาม ให้กด <b>อนุญาต</b>"];
    } else if (ios) {
      name = "Safari บน iPhone / iPad";
      steps = ["แตะปุ่ม <b>aA</b> (หรือไอคอน ☰) ทางซ้ายของช่องที่อยู่เว็บ", "เลือก <b>การตั้งค่าเว็บไซต์</b> (Website Settings)", "ตรง <b>กล้อง</b> เปลี่ยนเป็น <b>อนุญาต</b> (Allow) → เสร็จสิ้น",
        "หรือตั้งทีเดียวทุกเว็บ: แอป <b>ตั้งค่า</b> → <b>Safari</b> (iOS 18: แอป → Safari) → <b>กล้อง</b> → <b>อนุญาต</b>"];
    } else if (/SamsungBrowser/.test(UA)) {
      name = "Samsung Internet";
      steps = ["แตะไอคอน <b>แม่กุญแจ</b> ในช่องที่อยู่เว็บ", "เลือก <b>สิทธิ์</b> (Permissions)", "เปิด <b>กล้อง</b> ให้เป็น <b>อนุญาต</b>"];
    } else if (/Android/.test(UA)) {
      name = "Chrome บน Android";
      steps = ["ตอนเว็บถามครั้งแรก ให้กด <b>ขณะเข้าชมเว็บไซต์</b> (While visiting the site) — <u>ไม่ใช่</u> \"เฉพาะครั้งนี้\"",
        "ถ้าเคยกดไปแล้ว: แตะไอคอน <b>⚙ / แม่กุญแจ</b> ทางซ้ายของช่องที่อยู่เว็บ", "เลือก <b>สิทธิ์</b> → <b>กล้อง</b> → <b>อนุญาต</b>"];
    } else {
      name = "เบราว์เซอร์บนคอมพิวเตอร์";
      steps = ["คลิกไอคอน <b>⚙ / แม่กุญแจ</b> ทางซ้ายของช่องที่อยู่เว็บ", "ตรง <b>กล้อง</b> เลือก <b>อนุญาต</b>", "รีเฟรชหน้านี้"];
    }
    return '<p class="msg">ตรวจพบ: <b>' + name + "</b> — ตั้งครั้งเดียว ครั้งต่อไปจะเปิดกล้องได้ทันทีโดยไม่ถาม</p>" +
      '<ol class="steps">' + steps.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ol>" +
      '<p class="msg small">ระหว่างใช้งาน ระบบจะเปิดกล้องค้างไว้ สลับแอปหรือกด "หยุดกล้อง" ก็ไม่ต้องอนุญาตใหม่</p>';
  }
  function showCamHelp() {
    openSheet("cam", "ตั้งให้อนุญาตกล้องถาวร", camHelpHtml(), [
      { label: "ตั้งค่าแล้ว · เปิดกล้อง", cls: "btn", fn: function () { closeSheet(); startCam(); } },
      { label: "ปิด", cls: "btn ghost", fn: closeSheet },
    ]);
  }
  $("#camHelp").addEventListener("click", showCamHelp);
  var permWatched = false;
  function checkCamPerm() {
    if (permWatched || !navigator.permissions || !navigator.permissions.query) return;
    navigator.permissions.query({ name: "camera" }).then(function (s) {
      permWatched = true;
      var upd = function () { $("#camHelp").hidden = s.state === "granted"; };
      upd(); s.onchange = upd;
    }).catch(function () {});
  }

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
    if (!stream || !wantCam || document.hidden) return;
    var next = function (ms) { loopT = setTimeout(scanLoop, ms); };
    if ((sheetOpen && !sheetScan) || video.readyState < 2) return next(200);
    if (detector) {
      detector.detect(video).then(function (codes) {
        if (codes && codes.length) onCode(codes[0].rawValue);
        next(50);
      }).catch(function () { next(250); });
      return;
    }
    if (!window.jsQR) return next(250);
    // centre crop, downscaled: fast enough on older phones (iPhone has no BarcodeDetector)
    var vw = video.videoWidth, vh = video.videoHeight, side = Math.min(vw, vh) * 0.8, size = 440;
    scanCanvas = scanCanvas || document.createElement("canvas");
    if (scanCanvas.width !== size) { scanCanvas.width = size; scanCanvas.height = size; }
    var cx = scanCanvas.getContext("2d", { willReadFrequently: true });
    cx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, size, size);
    var hit = window.jsQR(cx.getImageData(0, 0, size, size).data, size, size, { inversionAttempts: "dontInvert" });
    if (hit && hit.data) onCode(hit.data);
    next(60);
  }

  /* ---------------- boot ---------------- */
  // remember "มอบทันทีเมื่อสแกนเจอ" on this phone, so a reload doesn't switch it back off
  $("#autoRedeem").checked = !!load(KEY + ".auto", false);
  $("#autoRedeem").addEventListener("change", function () { store(KEY + ".auto", $("#autoRedeem").checked); });
  if (!ENDPOINT) { $("#pin").placeholder = "ตัวอย่าง: 123456"; }
  if (session && session.pin) showApp();
  else { $("#station").value = (load(KEY + ".station", "") || ""); }
  $("#station").addEventListener("change", function () { store(KEY + ".station", $("#station").value.trim()); });
})();
