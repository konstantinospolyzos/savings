// Home: the first tab of the savings section. Your money, the living money you should have left today (with a
// check-in), the steps that are due (payday, the 1st, the days before payday), how you're spending, where this
// pay period's salary goes, and your one-time expenses. The plan in detail is a page of its own (Plan details).
import { h, chip, dot, splitBar, toast, icon, s, sheet, group, caption, footer } from "../ui.js";
import {
  COLORS, CUR, MONTHS, fmtSek, fmtEur, fmtRange, shortDate, longDate, dayMonth, addDays, addMonths, daysBetween, isoDay, logName,
  plural, joinAnd, parseNumber, plainNumber, roundTo10, planProgress, planCheck, loadBudgets, budgetChanges, bankEur, investedSek,
  summarize, monthFlows, salaryLogMonth, fmtAxisSek, loadSteps, loadPeriodSalaries, expenseApplies, brokersText, localSym, hasMoney,
} from "../core.js";
import { store } from "../store.js";
import { openMonthSheet } from "./month.js";
import { oneTimeCard } from "./onetime.js";
import { emptyState } from "./overview.js";
import { periodSnapshot, paydayMoves, revolutPockets, pocketsList, saveOf, setPlan, profileName, startSwitching, budgetFor, planChanges } from "./plan.js";
import { showPeriod, setPeriodSalary, nextPaydayChanges } from "./budget.js";
import { setStep } from "./steps.js";

const FIXED_C = "var(--gray3)", LIVING_C = COLORS.purple, BANK_C = COLORS.blue, INVEST_C = COLORS.orange;
const card = (cls, ...children) => h("div", { class: `card ${cls}` }, children);
const head = (title, sub = null, right = null) => h("div", { class: "card-head" },
  h("div", { class: "card-head-text" }, h("div", { class: "card-title" }, title),
    sub ? h("div", { class: `card-sub ${typeof sub === "string" && hasMoney(sub) ? "amt-soft" : ""}` }, sub) : null), right);
const asDay = (iso) => new Date(`${iso}T12:00:00`);
const firstOf = (month) => asDay(`${month}-01`);
const money = (v) => fmtSek(roundTo10(v));
const monthName = (month) => MONTHS[Number(month.slice(5, 7)) - 1];
const kept = (P) => P.to_savings || 0;
const syncNow = () => { if (store.mode === "drive" && !store.drive.tokenValid()) store.syncFromTap(); };

/** The dates of a pay period that steps hang on: payday, the 1st after it (the bills), the 15th (next salary known). */
function periodDays(live) {
  const after = addMonths(live.base, 1);
  return { first: firstOf(after), fifteenth: asDay(`${after}-15`), log: salaryLogMonth(live.base) };
}

/** Is a log the numbers of payday (made before the 1st), not the month after the bills? */
const paydayNumbers = (entry, first) => Boolean(entry?.logged) && entry.logged < isoDay(first);

// ---------------------------------------------------------------------------
// Your money: bank and invested, as in your latest log
// ---------------------------------------------------------------------------
function moneyCard(ctx, live, days) {
  const es = ctx.entries, last = es.at(-1);
  const ours = last.month === days.log && paydayNumbers(last, days.first);
  // what you save a month, from your logs: payday numbers (the bank before this month's saving) aren't a month yet
  const summ = summarize(monthFlows(ours ? es.slice(0, -1) : es).slice(-12));
  const half = (title, color, value, sub, extra = null) => h("div", { class: "money-half" },
    h("div", { class: "cap-row" }, dot(color, 8), h("span", { class: "caption" }, title)),
    h("div", { class: "money-value amt" }, value),
    sub ? h("div", { class: "money-sub amt" }, sub) : null, extra);
  const buffer = live.target > 0
    ? chip(live.shortfall > 0 ? `Buffer: ${fmtSek(live.shortfall)} to go` : "✓ Buffer full", live.shortfall > 0 ? "flat" : "up", "amt") : null;
  const src = ours ? (live.today >= days.first ? "Your payday numbers: log the month to update them" : "Your payday numbers, the bank without the salary")
    : `From your ${logName(last.month)} log`;
  return card("home-money",
    h("div", { class: "money-grid" },
      half("BANK SAVINGS", BANK_C, CUR.single ? fmtSek(last.bank_sek) : fmtEur(bankEur(last)), CUR.single ? null : fmtSek(last.bank_sek), buffer),
      half("INVESTED", INVEST_C, fmtEur(last.invested_eur), CUR.single ? null : `≈ ${fmtSek(investedSek(last))}`)),
    h("div", { class: "money-foot hint amt-soft" }, src + (summ && summ.n >= 2 ? `  ·  you save ≈ ${money(summ.saved)} a month` : "")));
}

