// Car monitor - data and calculations (no page code here, so it can be tested on its own).
// Every log is one visit: a refuel, a service, a tyre change... with the odometer reading.
// Costs are in your own currency (the one salary and bank use).

import {
  COLORS, CUR, day, isoDay, daysBetween, addDays, mIndex, monthOf, addMonths, mean, plainNumber, fmtMoney,
} from "./core.js";

// [key, name in the log, name for costs, colour, icon]
export const CAR_TYPES = [
  ["fuel", "Refuel", "Fuel", COLORS.orange, "fuel"],
  ["service", "Service", "Service", COLORS.blue, "wrench"],
  ["tires", "Tyre change", "Tyre changes", COLORS.purple, "tyre"],
  ["tyre_buy", "New tyres", "New tyres", COLORS.indigo, "tyre"],
  ["inspection", "Inspection", "Inspection", COLORS.teal, "check"],
  ["repair", "Repair", "Repairs", COLORS.red, "wrench"],
  ["tax", "Vehicle tax", "Tax", COLORS.pink, "receipt"],
  ["other", "Other", "Other", COLORS.gray, "car"],
];
export const TYPE = Object.fromEntries(CAR_TYPES.map(([key, name, costName, color, icon]) => [key, { key, name, costName, color, icon }]));
/** Odometer needed for these; optional for the rest (an inspection fee, parking...) */
export const NEEDS_KM = new Set(["fuel", "service", "tires"]);

export const TYRE_SETS = [
  ["summer", "Summer"],
  ["studded", "Winter, studded"],
  ["winter", "Winter, non-studded"],
];
export const TYRE_NAME = Object.fromEntries(TYRE_SETS);

const DAY_MS = 86400000;
const MONTH_DAYS = 30.4375;
const sum = (values) => values.reduce((a, b) => a + b, 0);
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-24" -> Date at noon (so DST never moves a day) */
export const parseDay = (iso) => { const [y, m, d] = iso.split("-").map(Number); return day(y, m, d); };
const isRealDay = (iso) => DATE_RX.test(iso) && isoDay(parseDay(iso)) === iso;
const dayT = (iso) => parseDay(iso).getTime();

/** Same day N months later (31 Jan + 1 month = 28/29 Feb) */
export function addMonthsToDay(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = addMonths(`${y}-${String(m).padStart(2, "0")}`, n);
  const [ty, tm] = target.split("-").map(Number);
  const last = new Date(ty, tm, 0).getDate();
  return isoDay(day(ty, tm, Math.min(d, last)));
}

// ---------------------------------------------------------------------------
// Cars in the data file: data.cars = [{id, name, make, model, year, plate, fuel, first_registered,
// service_km, service_months, logs: [...]}]. The first version kept one car in data.car; it moves
// into the list with the id "car-1" (the same on every device, so queued changes still find it).
// ---------------------------------------------------------------------------
export const FUELS = [
  ["95", "Petrol 95"], ["98", "Petrol 98"], ["diesel", "Diesel"], ["e85", "E85"],
  ["hybrid", "Hybrid (petrol)"], ["electric", "Electric"],
];
export const FUEL_NAME = Object.fromEntries(FUELS);
export const LEGACY_CAR_ID = "car-1";
const MONTH_RX = /^\d{4}-\d{2}$/;

export const newLogId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const newCarId = () => `car-${newLogId()}`;
export const emptyCar = (id = newCarId()) => ({ id, name: "", make: "", model: "", year: null, plate: "", fuel: "95",
  first_registered: null, service_km: null, service_months: null, logs: [] });
export const byDateKm = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.km ?? -1) - (b.km ?? -1));

