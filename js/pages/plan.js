// My plan: the saving plan you started for this pay period, day by day (the target button at the top).
// The plan keeps its numbers until payday; this page shows where you are in it: this week's money, a
// check-in against what's left, the payday transfers to tick off, what the plan builds, and past plans.
import { h, chip, dot, splitBar, toggle, toast, alertBox, kv } from "../ui.js";
import {
  COLORS, PROFILE_DEFS, budgetSnapshot, planForRate, loadPlans, defaultPeriodMonth, paydayFor, addMonths, mIndex,
  daysBetween, addDays, isoDay, fmtRange, shortDate, fmtSek, pct, roundTo10, plainNumber, parseNumber, plural,
  usualSpending, planProgress, planCheck, currentPeriod, futureValue, investedSek, brokersText, localSym, mLong,
  getSetting, hasMoney,
} from "../core.js";
import { store } from "../store.js";

const FIXED_C = "var(--gray3)", LIVING_C = COLORS.purple, GOALS_C = COLORS.teal, BUFFER_C = COLORS.blue, INVEST_C = COLORS.orange;
const card = (...children) => h("div", { class: "card" }, children);
const head = (title, sub = null, right = null) => h("div", { class: "card-head" },
  h("div", { class: "card-head-text" }, h("div", { class: "card-title" }, title),
    sub ? h("div", { class: `card-sub ${typeof sub === "string" && hasMoney(sub) ? "amt-soft" : ""}` }, sub) : null), right);
const asDay = (iso) => new Date(`${iso}T12:00:00`);
const when = (iso, today) => (iso === isoDay(today) ? "today" : `on ${shortDate(asDay(iso))}`);
const money = (v) => fmtSek(roundTo10(v));

// ---------------------------------------------------------------------------
// Shared with the Budget page
// ---------------------------------------------------------------------------
export const profileName = (key) => PROFILE_DEFS.find(([k]) => k === key)?.[1] || "Your";