// ---------------------------------------------------------------------------
// Living money: what you should have left today, and a check-in against it
// ---------------------------------------------------------------------------
function checkResult(P, live, last) {
  const today = live.today;
  const r = planCheck(P, live.start, live.end, last);
  const when = last.date === isoDay(today) ? "checked today" : `checked ${shortDate(asDay(last.date))}`;
  const diff = Math.abs(r.diff) < 10 ? `Just what the plan has for the ${plural(r.days_left, "day")} to payday.`
    : `${money(Math.abs(r.diff))} ${r.diff > 0 ? "more" : "less"} than the plan has for the ${r.days_left === 1 ? "last day" : `last ${r.days_left} days`}.`;
  const age = daysBetween(asDay(last.date), today);
  return h("div", { class: "check-result" },
    h("div", { class: "cap-row" }, chip(r.status, r.tone), h("span", { class: "hint amt-soft" }, `${fmtSek(last.left)} left, ${when}`)),
    h("div", { class: "check-line amt-soft" }, `${diff} To make it last: ≈ ${money(r.per_day_now)} a day.`),
    age >= 3 ? h("div", { class: "hint" }, `That was ${plural(age, "day")} ago: check again to keep this right.`) : null);
}

function livingCard(ctx, live, saved) {
  const P = live.plan;
  if (!P) {
    return card("home-living",
      h("div", { class: "cap-row" }, dot(LIVING_C, 8), h("span", { class: "caption" }, "LIVING MONEY"),
        h("span", { class: "hint" }, fmtRange(live.start, addDays(live.end, -1)))),
      h("div", { class: "muted living-empty" }, "No plan this pay period yet. Pick one and this shows what you should have left each day, with a check-in."),
      h("div", { class: "card-actions" }, saved
        ? h("button", { type: "button", class: "btn primary small", onclick: () => ctx.go("plan") }, "Pick this month's plan")
        : h("button", { type: "button", class: "btn primary small", onclick: () => { showPeriod(live.base, ctx.today); ctx.go("budget"); } }, "Save the budget first")));
  }
  const today = live.today;
  const pr = planProgress(P, live.start, live.end, today);
  const toPayday = daysBetween(today, live.end);
  const checks = (P.checks || []).filter((c) => c.date >= isoDay(live.start) && c.date <= isoDay(today));
  const last = checks.at(-1) || null;
  const input = h("input", { class: "check-input amt", type: "text", inputmode: "decimal", autocomplete: "off",
    placeholder: plainNumber(roundTo10(pr.expected)), "aria-label": "What's in your spending account now" });
  const check = () => {
    const v = parseNumber(input.value);
    if (v === null || v < 0) { input.classList.add("invalid"); return; }
    const list = [...(P.checks || []).filter((c) => c.date !== isoDay(today)), { date: isoDay(today), left: Math.round(v) }].slice(-40);
    const r = planCheck(P, live.start, live.end, { date: isoDay(today), left: v });
    setPlan(live.base, { ...P, checks: list });
    toast(`${r.status}: ≈ ${money(r.per_day_now)} a day to payday`);
    syncNow();
  };
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); check(); } });
  input.addEventListener("input", () => input.classList.remove("invalid"));
  return card("home-living",
    h("div", { class: "cap-row" }, dot(LIVING_C, 8), h("span", { class: "caption" }, "LIVING MONEY"),
      h("span", { class: "hint" }, fmtRange(live.start, addDays(live.end, -1))),
      h("span", { class: "plan-day" }, chip(`Day ${pr.day} of ${pr.days}`, "info"))),
    h("div", { class: "living-label" }, "You should have left today"),
    h("div", { class: "big-value amt" }, money(pr.expected)),
    h("div", { class: "muted amt-soft" }, `to stay on track  ·  ≈ ${money(pr.per_day)} a day`),
    h("div", { class: "plan-progress" }, splitBar([[pr.day, LIVING_C], [pr.days - pr.day, "var(--fill)"]], 8)),
    h("div", { class: "plan-progress-labels" }, h("span", null, `Payday ${dayMonth(live.start)}`),
      h("span", null, toPayday === 1 ? `Payday tomorrow, ${dayMonth(live.end)}` : `${toPayday} days to payday, ${dayMonth(live.end)}`)),
    last ? checkResult(P, live, last) : null,
    h("div", { class: "check-row" }, h("span", { class: "check-label" }, "What's in your spending account now?"),
      h("span", { class: "check-field" }, input, h("span", { class: "check-unit" }, localSym()),
        h("button", { type: "button", class: "btn tinted small", onclick: check }, "Check"))),
    h("div", { class: "card-actions" },
      h("button", { type: "button", class: "btn tinted small", onclick: () => { startSwitching(false); ctx.go("plan"); } }, "Plan details"),
      h("button", { type: "button", class: "btn plain small", onclick: () => { startSwitching(); ctx.go("plan"); } }, "Switch plan")));
}

