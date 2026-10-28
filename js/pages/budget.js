// Budget: fixed costs and goals first, then your future, and the rest is yours to live on.
import { h, chip, dot, segmented, toggle, icon, splitBar, toast, alertBox } from "../ui.js";
import {
  COLORS, PROFILE_DEFS, CATEGORIES, CATEGORY_COLORS, GOAL_COLORS, BUFFER_MONTH_CHOICES,
  budgetSnapshot, planForRate, paydayStatus, paydayReason, paydayFor, addMonths, monthOf, daysBetween, addDays,
  fmtRange, shortDate, longDate, mLong, mShort, mIndex, fmtSek, fmtEur, plainNumber, parseNumber, pct, roundTo10,
  weekChunks, summarize, monthFlows, travelFund, expenseApplies, expenseMonthlySek, goalApplies, goalPerMonth,
  goalPlannedBy, fetchSekToEur, CUR, inSweden, localSym, brokersText, hasMoney, rateFromInput, rateShown,
  usualSpending, loadPlans, isoDay,
} from "../core.js";
import { store } from "../store.js";
import { openExpenseSheet, openGoalSheet, openProfilesSheet } from "./budget-sheets.js";
import { startPlan, stopPlan, planChanges, paydayMoves, profileName } from "./plan.js";

const FIXED_C = "var(--gray3)", LIVING_C = COLORS.purple, GOALS_C = COLORS.teal, BUFFER_C = COLORS.blue, INVEST_C = COLORS.orange;

let offset = 0;              // pay periods away from the current one

const card = (...children) => h("div", { class: "card" }, children);
const head = (title, sub = null, right = null) => h("div", { class: "card-head" },
  h("div", { class: "card-head-text" }, h("div", { class: "card-title" }, title), sub ? h("div", { class: `card-sub ${typeof sub === "string" && hasMoney(sub) ? "amt-soft" : ""}` }, sub) : null),
  right);
const addBtn = (onClick) => h("button", { type: "button", class: "btn tinted small", onclick: onClick }, "+  Add");
const weekOf = (snap) => snap.days / 7;

// ---------------------------------------------------------------------------
function paydayCard(today) {
  const ps = paydayStatus(today);
  const days = daysBetween(today, ps.next);
  const frac = Math.min(1, daysBetween(ps.prev, today) / Math.max(daysBetween(ps.prev, ps.next), 1));
  const R = 44, C = 2 * Math.PI * R;
  const ring = h("div", { class: "ring", html:
    `<svg viewBox="0 0 104 104" width="104" height="104" aria-hidden="true">
       <circle cx="52" cy="52" r="${R}" class="ring-track"/>
       <circle cx="52" cy="52" r="${R}" class="ring-fill" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 52 52)"/>
     </svg>` },
  h("div", { class: "ring-text" }, h("div", { class: "ring-days" }, String(days)), h("div", { class: "ring-sub" }, days === 1 ? "day to go" : "days to go")));
  const reason = paydayReason(ps.next);
  const after = [1, 2, 3].map((k) => {
    const p = paydayFor(addMonths(monthOf(ps.next), k));
    const why = paydayReason(p);
    return h("div", { class: "kv" }, h("span", { class: "kv-label" }, shortDate(p)), h("span", { class: "kv-value muted" }, why ? `25th is ${why}` : "on the 25th"));
  });
  return card(
    h("div", { class: "payday" }, ring,
      h("div", { class: "payday-text" },
        h("div", { class: "caption" }, "NEXT PAYDAY"),
        ps.isToday ? chip("It's payday today!", "up") : null,
        h("div", { class: "payday-date" }, longDate(ps.next)),
        h("div", { class: "hint" }, reason ? `The 25th is ${reason}, so salary comes the banking day before.` : "Paid on the 25th as usual."))),
    h("div", { class: "hairline" }),
    h("div", { class: "caption" }, "AFTER THAT"), after);
}

