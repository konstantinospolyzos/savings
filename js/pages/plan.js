// My plan: the saving plan you started for this pay period, day by day (a tab of the savings section).
// The plan keeps its numbers until payday; this page shows where you are in it: the payday checklist (the
// first week), this week's money, a check-in against what's left, the payday transfers to tick off, what the
// plan builds, your action plan, and past plans.
import { h, chip, dot, splitBar, toggle, toast, alertBox, kv, icon } from "../ui.js";
import {
  COLORS, PROFILE_DEFS, budgetSnapshot, planForRate, loadPlans, loadBudgets, loadProfiles, loadFloors, loadMaxes, loadTrips, budgetChanges, budgetToSave,
  defaultPeriodMonth, paydayFor, addMonths, mIndex, daysBetween, addDays, isoDay, fmtRange, shortDate, fmtSek, fmtEur, pct,
  roundTo10, plainNumber, parseNumber, plural, usualSpending, planProgress, planCheck, currentPeriod, futureValue, investedSek,
  brokersText, localSym, mLong, getSetting, hasMoney, summarize, monthFlows, CUR, inSweden, buildActions, tagAnalysis,
  travelFund, joinAnd, weekChunks, expenseMonthlySek,
} from "../core.js";
import { store } from "../store.js";
import { openProfilesSheet } from "./budget-sheets.js";
import { openMonthSheet } from "./month.js";
import { showCurrentPeriod } from "./budget.js";
import { makeFoldable } from "./fold.js";

const FIXED_C = "var(--gray3)", LIVING_C = COLORS.purple, GOALS_C = COLORS.teal, BUFFER_C = COLORS.blue, INVEST_C = COLORS.orange,
  SAVINGS_C = COLORS.indigo;
const kept = (P) => P.to_savings || 0;                  // what goes to savings after the buffer is full
const saveOf = (P) => P.goals + P.to_buffer + kept(P);    // all that goes to your savings account
const card = (...children) => h("div", { class: "card" }, children);
const head = (title, sub = null, right = null) => h("div", { class: "card-head" },
  h("div", { class: "card-head-text" }, h("div", { class: "card-title" }, title),
    sub ? h("div", { class: `card-sub ${typeof sub === "string" && hasMoney(sub) ? "amt-soft" : ""}` }, sub) : null), right);
const asDay = (iso) => new Date(`${iso}T12:00:00`);
const when = (iso, today) => (iso === isoDay(today) ? "today" : `on ${shortDate(asDay(iso))}`);
const money = (v) => fmtSek(roundTo10(v));
/** A card of this page by its class, opened if it's folded and scrolled to just under the top bar. */
function scrollToCard(cls) {
  const el = document.querySelector(`[data-page="plan"] .${cls}`);
  el?.unfold?.();
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}
/** The cards further down fold to their title (tap it); these start folded. */
const foldable = makeFoldable("plan_folded", new Set(["weeks", "details", "past"]));
const withClass = (el, cls) => { el?.classList.add(cls); return el; };

// ---------------------------------------------------------------------------
// Shared with the Budget page
// ---------------------------------------------------------------------------
export const profileName = (key) => PROFILE_DEFS.find(([k]) => k === key)?.[1] || "Your";

const selectedProfile = (data) => { const k = getSetting(data, "profile", "balanced"); return PROFILE_DEFS.some(([p]) => p === k) ? k : "balanced"; };

/**
 * The budget a pay period's plans are worked out from: the one you saved on the Budget page, with your
 * profiles (their % and minimums) and the one you picked.
 */
export function budgetFor(ctx, base, saved, start, end) {
  return { ...saved, base, start, end, today: ctx.today, days: saved.days || daysBetween(start, end), goal_rows: saved.goal_rows || [],
    profiles: loadProfiles(ctx.data), floors: loadFloors(ctx.data), maxes: loadMaxes(ctx.data), trip: Boolean(loadTrips(ctx.data)[base]),
    profile: selectedProfile(ctx.data), entries: ctx.entries, plan: loadPlans(ctx.data)[base] || null };
}

/** The most a profile lives on a week in a pay period: none when you go on a trip. */
const maxFor = (bs, key) => (bs.trip ? 0 : bs.maxes?.[key] || 0);

/** A trip this pay period: the plans have no most to live on. */
export function setTrip(base, on) {
  const trips = { ...loadTrips(store.data) };
  if (on) trips[base] = true; else delete trips[base];
  for (const k of Object.keys(trips).sort().slice(0, -24)) delete trips[k];
  store.setSetting("trip_periods", trips);
}

/** A saving plan's numbers from a budget: what it spends, saves and invests, and why. */
export function planFields(bs, key) {
  const rate = bs.profiles[key], floor = bs.floors[key], max = maxFor(bs, key);
  const p = planForRate(bs, rate, floor, max);
  return { profile: key, rate, floor_week: floor, max_week: max, trip: Boolean(bs.trip), salary: bs.salary, fixed: bs.fixed, goals: bs.goals,
    living: p.spend, to_buffer: p.to_buffer, to_savings: p.to_savings, invest: p.invest, future: p.future, save_rate: p.rate, days: bs.days,
    capped: p.capped, short: p.short, by_floor: p.by_floor, by_max: p.by_max };
}