// ---------------------------------------------------------------------------
// Steps: payday, the 1st, before payday
// ---------------------------------------------------------------------------
/*
 * A step of a checklist: a circle with its number, ticked when it's done, then what to do. Tap the circle to tick
 * or untick it. Some steps tick themselves (your numbers logged, the budget saved, the plan picked): untick one and
 * it stays unticked until you do it again (the row takes you there), or tap the circle again. A move of money (to
 * Revolut, the bank, investing) you tick yourself, with the circle or the row. A step: {key, title, sub, done, n,
 * mark (tap the circle), go (tap the row), money (the row ticks), muted (not this time), below (shown under it)}.
 */
function stepRow(step, k, next) {
  const cls = `step-mark ${step.done ? "done" : step.muted ? "muted" : k === next ? "next" : ""}`;
  const inner = step.done ? icon("check", 15) : step.muted ? "–" : String(step.n);
  const mark = step.mark
    ? h("button", { type: "button", class: `${cls} tappable`, "aria-pressed": String(Boolean(step.done)),
      "aria-label": step.done ? `Untick: ${step.title}` : `Tick: ${step.title}`, onclick: (ev) => { ev.stopPropagation(); step.mark(); } }, inner)
    : h("span", { class: cls, "aria-label": step.done ? "Done" : null }, inner);
  const go = step.go || null;
  const main = h("div", { class: "row-main" }, h("div", { class: "row-title amt-soft" }, step.title), step.sub ? h("div", { class: "row-sub amt-soft" }, step.sub) : null);
  return h("div", { class: `list-row step-row ${step.done ? "done" : ""} ${step.muted ? "muted" : ""} ${go ? "" : "static"}`, role: go ? "button" : null,
    tabindex: go ? "0" : null, onclick: go, onkeydown: go ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); } } : null },
  mark, main, go && !step.money ? icon("chevron", 15, "chev") : null);
}

function checklist(cls, title, sub, steps, extra = [], right = null) {
  const counted = steps.filter((st) => !st.muted);
  let n = 0;
  for (const st of steps) if (!st.muted) st.n = ++n;
  const nDone = counted.filter((st) => st.done).length;
  const next = steps.findIndex((st) => !st.done && !st.muted);
  return card(`home-steps ${cls}`, head(title, sub, right || (counted.length ? chip(`${nDone} of ${counted.length}`, nDone ? "info" : "flat") : null)),
    h("div", { class: "list" }, steps.flatMap((st, k) => [stepRow(st, k, next), st.below || null])), ...extra);
}

/** A step that ticks itself: done when it's done, unless you unticked it to do it again. */
function autoStep(base, redo, key, isDone, step) {
  const again = redo[key] === "redo";
  const done = isDone && !again;
  return { key, ...step, done, again: isDone && again,
    mark: done ? () => { setStep(base, key, "redo"); toast(`Unticked: ${step.title}`); syncNow(); }
      : isDone ? () => { setStep(base, key, null); syncNow(); } : null };
}

