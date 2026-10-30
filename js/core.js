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
  teal: "var(--teal)", brown: "var(--brown)", gray: "var(--gray)", gray3: "var(--gray3)",
};

export const SERIES = {             // Overview chart lines
  bank: ["Bank", COLORS.blue],
  invested: ["Invested", COLORS.orange],
  income: ["Income", COLORS.cyan],
  total: ["Combined", COLORS.green],
};

// Swedish tax on the investments (check the rules yearly)
export const DEFAULT_BROKERS = "Freedom24 + IBKR";
export const CAPITAL_GAINS_TAX = 0.30;
export const ISK_TAX_FREE = 300000;
export const ISK_TAX_RATE = 0.01065;

// ---------------------------------------------------------------------------
// Countries and currencies.
// Field names in the data stay as in the desktop app: *_sek = your own currency (salary, bank,
// budget), *_eur = the second currency (investments, overview), sek_to_eur = 1 own -> second.
// With only one currency, the second currency is your own and every rate is 1.
// ---------------------------------------------------------------------------
// [symbol, before the number?, thousands separator: "," | " " | "in" (Indian), name]
export const CURRENCIES = {
  EUR: ["€", true, ",", "Euro"], SEK: ["kr", false, " ", "Swedish krona"], GBP: ["£", true, ",", "British pound"],
  INR: ["₹", true, "in", "Indian rupee"], USD: ["$", true, ",", "US dollar"], NOK: ["kr", false, " ", "Norwegian krone"],
  DKK: ["kr", false, " ", "Danish krone"], ISK: ["kr", false, " ", "Icelandic króna"], CHF: ["CHF ", true, ",", "Swiss franc"],
  PLN: ["zł", false, " ", "Polish złoty"], CZK: ["Kč", false, " ", "Czech koruna"], HUF: ["Ft", false, " ", "Hungarian forint"],
  RON: ["lei", false, " ", "Romanian leu"], TRY: ["₺", true, ",", "Turkish lira"], JPY: ["¥", true, ",", "Japanese yen"],
  CNY: ["CN¥", true, ",", "Chinese yuan"], KRW: ["₩", true, ",", "South Korean won"], AUD: ["A$", true, ",", "Australian dollar"],
  NZD: ["NZ$", true, ",", "New Zealand dollar"], CAD: ["C$", true, ",", "Canadian dollar"], HKD: ["HK$", true, ",", "Hong Kong dollar"],
  SGD: ["S$", true, ",", "Singapore dollar"], ZAR: ["R", true, " ", "South African rand"], BRL: ["R$", true, ",", "Brazilian real"],
  MXN: ["MX$", true, ",", "Mexican peso"], ILS: ["₪", true, ",", "Israeli shekel"], THB: ["฿", true, ",", "Thai baht"],
  PHP: ["₱", true, ",", "Philippine peso"], IDR: ["Rp", true, ",", "Indonesian rupiah"], MYR: ["RM", true, ",", "Malaysian ringgit"],
};
export const COUNTRIES = [
  ["SE", "Sweden", "SEK"], ["GB", "United Kingdom", "GBP"], ["IN", "India", "INR"],
  ["AU", "Australia", "AUD"], ["AT", "Austria", "EUR"], ["BE", "Belgium", "EUR"], ["BR", "Brazil", "BRL"],
  ["BG", "Bulgaria", "EUR"], ["CA", "Canada", "CAD"], ["CN", "China", "CNY"], ["HR", "Croatia", "EUR"],
  ["CY", "Cyprus", "EUR"], ["CZ", "Czechia", "CZK"], ["DK", "Denmark", "DKK"], ["EE", "Estonia", "EUR"],
  ["FI", "Finland", "EUR"], ["FR", "France", "EUR"], ["DE", "Germany", "EUR"], ["GR", "Greece", "EUR"],
  ["HK", "Hong Kong", "HKD"], ["HU", "Hungary", "HUF"], ["IS", "Iceland", "ISK"], ["ID", "Indonesia", "IDR"],
  ["IE", "Ireland", "EUR"], ["IL", "Israel", "ILS"], ["IT", "Italy", "EUR"], ["JP", "Japan", "JPY"],
  ["LV", "Latvia", "EUR"], ["LT", "Lithuania", "EUR"], ["LU", "Luxembourg", "EUR"], ["MY", "Malaysia", "MYR"],
  ["MT", "Malta", "EUR"], ["MX", "Mexico", "MXN"], ["NL", "Netherlands", "EUR"], ["NZ", "New Zealand", "NZD"],
  ["NO", "Norway", "NOK"], ["PH", "Philippines", "PHP"], ["PL", "Poland", "PLN"], ["PT", "Portugal", "EUR"],
  ["RO", "Romania", "RON"], ["SG", "Singapore", "SGD"], ["SK", "Slovakia", "EUR"], ["SI", "Slovenia", "EUR"],
  ["ZA", "South Africa", "ZAR"], ["KR", "South Korea", "KRW"], ["ES", "Spain", "EUR"], ["CH", "Switzerland", "CHF"],
  ["TH", "Thailand", "THB"], ["TR", "Turkey", "TRY"], ["US", "United States", "USD"], ["XX", "Other country", null],
];
export const DEFAULT_CURRENCY = { country: "SE", local: "SEK", second: "EUR" };

