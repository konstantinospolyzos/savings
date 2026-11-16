// The salary of each pay period: typed for it as soon as you know it, its log, or the latest log (js/core.js).
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../js/core.js";

const entry = (month, income, o = {}) => ({ month, income_sek: income, bank_sek: 200000, invested_eur: 10000,
  sek_to_eur: 0.09, added_eur: null, comment: "", trip: null, ...o });
const rent = { id: 1, name: "Rent", amount: 20000, per: "month", category: "Home", active: true, end_month: null, position: 0, currency: "SEK" };
const today = c.day(2026, 11, 16);          // the pay period 23 Oct – 24 Nov runs; the next payday is 25 Nov
const make = (settings = {}, entries = [entry("2026-09", 37000), entry("2026-10", 38000)]) =>
  ({ entries, expenses: [rent], goals: [], cars: [], settings: { log_months: "end", ...settings } });
const at = (data, offset = 0) => { c.configure(data); return c.budgetSnapshot(data, today, offset); };

test.afterEach(() => c.configure({ settings: {} }));

test("a salary typed for the coming pay period counts for that pay period only", () => {
  const data = make({ period_salaries: { "2026-11": 39500 } });
  const now = at(data), next = at(data, 1), past = at(data, -1);
  assert.deepEqual([now.base, now.salary, now.salary_src, now.salary_log.month], ["2026-10", 38000, "log", "2026-10"]);
  assert.deepEqual([next.base, next.salary, next.salary_src, next.salary_log], ["2026-11", 39500, "period", null]);
  assert.deepEqual([past.base, past.salary, past.salary_src], ["2026-09", 37000, "log"]);
  assert.equal(next.left, 39500 - 20000);
  // nothing typed: the next pay period starts from the latest log
  const plain = make();
  assert.deepEqual([at(plain, 1).salary, at(plain, 1).salary_src, at(plain, 1).salary_log.month], [38000, "latest", "2026-10"]);
  assert.deepEqual([at(plain).salary, at(plain).salary_src], [38000, "log"]);
  // a saved budget of the running pay period doesn't change with it
  c.configure(plain);
  const saved = c.budgetToSave(at(plain), today);
  assert.deepEqual(c.budgetChanges(saved, at(data)), []);
  assert.deepEqual(c.budgetChanges(c.budgetToSave(at(plain, 1), today), at(data, 1)), ["the salary"]);
});

test("the log of a pay period is End of the month of its payday, or the month after with the old names", () => {
  assert.equal(c.salaryLogMonth("2026-11", true), "2026-11");
  assert.equal(c.salaryLogMonth("2026-11", false), "2026-12");
  assert.equal(c.salaryLogMonth("2026-12", false), "2027-01");
  // old names: the 23 Oct salary is in the log called November
  const data = make({ log_months: null }, [entry("2026-10", 37000), entry("2026-11", 38000)]);
  const now = at(data), past = at(data, -1);
  assert.deepEqual([now.salary, now.salary_log.month, past.salary, past.salary_log.month], [38000, "2026-11", 37000, "2026-10"]);
});

test("your own figure from before still goes first, and only typed months are kept", () => {
  const data = make({ budget_salary: 36000, period_salaries: { "2026-11": 39500, "2026-13": 1, bad: 2, "2026-12": -5, "2027-01": "40000" } });
  assert.deepEqual(c.loadPeriodSalaries(data), { "2026-11": 39500 });
  assert.deepEqual(c.loadPeriodSalaries(make({ period_salaries: [1, 2] })), {});
  assert.deepEqual([at(data).salary, at(data).salary_src, at(data).salary_kept], [36000, "kept", true]);
  assert.deepEqual([at(data, 1).salary, at(data, 1).salary_src, at(data, 1).salary_kept], [39500, "period", false]);
  // what it would be without the typed one (the Budget page forgets a typed salary that's the same)
  assert.deepEqual(c.salaryFor(data, "2026-11", { typed: false }), { salary: 36000, src: "kept", entry: null });
  c.configure(make());
  assert.equal(c.salaryFor(make(), "2026-11", { typed: false }).src, "latest");
  assert.deepEqual(c.salaryFor({ entries: [], settings: {} }, "2026-11"), { salary: 0, src: "none", entry: null });
  // a salary given to the snapshot (the draft) still wins
  c.configure(data);
  const own = c.budgetSnapshot(data, today, 1, 41000);
  assert.deepEqual([own.salary, own.salary_src, own.salary_kept], [41000, "override", false]);
});