/** A move of money you tick yourself (kept with the plan, like Plan details' switches). */
function moneyStep(live, key, step) {
  const P = live.plan, on = Boolean(P?.done?.[key]);
  const flip = P ? () => tickPlan(live, key)(!on) : null;
  return { key, ...step, done: on, mark: flip, go: flip, money: true };
}

const tickPlan = (live, key) => (on) => {
  const P = live.plan;
  setPlan(live.base, { ...P, done: { ...(P.done || {}), [key]: on } });
  syncNow();
};

/** The checklists you finished, opened again to see their steps (until the app reloads). */
const opened = new Set();
const doneCard = (ctx, id, title, sub) => card("home-steps home-done", head(title, sub,
  h("button", { type: "button", class: "btn tinted small", onclick: () => { opened.add(id); ctx.refresh(); } }, "Steps")));
const hideLink = (ctx, id) => h("div", { class: "steps-hide" },
  h("button", { type: "button", class: "link-btn", onclick: () => { opened.delete(id); ctx.refresh(); } }, "Hide the steps"));

/** The 1st after the bills: what to move to the bank, and to invest. */
const firstLine = (P, first, logMonth) => `Then on ${shortDate(first)}, after the bills: move ${fmtSek(saveOf(P))} to the bank`
  + `${P.invest > 0 ? ` and invest ${fmtSek(P.invest)}` : ""}, and log ${monthName(logMonth)}.`;

/** Payday: your numbers, the budget, the plan, and the money to Revolut. */
function paydaySteps(ctx, live, saved, changes, days) {
  const P = live.plan;
  const redo = loadSteps(ctx.data)[live.base] || {};
  const entry = ctx.entries.find((e) => e.month === days.log) || null;
  const rv = P ? revolutPockets(live) : null;
  const pockets = live.active.filter((x) => x.pocket && !x.car);
  // the fixed costs with a new amount this payday (an invoice that came in), or starting now
  const fresh = live.expenses.filter((x) => !x.car && expenseApplies(x, live.base) && (x.start_month === live.base || x.amount_before !== null)).map((x) => x.name);
  const freshText = !fresh.length ? "" : ` (new: ${fresh.length > 3 ? `${fresh.slice(0, 2).join(", ")} and ${fresh.length - 2} more` : joinAnd(fresh)})`;
  const opts = { when: "payday" };
  // numbers typed again after the plan was picked (the bank, a cost): the plan offers an update
  const upd = P && saved && !changes.length ? planChanges(P, budgetFor(ctx, live.base, saved, live.start, live.end)) : null;
  const revolutTitle = pockets.length ? "Move money to Revolut" : "Move the living money to your spending account";
  const log = autoStep(live.base, redo, "log", Boolean(entry), { title: "Your numbers today",
    go: () => (entry ? openMonthSheet(ctx, entry, null, opts) : openMonthSheet(ctx, null, days.log, opts)) });
  log.sub = !entry ? "The salary that came in, your bank without it, and what you have invested"
    : `${log.again ? "Log them again: " : ""}Salary ${fmtSek(entry.income_sek)}  ·  bank ${fmtSek(entry.bank_sek)}  ·  invested ${fmtSek(investedSek(entry))}`;
  const budget = autoStep(live.base, redo, "budget", Boolean(saved) && !changes.length,
    { title: saved && changes.length ? "Save the budget again" : "Check salary and fixed costs", go: () => { showPeriod(live.base, ctx.today); ctx.go("budget"); } });
  budget.sub = !saved ? (live.salary > 0 ? `Salary ${fmtSek(live.salary)}, fixed costs ${fmtSek(live.fixed)}${freshText}: then save the budget` : "Enter the salary on the Budget tab, then save the budget")
    : changes.length ? `It changed since you saved it: ${joinAnd(changes)}`
      : budget.again ? `Check them on the Budget tab and save the budget again (${fmtSek(saved.left)} left after fixed costs)`
        : `${fmtSek(saved.left)} left after fixed costs`;
  const plan = upd?.changed ? { key: "plan", done: false, title: "Update the plan",
    sub: `Things changed since you picked ${profileName(P.profile)}${upd.why.length ? ` (${joinAnd(upd.why)})` : ""}: update it to use the new numbers`,
    go: () => { startSwitching(false); ctx.go("plan"); document.querySelector("[data-page='plan'] .plan-details")?.scrollIntoView({ behavior: "smooth", block: "start" }); } }
    : autoStep(live.base, redo, "plan", Boolean(P), { title: "Pick this month's plan",
      // unticked: Plan details opens with the plans, to pick one again (or keep yours)
      go: P || saved ? () => { startSwitching(Boolean(P) && redo.plan === "redo"); ctx.go("plan"); } : null });
  if (!upd?.changed) {
    plan.sub = !P ? (saved ? "Three plans, worked out from the budget you saved" : "Once the budget is saved")
      : `${plan.again ? "Pick it again: " : ""}${profileName(P.profile)}, ≈ ${money(P.living / (live.days / 7))} a week to live on`;
  }
  const revolut = moneyStep(live, "revolut", { title: revolutTitle,
    sub: !P ? (pockets.length ? `The living money and ${pockets.length === 1 ? `the ${pockets[0].name} pocket` : `${pockets.length} pockets`}, once the plan is picked` : "Once the plan is picked")
      : rv ? `${fmtSek(rv.total)}: living money ${fmtSek(rv.living)} + ${rv.costs.length === 1 ? rv.costs[0][0] : "pockets"} ${fmtSek(rv.costs_total)}`
        : `${fmtSek(P.living)}: what you live on until payday` });
  if (P && rv && !revolut.done) revolut.below = pocketsList(rv);
  return [log, budget, plan, revolut];
}

