// A fixed cost whose amount changes with a payday: an invoice that comes in for the next one (js/core.js, js/store.js).
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../js/core.js";
import { normalize, applyOp, store } from "../js/store.js";

const entry = (month, o = {}) => ({ month, income_sek: 40000, bank_sek: 100000, invested_eur: 10000,
  sek_to_eur: 0.09, added_eur: null, comment: "", trip: null, ...o });
const cost = (id, name, amount, o = {}) => ({ id, name, amount, per: "month", category: "Home", active: true, end_month: null,
  position: id, currency: "SEK", ...o });

test.beforeEach(() => c.configure({ settings: {} }));

test("a new amount from a payday on: earlier pay periods keep what they had", () => {
  const rent = cost(1, "Rent", 9500);
  // the invoice for the 25 November payday comes in: 9 870 from the pay period "2026-11"
  const nov = c.withAmountFrom(rent, "2026-11", 9870);
  assert.deepEqual([nov.amount, nov.history], [9870, [{ until: "2026-10", amount: 9500 }]]);
  assert.deepEqual(["2025-01", "2026-10", "2026-11", "2027-03"].map((m) => c.expenseAmountFor(nov, m)), [9500, 9500, 9870, 9870]);
  assert.deepEqual([rent.amount, rent.history], [9500, undefined]);                     // the cost given stays as it was
  assert.equal(nov.name, "Rent");
  // December's invoice a month later
  const dec = c.withAmountFrom(nov, "2026-12", 9610);
  assert.deepEqual([dec.amount, dec.history], [9610, [{ until: "2026-10", amount: 9500 }, { until: "2026-11", amount: 9870 }]]);
  assert.deepEqual(["2026-10", "2026-11", "2026-12"].map((m) => c.expenseAmountFor(dec, m)), [9500, 9870, 9610]);
  assert.deepEqual(c.expenseSteps(dec), [[null, 9500], ["2026-11", 9870], ["2026-12", 9610]]);      // by the payday each one started at
  assert.deepEqual(c.expenseSteps(rent), [[null, 9500]]);
  // typed it wrong: the same payday again replaces it; the old amount again takes the change away
  assert.deepEqual(c.withAmountFrom(nov, "2026-11", 9900).history, [{ until: "2026-10", amount: 9500 }]);
  assert.equal(c.withAmountFrom(nov, "2026-11", 9900).amount, 9900);
  const back = c.withAmountFrom(nov, "2026-11", 9500);
  assert.deepEqual([back.amount, "history" in back], [9500, false]);
  // the same amount as now changes nothing
  assert.deepEqual(c.withAmountFrom(rent, "2026-11", 9500), rent);
});

test("changing the pay period you're in leaves an amount set for the next payday", () => {
  const nov = c.withAmountFrom(cost(1, "Rent", 9500), "2026-11", 9870);
  const fixed = c.withAmountFrom(nov, "2026-10", 9600);                  // October's was really 9 600
  assert.deepEqual(["2026-09", "2026-10", "2026-11"].map((m) => c.expenseAmountFor(fixed, m)), [9500, 9600, 9870]);
  assert.deepEqual(fixed.history, [{ until: "2026-09", amount: 9500 }, { until: "2026-10", amount: 9600 }]);
  // the new amount already now: one step, from October
  const now = c.withAmountFrom(nov, "2026-10", 9870);
  assert.deepEqual([now.amount, now.history], [9870, [{ until: "2026-09", amount: 9500 }]]);
  // years of invoices: the oldest steps go, the newest stay right
  let x = cost(2, "Electricity", 500);
  for (let i = 0; i < 50; i++) x = c.withAmountFrom(x, c.addMonths("2026-01", i), 600 + i);
  assert.equal(x.history.length, 35);
  assert.deepEqual([x.amount, c.expenseAmountFor(x, c.addMonths("2026-01", 48)), c.expenseAmountFor(x, c.addMonths("2026-01", 49))], [649, 648, 649]);
});

