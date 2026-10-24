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
  ["tires", "Tyre change", "Tyres", COLORS.purple, "tyre"],
  ["inspection", "Inspection", "Inspection", COLORS.teal, "check"],
  ["repair", "Repair", "Repairs", COLORS.red, "wrench"],
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
// The car part of the data file
// ---------------------------------------------------------------------------
export const emptyCar = () => ({ name: "", service_km: null, service_months: null, logs: [] });
export const newLogId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const byDateKm = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.km ?? -1) - (b.km ?? -1));

const optPos = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Check and tidy the car section of a data file (missing in files from before the car monitor). */
export function normalizeCar(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const seen = new Set();
  const logs = [];
  for (const l of Array.isArray(c.logs) ? c.logs : []) {
    if (!l || typeof l !== "object" || typeof l.date !== "string" || !isRealDay(l.date)) continue;
    let id = typeof l.id === "string" && l.id ? l.id : newLogId();
    while (seen.has(id)) id = newLogId();
    seen.add(id);
    const type = TYPE[l.type] ? l.type : "other";
    logs.push({
      id, date: l.date, type, km: optPos(l.km), cost: optPos(l.cost),
      litres: type === "fuel" ? optPos(l.litres) : null,
      tires: type === "tires" && TYRE_NAME[l.tires] ? l.tires : null,
      note: typeof l.note === "string" ? l.note : "",
    });
  }
  logs.sort(byDateKm);
  const months = optPos(c.service_months);
  return {
    name: typeof c.name === "string" ? c.name : "",
    service_km: optPos(c.service_km) || null,
    service_months: months ? Math.round(months) : null,
    logs,
  };
}

export function describeCar(car) {
  const n = car?.logs?.length || 0;
  return n ? `${n} car log${n !== 1 ? "s" : ""}` : "";
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
 * Fuel use, assuming you fill the tank each time: the litres of one fill-up were used on the
 * kilometres since the fill-up before. Fill-ups without litres are skipped.
 */
export function fuelStats(logs) {
  const fuel = logs.filter((l) => l.type === "fuel" && l.km !== null).sort(byDateKm);
  let litres = 0, dist = 0;
  const perFill = new Map();
  for (let i = 1; i < fuel.length; i++) {
    const a = fuel[i - 1], b = fuel[i];
    const d = b.km - a.km;
    if (!(b.litres > 0) || d <= 0) continue;
    litres += b.litres;
    dist += d;
    perFill.set(b.id, (b.litres / d) * 100);
  }
  const priced = logs.filter((l) => l.type === "fuel" && l.litres > 0 && l.cost > 0);
  const priceL = priced.length ? sum(priced.map((l) => l.cost)) / sum(priced.map((l) => l.litres)) : null;
  const per100 = dist >= 50 ? (litres / dist) * 100 : null;
  return { per100, price: priceL, cost100: per100 !== null && priceL !== null ? per100 * priceL : null,
    fills: fuel.length, perFill };
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
  const changes = logs.filter((l) => l.type === "tires" && l.tires).sort(byDateKm);
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
  const costs = changes.filter((l) => l.cost > 0).map((l) => l.cost);
  return {
    on, last, changes, tone, title, detail, deadline, days_left: deadline ? until(deadline) : null,
    km_on: last && last.km !== null && latestKm !== null ? Math.max(0, latestKm - last.km) : null,
    avg_cost: costs.length ? mean(costs) : null,
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
    costs, cost_per_month: firstLog ? costs / months : null,
    km_window: kmWindow, cost_per_km: kmWindow >= 100 ? costs / kmWindow : null,
    cost_per_km_ex_fuel: kmWindow >= 100 ? (costs - fuelCosts) / kmWindow : null,
    by_type: costsByType(inWindow), costs_all: sum(logs.map((l) => l.cost || 0)),
    fuel: fuelStats(logs),
    tyres: tyreStatus(logs, today, latest ? latest.km : null),
    service: serviceStatus({ ...car, logs }, today, latest ? latest.km : null, perDay),
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
  const lines = [["Date", "Type", "Odometer (km)", `Cost (${CUR.local})`, "Litres", "Tyres put on", "Note"]];
  for (const l of [...logs].sort(byDateKm)) {
    lines.push([l.date, TYPE[l.type].name, f(l.km), f(l.cost), f(l.litres), l.tires ? TYRE_NAME[l.tires] : "", l.note || ""]);
  }
  return "\uFEFF" + lines.map((l) => l.map(q).join(",")).join("\r\n");
}
