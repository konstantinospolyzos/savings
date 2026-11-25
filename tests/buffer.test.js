// The buffer you want in the bank: an amount set once in Settings, or some months of fixed costs; and the day a month
// was logged (payday, then again on the 1st after the bills). js/core.js, js/store.js. Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../js/core.js";
import { normalize } from "../js/store.js";

const entry = (month, bank, o = {}) => ({ month, income_sek: 40034, bank_sek: bank, invested_eur: 455, sek_to_eur: 0.0907,
  added_eur: null, comment: "", trip: null, ...o });
const cost = (id, name, amount) => ({ id, name, amount, per: "month", category: "Home", active: true, end_month: null, position: id, currency: "SEK" });
const today = c.day(2026, 11, 25);
const make = (settings = {}, bank = 7500) => ({ entries: [entry("2026-10", 10000), entry("2026-11", bank)], expenses: [cost(1, "Rent", 18282)],
  goals: [], cars: [], settings: { log_months: "end", profile_maxes: { light: 850, balanced: 700, high: 500 }, keep_saving: 0.25, ...settings } });
const at = (data) => { c.configure(data); return c.budgetSnapshot(data, today); };

test.afterEach(() => c.configure({ settings: {} }));

test("a buffer you set as an amount: until the bank reaches it, what you save goes to the bank and nothing is invested", () => {
  const s = at(make({ buffer_amount: 30000 }));
  assert.deepEqual([s.salary, s.fixed, s.left, s.bank, s.target, s.shortfall, s.buffer_amount], [40034, 18282, 21752, 7500, 30000, 22500, 30000]);
  assert.deepEqual([s.living, s.future, s.to_buffer, s.to_savings, s.invest], [2800, 18952, 18952, 0, 0]);
  assert.equal(c.bufferTargetText(s), `Target ${c.fmtSek(30000)}`);
  // nearly full: the buffer takes what it needs, then a quarter stays in savings and the rest is invested
  const near = at(make({ buffer_amount: 30000 }, 26452));
  assert.deepEqual([near.shortfall, near.to_buffer, near.to_savings, near.invest], [3548, 3548, 3850, 11554]);
  // full: invest
  const full = at(make({ buffer_amount: 30000 }, 31000));
  assert.deepEqual([full.shortfall, full.to_buffer, full.to_savings, full.invest], [0, 0, 4740, 14212]);
});

test("without an amount it's months of fixed costs, as before; a bad setting is ignored", () => {
  const s = at(make());
  assert.deepEqual([s.target, s.buffer_amount, s.buffer_months], [3 * 18282, null, 3]);
  assert.equal(c.bufferTargetText(s), "Target 3 months");
  for (const bad of [-5, "30000", null, Number.NaN]) assert.equal(at(make({ buffer_amount: bad })).buffer_amount, null);
  assert.equal(c.loadBufferAmount(make({ buffer_amount: 0 })), 0);
});

test("a month keeps the day it was logged", () => {
  const d = normalize({ entries: [entry("2026-11", 7500, { logged: "2026-11-25" }), entry("2026-10", 10000, { logged: "25 Nov" }), entry("2026-09", 9000)] });
  assert.deepEqual(d.entries.map((e) => e.logged ?? null), [null, null, "2026-11-25"]);
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(d))).entries, d.entries);
});

test("from the 1st, with the plan running, the bank grows with the plan: not a change to the budget", () => {
  const data = make({ buffer_amount: 30000 });
  const payday = at(data);
  const saved = c.budgetToSave(payday, today);
  assert.deepEqual([saved.bank, saved.shortfall], [7500, 22500]);
  const plan = { profile: "balanced", living: 2800, to_buffer: 18952, to_savings: 0, invest: 0, goals: 0, bank: 7500, target: 30000 };
  const withPlan = (bank, when) => {
    const d = make({ buffer_amount: 30000, period_budgets: { "2026-11": saved }, period_plans: { "2026-11": plan } }, bank);
    c.configure(d);
    return c.budgetSnapshot(d, when, c.mIndex("2026-11") - c.mIndex(c.defaultPeriodMonth(when)));
  };
  // payday numbers typed again before the 1st: the budget changed, save it again
  const again = withPlan(9000, today);
  assert.equal(c.bankSettled(again), false);
  assert.deepEqual(c.budgetChanges(saved, again), ["the buffer"]);
  // the 1st: November logged after the bills, with the money moved; nothing to save again
  const first = withPlan(26452, c.day(2026, 12, 1));
  assert.equal(first.base, "2026-11");
  assert.equal(c.bankSettled(first), true);
  assert.deepEqual(c.budgetChanges(saved, first), []);
  // saving again then keeps the bank the plan started from, so nothing is counted twice
  const resaved = c.budgetToSave(first, c.day(2026, 12, 3));
  assert.deepEqual([resaved.bank, resaved.shortfall], [7500, 22500]);
  // a new buffer target is still a change
  const moved = withPlan(26452, c.day(2026, 12, 1));
  assert.deepEqual(c.budgetChanges(saved, { ...moved, target: 40000 }), ["the buffer"]);
  // without a plan the bank counts, as before
  assert.deepEqual(c.budgetChanges(saved, { ...first, plan: null }), ["the buffer"]);
});