/** Start a pay period's plan (it keeps its numbers until payday). Updating one keeps its check-ins and ticks. */
export function startPlan(ctx, base, fields, keep = null) {
  const { capped, short, by_floor, by_max, ...numbers } = fields;
  const plan = { ...numbers, started: keep?.started || isoDay(ctx.today), ...(keep ? { updated: isoDay(ctx.today) } : {}),
    done: keep?.done || { save: false, invest: false }, checks: keep?.checks || [] };
  const plans = { ...loadPlans(store.data), [base]: plan };
  for (const k of Object.keys(plans).sort().slice(0, -24)) delete plans[k];      // the last two years
  store.setSetting("period_plans", plans);
}
export function setPlan(base, plan) {
  const plans = { ...loadPlans(store.data) };
  if (plan) plans[base] = plan; else delete plans[base];
  store.setSetting("period_plans", plans);
}
export async function stopPlan(base) {
  const ok = await alertBox({ title: "Stop this plan?", message: "You can pick a plan again for this pay period, from the budget you saved.",
    buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Stop", value: true, style: "destructive" }] });
  if (ok) { setPlan(base, null); toast("Plan stopped"); }
}

/** Does the budget you saved since give the running plan other numbers? */
export function planChanges(P, bs) {
  if (!bs) return { changed: false, why: [], fields: null };
  const f = planFields(bs, P.profile);
  const changed = Math.abs(f.living - P.living) > 50 || Math.abs(f.future - P.future) > 50 || Math.abs(f.goals - P.goals) > 50
    || Math.abs(kept(f) - kept(P)) > 50
    || Math.abs(f.salary - P.salary) > 0.5 || Math.abs(f.fixed - P.fixed) > 0.5;
  const why = [Math.abs(f.salary - P.salary) > 0.5 ? "the salary" : null, Math.abs(f.fixed - P.fixed) > 0.5 ? "the fixed costs" : null,
    Math.abs(f.goals - P.goals) > 0.5 ? "the goals" : null, Math.abs(f.to_buffer - P.to_buffer) > 50 ? "the buffer" : null,
    Math.abs(kept(f) - kept(P)) > 50 && Math.abs(f.future - P.future) <= 50 ? "what's kept in savings" : null,
    Math.abs(f.living - P.living) > 50 && Boolean(f.trip) !== Boolean(P.trip) ? (f.trip ? "the trip" : "no trip") : null,
    Math.abs(f.living - P.living) > 50 && !f.trip && (f.max_week || 0) !== (P.max_week || 0) ? "the most to live on" : null].filter(Boolean);
  return { changed, why, fields: f };
}

/**
 * What goes to Revolut on payday, when you pay fixed costs from Revolut pockets: a pocket for each week of the
 * pay period (the plan's living money, week by week) and the fixed costs marked Revolut pocket. null without them.
 */
export function revolutPockets(snap) {
  const costs = snap.active.filter((x) => x.pocket && !x.car).map((x) => [x.name, expenseMonthlySek(x, snap.fx)]);
  if (!costs.length || !snap.plan) return null;
  const P = snap.plan, weeks = weekChunks(snap.start, snap.end), perDay = P.living / snap.days;
  let given = 0;
  const weekRows = weeks.map((w, k) => {
    const last = k === weeks.length - 1;
    const amount = last ? Math.max(Math.round(P.living - given), 0) : roundTo10(perDay * w.days);
    given += amount;
    return [w.days === 7 ? `Week ${k + 1}` : `Week ${k + 1} (${plural(w.days, "day")})`, amount];
  });
  const weeksTotal = weekRows.reduce((a, [, v]) => a + v, 0), costsTotal = costs.reduce((a, [, v]) => a + v, 0);
  return { weeks: weekRows, costs, weeks_total: weeksTotal, costs_total: costsTotal, total: weeksTotal + costsTotal };
}

/** The money to move on payday, each ticked off when it's done. */
export function paydayMoves(snap) {
  const P = snap.plan, done = P.done || {};
  const save = saveOf(P);
  const into = [P.goals > 0 ? `goals ${fmtSek(P.goals)}` : null, P.to_buffer > 0 ? `buffer ${fmtSek(P.to_buffer)}` : null,
    kept(P) > 0 ? `savings ${fmtSek(kept(P))}` : null].filter(Boolean);
  const rv = revolutPockets(snap);
  const moves = [
    rv ? ["revolut", `To Revolut ${fmtSek(rv.total)}`, `Weeks ${fmtSek(rv.weeks_total)} + ${rv.costs.length === 1 ? rv.costs[0][0] : "other pockets"} ${fmtSek(rv.costs_total)}`, LIVING_C] : null,
    save > 0 ? ["save", `Save ${fmtSek(save)}`, `To your savings account${into.length > 1 ? `: ${into.join(" + ")}` : P.goals > 0 ? ": your saving goals" : P.to_buffer > 0 ? ": your buffer" : ""}`, BUFFER_C] : null,
    P.invest > 0 ? ["invest", `Invest ${fmtSek(P.invest)}`, `To ${brokersText("your investment account")}`, INVEST_C] : null,
  ].filter(Boolean);
  const rows = moves.map(([key, title, subText, color]) => {
    const sw = toggle(Boolean(done[key]), (on) => setTimeout(() => setPlan(snap.base, { ...P, done: { ...done, [key]: on } }), 220), title);
    return h("label", { class: "list-row move-row" }, dot(color, 10),
      h("div", { class: "row-main" }, h("div", { class: `row-title amt ${done[key] ? "moved" : ""}` }, title), h("div", { class: "row-sub amt-soft" }, subText)), sw);
  });
  return { rows, count: moves.length, all_done: moves.length > 0 && moves.every(([key]) => done[key]), revolut: rv };
}

/** Pocket by pocket: what to put in each one. */
function pocketsList(rv) {
  const line = (name, v) => h("div", { class: "kv" }, h("span", { class: "kv-label" }, name), h("span", { class: "kv-value amt" }, fmtSek(v)));
  return h("div", { class: "pockets" },
    h("div", { class: "caption" }, "INTO YOUR REVOLUT POCKETS"),
    h("div", { class: "kv-list" }, rv.weeks.map(([n, v]) => line(n, v)), rv.costs.map(([n, v]) => line(n, v)),
      h("div", { class: "kv pockets-total" }, h("span", { class: "kv-label" }, "Total to Revolut"), h("span", { class: "kv-value amt" }, fmtSek(rv.total)))));
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
/** The budget of the pay period today is in (the Budget page jumps ahead a week before payday). */
function periodSnapshot(ctx) {
  const per = currentPeriod(ctx.today);
  const offset = mIndex(per.base) - mIndex(defaultPeriodMonth(ctx.today));
  const snap = budgetSnapshot(ctx.data, ctx.today, offset);
  snap.entries = ctx.entries;
  return [snap, offset];
}

/** This week: the money, the day of the pay period and how long to payday. */
let switching = false;        // the saving plans show only after you tap Switch plan

function weekCard(snap, pr, ctx) {
  const P = snap.plan;
  const toPayday = daysBetween(snap.today, snap.end);
  const w = pr.week;
  return h("div", { class: "card hero plan-hero" },
    h("div", { class: "cap-row" }, dot(LIVING_C, 8),
      h("span", { class: "caption" }, w.days === 7 ? `WEEK ${pr.week_index + 1} OF ${pr.weeks.length}` : "THE LAST DAYS"),
      h("span", { class: "hint" }, fmtRange(w.start, w.end)),
      h("span", { class: "plan-day" }, chip(`Day ${pr.day} of ${pr.days}`, "info"))),
    h("div", { class: "big-value amt" }, money(pr.week_money)),
    h("div", { class: "muted amt-soft" }, `to spend this week  ·  ≈ ${money(pr.per_day)} a day  ·  ${pr.week_days_left === 1 ? "last day of the week" : `${pr.week_days_left} days left in it`}`),
    h("div", { class: "plan-progress" }, splitBar([[pr.day, BUFFER_C], [pr.days - pr.day, "var(--fill)"]], 8)),
    h("div", { class: "plan-progress-labels" }, h("span", null, `Payday ${shortDate(snap.start)}`),
      h("span", null, toPayday === 1 ? "Payday tomorrow" : `${toPayday} days to payday, ${shortDate(snap.end)}`)),
    h("div", { class: "hint amt-soft" }, `${profileName(P.profile)} plan: ${fmtSek(P.living)} to live on for the whole pay period, about ${money(pr.per_week)} a week.`
      + (pr.week_index + 1 < pr.weeks.length ? ` Next week: ${money(pr.per_day * pr.weeks[pr.week_index + 1].days)}.` : " Next up: payday.")),
    h("div", { class: "card-actions" }, h("button", { type: "button", class: "btn tinted small",
      onclick: () => { switching = !switching; ctx.refresh(); } }, switching ? "Cancel switching" : "Switch plan")));
}

/** How's it going: what's left of the living money, against what the plan has left for the days to come. */
function checkCard(snap, pr) {
  const P = snap.plan, today = snap.today;
  const checks = (P.checks || []).filter((c) => c.date >= isoDay(snap.start) && c.date <= isoDay(today));
  const last = checks.at(-1) || null;
  const input = h("input", { class: "check-input amt", type: "text", inputmode: "decimal", autocomplete: "off",
    placeholder: plainNumber(roundTo10(pr.expected)), "aria-label": "Living money left" });
  const save = () => {
    const v = parseNumber(input.value);
    if (v === null || v < 0) { input.classList.add("invalid"); return; }
    const list = [...(P.checks || []).filter((c) => c.date !== isoDay(today)), { date: isoDay(today), left: Math.round(v) }].slice(-40);
    setPlan(snap.base, { ...P, checks: list });
    const r = planCheck(P, snap.start, snap.end, { date: isoDay(today), left: v });
    toast(`${r.status}: ≈ ${money(r.per_day_now)} a day to payday`);
  };
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); save(); } });
  input.addEventListener("input", () => input.classList.remove("invalid"));
  let result = null;
  if (last) {
    const r = planCheck(P, snap.start, snap.end, last);
    const diffText = Math.abs(r.diff) < 10 ? "just what the plan has for them" : `${money(Math.abs(r.diff))} ${r.diff > 0 ? "more" : "less"} than the plan has for them (${money(r.expected)})`;
    const age = daysBetween(asDay(last.date), today);
    result = h("div", { class: "check-result" },
      h("div", { class: "cap-row" }, chip(r.status, r.tone), h("span", { class: "hint" }, `${fmtSek(last.left)} left ${when(last.date, today)}`)),
      h("div", { class: "check-line amt-soft" }, `You have ${fmtSek(last.left)} for the ${plural(r.days_left, "day")} ${last.date === isoDay(today) ? "from today" : "from then"} to payday: ${diffText}.`),
      h("div", { class: "check-now amt" }, `To make it last: ≈ ${money(r.per_day_now)} a day, ${money(r.per_week_now)} a week.`),
      age >= 3 ? h("div", { class: "hint" }, `That was ${plural(age, "day")} ago: check in again to keep this right.`) : null);
  }
  const older = checks.slice(0, -1).slice(-4).reverse().map((c) => {
    const r = planCheck(P, snap.start, snap.end, c);
    return h("div", { class: "check-old" }, h("span", { class: "muted" }, shortDate(asDay(c.date))),
      h("span", { class: "amt" }, `${fmtSek(c.left)} left`), chip(r.status, r.tone, "small"));
  });
  return card(head("How's it going?", last ? null : "Check in now and then: it tells you if you're on track, and what you can spend a day to make it last."),
    result,
    h("div", { class: "check-row" }, h("span", { class: "check-label" }, "Living money left now"), input, h("span", { class: "check-unit" }, localSym()),
      h("button", { type: "button", class: "btn tinted small", onclick: save }, "Check")),
    h("div", { class: "hint" }, "Look at your everyday account and take off what you still have to pay this period: bills, and the transfers below if you haven't made them. What's left is your living money."),
    older.length ? h("div", { class: "check-history" }, h("div", { class: "caption" }, "EARLIER CHECK-INS"), older,
      h("div", { class: "hint" }, "How each one compared with the plan on that day.")) : null);
}