const optPos = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const str = (v, max = 60) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function normalizeLogs(raw) {
  const seen = new Set();
  const logs = [];
  for (const l of Array.isArray(raw) ? raw : []) {
    if (!l || typeof l !== "object" || typeof l.date !== "string" || !isRealDay(l.date)) continue;
    let id = typeof l.id === "string" && l.id ? l.id : newLogId();
    while (seen.has(id)) id = newLogId();
    seen.add(id);
    const type = TYPE[l.type] ? l.type : "other";
    logs.push({
      id, date: l.date, type, km: optPos(l.km), cost: optPos(l.cost),
      litres: type === "fuel" ? optPos(l.litres) : null,
      full: type === "fuel" ? l.full !== false : null,       // a top-up has full: false
      tires: (type === "tires" || type === "tyre_buy") && TYRE_NAME[l.tires] ? l.tires : null,
      fitted: type === "tyre_buy" ? l.fitted !== false : null,   // new tyres put on at once: also a tyre change
      note: typeof l.note === "string" ? l.note : "",
      // invoice photos: the picture is kept on the device and (with Drive) as a file in Drive
      photos: (Array.isArray(l.photos) ? l.photos : []).filter((p) => p && typeof p.id === "string" && p.id).slice(0, 12)
        .map((p) => ({ id: p.id, drive: typeof p.drive === "string" && p.drive ? p.drive : null })),
    });
  }
  return logs.sort(byDateKm);
}

/** One car: its details and its logs, checked and tidied. */
export function normalizeCar(raw, id = null) {
  const c = raw && typeof raw === "object" ? raw : {};
  const months = optPos(c.service_months);
  const year = Number(c.year);
  const reg = typeof c.first_registered === "string" ? c.first_registered.slice(0, 7) : "";
  return {
    id: id || (typeof c.id === "string" && c.id ? c.id : newCarId()),
    name: str(c.name), make: str(c.make), model: str(c.model),
    year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null,
    plate: str(c.plate, 12).toUpperCase().replace(/\s+/g, " "),
    fuel: FUEL_NAME[c.fuel] ? c.fuel : "95",
    first_registered: MONTH_RX.test(reg) ? reg : null,
    service_km: optPos(c.service_km) || null,
    service_months: months ? Math.round(months) : null,
    logs: normalizeLogs(c.logs),
  };
}

/** All cars of a data file, from data.cars, or from data.car of the first version. */
export function normalizeCars(rawCars, legacy = null) {
  let list = Array.isArray(rawCars) ? rawCars.filter((c) => c && typeof c === "object") : [];
  if (!list.length && legacy && typeof legacy === "object"
    && ((Array.isArray(legacy.logs) && legacy.logs.length) || legacy.name || legacy.service_km || legacy.service_months)) {
    list = [{ ...legacy, id: LEGACY_CAR_ID }];
  }
  const ids = new Set();
  return list.map((c) => {
    let id = typeof c.id === "string" && c.id ? c.id : newCarId();
    while (ids.has(id)) id = newCarId();
    ids.add(id);
    return normalizeCar(c, id);
  });
}

export function describeCars(cars) {
  const n = (cars || []).reduce((a, c) => a + c.logs.length, 0);
  return n ? `${n} car log${n !== 1 ? "s" : ""}` : "";
}

/** "Volvo V60", the nickname if there is one, or just "Car" */
export const carTitle = (c) => (c && (c.name || [c.make, c.model].filter(Boolean).join(" "))) || "Car";
/** "Volvo V60 · 2019 · ABC 123" (without what the title already says) */
export function carLine(c) {
  if (!c) return "";
  const makeModel = [c.make, c.model].filter(Boolean).join(" ");
  return [c.name ? makeModel : "", c.year ? String(c.year) : "", c.plate].filter(Boolean).join("  ·  ");
}

/** Words that depend on what the car runs on */
export function energy(c) {
  if (c?.fuel === "electric") return { refuel: "Charging", amount: "kWh", unit: "kWh", per100: "kWh/100 km", priceKey: null };
  return { refuel: "Refuel", amount: "Litres", unit: "l", per100: "l/100 km", priceKey: c?.fuel === "diesel" ? "diesel" : "95" };
}

