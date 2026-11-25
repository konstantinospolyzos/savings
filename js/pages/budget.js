// Budget: your setup. The salary of this pay period and the next, your fixed costs and goals, the rules of the
// saving plans you pick from on Home, and a draft to try changes on. Fixed costs and goals come first, then your
// future, and the rest is yours to live on.
import { h, chip, dot, segmented, toggle, splitBar, toast } from "../ui.js";
import {
  COLORS, PROFILE_DEFS, CATEGORIES, CATEGORY_COLORS, GOAL_COLORS,
  budgetSnapshot, paydayStatus, paydayReason, paydayFor, addMonths, monthOf, daysBetween, addDays,
  fmtRange, shortDate, longDate, mShort, mIndex, fmtSek, fmtEur, plainNumber, parseNumber, pct,
  monthFlows, travelFund, expenseApplies, expenseMonthlySek, goalApplies, goalPerMonth,
  goalPlannedBy, fetchSekToEur, CUR, inSweden, localSym, hasMoney, rateFromInput, rateShown,
  loadBudgets, budgetToSave, budgetChanges, carsToOffer, getSetting, plural, dayMonth, joinAnd, defaultPeriodMonth,
  logName, loadPeriodSalaries, salaryFor, currentPeriod,
} from "../core.js";
import { store } from "../store.js";
import { openExpenseSheet, openGoalSheet, openProfilesSheet } from "./budget-sheets.js";
import { profileName } from "./plan.js";

const FIXED_C = "var(--gray3)", GOALS_C = COLORS.teal;

// The pay period shown: this one or the next. Until you pick one, the next shows in the last week before payday.
let picked = null;            // "this" | "next" | null
const shownBase = (today) => (picked === "this" ? currentPeriod(today).base : picked === "next" ? addMonths(currentPeriod(today).base, 1)
  : defaultPeriodMonth(today));
/** Open the Budget on a pay period (Home's steps link here): this one or the next. */
export function showPeriod(base, today) {
  const cur = currentPeriod(today).base;
  picked = base === cur ? "this" : base === addMonths(cur, 1) ? "next" : null;
}

const card = (...children) => h("div", { class: "card" }, children);
const head = (title, sub = null, right = null) => h("div", { class: "card-head" },
  h("div", { class: "card-head-text" }, h("div", { class: "card-title" }, title), sub ? h("div", { class: `card-sub ${typeof sub === "string" && hasMoney(sub) ? "amt-soft" : ""}` }, sub) : null),
  right);
const addBtn = (onClick) => h("button", { type: "button", class: "btn tinted small", onclick: onClick }, "+  Add");

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
/**
 * A pay period's salary, typed: kept for that pay period only (in the data file, so your other devices have it
 * too), or forgotten when it's what the pay period has anyway. null forgets it.
 */
export function setPeriodSalary(ctx, base, v, { keep = false } = {}) {
  const all = { ...loadPeriodSalaries(ctx.data) };
  if (v === null || (!keep && Math.abs(v - salaryFor(ctx.data, base, { typed: false }).salary) < 0.5)) delete all[base];
  else all[base] = v;
  for (const k of Object.keys(all).sort().slice(0, -24)) delete all[k];       // the last two years
  store.setSetting("period_salaries", all);
}

/** Where the salary of the pay period shown comes from, and the link that undoes a typed one. */
function salaryNote(snap, ctx, kind) {
  const { latest } = snap;
  switch (snap.salary_src) {
    case "period": return ["Your figure for this pay period", ["Clear", () => setPeriodSalary(ctx, snap.base, null)]];
    case "kept": return [latest ? "Your own figure, kept until you tap “Use latest”" : "Your own figure",
      latest ? ["Use latest", () => store.setSetting("budget_salary", null)] : null];
    case "log": return [`From your ${logName(snap.salary_log.month)} log`, null];
    case "latest": return [kind === "Past" ? `From your ${logName(latest.month)} log` : `From your ${logName(latest.month)} log, until you type this payday's salary`, null];
    default: return ["Log a month first", null];
  }
}