function movesCard(snap) {
  const m = paydayMoves(snap);
  if (!m.count) return null;
  return withClass(card(head("On payday, move", m.all_done ? "✓ Done. What's left in your everyday account is yours to spend." : "As soon as the salary lands, before you start spending."),
    h("div", { class: "list" }, m.rows),
    m.revolut ? pocketsList(m.revolut) : null,
    h("div", { class: "hint" }, "Tick them off when you've moved the money. Standing transfers make it automatic.")), "plan-moves");
}

/** Where the salary goes in this plan. */
function splitCard(snap) {
  const P = snap.plan;
  const parts = [["Fixed costs", P.fixed, FIXED_C], ["Saving goals", P.goals, GOALS_C], ["Buffer", P.to_buffer, BUFFER_C],
    ["Savings", kept(P), SAVINGS_C], ["Investing", P.invest, INVEST_C], ["Living money", P.living, LIVING_C]].filter(([, v]) => v > 0.5);
  const aimed = P.rate !== undefined && P.save_rate < P.rate / 100 - 0.005;
  const above = P.rate !== undefined && P.max_week > 0 && P.save_rate > P.rate / 100 + 0.005;
  return card(head("Where the salary goes", `${fmtSek(P.salary)} this pay period`),
    splitBar(parts.map(([, v, c]) => [v, c]), 12),
    h("div", { class: "legend-list" }, parts.map(([name, v, c]) => h("div", { class: "legend-row" }, dot(c, 9), h("span", { class: "legend-name" }, name),
      h("span", { class: "legend-amount amt" }, fmtSek(v)), h("span", { class: "legend-pct" }, P.salary > 0 ? `${Math.round(v / P.salary * 100)}%` : "")))),
    h("div", { class: "hint amt-soft" }, `Your future gets ${pct(P.save_rate || 0)} of your salary (buffer${kept(P) > 0 ? " + savings" : ""} + investing).`
      + (aimed ? ` You aimed for ${P.rate}%, but that would have left less than ${fmtSek(P.floor_week)} a week to live on.` : "")
      + (above ? ` More than the ${P.rate}% you aimed for: you live on at most ${fmtSek(P.max_week)} a week, and the rest goes to your future.` : "")));
}

