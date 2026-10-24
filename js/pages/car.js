// Car monitor pages: Car (odometer, averages, tyres, service, inspection, charts, fuel price, costs,
// details) and Log (every visit), plus the sheets to add or edit a log and a car.
import { h, chip, dot, segmented, splitBar, kv, icon, sheet, group, caption, footer, alertBox, toast, saveFile, selectRow, toggle, pickFile } from "../ui.js";
import { chart } from "../charts.js";
import {
  COLORS, CUR, MONTHS, WEEKDAYS, localSym, fmtSek, fmtMoney, fmtAxisSek, mLong, mIndex, monthOf, addMonths, isoDay,
  daysBetween, todayDate, weekday, parseNumber, plainNumber, pct, plural, shortNote, mean, inSweden,
} from "../core.js";
import {
  CAR_TYPES, TYPE, NEEDS_KM, TYRE_SETS, FUELS, FUEL_NAME, carSummary, monthlyKm, monthlyCosts, previousReading, fuelStats,
  byDateKm, fmtKm, fmtKmSigned, fmtPerKm, fmtAxisKm, monthPos, parseDay, newLogId, carCsv, emptyCar, carTitle, carLine,
  energy, priceSummary, paidPrices, fillPreview, consumptionByMonth, yearForecast, MONTHLY_TYPES, monthlyNow, setMonthly,
} from "../car.js";
import { store } from "../store.js";
import { statCard } from "./overview.js";
import { getKey, readPump, shrinkPhoto, exifDate } from "../pump.js";
import { openPhotoSetup } from "./pump-sheet.js";
import { putLocal, deleteLocal, newPhotoId, shrinkInvoice, loadPhoto, removePhotos } from "../photos.js";