// ---------------------------------------------------------------------------
function periodCard(snap, ctx) {
  const { start, end, days, fx, latest, salary, today } = snap;
  const kind = start <= today && today < end ? "Now" : start > today ? "Upcoming" : "Past";
  const stepper = h("div", { class: "period-stepper" },
    h("button", { type: "button", class: "stepper", "aria-label": "Previous pay period", onclick: () => { offset -= 1; ctx.refresh(); } }, icon("chevronLeft", 17)),
    h("div", { class: "period-label" }, `${fmtRange(start, addDays(end, -1))}  ·  ${days} days`),
    h("button", { type: "button", class: "stepper", "aria-label": "Next pay period", onclick: () => { offset += 1; ctx.refresh(); } }, icon("chevron", 17)));

  const salaryInput = h("input", { class: "eq-input amt", type: "text", inputmode: "decimal", autocomplete: "off",
    value: salary ? plainNumber(salary) : "", placeholder: "0", "aria-label": "Salary" });
  salaryInput.addEventListener("change", () => {
    const v = parseNumber(salaryInput.value);
    if (v === null) { salaryInput.value = salary ? plainNumber(salary) : ""; return; }
    // kept in the data file (and on your other devices) until you tap "Use latest"
    store.setSetting("budget_salary", latest && Math.abs(v - latest.income_sek) < 0.5 ? null : v);
  });
  const src = snap.salary_kept ? (latest ? "Your own figure, kept until you tap “Use latest”" : "Your own figure") : latest ? `From your ${mLong(latest.month)} log` : "Log a month first";

  const fxInput = h("input", { class: "fx-input", type: "text", inputmode: "decimal", autocomplete: "off", value: rateShown(fx), "aria-label": `${CUR.local} per ${CUR.second}` });
  fxInput.addEventListener("change", () => {
    const v = parseNumber(fxInput.value, true);
    if (v === null || v <= 0) { fxInput.classList.add("invalid"); return; }
    store.setSetting("budget_rate", { sek_to_eur: rateFromInput(v, fx), source: "Your rate" });
  });
  const fetchBtn = h("button", { type: "button", class: "btn tinted small" }, "Fetch");
  fetchBtn.addEventListener("click", async () => {
    fetchBtn.disabled = true; fetchBtn.textContent = "…";
    try {
      const [rate, d] = await fetchSekToEur(monthOf(today), today);
      store.setSetting("budget_rate", { sek_to_eur: rate, source: `ECB rate of ${d}` });
      toast(`✓  1 ${CUR.second} = ${rateShown(rate)} ${CUR.local}`);
    } catch {
      toast("Couldn't fetch the rate. Check your connection, or type it in.");
      fetchBtn.disabled = false; fetchBtn.textContent = "Fetch";
    }
  });

  const legend = [["fixed", "Fixed costs", FIXED_C], ["goals", "Saving goals", GOALS_C], ["living", "Living money", LIVING_C],
    ["to_buffer", "Buffer", BUFFER_C], ["invest", "Investing", INVEST_C]].map(([k, text, color]) =>
    h("div", { class: "legend-row" }, dot(color, 9), h("span", { class: "legend-name" }, text),
      h("span", { class: "legend-amount amt" }, fmtSek(snap[k])),
      h("span", { class: "legend-pct" }, salary > 0 ? `${Math.round(snap[k] / salary * 100)}%` : "")));

  return card(
    h("div", { class: "card-head" }, h("div", { class: "cap-row" }, h("span", { class: "caption" }, "PAY PERIOD"), chip(kind, kind === "Now" ? "info" : "flat"))),
    stepper,
    h("div", { class: "eq" },
      h("label", { class: "eq-row" }, h("span", { class: "eq-label" }, "Salary"), salaryInput, h("span", { class: "eq-unit" }, localSym())),
      h("div", { class: "eq-note" }, src, snap.salary_kept && latest
        ? h("button", { type: "button", class: "link-btn", onclick: () => store.setSetting("budget_salary", null) }, "Use latest") : null),
      h("div", { class: "eq-row" }, h("span", { class: "eq-label" }, h("span", { class: "eq-sign" }, "−"), "Fixed costs"),
        h("span", { class: "eq-value amt" }, fmtSek(snap.fixed))),
      h("div", { class: "eq-note" }, `${snap.active.length} active costs`),
      h("div", { class: "eq-row total" }, h("span", { class: "eq-label" }, h("span", { class: "eq-sign" }, "="), "Left to plan"),
        h("span", { class: `eq-value big amt tone-text-${snap.left > 0 ? "up" : "down"}` }, fmtSek(snap.left))),
      h("div", { class: "eq-note amt" }, snap.left < 0 ? "Fixed costs are higher than the salary" : CUR.single ? null : `≈ ${fmtEur(snap.left * fx)}`)),
    splitBar([[snap.fixed, FIXED_C], [snap.goals, GOALS_C], [snap.living, LIVING_C], [snap.to_buffer, BUFFER_C], [snap.invest, INVEST_C]], 12),
    h("div", { class: "legend-list" }, legend),
    CUR.single ? null : h("div", { class: "hairline" }),
    CUR.single ? null : h("div", { class: "fx-row" }, h("span", { class: "caption" }, "EXCHANGE RATE"), h("span", { class: "fx-eq" }, `1 ${CUR.second} =`), fxInput, h("span", null, CUR.local), fetchBtn),
    CUR.single ? null : h("div", { class: "eq-note" }, snap.fx_src, snap.fx_override && latest
      ? h("button", { type: "button", class: "link-btn", onclick: () => store.setSetting("budget_rate", null) }, "Use latest log") : null));
}

