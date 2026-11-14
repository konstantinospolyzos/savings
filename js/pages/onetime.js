// One-time expenses: something you buy once (an air fryer, a flight pass). Each counts in the pay period of its
// date only, and comes out of what the saving plan puts aside then: the weekly money stays the same.
import { h, sheet, group, caption, footer, dot, icon, toast, alertBox } from "../ui.js";
import {
  COLORS, fmtSek, fmtRange, shortDate, isoDay, addDays, parseNumber, plainNumber, localSym, hasMoney, mIndex,
  currentPeriod, defaultPeriodMonth, budgetSnapshot, budgetToSave, budgetChanges, loadBudgets, loadPlans,
} from "../core.js";
import { store } from "../store.js";
import { budgetFor, planChanges, startPlan } from "./plan.js";

const ONCE_C = COLORS.pink;
const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const asDay = (iso) => new Date(`${iso}T12:00:00`);
const head = (title, sub = null, right = null) => h("div", { class: "card-head" },
  h("div", { class: "card-head-text" }, h("div", { class: "card-title" }, title), sub ? h("div", { class: `card-sub ${hasMoney(sub) ? "amt-soft" : ""}` }, sub) : null),
  right);
const syncNow = () => { if (store.mode === "drive" && !store.drive.tokenValid()) store.syncFromTap(); };

/** The budget of a pay period, by its month. */
const snapOf = (data, today, base) => budgetSnapshot(data, today, mIndex(base) - mIndex(defaultPeriodMonth(today)));

// ---------------------------------------------------------------------------
// A pay period's saved budget and running plan follow a one-time expense by themselves, when they were up to date:
// only what the plan saves and invests changes. Other changes waiting to be saved still ask, as always.
// ---------------------------------------------------------------------------
function upToDate(ctx, base) {
  const data = store.data;
  const snap = snapOf(data, ctx.today, base);
  if (snap.end <= ctx.today) return null;                              // a pay period that's over keeps its record
  const saved = loadBudgets(data)[base] || null;
  if (!saved || budgetChanges(saved, snap).length) return null;
  const plan = loadPlans(data)[base] || null;
  const fresh = Boolean(plan) && !planChanges(plan, budgetFor({ ...ctx, data }, base, saved, snap.start, snap.end)).changed;
  return { plan: fresh ? plan : null };
}

function follow(ctx, base, was) {
  if (!was) return false;
  const snap = snapOf(store.data, ctx.today, base);
  const before = loadBudgets(store.data)[base];
  const changes = before ? budgetChanges(before, snap) : [];
  if (changes.length !== 1 || changes[0] !== "the one-time expenses") return false;
  const saved = budgetToSave(snap, ctx.today);
  store.setSetting("period_budgets", { ...loadBudgets(store.data), [base]: saved });
  if (was.plan) {
    const c = { ...ctx, data: store.data };
    const ch = planChanges(was.plan, budgetFor(c, base, saved, snap.start, snap.end));
    if (ch.changed) startPlan(c, base, ch.fields, was.plan);
  }
  return true;
}

/** Make a change to the one-time expenses of the pay periods of these dates; true when a budget followed. */
function change(ctx, dates, make) {
  const bases = [...new Set(dates.filter(Boolean).map((d) => currentPeriod(asDay(d)).base))];
  const was = bases.map((b) => upToDate(ctx, b));
  make();
  return bases.map((b, i) => follow(ctx, b, was[i])).some(Boolean);
}

// ---------------------------------------------------------------------------
/** What the one-time expenses of a pay period do to its plan, in words. */
function effect(snap) {
  const P = snap.plan && Math.abs((snap.plan.oneoff || 0) - snap.oneoff) < 0.5 ? snap.plan : snap;       // the running plan, when it has them
  const over = P.oneoff_over || 0, taken = Math.max((P.oneoff || 0) - over, 0);
  const put = P.future + taken;
  const from = `They come out of what your saving plan puts aside this pay period: ${fmtSek(put)} becomes ${fmtSek(P.future)}`;
  return `${from}${over > 0.5 ? `, and ${fmtSek(over)} more comes out of your buffer` : ""}. Your weekly money stays the same.`;
}

/**
 * The one-time expenses of the pay period shown: tap one to change it. On the Budget tab it's always there;
 * My plan shows it once there is one (always: false).
 */
