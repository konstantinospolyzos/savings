// One-time expenses: they count in the pay period of their date only, and come out of what the plan puts aside
// (js/core.js, js/store.js). Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../js/core.js";
import { normalize, applyOp } from "../js/store.js";

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const entry = (month, o = {}) => ({ month, income_sek: 40000, bank_sek: 200000, invested_eur: 10000,
  sek_to_eur: 0.09, added_eur: null, comment: "", trip: null, ...o });
const rent = { id: 1, name: "Rent", amount: 20000, per: "month", category: "Home", active: true, end_month: null, position: 0, currency: "SEK" };

test.beforeEach(() => c.configure({ settings: {} }));

test("a one-time expense comes out of what the plan puts aside, not out of the living money", () => {
  // 20 000 free, the plan wants 20% of 40 000 = 8 000 for the future and leaves 12 000 to live on
  const plain = c.planSplit(20000, 40000, 20, 2000);
  assert.deepEqual([plain.future, plain.living, plain.oneoff_over], [8000, 12000, 0]);
  // an air fryer and a flight pass, 7 200 together: free is 12 800 now, the living money stays 12 000
  const once = c.planSplit(12800, 40000, 20, 2000, 0, 7200);
  assert.deepEqual([once.future, once.living, once.oneoff_over, once.capped, once.short], [800, 12000, 0, false, false]);
  // more than it puts aside: the future gets nothing, and the rest comes out of the buffer
  const big = c.planSplit(10000, 40000, 20, 2000, 0, 10000);
  assert.deepEqual([big.future, big.living, big.oneoff_over], [0, 12000, 2000]);
  // with a most to live on (3 000): 17 000 would go to the future, the expense comes out of that
  const capped = c.planSplit(12800, 40000, 20, 2000, 3000, 7200);
  assert.deepEqual([capped.future, capped.living, capped.by_max], [9800, 3000, true]);
  // the minimum to live on is judged without them too: 2 500 free before a 1 000 expense still fits a 2 000 minimum
  const tight = c.planSplit(1500, 40000, 20, 2000, 0, 1000);
  assert.deepEqual([tight.short, tight.future, tight.living, tight.oneoff_over], [false, 0, 2000, 500]);
});

test("the budget of a pay period: left to plan after them, and less to save and invest", () => {
  const b0 = c.computeBudget(40000, [rent], [], "2026-10", 20, 200000, true, 0.09, 3, 500, 28, 0.25);
  assert.deepEqual([b0.left, b0.future, b0.living, b0.to_savings, b0.invest, b0.oneoff], [20000, 8000, 12000, 2000, 6000, 0]);
  const b = c.computeBudget(40000, [rent], [], "2026-10", 20, 200000, true, 0.09, 3, 500, 28, 0.25, 0, 7200);
  assert.deepEqual([b.left, b.free, b.oneoff, b.oneoff_over], [12800, 12800, 7200, 0]);
  assert.deepEqual([b.future, b.living, b.to_savings, b.invest], [800, 12000, 200, 600]);       // a quarter still stays in savings
  close(b.save_rate, 0.02);
  assert.deepEqual([b.usual_future, b0.usual_future], [8000, 8000]);                           // what your months are compared with
  close(b.usual_rate, 0.2);
  assert.equal(b.target, 60000);                                                               // the buffer target doesn't move
  // the plans worked out from a saved budget do the same
  const p = c.planForRate({ ...b, days: 28, buffer_first: true }, 20, 500);
  assert.deepEqual([p.spend, p.future, p.save, p.invest, p.oneoff, p.oneoff_over], [12000, 800, 200, 600, 7200, 0]);
});