/** What the plan builds: the buffer, the investments and the goals, if you keep it up. */
function buildsCard(snap) {
  const P = snap.plan, latest = snap.latest;
  const parts = [];
  const section = (title, color, value, ...rest) => h("div", { class: "build" },
    h("div", { class: "cap-row" }, dot(color, 8), h("span", { class: "caption" }, title)),
    value ? h("div", { class: "build-value amt" }, value) : null, ...rest);
  if (snap.target > 0) {
    const after = snap.bank + P.to_buffer;
    const short = Math.max(snap.target - after, 0);
    const months = P.to_buffer > 0 && short > 0 ? Math.ceil(short / P.to_buffer) : null;
    const text = snap.bank >= snap.target ? (kept(P) > 0 ? `Full. ${fmtSek(kept(P))} still goes to your savings account this period, the rest to investing.` : "Full: all of this plan's future money can go to investing.")
      : P.to_buffer > 0 ? `This period adds ${fmtSek(P.to_buffer)}: ${pct(Math.min(after / snap.target, 1))} full after it${months ? `, and full in about ${plural(months, "more pay period")} at this pace` : ""}.`
        : "This plan doesn't add to it: its future money goes to investing.";
    parts.push(section("EMERGENCY BUFFER", BUFFER_C, `${fmtSek(snap.bank)} of ${fmtSek(snap.target)}`,
      splitBar([[Math.min(snap.bank, snap.target), COLORS.green], [Math.min(P.to_buffer, Math.max(snap.target - snap.bank, 0)), BUFFER_C], [short, "var(--fill)"]], 8),
      h("div", { class: "hint amt-soft" }, `${text} ${snap.buffer_months} months of fixed costs; the bank figure is from your ${latest ? mLong(latest.month) : ""} log.`)));
  }
  const invested = latest ? investedSek(latest) : 0;
  if (P.invest > 0 || invested > 0) {
    const [in10] = futureValue(invested, P.invest, 10, 0.05);
    parts.push(section("INVESTING", INVEST_C, P.invest > 0 ? `${fmtSek(P.invest)} this period` : "Nothing this period",
      h("div", { class: "hint amt-soft" }, P.invest > 0
        ? `${fmtSek(P.invest * 12)} a year at this pace, to ${brokersText("your investment account")}. With the ${fmtSek(invested)} you have invested, that could grow to about ${fmtSek(roundTo10(in10, 3))} in 10 years (at 5% a year: a rough guide, not a promise).`
        : `The buffer comes first this period. You have ${fmtSek(invested)} invested.`)));
  }
  if (P.goals > 0) {
    const names = snap.goal_rows.map(([g, m]) => `${g.name} ${fmtSek(m)}`).join(", ");
    parts.push(section("SAVING GOALS", GOALS_C, `${fmtSek(P.goals)} this period`, names ? h("div", { class: "hint amt-soft" }, names) : null));
  }
  const year = (saveOf(P) + P.invest) * 12;
  if (!parts.length) return null;
  return card(head("What this plan builds", year > 0 ? `Keep it up for a year and you put aside about ${fmtSek(roundTo10(year, 2))}.` : null), parts);
}

/** Week by week: the money of each week of the pay period. */
function weeksCard(snap, pr) {
  const P = snap.plan;
  const rows = pr.weeks.map((w, k) => {
    const now = k === pr.week_index, past = w.end < snap.today && !now;
    return h("div", { class: `week-row ${past ? "past" : ""}` },
      h("span", { class: "week-name" }, w.days === 7 ? `Week ${k + 1}` : `Last ${plural(w.days, "day")}`),
      h("span", { class: "muted week-range" }, fmtRange(w.start, w.end)),
      now ? chip("This week", "info", "small") : null,
      h("span", { class: "row-amount amt" }, money(P.living * w.days / snap.days)));
  });
  return card(head("Week by week", `${fmtSek(P.living)} to live on from payday ${shortDate(snap.start)} to the day before ${shortDate(snap.end)}`),
    h("div", { class: "list" }, rows));
}

