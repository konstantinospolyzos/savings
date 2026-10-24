// Car monitor pages: Car (odometer, averages, tyres, service, charts, costs) and Log (every visit),
// plus the sheets to add or edit a log and the car's details.
import { h, chip, dot, segmented, splitBar, kv, icon, sheet, group, caption, footer, alertBox, toast, saveFile, selectRow } from "../ui.js";
import { chart } from "../charts.js";
import {
  COLORS, CUR, MONTHS, WEEKDAYS, localSym, fmtSek, fmtMoney, fmtAxisSek, mLong, mIndex, monthOf, addMonths, isoDay,
  daysBetween, todayDate, weekday, parseNumber, plainNumber, pct, plural, shortNote,
} from "../core.js";
import {
  CAR_TYPES, TYPE, NEEDS_KM, TYRE_SETS, carSummary, monthlyKm, monthlyCosts, previousReading, fuelStats, byDateKm,
  fmtKm, fmtKmSigned, fmtPerKm, fmtAxisKm, monthPos, parseDay, newLogId, carCsv,
} from "../car.js";
import { store } from "../store.js";
import { statCard } from "./overview.js";

const DAY_MS = 86400000;
const TYRE_ON = { summer: "Summer tyres on", studded: "Studded winter tyres on", winter: "Non-studded winter tyres on" };
const OTHER_KINDS = [["inspection", "Inspection (besiktning)"], ["repair", "Repair"], ["other", "Other"]];
const card = (...children) => h("div", { class: "card" }, children);
const head = (title, sub = null, right = null) => h("div", { class: "card-head" },
  h("div", { class: "card-head-text" }, h("div", { class: "card-title" }, title), sub ? h("div", { class: "card-sub" }, sub) : null), right);

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
const syncTap = () => { if (store.mode === "drive" && !store.drive.tokenValid()) store.syncFromTap(); };

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
function emptyState(ctx) {
  return h("div", { class: "card empty-state" },
    h("span", { class: "car-icon" }, icon("car", 40)),
    h("div", { class: "empty-title" }, "No logs yet"),
    h("div", { class: "empty-text" }, "Log the odometer every time you refuel or service the car, and what it cost. The app draws your mileage and costs, works out the averages and reminds you about tyre changes and services."),
    h("button", { class: "btn primary", type: "button", onclick: () => openCarLogSheet(ctx, null, { type: "fuel" }) }, "+  Log a refuel"),
    h("button", { class: "btn plain", type: "button", onclick: () => openCarLogSheet(ctx, null, { type: "service" }) }, "Log a service or tyre change"));
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
  const cards = [
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
      sum.cost_per_km_ex_fuel !== null && sum.by_type.fuel > 0 ? `${fmtPerKm(sum.cost_per_km_ex_fuel)} ex. fuel` : "", "flat", "vc"),
  ];
  return h("div", { class: "stats" }, cards);
}

const TONE_CHIP = { up: "All good", warn: "Soon", down: "Change now" };

function tyreCard(sum, today, ctx) {
  const t = sum.tyres;
  const label = t.tone === "warn" && t.days_left !== null ? `${daysWord(t.days_left)} left` : TONE_CHIP[t.tone];
  const rows = [];
  if (t.last) {
    rows.push(kv("Changed", `${dayText(t.last.date, today)}${t.last.km !== null ? `  ·  ${fmtKm(t.last.km)}` : ""}`, { amt: false }));
    if (t.km_on !== null) rows.push(kv("Driven on them", fmtKm(t.km_on), { amt: false }));
    if (t.avg_cost !== null) rows.push(kv(`Average change (${plural(t.changes.filter((l) => l.cost > 0).length, "time")})`, fmtSek(t.avg_cost)));
  }
  return card(head("Tyres", t.on ? TYRE_ON[t.on] : null, label ? chip(label, t.tone) : null),
    h("div", { class: `status-title tone-text-${t.tone === "flat" ? "flat" : t.tone}` }, t.title),
    h("div", { class: "muted" }, t.detail),
    rows.length ? h("div", { class: "kv-list" }, rows) : null,
    h("div", { class: "card-actions" },
      h("button", { type: "button", class: "btn tinted small", onclick: () => openCarLogSheet(ctx, null, { type: "tires", tires: suggestedTyres(t, today) }) },
        "+  Log a tyre change")));
}

