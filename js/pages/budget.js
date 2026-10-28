// Budget: fixed costs and goals first, then your future, and the rest is yours to live on.
import { h, chip, dot, segmented, toggle, icon, splitBar, toast, alertBox, sheet, group, caption, footer } from "../ui.js";
import {
  COLORS, PROFILE_DEFS, CATEGORIES, CATEGORY_COLORS, GOAL_COLORS, BUFFER_MONTH_CHOICES,
  budgetSnapshot, planForRate, paydayStatus, paydayReason, paydayFor, addMonths, monthOf, daysBetween, addDays,
  fmtRange, shortDate, longDate, mLong, mShort, mIndex, fmtSek, fmtEur, plainNumber, parseNumber, pct, roundTo10,
  weekChunks, summarize, monthFlows, travelFund, expenseApplies, expenseMonthlySek, goalApplies, goalPerMonth,
  goalPlannedBy, fetchSekToEur, CUR, inSweden, localSym, brokersText, hasMoney, rateFromInput, rateShown,
  loadBudgets, budgetToSave, budgetChanges, carsToOffer, getSetting, plural,
} from "../core.js";
import { store } from "../store.js";
import { openExpenseSheet, openGoalSheet } from "./budget-sheets.js";
import { profileName } from "./plan.js";

const FIXED_C = "var(--gray3)", LIVING_C = COLORS.purple, GOALS_C = COLORS.teal, BUFFER_C = COLORS.blue, INVEST_C = COLORS.orange;

let offset = 0;              // pay periods away from the current one
/** Back to the pay period the Budget opens on (My plan's payday checklist links here). */
export function showCurrentPeriod() { offset = 0; }

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

  const free = Math.max(snap.free, 0);
  const legend = [["Fixed costs", snap.fixed, FIXED_C], ["Saving goals", snap.goals, GOALS_C], ["For your saving plan", free, COLORS.green]].map(([text, v, color]) =>
    h("div", { class: "legend-row" }, dot(color, 9), h("span", { class: "legend-name" }, text),
      h("span", { class: "legend-amount amt" }, fmtSek(v)),
      h("span", { class: "legend-pct" }, salary > 0 ? `${Math.round(v / salary * 100)}%` : "")));

  // save the budget for My plan: the saving plan is picked there, from these numbers
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
        h("button", { type: "button", class: "btn primary wide", onclick: saveIt }, "Save for My plan"),
        h("div", { class: "hint" }, "Saves this pay period's numbers. Then pick your saving plan in the My plan tab."));
    } else if (changes.length) {
      saveBox = h("div", { class: "save-box" },
        h("div", { class: "warn-note" }, `Changed since you saved it on ${savedOn} (${changes.join(", ")}). Save again so My plan uses the new numbers.`),
        h("button", { type: "button", class: "btn primary wide", onclick: saveIt }, "Save again"));
    } else {
      saveBox = h("div", { class: "save-box saved" },
        h("div", { class: "cap-row" }, chip(`✓ Saved ${savedOn}`, "up"),
          h("span", { class: "hint" }, P ? `Your ${profileName(P.profile)} plan is running.` : "Pick your saving plan in My plan.")),
        h("button", { type: "button", class: "btn tinted small", onclick: () => ctx.go("plan") }, P ? "Open My plan" : "Pick a plan"));
    }
  }

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
    const P = snap.plan;
    if (short > 0 && snap.buffer_first) {
      tip = `${fmtSek(short)} to go. ${P ? `Your ${profileName(P.profile)} plan puts ${fmtSek(P.to_buffer)} here this period${P.invest > 0 ? ", the rest to investing." : "."}` : "Your saving plan puts its future money here first, until it's full."} ${inSweden() ? "Finansinspektionen suggests" : "A common rule of thumb is"} 2–3 months of necessary costs before long-term investing.`;
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
    for (const x of off) store.saveExpense({ ...x, active: false });
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

function expenseRow(x, snap, ctx) {
  if (x.car) return carRow(x, snap, ctx);
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
    carOffer(snap, ctx),
    blocks.length ? blocks : h("div", { class: "muted list-empty" }, "No fixed costs yet. Tap “+ Add” to add one."),
    h("div", { class: "hint" }, `Tap a cost to edit it (amount, ${CUR.single ? "" : `${CUR.local} or ${CUR.second}, `}monthly or yearly). The switch leaves it out of this budget.`));
}

// ---------------------------------------------------------------------------
export function renderBudget(ctx) {
  const snap = budgetSnapshot(ctx.data, ctx.today, offset);
  snap.entries = ctx.entries;
  return ["Your salary, fixed costs, goals and buffer. Save them, then pick your saving plan in My plan.",
    paydayCard(ctx.today),
    periodCard(snap, ctx),
    goalsCard(snap, ctx),
    bufferCard(snap),
    costsCard(snap, ctx),
    h("div", { class: "hint page-foot" }, `The buffer target is a rule of thumb (${inSweden() ? "Finansinspektionen" : "common guidance"}), not financial advice. Change the numbers to fit you.`)];
}
