const $ = (id) => document.getElementById(id);
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DAY_TR = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

let courses = [];

// Official public holidays that fall on class days. Lessons on these dates are left out of the calendar.
// Fall 2026 (21 Sep – 25 Dec) has only one. Religious holidays in 2026 are in March and May.
const HOLIDAYS = [
  { date: "2026-10-29", name: "Cumhuriyet Bayramı" },
];

/* ---------- runs inside the SIS page, in the page's own JS world ---------- */
function readSchedule() {
  const keys = Object.keys(window).filter((k) => /^isc_CNCalenderImpl_/.test(k));
  for (const k of keys) {
    const rs = window[k] && window[k].data;
    const rows = rs && (rs.localData || rs.allRows || rs.cachedRows);
    if (!Array.isArray(rows)) continue;

    const out = rows
      .filter((r) => r && r.startDate instanceof Date && typeof r.eventLength === "number")
      .map((r) => ({
        id: String(r.eventId != null ? r.eventId : r.OID),
        name: String(r.name || "").trim(),
        description: String(r.description || "").trim(),
        dow: r.startDate.getDay(),
        hour: r.startDate.getHours(),
        minute: r.startDate.getMinutes(),
        lengthMs: r.eventLength,
      }));

    if (out.length) return out;
  }
  return null;
}

