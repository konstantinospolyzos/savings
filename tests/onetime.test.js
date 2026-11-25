// One-time expenses: paid from what you already have, so they never change a budget or a plan. They lower what you
// save in the month you bought them, and History lists them with that month (js/core.js, js/store.js). Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../js/core.js";
import { normalize, applyOp } from "../js/store.js";

const entry = (month, o = {}) => ({ month, income_sek: 40000, bank_sek: 200000, invested_eur: 10000,
  sek_to_eur: 0.09, added_eur: null, comment: "", trip: null, ...o });
const rent = { id: 1, name: "Rent", amount: 20000, per: "month", category: "Home", active: true, end_month: null, position: 0, currency: "SEK" };
const today = c.day(2026, 11, 14);
const bought = [
  { id: "b", date: "2026-11-14", name: "8 flights pass", amount: 6000 },
  { id: "a", date: "2026-11-14", name: " Air fryer ", amount: 1200 },
  { id: "c", date: "2026-11-27", name: "Winter coat", amount: 1500 },          // after the 25 Nov payday, still November
  { id: "d", date: "2026-10-28", name: "Bike service", amount: 800 },
  { id: "e", date: "2026-09-30", name: "Concert", amount: 650 },
];
const dataWith = (settings = {}, bank = 200000) => ({ entries: [entry("2026-10", { bank_sek: bank })], expenses: [rent], goals: [], cars: [],
  settings: { keep_saving: 0.25, ...settings } });
const NUMBERS = ["salary", "fixed", "left", "free", "future", "living", "to_buffer", "to_savings", "invest", "save_rate", "shortfall"];
const numbers = (s) => Object.fromEntries(NUMBERS.map((k) => [k, s[k]]));

test.beforeEach(() => c.configure({ settings: {} }));

test("one-time expenses don't change the budget or the plan of any pay period", () => {
  const plain = dataWith(), withOnce = dataWith({ one_time: bought });
  for (const offset of [-1, 0, 1]) {
    const a = c.budgetSnapshot(plain, today, offset), b = c.budgetSnapshot(withOnce, today, offset);
    assert.deepEqual(numbers(b), numbers(a));
    assert.equal(b.oneoff, undefined);
    assert.deepEqual(c.budgetChanges(c.budgetToSave(a, today), b), []);
    assert.ok(!("oneoff" in c.budgetToSave(b, today)));
  }
  const now = c.budgetSnapshot(withOnce, today);
  // Balanced: 700 a week for the 33 days of 23 Oct – 24 Nov, the rest to your future
  assert.deepEqual([now.left, now.future, now.living, now.to_savings, now.invest], [20000, 16700, 3300, 4180, 12520]);
});

test("they're kept with the day you bought them, oldest first", () => {
  const bad = [{ id: "x", date: "14 Nov", name: "Bad date", amount: 5 }, { id: "y", date: "2026-11-15", name: "", amount: 5 },
    { id: 7, date: "2026-11-15", name: "No text id", amount: 5 }, { id: "z", date: "2026-11-15", name: "Text amount", amount: "12" }, null];
  const list = c.loadOneTime(dataWith({ one_time: [...bought, ...bad] }));
  assert.deepEqual(list.map((x) => [x.id, x.name]), [["e", "Concert"], ["d", "Bike service"], ["a", "Air fryer"], ["b", "8 flights pass"], ["c", "Winter coat"]]);
  assert.deepEqual(c.loadOneTime({ settings: { one_time: "nope" } }), []);
});

