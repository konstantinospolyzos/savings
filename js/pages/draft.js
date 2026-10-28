// Draft budget: a copy of your budget to try things out (a cost you'll share, a raise, a new subscription).
// Nothing here changes your real budget or My plan. The draft stays on this device until you start over.
import { h, dot, toggle, icon, alertBox, toast } from "../ui.js";
import {
  COLORS, CATEGORIES, CATEGORY_COLORS, PROFILE_DEFS, budgetSnapshot, expenseApplies, expenseMonthlySek, planForRate,
  fmtSek, plainNumber, parseNumber, roundTo10, isoDay, shortDate, hasMoney, localSym,
} from "../core.js";
import { store } from "../store.js";

const KEY = "budget_draft";
const LIVING_C = COLORS.purple, SAVE_C = COLORS.blue, INVEST_C = COLORS.orange;
const card = (...children) => h("div", { class: "card" }, children);
const head = (title, sub = null, right = null) => h("div", { class: "card-head" },
  h("div", { class: "card-head-text" }, h("div", { class: "card-title" }, title),
    sub ? h("div", { class: `card-sub ${typeof sub === "string" && hasMoney(sub) ? "amt-soft" : ""}` }, sub) : null), right);

/** A fresh draft: your budget as it is now, every cost a month in your currency. */
function fromBudget(snap) {
  return {
    made: isoDay(snap.today), salary: Math.round(snap.salary), salary_was: Math.round(snap.salary),
    goals: Math.round(snap.goals), goals_was: Math.round(snap.goals), goals_on: true,
    costs: snap.expenses.map((x, i) => {
      const amount = Math.round(expenseMonthlySek(x, snap.fx));
      const on = expenseApplies(x, snap.base);
      return { id: `c${i}`, name: x.name, category: x.category, amount, was: amount, on, was_on: on };
    }),
  };
}

const load = () => store.pref(KEY, null);
const save = (d) => store.setPref(KEY, d);

/** The draft's numbers, worked out like the Budget page does. */
function totals(d, snap) {
  const fixed = d.costs.filter((c) => c.on).reduce((a, c) => a + c.amount, 0);
  const goals = d.goals_on ? d.goals : 0;
  const left = d.salary - fixed, free = left - goals;
  let shortfall = Math.max(snap.buffer_months * fixed - snap.bank, 0);
  if (shortfall < 500) shortfall = 0;
  const like = { salary: d.salary, free, goals, days: snap.days, buffer_first: snap.buffer_first, shortfall };
  const plans = PROFILE_DEFS.map(([key, name]) => ({ key, name, ...planForRate(like, snap.profiles[key], snap.floors[key]) }));
  return { fixed, goals, left, free, plans };
}

function amountInput(value, onChange, label) {
  const input = h("input", { class: "draft-input amt", type: "text", inputmode: "decimal", autocomplete: "off",
    value: plainNumber(value), "aria-label": label });
  input.addEventListener("change", () => {
    const v = parseNumber(input.value);
    if (v === null || v < 0) { input.value = plainNumber(value); return; }
    onChange(Math.round(v));
  });
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") input.blur(); });
  return input;
}

const signed = (v) => `${v >= 0 ? "+" : "−"}${fmtSek(Math.abs(v))}`;

function resultCard(d, t, snap) {
  const diff = t.free - snap.free;
  const eqRow = (sign, label, value, cls = "") => h("div", { class: `eq-row ${cls}` },
    h("span", { class: "eq-label" }, sign ? h("span", { class: "eq-sign" }, sign) : null, label),
    h("span", { class: `eq-value amt ${cls === "total" ? "big tone-text-up" : ""}` }, value));
  const weeks = snap.days / 7;
  const plans = t.plans.map((p) => h("div", { class: "draft-plan" },
    h("div", { class: "draft-plan-name" }, p.name),
    h("div", { class: "draft-plan-line" }, dot(LIVING_C, 7), h("span", { class: "amt" }, `${fmtSek(roundTo10(p.spend / weeks))} a week`)),
    h("div", { class: "draft-plan-line" }, dot(SAVE_C, 7), h("span", { class: "amt" }, `${fmtSek(p.save)} save`)),
    h("div", { class: "draft-plan-line" }, dot(INVEST_C, 7), h("span", { class: "amt" }, `${fmtSek(p.invest)} invest`))));
  return card(head("With these changes", Math.abs(diff) < 1 ? "The same as your budget now." : `${signed(diff)} a month for your saving plan, compared with your budget now.`),
    h("div", { class: "eq" },
      eqRow("", "Salary", fmtSek(d.salary)),
      eqRow("−", "Fixed costs", fmtSek(t.fixed)),
      eqRow("=", "Left to plan", fmtSek(t.left), t.goals > 0 ? "" : "total"),
      t.goals > 0 ? eqRow("−", "Saving goals", fmtSek(t.goals)) : null,
      t.goals > 0 ? eqRow("=", "For your saving plan", fmtSek(Math.max(t.free, 0)), "total") : null),
    t.free < 0 ? h("div", { class: "warn-note draft-warn" }, "Fixed costs and goals are more than the salary.") : null,
    h("div", { class: "caption draft-cap" }, "THE SAVING PLANS WOULD GIVE"),
    h("div", { class: "draft-plans" }, plans),
    h("div", { class: "hint" }, `Spending money a week, and what goes to savings (goals + buffer) and investing each pay period of ${snap.days} days, with your plans' % and minimums.`));
}