// ---------------------------------------------------------------------------
const rateTone = (r) => (r >= 0.195 ? "up" : r >= 0.095 ? "flat" : "down");

function profilesCard(snap, ctx) {
  const weeks = weekOf(snap);
  const left = Math.max(snap.left, 0);
  // what you really spend a week beyond your fixed costs, from your logs: how far each plan is from it
  const usual = snap.salary > 0 && snap.fixed > 0 ? usualSpending(snap.entries, snap.fixed) : null;
  const tiles = PROFILE_DEFS.map(([key, title, tagline]) => {
    const rate = snap.profiles[key], floor = snap.floors[key];
    const p = planForRate(snap, rate, floor);
    const chipEl = p.short ? chip("Doesn't fit", "down")
      : p.capped ? chip(`Saves ${pct(p.rate)} of salary`, rateTone(p.rate))
        : chip(`Saves ${rate}% of salary`, rateTone(rate / 100));
    const why = !snap.salary ? null
      : p.short ? `Even ${fmtSek(floor)} a week to live on doesn't fit after your fixed costs and goals.`
        : p.capped ? `${rate}% would leave less than ${fmtSek(floor)} a week to live on, so it saves ${pct(p.rate)}.`
          : `Never less than ${fmtSek(floor)} a week to live on.`;
    const diff = usual && snap.salary ? p.spend / weeks - usual.week : null;
    const vsUsual = diff === null ? null : Math.abs(diff) < 50 ? "About what you usually spend."
      : `${fmtSek(roundTo10(Math.abs(diff)))} a week ${diff < 0 ? "less" : "more"} than you usually spend.`;
    const cols = [["spend", "Spend", LIVING_C], ["save", "Save", COLORS.blue], ["invest", "Invest", COLORS.orange]].map(([part, text, color]) =>
      h("div", { class: "tile-col" }, h("div", { class: "tile-cap" }, dot(color, 7), text),
        h("div", { class: "tile-amount amt" }, fmtSek(p[part])),
        h("div", { class: "tile-pct" }, left > 0 ? `${Math.round(p[part] / left * 100)}%` : "")));
    return h("button", { type: "button", class: `tile ${key === snap.profile ? "selected" : ""}`, "aria-pressed": String(key === snap.profile),
      onclick: () => { if (key !== snap.profile) store.setSetting("profile", key); } },
      h("div", { class: "tile-head" }, h("div", null, h("div", { class: "tile-title" }, title), h("div", { class: "hint" }, tagline)), chipEl),
      h("div", { class: "tile-week" }, h("span", { class: "tile-value amt" }, snap.salary > 0 ? `≈ ${fmtSek(roundTo10(p.spend / weeks))}` : "—"), h("span", { class: "hint" }, " per week to spend")),
      splitBar([[p.spend, LIVING_C], [p.save, COLORS.blue], [p.invest, COLORS.orange]], 6),
      h("div", { class: "tile-cols" }, cols),
      why ? h("div", { class: `tile-why amt-soft ${p.short ? "tone-text-down" : ""}` }, why) : null,
      vsUsual ? h("div", { class: "tile-why amt-soft" }, vsUsual) : null);
  });
  return card(
    head("How much do you want to save?", "Each profile puts a share of your salary toward your future, but always leaves you a minimum to live on. The rest, after fixed costs and goals, is yours to spend.",
      h("button", { type: "button", class: "link-btn", onclick: () => openProfilesSheet(ctx, snap) }, "Edit")),
    h("div", { class: "tiles" }, tiles),
    usual ? h("div", { class: "hint amt-soft" }, `You usually spend about ${fmtSek(roundTo10(usual.week))} a week beyond your fixed costs: the middle of your last ${usual.months} months of logs, trip months left out.`) : null);
}

