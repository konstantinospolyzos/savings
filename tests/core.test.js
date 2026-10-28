// Tests for the calculations in js/core.js. Every expected number is worked out by hand,
// so a change that moves a figure on the phone shows up here first.
// Run: npm test   (or: node --test)

import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../js/core.js";

const close = (actual, expected, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ≈ ${expected}, got ${actual}`);
const NBSP = "\u00a0";

// A month as the app stores it. Rate 0.09 = 1 kr is 0.09 € (1 € ≈ 11.11 kr).
const entry = (month, o = {}) => ({ month, income_sek: 40000, bank_sek: 100000, invested_eur: 10000,
  sek_to_eur: 0.09, added_eur: null, comment: "", trip: null, ...o });

test.beforeEach(() => c.configure({ settings: {} }));   // Sweden, SEK + EUR

// ---------------------------------------------------------------------------
test("parseNumber reads the ways people type amounts", () => {
  assert.equal(c.parseNumber("42 086"), 42086);
  assert.equal(c.parseNumber("42,086"), 42086);           // comma as thousands
  assert.equal(c.parseNumber("4092.50"), 4092.5);
  assert.equal(c.parseNumber("4 092,50"), 4092.5);        // comma as decimal
  assert.equal(c.parseNumber("0,0885"), 0.0885);
  assert.equal(c.parseNumber("−500 kr"), -500);
  assert.equal(c.parseNumber("€1,234.56"), 1234.56);
  assert.equal(c.parseNumber(""), null);
  assert.equal(c.parseNumber("abc"), null);
});

test("money formatting: kronor after, euros before, halves to even", () => {
  assert.equal(c.fmtSek(1234.5), `1${NBSP}234${NBSP}kr`);  // like Python: 1234.5 -> 1234
  assert.equal(c.fmtSek(1235.5), `1${NBSP}236${NBSP}kr`);
  assert.equal(c.fmtEur(1234), "€1,234");
  assert.equal(c.fmtEur(-50, 0, true), "−€50");
  assert.equal(c.fmtSek(0.4, true), `+0${NBSP}kr`);          // no "−0"
});

test("exchange rate typed either way round", () => {
  close(c.rateFromInput(11.07), 1 / 11.07, 1e-9);          // "1 € = 11.07 kr"
  assert.equal(c.rateFromInput(0.09, 0.09), 0.09);         // typed as kr -> € by mistake
  assert.equal(c.rateFromInput(0), null);
});

// ---------------------------------------------------------------------------
test("saved and spending with “Added this month” logged", () => {
  const [f] = c.monthFlows([
    entry("2026-01"),
    entry("2026-02", { bank_sek: 105000, invested_eur: 11000, added_eur: 450 }),
  ]);
  assert.equal(f.bank_d, 5000);
  close(f.to_inv, 450 / 0.09);                  // 5 000 kr put into investments
  close(f.saved, 10000);                        // 5 000 bank + 5 000 invested
  close(f.spending, 30000);                     // 40 000 income − 10 000 saved
  close(f.rate, 0.25);
  assert.equal(f.market, 550);                  // 1 000 € up, 450 € of it was yours
  assert.equal(f.exact, true);
});

test("without “Added”, market moves count as saving", () => {
  const [f] = c.monthFlows([entry("2026-01"), entry("2026-02", { invested_eur: 9100 })]);
  close(f.to_inv, -900 / 0.09);                 // a 900 € market drop...
  close(f.spending, 50000);                     // ...shows up as 10 000 kr extra "spending"
  assert.equal(f.market, null);
  assert.equal(f.exact, false);
});

test("summarize averages over the months", () => {
  const flows = c.monthFlows([
    entry("2026-01"),
    entry("2026-02", { bank_sek: 110000 }),     // saved 10 000
    entry("2026-03", { bank_sek: 108000 }),     // saved −2 000
  ]);
  const s = c.summarize(flows);
  assert.equal(s.n, 2);
  assert.equal(s.saved, 4000);
  assert.equal(s.spending, 36000);
  close(s.rate, 0.1);
});

// ---------------------------------------------------------------------------
test("trip months: flagged beats the note, notes are a guess", () => {
  assert.deepEqual(c.tripStatus(entry("2026-01", { comment: "Flight to UK" })), [true, false]);
  assert.deepEqual(c.tripStatus(entry("2026-01", { comment: "Flight to UK", trip: false })), [false, true]);
  assert.deepEqual(c.tripStatus(entry("2026-01", { comment: "Bought skis" })), [false, false]);
});

test("what trips cost: gap and yearly extra", () => {
  const flows = c.monthFlows([
    entry("2026-01"),
    entry("2026-02", { bank_sek: 110000 }),               // normal, spent 30 000
    entry("2026-03", { bank_sek: 100000, trip: true }),   // trip, spent 50 000
    entry("2026-04", { bank_sek: 110000 }),               // normal, spent 30 000
    entry("2026-05", { bank_sek: 100000, trip: true }),   // trip, spent 50 000
  ]);
  const t = c.tripComparison(flows);
  assert.equal(t.trip.spending, 50000);
  assert.equal(t.other.spending, 30000);
  assert.equal(t.gap, 20000);
  assert.equal(t.per_year, 120000);             // 20 000 × (2 of 4 months) × 12
  assert.equal(t.guessed, 2);
  assert.equal(c.travelFund(flows).per_month, 10000);
});

// ---------------------------------------------------------------------------
test("income: average, highest, lowest, euros and year-on-year", () => {
  const es = [];
  for (let i = 0; i < 15; i++) es.push(entry(c.addMonths("2025-08", i), { income_sek: 40000, sek_to_eur: 0.09 }));
  es[14].income_sek = 46000;                    // 2026-10, latest
  es[12].income_sek = 34000;                    // 2026-08
  es[14].sek_to_eur = 0.1;
  const a = c.incomeAnalysis(es);
  assert.equal(a.n, 12);
  assert.equal(a.avg, 40000);                   // +6 000 and −6 000 cancel out
  assert.equal(a.top.month, "2026-10");
  assert.equal(a.low.month, "2026-08");
  close(a.avg_eur, (11 * 40000 * 0.09 - 6000 * 0.09 + 46000 * 0.1) / 12);  // each month at its own rate
  close(a.yoy, 0);                              // same total as a year earlier
});

// ---------------------------------------------------------------------------
test("investments: 30% tax on the gain, worked out in kronor", () => {
  const es = [entry("2026-09"), entry("2026-10", { invested_eur: 11000, sek_to_eur: 0.1 })];
  const data = { settings: { inv_basis: { amount: 100000, currency: "SEK", as_of: "2026-10" } } };
  const inv = c.investmentStatus(data, es);
  close(inv.value_sek, 110000);
  close(inv.gain_sek, 10000);
  close(inv.tax_sek, 3000);
  close(inv.after_sek, 107000);
  close(inv.tax, 300);                          // in euros at today's rate
  close(inv.after, 10700);
  assert.equal(inv.isk_tax_year, 0);            // under the 300 000 kr ISK allowance
});

test("investments: a loss means no tax, cost in euros uses that month's rate", () => {
  const es = [entry("2026-09", { sek_to_eur: 0.08 }), entry("2026-10", { invested_eur: 8000, sek_to_eur: 0.1 })];
  const data = { settings: { inv_basis: { amount: 8000, currency: "EUR", as_of: "2026-09" } } };
  const inv = c.investmentStatus(data, es);
  close(inv.cost_sek, 100000);                  // 8 000 € at 0.08
  close(inv.gain_sek, -20000);                  // same euros, stronger krona: a loss in kronor
  assert.equal(inv.tax_sek, 0);
});

test("ISK comparison tax above the allowance", () => {
  const inv = c.investmentStatus({ settings: {} }, [entry("2026-10", { invested_eur: 40000, sek_to_eur: 0.1 })]);
  close(inv.isk_tax_year, 100000 * 0.01065);    // 400 000 − 300 000 tax-free
});

test("growth illustration", () => {
  const [total, putIn] = c.futureValue(10000, 1000, 10, 0);
  assert.equal(total, 130000);
  assert.equal(putIn, 130000);
  close(c.futureValue(10000, 0, 10, 0.05)[0], 10000 * 1.05 ** 10);
  close(c.futureValue(0, 1000, 1, 0.05)[0], 1000 * 0.05 / (1.05 ** (1 / 12) - 1));   // 12 monthly deposits, 5% a year
});

// ---------------------------------------------------------------------------
test("payday: the 25th, or the last banking day before it", () => {
  const pay = (m) => c.isoDay(c.paydayFor(m));
  assert.equal(pay("2026-06"), "2026-06-25");   // Thursday
  assert.equal(pay("2026-10"), "2026-10-23");   // 25th is a Sunday
  assert.equal(pay("2026-04"), "2026-04-24");   // 25th is a Saturday
  assert.equal(pay("2026-12"), "2026-12-23");   // 25th and 24th are holidays
  assert.equal(c.paydayReason(c.paydayFor("2026-12")), "Christmas Day");
});

test("Swedish holidays move with Easter and Midsummer", () => {
  assert.equal(c.isoDay(c.easterSunday(2026)), "2026-04-05");
  assert.equal(c.isoDay(c.easterSunday(2027)), "2027-03-28");
  const h = c.bankHolidays(2026);
  assert.equal(h.get("2026-04-03"), "Good Friday");
  assert.equal(h.get("2026-05-14"), "Ascension Day");
  assert.equal(h.get("2026-06-19"), "Midsummer Eve");
});

// ---------------------------------------------------------------------------
test("budget: costs, goals, saving, buffer first", () => {
  const expenses = [{ amount: 12000, per: "month", active: true, currency: "SEK" },
    { amount: 36000, per: "year", active: true, currency: "SEK" }];          // 3 000 a month
  const goals = [{ kind: "year", amount: 24000, active: true }];            // 2 000 a month
  const b = c.computeBudget(40000, expenses, goals, "2026-10", 20, 30000, true, 0.09, 3);
  assert.equal(b.fixed, 15000);
  assert.equal(b.goals, 2000);
  assert.equal(b.free, 23000);
  assert.equal(b.future, 8000);                 // 20% of 40 000
  assert.equal(b.living, 15000);
  assert.equal(b.target, 45000);                // 3 months of fixed costs
  assert.equal(b.shortfall, 15000);
  assert.equal(b.to_buffer, 8000);              // buffer first: all of it
  assert.equal(b.invest, 0);
});

test("budget: saving is capped by what's free, small shortfalls count as full", () => {
  const b = c.computeBudget(20000, [{ amount: 18000, per: "month", active: true }], [], "2026-10", 30, 53800, false, 0.09, 3);
  assert.equal(b.future, 2000);                 // wanted 6 000, only 2 000 free
  assert.equal(b.capped, true);
  assert.equal(b.shortfall, 0);                 // 200 kr short of 54 000
  assert.equal(b.invest, 2000);
});

test("euro costs are converted at the budget rate", () => {
  close(c.expenseMonthlySek({ amount: 120, per: "year", currency: "EUR" }, 0.1), 100);
});

// ---------------------------------------------------------------------------
test("saving plans always leave a minimum to live on", () => {
  // 38 095 salary, 27 756 fixed costs: 10 339 left for a 33-day pay period (4.71 weeks)
  const fixed = [{ amount: 27756, per: "month", active: true, currency: "SEK" }];
  const days = 33, weeks = 33 / 7;
  const plan = (rate, floor) => c.computeBudget(38095, fixed, [], "2026-10", rate, 100000, false, 0.09, 3, floor, days);
  const high = plan(35, 300);                       // 35% wants 13 333: doesn't fit
  close(high.living, 300 * weeks);                  // the minimum: 300 kr a week
  close(high.future, 10339 - 300 * weeks);
  assert.equal(high.capped, true);
  assert.equal(high.by_floor, false);               // the % doesn't even fit before the minimum
  assert.equal(high.short, false);
  const balanced = plan(25, 500);                   // 25% (9 524) fits, but would leave 815 kr: less than 500 a week
  close(balanced.living, 500 * weeks);
  assert.equal(balanced.by_floor, true);
  const light = plan(10, 800);                      // 10% fits and leaves plenty
  close(light.future, 3809.5);
  assert.equal(light.capped, false);
  // even the minimum doesn't fit: nothing to the future, all of it to live on
  const tight = c.computeBudget(30000, fixed, [], "2026-10", 20, 0, false, 0.09, 3, 800, days);
  assert.deepEqual([tight.short, tight.future, tight.living], [true, 0, 30000 - 27756]);
  // the old way (no minimum) still works
  assert.equal(c.computeBudget(38095, fixed, [], "2026-10", 35, 0, false, 0.09, 3).living, 0);
  assert.equal(c.fromSek(300), 300);
});

test("what you usually spend beyond fixed costs, from the logs", () => {
  const e = (month, income, bank, comment = "") => ({ month, income_sek: income, bank_sek: bank, invested_eur: 0, sek_to_eur: 0.09, added_eur: null, comment, trip: null });
  const entries = [e("2026-01", 38000, 50000), e("2026-02", 38000, 54000), e("2026-03", 38000, 57000),
    e("2026-04", 38000, 52000, "Flight to Greece"), e("2026-05", 38000, 56500), e("2026-06", 38000, 61000)];
  // spending a month: 34 000, 35 000, (trip), 33 500, 33 500 -> beyond 28 000 of fixed costs: 6 000, 7 000, 5 500, 5 500
  const u = c.usualSpending(entries, 28000);
  assert.equal(u.months, 4);
  assert.equal(u.month, 5750);
  close(u.week, 5750 * 7 / 30.4375);
  assert.equal(c.usualSpending(entries.slice(0, 3), 28000), null);   // too few months
});

test("a started plan day by day, and checking in", () => {
  // the pay period 23 Oct - 24 Nov 2026 (payday 23 Oct, the next on 25 Nov): 33 days
  const per = c.currentPeriod(c.day(2026, 10, 28));
  assert.deepEqual([per.base, c.isoDay(per.start), c.isoDay(per.end), per.days], ["2026-10", "2026-10-23", "2026-11-25", 33]);
  const plan = { living: 3300 };                       // 100 kr a day
  const pr = c.planProgress(plan, per.start, per.end, c.day(2026, 10, 28));
  assert.deepEqual([pr.day, pr.days_left, pr.week_index, pr.week_days_left], [6, 28, 0, 2]);   // week 1: 23 - 29 Oct
  close(pr.per_day, 100);
  close(pr.expected, 2800);
  close(pr.week_money, 700);
  assert.equal(pr.weeks.length, 5);
  const last = c.planProgress(plan, per.start, per.end, c.day(2026, 11, 24));
  assert.deepEqual([last.day, last.days_left, last.week_index, last.week.days], [33, 1, 4, 5]);
  // 28 Oct, 28 days to go: the plan has 2 800 for them
  const at = (left) => c.planCheck(plan, per.start, per.end, { date: "2026-10-28", left });
  assert.equal(at(2800).status, "On track");
  assert.equal(at(2950).status, "Ahead");
  assert.equal(at(2650).status, "A bit behind");
  assert.equal(at(2400).status, "Behind");
  close(at(2400).diff, -400);
  close(at(2400).per_day_now, 2400 / 28);                // so it lasts to payday
  // the next pay period starts on payday itself
  assert.equal(c.currentPeriod(c.day(2026, 11, 25)).base, "2026-11");
  assert.equal(c.currentPeriod(c.day(2026, 11, 24)).base, "2026-10");
});

test("the budget saved for My plan, and what changed since", () => {
  const fixed = [{ amount: 27756, per: "month", active: true, currency: "SEK" }];
  const goals = [{ name: "Trips", kind: "year", amount: 24000, active: true }];
  const b = { ...c.computeBudget(38095, fixed, goals, "2026-10", 25, 50000, true, 0.09, 3, 500, 33), days: 33, buffer_first: true };
  const saved = c.budgetToSave(b, c.day(2026, 10, 28));
  assert.deepEqual([saved.salary, saved.fixed, saved.goals, saved.left, saved.free, saved.saved], [38095, 27756, 2000, 10339, 8339, "2026-10-28"]);
  assert.deepEqual(saved.goal_rows, [["Trips", 2000]]);
  assert.deepEqual(c.budgetChanges(saved, b), []);
  assert.deepEqual(c.budgetChanges(saved, { ...b, salary: 40000, fixed: 27000 }), ["the salary", "the fixed costs"]);
  assert.deepEqual(c.budgetChanges(saved, { ...b, buffer_first: false }), ["the buffer"]);
  // a plan worked out from the saved numbers, as My plan does
  const p = c.planForRate({ ...saved, days: 33 }, 25, 500);
  close(p.spend, 500 * 33 / 7);                     // 25% would leave less than 500 a week
  close(p.future, 8339 - 500 * 33 / 7);
  assert.equal(p.capped, true);                     // 25% (9 524) doesn't fit in the 8 339 left after goals
});

test("your car in the Budget: its fixed costs and fuel, entered once in the car monitor", () => {
  const fuel = (date, cost) => ({ id: date, date, type: "fuel", cost, km: null });
  const year = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]
    .map((m) => fuel(`${m}-15`, m === "2026-06" ? 2000 : 1000));
  const car = { id: "car-1", name: "", make: "Seat", model: "Leon", fuel: "95",
    fixed: [{ id: "a", amount: 787, from: "2025-09" }, { id: "b", amount: 863, from: "2025-09" }, { id: "c", amount: 300, from: "2026-12" }],
    logs: [fuel("2025-08-20", 500), fuel("2025-09-20", 600), ...year, fuel("2026-10-05", 900),
      { id: "s", date: "2026-03-14", type: "service", cost: 4890, km: 46120 }] };
  // the pay period from October's payday: fuel is the average of Oct 2025 – Sep 2026 (12 full months, the trip in June too)
  const m = c.carMonthly(car, "2026-10");
  assert.equal(m.fixed, 1650);                       // the one from December doesn't count yet
  assert.equal(m.months, 12);
  assert.equal(m.fuel, 1080);                        // 13 000 / 12 = 1 083, to the nearest 10
  assert.equal(m.total, 2730);
  assert.equal(c.carMonthly(car, "2026-12").fixed, 1950);
  // a newer car: the months since the first refuel; nothing yet in its first month
  const young = { ...car, fixed: [], logs: [fuel("2026-08-03", 800), fuel("2026-09-01", 700), fuel("2026-09-25", 600)] };
  assert.deepEqual([c.carMonthly(young, "2026-10").months, c.carMonthly(young, "2026-10").fuel], [2, 1050]);
  assert.deepEqual([c.carMonthly({ ...young, logs: [fuel("2026-10-02", 700)] }, "2026-10").fuel, c.carMonthly(young, "2026-08").months], [0, 0]);

  // counted (true), left out (false) or not decided yet (offered)
  const other = { ...young, id: "car-2", name: "Brother's" }, third = { ...young, id: "car-3", make: "Volvo", model: "V60" };
  const data = { entries: [entry("2026-10", { income_sek: 38095, bank_sek: 50000 })], goals: [],
    expenses: [{ id: 1, name: "Rent", amount: 27756, per: "month", category: "Home", active: true, position: 0, currency: "SEK" }],
    settings: { budget_cars: { "car-1": true, "car-2": false } }, cars: [car, other, third] };
  const lines = c.carBudgetLines(data, "2026-10");
  assert.deepEqual(lines.map((x) => [x.id, x.name, x.amount, x.active, x.category]),
    [["car:car-1", "Seat Leon", 2730, true, "Transport"], ["car:car-2", "Brother's", 1050, false, "Transport"]]);
  assert.deepEqual(c.carsToOffer(data, "2026-10").map((x) => [x.name, x.parts.total]), [["Volvo V60", 1050]]);
  const snap = c.budgetSnapshot(data, c.day(2026, 10, 28));
  assert.equal(snap.base, "2026-10");
  assert.equal(snap.fixed, 27756 + 2730);            // the car counts like any fixed cost; the one left out doesn't
  assert.deepEqual(snap.active.map((x) => x.name), ["Rent", "Seat Leon"]);
  assert.equal(snap.expenses.length, 3);
  assert.equal(snap.target, 3 * (27756 + 2730));     // and in the buffer target
});

test("once the buffer is full, a share of the future money still goes to savings", () => {
  const fixed = [{ amount: 20000, per: "month", active: true, currency: "SEK" }];
  // 40 000 salary, 20% to the future = 8 000; the bank holds 100 000 > 3 × 20 000, so the buffer is full
  const none = c.computeBudget(40000, fixed, [], "2026-10", 20, 100000, true, 0.09, 3, 0, 30);
  assert.deepEqual([none.to_buffer, none.to_savings, none.invest], [0, 0, 8000]);
  const kept = c.computeBudget(40000, fixed, [], "2026-10", 20, 100000, true, 0.09, 3, 0, 30, 0.25);
  assert.deepEqual([kept.to_buffer, kept.to_savings, kept.invest, kept.savings], [0, 2000, 6000, 2000]);
  // not full: the buffer first (50 000 short), then a quarter of what's left (nothing is left here)
  const short = c.computeBudget(40000, fixed, [], "2026-10", 20, 10000, true, 0.09, 3, 0, 30, 0.25);
  assert.deepEqual([short.to_buffer, short.to_savings, short.invest], [8000, 0, 0]);
  // a plan from a saved budget does the same, and a share you change counts as a change to the budget
  const p = c.planForRate({ ...kept, days: 30 }, 20);
  assert.deepEqual([p.save, p.to_savings, p.invest], [2000, 2000, 6000]);
  const saved = c.budgetToSave({ ...kept, goal_rows: [], days: 30, buffer_first: true }, c.day(2026, 10, 28));
  assert.equal(saved.keep_share, 0.25);
  assert.deepEqual(c.budgetChanges(saved, { ...kept, keep_share: 0.5, buffer_first: true }), ["the share kept in savings"]);
});