/** The plan itself: what it was started with, and changing or stopping it. */
function detailsCard(snap, ctx, bs) {
  const P = snap.plan;
  const { changed, why, fields } = planChanges(P, bs);
  const aimed = P.rate !== undefined && Math.abs(P.save_rate - P.rate / 100) > 0.005;
  const update = () => { startPlan(ctx, snap.base, fields, P); toast(`✓  Plan updated: ${profileName(P.profile)}`); };
  return withClass(card(head("The plan", `Started ${shortDate(asDay(P.started))}${P.updated ? `, updated ${shortDate(asDay(P.updated))}` : ""}`),
    changed ? h("div", { class: "warn-note" }, `Things changed since you started${why.length ? ` (${why.join(", ")})` : ""}: the plan would now be ${money(fields.living / (snap.days / 7))} a week to spend, ${fmtSek(saveOf(fields))} to save and ${fmtSek(fields.invest)} to invest.`,
      h("div", { class: "note-actions" }, h("button", { type: "button", class: "btn tinted small", onclick: update }, "Update the plan"))) : null,
    h("div", { class: "kv-list" },
      kv("Profile", profileName(P.profile), { amt: false }),
      kv("Saves", `${pct(P.save_rate || 0)} of your salary${aimed ? ` (aimed for ${P.rate}%)` : ""}`, { amt: false }),
      P.floor_week ? kv("Lives on at least", `${fmtSek(P.floor_week)} a week`) : null,
      P.trip ? kv("Lives on at most", "no most: a trip", { amt: false }) : P.max_week ? kv("Lives on at most", `${fmtSek(P.max_week)} a week`) : null,
      kv("Salary", fmtSek(P.salary)),
      kv("Fixed costs", fmtSek(P.fixed)),
      P.goals > 0 ? kv("Saving goals", fmtSek(P.goals)) : null,
      kv("Pay period", `${fmtRange(snap.start, addDays(snap.end, -1))}, ${snap.days} days`, { amt: false })),
    h("div", { class: "card-actions" },
      h("button", { type: "button", class: "btn tinted small", onclick: () => ctx.go("budget") }, "Open Budget"),
      h("button", { type: "button", class: "btn plain small", onclick: () => stopPlan(snap.base) }, "Stop the plan"))), "plan-details");
}

/** The plans of the pay periods before. */
function pastCard(ctx, base) {
  const plans = loadPlans(ctx.data);
  const rows = Object.keys(plans).filter((k) => k < base).sort().reverse().slice(0, 12).map((k) => {
    const P = plans[k];
    const start = paydayFor(k), end = paydayFor(addMonths(k, 1));
    const moves = [saveOf(P) > 0 ? "save" : null, P.invest > 0 ? "invest" : null].filter(Boolean);
    const moved = moves.length && moves.every((m) => P.done?.[m]);
    return h("div", { class: "past-plan" },
      h("div", { class: "row-main" }, h("div", { class: "row-title" }, `${profileName(P.profile)}, ${fmtRange(start, addDays(end, -1))}`),
        h("div", { class: "row-sub amt-soft" }, `Saved ${pct(P.save_rate || 0)}: ${fmtSek(saveOf(P) + P.invest)} put aside, ${fmtSek(P.living)} to live on`)),
      moves.length ? chip(moved ? "✓ Moved" : "Not ticked", moved ? "up" : "flat", "small") : null);
  });
  if (!rows.length) return null;
  return card(head("Your past plans", `${plural(rows.length, "pay period")}`), h("div", { class: "list" }, rows));
}

/** Your action plan: tips from your logs and your budget, most important first (moving the money is above). */
function actionsCard(ctx, snap) {
  const recent = monthFlows(ctx.entries).slice(-12);
  const items = buildActions(snap, summarize(recent), tagAnalysis(recent), travelFund(recent), ctx.inv, recent);
  if (!items.length) return null;
  return card(head("Your action plan", "Tips from your logs and your budget, most important first."),
    h("div", { class: "actions" }, items.map(([title, detail, color], k) => h("div", { class: "action" },
      h("span", { class: "action-badge", style: { background: color } }, String(k + 1)),
      h("div", { class: "action-text" }, h("div", { class: "action-title amt-soft" }, title), h("div", { class: "muted amt-soft" }, detail))))));
}

// ---------------------------------------------------------------------------
// The payday checklist: the first week of a pay period, until all four steps are done
// ---------------------------------------------------------------------------
const CHECKLIST_DAYS = 7;

/** Payday, step by step: each step ticks itself off, and tapping it takes you to where it's done. */
function paydaySteps(ctx, live, saved, changes) {
  const base = live.base, P = live.plan;
  const entry = ctx.entries.find((e) => e.month === base) || null;
  const moves = P ? paydayMoves(live) : null;
  const toSave = P ? saveOf(P) : 0;
  const rv = moves?.revolut || null;
  return [
    { key: "log", done: Boolean(entry), title: `Log ${mLong(base)}`,
      sub: entry ? `Salary ${fmtSek(entry.income_sek)}, bank ${fmtSek(entry.bank_sek)}` : "The salary that just came in, and your bank and investments today",
      go: () => (entry ? ctx.openMonth(entry) : openMonthSheet(ctx, null, base)) },
    { key: "budget", done: Boolean(saved) && !changes.length, title: saved && changes.length ? "Save the budget again" : "Check the salary and save the budget",
      sub: !saved ? (live.salary > 0 ? `Salary ${fmtSek(live.salary)}, fixed costs ${fmtSek(live.fixed)}: save them on the Budget tab` : "Enter your salary on the Budget tab, then save the budget")
        : changes.length ? `It changed since you saved it: ${joinAnd(changes)}`
          : `Saved ${shortDate(asDay(saved.saved))}: ${fmtSek(saved.left)} left after fixed costs`,
      go: () => { showCurrentPeriod(); ctx.go("budget"); } },
    { key: "plan", done: Boolean(P), title: "Pick a saving plan and start it",
      sub: P ? `${profileName(P.profile)}: ≈ ${money(P.living / (live.days / 7))} a week to live on`
        : saved ? "Below: the three plans, worked out from the budget you saved" : "Once the budget is saved",
      go: P ? () => scrollToCard("plan-details") : saved ? () => scrollToCard("plan-tiles") : null },
    { key: "move", done: Boolean(P) && (!moves.count || moves.all_done), title: rv ? "Move the money" : "Move Save and Invest",
      sub: !P ? "Once the plan is started" : !moves.count ? "Nothing to move this pay period"
        : moves.all_done ? "Moved: what's left is yours to spend"
          : `${joinAnd([rv ? `Revolut ${fmtSek(rv.total)}` : "", toSave > 0 ? `save ${fmtSek(toSave)}` : "", P.invest > 0 ? `invest ${fmtSek(P.invest)}` : ""]).replace(/^./, (c) => c.toUpperCase())}, then tick ${moves.count > 1 ? "them" : "it"} off`,
      go: P && moves.count ? () => scrollToCard("plan-moves") : null },
  ];
}