// ---------------------------------------------------------------------------
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

function planCard(snap, ctx) {
  if (snap.plan) return startedPlanCard(snap, ctx);
  const { fx, salary } = snap;
  const weeks = weekOf(snap);
  const ps = paydayStatus(snap.today);
  const when = ps.isToday ? "today" : shortDate(ps.next);
  const sub = salary > 0
    ? `After ${fmtSek(snap.fixed)} of fixed costs, ${fmtSek(Math.max(snap.left, 0))} is left. Move Save and Invest on payday (${when}), before you start spending.`
    : "Log a month to see your plan.";
  let warn = "", note = "";
  if (salary > 0 && snap.free < 0) warn = "Fixed costs and goals are higher than your salary, so nothing is left for your future or living.";
  else if (salary > 0 && snap.short) warn = `Even ${fmtSek(snap.floor_week)} a week to live on doesn't fit: after fixed costs and goals, ${fmtSek(Math.max(snap.free, 0))} is left for ${snap.days} days. Pause a goal or trim a fixed cost.`;
  else if (salary > 0 && snap.capped) note = `${snap.rate_pct}% of your salary would leave less than ${fmtSek(snap.floor_week)} a week to live on, so this plan saves ${pct(snap.save_rate)}: the most that still leaves you that.`;

  const save = snap.goals + snap.to_buffer;
  const parts = [];
  if (snap.goal_rows.length) parts.push(`goals ${plainNumber(snap.goals)} (${snap.goal_rows.map(([g, m]) => `${g.name} ${plainNumber(m)}`).join(", ")})`);
  if (snap.to_buffer > 0) parts.push(`buffer ${plainNumber(snap.to_buffer)}`);
  let saveText = parts.length ? `To your savings account: ${parts.join(" + ")}.` : "Nothing this period.";
  if (snap.target > 0 && snap.shortfall <= 0) saveText += " Your buffer is full.";
  else if (snap.target > 0 && snap.to_buffer <= 0) saveText += " The buffer isn't topped up (switched off below).";

  const block = (title, color, value, subText, hint) => h("div", { class: "alloc" },
    h("div", { class: "cap-row" }, dot(color, 8), h("span", { class: "caption" }, title)),
    h("div", { class: "alloc-row" }, h("span", { class: "alloc-value amt" }, value), h("span", { class: "alloc-sub amt" }, subText)),
    h("div", { class: "hint amt-soft" }, hint));

  const actual = summarize(monthFlows(snap.entries).slice(-12));
  let rateText = "Log a month to see your savings rate";
  if (salary > 0) {
    rateText = `Your future gets ${pct(snap.save_rate)} of your salary (buffer + investing). Goal money is spent later, so it isn't counted.`;
    if (actual) rateText += ` Over the last 12 months you managed ${pct(actual.rate)} (black mark).`;
  }
  const canStart = salary > 0 && snap.end > snap.today && !(snap.free < 0);
  return card(head("Your plan for this pay period", sub),
    warn ? h("div", { class: "warn-note" }, warn) : null,
    note ? h("div", { class: "hint amt-soft plan-note" }, note) : null,
    block("SPEND", LIVING_C, fmtSek(snap.living), `≈ ${fmtSek(roundTo10(snap.living / weeks))} per week`,
      "Stays in your everyday account: beers, eating out, small buys. Split week by week below."),
    h("div", { class: "hairline" }),
    block("SAVE", COLORS.blue, fmtSek(save), CUR.single ? "" : `≈ ${fmtEur(save * fx)}`, saveText),
    h("div", { class: "hairline" }),
    block("INVEST", COLORS.orange, fmtSek(snap.invest), CUR.single ? "" : `≈ ${fmtEur(snap.invest * fx)}`, `To ${brokersText("your investment account")}: long-term money (5+ years).`),
    h("div", { class: "hairline" }),
    h("div", { class: "rate-text" }, rateText),
    rateMeter(snap.save_rate, actual && salary > 0 ? actual.rate : null),
    canStart ? h("div", { class: "hairline" }) : null,
    canStart ? h("button", { type: "button", class: "btn primary wide", onclick: () => { startPlan(snap, ctx); toast(`✓  ${profileName(snap.profile)} plan started`); } },
      `Start the ${profileName(snap.profile)} plan`) : null,
    canStart ? h("div", { class: "hint" }, `Keeps these numbers for ${fmtRange(snap.start, addDays(snap.end, -1))}, so you can follow them through the month: this week's money, and a tick when you've moved Save and Invest.`) : null);
}

