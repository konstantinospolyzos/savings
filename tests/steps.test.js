// The steps on Home you untick to do again, or tick by hand, by pay period (period_steps). js/core.js. Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../js/core.js";

test("a step you untick stays unticked until you do it again; one you tick by hand stays ticked", () => {
  assert.deepEqual(c.loadSteps({ settings: {} }), {});
  let all = c.withStep({}, "2026-11", "log", "redo");
  all = c.withStep(all, "2026-11", "costs", "done");
  assert.deepEqual(c.loadSteps({ settings: { period_steps: all } }), { "2026-11": { log: "redo", costs: "done" } });
  // done again: forgotten, and an empty pay period goes too
  all = c.withStep(c.withStep(all, "2026-11", "log", null), "2026-11", "costs", null);
  assert.deepEqual(all, {});
  // the last two years only
  let many = {};
  for (let k = 0; k < 30; k++) many = c.withStep(many, c.addMonths("2024-01", k), "plan", "redo");
  assert.deepEqual(Object.keys(many).length, 24);
  assert.equal(Object.keys(many).sort()[0], "2024-07");
});

test("what doesn't look like a step is ignored", () => {
  const bad = { "2026-11": { log: "redo", Plan: "redo", costs: "yes", budget: true }, "nov": { log: "redo" }, "2026-12": ["redo"], "2027-01": {} };
  assert.deepEqual(c.loadSteps({ settings: { period_steps: bad } }), { "2026-11": { log: "redo" } });
  for (const v of [null, "x", [1], 5]) assert.deepEqual(c.loadSteps({ settings: { period_steps: v } }), {});
});

test("the pay period a log belongs to", () => {
  assert.equal(c.logPeriod("2026-11", true), "2026-11");       // End of November: November's payday
  assert.equal(c.logPeriod("2026-12", false), "2026-11");      // December, while logs carry the month after
  assert.equal(c.salaryLogMonth(c.logPeriod("2027-01", false), false), "2027-01");
});