/* ---------- runs inside the SIS iframe: one menu step per call, through SmartClient's own API ---------- */
// SmartClient routes input through its own event handler, so synthetic DOM clicks are unreliable.
// Path: Menü (Label) → Ders Kataloğu ve Kayıtlar (MenuBar) → Ders Programım (Menu).
// Each call looks at what is on screen and does the next step only, so the popup can call it in a loop.
// `recent` lists steps done a moment ago; they are skipped so a toggle is not clicked twice.
function navStep(recent) {
  if (!window.isc) return { step: "no-isc" };

  const CATEGORY = "Ders Kataloğu ve Kayıtlar";
  const PAGE = "Ders Programım";

  const norm = (s) =>
    String(s || "").replace(/<[^>]*>|&nbsp;/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr");
  const widgets = (cls) =>
    Object.keys(window)
      .filter((k) => /^isc_/.test(k))
      .map((k) => window[k])
      .filter((c) => c && typeof c.isA === "function" && c.isA(cls));
  const shown = (c) => c.isDrawn() && c.isVisible();
  const textOf = (c) => {
    const h = c.getHandle && c.getHandle();
    return h ? norm(h.textContent) : "";
  };
  const has = (s, t) => norm(s).includes(norm(t));
  const log = (...a) => console.log("[ders-programi]", ...a);

  // 3. Submenu is open: pick "Ders Programım"
  const menu = widgets("Menu").find((m) => shown(m) && has(textOf(m), PAGE));
  if (menu) {
    if (recent.includes("select")) return { step: "waiting" };

    const total = menu.getTotalRows ? menu.getTotalRows() : (menu.data || []).length;
    const record = (i) => (menu.getRecord ? menu.getRecord(i) : menu.data[i]);
    let row = -1;

    // Match on the record fields first (the title field name is not "title" in SIS).
    for (let i = 0; i < total && row < 0; i++) {
      const r = record(i);
      if (r && Object.values(r).some((v) => typeof v === "string" && norm(v) === norm(PAGE))) row = i;
    }
    // Then on the rendered row text.
    for (let i = 0; i < total && row < 0; i++) {
      const tr = menu.body && menu.body.getTableElement(i);
      if (tr && has(tr.textContent, PAGE)) row = i;
    }
    if (row < 0) {
      log("row not found", menu.ID, total, [...Array(total).keys()].map((i) => record(i)));
      return { step: "no-item" };
    }

    const item = record(row);
    log("select", menu.ID, row, item);
    if (typeof menu.selectMenuItem === "function") menu.selectMenuItem(item);
    // A handled selection hides the menu. If it is still open, try the grid click path.
    if (shown(menu)) menu.rowClick(item, row, 0);
    return { step: "select" };
  }

  // 2. Menu bar is open: open "Ders Kataloğu ve Kayıtlar"
  const bar = widgets("MenuBar").find((b) => shown(b) && has(textOf(b), CATEGORY));
  if (bar) {
    if (recent.includes("category")) return { step: "waiting" };
    let num = (bar.menus || []).findIndex((m) => m && has(m.title, CATEGORY));
    if (num < 0) num = (bar.members || []).findIndex((b) => has(textOf(b), CATEGORY));
    if (num < 0) return { step: "waiting" };
    log("showMenu", bar.ID, num);
    bar.showMenu(num);
    return { step: "category" };
  }

  // 1. Nothing open: press the "Menü" button in the left bar
  const button = widgets("Label").find((l) => norm(l.prompt) === "menü");
  if (!button) return { step: "no-menu-button" };
  if (recent.includes("menu")) return { step: "waiting" };
  log("click", button.ID);
  button.click();
  return { step: "menu" };
}

/* ---------- reading ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function inPage(tabId, func, args = []) {
  const frames = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: "MAIN",
    func,
    args,
  });
  return frames.map((f) => f.result);
}

async function findCourses(tabId) {
  return (await inPage(tabId, readSchedule)).find((r) => r && r.length) || null;
}

// Walks the menu until the calendar has courses. Returns the courses, or an error message.
async function openAndRead(tabId) {
  const NAV_TIMEOUT = 20000;
  const STEP_COOLDOWN = 2500;
  const done = {};
  let selectedAt = 0;
  let last = "";

  const end = Date.now() + NAV_TIMEOUT;
  while (Date.now() < end) {
    const hit = await findCourses(tabId);
    if (hit) return { courses: hit };

    // After "Ders Programım" is selected, only wait for the calendar to load.
    if (!selectedAt || Date.now() - selectedAt > 8000) {
      const recent = Object.keys(done).filter((k) => Date.now() - done[k] < STEP_COOLDOWN);
      const results = await inPage(tabId, navStep, [recent]);
      const real = results.filter((r) => r && r.step !== "no-isc");
      const acted = real.find((r) => ["menu", "category", "select"].includes(r.step));
      const r = acted || real.find((x) => x.step === "waiting") || real[0] || { step: "no-isc" };

      last = r.step;
      if (acted) done[r.step] = Date.now();
      if (r.step === "select") selectedAt = Date.now();
    }
    await sleep(500);
  }

  const errors = {
    "no-isc": "SIS menüsü bulunamadı.",
    "no-menu-button": "Sol bardaki Menü butonu bulunamadı.",
    "no-item": "Menüde “Ders Programım” bulunamadı.",
    select: "Ders Programım açıldı ama dersler yüklenmedi.",
  };
  return { error: `${errors[last] || "Ders Programım açılamadı."} Ekranı elle açıp tekrar deneyin.` };
}

// Not on SIS: switch to an open SIS tab, or open one. Either way the popup closes.
async function openSis() {
  const [existing] = await chrome.tabs.query({ url: "https://sis.ozyegin.edu.tr/*" });
  if (existing) {
    await chrome.windows.update(existing.windowId, { focused: true });
    await chrome.tabs.update(existing.id, { active: true });
  } else {
    await chrome.tabs.create({ url: "https://sis.ozyegin.edu.tr/" });
  }
  window.close();
}

async function read() {
  say("");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !/^https?:\/\/sis\.ozyegin\.edu\.tr\//.test(tab.url || "")) {
    return openSis();
  }

  const button = $("read");
  const text = button.querySelector(".btn-label");
  const label = text.textContent;
  button.disabled = true;
  button.classList.add("loading");
  text.textContent = "Ders Programım açılıyor…";
  try {
    const res = await openAndRead(tab.id);
    if (res.error) return say(res.error);

    courses = res.courses
      .map((c) => ({ ...c, keep: true }))
      .sort((a, b) =>
        (a.dow || 7) - (b.dow || 7) || a.hour - b.hour || a.minute - b.minute
      );
    render();
  } catch (e) {
    say("Sayfa okunamadı: " + e.message);
  } finally {
    button.disabled = false;
    button.classList.remove("loading");
    text.textContent = label;
  }
}

/* ---------- list ---------- */
// Builds the list once per read. Toggles update rows in place (syncRows) so checkbox animations can play.
function render() {
  const seen = {};
  courses.forEach((c) => (seen[slotKey(c)] = (seen[slotKey(c)] || 0) + 1));

  $("count").textContent = `${courses.length} ders bulundu`;
  const list = $("list");
  list.textContent = "";
  list.classList.remove("enter");
  void list.offsetWidth; // restart the entry animation on a second read
  list.classList.add("enter");

  courses.forEach((c, i) => {
    const dup = seen[slotKey(c)] > 1;
    const li = document.createElement("li");
    li.className = "row" + (dup ? " dup" : "");
    li.style.animationDelay = `${Math.min(i, 12) * 30}ms`;

    const box = document.createElement("input");
    box.type = "checkbox";
    box.addEventListener("change", () => {
      courses[i].keep = box.checked;
      syncRows();
    });
    li.addEventListener("click", (e) => {
      if (e.target !== box) box.click();
    });

    const when = document.createElement("div");
    when.className = "when";
    when.textContent = `${DAY_TR[c.dow]} ${two(c.hour)}:${two(c.minute)}`;

    const what = document.createElement("div");
    what.className = "what";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = c.name;
    const where = document.createElement("div");
    where.className = "where";
    where.textContent = room(c) || c.description || "";
    what.append(name, where);

    li.append(box, when, what);
    list.append(li);
  });

  $("result").hidden = false;
  syncRows();

  const dupNames = [...new Set(courses.filter((c) => seen[slotKey(c)] > 1).map((c) => c.name))];
  const dupNamesString =
    dupNames.length > 1 ? `${dupNames.slice(0, -1).join(", ")} ve ${dupNames.at(-1)}` : dupNames[0];
  say(
    dupNames.length
      ? `${dupNamesString} ${dupNames.length > 1 ? "dersleri" : "dersi"} aynı isim ve saatte birden fazla salonda görünüyor. Katılmayı programladığınız salonu seçili bırakıp diğerlerinin işaretini kaldırın.`
      : ""
  );
}

/* ---------- ics ---------- */
function buildIcs() {
  const startStr = $("termStart").value;
  const endStr = $("termEnd").value;
  if (!startStr || !endStr) return say("Dönem başlangıç ve bitiş tarihlerini girin."), null;
  if (endStr < startStr) return say("Dönem bitişi başlangıçtan önce olamaz."), null;

  const picked = courses.filter((c) => c.keep);
  if (!picked.length) return say("En az bir ders seçin."), null;

  const holidays = HOLIDAYS.map((h) => h.date);

  const seen = {};
  picked.forEach((c) => (seen[slotKey(c)] = (seen[slotKey(c)] || 0) + 1));

  const until = utcStamp(dayNum(endStr) * 864e5 + (23 * 60 + 59) * 6e4 - 3 * 36e5);
  const stamp = utcStamp(Date.now());

  const events = picked.map((c) => {
    const first = dayNum(startStr) + ((c.dow - weekday(startStr) + 7) % 7);
    const startMin = c.hour * 60 + c.minute;
    const endMin = startMin + Math.round(c.lengthMs / 6e4);

    const ex = holidays
      .filter((h) => weekday(h) === c.dow && dayNum(h) >= first && dayNum(h) <= dayNum(endStr))
      .map((h) => local(dayNum(h), startMin));

    const where = room(c);
    const title = seen[slotKey(c)] > 1 && where ? `${c.name} · ${where}` : c.name;

    return [
      "BEGIN:VEVENT",
      `UID:ozu-${c.id}-${c.dow}-${two(c.hour)}${two(c.minute)}@sis-ics`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Istanbul:${local(first, startMin)}`,
      `DTEND;TZID=Europe/Istanbul:${local(first, endMin)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${DAYS[c.dow]};UNTIL=${until}`,
      ex.length ? `EXDATE;TZID=Europe/Istanbul:${ex.join(",")}` : null,
      fold(`SUMMARY:${esc(title)}`),
      c.description ? fold(`DESCRIPTION:${esc(c.description)}`) : null,
      where ? fold(`LOCATION:${esc(where)}`) : null,
      "SEQUENCE:0",
      "END:VEVENT",
    ].filter(Boolean).join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ozu-ics//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Ders Programı",
    "X-WR-TIMEZONE:Europe/Istanbul",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Istanbul",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0300",
    "TZOFFSETTO:+0300",
    "TZNAME:+03",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

function save() {
  const ics = buildIcs();
  if (!ics) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  a.download = "ders-programi.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- helpers ---------- */
const two = (n) => String(n).padStart(2, "0");
const dayNum = (s) => Date.parse(s + "T00:00:00Z") / 864e5;
const weekday = (s) => new Date(s + "T00:00:00Z").getUTCDay();
const slotKey = (c) => `${c.name}|${c.dow}|${c.hour}|${c.minute}`;

function room(c) {
  const r = (c.description.split(",")[0] || "").trim();
  return /room$/i.test(r) || r.length < 5 ? "" : r;
}
const esc = (s) => s.replace(/([,;\\])/g, "\\$1").replace(/\r?\n/g, "\\n");

function local(days, minutes) {
  const d = new Date(days * 864e5 + minutes * 6e4);
  return (
    `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}` +
    `T${two(d.getUTCHours())}${two(d.getUTCMinutes())}00`
  );
}

function utcStamp(ms) {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}` +
    `T${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}Z`
  );
}

function fold(line) {
  const parts = [];
  let s = line;
  while (s.length > 70) {
    parts.push(s.slice(0, 70));
    s = " " + s.slice(70);
  }
  parts.push(s);
  return parts.join("\r\n");
}

function say(msg) {
  const el = $("status");
  el.textContent = msg;
  el.hidden = !msg;
}

function syncRows() {
  [...$("list").children].forEach((li, i) => {
    li.querySelector("input").checked = courses[i].keep;
    li.classList.toggle("off", !courses[i].keep);
  });
  const any = courses.some((c) => c.keep);
  $("save").disabled = !any;
  $("toggleAll").textContent = any ? "Hiçbirini seçme" : "Hepsini seç";
}

/* ---------- wiring ---------- */
$("read").addEventListener("click", read);
$("save").addEventListener("click", save);
$("toggleAll").addEventListener("click", () => {
  const on = courses.some((c) => c.keep);
  courses.forEach((c) => (c.keep = !on));
  syncRows();
});

// Click ripple on buttons, drawn from the pointer position.
document.querySelectorAll(".btn").forEach((btn) => {
  btn.addEventListener("pointerdown", (e) => {
    if (btn.disabled || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const dot = document.createElement("span");
    dot.className = "ripple";
    dot.style.width = dot.style.height = `${size}px`;
    dot.style.left = `${e.clientX - r.left - size / 2}px`;
    dot.style.top = `${e.clientY - r.top - size / 2}px`;
    btn.append(dot);
    dot.addEventListener("animationend", () => dot.remove());
  });
});

// Defaults live in popup.html (Fall 2026). A date the user changes is saved and wins next time.
["termStart", "termEnd"].forEach((id) => {
  $(id).addEventListener("change", () => {
    chrome.storage.local.set({ [id]: $(id).value });
  });
});

chrome.storage.local.get(["termStart", "termEnd"], (v) => {
  if (v.termStart) $("termStart").value = v.termStart;
  if (v.termEnd) $("termEnd").value = v.termEnd;
});
chrome.storage.local.remove("holidays");