/** The plan you started: its numbers stay put for the whole pay period. */
function startedPlanCard(snap, ctx) {
  const P = snap.plan, today = snap.today;
  const weeks = snap.days / 7;
  const now = snap.start <= today && today < snap.end;
  const past = snap.end <= today;
  const dayN = daysBetween(snap.start, today) + 1;
  const chunks = weekChunks(snap.start, snap.end);
  const wk = now ? chunks.find((w) => w.start <= today && today <= w.end) : null;
  const k = wk ? chunks.indexOf(wk) : -1;
  const weekMoney = (w) => roundTo10(P.living * w.days / snap.days);
  const block = (title, color, value, subText, hint) => h("div", { class: "alloc" },
    h("div", { class: "cap-row" }, dot(color, 8), h("span", { class: "caption" }, title)),
    h("div", { class: "alloc-row" }, h("span", { class: "alloc-value amt" }, value), h("span", { class: "alloc-sub amt" }, subText)),
    hint ? h("div", { class: "hint amt-soft" }, hint) : null);

  // spending: this week's money
  const spend = wk
    ? block(wk.days === 7 ? `WEEK ${k + 1} OF ${chunks.length}` : "THE LAST DAYS", LIVING_C, fmtSek(weekMoney(wk)), `to spend, ${fmtRange(wk.start, wk.end)}`,
      `${fmtSek(P.living)} for the whole pay period, about ${fmtSek(roundTo10(P.living / weeks))} a week.${k + 1 < chunks.length ? ` Next week: ${fmtSek(weekMoney(chunks[k + 1]))}.` : " Payday is next."}`)
    : block("SPEND", LIVING_C, fmtSek(P.living), `≈ ${fmtSek(roundTo10(P.living / weeks))} per week`, past ? null : "Starts on payday.");

  // the money to move on payday, ticked off when it's done; and has the budget changed since?
  const m = paydayMoves(snap);
  const { changed, why } = planChanges(snap);
  const update = () => { startPlan(snap, ctx, P); toast(`✓  Plan updated: ${profileName(snap.profile)}`); };
  const status = past ? chip("Done", "flat") : now ? chip(`Day ${dayN} of ${snap.days}`, "info") : chip("Upcoming", "flat");
  return card(
    head("Your plan for this pay period", `${profileName(P.profile)}, started ${shortDate(new Date(`${P.started}T12:00:00`))}  ·  saves ${pct(P.save_rate || 0)} of your salary`, status),
    changed && !past ? h("div", { class: "warn-note" }, `Your budget has changed since you started${why.length ? ` (${why.join(", ")})` : ""}: the plan would now be ${fmtSek(roundTo10(snap.living / weeks))} a week to spend, ${fmtSek(snap.goals + snap.to_buffer)} to save and ${fmtSek(snap.invest)} to invest.`,
      h("div", { class: "note-actions" }, h("button", { type: "button", class: "btn tinted small", onclick: update }, "Update the plan"))) : null,
    spend,
    m.count ? h("div", { class: "hairline" }) : null,
    m.count ? h("div", { class: "cap-row" }, h("span", { class: "caption" }, "ON PAYDAY, MOVE")) : null,
    m.count ? h("div", { class: "list" }, m.rows) : null,
    m.count ? h("div", { class: "hint" }, m.all_done ? "✓ Done. What's left in your everyday account is yours to spend." : "Tick them off when you've moved the money. Standing transfers make it automatic.") : null,
    h("div", { class: "card-actions" },
      now ? h("button", { type: "button", class: "btn tinted small", onclick: () => ctx.go("plan") }, "Open my plan") : null,
      h("button", { type: "button", class: "btn plain small", onclick: () => stopPlan(snap.base) }, "Stop the plan")));
}