function paydayCard(ctx, live, saved, changes, days) {
  const steps = paydaySteps(ctx, live, saved, changes, days);
  const P = live.plan;
  const id = `payday-${live.base}`;
  const isToday = isoDay(live.start) === isoDay(ctx.today);
  const left = steps.filter((st) => !st.done);
  const then = P ? firstLine(P, days.first, days.log) : null;
  if (!left.length) {
    // all set: what's next is the 1st (Steps shows them, to untick one)
    if (!opened.has(id)) return doneCard(ctx, id, "✓ Payday is done", then);
    return checklist("home-payday", "Payday checklist", "All done. Tap a tick to untick a step and do it again.", steps,
      [then ? h("div", { class: "steps-then hint amt-soft" }, then) : null, hideLink(ctx, id)]);
  }
  const when = isToday ? "It's payday" : `Payday was ${shortDate(live.start)}`;
  const sub = left.length === 1 && left[0].key === "revolut" ? `${left[0].title} and today is done.`
    : `${when}: ${["", "one step", "two steps", "three steps", "four steps"][left.length] || plural(left.length, "step")} and this pay period is set.`;
  return checklist("home-payday", "Payday checklist", sub, steps, then ? [h("div", { class: "steps-then hint amt-soft" }, then)] : []);
}

/** The 1st, after the bills: the bank, investing, and the month's log. */
function firstCard(ctx, live, days) {
  const P = live.plan;
  const redo = loadSteps(ctx.data)[live.base] || {};
  const id = `first-${live.base}`;
  const entry = ctx.entries.find((e) => e.month === days.log) || null;
  const logged = Boolean(entry) && !paydayNumbers(entry, days.first) && Boolean(entry.logged);
  const toBank = saveOf(P);
  const bank = typeof P.bank === "number" ? P.bank : live.bank, target = typeof P.target === "number" ? P.target : live.target;
  const short = Math.max(target - bank, 0);
  const into = [P.goals > 0 ? `goals ${fmtSek(P.goals)}` : null, P.to_buffer > 0 ? `buffer ${fmtSek(P.to_buffer)}` : null,
    kept(P) > 0 ? `savings ${fmtSek(kept(P))}` : null].filter(Boolean);
  const broker = brokersText("your investment account");
  const log = autoStep(live.base, redo, "month_log", logged, { title: `Log ${monthName(days.log)} after the bills`,
    go: () => openMonthSheet(ctx, entry, entry ? null : days.log, { when: "month_end" }) });
  log.sub = logged ? `${log.again ? "Log it again: it was " : "Logged "}${shortDate(asDay(entry.logged))}, bank ${fmtSek(entry.bank_sek)}`
    : "Bank and invested as they are now. It replaces your payday numbers.";
  const steps = [
    toBank > 0 ? moneyStep(live, "save", { title: `Move ${fmtSek(toBank)} to the bank`,
      sub: P.to_buffer > 0 && into.length === 1 ? `Your saving this pay period. All of it goes to the buffer: ${fmtSek(short)} to go.`
        : `Your saving this pay period: ${joinAnd(into)}.` }) : null,
    P.invest > 0 ? moneyStep(live, "invest", { title: `Invest ${fmtSek(P.invest)} on ${broker}`, sub: "Long-term money: 5+ years." })
      : { key: "invest", muted: true, title: `Invest on ${broker}`,
        sub: live.buffer_first && short > 0 ? "Not this month: you invest once the buffer is full" : "Nothing to invest this pay period" },
    log,
  ].filter(Boolean);
  const n = steps.filter((st) => !st.muted).length;
  if (steps.every((st) => st.done || st.muted)) {
    // all done: a line until the 15th (Steps shows them, to untick one), then nothing
    if (ctx.today >= days.fifteenth && !opened.has(id)) return null;
    if (!opened.has(id)) return doneCard(ctx, id, `✓ ${monthName(days.log)} is done`, `Moved ${fmtSek(toBank)} to the bank${P.invest > 0 ? ` and invested ${fmtSek(P.invest)}` : ""}, and logged ${monthName(days.log)}.`);
    return checklist("home-first", "1st of the month", "All done. Tap a tick to untick a step and do it again.", steps, [hideLink(ctx, id)]);
  }
  return checklist("home-first", "1st of the month", `The bills are paid: ${["", "one step", "two steps", "three steps"][n] || plural(n, "step")} and ${monthName(days.log)} is done.`, steps);
}