test("a cost counts from the pay period it starts in", () => {
  const gym = cost(3, "Gym", 450, { start_month: "2026-11" });
  assert.deepEqual(["2026-10", "2026-11", "2026-12"].map((m) => c.expenseApplies(gym, m)), [false, true, true]);
  assert.equal(c.expenseApplies({ ...gym, end_month: "2026-11" }, "2026-12"), false);
  assert.equal(c.expenseApplies({ ...gym, active: false }, "2026-11"), false);
  assert.equal(c.expenseApplies(cost(4, "Phone", 300), "2020-01"), true);              // no start: always
});

test("the budget of each pay period uses that period's amounts", () => {
  // 14 November 2026: in the pay period from 23 October (the 25th is a Sunday); the next payday is 25 November
  const today = c.day(2026, 11, 14);
  const before = { entries: [entry("2026-10")], goals: [], cars: [], settings: {},
    expenses: [cost(1, "Rent", 9500), cost(2, "Electricity", 700), cost(3, "Phone", 300)] };
  const saved = c.budgetToSave(c.budgetSnapshot(before, today), today);              // this pay period's budget, saved
  assert.equal(saved.fixed, 10500);
  // the invoices come in: rent 9 870 and electricity 912 from 25 November, and a gym card that starts then
  const data = { ...before, expenses: [c.withAmountFrom(before.expenses[0], "2026-11", 9870), c.withAmountFrom(before.expenses[1], "2026-11", 912),
    before.expenses[2], cost(4, "Gym", 450, { start_month: "2026-11" })] };
  const now = c.budgetSnapshot(data, today), next = c.budgetSnapshot(data, today, 1);
  assert.deepEqual([now.base, next.base], ["2026-10", "2026-11"]);
  assert.equal(now.fixed, 10500);                                                    // the running period: as it was
  assert.deepEqual(c.budgetChanges(saved, now), []);                                 // so nothing asks to be saved again
  assert.equal(next.fixed, 9870 + 912 + 300 + 450);
  assert.equal(next.left, 40000 - 11532);
  assert.deepEqual(now.active.map((x) => x.name), ["Rent", "Electricity", "Phone"]);
  assert.deepEqual(next.active.map((x) => x.name), ["Rent", "Electricity", "Phone", "Gym"]);
  // each row knows what it was and what the next payday makes it
  const row = (snap, name) => { const x = snap.expenses.find((e) => e.name === name); return [x.amount, x.amount_before, x.amount_next]; };
  assert.deepEqual(row(now, "Rent"), [9500, null, 9870]);
  assert.deepEqual(row(next, "Rent"), [9870, 9500, null]);
  assert.deepEqual(row(now, "Phone"), [300, null, null]);
  assert.equal(now.expenses[0].in_period, "2026-10");
  // on payday the new period is the one you're in, with the new amounts
  const payday = c.budgetSnapshot(data, c.day(2026, 11, 25));
  assert.deepEqual([payday.base, payday.fixed], ["2026-11", 11532]);
  // a cost still at 0 in a period is the one to fill in then
  const zero = { ...before, expenses: [c.withAmountFrom(cost(1, "Rent", 0), "2026-11", 9870)] };
  assert.deepEqual([c.budgetSnapshot(zero, today).missing.length, c.budgetSnapshot(zero, today, 1).missing.length], [1, 0]);
});

