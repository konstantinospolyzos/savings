// Savings Tracker - core logic.
// A line-by-line port of the desktop app (savings_tracker.py), so both give the same numbers.

export const APP_NAME = "Savings Tracker";
export const APP_VERSION = "1.0";
export const DATA_VERSION = 1;

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Colours (CSS variables carry the dark-mode versions; these are for charts and dots)
export const COLORS = {
  blue: "var(--blue)", green: "var(--green)", red: "var(--red)", orange: "var(--orange)",
  cyan: "var(--cyan)", purple: "var(--purple)", pink: "var(--pink)", indigo: "var(--indigo)",
  teal: "var(--teal)", gray: "var(--gray)", gray3: "var(--gray3)",
};

export const SERIES = {             // Overview chart lines
  bank: ["Bank", COLORS.blue],
  invested: ["Invested", COLORS.orange],
  income: ["Income", COLORS.cyan],
  total: ["Combined", COLORS.green],
};

// Swedish tax on the investments (check the rules yearly)
export const BROKERS = "Freedom24 + IBKR";
export const CAPITAL_GAINS_TAX = 0.30;
export const ISK_TAX_FREE = 300000;
export const ISK_TAX_RATE = 0.01065;

export const CATEGORIES = [
  ["Home", COLORS.blue], ["Transport", COLORS.orange], ["Food", COLORS.green],
  ["Insurance", COLORS.indigo], ["Health & fitness", COLORS.pink], ["Subscriptions", COLORS.purple],
  ["Instalments", COLORS.teal], ["Other", COLORS.gray],
];
export const CATEGORY_COLORS = Object.fromEntries(CATEGORIES);
export const DEFAULT_EXPENSES = [
  ["Rent", "Home"], ["Electricity", "Home"], ["Internet", "Home"], ["Groceries", "Food"],
  ["Transport", "Transport"], ["Insurance", "Insurance"], ["Phone", "Subscriptions"],
  ["Streaming & apps", "Subscriptions"], ["Gym", "Health & fitness"],
];
export const PROFILE_DEFS = [
  ["light", "Light saving", "More room to enjoy now", 10],
  ["balanced", "Balanced", "Steady, with room to live", 20],
  ["high", "High saving", "Live lean, grow fast", 30],
];
export const BUFFER_MONTH_CHOICES = [2, 3, 4, 6];
export const GOAL_CATEGORIES = [
  ["Travel", COLORS.cyan], ["Gifts & events", COLORS.pink], ["Bigger buys", COLORS.purple],
  ["Car & home", COLORS.orange], ["Health", COLORS.red], ["Other", COLORS.gray],
];
export const GOAL_COLORS = Object.fromEntries(GOAL_CATEGORIES);
export const DEFAULT_GOALS = [["Trips & travel", "Travel"], ["Gifts & events", "Gifts & events"],
  ["Bigger buys", "Bigger buys"]];

// ---------------------------------------------------------------------------
// Months ("2026-10") and days (Date objects at noon, so DST never shifts a day)
// ---------------------------------------------------------------------------
export const ym = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
export const mIndex = (month) => { const [y, m] = month.split("-").map(Number); return y * 12 + m - 1; };
export const mFromIndex = (i) => ym(Math.floor(i / 12), (i % 12) + 1);
export const addMonths = (month, n) => mFromIndex(mIndex(month) + n);
export const mYear = (month) => Number(month.slice(0, 4));
export const mNum = (month) => Number(month.slice(5, 7));
export const mLong = (month) => `${MONTHS[mNum(month) - 1]} ${mYear(month)}`;
export const mShort = (month) => `${MONTHS[mNum(month) - 1].slice(0, 3)} ${mYear(month)}`;
export const mAbbr = (month) => MONTHS[mNum(month) - 1].slice(0, 3);

export const day = (y, m, d) => new Date(y, m - 1, d, 12);
export const todayDate = () => { const t = new Date(); return day(t.getFullYear(), t.getMonth() + 1, t.getDate()); };
export const addDays = (d, n) => day(d.getFullYear(), d.getMonth() + 1, d.getDate() + n);
export const daysBetween = (a, b) => Math.round((b - a) / 86400000);
export const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
export const weekday = (d) => (d.getDay() + 6) % 7;          // Monday = 0, like Python
export const monthOf = (d) => ym(d.getFullYear(), d.getMonth() + 1);
export const isoDay = (d) => `${monthOf(d)}-${String(d.getDate()).padStart(2, "0")}`;