/** From the 15th: next payday's salary, and the costs from new invoices. */
function beforeCard(ctx, live) {
  const nextBase = addMonths(live.base, 1);
  const redo = loadSteps(ctx.data)[live.base] || {};
  const typed = loadPeriodSalaries(ctx.data)[nextBase];
  const ch = nextPaydayChanges(live);
  const items = ch ? ch.items : [];
  const salary = autoStep(live.base, redo, "salary", typed !== undefined, {
    title: typed !== undefined ? `${monthName(nextBase)}'s salary: ${fmtSek(typed)}` : `Add ${monthName(nextBase)}'s salary`,
    go: () => openSalarySheet(ctx, nextBase, live.end, typed) });
  salary.sub = typed === undefined ? "You know it from the 15th"
    : salary.again ? "Check it against your payslip and save it again" : `For payday ${shortDate(live.end)}. Tap to change it.`;
  const costsDone = redo.costs === "done";
  const costs = { key: "costs", done: costsDone, title: "Update costs from new invoices",
    sub: items.length ? `Set for next payday: ${items.length > 3 ? `${items.slice(0, 2).join(", ")} and ${items.length - 2} more` : joinAnd(items)}`
      : "Rent, electricity: set the amount for next payday. ½ splits a bill. Tick it when you're done.",
    mark: () => { setStep(live.base, "costs", costsDone ? null : "done"); syncNow(); },
    go: () => { showPeriod(nextBase, ctx.today); ctx.go("budget"); } };
  const steps = [salary, costs];
  return checklist("home-before", `Before payday, ${shortDate(live.end)}`, "So payday starts from the right numbers.", steps);
}

/** A small sheet for next payday's salary (the Budget's next pay period has it too). */
function openSalarySheet(ctx, base, payday, current) {
  const input = h("input", { class: "form-input", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "0",
    value: current !== undefined ? plainNumber(current) : "", "aria-label": "Salary" });
  let api = null;
  const validate = () => {
    const v = parseNumber(input.value);
    api?.setRight({ disabled: !(v !== null && v > 0) && !(current !== undefined && !input.value.trim()) });
  };
  input.addEventListener("input", validate);
  const save = (sh) => {
    const v = parseNumber(input.value);
    if (!input.value.trim() && current !== undefined) { setPeriodSalary(ctx, base, null); sh.close(); toast("Salary cleared"); syncNow(); return; }
    if (v === null || !(v > 0)) return;
    setPeriodSalary(ctx, base, v, { keep: true });
    sh.close();
    toast(`✓  ${monthName(base)}'s salary: ${fmtSek(v)}`);
    syncNow();
  };
  const body = h("div", { class: "form" },
    caption(`PAYDAY  ·  ${longDate(payday).toUpperCase()}`),
    group(h("label", { class: "form-row" }, h("span", { class: "form-label" }, "Salary"), input, h("span", { class: "form-unit" }, localSym()))),
    footer("From your payslip. It counts for that pay period only: the budget and the payday log start from it."));
  api = sheet({ title: `${monthName(base)}'s Salary`, left: { text: "Cancel" }, right: { text: "Save", bold: true, onClick: save }, body });
  validate();
  if (matchMedia("(pointer: fine)").matches) setTimeout(() => input.focus(), 350);
  return api;
}