// ---------------------------------------------------------------------------
// Odometer
// ---------------------------------------------------------------------------
/** One reading per day (the highest), in date order: [{date, t, km}] */
export function odoPoints(logs) {
  const byDay = new Map();
  for (const l of logs) if (l.km !== null && l.km !== undefined) byDay.set(l.date, Math.max(byDay.get(l.date) ?? -Infinity, l.km));
  return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, km]) => ({ date, t: dayT(date), km }));
}

/** The odometer at time t: a straight line between readings, held at the first and last reading outside them. */
export function odometerAt(points, t) {
  if (!points.length) return null;
  if (t <= points[0].t) return points[0].km;
  const last = points.at(-1);
  if (t >= last.t) return last.km;
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i].t) {
      const a = points[i - 1], b = points[i];
      return a.km + ((b.km - a.km) * (t - a.t)) / (b.t - a.t);
    }
  }
  return last.km;
}
const drivenBetween = (points, t0, t1) => Math.max(0, odometerAt(points, t1) - odometerAt(points, t0));

/** Kilometres driven in each month from the first to the last reading (estimated between readings). */
export function monthlyKm(points) {
  if (points.length < 2) return [];
  const first = points[0], last = points.at(-1);
  const out = [];
  for (let m = monthOf(parseDay(first.date)); mIndex(m) <= mIndex(monthOf(parseDay(last.date))); m = addMonths(m, 1)) {
    const [y, mm] = m.split("-").map(Number);
    const s = day(y, mm, 1).getTime();
    const [ny, nm] = addMonths(m, 1).split("-").map(Number);
    const e = day(ny, nm, 1).getTime();
    out.push({ month: m, km: drivenBetween(points, Math.max(s, first.t), Math.min(e, last.t)),
      from: s < first.t ? first.date : null, until: e > last.t + DAY_MS ? last.date : null });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fuel
// ---------------------------------------------------------------------------
/**
 * Real fuel use, from full tank to full tank: the litres put in at a full tank (plus any top-ups
 * since the full tank before) were burnt on the kilometres driven since that full tank. The cost of
 * those refuels over the same kilometres is the fuel cost per km. A refuel without litres breaks
 * the chain; counting starts again at the next full tank.
 */
const WINTER_MONTHS = new Set([11, 12, 1, 2, 3]);
function sumUp(segs) {
  const km = sum(segs.map((x) => x.km)), litres = sum(segs.map((x) => x.litres));
  const priced = segs.filter((x) => x.cost !== null), pkm = sum(priced.map((x) => x.km));
  return { n: segs.length, km, litres, per100: km >= 50 ? (litres / km) * 100 : null,
    per_km: pkm >= 50 ? sum(priced.map((x) => x.cost)) / pkm : null };
}

export function fuelStats(logs, today = null) {
  const fills = logs.filter((l) => l.type === "fuel" && l.km !== null).sort(byDateKm);
  const segments = [];
  const perFill = new Map();
  let start = null, litres = 0, cost = 0, costKnown = true, broken = false, topups = 0;
  for (const f of fills) {
    if (start === null) { if (f.full !== false) start = f; continue; }   // the first full tank is where counting starts
    if (f.litres > 0) litres += f.litres; else broken = true;
    if (f.cost > 0) cost += f.cost; else costKnown = false;
    if (f.full === false) { topups += 1; continue; }
    const km = f.km - start.km;
    if (!broken && km > 0 && litres > 0) {
      const seg = { id: f.id, from: start.date, to: f.date, from_km: start.km, km, litres, per100: (litres / km) * 100,
        cost: costKnown ? cost : null, per_km: costKnown ? cost / km : null, topups };
      segments.push(seg);
      perFill.set(f.id, seg);
    }
    start = f; litres = 0; cost = 0; costKnown = true; broken = false; topups = 0;
  }
  const all = sumUp(segments);
  const recent = today ? sumUp(segments.filter((x) => daysBetween(parseDay(x.to), today) <= 365)) : all;
  const priced = logs.filter((l) => l.type === "fuel" && l.litres > 0 && l.cost > 0);
  const price = priced.length ? sum(priced.map((l) => l.cost)) / sum(priced.map((l) => l.litres)) : null;
  const byUse = [...segments].sort((a, b) => a.per100 - b.per100);
  return {
    per100: all.per100, per_km: all.per_km, price, cost100: all.per100 !== null && price !== null ? all.per100 * price : null,
    fills: fills.length, segments, perFill, all, recent,
    winter: sumUp(segments.filter((x) => WINTER_MONTHS.has(Number(x.to.slice(5, 7))))),
    summer: sumUp(segments.filter((x) => !WINTER_MONTHS.has(Number(x.to.slice(5, 7))))),
    best: byUse[0] || null, worst: byUse.at(-1) || null, latest: segments.at(-1) || null,
  };
}

/** Consumption by calendar month, all years together (a stretch counts in the month it ended). */
export function consumptionByMonth(segments) {
  const by = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, km: 0, litres: 0, n: 0 }));
  for (const x of segments) {
    const b = by[Number(x.to.slice(5, 7)) - 1];
    b.km += x.km; b.litres += x.litres; b.n += 1;
  }
  return by.map((b) => ({ ...b, per100: b.km >= 50 ? (b.litres / b.km) * 100 : null }));
}