// ---------------------------------------------------------------------------
function switchRow(content, on, onToggle, label) {
  const sw = toggle(on, (v) => setTimeout(() => onToggle(v), 220), label);
  sw.addEventListener("click", (ev) => ev.stopPropagation());
  return [content, sw];
}

function goalRow(g, snap, ctx) {
  const once = g.kind === "once";
  const live = goalApplies(g, snap.base);
  const color = GOAL_COLORS[g.category] || COLORS.gray;
  let sub = once ? `${fmtSek(g.amount)} by ${mShort(g.target_month)}${snap.base > g.target_month ? "  ·  done" : ""}`
    : g.amount ? `${fmtSek(g.amount)} a year` : "every year";
  if (!g.active) sub += "  ·  paused";
  let bar = null;
  if (once && live) {
    const planned = goalPlannedBy(g, snap.base);
    bar = splitBar([[planned, color], [Math.max(g.amount - planned, 0), "var(--fill)"]], 5);
  }
  const amount = g.amount === 0 ? h("span", { class: "row-amount missing" }, "Set amount")
    : h("span", { class: `row-amount amt ${live ? "" : "off"}` }, live ? fmtSek(goalPerMonth(g)) : "—");
  const [content, sw] = switchRow(h("div", { class: "row-main" },
    h("div", { class: `row-title ${live ? "" : "off"}` }, g.name), h("div", { class: "row-sub amt-soft" }, sub), bar), g.active,
  (on) => store.saveGoal({ ...g, active: on }), `Include ${g.name}`);
  return h("div", { class: "list-row", role: "button", tabindex: "0", onclick: () => openGoalSheet(ctx, snap, g) },
    dot(live ? color : "var(--gray3)", 10), content, amount, sw);
}

function goalsCard(snap, ctx) {
  const active = snap.goal_rows.map(([g]) => g);
  const flows = monthFlows(snap.entries).slice(-12);
  const sug = flows.length >= 3 ? travelFund(flows) : null;
  const travelSet = snap.goals_list.some((g) => g.category === "Travel" && goalApplies(g, snap.base));
  const useIt = () => {
    const yearly = Math.round(sug.per_month * 12 / 100) * 100;
    const existing = snap.goals_list.find((g) => g.category === "Travel");
    const goal = existing ? { ...existing, kind: "year", amount: yearly, active: true }
      : { id: null, name: "Trips & travel", category: "Travel", kind: "year", amount: yearly, saved: 0, start_month: null,
        target_month: null, active: true, position: Math.max(-1, ...snap.goals_list.map((x) => x.position)) + 1 };
    store.saveGoal(goal);
    toast(`✓  ${goal.name}: ${fmtSek(yearly)} a year`);
  };
  return card(
    head("Saving goals", active.length ? `${fmtSek(snap.goals)} a month  ·  ${active.length} active` : "Trips, gifts and bigger buys you know are coming",
      addBtn(() => openGoalSheet(ctx, snap, null))),
    sug && !travelSet ? h("div", { class: "tip-box" },
      h("div", { class: "tip-text amt-soft" }, `Your trip months suggest trips cost you about ${fmtSek(sug.per_month)} a month (${fmtSek(sug.per_month * 12)} a year).`),
      h("button", { type: "button", class: "btn tinted small", onclick: useIt }, "Use it")) : null,
    h("div", { class: "list" }, snap.goals_list.length ? snap.goals_list.map((g) => goalRow(g, snap, ctx))
      : h("div", { class: "muted list-empty" }, "No goals yet. Tap “+ Add” to add one.")),
    h("div", { class: "hint" }, "For costs you know are coming but don't pay every month: trips, gifts, a new phone. The monthly amount is the cost spread over the months until you need it."));
}