function salaryCard(d, update) {
  const changed = d.salary !== d.salary_was;
  return card(head("Salary", changed ? `Was ${fmtSek(d.salary_was)}` : null),
    h("div", { class: "draft-row" }, h("span", { class: "draft-name" }, "Salary a month"),
      amountInput(d.salary, (v) => update({ ...d, salary: v }), "Salary"), h("span", { class: "draft-unit" }, localSym())));
}

function costRow(c, d, update) {
  const set = (patch) => update({ ...d, costs: d.costs.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) });
  const isNew = c.was === null;
  const note = isNew ? "new" : c.amount !== c.was ? `was ${fmtSek(c.was)}` : c.on !== c.was_on ? (c.on ? "switched on" : "switched off") : "";
  const sw = toggle(c.on, (on) => setTimeout(() => set({ on }), 200), `Include ${c.name}`);
  return h("div", { class: `draft-row ${c.on ? "" : "off"}` },
    dot(c.on ? CATEGORY_COLORS[c.category] || COLORS.gray : "var(--gray3)", 9),
    h("div", { class: "draft-name" }, h("div", null, c.name), note ? h("div", { class: "draft-note amt-soft" }, note) : null),
    isNew ? h("button", { type: "button", class: "draft-mini", "aria-label": `Remove ${c.name}`, onclick: () => update({ ...d, costs: d.costs.filter((x) => x.id !== c.id) }) }, icon("close", 13))
      : h("button", { type: "button", class: "draft-mini", "aria-label": `Halve ${c.name}`, title: "Halve it", onclick: () => set({ amount: Math.round(c.amount / 2) }) }, "½"),
    amountInput(c.amount, (v) => set({ amount: v }), c.name),
    sw);
}

function costsCard(d, update, t) {
  const order = CATEGORIES.map(([c]) => c);
  const blocks = [];
  for (const cat of order) {
    const items = d.costs.filter((c) => (order.includes(c.category) ? c.category : "Other") === cat);
    if (!items.length) continue;
    const total = items.filter((c) => c.on).reduce((a, c) => a + c.amount, 0);
    blocks.push(h("div", { class: "cat-head" }, h("span", null, cat.toUpperCase()), h("span", { class: "amt" }, fmtSek(total))));
    blocks.push(h("div", { class: "draft-list" }, items.map((c) => costRow(c, d, update))));
  }
  // a new cost
  const name = h("input", { class: "draft-add-name", type: "text", placeholder: "New cost, e.g. Gym", autocomplete: "off", "aria-label": "Name of a new cost" });
  const amount = h("input", { class: "draft-input amt", type: "text", inputmode: "decimal", placeholder: "0", autocomplete: "off", "aria-label": "Amount a month" });
  const add = () => {
    const v = parseNumber(amount.value);
    if (!name.value.trim() || v === null || v < 0) { (name.value.trim() ? amount : name).focus(); return; }
    update({ ...d, costs: [...d.costs, { id: `n${Date.now()}`, name: name.value.trim(), category: "Other", amount: Math.round(v), was: null, on: true, was_on: false }] });
  };
  for (const el of [name, amount]) el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); add(); } });
  return card(head("Fixed costs", `${fmtSek(t.fixed)} a month`),
    blocks,
    h("div", { class: "draft-add" }, name, amount, h("button", { type: "button", class: "btn tinted small", onclick: add }, "Add")),
    h("div", { class: "hint" }, "Change an amount, halve it (½) or switch a cost off. All amounts a month."));
}

function goalsCard(d, update) {
  if (!d.goals_was && !d.goals) return null;
  const sw = toggle(d.goals_on, (on) => setTimeout(() => update({ ...d, goals_on: on }), 200), "Include saving goals");
  return card(head("Saving goals", d.goals !== d.goals_was ? `Was ${fmtSek(d.goals_was)}` : "All your goals together"),
    h("div", { class: `draft-row ${d.goals_on ? "" : "off"}` }, h("span", { class: "draft-name" }, "Goals a month"),
      amountInput(d.goals, (v) => update({ ...d, goals: v }), "Saving goals"), sw));
}

export function renderDraft(ctx) {
  const snap = budgetSnapshot(ctx.data, ctx.today);
  let d = load();
  if (!d || !Array.isArray(d.costs)) { d = fromBudget(snap); save(d); }
  const update = (next) => { save(next); ctx.refresh(); };
  const startOver = async () => {
    const ok = await alertBox({ title: "Start over?", message: "The draft becomes a copy of your budget as it is now.",
      buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Start over", value: true, style: "bold" }] });
    if (ok) { save(fromBudget(snap)); toast("Draft copied from your budget"); ctx.refresh(); }
  };
  const t = totals(d, snap);
  return [`Copied from your budget ${shortDate(new Date(`${d.made}T12:00:00`))}  ·  nothing here changes it`,
    h("div", { class: "card draft-intro" },
      h("div", { class: "muted" }, "Try changes here: a cost you'll share, a raise, something new. Your Budget and My plan stay as they are."),
      h("div", { class: "card-actions" },
        h("button", { type: "button", class: "btn tinted small", onclick: () => ctx.go("budget") }, "Back to Budget"),
        h("button", { type: "button", class: "btn plain small", onclick: startOver }, "Start over"))),
    resultCard(d, t, snap),
    salaryCard(d, update),
    costsCard(d, update, t),
    goalsCard(d, update)];
}