function periodCard(snap, ctx) {
  const { start, end, days, fx, latest, salary, today } = snap;
  const kind = start <= today && today < end ? "Now" : start > today ? "Upcoming" : "Past";
  const isNext = snap.base !== currentPeriod(today).base;
  const which = segmented(["This pay period", "Next pay period"], isNext ? 1 : 0, (i) => { picked = i ? "next" : "this"; ctx.refresh(); }, "full period-seg");

  const salaryInput = h("input", { class: "eq-input amt", type: "text", inputmode: "decimal", autocomplete: "off",
    value: salary ? plainNumber(salary) : "", placeholder: "0", "aria-label": "Salary" });
  salaryInput.addEventListener("change", () => {
    const v = parseNumber(salaryInput.value);
    if (v === null) { salaryInput.value = salary ? plainNumber(salary) : ""; return; }
    setPeriodSalary(ctx, snap.base, v);          // this pay period only: the salary isn't the same every month
  });
  const [src, undo] = salaryNote(snap, ctx, kind);

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

  const free = Math.max(snap.free, 0);
  const legend = [["Fixed costs", snap.fixed, FIXED_C], ["Saving goals", snap.goals, GOALS_C], ["For your saving plan", free, COLORS.green]].map(([text, v, color]) =>
    h("div", { class: "legend-row" }, dot(color, 9), h("span", { class: "legend-name" }, text),
      h("span", { class: "legend-amount amt" }, fmtSek(v)),
      h("span", { class: "legend-pct" }, salary > 0 ? `${Math.round(v / salary * 100)}%` : "")));

  // save the budget: the saving plan is picked on Home, from these numbers
  const budgets = loadBudgets(ctx.data);
  const saved = budgets[snap.base] || null;
  const changes = saved ? budgetChanges(saved, snap) : [];
  const past = snap.end <= today;
  const saveIt = () => {
    const next = { ...budgets, [snap.base]: budgetToSave(snap, today) };
    for (const k of Object.keys(next).sort().slice(0, -24)) delete next[k];       // the last two years
    store.setSetting("period_budgets", next);
    toast(`✓  Saved: ${fmtSek(snap.left)} left to plan`);
  };
  const savedOn = saved ? shortDate(new Date(`${saved.saved}T12:00:00`)) : "";
  const P = snap.plan;
  let saveBox = null;
  if (!past && salary > 0) {
    if (!saved) {
      saveBox = h("div", { class: "save-box" },
        h("button", { type: "button", class: "btn primary wide", onclick: saveIt }, "Save the budget"),
        h("div", { class: "hint" }, isNext ? `Saves the next pay period's numbers. You pick its plan on Home from payday, ${shortDate(start)}.`
          : "Saves this pay period's numbers. Then pick this month's plan on Home."));
    } else if (changes.length) {
      saveBox = h("div", { class: "save-box" },
        h("div", { class: "warn-note" }, `Changed since you saved it on ${savedOn} (${changes.join(", ")}). Save again so the plans use the new numbers.`),
        h("button", { type: "button", class: "btn primary wide", onclick: saveIt }, "Save again"));
    } else {
      saveBox = h("div", { class: "save-box saved" },
        h("div", { class: "cap-row" }, chip(`✓ Saved ${savedOn}`, "up"),
          h("span", { class: "hint" }, P ? `Your ${profileName(P.profile)} plan is running.` : isNext ? `Pick its plan on Home from payday, ${shortDate(start)}.` : "Pick this month's plan on Home.")),
        !isNext || P ? h("button", { type: "button", class: "btn tinted small", onclick: () => ctx.go(P ? "plan" : "home") }, P ? "Plan details" : "Pick a plan") : null);
    }
  }

  return card(
    which,
    h("div", { class: "card-head period-head" }, h("div", { class: "cap-row" }, h("span", { class: "caption" }, "PAY PERIOD"), chip(kind, kind === "Now" ? "info" : "flat"),
      h("span", { class: "hint" }, `${fmtRange(start, addDays(end, -1))}  ·  ${days} days`))),
    h("div", { class: "eq" },
      h("label", { class: "eq-row" }, h("span", { class: "eq-label" }, "Salary"), salaryInput, h("span", { class: "eq-unit" }, localSym())),
      h("div", { class: "eq-note" }, src, undo ? h("button", { type: "button", class: "link-btn", onclick: undo[1] }, undo[0]) : null),
      h("div", { class: "eq-row" }, h("span", { class: "eq-label" }, h("span", { class: "eq-sign" }, "−"), "Fixed costs"),
        h("span", { class: "eq-value amt" }, fmtSek(snap.fixed))),
      h("div", { class: "eq-note" }, `${snap.active.length} active costs`),
      h("div", { class: "eq-row total" }, h("span", { class: "eq-label" }, h("span", { class: "eq-sign" }, "="), "Left to plan"),
        h("span", { class: `eq-value big amt tone-text-${snap.left > 0 ? "up" : "down"}` }, fmtSek(snap.left))),
      h("div", { class: "eq-note amt" }, snap.left < 0 ? "Fixed costs are higher than the salary" : CUR.single ? null : `≈ ${fmtEur(snap.left * fx)}`)),
    saveBox,
    splitBar([[snap.fixed, FIXED_C], [snap.goals, GOALS_C], [free, COLORS.green]], 12),
    h("div", { class: "legend-list" }, legend),
    CUR.single ? null : h("div", { class: "hairline" }),
    CUR.single ? null : h("div", { class: "fx-row" }, h("span", { class: "caption" }, "EXCHANGE RATE"), h("span", { class: "fx-eq" }, `1 ${CUR.second} =`), fxInput, h("span", null, CUR.local), fetchBtn),
    CUR.single ? null : h("div", { class: "eq-note" }, snap.fx_src, snap.fx_override && latest
      ? h("button", { type: "button", class: "link-btn", onclick: () => store.setSetting("budget_rate", null) }, "Use latest log") : null));
}