// ---------------------------------------------------------------------------
function weeksCard(snap) {
  const { start, end, today } = snap;
  const living = snap.plan ? snap.plan.living : snap.living;
  const total = daysBetween(start, end);
  const rows = weekChunks(start, end).map((w, k) => {
    const now = w.start <= today && today <= w.end;
    return h("div", { class: "week-row" },
      h("span", { class: "week-name" }, w.days === 7 ? `Week ${k + 1}` : `Last ${w.days} day${w.days !== 1 ? "s" : ""}`),
      h("span", { class: "muted week-range" }, fmtRange(w.start, w.end)),
      now ? chip(w.days === 7 ? "This week" : "Now", "info", "small") : null,
      h("span", { class: "row-amount amt" }, fmtSek(roundTo10(living * w.days / total))));
  });
  return card(head("Living money, week by week", `${total} days from payday ${shortDate(start)} to the day before ${shortDate(end)}`,
    h("span", { class: "head-value amt" }, `${fmtSek(living)} in total`)), h("div", { class: "list" }, rows));
}

// ---------------------------------------------------------------------------
function bufferCard(snap) {
  const { target, shortfall: short, bank, latest } = snap;
  const months = snap.buffer_months;
  let pctChip = chip("—", "flat"), bar = null, text = "Fill in your fixed costs to see a buffer target.", tip = "";
  if (target > 0) {
    const p = bank / target * 100;
    pctChip = chip(`${Math.round(Math.min(p, 999))}%`, short <= 0 ? "up" : "flat");
    bar = splitBar([[Math.min(bank, target), COLORS.green], [short, "var(--fill)"]], 12);
    const src = latest ? `your ${mLong(latest.month)} log` : "your log";
    text = `${fmtSek(bank)} in the bank (${src}). Target: ${fmtSek(target)}, ${months} months of fixed costs.`;
    if (short > 0 && snap.buffer_first) {
      tip = `${fmtSek(short)} to go. This period ${fmtSek(snap.to_buffer)} of your future money goes here${snap.invest > 0 ? ", the rest to investing." : "."} ${inSweden() ? "Finansinspektionen suggests" : "A common rule of thumb is"} 2–3 months of necessary costs before long-term investing.`;
    } else if (short > 0) tip = `${fmtSek(short)} to go, but with the switch off your future money goes straight to investing.`;
    else if (bank < 2 * target) tip = "Your buffer is full, so all your future money goes to investing. Refill it after you use it.";
    else tip = "You hold more than twice the target in the bank (goal money included). What you won't need for 5+ years could work harder invested.";
  }
  const idx = BUFFER_MONTH_CHOICES.indexOf(months);
  return card(head("Emergency buffer", null, pctChip), bar,
    h("div", { class: "muted amt-soft" }, text),
    h("div", { class: "buffer-target" }, h("span", null, "Target"),
      segmented(BUFFER_MONTH_CHOICES.map(String), idx >= 0 ? idx : 1, (i) => store.setSetting("buffer_months", BUFFER_MONTH_CHOICES[i]), "small"),
      h("span", null, "months of fixed costs")),
    h("label", { class: "switch-line" }, h("span", null, "Fill the buffer before investing"),
      toggle(snap.buffer_first, (on) => setTimeout(() => store.setSetting("buffer_first", on), 220), "Fill the buffer before investing")),
    tip ? h("div", { class: "hint amt-soft" }, tip) : null);
}