/** Fix a pay period's plan from the budget as it is now. Updating one keeps its check-ins and ticks. */
export function startPlan(snap, ctx, keep = null) {
  const plan = { profile: snap.profile, rate: snap.rate_pct, floor_week: snap.floor_week, salary: snap.salary, fixed: snap.fixed,
    goals: snap.goals, living: snap.living, to_buffer: snap.to_buffer, invest: snap.invest, future: snap.future,
    save_rate: snap.save_rate, days: snap.days, started: keep?.started || isoDay(ctx.today),
    ...(keep ? { updated: isoDay(ctx.today) } : {}), done: keep?.done || { save: false, invest: false }, checks: keep?.checks || [] };
  const plans = { ...loadPlans(store.data), [snap.base]: plan };
  for (const k of Object.keys(plans).sort().slice(0, -24)) delete plans[k];      // the last two years
  store.setSetting("period_plans", plans);
}
export function setPlan(base, plan) {
  const plans = { ...loadPlans(store.data) };
  if (plan) plans[base] = plan; else delete plans[base];
  store.setSetting("period_plans", plans);
}
export async function stopPlan(base) {
  const ok = await alertBox({ title: "Stop this plan?", message: "The Budget page goes back to working the plan out from your numbers as they are. You can start it again.",
    buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Stop", value: true, style: "destructive" }] });
  if (ok) { setPlan(base, null); toast("Plan stopped"); }
}

/** Has the budget changed since the plan was started (profile, salary, costs, goals)? */
export function planChanges(snap) {
  const P = snap.plan;
  const changed = snap.salary > 0 && (snap.profile !== P.profile || Math.abs(snap.living - P.living) > 50
    || Math.abs(snap.future - P.future) > 50 || Math.abs(snap.goals - P.goals) > 50);
  const why = [snap.profile !== P.profile ? `you picked ${profileName(snap.profile)}` : null,
    Math.abs(snap.salary - P.salary) > 0.5 ? "the salary" : null, Math.abs(snap.fixed - P.fixed) > 0.5 ? "the fixed costs" : null,
    Math.abs(snap.goals - P.goals) > 0.5 ? "the goals" : null].filter(Boolean);
  return { changed, why };
}

/** The money to move on payday, each ticked off when it's done. */
export function paydayMoves(snap) {
  const P = snap.plan, done = P.done || {};
  const save = P.goals + P.to_buffer;
  const moves = [
    save > 0 ? ["save", `Save ${fmtSek(save)}`, `To your savings account${P.goals > 0 && P.to_buffer > 0 ? `: goals ${fmtSek(P.goals)} + buffer ${fmtSek(P.to_buffer)}` : P.goals > 0 ? ": your saving goals" : ": your buffer"}`, BUFFER_C] : null,
    P.invest > 0 ? ["invest", `Invest ${fmtSek(P.invest)}`, `To ${brokersText("your investment account")}`, INVEST_C] : null,
  ].filter(Boolean);
  const rows = moves.map(([key, title, subText, color]) => {
    const sw = toggle(Boolean(done[key]), (on) => setTimeout(() => setPlan(snap.base, { ...P, done: { ...done, [key]: on } }), 220), title);
    return h("label", { class: "list-row move-row" }, dot(color, 10),
      h("div", { class: "row-main" }, h("div", { class: `row-title amt ${done[key] ? "moved" : ""}` }, title), h("div", { class: "row-sub amt-soft" }, subText)), sw);
  });
  return { rows, count: moves.length, all_done: moves.length > 0 && moves.every(([key]) => done[key]) };
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
function weekCard(snap, pr) {
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
      + (pr.week_index + 1 < pr.weeks.length ? ` Next week: ${money(pr.per_day * pr.weeks[pr.week_index + 1].days)}.` : " Next up: payday.")));
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
    const diffText = Math.abs(r.diff) < 10 ? "exactly what the plan has" : `${money(Math.abs(r.diff))} ${r.diff > 0 ? "more" : "less"} than the plan has`;
    const age = daysBetween(asDay(last.date), today);
    result = h("div", { class: "check-result" },
      h("div", { class: "cap-row" }, chip(r.status, r.tone), h("span", { class: "hint" }, `${fmtSek(last.left)} left ${when(last.date, today)}`)),
      h("div", { class: "check-line amt-soft" }, `The plan has ${money(r.expected)} for the ${plural(r.days_left, "day")} from ${last.date === isoDay(today) ? "today" : "then"} to payday: that's ${diffText}.`),
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
    older.length ? h("div", { class: "check-history" }, older) : null);
}

function movesCard(snap) {
  const m = paydayMoves(snap);
  if (!m.count) return null;
  return card(head("On payday, move", m.all_done ? "✓ Done. What's left in your everyday account is yours to spend." : "As soon as the salary lands, before you start spending."),
    h("div", { class: "list" }, m.rows),
    h("div", { class: "hint" }, "Tick them off when you've moved the money. Standing transfers make it automatic."));
}

/** Where the salary goes in this plan. */
function splitCard(snap) {
  const P = snap.plan;
  const parts = [["Fixed costs", P.fixed, FIXED_C], ["Saving goals", P.goals, GOALS_C], ["Buffer", P.to_buffer, BUFFER_C],
    ["Investing", P.invest, INVEST_C], ["Living money", P.living, LIVING_C]].filter(([, v]) => v > 0.5);
  const aimed = P.rate !== undefined && P.save_rate < P.rate / 100 - 0.005;
  return card(head("Where the salary goes", `${fmtSek(P.salary)} this pay period`),
    splitBar(parts.map(([, v, c]) => [v, c]), 12),
    h("div", { class: "legend-list" }, parts.map(([name, v, c]) => h("div", { class: "legend-row" }, dot(c, 9), h("span", { class: "legend-name" }, name),
      h("span", { class: "legend-amount amt" }, fmtSek(v)), h("span", { class: "legend-pct" }, P.salary > 0 ? `${Math.round(v / P.salary * 100)}%` : "")))),
    h("div", { class: "hint amt-soft" }, `Your future gets ${pct(P.save_rate || 0)} of your salary (buffer + investing).`
      + (aimed ? ` You aimed for ${P.rate}%, but that would have left less than ${fmtSek(P.floor_week)} a week to live on.` : "")));
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
    const text = snap.bank >= snap.target ? "Full: all of this plan's future money can go to investing."
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
  const year = (P.goals + P.to_buffer + P.invest) * 12;
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
function detailsCard(snap, ctx) {
  const P = snap.plan;
  const { changed, why } = planChanges(snap);
  const aimed = P.rate !== undefined && P.save_rate < P.rate / 100 - 0.005;
  const update = () => { startPlan(snap, ctx, P); toast(`✓  Plan updated: ${profileName(snap.profile)}`); };
  return card(head("The plan", `Started ${shortDate(asDay(P.started))}${P.updated ? `, updated ${shortDate(asDay(P.updated))}` : ""}`),
    changed ? h("div", { class: "warn-note" }, `Your budget has changed since you started${why.length ? ` (${why.join(", ")})` : ""}: the plan would now be ${money(snap.living / (snap.days / 7))} a week to spend, ${fmtSek(snap.goals + snap.to_buffer)} to save and ${fmtSek(snap.invest)} to invest.`,
      h("div", { class: "note-actions" }, h("button", { type: "button", class: "btn tinted small", onclick: update }, "Update the plan"))) : null,
    h("div", { class: "kv-list" },
      kv("Profile", profileName(P.profile), { amt: false }),
      kv("Saves", `${pct(P.save_rate || 0)} of your salary${aimed ? ` (aimed for ${P.rate}%)` : ""}`, { amt: false }),
      P.floor_week ? kv("Lives on at least", `${fmtSek(P.floor_week)} a week`) : null,
      kv("Salary", fmtSek(P.salary)),
      kv("Fixed costs", fmtSek(P.fixed)),
      P.goals > 0 ? kv("Saving goals", fmtSek(P.goals)) : null,
      kv("Pay period", `${fmtRange(snap.start, addDays(snap.end, -1))}, ${snap.days} days`, { amt: false })),
    h("div", { class: "card-actions" },
      h("button", { type: "button", class: "btn tinted small", onclick: () => ctx.go("budget") }, "Open Budget"),
      h("button", { type: "button", class: "btn plain small", onclick: () => stopPlan(snap.base) }, "Stop the plan")));
}

/** The plans of the pay periods before. */
function pastCard(ctx, base) {
  const plans = loadPlans(ctx.data);
  const rows = Object.keys(plans).filter((k) => k < base).sort().reverse().slice(0, 12).map((k) => {
    const P = plans[k];
    const start = paydayFor(k), end = paydayFor(addMonths(k, 1));
    const moves = [P.goals + P.to_buffer > 0 ? "save" : null, P.invest > 0 ? "invest" : null].filter(Boolean);
    const moved = moves.length && moves.every((m) => P.done?.[m]);
    return h("div", { class: "past-plan" },
      h("div", { class: "row-main" }, h("div", { class: "row-title" }, `${profileName(P.profile)}, ${fmtRange(start, addDays(end, -1))}`),
        h("div", { class: "row-sub amt-soft" }, `Saved ${pct(P.save_rate || 0)}: ${fmtSek(P.goals + P.to_buffer + P.invest)} put aside, ${fmtSek(P.living)} to live on`)),
      moves.length ? chip(moved ? "✓ Moved" : "Not ticked", moved ? "up" : "flat", "small") : null);
  });
  if (!rows.length) return null;
  return card(head("Your past plans", `${plural(rows.length, "pay period")}`), h("div", { class: "list" }, rows));
}

/** No plan for this pay period yet: the profiles, ready to start. */
function noPlanCard(snap, ctx, offset, next) {
  const ready = snap.salary > 0 && snap.fixed > 0;
  const prev = loadPlans(ctx.data)[addMonths(snap.base, -1)] || null;
  const weeks = snap.days / 7;
  const usual = ready ? usualSpending(snap.entries, snap.fixed) : null;
  const start = (key) => {
    if (getSetting(store.data, "profile", "balanced") !== key) store.setSetting("profile", key);
    const fresh = budgetSnapshot(store.data, ctx.today, offset);
    startPlan(fresh, ctx);
    toast(`✓  ${profileName(key)} plan started`);
  };
  const rows = ready ? PROFILE_DEFS.map(([key, title]) => {
    const p = planForRate(snap, snap.profiles[key], snap.floors[key]);
    return h("div", { class: `plan-pick ${key === snap.profile ? "picked" : ""}` },
      h("div", { class: "row-main" }, h("div", { class: "row-title" }, title),
        h("div", { class: "row-sub amt-soft" }, `≈ ${money(p.spend / weeks)} a week to spend  ·  saves ${pct(p.rate)}`)),
      h("button", { type: "button", class: `btn ${key === snap.profile ? "primary" : "tinted"} small`, onclick: () => start(key) }, "Start"));
  }) : [];
  return card(head("No plan for this pay period yet", ready
    ? `Pick one for ${fmtRange(snap.start, addDays(snap.end, -1))}: it keeps its numbers until payday, and this page follows it day by day.`
    : "Log a month and fill in your fixed costs on the Budget page first: the plans are worked out from them."),
  prev ? h("div", { class: "hint amt-soft plan-prev" }, `Last pay period you followed ${profileName(prev.profile)} and saved ${pct(prev.save_rate || 0)}.`) : null,
  next ? h("div", { class: "hint amt-soft plan-prev" }, `Your ${profileName(next.profile)} plan for the next pay period is ready: it starts on payday, ${shortDate(paydayFor(addMonths(snap.base, 1)))}.`) : null,
  rows.length ? h("div", { class: "list" }, rows) : null,
  usual ? h("div", { class: "hint amt-soft" }, `You usually spend about ${money(usual.week)} a week beyond your fixed costs.`) : null,
  h("div", { class: "card-actions" }, h("button", { type: "button", class: "btn plain small", onclick: () => ctx.go("budget") }, "Compare them on the Budget page")));
}

export function renderPlan(ctx) {
  if (!ctx.data) return ["", null];
  const [snap, offset] = periodSnapshot(ctx);
  const next = loadPlans(ctx.data)[addMonths(snap.base, 1)] || null;
  if (!snap.plan) {
    return [`${fmtRange(snap.start, addDays(snap.end, -1))}  ·  no plan started yet`, noPlanCard(snap, ctx, offset, next), pastCard(ctx, snap.base)];
  }
  const pr = planProgress(snap.plan, snap.start, snap.end, snap.today);
  const toPayday = daysBetween(snap.today, snap.end);
  return [`${profileName(snap.plan.profile)} plan  ·  ${fmtRange(snap.start, addDays(snap.end, -1))}  ·  ${toPayday === 1 ? "payday tomorrow" : `payday in ${toPayday} days`}`,
    weekCard(snap, pr),
    checkCard(snap, pr),
    movesCard(snap),
    next ? h("div", { class: "card plan-next amt-soft" }, `Next pay period: your ${profileName(next.profile)} plan is ready and starts on payday, ${shortDate(snap.end)}.`) : null,
    splitCard(snap),
    buildsCard(snap),
    weeksCard(snap, pr),
    detailsCard(snap, ctx),
    pastCard(ctx, snap.base)];
}