/**
 * This calendar year: so far, and about where it ends on 31 December at the pace of the last 12
 * months (kilometres a day; fuel at your cost per km; other costs at their monthly average).
 */
export function yearForecast(sum, today) {
  const y = today.getFullYear();
  const todayIso = isoDay(today);
  const daysLeft = Math.max(0, daysBetween(today, day(y, 12, 31)));
  const logs = sum.logs.filter((l) => l.date.startsWith(`${y}-`) && l.date <= todayIso);
  const costs = sum_(logs.map((l) => l.cost || 0));
  const fuel = sum_(logs.filter((l) => l.type === "fuel").map((l) => l.cost || 0));
  const kmLeft = sum.per_day !== null ? sum.per_day * daysLeft : null;
  const perKm = sum.fuel.recent.per_km ?? sum.fuel.all.per_km;
  const fuelEnd = kmLeft !== null && perKm !== null ? fuel + kmLeft * perKm : null;
  const otherPerMonth = sum.cost_per_month !== null ? (sum.costs - sum.costs_fuel) / sum.costs_months : null;
  const last = sum.years.find((x) => x.year === y - 1) || null;
  return {
    year: y, days_left: daysLeft,
    km: sum.this_year, km_end: kmLeft !== null ? sum.this_year + kmLeft : null,
    fuel, fuel_end: fuelEnd,
    costs, costs_end: fuelEnd !== null && otherPerMonth !== null ? costs + (fuelEnd - fuel) + otherPerMonth * (daysLeft / MONTH_DAYS) : null,
    last: last && !last.from ? last : null,         // only a year logged from its start compares fairly
  };
}
const sum_ = (values) => values.reduce((a, b) => a + b, 0);