test("each shows with the logged month whose savings it lowers", () => {
  const data = dataWith({ one_time: bought });
  // logs that mean the end of the month: a November purchase is in End of November
  assert.equal(c.logMonthOf("2026-11-14", true), "2026-11");
  assert.equal(c.logMonthOf("2026-12-31", true), "2026-12");
  const end = c.oneTimeByLog(data, true);
  assert.deepEqual([...end.keys()], ["2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(end.get("2026-11").map((x) => x.id), ["a", "b", "c"]);
  // logs still named after the month after (your money on the 1st): November's purchases are in the December log
  assert.equal(c.logMonthOf("2026-11-14", false), "2026-12");
  assert.equal(c.logMonthOf("2026-12-31", false), "2027-01");
  assert.deepEqual(c.oneTimeByLog(data, false).get("2026-12").map((x) => x.id), ["a", "b", "c"]);
  // the Budget tab lists the months a pay period touches: 23 Oct – 24 Nov is October and November
  const now = c.budgetSnapshot(data, today), next = c.budgetSnapshot(data, today, 1);
  assert.deepEqual(c.oneTimeMonths(data, now.start, now.end).map(([m, l]) => [m, l.map((x) => x.id)]), [["2026-10", ["d"]], ["2026-11", ["a", "b", "c"]]]);
  assert.deepEqual(c.oneTimeMonths(data, next.start, next.end).map(([m, l]) => [m, l.map((x) => x.id)]), [["2026-11", ["a", "b", "c"]]]);
  assert.deepEqual(c.oneTimeMonths(dataWith(), now.start, now.end), []);
});

test("a budget and plan saved while they still came out of them read as they would without", () => {
  for (const [bank, toBuffer, toSavings, invest] of [[200000, 0, 4180, 12520], [40000, 16700, 0, 0]]) {
    const clean = dataWith({ one_time: bought }, bank);
    const snap = c.budgetSnapshot(clean, today);
    const saved = c.budgetToSave(snap, today);
    const P = { profile: "balanced", week: 700, salary: 40000, fixed: 20000, goals: 0,
      living: snap.living, to_buffer: toBuffer, to_savings: toSavings, invest, future: 16700, save_rate: 0.4175, days: snap.days,
      started: "2026-10-23", done: { save: true, invest: false }, checks: [] };
    assert.deepEqual([snap.future, snap.to_buffer, snap.to_savings, snap.invest], [16700, toBuffer, toSavings, invest]);
    // what the version of 14 Nov stored: 7 200 kr of one-time expenses taken off Save and Invest
    const taken = (p, oneoff, over, future) => {
      const buf = Math.min(future, bank < 60000 ? 20000 : 0), sav = future - buf > 0 ? Math.round((future - buf) * 0.25 / 10) * 10 : 0;
      return { ...p, future, to_buffer: buf, to_savings: sav, invest: future - buf - sav, save_rate: future / 40000, oneoff, oneoff_over: over };
    };
    for (const old of [taken(P, 7200, 0, 9500), taken(P, 18700, 2000, 0)]) {
      const data = dataWith({ one_time: bought, period_budgets: { "2026-10": { ...saved, left: saved.left - old.oneoff, free: saved.free - old.oneoff, oneoff: old.oneoff } },
        period_plans: { "2026-10": old } }, bank);
      assert.deepEqual(c.loadBudgets(data)["2026-10"], saved);
      assert.deepEqual(c.loadPlans(data)["2026-10"], P);
      assert.deepEqual(c.budgetChanges(c.loadBudgets(data)["2026-10"], c.budgetSnapshot(data, today)), []);
      assert.deepEqual(c.budgetSnapshot(data, today).plan, P);
    }
  }
  // saved with nothing taken off: only the empty field goes
  const plain = { salary: 40000, left: 20000, free: 20000, oneoff: 0 }, plan = { future: 8000, invest: 6000 };
  const data = { settings: { period_budgets: { a: plain, b: { left: 1 } }, period_plans: { a: { ...plan, oneoff: 0, oneoff_over: 0 }, b: plan } } };
  assert.deepEqual(c.loadBudgets(data), { a: { salary: 40000, left: 20000, free: 20000 }, b: { left: 1 } });
  assert.deepEqual(c.loadPlans(data), { a: plan, b: plan });
  assert.equal(c.loadPlans(data).b, plan);
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