// ---------------------------------------------------------------------------
// How you're spending: each check-in as what you've spent, against the budget and the on-track pace
// ---------------------------------------------------------------------------
/** A round step for about four gridlines up to v: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(v) {
  const raw = Math.max(v, 1) / 4, p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((f) => f * p).find((x) => x >= raw);
}

function spendChart(P, live, checks) {
  const W = 340, H = 196, pad = { l: 40, r: 12, t: 22, b: 26 };
  const days = live.days, living = P.living;
  const pts = [{ d: 0, spent: 0 }, ...checks.map((c) => ({ d: Math.min(Math.max(daysBetween(live.start, asDay(c.date)), 0), days), spent: Math.max(living - c.left, 0), date: c.date }))];
  const most = Math.max(living * 1.08, ...pts.map((p) => p.spent));
  const step = niceStep(most), top = Math.ceil(most / step) * step;
  const X = (d) => pad.l + (d / days) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const grid = Array.from({ length: Math.round(top / step) + 1 }, (_, k) => {
    const v = step * k;
    return [s("line", { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), class: "sc-grid" }),
      s("text", { x: pad.l - 6, y: Y(v) + 3.5, class: "sc-axis amt", "text-anchor": "end" }, k ? fmtAxisSek(v).replace(localSym(), "").trim() : "0")];
  }).flat();
  const ticks = [0, 7, 14, 21, days].filter((d, k, a) => d <= days && (k === a.length - 1 || days - d >= 4)).map((d) =>
    s("text", { x: X(d), y: H - 8, class: "sc-axis", "text-anchor": d === 0 ? "start" : d === days ? "end" : "middle" }, dayMonth(addDays(live.start, d))));
  const line = pts.map((p, k) => `${k ? "L" : "M"}${X(p.d).toFixed(1)},${Y(p.spent).toFixed(1)}`).join(" ");
  const today = pts.at(-1);
  const todayD = daysBetween(live.start, live.today);
  return s("svg", { viewBox: `0 0 ${W} ${H}`, class: "spend-chart", role: "img", "aria-label": "What you've spent this pay period, from your check-ins" },
    ...grid, ...ticks,
    todayD >= 0 && todayD <= days ? s("line", { x1: X(todayD), x2: X(todayD), y1: pad.t - 4, y2: H - pad.b, class: "sc-today" }) : null,
    s("line", { x1: X(0), y1: Y(0), x2: X(days), y2: Y(living), class: "sc-pace" }),
    s("line", { x1: pad.l, x2: W - pad.r, y1: Y(living), y2: Y(living), class: "sc-budget" }),
    s("text", { x: W - pad.r, y: Y(living) - 6, class: "sc-label amt", "text-anchor": "end" }, `Budget ${fmtSek(living)}`),
    pts.length > 1 ? s("path", { d: line, class: "sc-line" }) : null,
    ...pts.slice(1).map((p) => s("circle", { cx: X(p.d), cy: Y(p.spent), r: p === today ? 4.5 : 3, class: p === today ? "sc-dot now" : "sc-dot" })),
    pts.length > 1 ? s("text", { x: Math.min(Math.max(X(today.d), pad.l + 30), W - pad.r - 30), y: Math.max(Y(today.spent) - 10, pad.t + 8),
      class: "sc-label now amt", "text-anchor": "middle" }, fmtSek(today.spent)) : null);
}

function spendCard(ctx, live) {
  const P = live.plan;
  const checks = (P.checks || []).filter((c) => c.date >= isoDay(live.start) && c.date <= isoDay(live.today));
  const last = checks.at(-1) || null;
  let folded = Boolean(store.pref("home_spend_folded", false));
  const sub = last ? `${fmtSek(Math.max(P.living - last.left, 0))} of ${fmtSek(P.living)} spent  ·  ${fmtSek(last.left)} to go`
    : "Each check-in above adds a point: what you've spent so far.";
  const body = h("div", { class: "spend-body" },
    spendChart(P, live, checks),
    h("div", { class: "legend spend-legend" },
      h("span", { class: "legend-item" }, dot(LIVING_C, 8), "Spent, from your checks"),
      h("span", { class: "legend-item" }, h("span", { class: "line-swatch solid" }), "Budget"),
      h("span", { class: "legend-item" }, h("span", { class: "line-swatch" }), "On-track pace")));
  const btn = h("button", { type: "button", class: "fold-btn", "aria-label": folded ? "Show the chart" : "Hide the chart" }, folded ? "+" : "−");
  const el = card("home-spend", head("Spending this pay period", sub, btn), body);
  const set = () => {
    el.classList.toggle("collapsed", folded);
    btn.textContent = folded ? "+" : "−";
    btn.setAttribute("aria-label", folded ? "Show the chart" : "Hide the chart");
    btn.setAttribute("aria-expanded", String(!folded));
  };
  btn.addEventListener("click", () => { folded = !folded; store.setPref("home_spend_folded", folded); set(); });
  set();
  return el;
}

// ---------------------------------------------------------------------------
// This pay period: where the salary goes
// ---------------------------------------------------------------------------
function periodCard(live) {
  const P = live.plan;
  const m = paydayMoves(live);
  const toBank = saveOf(P);
  const waiting = P.invest <= 0 && live.buffer_first && P.to_buffer > 0;
  const parts = [["Fixed costs", P.fixed, FIXED_C], [P.to_buffer > 0 && toBank - P.to_buffer < 1 ? "To the bank (buffer)" : "To the bank", toBank, BANK_C],
    [waiting ? "Invest  ·  once the buffer is full" : "Invest", P.invest, INVEST_C], ["Living money", P.living, LIVING_C]];
  return card("home-period", head("This pay period", `Salary ${fmtSek(P.salary)}  ·  moved on payday and the 1st`, m.all_done ? chip("✓ Moved", "up") : null),
    splitBar(parts.filter(([, v]) => v > 0.5).map(([, v, c]) => [v, c]), 12),
    h("div", { class: "legend-list" }, parts.map(([name, v, c]) => h("div", { class: "legend-row" }, dot(c, 9), h("span", { class: "legend-name" }, name),
      h("span", { class: "legend-amount amt" }, fmtSek(v)), h("span", { class: "legend-pct" }, P.salary > 0 ? `${Math.round(v / P.salary * 100)}%` : "")))));
}

// ---------------------------------------------------------------------------
export function renderHome(ctx) {
  if (!ctx.data) return ["", null];
  const es = ctx.entries;
  if (!es.length) return ["Nothing logged yet", emptyState(ctx)];
  const [live] = periodSnapshot(ctx);
  const P = live.plan;
  const days = periodDays(live);
  const saved = loadBudgets(ctx.data)[live.base] || null;
  const changes = saved ? budgetChanges(saved, live) : [];
  const today = ctx.today;
  const toPayday = daysBetween(today, live.end);
  const when = isoDay(today) === isoDay(live.start) ? "payday today" : toPayday === 1 ? "payday tomorrow" : `payday in ${toPayday} days`;
  const subtitle = `${P ? `${profileName(P.profile)} plan  ·  ` : ""}${fmtRange(live.start, addDays(live.end, -1))}  ·  ${when}`;
  // what's due: payday's steps until they're done (and the 1st has come), the 1st's, and the days before payday
  const due = [];
  if (!P || today < days.first) due.push(paydayCard(ctx, live, saved, changes, days));
  if (P && today >= days.first) due.push(firstCard(ctx, live, days));
  if (today >= days.fifteenth && today < live.end) due.push(beforeCard(ctx, live));
  return [subtitle,
    moneyCard(ctx, live, days),
    livingCard(ctx, live, saved),
    ...due,
    P ? spendCard(ctx, live) : null,
    P ? periodCard(live) : null,
    oneTimeCard(live, ctx)];
}