// ---------------------------------------------------------------------------
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
// ---------------------------------------------------------------------------
// Your car: its costs come from the car monitor (fixed costs + fuel), so you enter them once
// ---------------------------------------------------------------------------
const CAR_RX = /\b(car|cars|vehicle|fuel|petrol|gasoline|diesel|parking|garage)\b|\bbil(?![jl])|bensin|drivmedel|parkering|fordon/i;
const LOAN_RX = /loan|lån|leasing|instal|avbetal/i;

function setCarInBudget(carId, on) {
  store.setSetting("budget_cars", { ...(getSetting(store.data, "budget_cars", {}) || {}), [carId]: on });
}

const carParts = (p) => [p.fixed > 0 ? `${fmtSek(p.fixed)} fixed costs` : null,
  p.fuel > 0 ? `≈ ${fmtSek(p.fuel)} ${p.electric ? "charging" : "fuel"}` : null].filter(Boolean).join(" + ");

/** The car's line among the fixed costs: tap it for the car, the switch leaves it out. */
function carRow(x, snap, ctx) {
  const live = expenseApplies(x, snap.base);
  const [content, sw] = switchRow(h("div", { class: "row-main" },
    h("div", { class: `row-title ${live ? "" : "off"}` }, x.name),
    h("div", { class: "row-sub amt-soft" }, `Car monitor: ${[x.parts.fixed > 0 ? `${fmtSek(x.parts.fixed)} fixed` : null,
      x.parts.fuel > 0 ? `≈ ${fmtSek(x.parts.fuel)} ${x.parts.electric ? "charging" : "fuel"}` : null].filter(Boolean).join(" + ")}${x.active ? "" : "  ·  left out"}`)),
  x.active, (on) => setCarInBudget(x.car, on), `Include ${x.name}`);
  return h("div", { class: "list-row", role: "button", tabindex: "0", onclick: () => { store.setPref("car_id", x.car); ctx.go("car-garage"); } },
    h("span", { class: `car-dot ${live ? "" : "off"}` }, icon("car", 13)), content,
    h("span", { class: `row-amount amt ${live ? "" : "off"}` }, fmtSek(x.amount)), sw);
}

/** Count a car in the Budget; first, the fixed costs that look like the car's already, to switch off. */
function addCarToBudget(snap, offer) {
  const { car, name, parts } = offer;
  const carAmounts = (car.fixed || []).map((f) => f.amount);
  const candidates = snap.expenses.filter((x) => !x.car && expenseApplies(x, snap.base)).map((x) => {
    const monthly = expenseMonthlySek(x, snap.fx);
    const named = CAR_RX.test(x.name);
    const strong = carAmounts.some((a) => Math.abs(a - monthly) <= 1) || (named && !LOAN_RX.test(x.name));
    return strong || named || x.category === "Transport" ? { x, monthly, keep: toggle(!strong, () => {}, `Keep ${x.name}`) } : null;
  }).filter(Boolean);
  const done = (off) => {
    for (const x of off) store.setExpenseActive(x.id, false);
    setCarInBudget(car.id, true);
    toast(`✓  ${name} in your fixed costs${off.length ? `  ·  ${plural(off.length, "cost")} switched off` : ""}`);
  };
  if (!candidates.length) { done([]); return; }
  const body = h("div", { class: "form" },
    footer(`${name} adds ${fmtSek(parts.total)} a month to your fixed costs: ${carParts(parts)}${parts.fuel > 0 ? ` (the average of ${plural(parts.months, "month")})` : ""}. Change them in the car monitor, and the Budget follows.`),
    caption("ALSO IN YOUR FIXED COSTS"),
    group(candidates.map((c) => h("label", { class: "form-row switch-row" },
      h("span", { class: "form-label car-cand" }, h("span", null, c.x.name), h("span", { class: "amt-soft" }, `${fmtSek(c.monthly)} a month`)), c.keep))),
    footer("Switch off the ones the car now counts, so they don't count twice. They stay in your list, switched off."));
  sheet({ title: `Add ${name}`, left: { text: "Cancel" }, body,
    right: { text: "Add", bold: true, onClick: (sh) => { sh.close(); done(candidates.filter((c) => !c.keep.input.checked).map((c) => c.x)); } } });
}