/** Full-screen photo: tap to zoom in (and scroll), Delete removes it from the log. */
function openPhotoViewer(ref, { onDelete = null } = {}) {
  let url = null;
  const img = h("img", { class: "viewer-img", alt: "Invoice photo" });
  const scroller = h("div", { class: "viewer-scroll" }, img);
  const wrap = h("div", { class: "viewer", role: "dialog", "aria-label": "Photo" },
    h("div", { class: "viewer-bar" },
      h("button", { type: "button", class: "viewer-btn", onclick: () => close() }, "Done"),
      h("span", { class: "viewer-hint" }, "Tap to zoom"),
      onDelete ? h("button", { type: "button", class: "viewer-btn danger", onclick: () => remove() }, "Delete") : h("span")),
    scroller);
  scroller.addEventListener("click", () => wrap.classList.toggle("zoom"));
  document.getElementById("layer").appendChild(wrap);
  loadPhoto(store, ref).then((blob) => {
    if (blob) { url = URL.createObjectURL(blob); img.src = url; return; }
    img.replaceWith(h("div", { class: "viewer-missing" }, "This photo is in your Google Drive. Tap the cloud button at the top of the app to sign in, then open it again."));
  });
  function close() { wrap.remove(); if (url) URL.revokeObjectURL(url); }
  async function remove() {
    const ok = await alertBox({ title: "Delete this photo?", message: "It's removed from this log when you save.",
      buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Delete", value: true, style: "destructive" }] });
    if (ok) { close(); onDelete(); }
  }
}

const DAY_MS = 86400000;
const TYRE_ON = { summer: "Summer tyres on", studded: "Studded winter tyres on", winter: "Non-studded winter tyres on" };
const OTHER_KINDS = [["inspection", "Inspection (besiktning)"], ["repair", "Repair"], ["tax", "Vehicle tax (fordonsskatt)"],
  ["insurance", "Insurance"], ["parking", "Parking"], ["other", "Other"]];
const RULE_TEXT = { first: "36 months after first registration", second: "24 months after the first inspection", later: "14 months after the last one" };
const card = (...children) => h("div", { class: "card" }, children);
const head = (title, sub = null, right = null) => h("div", { class: "card-head" },
  h("div", { class: "card-head-text" }, h("div", { class: "card-title" }, title), sub ? h("div", { class: "card-sub" }, sub) : null), right);
const actions = (...buttons) => h("div", { class: "card-actions" }, buttons);
const btn = (text, onclick, kind = "tinted") => h("button", { type: "button", class: `btn ${kind} small`, onclick }, text);

/** "24 Oct", or "24 Oct 2025" for another year */
function dayText(iso, today = todayDate()) {
  const d = parseDay(iso);
  const s = `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  return d.getFullYear() === today.getFullYear() ? s : `${s} ${d.getFullYear()}`;
}
const dayLong = (iso) => { const d = parseDay(iso); return `${WEEKDAYS[weekday(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const round100 = (v) => Math.round(v / 100) * 100;
const daysWord = (n) => `${n} day${n !== 1 ? "s" : ""}`;
const monthsOrDays = (n) => (n > 60 ? `${Math.round(n / 30.4375)} months` : daysWord(n));
const inDays = (n) => (n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${monthsOrDays(n)}`);
const syncTap = () => { if (store.mode === "drive" && !store.drive.tokenValid()) store.syncFromTap(); };
const typeName = (type, en) => (type === "fuel" ? en.refuel : TYPE[type].name);
const costName = (type, en) => (type === "fuel" && en.unit === "kWh" ? "Charging" : TYPE[type].costName);
const perUnit = (v, en) => `${fmtMoney(CUR.local, v, 2)}/${en.unit}`;

// ---------------------------------------------------------------------------
// Which car: remembered on this device
// ---------------------------------------------------------------------------
const PREF = "car_id";
export function selectedCar(data) {
  const cars = data.cars || [];
  const id = store.pref(PREF, null);
  return cars.find((c) => c.id === id) || cars[0] || null;
}
export const carHeading = (ctx) => { const c = selectedCar(ctx.data); return c ? carTitle(c) : "Car"; };

function carPicker(ctx, current) {
  const cars = ctx.data.cars;
  if (cars.length < 2) return null;
  const pick = (id) => { store.setPref(PREF, id); ctx.refresh(); };   // the picker sits at the top, so the scroll can stay
  if (cars.length <= 3) return segmented(cars.map(carTitle), cars.indexOf(current), (i) => pick(cars[i].id), "full car-picker");
  return group(selectRow("Car", cars.map((c) => [c.id, carTitle(c)]), current.id, pick));
}

/** + in the navigation bar */
export function openNewCarLog(ctx) {
  const car = selectedCar(ctx.data);
  return car ? openCarLogSheet(ctx, car, null) : openCarSheet(ctx, null);
}

export function typeBadge(type, size = 32) {
  return h("span", { class: "car-badge", style: { background: TYPE[type].color, width: `${size}px`, height: `${size}px` } },
    icon(TYPE[type].icon, Math.round(size * 0.58)));
}

/** Which tyres to suggest in a new tyre change: the other set. */
function suggestedTyres(t, today) {
  const winterUsed = [...t.changes].reverse().find((l) => l.tires !== "summer")?.tires || "studded";
  if (t.on === "summer") return winterUsed;
  if (t.on) return "summer";
  const m = today.getMonth() + 1;
  return m >= 9 || m <= 2 ? winterUsed : "summer";
}

// ---------------------------------------------------------------------------
// Car page
// ---------------------------------------------------------------------------
function noCarState(ctx) {
  return h("div", { class: "card empty-state" },
    h("span", { class: "car-icon" }, icon("car", 40)),
    h("div", { class: "empty-title" }, "Add your car"),
    h("div", { class: "empty-text" }, "Start with the basics: make, model, registration number and when it was first registered. Then log the odometer every time you refuel or service it. You can add more cars later and switch between them."),
    h("button", { class: "btn primary", type: "button", onclick: () => openCarSheet(ctx, null) }, "+  Add your car"));
}

function noLogsCard(ctx, car) {
  const en = energy(car);
  return h("div", { class: "card empty-state" },
    h("span", { class: "car-icon" }, icon("car", 40)),
    h("div", { class: "empty-title" }, "No logs yet"),
    h("div", { class: "empty-text" }, `Log the odometer every time you ${en.unit === "kWh" ? "charge" : "refuel"} or service the car, and what it cost. The app draws your mileage and costs, works out the averages and reminds you about tyres, services and inspections.`),
    h("button", { class: "btn primary", type: "button", onclick: () => openCarLogSheet(ctx, car, null, { type: "fuel" }) }, `+  Log ${en.unit === "kWh" ? "a charge" : "a refuel"}`),
    h("button", { class: "btn plain", type: "button", onclick: () => openCarLogSheet(ctx, car, null, { type: "service" }) }, "Log a service or tyre change"));
}

function odoHero(sum, today) {
  const L = sum.latest;
  if (!L) return h("div", { class: "card hero" }, h("div", { class: "caption" }, "ODOMETER"),
    h("div", { class: "muted" }, "None of your logs has an odometer reading yet."));
  const prev = sum.points.at(-2);
  const chips = [];
  if (prev) chips.push(chip(`${fmtKmSigned(L.km - prev.km)} since ${dayText(prev.date, today)}`, "flat"));
  if (sum.per_month !== null) chips.push(chip(`≈ ${fmtKm(sum.per_month)} a month`, "flat"));
  return h("div", { class: "card hero" },
    h("div", { class: "cap-row" }, dot(COLORS.blue), h("span", { class: "caption" }, "ODOMETER"), h("span", { class: "hint" }, `on ${dayText(L.date, today)}`)),
    h("div", { class: "big-value" }, fmtKm(L.km)),
    chips.length ? h("div", { class: "chips" }, chips) : null);
}

function stats(sum, today) {
  const since = (iso) => `since ${dayText(iso, today)}`;
  return h("div", { class: "stats" },
    statCard(`DRIVEN IN ${today.getFullYear()}`, COLORS.blue, fmtKm(sum.this_year),
      sum.this_year_from ? since(sum.this_year_from) : "since 1 January",
      sum.per_year !== null ? `≈ ${fmtKm(round100(sum.per_year))} a year` : ""),
    statCard("PER MONTH", COLORS.cyan, sum.per_month !== null ? fmtKm(sum.per_month) : "—",
      sum.per_month === null ? "needs two readings 2+ weeks apart"
        : sum.km_window_full ? "average, last 12 months" : `average ${since(sum.first.date)}`),
    statCard("COSTS PER MONTH", COLORS.orange, fmtSek(sum.cost_per_month || 0),
      `${sum.costs_full_year ? "last 12 months" : since(sum.costs_from)}, all costs`,
      `${fmtSek(sum.costs)} in total`, "flat", "vc"),
    statCard("COST PER KM", COLORS.purple, sum.cost_per_km !== null ? fmtPerKm(sum.cost_per_km) : "—",
      sum.cost_per_km !== null ? "fuel included" : "needs 100 km of readings",
      sum.cost_per_km_ex_fuel !== null && sum.by_type.fuel > 0 ? `${fmtPerKm(sum.cost_per_km_ex_fuel)} ex. fuel` : "", "flat", "vc"));
}

const TONE_CHIP = { up: "All good", warn: "Soon", down: "Change now" };

function tyreCard(car, sum, today, ctx) {
  const t = sum.tyres, d = sum.tyre_dates;
  const label = t.tone === "warn" && t.days_left !== null ? `${daysWord(t.days_left)} left` : TONE_CHIP[t.tone];
  // the three dates of the Swedish tyre year; the one for your next change is highlighted
  const short = (iso) => { const x = parseDay(iso); return `${x.getDate()} ${MONTHS[x.getMonth()].slice(0, 3)}`; };
  const cell = (cap, value, sub, next) => h("div", { class: `tdate ${next ? "next" : ""}` },
    h("div", { class: "caption" }, cap), h("div", { class: "tdate-value" }, value), h("div", { class: "tdate-sub" }, sub));
  const toWinter = t.on === "summer" || (!t.on && !d.summer_now);
  const dates = h("div", { class: "tyre-dates" },
    d.winter_now ? cell("Winter", "Needed now", `until ${short(d.winter_until)}`, toWinter)
      : cell("Winter", `by ${short(d.winter_from)}`, inDays(d.winter_days), toWinter),
    d.summer_now ? cell("Summer", "Fine now", "until 30 Nov", false)
      : cell("Summer", `from ${short(d.summer_from)}`, inDays(d.summer_days), Boolean(t.on && t.on !== "summer")),
    !d.studs_now ? cell("Studs", `from ${short(d.studs_from)}`, inDays(d.studs_days), false)
      : d.summer_now ? cell("Studs", `off by ${short(d.studs_until)}`, `${daysWord(d.studs_days)} left`, t.on === "studded")
        : cell("Studs", "Allowed now", `until ${short(d.studs_until)}`, false));
  const rows = [];
  if (t.last) {
    rows.push(kv(t.last.type === "tyre_buy" ? "Changed (new tyres)" : "Changed", `${dayText(t.last.date, today)}${t.last.km !== null ? `  ·  ${fmtKm(t.last.km)}` : ""}`, { amt: false }));
    if (t.km_on !== null) rows.push(kv("Driven on them", fmtKm(t.km_on), { amt: false }));
    if (t.avg_cost !== null) rows.push(kv(`Average change (${plural(t.priced_changes, "time")})`, fmtSek(t.avg_cost)));
  }
  return card(head("Tyres", t.on ? TYRE_ON[t.on] : null, label ? chip(label, t.tone) : null),
    h("div", { class: `status-title tone-text-${t.tone}` }, t.title),
    h("div", { class: "muted" }, t.detail),
    dates,
    rows.length ? h("div", { class: "hairline" }) : null,
    rows.length ? h("div", { class: "kv-list" }, rows) : null,
    actions(btn("+  Log a tyre change", () => openCarLogSheet(ctx, car, null, { type: "tires", tires: suggestedTyres(t, today) }))));
}

function serviceCard(car, sum, today, ctx) {
  const s = sum.service;
  const buttons = actions(btn("+  Log a service", () => openCarLogSheet(ctx, car, null, { type: "service" })),
    btn(s.set ? "Change interval" : "Set interval", () => openCarSheet(ctx, car), "plain"));
  if (!s.last) {
    return card(head("Service"),
      h("div", { class: "muted" }, s.set
        ? "Log your last service and the app works out when the next one is due."
        : "Log your last service, and set how often the car should be serviced (your service book says, e.g. every 15 000 km or 12 months), to see when the next one is due."),
      buttons);
  }
  // whichever limit comes first: the kilometres (at the pace you drive) or the months
  let title, when = null, tone = s.tone;
  const kmFirst = s.km_left !== null && (!s.due_date || (s.eta !== null && isoDay(s.eta) <= s.due_date));
  if (s.km_left !== null && s.km_left < 0) title = `Overdue by ${fmtKm(-s.km_left)}`;
  else if (s.days_left !== null && s.days_left < 0) title = `Overdue since ${dayText(s.due_date, today)}`;
  else if (kmFirst) {
    title = `Next service in ${fmtKm(s.km_left)}`;
    if (s.eta) when = `Around ${dayText(isoDay(s.eta), today)} at the pace you drive.`;
  } else if (s.due_date) {
    title = `Next service by ${dayText(s.due_date, today)}`;
    when = `In ${monthsOrDays(s.days_left)}${s.km_left !== null ? `, before you've driven the ${fmtKm(car.service_km)} (${fmtKm(s.km_left)} to go)` : ""}.`;
  } else { title = `Last service ${monthsOrDays(s.days_since)} ago`; tone = "flat"; }
  const rows = [
    kv("Last service", `${dayText(s.last.date, today)}${s.last.km !== null ? `  ·  ${fmtKm(s.last.km)}` : ""}`, { amt: false }),
    kv("Since then", [s.km_since !== null ? fmtKm(s.km_since) : null, monthsOrDays(s.days_since)].filter(Boolean).join("  ·  "), { amt: false }),
    kv("Interval", s.set ? [car.service_km ? fmtKm(car.service_km) : null, car.service_months ? `${car.service_months} months` : null].filter(Boolean).join(" or ") : "not set", { amt: false }),
  ];
  const chips = { down: "Overdue", warn: "Soon", up: "On track" };
  return card(head("Service", null, chips[tone] ? chip(chips[tone], tone) : null),
    h("div", { class: `status-title tone-text-${tone === "up" ? "flat" : tone}` }, title),
    when ? h("div", { class: "muted" }, when) : null,
    !s.set ? h("div", { class: "muted" }, "Set how often the car should be serviced to get a reminder.") : null,
    h("div", { class: "kv-list" }, rows),
    buttons);
}

function inspectionCard(car, sum, today, ctx) {
  const s = sum.inspection;
  const buttons = actions(btn("+  Log an inspection", () => openCarLogSheet(ctx, car, null, { type: "inspection" })),
    !car.first_registered ? btn("Add first registration", () => openCarSheet(ctx, car), "plain") : null);
  if (!s.known) {
    return card(head("Inspection"),
      h("div", { class: "muted" }, s.needs === "last"
        ? "Log the car's last inspection (besiktning) and the app works out when the next one is due."
        : "Log the car's last inspection (besiktning), or add the month it was first registered if it's under 3 years old, to see when the next one is due."),
      buttons);
  }
  const over = s.days_left < 0;
  const rows = [];
  if (s.last) rows.push(kv("Last inspection", `${dayText(s.last.date, today)}${s.last.km !== null ? `  ·  ${fmtKm(s.last.km)}` : ""}`, { amt: false }));
  rows.push(kv("Rule", RULE_TEXT[s.rule], { amt: false }));
  if (s.reg) rows.push(kv("First registered", mLong(s.reg), { amt: false }));
  const chips = { down: "Overdue", warn: "Soon", up: "On track" };
  return card(head("Inspection", "Kontrollbesiktning", chip(chips[s.tone], s.tone)),
    h("div", { class: `status-title tone-text-${s.tone === "up" ? "flat" : s.tone}` },
      over ? `Overdue since ${dayText(s.due, today)}` : `${s.rule === "first" ? "First inspection" : "Next inspection"} by ${dayText(s.due, today)}`),
    h("div", { class: "muted" }, over
      ? "The car isn't allowed on the road (körförbud) until it has been inspected, except to drive it to the inspection or a workshop."
      : `${monthsOrDays(s.days_left)} left: the last day of ${mLong(s.due_month)}. You can go earlier; the next deadline then counts from that month.`),
    h("div", { class: "kv-list" }, rows),
    buttons);
}

// ---------------------------------------------------------------------------
function chartCard(car, sum, today) {
  const en = energy(car);
  const st = { view: 0, range: 1, ...(store.pref("car_chart", {}) || {}) };
  const save = () => store.setPref("car_chart", st);
  const body = h("div", { class: "chart-body" });
  const legend = h("div", { class: "legend" });
  const sub = h("div", { class: "card-sub" });
  const thisMonth = monthOf(today);
  const yearAgo = today.getTime() - 365 * DAY_MS;
  const empty = (text) => body.replaceChildren(h("div", { class: "chart-empty" }, text));

  function draw() {
    legend.replaceChildren();
    if (st.view === 0) {
      const pts = st.range === 0 ? sum.points.filter((p) => p.t >= yearAgo) : sum.points;
      sub.textContent = "Each dot is a reading you logged.";
      if (pts.length < 2) { empty("Log at least two odometer readings to see the line"); return; }
      body.replaceChildren(chart({
        xs: pts.map((p) => monthPos(p.date)), kind: "line", format: fmtAxisKm, zeroBased: false, label: "Odometer",
        series: [{ color: COLORS.blue, values: pts.map((p) => p.km), fill: true }],
        tooltip: (i) => {
          const p = pts[i], q = sum.points[sum.points.indexOf(p) - 1];
          const rows = [["Odometer", fmtKm(p.km), COLORS.blue]];
          if (q) rows.push(["Since the reading before", `${fmtKmSigned(p.km - q.km)} in ${daysWord(daysBetween(parseDay(q.date), parseDay(p.date)))}`, null]);
          const that = sum.logs.filter((l) => l.date === p.date).map((l) => typeName(l.type, en));
          return { title: dayLong(p.date), rows, note: that.length ? [...new Set(that)].join(", ") : null };
        },
      }));
    } else if (st.view === 1) {
      let mk = monthlyKm(sum.points);
      if (st.range === 0) mk = mk.filter((m) => mIndex(m.month) > mIndex(thisMonth) - 12);
      sub.textContent = "Estimated between your readings. Grey = only part of the month is covered.";
      if (!mk.length) { empty("Log at least two odometer readings to see this"); return; }
      const colors = mk.map((m) => (m.from || m.until ? "var(--gray2)" : COLORS.cyan));
      const lines = sum.per_month !== null ? [{ value: sum.per_month, color: COLORS.gray, dotted: true, label: `Average ${fmtKm(sum.per_month)}` }] : [];
      legend.append(h("span", { class: "legend-item" }, dot(COLORS.cyan), "Driven"),
        ...lines.map((l) => h("span", { class: "legend-item" }, h("span", { class: "line-swatch dotted", style: { borderColor: l.color } }), l.label)));
      body.replaceChildren(chart({
        months: mk.map((m) => m.month), kind: "bar", format: fmtAxisKm, zeroBased: true, lineLabels: false, label: "Kilometres per month",
        series: [{ color: COLORS.cyan, colors, values: mk.map((m) => m.km) }], lines,
        tooltip: (i) => {
          const m = mk[i];
          return { title: mLong(m.month), rows: [["Driven", `≈ ${fmtKm(m.km)}`, colors[i]]],
            note: m.from ? `From your first reading on ${dayText(m.from, today)}` : m.until ? `Up to your latest reading on ${dayText(m.until, today)}` : null };
        },
      }));
    } else {
      const firstMonth = sum.cost_logs.length ? sum.cost_logs[0].date.slice(0, 7) : thisMonth;
      const from = st.range === 0 && mIndex(firstMonth) < mIndex(thisMonth) - 11 ? addMonths(thisMonth, -11) : firstMonth;
      const mc = monthlyCosts(sum.cost_logs, from, mIndex(thisMonth) >= mIndex(firstMonth) ? thisMonth : firstMonth);
      sub.textContent = "Each colour is a kind of cost, so a service or tyre change stands out from the fuel.";
      if (!mc.some((m) => m.total > 0)) { empty("Add what each visit cost to see this"); return; }
      const used = CAR_TYPES.filter(([k]) => mc.some((m) => m.byType[k] > 0));
      const avg = sum.cost_per_month;
      const lines = avg ? [{ value: avg, color: COLORS.gray, dotted: true, label: `Average ${fmtSek(avg)}` }] : [];
      legend.append(...used.map(([k, , , color]) => h("span", { class: "legend-item" }, dot(color), costName(k, en))),
        ...lines.map((l) => h("span", { class: "legend-item" }, h("span", { class: "line-swatch dotted", style: { borderColor: l.color } }), h("span", { class: "amt" }, l.label))));
      body.replaceChildren(chart({
        months: mc.map((m) => m.month), kind: "bar", stacked: true, format: fmtAxisSek, zeroBased: true, lineLabels: false, label: "Costs per month",
        series: used.map(([k, , , color]) => ({ color, values: mc.map((m) => m.byType[k] || 0) })), lines,
        tooltip: (i) => {
          const m = mc[i];
          const rows = CAR_TYPES.filter(([k]) => m.byType[k] > 0).map(([k, , , color]) => [costName(k, en), fmtSek(m.byType[k]), color]);
          if (rows.length > 1) rows.push(["Total", fmtSek(m.total), null]);
          if (!rows.length) rows.push(["No costs logged", "", null]);
          const notes = m.items.map((l) => l.note).filter(Boolean);
          return { title: mLong(m.month), rows, note: notes.length ? shortNote(notes.join(" · "), 140) : null };
        },
      }));
    }
  }
  draw();
  return h("div", { class: "card chart-card" },
    h("div", { class: "card-title" }, "Mileage and costs"), sub,
    segmented(["Odometer", "Km per month", "Costs"], st.view, (i) => { st.view = i; save(); draw(); }, "full"),
    h("div", { class: "chart-controls" }, segmented(["1Y", "All"], st.range, (i) => { st.range = i; save(); draw(); }, "small")),
    legend, body,
    h("div", { class: "hint center" }, "Touch the chart to see the details."));
}

// ---------------------------------------------------------------------------
// Fuel price: weekly Swedish average from data/fuel-prices.json (updated by a GitHub Action)
// ---------------------------------------------------------------------------
const FUEL_KEY = "savingsTracker.fuelPrices";
let fuelData;
let fuelFetch = null;
function cachedPrices() {
  if (fuelData === undefined) {
    fuelData = null;
    try { const v = JSON.parse(localStorage.getItem(FUEL_KEY)); if (v?.prices?.["95"]?.length) fuelData = v; } catch { /* no copy */ }
  }
  return fuelData;
}
/** Resolves true when newer prices arrived. At most one request a minute. */
function fetchPrices() {
  if (!fuelFetch) {
    fuelFetch = fetch("data/fuel-prices.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!d?.prices?.["95"]?.length) throw new Error("No prices in the file");
        const changed = !cachedPrices() || fuelData.updated !== d.updated;
        fuelData = d;
        try { localStorage.setItem(FUEL_KEY, JSON.stringify(d)); } catch { /* full or blocked */ }
        return changed;
      });
    fuelFetch.finally(() => setTimeout(() => { fuelFetch = null; }, 60000)).catch(() => {});
  }
  return fuelFetch;
}

const fmtL = (v) => `${fmtMoney(CUR.local, v, 2)}/l`;
const signedKr = (v) => `${v >= 0 ? "+" : "−"}${fmtMoney(CUR.local, Math.abs(v), 2)}`;
const fmtAxisPrice = (v) => `${Number.isInteger(v) ? v : v.toFixed(1)} kr`;

function fuelPriceContent(car, sum, today, key, data) {
  const label = key === "diesel" ? "Diesel" : "Petrol 95";
  const title = h("div", { class: "card-title" }, `${label} price`);
  if (!data) return [title, h("div", { class: "muted" }, "Getting the latest prices…")];
  const series = data.prices[key] || [];
  const ps = priceSummary(series, today);
  if (!ps) return [title, h("div", { class: "muted" }, "No prices in the file yet.")];
  const paid = paidPrices(sum.logs, series);
  const use = sum.fuel.recent.per100 ?? sum.fuel.all.per100;
  const litresYear = use !== null && sum.per_year !== null ? Math.round((use / 100) * sum.per_year) : null;   // at your pace
  const st = { range: 0, ...(store.pref("fuel_chart", {}) || {}) };
  const RANGES = [365, 5 * 365 + 1, null];
  const chips = [];
  if (ps.change_week !== null) chips.push(chip(`${signedKr(ps.change_week)} vs the week before`, ps.change_week > 0.005 ? "down" : ps.change_week < -0.005 ? "up" : "flat"));
  if (ps.change_year !== null) chips.push(chip(`${signedKr(ps.change_year)} vs a year ago`, "flat"));
  const diffs = paid.filter((p) => p.week).map((p) => p.price - p.week[1]);
  if (diffs.length) {
    const d = mean(diffs);
    chips.push(chip(Math.abs(d) < 0.05 ? "You pay about the average" : `You pay ${fmtMoney(CUR.local, Math.abs(d), 2)}/l ${d < 0 ? "less" : "more"} than average`,
      d < -0.05 ? "up" : d > 0.05 ? "down" : "flat"));
  }
  const body = h("div", { class: "chart-body" });
  const legend = h("div", { class: "legend" });
  function draw() {
    const days = RANGES[st.range];
    const vis = days ? series.filter(([d]) => daysBetween(parseDay(d), today) <= days) : series;
    const dots = paid.map((p) => ({ x: monthPos(p.log.date), y: p.price, color: COLORS.blue }));
    legend.replaceChildren(h("span", { class: "legend-item" }, dot(COLORS.orange), "Sweden, average"),
      paid.length ? h("span", { class: "legend-item" }, dot(COLORS.blue), "What you paid") : null);
    if (vis.length < 2) { body.replaceChildren(h("div", { class: "chart-empty" }, "Not enough prices for this range")); return; }
    body.replaceChildren(chart({
      xs: vis.map(([d]) => monthPos(d)), kind: "line", format: fmtAxisPrice, zeroBased: false, label: `${label} price`,
      series: [{ color: COLORS.orange, values: vis.map(([, v]) => v) }], dots,
      tooltip: (i) => {
        const [d, v] = vis[i];
        const end = isoDay(new Date(parseDay(d).getTime() + 6 * DAY_MS));
        const rows = [["Average in Sweden", fmtL(v), COLORS.orange]];
        for (const p of paid) if (p.log.date >= d && p.log.date <= end) rows.push([`You paid, ${dayText(p.log.date, today)}`, fmtL(p.price), COLORS.blue]);
        return { title: `Week of ${dayText(d, today)}`, rows };
      },
    }));
  }
  draw();
  const source = h("a", { href: data.link, target: "_blank", rel: "noopener" }, data.source);
  return [
    head(`${label} price`, `Average at the pump in Sweden, week of ${dayText(ps.latest[0], today)}`),
    h("div", { class: "block-value" }, fmtL(ps.latest[1])),
    ps.low !== null ? h("div", { class: "muted" }, `Last 12 months: ${fmtMoney(CUR.local, ps.low, 2)} – ${fmtL(ps.high)}, average ${fmtL(ps.avg)}`) : null,
    chips.length ? h("div", { class: "chips" }, chips) : null,
    litresYear ? h("div", { class: "kv-list" },
      kv("A year of fuel at this price", `≈ ${fmtSek(litresYear * ps.latest[1])}`),
      kv("Every krona more per litre", `≈ ${fmtSek(litresYear)} a year`)) : null,
    h("div", { class: "chart-controls" }, segmented(["1Y", "5Y", "All"], st.range, (i) => { st.range = i; store.setPref("fuel_chart", { range: i }); draw(); }, "small")),
    legend, body,
    h("div", { class: "hint" }, "Monday prices, taxes included, updated every week. Source: ", source, " (CC BY 4.0)."),
    !paid.length ? h("div", { class: "hint" }, "Log the cost and litres when you refuel to see what you paid next to the average.") : null,
  ];
}

function fuelPriceCard(car, sum, today) {
  const key = energy(car).priceKey;
  if (!key || !inSweden()) return null;
  const wrap = h("div", { class: "card chart-card fuel-card" });
  const build = () => wrap.replaceChildren(...fuelPriceContent(car, sum, today, key, cachedPrices()).filter(Boolean));
  build();
  fetchPrices().then((changed) => { if (changed && wrap.isConnected) build(); })
    .catch(() => { if (!cachedPrices() && wrap.isConnected) wrap.replaceChildren(head(`${key === "diesel" ? "Diesel" : "Petrol 95"} price`), h("div", { class: "muted" }, "Couldn't load the fuel prices. Check your connection and open the page again.")); });
  return wrap;
}

// ---------------------------------------------------------------------------
// Real consumption and fuel cost per km, from full tank to full tank
// ---------------------------------------------------------------------------
function consumptionCard(car, sum, today, ctx) {
  const en = energy(car), f = sum.fuel;
  const kwh = en.unit === "kWh";
  const title = kwh ? "Energy use" : "Fuel consumption";
  const tank = kwh ? "full charge" : "full tank";
  const logBtn = btn(`+  Log ${kwh ? "a charge" : "a refuel"}`, () => openCarLogSheet(ctx, car, null, { type: "fuel" }));
  const useRecent = f.recent.n >= 2 && f.recent.per100 !== null;
  const v = useRecent ? f.recent : f.all;
  if (v.per100 === null) {
    return card(head(title),
      h("div", { class: "muted" }, f.fills
        ? `Log your next ${tank} with the odometer, the ${en.amount.toLowerCase()} and the price, and the app works out what the car really uses and what each kilometre costs.`
        : `Every time you ${kwh ? "charge" : "refuel"}, log the odometer, the ${en.amount.toLowerCase()} and the price. From the second ${tank} on, the app works out what the car really uses and what each kilometre costs.`),
      actions(logBtn));
  }
  // the number big, its unit small, so "6.6 l/100 km" fits a phone
  const metric = (cap, color, [num, unit], sub, money = false) => h("div", { class: "fmetric" },
    h("div", { class: "cap-row" }, dot(color, 7), h("span", { class: "caption" }, cap)),
    h("div", { class: `fmetric-value ${money ? "amt" : ""}` }, num, unit ? h("span", { class: "fmetric-unit" }, ` ${unit}`) : null),
    h("div", { class: `fmetric-sub ${money ? "amt" : ""}` }, sub));
  const chips = [];
  if (f.latest) chips.push(chip(`Latest ${f.latest.per100.toFixed(1)} ${en.per100}`, "flat"));
  if (f.segments.length >= 3) chips.push(chip(`Best ${f.best.per100.toFixed(1)}  ·  worst ${f.worst.per100.toFixed(1)}`, "flat"));
  if (f.winter.n >= 2 && f.summer.n >= 2 && f.winter.per100 !== null && f.summer.per100 !== null)
    chips.push(chip(`Winter ${f.winter.per100.toFixed(1)}  ·  summer ${f.summer.per100.toFixed(1)}`, "flat"));
  if (f.price !== null) chips.push(chip(`You paid ${perUnit(f.price, en)} on average`, "flat", "amt"));

  return card(head(title, `${useRecent ? "Last 12 months" : "All your logs"}: ${plural(v.n, tank)}, ${fmtKm(v.km)}`),
    h("div", { class: "fmetrics" },
      metric(kwh ? "ENERGY USE" : "CONSUMPTION", COLORS.orange, [v.per100.toFixed(1), en.per100],
        kwh ? `${(v.per100 / 100).toFixed(2)} kWh per km` : `${(v.per100 / 10).toFixed(2)} l/mil`),
      metric(kwh ? "CHARGING COST" : "FUEL COST", COLORS.green, v.per_km !== null ? [plainNumber(v.per_km, 2), `${localSym()}/km`] : ["—", ""],
        v.per_km !== null ? `${fmtSek(v.per_km * 100)} per 100 km` : `add the price when you ${kwh ? "charge" : "refuel"}`, true)),
    chips.length ? h("div", { class: "chips" }, chips) : null,
    h("div", { class: "hint" }, `From ${tank} to ${tank}: what the car really used. The charts are under Insights.`),
    actions(logBtn));
}

/** Insights: consumption per full tank, and through the year */
function consumptionChartCard(car, sum, today) {
  const en = energy(car), f = sum.fuel;
  const kwh = en.unit === "kWh";
  const title = kwh ? "Energy use" : "Fuel consumption";
  const tank = kwh ? "full charge" : "full tank";
  const v = f.recent.n >= 2 && f.recent.per100 !== null ? f.recent : f.all;
  if (v.per100 === null) return null;
  const st = { view: 0, range: 1, ...(store.pref("fuel_use_chart", {}) || {}) };
  const save = () => store.setPref("fuel_use_chart", st);
  const body = h("div", { class: "chart-body" });
  const legend = h("div", { class: "legend" });
  const sub = h("div", { class: "card-sub" });
  const rangeRow = h("div", { class: "chart-controls" }, segmented(["1Y", "All"], st.range, (i) => { st.range = i; save(); draw(); }, "small"));
  function draw() {
    rangeRow.style.display = st.view === 2 ? "none" : "";
    if (st.view === 2) return drawYear();
    sub.textContent = st.view === 0 ? `Each dot is one ${tank}: what the car used since the one before.` : `What each ${tank} cost per kilometre.`;
    const all = st.range === 0 ? f.segments.filter((x) => daysBetween(parseDay(x.to), today) <= 365) : f.segments;
    const segs = st.view === 0 ? all : all.filter((x) => x.per_km !== null);
    const color = st.view === 0 ? COLORS.orange : COLORS.green;
    const value = (x) => (st.view === 0 ? x.per100 : x.per_km);
    const avg = st.view === 0 ? v.per100 : v.per_km;
    const label = (x) => (st.view === 0 ? `${x.toFixed(1)} ${en.per100}` : `${fmtMoney(CUR.local, x, 2)}/km`);
    legend.replaceChildren(h("span", { class: "legend-item" }, dot(color), `Each ${tank}`),
      avg !== null ? h("span", { class: "legend-item" }, h("span", { class: "line-swatch dotted", style: { borderColor: COLORS.gray } }),
        h("span", { class: st.view === 1 ? "amt" : "" }, `Average ${label(avg)}`)) : null);
    if (segs.length < 2) {
      body.replaceChildren(h("div", { class: "chart-empty" }, segs.length ? `One ${tank} so far: the line starts with the next one` : "Nothing in this range yet"));
      return;
    }
    body.replaceChildren(chart({
      xs: segs.map((x) => monthPos(x.to)), kind: "line", zeroBased: false, lineLabels: false,
      format: st.view === 0 ? (x) => x.toFixed(1) : (x) => `${x.toFixed(2)} kr`, label: title,
      series: [{ color, values: segs.map(value) }], dots: segs.map((x) => ({ x: monthPos(x.to), y: value(x), color })),
      lines: avg !== null ? [{ value: avg, color: COLORS.gray, dotted: true, label: "" }] : [],
      tooltip: (i) => {
        const x = segs[i];
        const rows = [[kwh ? "Used" : "Consumption", `${x.per100.toFixed(1)} ${en.per100}`, COLORS.orange]];
        if (x.per_km !== null) rows.push([kwh ? "Charging cost" : "Fuel cost", `${fmtMoney(CUR.local, x.per_km, 2)}/km`, COLORS.green]);
        rows.push(["Driven", fmtKm(x.km), null],
          [kwh ? "Charged" : "Filled", `${plainNumber(x.litres, 1)} ${en.unit}${x.topups ? ` (${plural(x.topups, "top-up")})` : ""}`, null]);
        return { title: `${dayText(x.from, today)} – ${dayText(x.to, today)}`, rows };
      },
    }));
  }
  // the same car through the year: what winter does to the consumption
  function drawYear() {
    const byMonth = consumptionByMonth(f.segments);
    const known = byMonth.filter((m) => m.per100 !== null);
    sub.textContent = "Average per calendar month, all your years together. Winter months in blue.";
    const isWinter = (m) => [11, 12, 1, 2, 3].includes(m);
    legend.replaceChildren(h("span", { class: "legend-item" }, dot(COLORS.indigo), "Winter (Nov–Mar)"),
      h("span", { class: "legend-item" }, dot(COLORS.orange), "Rest of the year"));
    if (known.length < 3) { body.replaceChildren(h("div", { class: "chart-empty" }, "Needs full tanks in at least 3 different months")); return; }
    const colors = byMonth.map((m) => (isWinter(m.month) ? COLORS.indigo : COLORS.orange));
    body.replaceChildren(chart({
      months: byMonth.map((m) => `2000-${String(m.month).padStart(2, "0")}`), kind: "bar", noYears: true, zeroBased: true, lineLabels: false,
      format: (x) => x.toFixed(1), label: "Consumption by month",
      series: [{ color: COLORS.orange, colors, values: byMonth.map((m) => m.per100) }],
      lines: [{ value: v.per100, color: COLORS.gray, dotted: true, label: "" }],
      tooltip: (i) => {
        const m = byMonth[i];
        return { title: MONTHS[i], rows: m.per100 === null ? [["No full tanks logged", "", null]]
          : [["Consumption", `${m.per100.toFixed(1)} ${en.per100}`, colors[i]], ["Driven", fmtKm(m.km), null], [`${kwh ? "Charges" : "Full tanks"}`, String(m.n), null]] };
      },
    }));
  }
  const w = f.winter, su = f.summer;
  const winterExtra = w.n >= 2 && su.n >= 2 && w.per100 !== null && su.per100 !== null ? w.per100 - su.per100 : null;
  draw();
  return h("div", { class: "card chart-card fuel-use-card" },
    head(title, `${plural(f.segments.length, tank)} logged  ·  average ${v.per100.toFixed(1)} ${en.per100}`), sub,
    segmented(["Per tank", "kr/km", "Through the year"], st.view, (i) => { st.view = i; save(); draw(); }, "full"),
    rangeRow, legend, body,
    winterExtra !== null && Math.abs(winterExtra) >= 0.2 && sum.per_year !== null
      ? h("div", { class: "muted amt-soft" }, `In winter the car uses ${Math.abs(winterExtra).toFixed(1)} ${en.per100} ${winterExtra > 0 ? "more" : "less"} than the rest of the year${f.price !== null ? `: about ${fmtSek(Math.abs(winterExtra) / 100 * (sum.per_year / 12) * f.price)} a month ${winterExtra > 0 ? "extra" : "less"} at your pace and price` : ""}.`)
      : null,
    h("div", { class: "hint center" }, "Touch the chart to see the details."));
}

// ---------------------------------------------------------------------------
function costsCard(car, sum, today) {
  const en = energy(car);
  const total = sum.costs;
  const period = sum.costs_full_year ? "Last 12 months" : `Since ${dayText(sum.costs_from, today)}`;
  if (total <= 0) return card(head("Where the money goes", "Add what each visit cost to see where the money goes."));
  const types = CAR_TYPES.filter(([k]) => sum.by_type[k] > 0).sort((a, b) => sum.by_type[b[0]] - sum.by_type[a[0]]);
  const rows = types.map(([k, , , color]) => {
    const v = sum.by_type[k];
    return h("div", { class: "cost-type" }, dot(color, 9), h("span", { class: "cost-type-name" }, costName(k, en)),
      h("span", { class: "cost-type-month amt" }, `${fmtSek(v / sum.costs_months)}/mo`),
      h("span", { class: "cost-type-value amt" }, fmtSek(v)), h("span", { class: "cost-type-pct" }, pct(v / total)));
  });
  return card(head("Where the money goes", h("span", { class: "amt-soft" }, `${period}  ·  ${fmtSek(total)}`)),
    splitBar(types.map(([k, , , color]) => [sum.by_type[k], color]), 10),
    h("div", { class: "cost-types" }, rows),
    sum.costs_all > total + 0.5 ? h("div", { class: "hint amt-soft" }, `All your costs together: ${fmtSek(sum.costs_all)}.`) : null);
}

function forecastCard(car, sum, today) {
  const f = yearForecast(sum, today);
  if (f.km_end === null) return null;
  const en = energy(car);
  const row = (label, now, end, money = true) => h("div", { class: "fc-row" },
    h("div", { class: "fc-label" }, label),
    h("div", { class: `fc-num ${money ? "amt" : ""}` }, now),
    h("div", { class: `fc-num strong ${money ? "amt" : ""}` }, end));
  const rows = [row("Driven", fmtKm(f.km), `≈ ${fmtKm(round100(f.km_end))}`, false)];
  if (f.fuel_end !== null) rows.push(row(en.unit === "kWh" ? "Charging" : "Fuel", fmtSek(f.fuel), `≈ ${fmtSek(Math.round(f.fuel_end / 100) * 100)}`));
  if (f.costs_end !== null) rows.push(row("All costs", fmtSek(f.costs), `≈ ${fmtSek(Math.round(f.costs_end / 100) * 100)}`));
  const last = f.last;
  return card(head(`${f.year} so far, and by 31 December`, `At the pace of your last 12 months, with ${daysWord(f.days_left)} to go.`),
    h("div", { class: "fc-table" },
      h("div", { class: "fc-row head" }, h("div", null, ""), h("div", null, "So far"), h("div", null, "By 31 Dec")),
      rows),
    last ? h("div", { class: "hint amt-soft" }, `${last.year}: ${fmtKm(last.km)} and ${fmtSek(last.costs)} in all.`) : null,
    h("div", { class: "hint" }, "Fuel goes on at your cost per km; services and other costs at their monthly average. A rough guide, not a promise."));
}

function yearsCard(sum, today) {
  if (!sum.years.length) return null;
  const rows = [...sum.years].reverse().map((y) => h("div", { class: "year-row" },
    h("div", { class: "yr-year" }, String(y.year),
      y.year === today.getFullYear() ? h("span", { class: "yr-sub" }, "so far") : y.from ? h("span", { class: "yr-sub" }, `from ${dayText(y.from, parseDay(y.from))}`) : null),
    h("div", { class: "yr-num" }, y.km ? fmtKm(y.km) : "—"),
    h("div", { class: "yr-num amt" }, fmtSek(y.costs)),
    h("div", { class: "yr-num amt" }, y.per_km !== null ? fmtPerKm(y.per_km) : "—")));
  return card(head("Year by year", "Kilometres are estimated between your readings."),
    h("div", { class: "year-table" },
      h("div", { class: "year-row head" }, h("div", null, "Year"), h("div", null, "Driven"), h("div", null, "Costs"), h("div", null, "Per km")),
      rows));
}

function detailsCard(car, ctx) {
  const makeModel = [car.make, car.model].filter(Boolean).join(" ");
  const rows = [
    car.name ? kv("Name", car.name, { amt: false }) : null,
    kv("Make and model", makeModel || "—", { amt: false }),
    kv("Model year", car.year ? String(car.year) : "—", { amt: false }),
    kv("Registration", car.plate || "—", { amt: false }),
    kv("Runs on", FUEL_NAME[car.fuel], { amt: false }),
    kv("First registered", car.first_registered ? mLong(car.first_registered) : "—", { amt: false }),
    ...MONTHLY_TYPES.map((t) => {
      const m = monthlyNow(car, t);
      return m.amount ? kv(TYPE[t].name, `${fmtSek(m.amount)}/month  ·  since ${mLong(m.since)}`) : null;
    }),
  ];
  const missing = !makeModel && !car.plate;
  return card(head("Car details", missing ? "Add the make, model and registration number." : null),
    h("div", { class: "kv-list" }, rows.filter(Boolean)),
    actions(btn("Edit details", () => openCarSheet(ctx, car)), btn("+  Add another car", () => openCarSheet(ctx, null), "plain")));
}

export function renderCar(ctx) {
  const today = ctx.today;
  const car = selectedCar(ctx.data);
  if (!car) return ["Mileage, fuel, services and tyres", noCarState(ctx)];
  const sum = carSummary(car, today);
  const subtitle = [carLine(car), sum.n ? `${plural(sum.n, "log")}, latest ${dayText(sum.logs.at(-1).date, today)}` : "no logs yet"].filter(Boolean).join("  ·  ");
  const picker = carPicker(ctx, car);
  if (!sum.n) return [subtitle, picker, noLogsCard(ctx, car), tyreCard(car, sum, today, ctx), inspectionCard(car, sum, today, ctx), detailsCard(car, ctx)];
  return [subtitle, picker, odoHero(sum, today), stats(sum, today), consumptionCard(car, sum, today, ctx), tyreCard(car, sum, today, ctx),
    serviceCard(car, sum, today, ctx), inspectionCard(car, sum, today, ctx), detailsCard(car, ctx)];
}

// ---------------------------------------------------------------------------
// Insights page: the charts and trends
// ---------------------------------------------------------------------------
export function renderCarInsights(ctx) {
  const today = ctx.today;
  const car = selectedCar(ctx.data);
  if (!car) return ["Charts and trends for your car", noCarState(ctx)];
  const sum = carSummary(car, today);
  const picker = carPicker(ctx, car);
  if (sum.points.length < 2) {
    return [ctx.data.cars.length > 1 ? carTitle(car) : "Charts and trends for your car", picker,
      h("div", { class: "card empty-state" },
        h("span", { class: "car-icon" }, icon("charts", 40)),
        h("div", { class: "empty-title" }, "Insights need a few logs"),
        h("div", { class: "empty-text" }, "Log your refuels and services with the odometer for a few weeks, and this page fills with charts: your mileage, what the car costs and where the money goes, the real fuel consumption through the year, and where this year is heading."),
        h("button", { class: "btn primary", type: "button", onclick: () => openCarLogSheet(ctx, car, null, { type: "fuel" }) }, `+  Log ${energy(car).unit === "kWh" ? "a charge" : "a refuel"}`)),
      fuelPriceCard(car, sum, today)];
  }
  const subtitle = `${ctx.data.cars.length > 1 ? `${carTitle(car)}  ·  ` : ""}from ${plural(sum.n, "log")} since ${dayText(sum.logs[0].date, today)}`;
  return [subtitle, picker, chartCard(car, sum, today), consumptionChartCard(car, sum, today), costsCard(car, sum, today),
    forecastCard(car, sum, today), fuelPriceCard(car, sum, today), yearsCard(sum, today)];
}

// ---------------------------------------------------------------------------
// Log page
// ---------------------------------------------------------------------------
const FILTERS = [["All", () => true], ["Refuels", (l) => l.type === "fuel"],
  ["Service & tyres", (l) => ["service", "tires", "tyre_buy"].includes(l.type)],
  ["Other", (l) => !["fuel", "service", "tires", "tyre_buy"].includes(l.type)]];

function logRow(l, ctx, car, perFill, prevKm, today, en) {
  const sub = [dayText(l.date, today), l.km !== null ? fmtKm(l.km) : null].filter(Boolean).join("  ·  ");
  const extra = [];
  let use = null;
  if (l.type === "tires" && l.tires) extra.push(TYRE_ON[l.tires]);
  if (l.type === "tyre_buy" && l.tires) extra.push(l.fitted === false ? `${TYRE_ON[l.tires].replace(/ on$/, "")}, not fitted` : TYRE_ON[l.tires]);
  if (l.type === "fuel") {
    if (l.litres) extra.push(`${plainNumber(l.litres, Math.round(l.litres * 100) % 10 ? 2 : Math.round(l.litres * 10) % 10 ? 1 : 0)} ${en.unit}`);
    if (l.litres > 0 && l.cost > 0) extra.push(perUnit(l.cost / l.litres, en));
    if (l.full === false) extra.push("top-up");
    const seg = perFill.get(l.id);
    if (seg) use = h("div", { class: "crow-use" }, dot(COLORS.orange, 7), `${seg.per100.toFixed(1)} ${en.per100}`,
      seg.per_km !== null ? h("span", { class: "amt" }, `  ·  ${fmtMoney(CUR.local, seg.per_km, 2)}/km`) : null);
  }
  if (l.km !== null && prevKm !== null && l.km >= prevKm) extra.push(`${fmtKmSigned(l.km - prevKm)}`);
  if (l.photos?.length) extra.push(`📎 ${plural(l.photos.length, "photo")}`);
  return h("button", { type: "button", class: "crow", onclick: () => openCarLogSheet(ctx, car, l) },
    typeBadge(l.type),
    h("div", { class: "crow-main" },
      h("div", { class: "crow-title" }, typeName(l.type, en)),
      h("div", { class: "crow-sub" }, sub),
      extra.length ? h("div", { class: `crow-extra ${l.type === "fuel" ? "amt-soft" : ""}` }, extra.join("  ·  ")) : null,
      use,
      l.note ? h("div", { class: "crow-note" }, l.note) : null),
    h("div", { class: `crow-cost ${l.cost ? "amt" : "muted"}` }, l.cost ? fmtSek(l.cost) : "—"),
    icon("chevron", 16, "chev"));
}

export function renderCarLog(ctx) {
  const car = selectedCar(ctx.data);
  if (!car) return ["Every refuel, service and tyre change", noCarState(ctx)];
  const logs = car.logs;
  const today = ctx.today;
  const en = energy(car);
  const view = { filter: 0, ...(store.pref("car_log_view", {}) || {}) };
  const { perFill } = fuelStats(logs);
  const prevKm = new Map();
  let last = null;
  for (const l of [...logs].sort(byDateKm)) { prevKm.set(l.id, last); if (l.km !== null) last = l.km; }
  const subtitle = h("span");
  const list = h("div", { class: "history-list" });
  const multi = ctx.data.cars.length > 1;

  function fill() {
    const shown = logs.filter(FILTERS[view.filter][1]).slice().sort(byDateKm).reverse();
    const whose = multi ? `${carTitle(car)}: ` : "";
    subtitle.textContent = !logs.length ? `${whose}nothing logged yet`
      : view.filter ? `${whose}${shown.length} of ${plural(logs.length, "log")}  ·  tap one to edit it` : `${whose}${plural(logs.length, "log")}  ·  tap one to edit or delete it`;
    list.replaceChildren();
    if (!shown.length) {
      list.append(h("div", { class: "card empty-small" }, logs.length ? "No logs of this kind yet." : "No logs yet. Tap + to log the odometer."));
      return;
    }
    const groups = [];
    for (const l of shown) {
      const y = l.date.slice(0, 4);
      if (!groups.length || groups.at(-1)[0] !== y) groups.push([y, []]);
      groups.at(-1)[1].push(l);
    }
    for (const [year, items] of groups) {
      const costs = items.reduce((a, l) => a + (l.cost || 0), 0);
      list.append(h("div", { class: "year-head" }, h("div", { class: "year-title" }, year),
        h("div", { class: "year-sum" }, `${plural(items.length, "log")}${costs ? `  ·  ${fmtSek(costs)}` : ""}`)));
      list.append(h("div", { class: "hgroup" }, items.map((l) => logRow(l, ctx, car, perFill, prevKm.get(l.id), today, en))));
    }
  }

  const exportBtn = h("button", { type: "button", class: "pill-btn" }, icon("table", 15), "Export CSV");
  exportBtn.addEventListener("click", async () => {
    if (!logs.length) { toast("Nothing to export yet"); return; }
    const slug = carTitle(car).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "car";
    await saveFile(`${slug}-${isoDay(today)}.csv`, "text/csv", carCsv(logs));
  });
  fill();
  return [subtitle,
    carPicker(ctx, car),
    segmented(FILTERS.map(([t]) => (t === "Refuels" ? `${en.refuel}s` : t)), view.filter, (i) => { view.filter = i; store.setPref("car_log_view", view); fill(); }, "full"),
    h("div", { class: "pill-row" },
      h("button", { type: "button", class: "pill-btn", onclick: () => openCarSheet(ctx, car) }, icon("car", 15), "Car details"),
      h("button", { type: "button", class: "pill-btn", onclick: () => openCarSheet(ctx, null) }, icon("plus", 15), "Add a car"),
      exportBtn),
    list];
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------
function numField(placeholder, mode = "decimal") {
  return h("input", { class: "form-input", type: "text", inputmode: mode, autocomplete: "off", autocorrect: "off",
    spellcheck: "false", placeholder });
}
function textField(placeholder, value = "", extra = {}) {
  return h("input", { class: "form-input", type: "text", autocomplete: "off", spellcheck: "false", placeholder, value, ...extra });
}
function row(labelText, input, unit = null) {
  return h("label", { class: "form-row" }, h("span", { class: "form-label" }, labelText), input,
    unit ? h("span", { class: "form-unit" }, unit) : null);
}
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RX = /^\d{4}-\d{2}$/;
const NOTE_HINTS = {
  fuel: "Optional, e.g. the station, or a trip.",
  service: "What was done: oil, filters, brakes…",
  tires: "Optional, e.g. where the other set is stored.",
  tyre_buy: "Optional, e.g. the brand, the size, or where you bought them.",
  inspection: "Optional, e.g. remarks from the inspection.",
  repair: "What was fixed.",
  tax: "Optional, e.g. which year it's for.",
  insurance: "Optional, e.g. the period it covers. A fixed monthly price goes in Car details instead.",
  parking: "Optional, e.g. where. A parking space you rent every month goes in Car details instead.",
  other: "What it was: washing, parking, a toll, a part…",
};

export function openCarLogSheet(ctx, car, original = null, preset = {}) {
  const logs = car.logs;
  const today = ctx.today;
  const en = energy(car);
  const kwh = en.unit === "kWh";
  const MAIN = ["fuel", "service", "tires"];
  let type = original ? original.type : preset.type || "fuel";
  const TYRE_KINDS = ["tires", "tyre_buy"];
  let tyreKind = TYRE_KINDS.includes(type) ? type : "tires";
  let otherKind = MAIN.includes(type) || TYRE_KINDS.includes(type) ? "other" : type;
  let tires = original?.tires || preset.tires || "summer";
  const latestKm = logs.reduce((m, l) => (l.km !== null && l.km > m ? l.km : m), -1);
  // this week's Swedish average, as a hint in the price field
  const avg = en.priceKey && inSweden() ? cachedPrices()?.prices?.[en.priceKey]?.at(-1)?.[1] : null;

  const date = h("input", { class: "form-input date-input", type: "date", value: original ? original.date : isoDay(today), "aria-label": "Date" });
  const km = numField(latestKm >= 0 ? `Last: ${plainNumber(latestKm)}` : "e.g. 45 210", "numeric");
  const litres = numField(kwh ? "e.g. 45" : "e.g. 42,5");
  const price = numField(avg ? `average ${plainNumber(avg, 2)}` : kwh ? "e.g. 2,50" : "e.g. 18,21");
  const cost = numField("optional");
  const note = h("textarea", { class: "note-input", rows: "2", placeholder: "Note" });
  const fullSwitch = toggle(original ? original.full !== false : true, () => validate(), "Full tank");

  const kindRow = selectRow("What", OTHER_KINDS, otherKind, (v) => { otherKind = v; type = v; update(); });
  const kindGroup = group(kindRow);
  const kmRow = row("Odometer", km, "km");
  const litresRow = row(en.amount, litres, en.unit);
  const priceRow = row("Price", price, `${localSym()}/${en.unit}`);
  const costLabel = h("span", { class: "form-label" }, "Cost");
  const costRow = h("label", { class: "form-row" }, costLabel, cost, h("span", { class: "form-unit" }, localSym()));
  const moneyCaption = caption("COST");
  // read the litres, price and amount off a photo of the pump (petrol and diesel cars)
  const photoBtn = h("button", { type: "button", class: "photo-btn" }, icon("camera", 20), h("span", { class: "photo-btn-text" }, "Read a photo of the pump"));
  const photoNote = h("div", { class: "photo-note" });
  const photoBox = h("div", { class: "photo-box" }, photoBtn, photoNote);
  let dateTouched = Boolean(original);

  // invoice photos (services, repairs, tyres, inspections...): kept on the device, and in Drive with Drive
  let photos = (original?.photos || []).map((p) => ({ ...p }));
  const added = new Set();        // taken in this sheet: forgotten again if you cancel
  const removed = [];             // already saved ones you deleted: removed when you save
  let saved = false;
  const photoUrls = [];
  const photoCaption = caption("PHOTOS");
  const photoGrid = h("div", { class: "invoice-grid amt-soft" });
  const photoFooter = footer("A photo of the invoice shows later what was done and changed. Tap one to see it full size. With Google Drive they're saved in your Savings Tracker folder, next to your data (seeing them needs internet); otherwise on this device.");
  function drawPhotos() {
    for (const u of photoUrls.splice(0)) URL.revokeObjectURL(u);
    const tiles = photos.map((p, i) => {
      const tile = h("button", { type: "button", class: "invoice-tile", "aria-label": `Photo ${i + 1}` });
      tile.addEventListener("click", () => openPhotoViewer(p, { onDelete: () => {
        photos = photos.filter((x) => x.id !== p.id);
        if (added.has(p.id)) { added.delete(p.id); deleteLocal(p.id); } else removed.push(p);
        drawPhotos();
      } }));
      loadPhoto(store, p).then((blob) => {
        if (!blob) { tile.append(icon("cloud", 22, "invoice-missing")); return; }
        const u = URL.createObjectURL(blob);
        photoUrls.push(u);
        tile.append(h("img", { src: u, alt: "" }));
      });
      return tile;
    });
    const add = h("button", { type: "button", class: "invoice-tile add" }, icon("camera", 22), h("span", null, photos.length ? "Add more" : "Add photo"));
    add.addEventListener("click", async () => {
      const files = await pickFile("image/*", true);
      if (!files?.length) return;
      add.disabled = true;
      for (const f of files) {
        if (photos.length >= 12) { toast("Up to 12 photos per log"); break; }
        try {
          const blob = await shrinkInvoice(f);
          const id = newPhotoId();
          await putLocal(id, blob);
          photos.push({ id, drive: null });
          added.add(id);
        } catch { toast("Couldn't add that photo"); }
      }
      drawPhotos();
    });
    photoGrid.replaceChildren(...tiles, add);
  }
  const fullGroup = group(h("label", { class: "form-row switch-row" }, h("span", { class: "form-label" }, kwh ? "Charged to full" : "Full tank"), fullSwitch));
  const fullFooter = footer(`Turn it off if you only ${kwh ? "topped up the battery" : "topped up"}. The consumption is then worked out at your next full ${kwh ? "charge" : "tank"}, with these ${en.amount.toLowerCase()} included.`);
  const kmFooter = footer("");
  const costFooter = footer("");
  const tyreCaption = caption("TYRES PUT ON");
  const tyreSeg = segmented(["Summer", "Studded", "Non-studded"], Math.max(0, TYRE_SETS.findIndex(([k]) => k === tires)),
    (i) => { tires = TYRE_SETS[i][0]; update(); }, "full");
  const tyreFooter = footer("Studded and non-studded are both winter tyres. In Sweden winter tyres are required 1 December – 31 March when the roads are wintry, and studs are allowed 1 October – 15 April.");
  const noteFooter = footer("");
  const typeSeg = segmented([en.refuel, "Service", "Tyres", "Other"], TYRE_KINDS.includes(type) ? 2 : MAIN.includes(type) ? MAIN.indexOf(type) : 3,
    (i) => { type = i === 3 ? otherKind : i === 2 ? tyreKind : MAIN[i]; update(); }, "full");
  // Tyres: a change of sets, or new tyres bought (and fitted at once, or later)
  const tyreKindSeg = segmented(["Tyre change", "New tyres"], tyreKind === "tyre_buy" ? 1 : 0,
    (i) => { tyreKind = TYRE_KINDS[i]; type = tyreKind; update(); }, "full tyre-kind");
  const fittedSwitch = toggle(original?.type === "tyre_buy" ? original.fitted !== false : true, () => update(), "Fitted right away");
  const fittedGroup = group(h("label", { class: "form-row switch-row" }, h("span", { class: "form-label" }, "Fitted right away"), fittedSwitch));
  const fittedFooter = footer("On: they were put on the car when you bought them, so this also counts as your tyre change. Off: bought for later; log a tyre change when you put them on.");

  // a refuel: type any two of litres, price and total, and the third is worked out (shown in grey)
  const money = { litres, price, cost };
  const auto = { litres: false, price: false, cost: false };
  const typed = (k) => !auto[k] && parseNumber(money[k].value) !== null;
  function setAuto(k, v) {
    auto[k] = v !== null && Number.isFinite(v);
    money[k].value = auto[k] ? plainNumber(v, 2) : "";
    money[k].classList.toggle("auto", auto[k]);
  }
  function recalc(changed) {
    if (changed) { auto[changed] = false; money[changed].classList.remove("auto"); }
    if (type !== "fuel") return;
    const L = parseNumber(litres.value), P = parseNumber(price.value), T = parseNumber(cost.value);
    const n = ["litres", "price", "cost"].filter(typed).length;
    if (n === 2 && !typed("cost")) setAuto("cost", L * P);
    else if (n === 2 && !typed("price")) setAuto("price", L > 0 ? T / L : null);
    else if (n === 2 && !typed("litres")) setAuto("litres", P > 0 ? T / P : null);
    else if (n < 2) for (const k of Object.keys(auto)) if (auto[k]) setAuto(k, null);
  }

  let api = null;
  const read = () => ({ d: date.value, k: parseNumber(km.value), c: parseNumber(cost.value), l: parseNumber(litres.value), p: parseNumber(price.value) });

  function update() {
    const isFuel = type === "fuel", isTyres = TYRE_KINDS.includes(type), isOther = !MAIN.includes(type) && !isTyres;
    tyreKindSeg.style.display = isTyres ? "" : "none";
    for (const el of [fittedGroup, fittedFooter]) el.style.display = type === "tyre_buy" ? "" : "none";
    tyreCaption.textContent = type === "tyre_buy" ? "WHICH TYRES" : "TYRES PUT ON";
    kindGroup.style.display = isOther ? "" : "none";
    for (const el of [litresRow, priceRow, fullGroup, fullFooter]) el.style.display = isFuel ? "" : "none";
    photoBox.style.display = isFuel && !kwh ? "" : "none";
    for (const el of [tyreCaption, tyreSeg, tyreFooter]) el.style.display = isTyres ? "" : "none";
    for (const el of [photoCaption, photoGrid, photoFooter]) el.style.display = isFuel ? "none" : "";
    photoCaption.textContent = ["service", "repair", "tyre_buy"].includes(type) ? "INVOICE PHOTOS" : "PHOTOS";
    costLabel.textContent = isFuel ? "Total" : "Cost";
    moneyCaption.textContent = isFuel ? (kwh ? "CHARGING" : "FUEL") : "COST";
    if (!isFuel) for (const k of ["litres", "price"]) if (auto[k]) setAuto(k, null);
    if (!isFuel && auto.cost) setAuto("cost", null);
    noteFooter.textContent = NOTE_HINTS[type];
    recalc(null);
    validate();
  }

  function validate() {
    const { d, k, c, l, p } = read();
    const isFuel = type === "fuel";
    const dateOk = DATE_RX.test(d);
    const kmBad = Boolean(km.value.trim()) && (k === null || k < 0);
    const costBad = Boolean(cost.value.trim()) && (c === null || c < 0);
    const litresBad = isFuel && Boolean(litres.value.trim()) && (l === null || l <= 0);
    const priceBad = isFuel && Boolean(price.value.trim()) && (p === null || p <= 0);
    km.classList.toggle("invalid", kmBad);
    cost.classList.toggle("invalid", costBad);
    litres.classList.toggle("invalid", litresBad);
    price.classList.toggle("invalid", priceBad);
    const needKm = NEEDS_KM.has(type) || (type === "tyre_buy" && fittedSwitch.input.checked);
    const ok = dateOk && !kmBad && !costBad && !litresBad && !priceBad && (!needKm || k !== null);
    api?.setRight({ disabled: !ok });

    // odometer: compared with the reading before this date
    const prev = dateOk ? previousReading(logs, d, original?.id) : null;
    kmFooter.className = "section-footer";
    if (k !== null && !kmBad && prev) {
      const diff = k - prev.km;
      if (diff < 0) {
        kmFooter.textContent = `That's lower than the ${fmtKm(prev.km)} you logged on ${dayText(prev.date, today)}. Check the number.`;
        kmFooter.className = "section-footer tone-text-warn";
      } else {
        const days = daysBetween(parseDay(prev.date), parseDay(d));
        kmFooter.textContent = `${fmtKmSigned(diff)} since ${dayText(prev.date, today)}${days > 0 ? ` (${daysWord(days)})` : ""}`;
      }
    } else if (prev) kmFooter.textContent = `Last reading: ${fmtKm(prev.km)} on ${dayText(prev.date, today)}.${needKm ? "" : " Optional for this one."}`;
    else kmFooter.textContent = needKm ? "What the odometer shows, in kilometres." : "Optional for this one.";

    // a refuel: the real consumption and the fuel cost per km since the last full tank, live
    costFooter.className = "section-footer";
    if (!isFuel) { costFooter.textContent = `What it cost, in ${CUR.local}. Leave it empty if you don't know.`; return; }
    const full = fullSwitch.input.checked;
    const unitWord = kwh ? "charge" : "tank";
    if (!(l > 0)) { costFooter.textContent = `Type the ${en.amount.toLowerCase()} and the price (or the total) from the ${kwh ? "charger" : "pump"}: the app works out the rest.`; return; }
    if (!full) { costFooter.textContent = `Top-up: the consumption is worked out at your next full ${unitWord}.`; return; }
    if (k === null || !dateOk) { costFooter.textContent = "Add the odometer to see the consumption."; return; }
    const seg = fillPreview(logs, { date: d, km: k, litres: l, cost: c, full: true }, original?.id);
    if (!seg) { costFooter.textContent = `The first full ${unitWord}: the consumption shows from the next one.`; return; }
    const high = seg.per100 > (kwh ? 40 : 25), low = seg.per100 < (kwh ? 8 : 2.5);
    const value = `${seg.per100.toFixed(1)} ${en.per100}${seg.per_km !== null ? ` and ${fmtMoney(CUR.local, seg.per_km, 2)}/km` : ""}`;
    const over = `over the ${fmtKm(seg.km)} since your full ${unitWord} on ${dayText(seg.from, today)}${seg.topups ? ` (with ${plural(seg.topups, "top-up")})` : ""}`;
    if (high || low) {
      costFooter.textContent = `${value} ${over} looks ${high ? "high" : "low"}. ${high ? `Check the odometer and the ${en.amount.toLowerCase()}.` : `Is a ${en.refuel.toLowerCase()} in between missing?`}`;
      costFooter.className = "section-footer tone-text-warn";
    } else {
      costFooter.replaceChildren(h("b", { class: "use-now" }, value), ` ${over}.`);
    }
  }

  for (const [k, f] of Object.entries(money)) f.addEventListener("input", () => { recalc(k); validate(); });
  for (const f of [date, km]) f.addEventListener("input", validate);
  date.addEventListener("input", () => { dateTouched = true; });

  const looksLike = (fuel) => (/diesel|^d\b/i.test(fuel) ? "diesel" : /95|98|bensin|petrol|e10|v-power|miles/i.test(fuel) ? "petrol" : null);
  const carRuns = car.fuel === "diesel" ? "diesel" : ["95", "98", "hybrid"].includes(car.fuel) ? "petrol" : null;
  function photoMessage(cls, ...parts) {
    photoNote.querySelector(".photo-msg")?.remove();
    photoNote.prepend(h("div", { class: `photo-msg ${cls}` }, parts));
  }
  photoBtn.addEventListener("click", async () => {
    if (!getKey()) { openPhotoSetup(ctx); return; }       // the file picker needs a fresh tap, so the next tap reads
    const file = await pickFile("image/*");
    if (!file) return;
    photoBtn.disabled = true;
    photoBtn.classList.add("busy");
    const label = photoBtn.querySelector(".photo-btn-text");
    label.textContent = "Reading the photo…";
    photoNote.replaceChildren();
    try {
      const [img, head] = await Promise.all([shrinkPhoto(file), file.slice(0, 256 * 1024).arrayBuffer()]);
      const thumb = h("img", { class: "photo-thumb", src: img.dataUrl, alt: "The photo", onclick: () => thumb.classList.toggle("big") });
      photoNote.append(thumb);
      const r = await readPump(img.b64, getKey(), { onStage: (text) => { label.textContent = text; } });
      for (const [k, v] of [["litres", r.litres], ["price", r.price], ["cost", r.total]]) {
        money[k].value = v ? plainNumber(v, 2) : "";
        auto[k] = false;
        money[k].classList.remove("auto");
      }
      const taken = exifDate(head);
      let when = null;
      if (taken && !dateTouched && taken !== date.value && taken <= isoDay(today)) { date.value = taken; when = `Date from the photo: ${dayText(taken, today)}.`; }
      const sum = `${plainNumber(r.litres || 0, 2)} l × ${plainNumber(r.price || 0, 2)} kr/l = ${plainNumber((r.litres || 0) * (r.price || 0), 2)} kr`;
      const fixed = { decimal: " (a decimal point was put back)", "other-price": " (the price of the fuel you used)" }[r.how] || "";
      const wrongFuel = r.fuel && carRuns && looksLike(r.fuel) && looksLike(r.fuel) !== carRuns
        ? ` The pump says ${r.fuel}, but this car runs on ${carRuns}.` : "";
      if (r.ok && r.verified) photoMessage(wrongFuel ? "warn" : "good", `✓  ${plainNumber(r.litres, 2)} l × ${plainNumber(r.price, 2)} kr/l = ${plainNumber(r.total, 2)} kr${fixed}${r.fuel ? `  ·  ${r.fuel}` : ""}.`, wrongFuel, when ? ` ${when}` : "");
      else if (r.ok) photoMessage("warn", `Read two of the numbers; the ${r.fixed === "total" ? "amount" : r.fixed === "price" ? "price" : "litres"} was worked out. Check it against the photo.${wrongFuel}`, when ? ` ${when}` : "");
      else photoMessage("warn", `These don't add up: ${sum}, not ${plainNumber(r.total || 0, 2)} kr. Check them against the photo and fix the one that's wrong.`, when ? ` ${when}` : "");
      validate();
    } catch (err) {
      photoMessage("bad", err.message, err.kind === "key" || err.kind === "credit" ? " " : null, err.kind === "key" || err.kind === "credit"
        ? h("button", { type: "button", class: "link-btn", onclick: () => openPhotoSetup(ctx) }, "Check the key") : null);
    } finally {
      photoBtn.disabled = false;
      photoBtn.classList.remove("busy");
      label.textContent = "Read another photo";
    }
  });
  date.addEventListener("change", validate);
  note.addEventListener("input", () => { note.style.height = "auto"; note.style.height = `${Math.max(note.scrollHeight, 56)}px`; });

  if (original) {
    if (original.km !== null) km.value = plainNumber(original.km);
    if (original.cost !== null) cost.value = plainNumber(original.cost, original.cost % 1 ? 2 : 0);
    if (original.litres !== null) litres.value = plainNumber(original.litres, original.litres % 1 ? 2 : 0);
    note.value = original.note || "";
  }

  const body = h("div", { class: "form" },
    ctx.data.cars.length > 1 ? footer(`For ${carTitle(car)}`) : null,
    caption("WHAT"), typeSeg, kindGroup, tyreKindSeg,
    caption("WHEN AND HOW FAR"),
    group(h("label", { class: "form-row" }, h("span", { class: "form-label" }, "Date"), date), kmRow),
    kmFooter,
    moneyCaption,
    photoBox,
    group(litresRow, priceRow, costRow),
    costFooter,
    fullGroup, fullFooter,
    tyreCaption, tyreSeg, tyreFooter, fittedGroup, fittedFooter,
    photoCaption, photoGrid, photoFooter,
    caption("NOTE"),
    group(h("div", { class: "note-wrap" }, note)),
    noteFooter,
    original ? h("button", { type: "button", class: "btn destructive-row", onclick: () => remove() }, "Delete Log") : null);

  function save(sh) {
    const { d, k, c, l } = read();
    const needKm = NEEDS_KM.has(type) || (type === "tyre_buy" && fittedSwitch.input.checked);
    if (!DATE_RX.test(d) || (needKm && k === null)) return;
    const isFuel = type === "fuel";
    const log = { id: original ? original.id : newLogId(), date: d, type, km: k, cost: c === null ? null : Math.round(c * 100) / 100,
      litres: isFuel ? l : null, full: isFuel ? fullSwitch.input.checked : null, tires: TYRE_KINDS.includes(type) ? tires : null,
      fitted: type === "tyre_buy" ? fittedSwitch.input.checked : null,
      photos: isFuel ? [] : photos,
      note: note.value.trim() };
    saved = true;
    removePhotos(store, isFuel ? removed.concat(photos) : removed);
    store.saveCarLog(car.id, log);
    sh.close();
    const seg = isFuel && log.full ? fillPreview(logs, log, original?.id) : null;
    toast(seg ? `✓  ${seg.per100.toFixed(1)} ${en.per100}${seg.per_km !== null ? `  ·  ${fmtMoney(CUR.local, seg.per_km, 2)}/km` : ""}`
      : `✓  Saved ${typeName(type, en).toLowerCase()}${k !== null ? `  ·  ${fmtKm(k)}` : ""}`);
    syncTap();
  }

  async function remove() {
    const ok = await alertBox({ title: "Delete this log?",
      message: `${typeName(original.type, en)} on ${dayText(original.date, today)}${original.km !== null ? `, ${fmtKm(original.km)}` : ""}. This can't be undone.`,
      buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Delete", value: true, style: "destructive" }] });
    if (!ok) return;
    saved = true;
    removePhotos(store, (original.photos || []).concat(photos.filter((p) => added.has(p.id))));
    store.deleteCarLog(car.id, original.id);
    api.close();
    toast("Deleted the log");
    syncTap();
  }

  api = sheet({ title: original ? "Edit Log" : "New Log", left: { text: "Cancel" }, right: { text: "Save", bold: true, onClick: save }, body,
    onClose: () => {
      for (const u of photoUrls.splice(0)) URL.revokeObjectURL(u);
      if (!saved) for (const id of added) deleteLocal(id);       // cancelled: forget the photos taken here
    } });
  drawPhotos();
  update();          // for a refuel being edited, this works out the price from the litres and the total
  note.dispatchEvent(new Event("input"));
  if (!original && matchMedia("(pointer: fine)").matches) setTimeout(() => km.focus(), 350);
  return api;
}

/** Add a car (car = null) or change its details. */
export function openCarSheet(ctx, car = null) {
  const isNew = !car;
  const c = car || emptyCar();
  const name = textField("optional, e.g. The Volvo", c.name, { "aria-label": "Name" });
  const make = textField("e.g. Volvo", c.make, { "aria-label": "Make", autocapitalize: "words" });
  const model = textField("e.g. V60", c.model, { "aria-label": "Model", autocapitalize: "words" });
  const year = numField("e.g. 2019", "numeric");
  if (c.year) year.value = String(c.year);
  const plate = textField("e.g. ABC 123", c.plate, { "aria-label": "Registration number", autocapitalize: "characters", class: "form-input plate-input" });
  let fuel = c.fuel;
  const fuelRow = selectRow("Runs on", FUELS, fuel, (v) => { fuel = v; });
  const reg = h("input", { class: "form-input date-input", type: "month", value: c.first_registered || "", placeholder: "YYYY-MM", "aria-label": "First registered" });
  const kmI = numField("e.g. 15 000", "numeric");
  const monthsI = numField("e.g. 12", "numeric");
  if (c.service_km) kmI.value = plainNumber(c.service_km);
  if (c.service_months) monthsI.value = String(c.service_months);
  // fixed monthly costs: what you pay now, and the month you started paying
  const thisMonth = monthOf(ctx.today);
  const startGuess = c.logs.length ? [...c.logs].sort(byDateKm)[0].date.slice(0, 7) : thisMonth;
  const monthly = Object.fromEntries(MONTHLY_TYPES.map((t) => {
    const now = monthlyNow(c, t);
    const amount = numField("none", "decimal");
    if (now.amount) amount.value = plainNumber(now.amount, now.amount % 1 ? 2 : 0);
    const since = h("input", { class: "form-input date-input", type: "month", value: now.since || startGuess, "aria-label": `${TYPE[t].name} since` });
    return [t, { amount, since, was: now.since }];
  }));
  let api = null;

  const read = () => ({ y: parseNumber(year.value), k: parseNumber(kmI.value), m: parseNumber(monthsI.value), r: reg.value.trim() });
  const monthlyBad = (f) => (Boolean(f.amount.value.trim()) && !(parseNumber(f.amount.value) >= 0)) || (Boolean(f.since.value) && !MONTH_RX.test(f.since.value));
  const validate = () => {
    const { y, k, m, r } = read();
    const bad = {
      year: Boolean(year.value.trim()) && !(Number.isInteger(y) && y >= 1900 && y <= 2100),
      km: Boolean(kmI.value.trim()) && !(k > 0),
      months: Boolean(monthsI.value.trim()) && !(m > 0 && m <= 120),
      reg: Boolean(r) && !MONTH_RX.test(r),
    };
    year.classList.toggle("invalid", bad.year);
    kmI.classList.toggle("invalid", bad.km);
    monthsI.classList.toggle("invalid", bad.months);
    reg.classList.toggle("invalid", bad.reg);
    for (const f of Object.values(monthly)) f.amount.classList.toggle("invalid", monthlyBad(f));
    api?.setRight({ disabled: Object.values(bad).some(Boolean) || Object.values(monthly).some(monthlyBad) });
  };
  for (const f of [year, kmI, monthsI, reg, ...Object.values(monthly).flatMap((x) => [x.amount, x.since])]) f.addEventListener("input", validate);
  reg.addEventListener("change", validate);

  const others = ctx.data.cars.length - (isNew ? 0 : 1);
  const body = h("div", { class: "form" },
    caption("CAR"),
    group(row("Make", make), row("Model", model), row("Model year", year), row("Registration", plate), fuelRow),
    footer("Runs on decides which fuel price the Car page shows, and whether you log litres or kWh."),
    group(row("Name", name)),
    footer("A nickname for the title of the Car page. Leave it empty to use the make and model."),
    caption("FIRST REGISTERED"),
    group(row("In traffic since", reg)),
    footer("The month the car was registered for the first time (i trafik första gång), from the registration certificate. The first inspection is due 36 months after it and the second 24 months after the first."),
    caption("SERVICE EVERY"),
    group(row("Kilometres", kmI, "km"), row("or months", monthsI, "months")),
    footer("From your service book, e.g. every 15 000 km or 12 months, whichever comes first. Fill in one or both to get a reminder on the Car page."),
    caption("EVERY MONTH"),
    ...MONTHLY_TYPES.flatMap((t, i) => [i ? h("div", { class: "group-gap" }) : null,
      group(row(TYPE[t].name, monthly[t].amount, `${localSym()}/month`), row("Paying since", monthly[t].since))]),
    footer("Fixed costs like insurance and a parking space you rent. They're counted on the 1st of every month since the month you started, so you don't log them. If the price changes, type the new one: it counts from this month, and the months before keep the old price. Empty it when you stop paying."),
    !isNew ? h("button", { type: "button", class: "btn destructive-row", onclick: () => remove() }, "Delete Car") : null);

  async function remove() {
    const n = c.logs.length;
    const ok = await alertBox({ title: `Delete ${carTitle(c)}?`,
      message: `${n ? `Its ${plural(n, "log")} will be deleted too. ` : ""}This can't be undone.${others ? "" : " You can add a car again any time."}`,
      buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Delete", value: true, style: "destructive" }] });
    if (!ok) return;
    if (store.pref(PREF, null) === c.id) store.setPref(PREF, null);
    for (const l of c.logs) removePhotos(store, l.photos);
    store.deleteCar(c.id);
    api.close();
    toast(`Deleted ${carTitle(c)}`);
    syncTap();
  }

  api = sheet({ title: isNew ? "New Car" : "Car Details", left: { text: "Cancel" }, body,
    right: { text: "Save", bold: true, onClick: (sh) => {
      const { y, k, m, r } = read();
      const next = { ...c, name: name.value.trim(), make: make.value.trim(), model: model.value.trim(),
        year: Number.isInteger(y) ? y : null, plate: plate.value.trim(), fuel, first_registered: MONTH_RX.test(r) ? r : null,
        service_km: k > 0 ? k : null, service_months: m > 0 ? Math.round(m) : null };
      for (const t of MONTHLY_TYPES) {
        const f = monthly[t];
        const amount = parseNumber(f.amount.value);
        const since = MONTH_RX.test(f.since.value) ? f.since.value : null;
        next.monthly = setMonthly(next.monthly, t, amount > 0 ? Math.round(amount * 100) / 100 : null, f.was && since === f.was ? null : since, thisMonth);
      }
      if (isNew) store.setPref(PREF, c.id);
      store.saveCar(next);
      sh.close();
      if (isNew) setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);   // show the new car from the top
      toast(isNew ? `✓  Added ${carTitle(next)}` : "✓  Saved the car details");
      syncTap();
    } } });
  validate();
  if (isNew && matchMedia("(pointer: fine)").matches) setTimeout(() => make.focus(), 350);
  return api;
}