/** The live settings every formatter reads. configure() is called before each render. */
export const CUR = { country: "SE", local: "SEK", second: "EUR", single: false, brokers: DEFAULT_BROKERS };

export function currencySettings(data) {
  const c = getSetting(data, "currency");
  const out = { ...DEFAULT_CURRENCY };
  if (c && typeof c === "object") {
    if (typeof c.country === "string") out.country = c.country;
    if (CURRENCIES[c.local]) out.local = c.local;
    out.second = c.second === null ? null : CURRENCIES[c.second] && c.second !== out.local ? c.second : out.second;
  }
  if (out.second === out.local) out.second = null;
  return out;
}
export function configure(data) {
  const c = currencySettings(data);
  CUR.country = c.country; CUR.local = c.local; CUR.second = c.second || c.local; CUR.single = !c.second;
  const b = getSetting(data, "brokers");
  CUR.brokers = typeof b === "string" ? b.trim() : DEFAULT_BROKERS;
  CUR.end_months = getSetting(data, "log_months") === "end";
  return CUR;
}
export const inSweden = () => CUR.country === "SE";
export const symOf = (code) => CURRENCIES[code][0].trim();
export const localSym = () => symOf(CUR.local);
export const secondSym = () => symOf(CUR.second);
export const brokersText = (fallback = "your investment account") => CUR.brokers || fallback;
const brokersAnd = (fallback) => (CUR.brokers ? CUR.brokers.replace(/\s\+\s/g, " and ") : fallback);
/** Does this text show an amount of money? (used to blur it in privacy mode) */
export function hasMoney(text) {
  const syms = [...new Set([localSym(), secondSym()])].map((x) => x.replace(/[.*+?^${}()|[\]\\$]/g, "\\$&")).join("|");
  return new RegExp(`\\d\\s?(${syms})|(${syms})\\s?\\d`).test(String(text));
}

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
// [key, name, tagline, % of salary to your future, the least and the most to live on a week (in SEK)]
export const PROFILE_DEFS = [
  ["light", "Light saving", "More room to enjoy now", 10, 800, 850],
  ["balanced", "Balanced", "Steady, with room to live", 20, 500, 700],
  ["high", "High saving", "Live lean, grow fast", 30, 300, 500],
];
/** Nobody lives on less than about 300 kr a week, so no plan goes below it. */
export const MIN_FLOOR_SEK = 300;
// Roughly what 1 SEK is in other currencies: only for the suggested minimums to live on (you can change them).
const ROUGH_PER_SEK = { SEK: 1, NOK: 1, DKK: 0.65, ISK: 13, EUR: 0.09, GBP: 0.075, USD: 0.095, CHF: 0.08, PLN: 0.37, CZK: 2.2,
  HUF: 34, RON: 0.43, TRY: 3.3, JPY: 14, CNY: 0.68, KRW: 130, AUD: 0.145, NZD: 0.16, CAD: 0.13, HKD: 0.74, SGD: 0.12,
  ZAR: 1.7, BRL: 0.52, MXN: 1.8, ILS: 0.35, THB: 3.3, PHP: 5.4, IDR: 1500, MYR: 0.43, INR: 8 };
/** An amount in SEK as a round amount in your currency (for the suggested minimums). */
export function fromSek(sek) {
  const v = sek * (ROUGH_PER_SEK[CUR.local] || 1);
  const step = v >= 2000 ? 100 : v >= 200 ? 10 : v >= 20 ? 5 : 1;
  return Math.max(step, Math.round(v / step) * step);
}
export const BUFFER_MONTH_CHOICES = [2, 3, 4, 6];
/** The share of your future money that keeps going to your savings account once the buffer is full. */
export const KEEP_SAVING_CHOICES = [0, 0.1, 0.25, 0.5];
export function loadKeepSaving(data) {
  const v = getSetting(data, "keep_saving", 0.25);
  return KEEP_SAVING_CHOICES.includes(v) ? v : 0.25;
}
/** Of the future money left after the buffer: what still goes to savings, and the rest to investing. */
const keepSplit = (rest, share) => { const save = share > 0 ? Math.min(rest, roundTo10(rest * share)) : 0; return [save, rest - save]; };
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
/** A logged month by name: "End of October 2026" once your months mean the end of them (setting log_months). */
export const logName = (month) => (CUR.end_months ? `End of ${mLong(month)}` : mLong(month));