/** A car whose costs the Budget doesn't count yet: count it here? */
function carOffer(snap, ctx) {
  const offer = carsToOffer(ctx.data, snap.base)[0];
  if (!offer) return null;
  const { name, parts } = offer;
  return h("div", { class: "tip-box stack" },
    h("div", { class: "tip-text amt-soft" }, `${name} costs about ${fmtSek(parts.total)} a month in the car monitor: ${carParts(parts)}. Count it here, so you enter the car's costs only once?`),
    h("div", { class: "tip-actions" },
      h("button", { type: "button", class: "btn primary small", onclick: () => addCarToBudget(snap, offer) }, "Add the car"),
      h("button", { type: "button", class: "btn plain small", onclick: () => setCarInBudget(offer.car.id, false) }, "Leave it out")));
}

/** An amount in a cost's own unit: its currency, and "a year" for a yearly one. */
const ownAmount = (x, v) => `${x.currency === "EUR" ? fmtEur(v, Math.abs(v - Math.round(v)) < 0.005 ? 0 : 2) : fmtSek(v)}${x.per === "year" ? " a year" : ""}`;

function expenseRow(x, snap, ctx) {
  if (x.car) return carRow(x, snap, ctx);
  const live = expenseApplies(x, snap.base);
  const nextBase = addMonths(snap.base, 1);
  const subs = [];
  if (x.currency === "EUR" && x.amount) subs.push(`${fmtEur(x.amount, Math.abs(x.amount - Math.round(x.amount)) < 0.005 ? 0 : 2)} per ${x.per === "year" ? "year" : "month"}`);
  else if (x.per === "year") subs.push(`${fmtSek(x.amount)} per year`);
  // an amount that changes with a payday: what it was before this pay period, and what the next payday makes it
  if (x.start_month && x.start_month > snap.base) subs.push(`from payday ${dayMonth(paydayFor(x.start_month))}`);
  else if (x.active) {
    if (x.start_month === snap.base) subs.push("new this pay period");
    else if (x.amount_before !== null) subs.push(`was ${ownAmount(x, x.amount_before)}`);
    if (x.amount_next !== null && expenseApplies(x, nextBase)) subs.push(`${ownAmount(x, x.amount_next)} from ${dayMonth(paydayFor(nextBase))}`);
  }
  if (x.end_month) {
    if (snap.base > x.end_month) subs.push(`ended ${mShort(x.end_month)}`);
    else { const n = mIndex(x.end_month) - mIndex(snap.base) + 1; subs.push(`until ${mShort(x.end_month)} · ${n} payment${n !== 1 ? "s" : ""} left`); }
  }
  if (x.pocket) subs.push("Revolut pocket");
  if (!x.active) subs.push("paused");
  const amount = x.amount === 0 ? h("span", { class: "row-amount missing" }, "Set amount")
    : h("span", { class: `row-amount amt ${live ? "" : "off"}` }, fmtSek(expenseMonthlySek(x, snap.fx)));
  const [content, sw] = switchRow(h("div", { class: "row-main" },
    h("div", { class: `row-title ${live ? "" : "off"}` }, x.name), subs.length ? h("div", { class: "row-sub amt-soft" }, subs.join("  ·  ")) : null),
  x.active, (on) => store.setExpenseActive(x.id, on), `Include ${x.name}`);
  return h("div", { class: "list-row", role: "button", tabindex: "0", onclick: () => openExpenseSheet(ctx, snap, x) },
    dot(live ? CATEGORY_COLORS[x.category] || COLORS.gray : "var(--gray3)", 10), content, amount, sw);
}

/**
 * What the next payday changes in the fixed costs of the pay period shown: the amounts you set for it (an invoice
 * that came in), costs that start then and instalments that end. null when nothing does, or the period is over.
 */