/** What a refuel being typed in would show: its full-tank-to-full-tank stretch, or null. */
export function fillPreview(logs, draft, exceptId = null) {
  const others = logs.filter((l) => l.id !== exceptId);
  return fuelStats([...others, { ...draft, id: "__draft", type: "fuel" }]).perFill.get("__draft") || null;
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------
export function monthlyCosts(logs, fromMonth, toMonth) {
  const out = [];
  if (!fromMonth || mIndex(toMonth) < mIndex(fromMonth)) return out;
  const by = new Map();
  for (const l of logs) {
    if (!(l.cost > 0)) continue;
    const m = l.date.slice(0, 7);
    if (!by.has(m)) by.set(m, []);
    by.get(m).push(l);
  }
  for (let m = fromMonth; mIndex(m) <= mIndex(toMonth); m = addMonths(m, 1)) {
    const items = by.get(m) || [];
    const byType = {};
    for (const l of items) byType[l.type] = (byType[l.type] || 0) + l.cost;
    out.push({ month: m, total: sum(items.map((l) => l.cost)), byType, items });
  }
  return out;
}

export function costsByType(logs) {
  const totals = Object.fromEntries(CAR_TYPES.map(([k]) => [k, 0]));
  for (const l of logs) if (l.cost > 0) totals[l.type] += l.cost;
  return totals;
}

// ---------------------------------------------------------------------------
// Tyres (Swedish rules, Transportstyrelsen): winter tyres are required 1 Dec - 31 Mar when the
// roads are wintry; studded tyres are allowed 1 Oct - 15 Apr (outside that only in winter conditions).
// ---------------------------------------------------------------------------
export function tyreStatus(logs, today, latestKm = null) {
  // a tyre change, or new tyres fitted when they were bought
  const changes = logs.filter((l) => (l.type === "tires" || (l.type === "tyre_buy" && l.fitted !== false)) && l.tires).sort(byDateKm);
  const last = changes.at(-1) || null;
  const on = last ? last.tires : null;
  const y = today.getFullYear();
  const md = (today.getMonth() + 1) * 100 + today.getDate();
  const until = (iso) => daysBetween(today, parseDay(iso));
  let tone = "up", title, detail, deadline = null;
  if (!on) {
    tone = "flat";
    title = "Which tyres are on?";
    detail = "Log your next tyre change (or the last one) and the app reminds you when it's time to switch.";
  } else if (on === "summer") {
    if (md >= 1001 && md <= 1130) {
      tone = "warn"; deadline = `${y}-12-01`;
      title = "Time for winter tyres";
      detail = "Winter tyres are required from 1 December when the roads are wintry. Studded tyres are allowed from 1 October.";
    } else if (md >= 1201 || md <= 331) {
      tone = "down";
      title = "Winter tyres required";
      detail = "From 1 December to 31 March you need winter tyres whenever there's snow, ice, slush or frost on the road.";
    } else {
      title = "Summer tyres on";
      detail = "Next change: winter tyres in October or November. They're required from 1 December in winter conditions.";
    }
  } else if (on === "studded") {
    if (md >= 401 && md <= 415) {
      tone = "warn"; deadline = `${y}-04-15`;
      title = "Studs off by 15 April";
      detail = "Studded tyres are allowed until 15 April, longer only if it's still wintry. Switch to summer tyres.";
    } else if (md >= 416 && md <= 930) {
      tone = "down";
      title = "Studded tyres aren't allowed now";
      detail = "Studs are allowed 1 October – 15 April, and outside that only in winter conditions. Switch to summer tyres.";
    } else {
      title = "Studded winter tyres on";
      detail = "Studs are allowed until 15 April. Next change: summer tyres in April.";
    }
  } else if (md >= 401 && md <= 930) {
    tone = "warn";
    title = "Time for summer tyres";
    detail = "Non-studded winter tyres are allowed all year, but in summer they brake worse and wear faster.";
  } else {
    title = "Winter tyres on";
    detail = "Next change: summer tyres in April.";
  }
  const costs = changes.filter((l) => l.type === "tires" && l.cost > 0).map((l) => l.cost);   // what a swap costs, without new tyres
  return {
    on, last, changes, tone, title, detail, deadline, days_left: deadline ? until(deadline) : null,
    km_on: last && last.km !== null && latestKm !== null ? Math.max(0, latestKm - last.km) : null,
    avg_cost: costs.length ? mean(costs) : null, priced_changes: costs.length,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export function serviceStatus(car, today, latestKm = null, perDay = null) {
  const services = car.logs.filter((l) => l.type === "service").sort(byDateKm);
  const last = services.at(-1) || null;
  const res = { last, set: Boolean(car.service_km || car.service_months), km_since: null, days_since: null,
    due_km: null, km_left: null, eta: null, due_date: null, days_left: null, tone: "flat" };
  if (!last) return res;
  if (last.km !== null && latestKm !== null) res.km_since = Math.max(0, latestKm - last.km);
  res.days_since = daysBetween(parseDay(last.date), today);
  if (car.service_km && last.km !== null && latestKm !== null) {
    res.due_km = last.km + car.service_km;
    res.km_left = res.due_km - latestKm;
    if (perDay > 0 && res.km_left > 0) res.eta = addDays(today, Math.round(res.km_left / perDay));
  }
  if (car.service_months) {
    res.due_date = addMonthsToDay(last.date, car.service_months);
    res.days_left = daysBetween(today, parseDay(res.due_date));
  }
  const overdue = (res.km_left !== null && res.km_left < 0) || (res.days_left !== null && res.days_left < 0);
  const soon = (res.km_left !== null && res.km_left <= 1500) || (res.days_left !== null && res.days_left <= 30)
    || (res.eta !== null && daysBetween(today, res.eta) <= 30);
  res.tone = overdue ? "down" : soon ? "warn" : res.set ? "up" : "flat";
  return res;
}

// ---------------------------------------------------------------------------
// Inspection (kontrollbesiktning), Transportstyrelsen's rules for cars: the first one at the latest
// 36 months after the month the car was first registered, the second 24 months after the month of
// the first, then 14 months after the month of the one before. Doing it early is fine: the time
// always counts from the month of the latest inspection.
// ---------------------------------------------------------------------------
export const INSPECTION_MONTHS = { first: 36, second: 24, later: 14 };
const lastDayOf = (month) => { const [y, m] = month.split("-").map(Number); return isoDay(day(y, m, new Date(y, m, 0).getDate())); };

export function inspectionStatus(car, today) {
  const done = car.logs.filter((l) => l.type === "inspection").sort(byDateKm);
  const last = done.at(-1) || null;
  const reg = car.first_registered;
  let from = null, rule = null;
  if (last) {
    from = last.date.slice(0, 7);
    // its first inspection, if the car was under 3 years old then and it's the only one logged
    rule = reg && done.length === 1 && mIndex(from) - mIndex(reg) <= INSPECTION_MONTHS.first ? "second" : "later";
  } else if (reg && mIndex(monthOf(today)) - mIndex(reg) <= INSPECTION_MONTHS.first) {
    from = reg;
    rule = "first";
  }
  if (!rule) return { known: false, last: null, needs: reg ? "last" : "either", reg };
  const months = INSPECTION_MONTHS[rule];
  const dueMonth = addMonths(from, months);
  const due = lastDayOf(dueMonth);
  const daysLeft = daysBetween(today, parseDay(due));
  return { known: true, last, rule, from, months, due_month: dueMonth, due, days_left: daysLeft, reg,
    tone: daysLeft < 0 ? "down" : daysLeft <= 60 ? "warn" : "up" };
}

// ---------------------------------------------------------------------------
// Tyre dates for the season around today (Swedish rules, see tyreStatus)
// ---------------------------------------------------------------------------
export function tyreDates(today) {
  const y = today.getFullYear();
  const md = (today.getMonth() + 1) * 100 + today.getDate();
  const iso = (yy, m, d) => isoDay(day(yy, m, d));
  const left = (d) => daysBetween(today, parseDay(d));
  const winterNow = md >= 1201 || md <= 331;
  const winterFrom = md <= 331 ? iso(y - 1, 12, 1) : iso(y, 12, 1);
  const winterUntil = md <= 331 ? iso(y, 3, 31) : iso(y + 1, 3, 31);
  const summerSeason = md >= 401 && md <= 930;       // summer tyres on, no change coming up
  const summerFrom = md >= 1001 ? iso(y + 1, 4, 1) : iso(y, 4, 1);
  const studsNow = md >= 1001 || md <= 415;
  const studsFrom = md <= 415 ? iso(y - 1, 10, 1) : iso(y, 10, 1);
  const studsUntil = md <= 415 ? iso(y, 4, 15) : iso(y + 1, 4, 15);
  return {
    winter_now: winterNow, winter_from: winterFrom, winter_until: winterUntil, winter_days: winterNow ? 0 : left(winterFrom),
    summer_now: summerSeason, summer_from: summerFrom, summer_days: summerSeason ? 0 : left(summerFrom),
    studs_now: studsNow, studs_from: studsFrom, studs_until: studsUntil,
    studs_days: studsNow ? left(studsUntil) : left(studsFrom),
  };
}

// ---------------------------------------------------------------------------
// Fuel prices (data/fuel-prices.json, from the EU Weekly Oil Bulletin: Monday prices)
// ---------------------------------------------------------------------------
/** The price of the week a day falls in: the latest Monday price on or before it, at most 13 days old. */
export function weekPrice(series, iso) {
  let lo = 0, hi = series.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= iso) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (best < 0 || daysBetween(parseDay(series[best][0]), parseDay(iso)) > 13) return null;
  return series[best];
}

export function priceSummary(series, today) {
  if (!series?.length) return null;
  const latest = series.at(-1);
  const prev = series.length > 1 ? series.at(-2) : null;
  const yearAgo = weekPrice(series, isoDay(addDays(parseDay(latest[0]), -364)));
  const lastYear = series.filter(([d]) => daysBetween(parseDay(d), today) <= 365).map(([, v]) => v);
  return {
    latest, prev, year_ago: yearAgo,
    change_week: prev ? latest[1] - prev[1] : null,
    change_year: yearAgo ? latest[1] - yearAgo[1] : null,
    low: lastYear.length ? Math.min(...lastYear) : null, high: lastYear.length ? Math.max(...lastYear) : null,
    avg: lastYear.length ? mean(lastYear) : null,
  };
}

/** What you paid per litre on each refuel with both cost and litres: [{log, price, week}] */
export function paidPrices(logs, series = null) {
  return logs.filter((l) => l.type === "fuel" && l.cost > 0 && l.litres > 0).sort(byDateKm)
    .map((l) => ({ log: l, price: l.cost / l.litres, week: series ? weekPrice(series, l.date) : null }));
}

// ---------------------------------------------------------------------------
// Everything the car pages show
// ---------------------------------------------------------------------------
export function carSummary(car, today) {
  const logs = [...car.logs].sort(byDateKm);
  const points = odoPoints(logs);
  const T = today.getTime();
  const first = points[0] || null, latest = points.at(-1) || null;
  const firstLog = logs[0] || null;

  // driving: the last 12 months, or since the first reading
  const yearAgo = T - 365 * DAY_MS;
  let perDay = null, kmWindowFrom = null;
  if (first && latest) {
    const from = Math.max(first.t, yearAgo);
    const days = (latest.t - from) / DAY_MS;
    if (days >= 14) { perDay = drivenBetween(points, from, latest.t) / days; kmWindowFrom = isoDay(new Date(from)); }
  }
  const jan1 = day(today.getFullYear(), 1, 1).getTime();
  const thisYear = latest && latest.t >= jan1 ? drivenBetween(points, Math.max(jan1, first.t), latest.t) : 0;

  // costs: the last 12 months, or since the first log
  const fromT = firstLog ? Math.max(dayT(firstLog.date), yearAgo) : T;
  const fromIso = isoDay(new Date(fromT));
  const todayIso = isoDay(today);
  const inWindow = logs.filter((l) => l.date >= fromIso && l.date <= todayIso);
  const months = Math.max(1, (T - fromT) / DAY_MS / MONTH_DAYS);
  const costs = sum(inWindow.map((l) => l.cost || 0));
  const fuelCosts = sum(inWindow.filter((l) => l.type === "fuel").map((l) => l.cost || 0));
  const kmWindow = points.length ? drivenBetween(points, fromT, T) : 0;

  // year by year
  const years = [];
  if (firstLog) {
    for (let yr = Number(firstLog.date.slice(0, 4)); yr <= today.getFullYear(); yr++) {
      const ys = day(yr, 1, 1).getTime(), ye = day(yr + 1, 1, 1).getTime();
      const yl = logs.filter((l) => l.date.startsWith(`${yr}-`));
      const km = points.length >= 2 && latest.t > ys && first.t < ye ? drivenBetween(points, Math.max(ys, first.t), Math.min(ye, latest.t)) : 0;
      const c = sum(yl.map((l) => l.cost || 0));
      years.push({ year: yr, km, costs: c, per_km: km >= 100 ? c / km : null, logs: yl.length,
        from: first && first.t > ys ? first.date : null });
    }
  }

  return {
    logs, points, first, latest, n: logs.length,
    driven_total: first && latest ? latest.km - first.km : 0,
    per_day: perDay, per_month: perDay === null ? null : perDay * MONTH_DAYS, per_year: perDay === null ? null : perDay * 365.25,
    km_window_from: kmWindowFrom, km_window_full: kmWindowFrom !== null && first.t <= yearAgo,
    this_year: thisYear, this_year_from: first && first.t > jan1 ? first.date : null,
    costs_from: fromIso, costs_full_year: Boolean(firstLog) && dayT(firstLog.date) <= yearAgo, costs_months: months,
    costs, costs_fuel: fuelCosts, cost_per_month: firstLog ? costs / months : null,
    km_window: kmWindow, cost_per_km: kmWindow >= 100 ? costs / kmWindow : null,
    cost_per_km_ex_fuel: kmWindow >= 100 ? (costs - fuelCosts) / kmWindow : null,
    by_type: costsByType(inWindow), costs_all: sum(logs.map((l) => l.cost || 0)),
    fuel: fuelStats(logs, today),
    tyres: tyreStatus(logs, today, latest ? latest.km : null),
    service: serviceStatus({ ...car, logs }, today, latest ? latest.km : null, perDay),
    inspection: inspectionStatus({ ...car, logs }, today),
    tyre_dates: tyreDates(today),
    years,
  };
}

/** The reading before this one (by date), to show "+1 230 km since the last log" in the form. */
export function previousReading(logs, date, exceptId = null) {
  let best = null;
  for (const l of logs) {
    if (l.id === exceptId || l.km === null || l.date > date) continue;
    if (!best || byDateKm(l, best) > 0) best = l;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------
const NBSP = "\u00a0";
export const fmtKm = (v) => `${plainNumber(Math.round(v)).replace(/ /g, NBSP)}${NBSP}km`;
export const fmtKmSigned = (v) => `${v >= 0 ? "+" : "−"}${fmtKm(Math.abs(v))}`;
export const fmtPerKm = (v) => `${fmtMoney(CUR.local, v, 2)}/km`;
export function fmtAxisKm(v) {
  const a = Math.abs(v);
  if (a < 1000) return String(Math.round(v));
  const k = a / 1000;
  return `${v < 0 ? "−" : ""}${Math.abs(k - Math.round(k)) < 0.05 ? Math.round(k) : k.toFixed(1)}k`;
}
/** Position on the month axis of the charts: 2026-10-16 is about 2026-10 + 0.5 */
export const monthPos = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return mIndex(iso.slice(0, 7)) + (d - 1) / new Date(y, m, 0).getDate();
};

export function carCsv(logs) {
  const q = (v) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const f = (v) => (v === null || v === undefined ? "" : String(v));
  const { perFill } = fuelStats(logs);
  const r2 = (v) => (v === null || v === undefined ? "" : String(Math.round(v * 100) / 100));
  const lines = [["Date", "Type", "Odometer (km)", `Cost (${CUR.local})`, "Litres", `Price per litre (${CUR.local})`, "Full tank",
    "l/100 km", `Fuel cost per km (${CUR.local})`, "Tyre set", "Note"]];
  for (const l of [...logs].sort(byDateKm)) {
    const seg = perFill.get(l.id);
    lines.push([l.date, TYPE[l.type].name, f(l.km), f(l.cost), f(l.litres), l.litres > 0 && l.cost > 0 ? r2(l.cost / l.litres) : "",
      l.type === "fuel" ? (l.full === false ? "no" : "yes") : "", seg ? r2(seg.per100) : "", seg ? r2(seg.per_km) : "",
      l.tires ? `${TYRE_NAME[l.tires]}${l.type === "tyre_buy" ? (l.fitted === false ? " (not fitted)" : " (fitted)") : ""}` : "", l.note || ""]);
  }
  return "\uFEFF" + lines.map((l) => l.map(q).join(",")).join("\r\n");
}
