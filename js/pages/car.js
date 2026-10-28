// Car monitor: the Car tab (odometer, what's due: tyres, service and inspection, averages, consumption,
// your tyres). The other tabs and the sheets are in the car-*.js files next to it; app.js imports them from here.
import { h, chip, dot, kv, icon } from "../ui.js";
import { COLORS, MONTHS, localSym, fmtSek, mLong, isoDay, daysBetween, plainNumber, plural } from "../core.js";
import { carSummary, fmtKm, fmtKmSigned, fmtPerKm, parseDay, carLine, energy } from "../car.js";
import { statCard } from "./overview.js";
import { card, head, actions, btn, dayText, round100, daysWord, perUnit, selectedCar, carPicker, typeBadge, fmetric } from "./car-common.js";
import { noCarState, openCarLogSheet, openCarSheet } from "./car-sheets.js";
import { tyresCard } from "./car-tyres.js";

const RULE_TEXT = { first: "36 months after first registration", second: "24 months after the first inspection", later: "14 months after the last one" };
const monthsOrDays = (n) => (n > 60 ? `${Math.round(n / 30.4375)} months` : daysWord(n));
const inDays = (n) => (n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${monthsOrDays(n)}`);

/** + in the navigation bar */
export function openNewCarLog(ctx) {
  const car = selectedCar(ctx.data);
  return car ? openCarLogSheet(ctx, car, null) : openCarSheet(ctx, null);
}

/** Which tyres to suggest in a new tyre change: the other set. */
function suggestedTyres(t, today) {
  const winterUsed = [...t.changes].reverse().find((l) => l.tires !== "summer")?.tires || "studded";
  if (t.on === "summer") return winterUsed;
  if (t.on) return "summer";
  const m = today.getMonth() + 1;
  return m >= 9 || m <= 2 ? winterUsed : "summer";
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

// ---------------------------------------------------------------------------
// What's due: tyres, service and inspection in one card, the most urgent first. Tap one for its details.
// ---------------------------------------------------------------------------
const DUE_CHIP = { down: "Overdue", warn: "Soon", up: "On track" };
const DUE_RANK = { down: 0, warn: 1, flat: 2, up: 3 };
const dueOpen = new Set();            // the rows you opened ("car id:kind"), while the app is open

function tyreDue(car, sum, today, ctx) {
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
    rows.push(kv(t.last.type === "tyre_buy" ? "Changed (new tyres)" : "Changed", `${dayText(t.last.date, today)}${t.last_km !== null ? `  ·  ${t.last_km_estimated ? "≈ " : ""}${fmtKm(t.last_km)}` : ""}`, { amt: false }));
    if (t.km_on !== null) rows.push(kv("Driven on them", fmtKm(t.km_on), { amt: false }));
    if (t.avg_cost !== null) rows.push(kv(`Average change (${plural(t.priced_changes, "time")})`, fmtSek(t.avg_cost)));
  }
  return { kind: "tyres", type: "tires", title: "Tyres", status: t.title, tone: t.tone, chip: label || null,
    days: t.tone === "down" ? -1 : t.days_left,
    body: [h("div", { class: "muted" }, t.detail), dates,
      rows.length ? h("div", { class: "kv-list" }, rows) : null,
      actions(btn("+  Log a tyre change", () => openCarLogSheet(ctx, car, null, { type: "tires", tires: suggestedTyres(t, today) })))] };
}

function serviceDue(car, sum, today, ctx) {
  const s = sum.service;
  const buttons = actions(btn("+  Log a service", () => openCarLogSheet(ctx, car, null, { type: "service" })),
    btn(s.set ? "Change interval" : "Set interval", () => openCarSheet(ctx, car), "plain"));
  const base = { kind: "service", type: "service", title: "Service" };
  if (!s.last) {
    return { ...base, status: "Log your last service", tone: "flat", chip: null, days: null,
      body: [h("div", { class: "muted" }, s.set
        ? "Log your last service and the app works out when the next one is due."
        : "Log your last service, and set how often the car should be serviced (your service book says, e.g. every 15 000 km or 12 months), to see when the next one is due."),
      buttons] };
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
  const overdue = tone === "down";
  const days = overdue ? -1 : Math.min(s.days_left ?? Infinity, s.eta ? daysBetween(today, s.eta) : Infinity);
  return { ...base, status: title, tone, chip: DUE_CHIP[tone] || null, days: Number.isFinite(days) ? days : null,
    body: [when ? h("div", { class: "muted" }, when) : null,
      !s.set ? h("div", { class: "muted" }, "Set how often the car should be serviced to get a reminder.") : null,
      h("div", { class: "kv-list" }, rows),
      buttons] };
}

function inspectionDue(car, sum, today, ctx) {
  const s = sum.inspection;
  const buttons = actions(btn("+  Log an inspection", () => openCarLogSheet(ctx, car, null, { type: "inspection" })),
    !car.first_registered ? btn("Add first registration", () => openCarSheet(ctx, car), "plain") : null);
  const base = { kind: "inspection", type: "inspection", title: "Inspection" };
  if (!s.known) {
    return { ...base, status: "Log the last inspection", tone: "flat", chip: null, days: null,
      body: [h("div", { class: "muted" }, s.needs === "last"
        ? "Log the car's last inspection (besiktning) and the app works out when the next one is due."
        : "Log the car's last inspection (besiktning), or add the month it was first registered if it's under 3 years old, to see when the next one is due."),
      buttons] };
  }
  const over = s.days_left < 0;
  const rows = [];
  if (s.last) rows.push(kv("Last inspection", `${dayText(s.last.date, today)}${s.last.km !== null ? `  ·  ${fmtKm(s.last.km)}` : ""}`, { amt: false }));
  rows.push(kv("Rule", RULE_TEXT[s.rule], { amt: false }));
  if (s.reg) rows.push(kv("First registered", mLong(s.reg), { amt: false }));
  return { ...base, status: over ? `Overdue since ${dayText(s.due, today)}` : `${s.rule === "first" ? "First inspection" : "Next inspection"} by ${dayText(s.due, today)}`,
    tone: s.tone, chip: DUE_CHIP[s.tone], days: s.days_left,
    body: [h("div", { class: "muted" }, over
      ? "The car isn't allowed on the road (körförbud) until it has been inspected (kontrollbesiktning), except to drive it to the inspection or a workshop."
      : `Kontrollbesiktning: ${monthsOrDays(s.days_left)} left, until the last day of ${mLong(s.due_month)}. You can go earlier; the next deadline then counts from that month.`),
    h("div", { class: "kv-list" }, rows),
    buttons] };
}

function dueCard(car, sum, today, ctx) {
  const items = [tyreDue(car, sum, today, ctx), serviceDue(car, sum, today, ctx), inspectionDue(car, sum, today, ctx)]
    .sort((a, b) => DUE_RANK[a.tone] - DUE_RANK[b.tone] || (a.days ?? Infinity) - (b.days ?? Infinity));
  const rows = items.map((it) => {
    const id = `${car.id}:${it.kind}`;
    const row = h("div", { class: `due-row ${dueOpen.has(id) ? "open" : ""}` });
    const top = h("button", { type: "button", class: "due-head", "aria-expanded": String(dueOpen.has(id)) },
      typeBadge(it.type),
      h("div", { class: "due-main" }, h("div", { class: "due-title" }, it.title),
        h("div", { class: `due-status tone-text-${it.tone === "up" ? "flat" : it.tone}` }, it.status)),
      it.chip ? chip(it.chip, it.tone, "small") : null,
      icon("chevron", 15, "due-chev"));
    top.addEventListener("click", () => {
      const open = !row.classList.contains("open");
      row.classList.toggle("open", open);
      top.setAttribute("aria-expanded", String(open));
      if (open) dueOpen.add(id); else dueOpen.delete(id);
    });
    row.append(top, h("div", { class: "due-body" }, it.body));
    return row;
  });
  const urgent = items.some((it) => it.tone === "down" || it.tone === "warn");
  return card(head("What's due", `${urgent ? "Most urgent first." : "Nothing urgent."} Tap one for the details.`), h("div", { class: "due-list" }, rows));
}

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
  const metric = fmetric;
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

// The car's details, purchase papers and fixed costs are in its Garage card.
export function renderCar(ctx) {
  const today = ctx.today;
  const car = selectedCar(ctx.data);
  if (!car) return ["Mileage, fuel, services and tyres", noCarState(ctx)];
  const sum = carSummary(car, today);
  const subtitle = [carLine(car), sum.n ? `${plural(sum.n, "log")}, latest ${dayText(sum.logs.at(-1).date, today)}` : "no logs yet"].filter(Boolean).join("  ·  ");
  const picker = carPicker(ctx, car);
  if (!sum.n) return [subtitle, picker, noLogsCard(ctx, car), dueCard(car, sum, today, ctx), tyresCard(car, ctx)];
  return [subtitle, picker, odoHero(sum, today), dueCard(car, sum, today, ctx), stats(sum, today), consumptionCard(car, sum, today, ctx),
    tyresCard(car, ctx)];
}

// the other tabs, the sheets and the fixed costs, for app.js
export { carHeading } from "./car-common.js";
export { renderCarLog } from "./car-log.js";
export { renderCarInsights } from "./car-charts.js";
export { renderGarage } from "./car-garage.js";
export { openCarSheet } from "./car-sheets.js";
export { addFixedCostLogs } from "./car-fixed.js";