export function nextPaydayChanges(snap) {
  if (snap.end <= snap.today) return null;
  const nextBase = addMonths(snap.base, 1);
  const items = [];
  let diff = 0;
  for (const x of snap.expenses) {
    if (x.car || !x.active) continue;
    const now = expenseApplies(x, snap.base), then = expenseApplies(x, nextBase);
    const a = now ? expenseMonthlySek(x, snap.fx) : 0;
    const b = then ? expenseMonthlySek({ ...x, amount: x.amount_next ?? x.amount }, snap.fx) : 0;
    if (now && then && x.amount_next !== null) items.push(`${x.name} ${ownAmount(x, x.amount_next)}`);
    else if (!now && then && x.start_month === nextBase) items.push(`${x.name} ${ownAmount(x, x.amount_next ?? x.amount)} (new)`);
    else if (now && !then) items.push(`${x.name} ends`);
    else continue;
    diff += b - a;
  }
  return items.length ? { items, diff, payday: snap.end, base: nextBase } : null;
}

function nextPaydayNote(snap, ctx) {
  const ch = nextPaydayChanges(snap);
  if (!ch) return null;
  const total = Math.abs(ch.diff) < 0.5 ? "Your fixed costs stay the same in total."
    : `That's ${fmtSek(Math.abs(ch.diff))} ${ch.diff > 0 ? "more" : "less"} a month in fixed costs.`;
  return h("div", { class: "tip-box stack" },
    h("div", { class: "tip-text amt-soft" }, `From payday ${shortDate(ch.payday)}: ${joinAnd(ch.items)}. ${total}${snap.start <= snap.today ? " This pay period stays as it is." : ""}`),
    h("div", { class: "tip-actions" },
      ch.base !== shownBase(ctx.today) ? h("button", { type: "button", class: "btn tinted small", onclick: () => {
        showPeriod(ch.base, ctx.today);
        ctx.refresh();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } }, "See that pay period") : null));
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
    carOffer(snap, ctx),
    nextPaydayNote(snap, ctx),
    blocks.length ? blocks : h("div", { class: "muted list-empty" }, "No fixed costs yet. Tap “+ Add” to add one."),
    h("div", { class: "hint" }, `Tap a cost to edit it (amount, ${CUR.single ? "" : `${CUR.local} or ${CUR.second}, `}monthly or yearly). For an invoice you'll pay at the next payday, type its amount and pick that payday. The switch leaves it out of this budget.`));
}

// ---------------------------------------------------------------------------
/** The rules of the saving plans you pick from on Home: the % each saves, and the least and most to live on a week. */
function plansCard(snap, ctx) {
  const rows = PROFILE_DEFS.map(([key, title]) => {
    const floor = snap.floors[key], max = snap.maxes[key];
    const week = max ? `${plainNumber(floor)}–${fmtSek(max)} a week` : `at least ${fmtSek(floor)} a week`;
    return h("div", { class: "list-row static plan-rule" }, h("div", { class: "row-main" },
      h("div", { class: "row-title" }, title), h("div", { class: "row-sub amt-soft" }, `Save at least ${snap.profiles[key]}%  ·  ${week}`)));
  });
  return card(head("Saving plans", "You pick one of these on each payday.",
    h("button", { type: "button", class: "btn tinted small", onclick: () => openProfilesSheet(ctx, snap) }, "Edit")),
  h("div", { class: "list" }, rows),
  h("div", { class: "hint amt-soft" }, snap.target > 0
    ? `Your buffer target, ${snap.buffer_amount !== null ? fmtSek(snap.target) : `${snap.buffer_months} months of fixed costs (${fmtSek(snap.target)})`}, is set once in Settings. Until it's full, what you save goes to the bank.`
    : "Your buffer target is set once in Settings."));
}

function draftCard(ctx) {
  return h("div", { class: "card draft-card" }, head("Try changes", "A draft of this page: turn costs off, change amounts and see the weekly money. Nothing is saved.",
    h("button", { type: "button", class: "btn tinted small", onclick: () => ctx.go("draft") }, "Open")));
}

export function renderBudget(ctx) {
  const offset = mIndex(shownBase(ctx.today)) - mIndex(defaultPeriodMonth(ctx.today));
  const snap = budgetSnapshot(ctx.data, ctx.today, offset);
  snap.entries = ctx.entries;
  return ["Your salary, costs and the rules payday uses",
    periodCard(snap, ctx),
    costsCard(snap, ctx),
    goalsCard(snap, ctx),
    plansCard(snap, ctx),
    draftCard(ctx),
    paydayCard(ctx.today),
    h("div", { class: "hint page-foot" }, `The buffer and the plans are rules of thumb (${inSweden() ? "Finansinspektionen, Swedbank" : "common guidance"}), not financial advice. Change the numbers to fit you.`)];
}