test("one-time expenses belong to the pay period of their date", () => {
  const settings = { one_time: [
    { id: "b", date: "2026-11-14", name: "8 flights pass", amount: 6000 },
    { id: "a", date: "2026-11-14", name: " Air fryer ", amount: 1200 },
    { id: "c", date: "2026-11-25", name: "Winter coat", amount: 1500 },          // payday: the next pay period
    { id: "d", date: "2026-10-22", name: "Bike service", amount: 800 },          // the day before the 23 Oct payday
    { id: "e", date: "14 Nov", name: "Bad date", amount: 5 }, { id: "f", date: "2026-11-15", name: "", amount: 5 },
    { id: 7, date: "2026-11-15", name: "No text id", amount: 5 }, { id: "g", date: "2026-11-15", name: "Not a number", amount: "12" }, null] };
  const data = { entries: [entry("2026-10")], expenses: [rent], goals: [], cars: [], settings };
  assert.deepEqual(c.loadOneTime(data).map((x) => [x.id, x.name]), [["d", "Bike service"], ["a", "Air fryer"], ["b", "8 flights pass"], ["c", "Winter coat"]]);
  assert.deepEqual(c.loadOneTime({ settings: { one_time: "nope" } }), []);
  const today = c.day(2026, 11, 14);
  const now = c.budgetSnapshot(data, today), next = c.budgetSnapshot(data, today, 1), prev = c.budgetSnapshot(data, today, -1);
  assert.deepEqual([now.base, now.oneoff, now.oneoffs.map((x) => x.id)], ["2026-10", 7200, ["a", "b"]]);
  assert.deepEqual([next.oneoff, next.oneoffs.map((x) => x.id)], [1500, ["c"]]);
  assert.deepEqual(prev.oneoffs.map((x) => x.id), ["d"]);
  assert.deepEqual([now.left, now.fixed], [40000 - 20000 - 7200, 20000]);
  // a saved budget notices them, and nothing else
  const before = { ...data, settings: {} };
  const saved = c.budgetToSave(c.budgetSnapshot(before, today), today);
  assert.equal(saved.oneoff, 0);
  assert.deepEqual(c.budgetChanges(saved, now), ["the one-time expenses"]);
  assert.deepEqual(c.budgetChanges(c.budgetToSave(now, today), now), []);
  assert.equal(c.budgetToSave(now, today).oneoff, 7200);
});

test("the action plan compares your saving with the plan as it is without this period's one-time expenses", () => {
  const data = { entries: [entry("2026-10")], expenses: [rent], goals: [], cars: [], settings: { profile_rates: { light: 10, balanced: 20, high: 30 } } };
  const withOnce = { ...data, settings: { ...data.settings, one_time: [{ id: "a", date: "2026-11-14", name: "Flights", amount: 7200 }] } };
  const today = c.day(2026, 11, 14);
  const a = c.budgetSnapshot(data, today), b = c.budgetSnapshot(withOnce, today);
  assert.equal(a.living, b.living);
  assert.equal(b.future + b.oneoff - b.oneoff_over, a.future);
});

test("the data file keeps them in the settings, change by change", () => {
  let d = normalize({ entries: [], expenses: [], goals: [], settings: { profile: "balanced" } });
  d = applyOp(d, { type: "putOneTime", item: { id: "a", date: "2026-11-14", name: "Air fryer", amount: 1200 } });
  d = applyOp(d, { type: "putOneTime", item: { id: "b", date: "2026-11-14", name: "8 flights pass", amount: 6000 } });
  d = applyOp(d, { type: "putOneTime", item: { id: "a", date: "2026-11-13", name: "Air fryer", amount: 1100 } });      // changed: one of it
  assert.deepEqual(c.loadOneTime(d).map((x) => [x.id, x.date, x.amount]), [["a", "2026-11-13", 1100], ["b", "2026-11-14", 6000]]);
  assert.equal(d.settings.profile, "balanced");
  assert.deepEqual(c.loadOneTime(normalize(JSON.parse(JSON.stringify(d)))), c.loadOneTime(d));          // a load keeps them
  d = applyOp(d, { type: "deleteOneTime", id: "a" });
  assert.deepEqual(c.loadOneTime(d).map((x) => x.id), ["b"]);
  assert.deepEqual(c.loadOneTime(applyOp(d, { type: "deleteOneTime", id: "zzz" })).map((x) => x.id), ["b"]);
});