export function oneTimeCard(snap, ctx, { always = true } = {}) {
  const list = snap.oneoffs || [];
  if (!list.length && !always) return null;
  const rows = list.map((x) => h("div", { class: "list-row", role: "button", tabindex: "0", onclick: () => openOneTimeSheet(ctx, snap, x),
    onkeydown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openOneTimeSheet(ctx, snap, x); } } },
  dot(ONCE_C, 10),
  h("div", { class: "row-main" }, h("div", { class: "row-title" }, x.name), h("div", { class: "row-sub" }, shortDate(asDay(x.date)))),
  h("span", { class: "row-amount amt" }, fmtSek(x.amount)), icon("chevron", 15, "chev")));
  return h("div", { class: "card once-card" },
    head("One-time expenses", list.length ? `${fmtSek(snap.oneoff)} this pay period` : "Something you buy once: it counts in this pay period only.",
      h("button", { type: "button", class: "btn tinted small", onclick: () => openOneTimeSheet(ctx, snap, null) }, "+  Add")),
    list.length ? h("div", { class: "list" }, rows) : null,
    list.length && snap.salary > 0 ? h("div", { class: "hint amt-soft" }, effect(snap)) : null);
}

// ---------------------------------------------------------------------------
export function openOneTimeSheet(ctx, snap, item = null) {
  const today = isoDay(ctx.today);
  const inShown = (d) => d >= isoDay(snap.start) && d < isoDay(snap.end);
  const name = h("input", { class: "form-input", type: "text", autocomplete: "off", placeholder: "e.g. Air fryer", "aria-label": "Name" });
  const amount = h("input", { class: "form-input", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "0", "aria-label": "Amount" });
  const date = h("input", { class: "form-input date-input", type: "date", value: item ? item.date : inShown(today) ? today : isoDay(snap.start), "aria-label": "Date" });
  if (item) { name.value = item.name; amount.value = plainNumber(item.amount, item.amount === Math.round(item.amount) ? 0 : 2); }
  const note = footer("");
  let api = null;

  function validate() {
    const v = parseNumber(amount.value);
    const okDate = DAY_RX.test(date.value);
    if (okDate) {
      const p = currentPeriod(asDay(date.value));
      note.textContent = `It counts in the pay period ${fmtRange(p.start, addDays(p.end, -1))} only, and comes out of what your saving plan puts aside then. Your weekly money stays the same.`;
    } else note.textContent = "Pick the day you bought it.";
    api?.setRight({ disabled: !(name.value.trim() && v !== null && v > 0 && okDate) });
  }
  for (const el of [name, amount, date]) el.addEventListener("input", validate);
  date.addEventListener("change", validate);

  function save(sh) {
    const v = parseNumber(amount.value);
    if (!name.value.trim() || v === null || !(v > 0) || !DAY_RX.test(date.value)) return;
    const next = { id: item ? item.id : null, date: date.value, name: name.value.trim(), amount: v };
    const followed = change(ctx, [item?.date, next.date], () => store.saveOneTime(next));
    sh.close();
    toast(`✓  ${item ? "Saved" : "Added"} ${next.name}${followed ? ": your budget and plan follow" : ""}`);
    syncNow();
  }
  async function remove() {
    const ok = await alertBox({ title: `Delete “${item.name}”?`, message: "It will be removed from your one-time expenses.",
      buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Delete", value: true, style: "destructive" }] });
    if (!ok) return;
    const followed = change(ctx, [item.date], () => store.deleteOneTime(item.id));
    api.close();
    toast(`Deleted ${item.name}${followed ? ": your budget and plan follow" : ""}`);
    syncNow();
  }

  const row = (label, input, unit = null) => h("label", { class: "form-row" }, h("span", { class: "form-label" }, label), input,
    unit ? h("span", { class: "form-unit" }, unit) : null);
  const body = h("div", { class: "form" },
    caption("ONE-TIME EXPENSE"),
    group(row("Name", name), row("Amount", amount, localSym()), row("Bought on", date)),
    note,
    item ? h("button", { type: "button", class: "btn destructive-row", onclick: remove }, "Delete One-Time Expense") : null);
  api = sheet({ title: item ? "Edit One-Time Expense" : "New One-Time Expense", left: { text: "Cancel" }, body,
    right: { text: item ? "Save" : "Add", bold: true, onClick: save } });
  validate();
  if (matchMedia("(pointer: fine)").matches) setTimeout(() => (item ? amount : name).focus(), 350);
  return api;
}