// ---------------------------------------------------------------------------
function expenseRow(x, snap, ctx) {
  const live = expenseApplies(x, snap.base);
  const subs = [];
  if (x.currency === "EUR" && x.amount) subs.push(`${fmtEur(x.amount, Math.abs(x.amount - Math.round(x.amount)) < 0.005 ? 0 : 2)} per ${x.per === "year" ? "year" : "month"}`);
  else if (x.per === "year") subs.push(`${fmtSek(x.amount)} per year`);
  if (x.end_month) {
    if (snap.base > x.end_month) subs.push(`ended ${mShort(x.end_month)}`);
    else { const n = mIndex(x.end_month) - mIndex(snap.base) + 1; subs.push(`until ${mShort(x.end_month)} · ${n} payment${n !== 1 ? "s" : ""} left`); }
  }
  if (!x.active) subs.push("paused");
  const amount = x.amount === 0 ? h("span", { class: "row-amount missing" }, "Set amount")
    : h("span", { class: `row-amount amt ${live ? "" : "off"}` }, fmtSek(expenseMonthlySek(x, snap.fx)));
  const [content, sw] = switchRow(h("div", { class: "row-main" },
    h("div", { class: `row-title ${live ? "" : "off"}` }, x.name), subs.length ? h("div", { class: "row-sub amt-soft" }, subs.join("  ·  ")) : null),
  x.active, (on) => store.saveExpense({ ...x, active: on }), `Include ${x.name}`);
  return h("div", { class: "list-row", role: "button", tabindex: "0", onclick: () => openExpenseSheet(ctx, snap, x) },
    dot(live ? CATEGORY_COLORS[x.category] || COLORS.gray : "var(--gray3)", 10), content, amount, sw);
}

function costsCard(snap, ctx) {
  const order = CATEGORIES.map(([c]) => c);
  const groups = new Map();
  for (const x of snap.expenses) {
    const c = order.includes(x.category) ? x.category : "Other";
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(x);
  }
  const eur = snap.active.filter((x) => x.currency === "EUR").length;
  const missing = snap.missing.length;
  const blocks = [];
  for (const c of order) {
    const items = groups.get(c);
    if (!items) continue;
    const total = items.filter((x) => expenseApplies(x, snap.base)).reduce((a, x) => a + expenseMonthlySek(x, snap.fx), 0);
    blocks.push(h("div", { class: "cat-head" }, h("span", null, c.toUpperCase()), h("span", { class: "amt" }, fmtSek(total))));
    blocks.push(h("div", { class: "list" }, items.map((x) => expenseRow(x, snap, ctx))));
  }
  return card(
    head("Fixed costs", `${fmtSek(snap.fixed)} per month  ·  ${snap.active.length} active${eur ? `  ·  ${eur} in ${CUR.second}` : ""}`,
      addBtn(() => openExpenseSheet(ctx, snap, null))),
    missing ? h("div", { class: "warn-note" }, `${missing} cost${missing !== 1 ? "s are" : " is"} still at ${fmtSek(0)}. Tap a row to set the amount.`) : null,
    blocks.length ? blocks : h("div", { class: "muted list-empty" }, "No fixed costs yet. Tap “+ Add” to add one."),
    h("div", { class: "hint" }, `Tap a cost to edit it (amount, ${CUR.single ? "" : `${CUR.local} or ${CUR.second}, `}monthly or yearly). The switch leaves it out of this budget.`));
}

// ---------------------------------------------------------------------------
export function renderBudget(ctx) {
  const snap = budgetSnapshot(ctx.data, ctx.today, offset);
  snap.entries = ctx.entries;
  return ["Fixed costs and goals first, then your future, and the rest is yours to live on",
    paydayCard(ctx.today),
    periodCard(snap, ctx),
    profilesCard(snap, ctx),
    planCard(snap, ctx),
    goalsCard(snap, ctx),
    weeksCard(snap),
    bufferCard(snap),
    costsCard(snap, ctx),
    h("div", { class: "hint page-foot" }, `The profiles and the buffer target are rules of thumb (${inSweden() ? "Swedbank, Finansinspektionen, the 50/30/20 rule" : "common guidance and the 50/30/20 rule"}), not financial advice. Change the numbers to fit you.`)];
}