test("the data file keeps a cost's earlier amounts and its start", () => {
  const raw = { entries: [], expenses: [
    { ...cost(1, "Rent", 9870), history: [{ until: "2026-10", amount: 9500 }, { until: "2026-09", amount: 1 }, { until: "nope", amount: 5 }, { until: "2026-11", amount: "9600" }, null] },
    { ...cost(2, "Gym", 450), start_month: "2026-11-25", history: [] },
    { ...cost(3, "Phone", 300), in_period: "2026-10", amount_before: null, amount_next: 320 }] };
  const d = normalize(raw);
  assert.deepEqual(d.expenses[0].history, [{ until: "2026-10", amount: 9500 }, { until: "2026-11", amount: 9600 }]);   // in order, valid ones only
  assert.deepEqual([d.expenses[1].start_month, "history" in d.expenses[1]], ["2026-11", false]);
  assert.deepEqual(Object.keys(d.expenses[2]).filter((k) => ["in_period", "amount_before", "amount_next", "history", "start_month"].includes(k)), []);
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(d))).expenses, d.expenses);
  // a second currency folded into the first: the earlier amounts are converted with it
  const eur = { entries: [entry("2026-10")], goals: [], cars: [], settings: {},
    expenses: [{ ...cost(1, "Hosting", 12), currency: "EUR", history: [{ until: "2026-10", amount: 9 }] }] };
  const sek = c.convertSecond(eur, () => 1).expenses[0];
  assert.deepEqual([sek.currency, sek.amount, sek.history[0].amount], ["SEK", 133.33, 100]);
});

test("the row's switch and a row's copy can't change the stored amounts", () => {
  const rent = c.withAmountFrom(cost(1, "Rent", 9500), "2026-11", 9870);
  let d = normalize({ entries: [], expenses: [rent, cost(2, "Phone", 300)] });
  d = applyOp(d, { type: "setExpenseActive", id: 1, active: false });
  assert.deepEqual([d.expenses[0].active, d.expenses[0].amount, d.expenses[0].history, d.expenses[1].active],
    [false, 9870, [{ until: "2026-10", amount: 9500 }], true]);
  // saving the copy the Budget shows for one pay period (amount: that period's) keeps the amounts as stored
  store.meta = { mode: "local", pending: [] };
  store.data = normalize({ entries: [], expenses: [rent] });
  const copy = c.expenseInPeriod(store.data.expenses[0], "2026-10");
  assert.equal(copy.amount, 9500);
  store.saveExpense({ ...copy, name: "Rent and heating" });
  assert.deepEqual(store.data.expenses[0], { ...rent, name: "Rent and heating" });
  store.setExpenseActive(1, false);
  assert.deepEqual([store.data.expenses[0].active, store.data.expenses[0].amount], [false, 9870]);
});

test("a cost remembers which of its amounts are your half of a bill you split (½)", () => {
  const raw = { entries: [], expenses: [
    { id: 1, name: "Electricity", amount: 920, per: "month", category: "Home", active: true, position: 0, currency: "SEK",
      history: [{ until: "2026-11", amount: 700 }], start_month: null, halves: [{ half: 920, full: 1840 }, { half: 700, full: 1400 }] },
    // not a half of its whole bill, not numbers, not a list: left out
    { id: 2, name: "Rent", amount: 6000, per: "month", category: "Home", active: true, position: 1, currency: "SEK",
      halves: [{ half: 6000, full: 13000 }, { half: "6000", full: 12000 }, null, { half: 0, full: 0 }] },
    { id: 3, name: "Internet", amount: 250, per: "month", category: "Home", active: true, position: 2, currency: "SEK", halves: { half: 250, full: 500 } },
  ] };
  const d = normalize(raw);
  assert.deepEqual(d.expenses[0].halves, [{ half: 920, full: 1840 }, { half: 700, full: 1400 }]);
  assert.equal("halves" in d.expenses[1], false);
  assert.equal("halves" in d.expenses[2], false);
  // saved and read back as it was
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(d))).expenses, d.expenses);
  // half an öre off from rounding is still a half
  assert.deepEqual(normalize({ entries: [], expenses: [{ id: 1, name: "Water", amount: 459.5, halves: [{ half: 459.5, full: 919 }] }] }).expenses[0].halves,
    [{ half: 459.5, full: 919 }]);
});