function checklistCard(steps, live, today) {
  const nDone = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);
  const rows = steps.map((s, k) => {
    const mark = s.done ? h("span", { class: "step-mark done", "aria-label": "Done" }, icon("check", 15))
      : h("span", { class: `step-mark ${k === next ? "next" : ""}` }, String(k + 1));
    const go = s.go ? () => s.go() : null;
    return h("div", { class: `list-row step-row ${s.done ? "done" : ""} ${go ? "" : "static"}`, role: go ? "button" : null, tabindex: go ? "0" : null,
      onclick: go, onkeydown: go ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); } } : null },
      mark,
      h("div", { class: "row-main" }, h("div", { class: "row-title" }, s.title), h("div", { class: "row-sub amt-soft" }, s.sub)),
      go ? icon("chevron", 15, "chev") : null);
  });
  const isToday = isoDay(live.start) === isoDay(today);
  return withClass(card(head("Payday checklist", `${isToday ? "It's payday" : `Payday was ${shortDate(live.start)}`}: four steps, and this pay period is set.`,
    chip(`${nDone} of ${steps.length}`, nDone ? "info" : "flat")),
  h("div", { class: "list" }, rows)), "plan-checklist");
}

/** The checklist, in the first week of the pay period while a step is still to do. */
function paydayChecklist(ctx, live, saved, changes) {
  if (daysBetween(live.start, ctx.today) >= CHECKLIST_DAYS) return null;
  const steps = paydaySteps(ctx, live, saved, changes);
  return steps.every((s) => s.done) ? null : checklistCard(steps, live, ctx.today);
}

// ---------------------------------------------------------------------------
// Picking a plan: from the budget you saved on the Budget page
// ---------------------------------------------------------------------------
/** The Budget page has changes you haven't saved: My plan still uses the saved ones. */
function unsavedNote(changes, ctx, saved) {
  if (!changes.length) return null;
  return h("div", { class: "warn-note" }, `Your Budget tab has changes you haven't saved (${changes.join(", ")}). This page uses the budget you saved on ${shortDate(asDay(saved.saved))}: save it again there to use the new numbers.`,
    h("div", { class: "note-actions" }, h("button", { type: "button", class: "btn tinted small", onclick: () => ctx.go("budget") }, "Open Budget")));
}

/** The budget a plan splits: salary, fixed costs, what's left, goals, and what's left to split. */
function budgetCard(bs, changes, ctx) {
  const eqRow = (sign, label, value, cls = "") => h("div", { class: `eq-row ${cls}` },
    h("span", { class: "eq-label" }, sign ? h("span", { class: "eq-sign" }, sign) : null, label), h("span", { class: `eq-value amt ${cls === "total" ? "big tone-text-up" : ""}` }, value));
  return card(head("This pay period's budget", `${fmtRange(bs.start, addDays(bs.end, -1))}  ·  saved on the Budget tab ${shortDate(asDay(bs.saved))}`),
    unsavedNote(changes, ctx, bs),
    h("div", { class: "eq" },
      eqRow("", "Salary", fmtSek(bs.salary)),
      eqRow("−", "Fixed costs", fmtSek(bs.fixed)),
      eqRow("=", "Left to plan", fmtSek(bs.left), bs.goals > 0 ? "" : "total"),
      bs.goals > 0 ? eqRow("−", "Saving goals", fmtSek(bs.goals)) : null,
      bs.goals > 0 ? eqRow("=", "For your saving plan", fmtSek(Math.max(bs.free, 0)), "total") : null),
    h("div", { class: "hint" }, "Your saving plan splits this between your future (buffer + investing) and living money."),
    h("div", { class: "card-actions" }, h("button", { type: "button", class: "btn plain small", onclick: () => ctx.go("budget") }, "Change it on the Budget tab")));
}

const rateTone = (r) => (r >= 0.195 ? "up" : r >= 0.095 ? "flat" : "down");

/** The three saving plans, worked out from the saved budget: tap one to pick it. */
function tilesCard(bs, ctx) {
  const weeks = bs.days / 7;
  const free = Math.max(bs.free, 0);
  // what you really spend a week beyond your fixed costs, from your logs: how far each plan is from it
  const usual = bs.salary > 0 && bs.fixed > 0 ? usualSpending(bs.entries, bs.fixed) : null;
  const tiles = PROFILE_DEFS.map(([key, title, tagline]) => {
    const rate = bs.profiles[key], floor = bs.floors[key], max = maxFor(bs, key);
    const p = planForRate(bs, rate, floor, max);
    const chipEl = p.short ? chip("Doesn't fit", "down")
      : p.capped || p.by_max ? chip(`Saves ${pct(p.rate)} of salary`, rateTone(p.rate))
        : chip(`Saves ${rate}% of salary`, rateTone(rate / 100));
    const why = p.short ? `Even ${fmtSek(floor)} a week to live on doesn't fit after your fixed costs and goals.`
      : p.capped ? `${rate}% would leave less than ${fmtSek(floor)} a week to live on, so it saves ${pct(p.rate)}.`
        : p.by_max ? `At most ${fmtSek(max)} a week to live on, so it saves ${pct(p.rate)}: more than its ${rate}%.`
          : max ? `Between ${fmtSek(floor)} and ${fmtSek(max)} a week to live on.` : `Never less than ${fmtSek(floor)} a week to live on.`;
    const diff = usual ? p.spend / weeks - usual.week : null;
    const vsUsual = diff === null ? null : Math.abs(diff) < 50 ? "About what you usually spend."
      : `${money(Math.abs(diff))} a week ${diff < 0 ? "less" : "more"} than you usually spend.`;
    const cols = [["spend", "Spend", LIVING_C], ["save", "Save", BUFFER_C], ["invest", "Invest", INVEST_C]].map(([part, text, color]) =>
      h("div", { class: "tile-col" }, h("div", { class: "tile-cap" }, dot(color, 7), text),
        h("div", { class: "tile-amount amt" }, fmtSek(p[part])),
        h("div", { class: "tile-pct" }, free > 0 ? `${Math.round(p[part] / Math.max(bs.left, 1) * 100)}%` : "")));
    return h("button", { type: "button", class: `tile ${key === bs.profile ? "selected" : ""}`, "aria-pressed": String(key === bs.profile),
      onclick: () => { if (key !== bs.profile) store.setSetting("profile", key); } },
      h("div", { class: "tile-head" }, h("div", null, h("div", { class: "tile-title" }, title), h("div", { class: "hint" }, tagline)), chipEl),
      h("div", { class: "tile-week" }, h("span", { class: "tile-value amt" }, `≈ ${money(p.spend / weeks)}`), h("span", { class: "hint" }, " per week to spend")),
      splitBar([[p.spend, LIVING_C], [p.save, BUFFER_C], [p.invest, INVEST_C]], 6),
      h("div", { class: "tile-cols" }, cols),
      h("div", { class: `tile-why amt-soft ${p.short ? "tone-text-down" : ""}` }, why),
      vsUsual ? h("div", { class: "tile-why amt-soft" }, vsUsual) : null);
  });
  const trip = h("label", { class: "switch-line trip-line" }, h("span", null, "Going on a trip this pay period"),
    toggle(Boolean(bs.trip), (on) => setTimeout(() => setTrip(bs.base, on), 220), "Going on a trip this pay period"));
  return withClass(card(
    head("Pick a saving plan", "Each puts a share of your salary toward your future, and keeps what you live on a week between a least and a most.",
      h("button", { type: "button", class: "link-btn", onclick: () => openProfilesSheet(ctx, bs) }, "Edit")),
    h("div", { class: "tiles" }, tiles),
    trip,
    h("div", { class: "hint" }, bs.trip ? "Trip this pay period: no most to live on, so the plans leave you everything above their %."
      : "On a trip, a pay period can have more to live on: turn this on and the plans have no most this time."),
    usual ? h("div", { class: "hint amt-soft" }, `You usually spend about ${money(usual.week)} a week beyond your fixed costs: the middle of your last ${usual.months} months of logs, trip months left out.`) : null), "plan-tiles");
}