function serviceCard(car, sum, today, ctx) {
  const s = sum.service;
  const actions = h("div", { class: "card-actions" },
    h("button", { type: "button", class: "btn tinted small", onclick: () => openCarLogSheet(ctx, null, { type: "service" }) }, "+  Log a service"),
    h("button", { type: "button", class: "btn plain small", onclick: () => openCarDetails(ctx) }, s.set ? "Change interval" : "Set interval"));
  if (!s.last) {
    return card(head("Service"),
      h("div", { class: "muted" }, s.set
        ? "Log your last service and the app works out when the next one is due."
        : "Log your last service, and set how often the car should be serviced (your service book says, e.g. every 15 000 km or 12 months), to see when the next one is due."),
      actions);
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
    actions);
}

// ---------------------------------------------------------------------------
function chartCard(sum, today) {
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
          const that = sum.logs.filter((l) => l.date === p.date).map((l) => TYPE[l.type].name);
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
      const firstMonth = sum.logs.length ? sum.logs[0].date.slice(0, 7) : thisMonth;
      const from = st.range === 0 && mIndex(firstMonth) < mIndex(thisMonth) - 11 ? addMonths(thisMonth, -11) : firstMonth;
      const mc = monthlyCosts(sum.logs, from, mIndex(thisMonth) >= mIndex(firstMonth) ? thisMonth : firstMonth);
      sub.textContent = "Coloured by the biggest cost that month.";
      if (!mc.some((m) => m.total > 0)) { empty("Add what each visit cost to see this"); return; }
      const colors = mc.map((m) => {
        const top = Object.entries(m.byType).sort((a, b) => b[1] - a[1])[0];
        return top ? TYPE[top[0]].color : COLORS.gray;
      });
      const used = CAR_TYPES.filter(([k]) => mc.some((m) => m.byType[k] > 0));
      const avg = sum.cost_per_month;
      const lines = avg ? [{ value: avg, color: COLORS.gray, dotted: true, label: `Average ${fmtSek(avg)}` }] : [];
      legend.append(...used.map(([, , costName, color]) => h("span", { class: "legend-item" }, dot(color), costName)),
        ...lines.map((l) => h("span", { class: "legend-item" }, h("span", { class: "line-swatch dotted", style: { borderColor: l.color } }), h("span", { class: "amt" }, l.label))));
      body.replaceChildren(chart({
        months: mc.map((m) => m.month), kind: "bar", format: fmtAxisSek, zeroBased: true, lineLabels: false, label: "Costs per month",
        series: [{ color: COLORS.orange, colors, values: mc.map((m) => m.total) }], lines,
        tooltip: (i) => {
          const m = mc[i];
          const rows = CAR_TYPES.filter(([k]) => m.byType[k] > 0).map(([k, , costName, color]) => [costName, fmtSek(m.byType[k]), color]);
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
function costsCard(sum, today) {
  const total = sum.costs;
  const period = sum.costs_full_year ? "Last 12 months" : `Since ${dayText(sum.costs_from, today)}`;
  const f = sum.fuel;
  const fuelRows = [];
  if (f.per100 !== null) {
    fuelRows.push(kv("Fuel use", `${f.per100.toFixed(1)} l/100 km`, { amt: false }));
    if (f.price !== null) fuelRows.push(kv("Fuel price", `${fmtMoney(CUR.local, f.price, 2)}/l`));
    if (f.cost100 !== null) fuelRows.push(kv("Fuel per 100 km", fmtSek(f.cost100)));
  }
  const fuelHint = f.per100 !== null ? "Fuel use assumes you fill the tank each time, over all your logs."
    : f.fills ? "Add the litres when you refuel to see how much fuel the car uses." : null;
  if (total <= 0) {
    return card(head("Where the money goes", "Add what each visit cost to see where the money goes."),
      fuelRows.length ? h("div", { class: "kv-list" }, fuelRows) : null, fuelHint ? h("div", { class: "hint" }, fuelHint) : null);
  }
  const types = CAR_TYPES.filter(([k]) => sum.by_type[k] > 0).sort((a, b) => sum.by_type[b[0]] - sum.by_type[a[0]]);
  const rows = types.map(([k, , costName, color]) => {
    const v = sum.by_type[k];
    return h("div", { class: "cost-type" }, dot(color, 9), h("span", { class: "cost-type-name" }, costName),
      h("span", { class: "cost-type-month amt" }, `${fmtSek(v / sum.costs_months)}/mo`),
      h("span", { class: "cost-type-value amt" }, fmtSek(v)), h("span", { class: "cost-type-pct" }, pct(v / total)));
  });
  return card(head("Where the money goes", h("span", { class: "amt-soft" }, `${period}  ·  ${fmtSek(total)}`)),
    splitBar(types.map(([k, , , color]) => [sum.by_type[k], color]), 10),
    h("div", { class: "cost-types" }, rows),
    fuelRows.length ? h("div", { class: "hairline" }) : null,
    fuelRows.length ? h("div", { class: "kv-list" }, fuelRows) : null,
    fuelHint ? h("div", { class: "hint" }, fuelHint) : null,
    sum.costs_all > total + 0.5 ? h("div", { class: "hint amt-soft" }, `All your logs together: ${fmtSek(sum.costs_all)}.`) : null);
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

export function renderCar(ctx) {
  const today = ctx.today;
  const sum = carSummary(ctx.data.car, today);
  if (!sum.n) return ["Mileage, fuel, services and tyres", emptyState(ctx)];
  const subtitle = `${plural(sum.n, "log")}  ·  latest ${dayText(sum.logs.at(-1).date, today)}`;
  return [subtitle, odoHero(sum, today), stats(sum, today), tyreCard(sum, today, ctx), serviceCard(ctx.data.car, sum, today, ctx),
    chartCard(sum, today), costsCard(sum, today), yearsCard(sum, today)];
}

// ---------------------------------------------------------------------------
// Log page
// ---------------------------------------------------------------------------
const FILTERS = [["All", () => true], ["Refuels", (l) => l.type === "fuel"],
  ["Service & tyres", (l) => l.type === "service" || l.type === "tires"],
  ["Other", (l) => !["fuel", "service", "tires"].includes(l.type)]];

function logRow(l, ctx, perFill, prevKm, today) {
  const sub = [dayText(l.date, today), l.km !== null ? fmtKm(l.km) : null].filter(Boolean).join("  ·  ");
  const extra = [];
  if (l.type === "tires" && l.tires) extra.push(TYRE_ON[l.tires]);
  if (l.type === "fuel" && l.litres) extra.push(`${plainNumber(l.litres, l.litres % 1 ? 1 : 0)} l`);
  if (perFill.has(l.id)) extra.push(`${perFill.get(l.id).toFixed(1)} l/100 km`);
  if (l.km !== null && prevKm !== null && l.km >= prevKm) extra.push(`${fmtKmSigned(l.km - prevKm)}`);
  return h("button", { type: "button", class: "crow", onclick: () => openCarLogSheet(ctx, l) },
    typeBadge(l.type),
    h("div", { class: "crow-main" },
      h("div", { class: "crow-title" }, TYPE[l.type].name),
      h("div", { class: "crow-sub" }, sub),
      extra.length ? h("div", { class: "crow-extra" }, extra.join("  ·  ")) : null,
      l.note ? h("div", { class: "crow-note" }, l.note) : null),
    h("div", { class: `crow-cost ${l.cost ? "amt" : "muted"}` }, l.cost ? fmtSek(l.cost) : "—"),
    icon("chevron", 16, "chev"));
}

export function renderCarLog(ctx) {
  const logs = ctx.data.car.logs;
  const today = ctx.today;
  const view = { filter: 0, ...(store.pref("car_log_view", {}) || {}) };
  const { perFill } = fuelStats(logs);
  const prevKm = new Map();
  let last = null;
  for (const l of [...logs].sort(byDateKm)) { prevKm.set(l.id, last); if (l.km !== null) last = l.km; }
  const subtitle = h("span");
  const list = h("div", { class: "history-list" });

  function fill() {
    const shown = logs.filter(FILTERS[view.filter][1]).slice().sort(byDateKm).reverse();
    subtitle.textContent = !logs.length ? "Nothing logged yet"
      : view.filter ? `${shown.length} of ${plural(logs.length, "log")}  ·  tap one to edit it` : `${plural(logs.length, "log")}  ·  tap one to edit or delete it`;
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
      list.append(h("div", { class: "hgroup" }, items.map((l) => logRow(l, ctx, perFill, prevKm.get(l.id), today))));
    }
  }

  const exportBtn = h("button", { type: "button", class: "pill-btn" }, icon("table", 15), "Export CSV");
  exportBtn.addEventListener("click", async () => {
    if (!logs.length) { toast("Nothing to export yet"); return; }
    await saveFile(`car-${isoDay(today)}.csv`, "text/csv", carCsv(logs));
  });
  fill();
  return [subtitle,
    segmented(FILTERS.map(([t]) => t), view.filter, (i) => { view.filter = i; store.setPref("car_log_view", view); fill(); }, "full"),
    h("div", { class: "pill-row" },
      h("button", { type: "button", class: "pill-btn", onclick: () => openCarDetails(ctx) }, icon("car", 15), "Car details"),
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
function row(labelText, input, unit = null) {
  return h("label", { class: "form-row" }, h("span", { class: "form-label" }, labelText), input,
    unit ? h("span", { class: "form-unit" }, unit) : null);
}
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_HINTS = {
  fuel: "Optional, e.g. the station, or a trip.",
  service: "What was done: oil, filters, brakes…",
  tires: "Optional, e.g. where the other set is stored, or new tyres.",
  inspection: "Optional, e.g. remarks from the inspection.",
  repair: "What was fixed.",
  other: "What it was: washing, parking, a toll, a part…",
};

export function openCarLogSheet(ctx, original = null, preset = {}) {
  const logs = ctx.data.car.logs;
  const today = ctx.today;
  const MAIN = ["fuel", "service", "tires"];
  let type = original ? original.type : preset.type || "fuel";
  let otherKind = MAIN.includes(type) ? "other" : type;
  let tires = original?.tires || preset.tires || "summer";
  const latestKm = logs.reduce((m, l) => (l.km !== null && l.km > m ? l.km : m), -1);

  const date = h("input", { class: "form-input date-input", type: "date", value: original ? original.date : isoDay(today), "aria-label": "Date" });
  const km = numField(latestKm >= 0 ? `Last: ${plainNumber(latestKm)}` : "e.g. 45 210", "numeric");
  const cost = numField("optional");
  const litres = numField("optional");
  const note = h("textarea", { class: "note-input", rows: "2" });

  const kindRow = selectRow("What", OTHER_KINDS, otherKind, (v) => { otherKind = v; type = v; update(); });
  const kindGroup = group(kindRow);
  const kmRow = row("Odometer", km, "km");
  const litresRow = row("Litres", litres, "l");
  const kmFooter = footer("");
  const costFooter = footer("");
  const tyreCaption = caption("TYRES PUT ON");
  const tyreSeg = segmented(["Summer", "Studded", "Non-studded"], Math.max(0, TYRE_SETS.findIndex(([k]) => k === tires)),
    (i) => { tires = TYRE_SETS[i][0]; update(); }, "full");
  const tyreFooter = footer("Studded and non-studded are both winter tyres. In Sweden winter tyres are required 1 December – 31 March when the roads are wintry, and studs are allowed 1 October – 15 April.");
  const noteFooter = footer("");
  const typeSeg = segmented(["Refuel", "Service", "Tyres", "Other"], MAIN.includes(type) ? MAIN.indexOf(type) : 3,
    (i) => { type = i === 3 ? otherKind : MAIN[i]; update(); }, "full");

  let api = null;
  const read = () => ({ d: date.value, k: parseNumber(km.value), c: parseNumber(cost.value), l: parseNumber(litres.value) });

  function update() {
    const isFuel = type === "fuel", isTyres = type === "tires", isOther = !MAIN.includes(type);
    kindGroup.style.display = isOther ? "" : "none";
    litresRow.style.display = isFuel ? "" : "none";
    for (const el of [tyreCaption, tyreSeg, tyreFooter]) el.style.display = isTyres ? "" : "none";
    note.placeholder = "Note";
    noteFooter.textContent = NOTE_HINTS[type];
    validate();
  }

  function validate() {
    const { d, k, c, l } = read();
    const dateOk = DATE_RX.test(d);
    const kmBad = Boolean(km.value.trim()) && (k === null || k < 0);
    const costBad = Boolean(cost.value.trim()) && (c === null || c < 0);
    const litresBad = type === "fuel" && Boolean(litres.value.trim()) && (l === null || l <= 0);
    km.classList.toggle("invalid", kmBad);
    cost.classList.toggle("invalid", costBad);
    litres.classList.toggle("invalid", litresBad);
    const needKm = NEEDS_KM.has(type);
    const ok = dateOk && !kmBad && !costBad && !litresBad && (!needKm || k !== null);
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

    // cost: price per litre and fuel use for refuels
    if (type === "fuel") {
      const parts = [];
      if (c > 0 && l > 0) parts.push(`${fmtMoney(CUR.local, c / l, 2)} a litre`);
      const prevFuel = dateOk ? [...logs].sort(byDateKm).reverse()
        .find((x) => x.type === "fuel" && x.km !== null && x.id !== original?.id && x.date <= d && (k === null || x.km < k)) : null;
      let odd = false;
      if (l > 0 && k !== null && prevFuel && k > prevFuel.km) {
        const use = (l / (k - prevFuel.km)) * 100;
        odd = use > 25;
        parts.push(odd ? `${use.toFixed(1)} l/100 km since the last refuel looks high. Check the odometer and the litres.`
          : `${use.toFixed(1)} l/100 km since the last refuel (if you filled the tank)`);
      }
      costFooter.textContent = parts.length ? parts.join("  ·  ") : "Add the litres to see the price per litre and how much fuel the car uses.";
      costFooter.className = `section-footer ${odd ? "tone-text-warn" : ""}`;
    } else {
      costFooter.textContent = `What it cost, in ${CUR.local}. Leave it empty if you don't know.`;
      costFooter.className = "section-footer";
    }
  }

  for (const f of [date, km, cost, litres]) f.addEventListener("input", validate);
  date.addEventListener("change", validate);
  note.addEventListener("input", () => { note.style.height = "auto"; note.style.height = `${Math.max(note.scrollHeight, 56)}px`; });

  if (original) {
    if (original.km !== null) km.value = plainNumber(original.km);
    if (original.cost !== null) cost.value = plainNumber(original.cost, original.cost % 1 ? 2 : 0);
    if (original.litres !== null) litres.value = plainNumber(original.litres, original.litres % 1 ? 2 : 0);
    note.value = original.note || "";
  }

  const body = h("div", { class: "form" },
    caption("WHAT"), typeSeg, kindGroup,
    caption("WHEN AND HOW FAR"),
    group(h("label", { class: "form-row" }, h("span", { class: "form-label" }, "Date"), date), kmRow),
    kmFooter,
    caption("COST"),
    group(row("Cost", cost, localSym()), litresRow),
    costFooter,
    tyreCaption, tyreSeg, tyreFooter,
    caption("NOTE"),
    group(h("div", { class: "note-wrap" }, note)),
    noteFooter,
    original ? h("button", { type: "button", class: "btn destructive-row", onclick: () => remove() }, "Delete Log") : null);

  function save(sh) {
    const { d, k, c, l } = read();
    if (!DATE_RX.test(d) || (NEEDS_KM.has(type) && k === null)) return;
    const log = { id: original ? original.id : newLogId(), date: d, type, km: k, cost: c,
      litres: type === "fuel" ? l : null, tires: type === "tires" ? tires : null, note: note.value.trim() };
    store.saveCarLog(log);
    sh.close();
    toast(`✓  Saved ${TYPE[type].name.toLowerCase()}${k !== null ? `  ·  ${fmtKm(k)}` : ""}`);
    syncTap();
  }

  async function remove() {
    const ok = await alertBox({ title: "Delete this log?",
      message: `${TYPE[original.type].name} on ${dayText(original.date, today)}${original.km !== null ? `, ${fmtKm(original.km)}` : ""}. This can't be undone.`,
      buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Delete", value: true, style: "destructive" }] });
    if (!ok) return;
    store.deleteCarLog(original.id);
    api.close();
    toast("Deleted the log");
    syncTap();
  }

  api = sheet({ title: original ? "Edit Log" : "New Log", left: { text: "Cancel" }, right: { text: "Save", bold: true, onClick: save }, body });
  update();
  note.dispatchEvent(new Event("input"));
  if (!original && matchMedia("(pointer: fine)").matches) setTimeout(() => km.focus(), 350);
  return api;
}

export function openCarDetails(ctx) {
  const c = ctx.data.car;
  const name = h("input", { class: "form-input", type: "text", autocomplete: "off", placeholder: "e.g. Volvo V60", value: c.name || "", "aria-label": "Car" });
  const kmI = numField("e.g. 15 000", "numeric");
  const monthsI = numField("e.g. 12", "numeric");
  if (c.service_km) kmI.value = plainNumber(c.service_km);
  if (c.service_months) monthsI.value = String(c.service_months);
  let api = null;
  const validate = () => {
    const k = parseNumber(kmI.value), m = parseNumber(monthsI.value);
    const kBad = Boolean(kmI.value.trim()) && !(k > 0), mBad = Boolean(monthsI.value.trim()) && !(m > 0 && m <= 120);
    kmI.classList.toggle("invalid", kBad);
    monthsI.classList.toggle("invalid", mBad);
    api?.setRight({ disabled: kBad || mBad });
  };
  for (const f of [kmI, monthsI]) f.addEventListener("input", validate);
  const body = h("div", { class: "form" },
    caption("CAR"), group(row("Name", name)),
    footer("Shown as the title of the Car page. Optional."),
    caption("SERVICE EVERY"), group(row("Kilometres", kmI, "km"), row("or months", monthsI, "months")),
    footer("From your service book, e.g. every 15 000 km or 12 months, whichever comes first. Fill in one or both to get a reminder on the Car page."));
  api = sheet({ title: "Car Details", left: { text: "Cancel" }, body,
    right: { text: "Save", bold: true, onClick: (sh) => {
      const k = parseNumber(kmI.value), m = parseNumber(monthsI.value);
      store.setCar({ name: name.value.trim(), service_km: k > 0 ? k : null, service_months: m > 0 ? Math.round(m) : null });
      sh.close();
      toast("✓  Saved the car details");
      syncTap();
    } } });
  validate();
  return api;
}