export const shortDate = (d) => `${WEEKDAYS[weekday(d)].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
export const longDate = (d) => `${WEEKDAYS[weekday(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
export function fmtRange(a, b) {
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth())
    return `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 3)}`;
  return `${a.getDate()} ${MONTHS[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 3)}`;
}

export function defaultNewMonth(entries, today = todayDate()) {
  const current = monthOf(today);
  const logged = new Set(entries.map((e) => e.month));
  if (!logged.has(current)) return current;
  return addMonths([...logged].sort().at(-1), 1);
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------
const NBSP = " ";

/** Accepts '42 086', '42,086', '4092.50', '4 092,50', '0,0885' ... */
export function parseNumber(text, decimalComma = false) {
  let t = String(text ?? "").trim();
  for (const junk of [" ", " ", " ", "kr", "SEK", "sek", "€", "EUR", "eur", "%"]) t = t.split(junk).join("");
  t = t.replace(/−/g, "-");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) t = t.replace(/,/g, "");
  else if (t.includes(",")) {
    const i = t.indexOf(",");
    const head = t.slice(0, i), tail = t.slice(i + 1);
    const commas = t.split(",").length - 1;
    if (decimalComma || (commas === 1 && (tail.length !== 3 || ["", "0", "-0"].includes(head)))) t = t.replace(/,/g, ".");
    else t = t.replace(/,/g, "");
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

const roundTo = (v, d) => { const f = 10 ** d; return Math.round(v * f) / f; };
const sign = (v, signed) => (signed ? (v >= 0 ? "+" : "−") : (v < 0 ? "−" : ""));
/** Round like Python's format(): exact halves go to the even neighbour (1234.5 -> 1234). */
function roundEven(v, d) {
  const f = 10 ** d, x = v * f, r = Math.round(x);
  return (Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : r) / f;
}
const group = (v, d) => roundEven(v, d).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export function fmtEur(v, decimals = 0, signed = false) {
  if (roundEven(v, decimals) === 0) v = 0;
  return `${sign(v, signed)}€${group(Math.abs(v), decimals)}`;
}
export function fmtSek(v, signed = false) {
  if (roundEven(v, 0) === 0) v = 0;
  return `${sign(v, signed)}${group(Math.abs(v), 0).replace(/,/g, NBSP)}${NBSP}kr`;
}
export const fmtNative = (v, currency) => currency === "EUR"
  ? fmtEur(v, Math.abs(v - Math.round(v)) < 0.005 ? 0 : 2) : fmtSek(v);
export function fmtAxisSek(v) {
  let s;
  if (Math.abs(v) >= 1000) { const k = Math.abs(v) / 1000; s = Math.abs(k - Math.round(k)) < 0.05 ? `${roundEven(k, 0)}k` : `${roundEven(k, 1).toFixed(1)}k`; }
  else s = String(roundEven(Math.abs(v), 0));
  return `${v < 0 ? "−" : ""}${s} kr`;
}
export function fmtAxisEur(v) {
  const a = Math.abs(v);
  const s = a >= 10000 ? `€${(a / 1000).toFixed(a % 1000 ? 1 : 0)}k` : `€${group(a, 0)}`;
  return (v < 0 ? "−" : "") + s;
}
export const plainNumber = (v, d = 0) => group(v, d).replace(/,/g, " ");
export const rateText = (r) => r.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
export const pct = (x) => `${Math.round(x * 100)}%`;
export const toneOf = (v) => (v == null || Math.abs(v) < 0.005 ? "flat" : v > 0 ? "up" : "down");
export const nMonths = (n) => `${n} month${n !== 1 ? "s" : ""}`;
export const plural = (n, word) => `${n} ${word}${n !== 1 ? "s" : ""}`;
export function joinAnd(parts) {
  parts = parts.filter(Boolean);
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
export function mean(values) {
  const v = [...values];
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
const sum = (values) => values.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// Data model helpers (plain objects, same fields as the desktop database)
// ---------------------------------------------------------------------------
export const incomeEur = (e) => e.income_sek * e.sek_to_eur;
export const bankEur = (e) => e.bank_sek * e.sek_to_eur;
export const investedSek = (e) => (e.sek_to_eur ? e.invested_eur / e.sek_to_eur : 0);
export const totalEur = (e) => bankEur(e) + e.invested_eur;

export const expensePerMonth = (x) => (x.per === "month" ? x.amount : x.amount / 12);
export const expenseMonthlySek = (x, fx) =>
  x.currency === "EUR" ? (fx ? expensePerMonth(x) / fx : 0) : expensePerMonth(x);
export const expenseApplies = (x, month) => x.active && (!x.end_month || month <= x.end_month);

export const goalMonthsTotal = (g) => Math.max(1, mIndex(g.target_month) - mIndex(g.start_month) + 1);
export const goalPerMonth = (g) => (g.kind === "year" ? g.amount / 12
  : Math.max(g.amount - (g.saved || 0), 0) / goalMonthsTotal(g));
export function goalApplies(g, month) {
  if (!g.active || g.amount <= 0) return false;
  return g.kind === "year" || month <= g.target_month;
}
export function goalPlannedBy(g, month) {
  const n = Math.max(0, Math.min(mIndex(month) - mIndex(g.start_month) + 1, goalMonthsTotal(g)));
  return Math.min(g.amount, (g.saved || 0) + goalPerMonth(g) * n);
}

export const byPosition = (a, b) => (a.position - b.position) || (a.id - b.id);

export function getSetting(data, key, fallback = null) {
  const v = data.settings?.[key];
  return v === undefined || v === null ? fallback : v;
}

// ---------------------------------------------------------------------------
// Month-over-month
// ---------------------------------------------------------------------------
export function computeRows(entries) {
  let prev = null;
  return entries.map((e) => {
    const row = {
      entry: e,
      saved_sek: prev === null ? null : e.bank_sek - prev.bank_sek,
      invested_delta: prev === null ? null : e.invested_eur - prev.invested_eur,
    };
    prev = e;
    return row;
  });
}

/** saved = change in the bank + money added to investments; spending = income - saved */
export function monthFlows(entries) {
  const out = [];
  for (let k = 1; k < entries.length; k++) {
    const a = entries[k - 1], b = entries[k];
    const bankD = b.bank_sek - a.bank_sek;
    const invD = b.invested_eur - a.invested_eur;
    const exact = b.added_eur !== null && b.added_eur !== undefined;
    const toInv = b.sek_to_eur ? (exact ? b.added_eur : invD) / b.sek_to_eur : 0;
    const saved = bankD + toInv;
    out.push({
      entry: b, month: b.month, income: b.income_sek, bank_d: bankD, inv_d: invD, to_inv: toInv,
      market: exact ? invD - b.added_eur : null, exact, saved, spending: b.income_sek - saved,
      rate: b.income_sek > 0 ? saved / b.income_sek : 0,
    });
  }
  return out;
}

export function summarize(flows) {
  if (!flows.length) return null;
  const n = flows.length;
  const inc = sum(flows.map((f) => f.income));
  const saved = sum(flows.map((f) => f.saved));
  return {
    n, income: inc / n, saved: saved / n, spending: (inc - saved) / n,
    bank: sum(flows.map((f) => f.bank_d)) / n, rate: inc > 0 ? saved / inc : 0,
    first: flows[0].month, last: flows.at(-1).month,
  };
}

export const NOTE_TAGS = [
  ["travel", "Trips & travel", /\b(trip|travel|flight|ticket|holiday|vacation|hotel|booked)/i, COLORS.cyan],
  ["gifts", "Gifts & events", /\b(gift|wedding|birthday|present|christmas|party)/i, COLORS.pink],
  ["buys", "Bigger buys", /\b(bought|buy|purchas|shoes|helmet|machine|i?phone|laptop|skis|furniture)/i, COLORS.purple],
  ["extra", "Extra income", /\b(bonus|tax return|refund|raise|retroactive|salary increase)/i, COLORS.green],
];
export const TRAVEL_RX = NOTE_TAGS[0][2];

/** [trip month?, flagged by you?] - months you haven't flagged are guessed from the note */
export function tripStatus(e) {
  if (e.trip !== null && e.trip !== undefined) return [Boolean(e.trip), true];
  return [TRAVEL_RX.test(e.comment || ""), false];
}
export const isTrip = (e) => tripStatus(e)[0];
const tagged = (key, rx, entry) => (key === "travel" ? isTrip(entry) : rx.test(entry.comment || ""));

export function tagAnalysis(flows) {
  return NOTE_TAGS.map(([key, label, rx, color]) => {
    const hit = flows.filter((f) => tagged(key, rx, f.entry));
    const miss = flows.filter((f) => !tagged(key, rx, f.entry));
    return {
      key, label, color, n: hit.length, total: flows.length,
      avg: mean(hit.map((f) => f.bank_d)), avg_other: mean(miss.map((f) => f.bank_d)),
      months: hit.map((f) => f.month),
    };
  });
}

export const quietMonths = (flows) =>
  flows.filter((f) => !NOTE_TAGS.some(([k, , rx]) => tagged(k, rx, f.entry)));

export function tripComparison(flows) {
  const stats = (group) => {
    if (!group.length) return null;
    const inc = sum(group.map((f) => f.income));
    const saved = sum(group.map((f) => f.saved));
    const n = group.length;
    return { n, income: inc / n, spending: (inc - saved) / n, saved: saved / n,
      bank: sum(group.map((f) => f.bank_d)) / n, rate: inc > 0 ? saved / inc : 0 };
  };
  const trip = flows.filter((f) => isTrip(f.entry));
  const other = flows.filter((f) => !isTrip(f.entry));
  const flagged = flows.filter((f) => f.entry.trip !== null && f.entry.trip !== undefined).length;
  const res = { trip: stats(trip), other: stats(other), total: flows.length, flagged,
    guessed: flows.length - flagged, gap: null, per_year: null };
  if (trip.length && other.length) {
    res.gap = res.trip.spending - res.other.spending;
    res.per_year = (res.gap * trip.length) / flows.length * 12;
  }
  return res;
}

export function travelFund(flows) {
  const c = tripComparison(flows);
  const t = c.trip, o = c.other;
  if (!t || !o || t.n < 2 || c.gap < 500) return null;
  return { gap: c.gap, per_month: Math.round(c.per_year / 12 / 100) * 100, n: t.n, total: c.total,
    avg: t.bank, avg_other: o.bank };
}

export function incomeAnalysis(entries) {
  if (!entries.length) return null;
  const last12 = entries.slice(-12);
  const byIdx = new Map(entries.map((e) => [mIndex(e.month), e]));
  const recent = entries.slice(-3);
  const earlier = recent.map((e) => byIdx.get(mIndex(e.month) - 12));
  let yoy = null;
  if (recent.length === 3 && earlier.every(Boolean))
    yoy = sum(recent.map((e) => e.income_sek)) / sum(earlier.map((e) => e.income_sek)) - 1;
  const top = last12.reduce((a, b) => (b.income_sek > a.income_sek ? b : a));
  const low = last12.reduce((a, b) => (b.income_sek < a.income_sek ? b : a));
  return { avg: mean(last12.map((e) => e.income_sek)), n: last12.length, latest: entries.at(-1), top, low, yoy };
}

export function rateForMonth(entries, month) {
  let rate = entries[0].sek_to_eur;
  for (const e of entries) if (e.month <= month) rate = e.sek_to_eur;
  return rate;
}

/** Value of the investments and what they'd be worth after the 30 % tax (worked out in kronor). */
export function investmentStatus(data, entries) {
  if (!entries.length) return null;
  const latest = entries.at(-1);
  const res = { value: latest.invested_eur, value_sek: investedSek(latest), cost_input: null, as_of: null,
    as_of_rate: null, added_since_eur: 0, cost_sek: null, gain_sek: null, tax_sek: null, tax: null,
    after: null, after_sek: null,
    isk_tax_year: Math.max(0, investedSek(latest) - ISK_TAX_FREE) * ISK_TAX_RATE };
  const cost = getSetting(data, "inv_basis");
  const raw = cost && typeof cost === "object" ? (cost.amount ?? cost.eur) : null;
  if (raw !== null && raw !== undefined) {
    const amount = Number(raw);
    const currency = cost.currency || ("eur" in cost ? "EUR" : "SEK");
    const asOf = (cost.as_of || latest.month).slice(0, 7);
    const asOfRate = rateForMonth(entries, asOf);
    const later = entries.filter((e) => e.month > asOf && e.added_eur);
    const costSek = (currency === "SEK" ? amount : amount / asOfRate) + sum(later.map((e) => e.added_eur / e.sek_to_eur));
    const gain = investedSek(latest) - costSek;
    const taxSek = CAPITAL_GAINS_TAX * Math.max(gain, 0);
    Object.assign(res, { cost_input: [amount, currency], as_of: asOf, as_of_rate: asOfRate,
      added_since_eur: sum(later.map((e) => e.added_eur)), cost_sek: costSek, gain_sek: gain, tax_sek: taxSek,
      tax: taxSek * latest.sek_to_eur, after: latest.invested_eur - taxSek * latest.sek_to_eur,
      after_sek: investedSek(latest) - taxSek });
  }
  const exact = monthFlows(entries).filter((f) => f.exact);
  res.logged_months = exact.length;
  res.added_logged = sum(exact.map((f) => f.entry.added_eur));
  res.market_logged = exact.length ? sum(exact.map((f) => f.market)) : null;
  return res;
}

export function futureValue(start, monthly, years, annual) {
  const n = years * 12;
  const rm = (1 + annual) ** (1 / 12) - 1;
  const grown = start * (1 + annual) ** years + (rm ? monthly * (((1 + rm) ** n - 1) / rm) : monthly * n);
  return [grown, start + monthly * n];
}

// ---------------------------------------------------------------------------
// Paydays: the 25th, or the last banking day before it
// ---------------------------------------------------------------------------
export function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const dd = ((h + l - 7 * m + 114) % 31) + 1;
  return day(y, month, dd);
}

const HOLIDAYS = new Map();
/** Days Swedish banks don't pay out salaries (public holidays + the 'eve' days): Map iso -> name */
export function bankHolidays(year) {
  if (!HOLIDAYS.has(year)) {
    const e = easterSunday(year);
    let mid = null;
    for (let d = 19; d <= 25; d++) if (weekday(day(year, 6, d)) === 4) { mid = day(year, 6, d); break; }
    const list = [
      [day(year, 1, 1), "New Year's Day"], [day(year, 1, 6), "Epiphany"],
      [addDays(e, -2), "Good Friday"], [addDays(e, 1), "Easter Monday"],
      [day(year, 5, 1), "May Day"], [addDays(e, 39), "Ascension Day"],
      [day(year, 6, 6), "National Day"], [mid, "Midsummer Eve"],
      [day(year, 12, 24), "Christmas Eve"], [day(year, 12, 25), "Christmas Day"],
      [day(year, 12, 26), "Boxing Day"], [day(year, 12, 31), "New Year's Eve"],
    ];
    HOLIDAYS.set(year, new Map(list.map(([d, n]) => [isoDay(d), n])));
  }
  return HOLIDAYS.get(year);
}

export function paydayFor(month) {
  let d = day(mYear(month), mNum(month), 25);
  while (weekday(d) >= 5 || bankHolidays(d.getFullYear()).has(isoDay(d))) d = addDays(d, -1);
  return d;
}

export function paydayReason(p) {
  const d25 = day(p.getFullYear(), p.getMonth() + 1, 25);
  if (sameDay(p, d25)) return "";
  if (weekday(d25) >= 5) return `a ${WEEKDAYS[weekday(d25)]}`;
  return bankHolidays(d25.getFullYear()).get(isoDay(d25)) || "a bank holiday";
}

/** {prev: last payday <= today, next: next payday > today, isToday} */
export function paydayStatus(today) {
  const first = monthOf(today);
  const thisOne = paydayFor(first);
  if (today < thisOne && !sameDay(today, thisOne)) return { prev: paydayFor(addMonths(first, -1)), next: thisOne, isToday: false };
  return { prev: thisOne, next: paydayFor(addMonths(first, 1)), isToday: sameDay(today, thisOne) };
}

export function defaultPeriodMonth(today) {
  const first = monthOf(today);
  let base = today >= paydayFor(first) || sameDay(today, paydayFor(first)) ? first : addMonths(first, -1);
  const start = paydayFor(base), nxt = paydayFor(addMonths(base, 1));
  if (!sameDay(today, start) && daysBetween(today, nxt) <= 7) base = addMonths(base, 1);
  return base;
}

export function weekChunks(start, end) {
  const out = [];
  let d = start;
  while (d < end) {
    const e = addDays(d, 7) < end ? addDays(d, 7) : end;
    out.push({ start: d, end: addDays(e, -1), days: daysBetween(d, e) });
    d = e;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Budget: pay yourself first (fixed costs -> saving goals -> your future -> living money)
// ---------------------------------------------------------------------------
export function computeBudget(salary, expenses, goals, base, ratePct, bankSek, bufferFirst, fx, bufferMonths = 3) {
  const fixed = sum(expenses.filter((e) => expenseApplies(e, base)).map((e) => expenseMonthlySek(e, fx)));
  const goalRows = goals.filter((g) => goalApplies(g, base)).map((g) => [g, goalPerMonth(g)]);
  const goalsTotal = sum(goalRows.map(([, m]) => m));
  const left = salary - fixed;
  const free = left - goalsTotal;
  const wanted = (Math.max(ratePct, 0) / 100) * salary;
  const future = Math.max(0, Math.min(wanted, free));
  const living = Math.max(free - future, 0);
  const target = bufferMonths * fixed;
  let shortfall = Math.max(target - bankSek, 0);
  if (shortfall < 500) shortfall = 0;           // a few hundred kronor short counts as full
  const toBuffer = bufferFirst ? Math.min(future, shortfall) : 0;
  const invest = future - toBuffer;
  return {
    salary, fixed, left, goals: goalsTotal, goal_rows: goalRows, free, wanted, future,
    capped: wanted > future + 0.5, living, to_buffer: toBuffer, invest, savings: goalsTotal + toBuffer,
    save_rate: salary > 0 ? future / salary : 0, rate_pct: ratePct,
    max_rate: salary > 0 ? Math.max(free, 0) / salary : 0,
    target, shortfall, bank: bankSek, buffer_months: bufferMonths,
  };
}

export function planForRate(snap, ratePct) {
  const salary = snap.salary, free = Math.max(snap.free, 0);
  const wanted = (Math.max(ratePct, 0) / 100) * salary;
  const future = Math.min(wanted, free);
  const toBuffer = snap.buffer_first ? Math.min(future, snap.shortfall) : 0;
  return { spend: free - future, save: snap.goals + toBuffer, invest: future - toBuffer, future,
    capped: salary > 0 && wanted > free + 0.5 };
}

export function loadProfiles(data) {
  const stored = getSetting(data, "profile_rates", {}) || {};
  const out = {};
  for (const [key, , , def] of PROFILE_DEFS) {
    const val = typeof stored === "object" ? stored[key] : null;
    out[key] = typeof val === "number" && val >= 0 && val <= 90 ? val : def;
  }
  return out;
}

export function budgetRate(data, entries) {
  const s = getSetting(data, "budget_rate");
  if (s && typeof s === "object" && s.sek_to_eur) return [Number(s.sek_to_eur), s.source || "Your rate", true];
  if (entries.length) return [entries.at(-1).sek_to_eur, `From your ${mLong(entries.at(-1).month)} log`, false];
  return [0.09, "Default rate, type yours", false];
}

/** Everything the Budget, Overview and Insights pages need about the plan. */
export function budgetSnapshot(data, today = todayDate(), offset = 0, salaryOverride = null) {
  const entries = data.entries;
  const base = addMonths(defaultPeriodMonth(today), offset);
  const start = paydayFor(base), end = paydayFor(addMonths(base, 1));
  const latest = entries.length ? entries.at(-1) : null;
  const [fx, fxSrc, fxOverride] = budgetRate(data, entries);
  const salary = salaryOverride !== null ? salaryOverride : latest ? latest.income_sek : 0;
  const expenses = [...data.expenses].sort(byPosition);
  const goals = [...data.goals].sort(byPosition);
  const profiles = loadProfiles(data);
  let key = getSetting(data, "profile", "balanced");
  if (!(key in profiles)) key = "balanced";
  const bufferFirst = Boolean(getSetting(data, "buffer_first", true));
  let months = getSetting(data, "buffer_months", 3);
  if (!BUFFER_MONTH_CHOICES.includes(months)) months = 3;
  const b = computeBudget(salary, expenses, goals, base, profiles[key], latest ? latest.bank_sek : 0,
    bufferFirst, fx, months);
  const active = expenses.filter((e) => expenseApplies(e, base));
  const missing = active.filter((e) => e.amount === 0);
  return Object.assign(b, {
    today, base, start, end, days: daysBetween(start, end), fx, fx_src: fxSrc, fx_override: fxOverride,
    expenses, active, profiles, profile: key, goals_list: goals, latest, buffer_first: bufferFirst, missing,
    plan_ready: salary > 0 && b.fixed > 0 && missing.length <= 2,
  });
}

/** Personal to-do list, most important first: [title, detail, colour] */
export function buildActions(snap, summ, tags, fund, inv, flows) {
  const items = [];
  if (snap.missing.length) {
    const n = snap.missing.length;
    items.push([0, `Fill in ${n} fixed cost${n !== 1 ? "s" : ""} on the Budget page`,
      "The plan, the buffer target and several insights compare against your fixed costs, so they get sharper once every cost has its amount.", COLORS.orange]);
  }
  const planned = snap.future;
  if (snap.plan_ready && planned + snap.goals > 0) {
    const ps = paydayStatus(snap.today);
    const when = ps.isToday ? "today" : shortDate(ps.next);
    const moves = joinAnd([
      snap.invest > 0 ? `${fmtSek(snap.invest)} to Freedom24 / IBKR` : "",
      snap.to_buffer > 0 ? `${fmtSek(snap.to_buffer)} to your buffer` : "",
      snap.goals > 0 ? `${fmtSek(snap.goals)} to your saving goals` : "",
    ]);
    items.push([1, `On payday (${when}), move the money first`,
      `Send ${moves} as soon as the salary lands. Standing transfers make it automatic, and what's left in the account is yours to spend.`, COLORS.blue]);
  }
  if (summ && snap.plan_ready) {
    const planRate = snap.save_rate, actual = summ.rate;
    if (actual < planRate - 0.05)
      items.push([2, `You save ${pct(actual)} of your income, the plan says ${pct(planRate)}`,
        `Over the last ${summ.n} months you put aside ${fmtSek(summ.saved)} a month on average, the plan puts aside ${fmtSek(planned)}. That's about ${fmtSek(planned - summ.saved)} a month to find.`, COLORS.orange]);
    else
      items.push([6, `You're saving ${pct(actual)} of your income`,
        `That matches or beats your plan of ${pct(planRate)} over the last ${summ.n} months. Keep the transfers going.`, COLORS.green]);
  }
  const hasTravelGoal = snap.goals_list.some((g) => g.category === "Travel" && goalApplies(g, snap.base));
  if (fund && !hasTravelGoal)
    items.push([3, `Add a travel goal of about ${fmtSek(fund.per_month)} a month`,
      `${fund.n} of your last ${fund.total} months were trip months, and in those you spent about ${fmtSek(fund.gap)} more than in the others. A saving goal for trips (Budget page) keeps them from eating your buffer.`, COLORS.cyan]);
  if (snap.plan_ready && snap.target > 0) {
    const months = snap.bank / snap.fixed;
    if (snap.shortfall > 0)
      items.push([4, `Top up your buffer: ${fmtSek(snap.shortfall)} to go`,
        `Your bank savings cover ${months.toFixed(1)} months of fixed costs. Finansinspektionen suggests 2–3 months of necessary costs before you invest for the long term.`, COLORS.green]);
    else if (snap.bank > 2 * snap.target)
      items.push([4, "Your buffer is more than enough",
        `The bank holds ${months.toFixed(1)} months of fixed costs. Keep 3–6 months there and consider investing what you won't need for 5+ years.`, COLORS.green]);
  }
  const subs = snap.active.filter((e) => e.category === "Subscriptions" && e.amount > 0);
  const subsMonth = sum(subs.map((e) => expenseMonthlySek(e, snap.fx)));
  if (subsMonth > 0) {
    const n = subs.length;
    items.push([5, `Your subscriptions cost ${fmtSek(subsMonth * 12)} a year`,
      `${n} subscription${n !== 1 ? "s add" : " adds"} up to ${fmtSek(subsMonth)} a month. Cancel the ones you didn't use last month; you can always sign up again.`, COLORS.purple]);
  }
  const extra = tags.find((t) => t.key === "extra");
  if (extra && extra.n)
    items.push([7, "Decide where extra money goes before it arrives",
      `${extra.n} of your months had extra income (bonus, tax return, raise). Sending a fixed share of it, say half, straight to savings is an easy win.`, COLORS.green]);
  if (inv) {
    if (inv.tax_sek)
      items.push([8, `Selling everything today would mean about ${fmtSek(inv.tax_sek)} in tax`,
        "Freedom24 and IBKR are regular accounts: 30% of the gain is taxed when you sell, worked out in kronor. As foreign brokers they usually don't report to Skatteverket, so add sales (K4) and dividends to your tax return yourself.", COLORS.orange]);
    else if (inv.cost_sek === null)
      items.push([9, "Tell the app what your investments cost",
        "Type it under Investments below, in kronor or euro, to see what your holdings are worth after the 30% tax.", COLORS.orange]);
    if ([2, 3, 4, 5].includes(snap.today.getMonth() + 1))
      items.push([1, "Check your tax return for Freedom24 and IBKR",
        "Foreign brokers are usually not pre-filled. Add each sale on K4 (gain worked out in kronor) and your dividends under capital; tax already withheld abroad is credited. The deadline is in early May.", COLORS.orange]);
  }
  if (flows.length && !flows.slice(-3).some((f) => f.exact))
    items.push([10, "Log what you add to investments",
      "When you add a month, fill in “Added this month” under Investments. Insights can then split your own saving from market ups and downs.", COLORS.gray]);
  items.sort((a, b) => a[0] - b[0]);
  return items.slice(0, 6).map((x) => x.slice(1));
}

// ---------------------------------------------------------------------------
// Exchange rate (ECB, via Frankfurter)
// ---------------------------------------------------------------------------
export async function fetchSekToEur(month, today = todayDate()) {
  const key = month >= monthOf(today) ? "latest" : `${month}-01`;
  let lastError = null;
  for (const base of ["https://api.frankfurter.app", "https://api.frankfurter.dev/v1"]) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      const resp = await fetch(`${base}/${key}?base=SEK&symbols=EUR`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return [Number(data.rates.EUR), data.date || key];
    } catch (err) { lastError = err; }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// CSV export (opens in Excel)
// ---------------------------------------------------------------------------
export function toCsv(entries) {
  const q = (v) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const r2 = (v, d) => (v === null || v === undefined ? "" : String(roundTo(v, d)));
  const lines = [["Month", "Income (SEK)", "Bank savings (SEK)", "Invested (EUR)", "1 SEK in EUR", "1 EUR in SEK",
    "Income (EUR)", "Bank savings (EUR)", "Saved in bank (SEK)", "Invested change (EUR)",
    "Added to investments (EUR)", "Trip month", "Note"]];
  for (const r of computeRows(entries)) {
    const e = r.entry;
    lines.push([e.month, r2(e.income_sek, 2), r2(e.bank_sek, 2), r2(e.invested_eur, 2), r2(e.sek_to_eur, 6),
      e.sek_to_eur ? r2(1 / e.sek_to_eur, 4) : "", r2(incomeEur(e), 2), r2(bankEur(e), 2), r2(r.saved_sek, 2),
      r2(r.invested_delta, 2), r2(e.added_eur, 2), e.trip === null || e.trip === undefined ? "" : e.trip ? "yes" : "no",
      e.comment || ""]);
  }
  return "﻿" + lines.map((l) => l.map(q).join(",")).join("\r\n");
}