function rateMeter(rate, marker) {
  const MAX = 0.5;
  const x = (v) => `${Math.min(Math.max(v, 0), MAX) / MAX * 100}%`;
  const color = rate < 0.10 ? COLORS.red : rate < 0.20 ? COLORS.orange : COLORS.green;
  return h("div", { class: "meter" },
    h("div", { class: "meter-track" }, h("div", { class: "meter-fill", style: { width: x(rate), background: color } }),
      ...[0.1, 0.2, 0.3].map((v) => h("span", { class: "meter-tick", style: { left: x(v) } }))),
    marker !== null ? h("span", { class: "meter-marker", style: { left: x(marker) }, title: "Your last 12 months" }) : null,
    h("div", { class: "meter-labels" }, [[0.1, "10%", "minimum"], [0.2, "20%", "50/30/20"], [0.3, "30%", "high"]].map(([v, a, b]) =>
      h("span", { style: { left: x(v) } }, h("b", null, a), h("br"), b))));
}

/** The plan you picked, as it would run: spend, save, invest, and Start. */
function previewCard(bs, live, ctx, running = null) {
  const f = planFields(bs, bs.profile);
  const weeks = bs.days / 7;
  const fx = live.fx;
  let warn = "", note = "";
  if (bs.free < 0) warn = "Fixed costs and goals are higher than your salary, so nothing is left for your future or living.";
  else if (f.short) warn = `Even ${fmtSek(f.floor_week)} a week to live on doesn't fit: after fixed costs and goals, ${fmtSek(Math.max(bs.free, 0))} is left for ${bs.days} days. Pause a goal or trim a fixed cost on the Budget tab.`;
  else if (f.capped) note = `${f.rate}% of your salary would leave less than ${fmtSek(f.floor_week)} a week to live on, so this plan saves ${pct(f.save_rate)}: the most that still leaves you that.`;
  else if (f.by_max) note = `${f.rate}% of your salary would leave more than ${fmtSek(f.max_week)} a week to live on, so this plan saves ${pct(f.save_rate)}: what's above that goes to your future.`;
  else if (f.trip) note = "A trip this pay period: no most to live on.";
  const save = saveOf(f);
  const parts = [];
  if (bs.goal_rows.length) parts.push(`goals ${plainNumber(f.goals)} (${bs.goal_rows.map(([n, m]) => `${n} ${plainNumber(m)}`).join(", ")})`);
  if (f.to_buffer > 0) parts.push(`buffer ${plainNumber(f.to_buffer)}`);
  if (kept(f) > 0) parts.push(`savings ${plainNumber(kept(f))}`);
  let saveText = parts.length > 1 || (parts.length && !kept(f)) ? `To your savings account: ${parts.join(" + ")}.` : parts.length ? "To your savings account." : "Nothing this period.";
  if (bs.target > 0 && bs.shortfall <= 0) saveText += kept(f) > 0 ? ` Your buffer is full, so ${pct(bs.keep_share || 0)} of your future money stays in savings, the rest is invested.` : " Your buffer is full.";
  else if (bs.target > 0 && f.to_buffer <= 0) saveText += " The buffer isn't topped up (switched off on the Budget tab).";
  const block = (title, color, value, subText, hint) => h("div", { class: "alloc" },
    h("div", { class: "cap-row" }, dot(color, 8), h("span", { class: "caption" }, title)),
    h("div", { class: "alloc-row" }, h("span", { class: "alloc-value amt" }, value), h("span", { class: "alloc-sub amt" }, subText)),
    h("div", { class: "hint amt-soft" }, hint));
  const actual = summarize(monthFlows(bs.entries).slice(-12));
  const canStart = bs.salary > 0 && !(bs.free < 0) && bs.end > bs.today;
  return card(head(`The ${profileName(f.profile)} plan`, `For ${fmtRange(bs.start, addDays(bs.end, -1))}: move Save and Invest on payday, before you start spending.`),
    warn ? h("div", { class: "warn-note" }, warn) : null,
    note ? h("div", { class: "hint amt-soft plan-note" }, note) : null,
    block("SPEND", LIVING_C, fmtSek(f.living), `≈ ${money(f.living / weeks)} per week`, live.active.some((x) => x.pocket)
      ? "Goes to your Revolut week pockets: beers, eating out, small buys." : "Stays in your everyday account: beers, eating out, small buys."),
    h("div", { class: "hairline" }),
    block("SAVE", BUFFER_C, fmtSek(save), CUR.single ? "" : `≈ ${fmtEur(save * fx)}`, saveText),
    h("div", { class: "hairline" }),
    block("INVEST", INVEST_C, fmtSek(f.invest), CUR.single ? "" : `≈ ${fmtEur(f.invest * fx)}`, `To ${brokersText("your investment account")}: long-term money (5+ years).`),
    h("div", { class: "hairline" }),
    h("div", { class: "rate-text" }, `Your future gets ${pct(f.save_rate)} of your salary (buffer + investing). Goal money is spent later, so it isn't counted.${actual ? ` Over the last 12 months you managed ${pct(actual.rate)} (black mark).` : ""}`),
    rateMeter(f.save_rate, actual ? actual.rate : null),
    canStart ? h("div", { class: "hairline" }) : null,
    canStart && running ? h("button", { type: "button", class: "btn primary wide", disabled: running.profile === f.profile && Math.abs(running.living - f.living) < 1,
      onclick: () => { switching = false; startPlan(ctx, bs.base, f, running); toast(`✓  Switched to ${profileName(f.profile)}`); window.scrollTo({ top: 0, behavior: "smooth" }); } },
    running.profile !== f.profile ? `Switch to the ${profileName(f.profile)} plan`
      : Math.abs(running.living - f.living) < 1 ? `${profileName(f.profile)} is your plan now` : `Update the ${profileName(f.profile)} plan`) : null,
    canStart && !running ? h("button", { type: "button", class: "btn primary wide", onclick: () => { startPlan(ctx, bs.base, f); toast(`✓  ${profileName(f.profile)} plan started`); } },
      `Start the ${profileName(f.profile)} plan`) : null,
    canStart ? h("div", { class: "hint" }, running
      ? `Same pay period, from payday ${shortDate(bs.start)} to the day before payday ${shortDate(bs.end)}. Your check-ins and ticks stay.`
      : "Keeps these numbers until payday, so you can follow them through the month: this week's money, check-ins, and a tick when you've moved Save and Invest.") : null);
}