/**
 * Every logged month moved by some months (-1: the log called November becomes October), with its notes and
 * trip mark, and the month your investment cost is from. For when your logs mean the month that ended.
 */
export function shiftEntryMonths(data, by) {
  const d = structuredClone(data);
  d.entries = d.entries.map((e) => ({ ...e, month: addMonths(e.month, by) }));
  const basis = d.settings?.inv_basis;
  if (basis && typeof basis === "object" && typeof basis.as_of === "string") basis.as_of = addMonths(basis.as_of.slice(0, 7), by);
  return d;
}
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

export function defaultNewMonth(entries, today = todayDate(), endMonths = CUR.end_months) {
  // a month is its salary (paid around the 25th) and your money at the end of it: the month of the last payday
  const current = endMonths ? monthOf(paydayStatus(today).prev) : monthOf(today);
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
  for (const junk of [" ", " ", " ", "kr", "SEK", "sek", "€", "EUR", "eur", "%", "£", "₹", "$", "zł", "Kč", "Ft", "lei", "₺", "¥", "₩", "₪", "฿", "₱", "Rp", "RM", "CHF"]) t = t.split(junk).join("");
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
const group = (v, d, style = ",") => {
  const t = roundEven(v, d).toLocaleString(style === "in" ? "en-IN" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return style === " " ? t.replace(/,/g, NBSP) : t;
};

/** Any currency: €1,234 · 1 234 kr · £1,234 · ₹12,34,567 */
export function fmtMoney(code, v, decimals = 0, signed = false) {
  const [symbol, before, style] = CURRENCIES[code] || CURRENCIES.EUR;
  if (roundEven(v, decimals) === 0) v = 0;
  const n = group(Math.abs(v), decimals, style);
  return before ? `${sign(v, signed)}${symbol}${n}` : `${sign(v, signed)}${n}${NBSP}${symbol}`;
}
/** The second currency (investments, overview totals); your own currency when you use only one. */
export const fmtEur = (v, decimals = 0, signed = false) => fmtMoney(CUR.second, v, decimals, signed);
/** Your own currency (salary, bank, budget). */
export const fmtSek = (v, signed = false) => fmtMoney(CUR.local, v, 0, signed);
export const fmtNative = (v, currency) => currency === "EUR"
  ? fmtEur(v, Math.abs(v - Math.round(v)) < 0.005 ? 0 : 2) : fmtSek(v);
function fmtAxis(code, v) {
  const [symbol, before, style] = CURRENCIES[code] || CURRENCIES.EUR;
  const a = Math.abs(v);
  const short = (x, unit) => (Math.abs(x - Math.round(x)) < 0.05 ? `${roundEven(x, 0)}${unit}` : `${roundEven(x, 1).toFixed(1)}${unit}`);
  let s;
  if (a >= 1e6) s = short(a / 1e6, "M");
  else if (before) s = a >= 10000 ? `${(a / 1000).toFixed(a % 1000 ? 1 : 0)}k` : group(a, 0, style);
  else s = a >= 1000 ? short(a / 1000, "k") : String(roundEven(a, 0));
  return (v < 0 ? "−" : "") + (before ? `${symbol.trim()}${s}` : `${s} ${symbol}`);
}
export const fmtAxisSek = (v) => fmtAxis(CUR.local, v);
export const fmtAxisEur = (v) => fmtAxis(CUR.second, v);
export const plainNumber = (v, d = 0) => group(v, d).replace(/,/g, " ");
export const rateText = (r) => r.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
/** A rate as people read it: how much of your own currency one unit of the second costs (1 € = 11.07 kr). */
export const rateShown = (r) => { const v = 1 / r; return v.toFixed(v >= 10 ? 2 : 4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); };
/** What the user typed for "1 second = x own" -> sek_to_eur. Typed the other way round? Take the reading closer to the last rate. */
export function rateFromInput(v, previous = null) {
  if (v === null || !(v > 0)) return null;
  const asLabelled = 1 / v;
  if (!previous) return asLabelled;
  return Math.abs(Math.log(v / previous)) < Math.abs(Math.log(asLabelled / previous)) ? v : asLabelled;
}
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
  // In the second currency, each month at its own logged rate.
  const avg_eur = mean(last12.map((e) => e.income_sek * e.sek_to_eur));
  return { avg: mean(last12.map((e) => e.income_sek)), avg_eur, n: last12.length, latest: entries.at(-1), top, low, yoy };
}

export function rateForMonth(entries, month) {
  let rate = entries[0].sek_to_eur;
  for (const e of entries) if (e.month <= month) rate = e.sek_to_eur;
  return rate;
}

/** Value of the investments and what they'd be worth after the 30 % tax (worked out in kronor; Sweden only). */
export function investmentStatus(data, entries) {
  if (!entries.length) return null;
  const latest = entries.at(-1);
  const res = { taxed: inSweden(), value: latest.invested_eur, value_sek: investedSek(latest), cost_input: null, as_of: null,
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
    const taxSek = (inSweden() ? CAPITAL_GAINS_TAX : 0) * Math.max(gain, 0);
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
  while (weekday(d) >= 5 || (inSweden() && bankHolidays(d.getFullYear()).has(isoDay(d)))) d = addDays(d, -1);
  return d;
}

export function paydayReason(p) {
  const d25 = day(p.getFullYear(), p.getMonth() + 1, 25);
  if (sameDay(p, d25)) return "";
  if (weekday(d25) >= 5) return `a ${WEEKDAYS[weekday(d25)]}`;
  return (inSweden() && bankHolidays(d25.getFullYear()).get(isoDay(d25))) || "a bank holiday";
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
/**
 * How a plan splits what's free (after fixed costs and goals) between your future and living money. It
 * wants ratePct of the salary for your future, but always leaves at least floorTotal to live on: when
 * the % doesn't fit, it saves less instead (capped); when even the minimum doesn't fit, nothing (short).
 * And it never leaves more than maxTotal to live on (0: no most): what's above it goes to your future too
 * (by_max), so the plan saves more than its %.
 */
export function planSplit(free, salary, ratePct, floorTotal = 0, maxTotal = 0) {
  const wanted = (Math.max(ratePct, 0) / 100) * salary;
  const room = Math.max(free - Math.max(floorTotal, 0), 0);
  let future = Math.max(0, Math.min(wanted, room));
  const capped = wanted > future + 0.5;
  const most = maxTotal > 0 ? Math.max(maxTotal, floorTotal) : 0;
  const byMax = most > 0 && free - future > most + 0.5;
  if (byMax) future = free - most;
  return { wanted, future, living: Math.max(free - future, 0), capped, by_max: byMax,
    short: floorTotal > 0 && free < floorTotal - 0.5,                     // even the minimum to live on doesn't fit
    by_floor: capped && floorTotal > 0 && free >= wanted - 0.5 };       // the % fits, but would leave too little
}

export function computeBudget(salary, expenses, goals, base, ratePct, bankSek, bufferFirst, fx, bufferMonths = 3, floorWeek = 0, days = 0, keepShare = 0, maxWeek = 0) {
  const fixed = sum(expenses.filter((e) => expenseApplies(e, base)).map((e) => expenseMonthlySek(e, fx)));
  const goalRows = goals.filter((g) => goalApplies(g, base)).map((g) => [g, goalPerMonth(g)]);
  const goalsTotal = sum(goalRows.map(([, m]) => m));
  const left = salary - fixed;
  const free = left - goalsTotal;
  const floorTotal = floorWeek > 0 && days > 0 ? floorWeek * days / 7 : 0;
  const split = planSplit(free, salary, ratePct, floorTotal, maxWeek > 0 && days > 0 ? maxWeek * days / 7 : 0);
  const { wanted, future, living } = split;
  const target = bufferMonths * fixed;
  let shortfall = Math.max(target - bankSek, 0);
  if (shortfall < 500) shortfall = 0;           // a few hundred kronor short counts as full
  const toBuffer = bufferFirst ? Math.min(future, shortfall) : 0;
  const [toSavings, invest] = keepSplit(future - toBuffer, keepShare);
  return {
    salary, fixed, left, goals: goalsTotal, goal_rows: goalRows, free, wanted, future,
    capped: split.capped, short: split.short, by_floor: split.by_floor, by_max: split.by_max, floor_week: floorWeek, floor_total: floorTotal,
    max_week: maxWeek, living, to_buffer: toBuffer, to_savings: toSavings, invest, savings: goalsTotal + toBuffer + toSavings, keep_share: keepShare,
    save_rate: salary > 0 ? future / salary : 0, rate_pct: ratePct,
    max_rate: salary > 0 ? Math.max(free, 0) / salary : 0,
    target, shortfall, bank: bankSek, buffer_months: bufferMonths,
  };
}

/** What a profile would do this pay period: spend, save (goals + buffer + savings), invest, and why it saves less. */
export function planForRate(snap, ratePct, floorWeek = 0, maxWeek = 0) {
  const salary = snap.salary;
  const floorTotal = floorWeek > 0 ? floorWeek * snap.days / 7 : 0;
  const s = planSplit(snap.free, salary, ratePct, floorTotal, maxWeek > 0 ? maxWeek * snap.days / 7 : 0);
  const toBuffer = snap.buffer_first ? Math.min(s.future, snap.shortfall) : 0;
  const [toSavings, invest] = keepSplit(s.future - toBuffer, snap.keep_share || 0);
  return { spend: s.living, save: snap.goals + toBuffer + toSavings, invest, to_buffer: toBuffer, to_savings: toSavings, future: s.future,
    rate: salary > 0 ? s.future / salary : 0, capped: salary > 0 && s.capped, short: salary > 0 && s.short, by_floor: s.by_floor,
    by_max: salary > 0 && s.by_max, floor_week: floorWeek, floor_total: floorTotal, max_week: maxWeek };
}

/** The least each profile lives on a week, in your currency (yours, or the suggested ones). */
/** The most each profile lives on a week (0: no most), in your currency (yours, or the suggested ones). */
export function loadMaxes(data) {
  const stored = getSetting(data, "profile_maxes", {}) || {};
  const out = {};
  for (const [key, , , , , def] of PROFILE_DEFS) {
    const val = typeof stored === "object" ? stored[key] : null;
    out[key] = typeof val === "number" && val >= 0 && val < 1e9 ? val : fromSek(def);
  }
  return out;
}

/** Pay periods with a trip: no most to live on then ({"2026-12": true}). */
export function loadTrips(data) {
  const t = getSetting(data, "trip_periods", {});
  return t && typeof t === "object" ? t : {};
}

export function loadFloors(data) {
  const stored = getSetting(data, "profile_floors", {}) || {};
  const out = {};
  for (const [key, , , , def] of PROFILE_DEFS) {
    const val = typeof stored === "object" ? stored[key] : null;
    out[key] = typeof val === "number" && val >= 0 && val < 1e9 ? val : fromSek(def);
  }
  return out;
}

/**
 * What you usually spend a week beyond your fixed costs, from your monthly logs (income minus what you
 * saved, minus the fixed costs): the median of the last 12 months, trip months left out. null with fewer
 * than 3 months to go on.
 */
export function usualSpending(entries, fixed) {
  const vals = monthFlows(entries).slice(-12).filter((f) => !isTrip(f.entry)).map((f) => f.spending - fixed).filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (vals.length < 3) return null;
  const mid = vals.length / 2;
  const month = vals.length % 2 ? vals[Math.floor(mid)] : (vals[mid - 1] + vals[mid]) / 2;
  return { month, week: month * 7 / 30.4375, months: vals.length };
}

/** The pay period today is in: from the last payday to the day before the next one. {base, start, end, days} */
export function currentPeriod(today) {
  const ps = paydayStatus(today);
  const base = monthOf(ps.prev);
  return { base, start: ps.prev, end: ps.next, days: daysBetween(ps.prev, ps.next) };
}

/**
 * Where you are in a plan on a day: the day of the period, this week and its money, and what the plan has
 * left for the days still to come (today included).
 */
export function planProgress(plan, start, end, today) {
  const days = daysBetween(start, end);
  const perDay = days > 0 ? plan.living / days : 0;
  const daysLeft = Math.max(0, Math.min(days, daysBetween(today, end)));
  const weeks = weekChunks(start, end);
  const k = weeks.findIndex((w) => w.start <= today && today <= w.end);
  const week = k >= 0 ? weeks[k] : null;
  return {
    days, day: Math.min(Math.max(daysBetween(start, today) + 1, 1), days), days_left: daysLeft, per_day: perDay, per_week: perDay * 7,
    expected: perDay * daysLeft, weeks, week_index: k, week, week_money: week ? perDay * week.days : 0,
    week_days_left: week ? daysBetween(today, addDays(week.end, 1)) : 0, started: today >= start, ended: today >= end,
  };
}

/**
 * A check-in: what was left of the living money on a day, against what the plan has for the days from
 * then to payday. Ahead or behind by more than a day's money says so; it also works out what you can
 * spend a day from then so it lasts.
 */
export function planCheck(plan, start, end, check) {
  const [y, m, d] = check.date.split("-").map(Number);
  const at = day(y, m, d);
  const days = daysBetween(start, end);
  const perDay = days > 0 ? plan.living / days : 0;
  const daysLeft = Math.max(1, Math.min(days, daysBetween(at, end)));
  const expected = perDay * daysLeft;
  const diff = check.left - expected;
  const [status, tone] = diff >= perDay ? ["Ahead", "up"] : diff > -perDay ? ["On track", "up"]
    : diff > -3 * perDay ? ["A bit behind", "warn"] : ["Behind", "down"];
  return { ...check, days_left: daysLeft, expected, diff, status, tone, per_day_now: check.left / daysLeft, per_week_now: check.left / daysLeft * 7 };
}

/** The budgets you saved on the Budget page for pay periods: {"2026-10": budget}. My plan works from them. */
export function loadBudgets(data) {
  const b = getSetting(data, "period_budgets", {});
  return b && typeof b === "object" ? b : {};
}

/** What the Budget page saves for My plan: the numbers a saving plan is worked out from. */
export function budgetToSave(snap, today) {
  return {
    salary: snap.salary, fixed: snap.fixed, goals: snap.goals, goal_rows: snap.goal_rows.map(([g, m]) => [g.name, m]),
    left: snap.left, free: snap.free, bank: snap.bank, target: snap.target, shortfall: snap.shortfall,
    buffer_first: snap.buffer_first, buffer_months: snap.buffer_months, keep_share: snap.keep_share || 0, days: snap.days, saved: isoDay(today),
  };
}

/** What changed on the Budget page since a budget was saved: [] when nothing did. */
export function budgetChanges(saved, snap) {
  const out = [];
  if (Math.abs(saved.salary - snap.salary) > 0.5) out.push("the salary");
  if (Math.abs(saved.fixed - snap.fixed) > 0.5) out.push("the fixed costs");
  if (Math.abs(saved.goals - snap.goals) > 0.5) out.push("the saving goals");
  if (Math.abs((saved.shortfall || 0) - snap.shortfall) > 0.5 || Boolean(saved.buffer_first) !== Boolean(snap.buffer_first)) out.push("the buffer");
  if ((saved.keep_share || 0) !== (snap.keep_share || 0)) out.push("the share kept in savings");
  return out;
}

/** The plans you started for pay periods: {"2026-10": plan}. A plan keeps its numbers for the whole period. */
export function loadPlans(data) {
  const p = getSetting(data, "period_plans", {});
  return p && typeof p === "object" ? p : {};
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
  if (CUR.single) return [1, "", false];
  const s = getSetting(data, "budget_rate");
  if (s && typeof s === "object" && s.sek_to_eur) return [Number(s.sek_to_eur), s.source || "Your rate", true];
  if (entries.length) return [entries.at(-1).sek_to_eur, `From your ${mLong(entries.at(-1).month)} log`, false];
  return [0.09, "Default rate, type yours", false];
}

/** Everything the Budget, Overview and Insights pages need about the plan. */
// ---------------------------------------------------------------------------
// Your car in the Budget: its costs are entered once, in the car monitor
// ---------------------------------------------------------------------------
const carName = (c) => c.name || [c.make, c.model].filter(Boolean).join(" ") || "Car";

/**
 * What a car costs a month in a pay period's budget: its fixed costs (insurance, parking...) and fuel, the
 * average of the 12 full months before the period's month (or of the months since your first refuel). It only
 * changes with the pay period, or when you change the fixed costs, so a budget you saved stays saved.
 */
export function carMonthly(car, base) {
  const fixed = sum((car.fixed || []).filter((f) => !f.from || f.from <= base).map((f) => Number(f.amount) || 0));
  const fuelLogs = (car.logs || []).filter((l) => l.type === "fuel" && l.cost > 0 && typeof l.date === "string");
  const end = addMonths(base, -1);
  const first = fuelLogs.reduce((m, l) => (m === null || l.date < m ? l.date : m), null);
  let fuel = 0, months = 0;
  if (first && first.slice(0, 7) <= end) {
    const start = mIndex(first.slice(0, 7)) > mIndex(end) - 12 ? first.slice(0, 7) : addMonths(end, -11);
    months = mIndex(end) - mIndex(start) + 1;
    const inWindow = fuelLogs.filter((l) => { const m = l.date.slice(0, 7); return m >= start && m <= end; });
    fuel = roundTo10(sum(inWindow.map((l) => l.cost)) / months);
  }
  return { fixed, fuel, months, total: fixed + fuel, electric: car.fuel === "electric" };
}

/**
 * The cars in the Budget, as fixed costs (setting budget_cars: {car id: true to count it, false to leave it
 * out}; a car you haven't decided on has no line yet). Their ids start with "car:".
 */
export function carBudgetLines(data, base) {
  const chosen = getSetting(data, "budget_cars", {}) || {};
  return (data.cars || []).filter((c) => typeof chosen[c.id] === "boolean").map((c, k) => {
    const m = carMonthly(c, base);
    return { id: `car:${c.id}`, car: c.id, name: carName(c), amount: m.total, per: "month", category: "Transport",
      active: chosen[c.id], position: 100000 + k, currency: "SEK", end_month: null, parts: m };
  }).filter((x) => x.amount > 0);
}

/** Cars with costs that the Budget doesn't count or leave out yet: [{car, parts}] */
export function carsToOffer(data, base) {
  const chosen = getSetting(data, "budget_cars", {}) || {};
  return (data.cars || []).filter((c) => typeof chosen[c.id] !== "boolean")
    .map((c) => ({ car: c, name: carName(c), parts: carMonthly(c, base) })).filter((x) => x.parts.total > 0);
}

export function budgetSnapshot(data, today = todayDate(), offset = 0, salaryOverride = null) {
  const entries = data.entries;
  const base = addMonths(defaultPeriodMonth(today), offset);
  const start = paydayFor(base), end = paydayFor(addMonths(base, 1));
  const latest = entries.length ? entries.at(-1) : null;
  const [fx, fxSrc, fxOverride] = budgetRate(data, entries);
  // a salary you typed on the Budget page is kept (in the data file) until you go back to the latest log
  const kept = getSetting(data, "budget_salary");
  const savedSalary = typeof kept === "number" && Number.isFinite(kept) && kept >= 0 ? kept : null;
  const salary = salaryOverride !== null ? salaryOverride : savedSalary !== null ? savedSalary : latest ? latest.income_sek : 0;
  // your fixed costs, and the cars you count in the Budget (from the car monitor)
  const expenses = [...data.expenses, ...carBudgetLines(data, base)].sort(byPosition);
  const goals = [...data.goals].sort(byPosition);
  const profiles = loadProfiles(data);
  let key = getSetting(data, "profile", "balanced");
  if (!(key in profiles)) key = "balanced";
  const floors = loadFloors(data);
  const maxes = loadMaxes(data);
  const trip = Boolean(loadTrips(data)[base]);
  const bufferFirst = Boolean(getSetting(data, "buffer_first", true));
  let months = getSetting(data, "buffer_months", 3);
  if (!BUFFER_MONTH_CHOICES.includes(months)) months = 3;
  const b = computeBudget(salary, expenses, goals, base, profiles[key], latest ? latest.bank_sek : 0,
    bufferFirst, fx, months, floors[key], daysBetween(start, end), loadKeepSaving(data), trip ? 0 : maxes[key]);
  const plan = loadPlans(data)[base] || null;
  const active = expenses.filter((e) => expenseApplies(e, base));
  const missing = active.filter((e) => e.amount === 0);
  return Object.assign(b, {
    today, base, start, end, days: daysBetween(start, end), fx, fx_src: fxSrc, fx_override: fxOverride,
    expenses, active, profiles, floors, maxes, trip, plan, profile: key, goals_list: goals, latest, salary_kept: salaryOverride === null && savedSalary !== null, buffer_first: bufferFirst, missing,
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
  const P = snap.plan || snap;          // the plan you started for this pay period, if you did
  const planned = P.future;
  // (moving the money on payday is on My plan, with a tick for each transfer)
  if (summ && snap.plan_ready) {
    const planRate = P.save_rate ?? snap.save_rate, actual = summ.rate;
    if (actual < planRate - 0.05)
      items.push([2, `You save ${pct(actual)} of your income, the plan says ${pct(planRate)}`,
        `Over the last ${summ.n} months you put aside ${fmtSek(summ.saved)} a month on average, the plan puts aside ${fmtSek(planned)}. That's about ${fmtSek(planned - summ.saved)} a month to find.`, COLORS.orange]);
    else if (actual < planRate - 0.005)
      items.push([6, `You're saving ${pct(actual)} of your income, close to your plan`,
        `Your plan says ${pct(planRate)}. Over the last ${summ.n} months you put aside ${fmtSek(summ.saved)} a month: about ${fmtSek(planned - summ.saved)} a month more would reach it.`, COLORS.green]);
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
        `Your bank savings cover ${months.toFixed(1)} months of fixed costs. ${inSweden() ? "Finansinspektionen suggests" : "A common rule of thumb is"} 2–3 months of necessary costs before you invest for the long term.`, COLORS.green]);
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
  if (inv && inv.taxed) {
    if (inv.tax_sek)
      items.push([8, `Selling everything today would mean about ${fmtSek(inv.tax_sek)} in tax`,
        `${brokersAnd("Your broker accounts")} ${/\+| and /.test(CUR.brokers) ? "are regular accounts" : "is a regular account"}: 30% of the gain is taxed when you sell, worked out in kronor. As foreign brokers they usually don't report to Skatteverket, so add sales (K4) and dividends to your tax return yourself.`, COLORS.orange]);
    else if (inv.cost_sek === null)
      items.push([9, "Tell the app what your investments cost",
        `Type it under Investments on the Insights tab${CUR.single ? "" : `, in ${CURRENCIES[CUR.local][3].toLowerCase()} or ${CURRENCIES[CUR.second][3].toLowerCase()}`}, to see what your holdings are worth after the 30% tax.`, COLORS.orange]);
    if ([2, 3, 4, 5].includes(snap.today.getMonth() + 1))
      items.push([1, `Check your tax return for ${brokersAnd("your foreign brokers")}`,
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
export async function fetchSekToEur(month, today = todayDate(), from = CUR.local, to = CUR.second) {
  const key = month >= monthOf(today) ? "latest" : `${month}-01`;
  if (from === to) return [1, key];
  let lastError = null;
  for (const base of ["https://api.frankfurter.app", "https://api.frankfurter.dev/v1"]) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      const resp = await fetch(`${base}/${key}?base=${from}&symbols=${to}`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const rate = Number(data.rates?.[to]);
      if (!(rate > 0)) throw new Error(`No rate for ${from} → ${to}`);
      return [rate, data.date || key];
    } catch (err) { lastError = err; }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Changing the second currency: re-express the logged months
// ---------------------------------------------------------------------------
/** One rate per month (1 own -> to) from the ECB, in one request. Returns Map month -> rate. */
export async function fetchMonthlyRates(months, from, to, today = todayDate()) {
  const out = new Map();
  if (!months.length) return out;
  if (from === to) { for (const m of months) out.set(m, 1); return out; }
  const first = [...months].sort()[0];
  const startIso = isoDay(addDays(day(mYear(first), mNum(first), 1), -10));
  let lastError = null, series = null;
  for (const base of ["https://api.frankfurter.app", "https://api.frankfurter.dev/v1"]) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const resp = await fetch(`${base}/${startIso}..${isoDay(today)}?base=${from}&symbols=${to}`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      series = Object.entries((await resp.json()).rates || {}).map(([d, r]) => [d, Number(r[to])]).filter(([, r]) => r > 0).sort();
      if (series.length) break;
      throw new Error(`No rates for ${from} → ${to}`);
    } catch (err) { lastError = err; series = null; }
  }
  if (!series) throw lastError;
  for (const m of months) {
    const target = `${m}-01`;
    let pick = series[0][1];
    for (const [d, r] of series) { if (d <= target) pick = r; else break; }
    out.set(m, pick);
  }
  return out;
}

/**
 * The data with its second-currency amounts re-expressed. newRate(month) gives the new 1 own -> second
 * rate (1 when you go to one currency). Costs and the investment cost typed in the old second
 * currency are turned into your own currency, so nothing depends on the old rate any more.
 */
export function convertSecond(data, newRate) {
  const d = JSON.parse(JSON.stringify(data));
  const s = getSetting(data, "budget_rate");
  const oldFx = (s && s.sek_to_eur) || (data.entries.length ? data.entries.at(-1).sek_to_eur : 1);
  const r2 = (v) => Math.round(v * 100) / 100;
  for (const e of d.entries) {
    const r0 = e.sek_to_eur, r1 = newRate(e.month);
    e.invested_eur = r2(e.invested_eur / r0 * r1);
    if (e.added_eur !== null && e.added_eur !== undefined) e.added_eur = r2(e.added_eur / r0 * r1);
    e.sek_to_eur = r1;
  }
  for (const x of d.expenses) if (x.currency === "EUR") { x.amount = r2(x.amount / oldFx); x.currency = "SEK"; }
  const basis = getSetting(data, "inv_basis");
  if (basis && typeof basis === "object" && (basis.currency === "EUR" || ("eur" in basis && !basis.currency))) {
    const amount = Number(basis.amount ?? basis.eur);
    const asOf = (basis.as_of || (data.entries.at(-1)?.month ?? "")).slice(0, 7);
    d.settings.inv_basis = { amount: r2(data.entries.length ? amount / rateForMonth(data.entries, asOf) : amount / oldFx), currency: "SEK", as_of: asOf };
  }
  d.settings.budget_rate = null;
  return d;
}

// ---------------------------------------------------------------------------
// CSV export (opens in Excel)
// ---------------------------------------------------------------------------
export function toCsv(entries) {
  const q = (v) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const r2 = (v, d) => (v === null || v === undefined ? "" : String(roundTo(v, d)));
  const L = CUR.local, S = CUR.second;
  const lines = [["Month", `Income (${L})`, `Bank savings (${L})`, `Invested (${S})`, `1 ${L} in ${S}`, `1 ${S} in ${L}`,
    `Income (${S})`, `Bank savings (${S})`, `Saved in bank (${L})`, `Invested change (${S})`,
    `Added to investments (${S})`, "Trip month", "Note"]];
  for (const r of computeRows(entries)) {
    const e = r.entry;
    lines.push([e.month, r2(e.income_sek, 2), r2(e.bank_sek, 2), r2(e.invested_eur, 2), r2(e.sek_to_eur, 6),
      e.sek_to_eur ? r2(1 / e.sek_to_eur, 4) : "", r2(incomeEur(e), 2), r2(bankEur(e), 2), r2(r.saved_sek, 2),
      r2(r.invested_delta, 2), r2(e.added_eur, 2), e.trip === null || e.trip === undefined ? "" : e.trip ? "yes" : "no",
      e.comment || ""]);
  }
  return "﻿" + lines.map((l) => l.map(q).join(",")).join("\r\n");
}

export function shortNote(text, n = 70) {
  text = String(text || "").split(/\s+/).filter(Boolean).join(" ");
  return text.length <= n ? text : `${text.slice(0, n - 1).trimEnd()}…`;
}

/** round like Python's round(x, -1) / round(x, -2) for display amounts */
export const roundTo10 = (v, digits = 1) => { const f = 10 ** digits; return Math.round(v / f) * f; };