/** No saved budget for this pay period yet: save it on the Budget tab first. */
function saveFirstCard(live, ctx, nextSaved) {
  return card(head("First, save your budget", `For ${fmtRange(live.start, addDays(live.end, -1))}`),
    h("div", { class: "muted amt-soft" }, live.salary > 0
      ? `On the Budget tab, check your salary (${fmtSek(live.salary)}) and fixed costs (${fmtSek(live.fixed)}), then tap Save for My plan. Your saving plan is worked out from what's left: ${fmtSek(Math.max(live.left, 0))} right now.`
      : "On the Budget tab, enter your salary and fixed costs, then tap Save for My plan. Your saving plan is worked out from what's left."),
    nextSaved ? h("div", { class: "hint amt-soft plan-prev" }, `You've saved the budget for the next pay period: you can pick its plan from payday, ${shortDate(live.end)}.`) : null,
    h("div", { class: "card-actions" }, h("button", { type: "button", class: "btn primary small", onclick: () => ctx.go("budget") }, "Open Budget")));
}

export function renderPlan(ctx) {
  if (!ctx.data) return ["", null];
  const [live] = periodSnapshot(ctx);
  const base = live.base;
  const saved = loadBudgets(ctx.data)[base] || null;
  const bs = saved ? budgetFor(ctx, base, saved, live.start, live.end) : null;
  const changes = saved ? budgetChanges(saved, live) : [];
  const nextBase = addMonths(base, 1);
  const next = loadPlans(ctx.data)[nextBase] || null;
  const foot = h("div", { class: "hint page-foot" }, `The plans are rules of thumb (${inSweden() ? "Swedbank, Finansinspektionen, the 50/30/20 rule" : "common guidance and the 50/30/20 rule"}), not financial advice. Change the % and the minimums to fit you.`);
  const checklist = paydayChecklist(ctx, live, saved, changes);
  if (!live.plan) {
    if (!bs) return [`${fmtRange(live.start, addDays(live.end, -1))}  ·  save your budget first`,
      checklist || saveFirstCard(live, ctx, Boolean(loadBudgets(ctx.data)[nextBase])),
      foldable("actions", actionsCard(ctx, live)),
      foldable("past", pastCard(ctx, base))];
    const prev = loadPlans(ctx.data)[addMonths(base, -1)] || null;
    return [`${fmtRange(live.start, addDays(live.end, -1))}  ·  pick a saving plan`,
      checklist,
      budgetCard(bs, changes, ctx),
      tilesCard(bs, ctx),
      prev ? h("div", { class: "card plan-next amt-soft" }, `Last pay period you followed ${profileName(prev.profile)} and saved ${pct(prev.save_rate || 0)}.`) : null,
      previewCard(bs, live, ctx),
      foldable("actions", actionsCard(ctx, live)),
      foldable("past", pastCard(ctx, base)),
      foot];
  }
  const snap = live;
  const pr = planProgress(snap.plan, snap.start, snap.end, snap.today);
  // switching: the plans from the saved budget (or the budget as it is, if you haven't saved one)
  const sw = switching ? (bs || budgetFor(ctx, base, budgetToSave(live, ctx.today), live.start, live.end)) : null;
  const toPayday = daysBetween(snap.today, snap.end);
  return [`${profileName(snap.plan.profile)} plan  ·  ${fmtRange(snap.start, addDays(snap.end, -1))}  ·  ${toPayday === 1 ? "payday tomorrow" : `payday in ${toPayday} days`}`,
    checklist,
    changes.length && bs && !checklist ? h("div", { class: "card" }, unsavedNote(changes, ctx, bs)) : null,
    weekCard(snap, pr, ctx),
    sw ? tilesCard(sw, ctx) : null,
    sw ? previewCard(sw, live, ctx, snap.plan) : null,
    checkCard(snap, pr),
    movesCard(snap),
    next ? h("div", { class: "card plan-next amt-soft" }, `Next pay period: your ${profileName(next.profile)} plan is ready and starts on payday, ${shortDate(snap.end)}.`) : null,
    foldable("split", splitCard(snap)),
    foldable("builds", buildsCard(snap)),
    foldable("actions", actionsCard(ctx, snap)),
    foldable("weeks", weeksCard(snap, pr)),
    foldable("details", detailsCard(snap, ctx, bs), planChanges(snap.plan, bs).changed),     // open when it offers an update
    foldable("past", pastCard(ctx, base))];
}
