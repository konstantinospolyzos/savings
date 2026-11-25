// One-time expenses: something you bought once (an air fryer, a flight pass), paid from what you already have.
// They don't change the budget or the plan: they lower what you save that month, and History lists them with it.
import { h, sheet, group, caption, footer, dot, icon, toast, alertBox } from "../ui.js";
import {
  COLORS, CUR, MONTHS, fmtSek, shortDate, isoDay, monthOf, addDays, parseNumber, plainNumber, localSym, hasMoney, logName, logMonthOf, oneTimeMonths,
} from "../core.js";
import { store } from "../store.js";

const ONCE_C = COLORS.pink;
const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const asDay = (iso) => new Date(`${iso}T12:00:00`);
const monthName = (m) => MONTHS[Number(m.slice(5, 7)) - 1];
const both = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : list[0] || "");
const total = (list) => list.reduce((a, x) => a + x.amount, 0);
const head = (title, sub = null, right = null) => h("div", { class: "card-head" },
  h("div", { class: "card-head-text" }, h("div", { class: "card-title" }, title), sub ? h("div", { class: `card-sub ${hasMoney(sub) ? "amt-soft" : ""}` }, sub) : null),
  right);
/** Where History lists purchases of these months: End of November, or December (your money at the end of November). */
const historyPlace = (months) => `under ${both(months.map((m) => logName(logMonthOf(`${m}-01`))))}`
  + (CUR.end_months ? "" : ` (your money at the end of ${both(months.map(monthName))})`);
const syncNow = () => { if (store.mode === "drive" && !store.drive.tokenValid()) store.syncFromTap(); };

/**
 * The one-time expenses of the months the pay period shown touches (by the month you bought them in): tap one
 * to change it. They're paid already, so nothing on the Budget tab or in your plan changes with them.
 */
export function oneTimeCard(snap, ctx) {
  const months = oneTimeMonths(ctx.data, snap.start, snap.end);
  const all = months.flatMap(([, list]) => list);
  const open = (x) => openOneTimeSheet(ctx, snap, x);
  const row = (x) => h("div", { class: "list-row", role: "button", tabindex: "0", onclick: () => open(x),
    onkeydown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(x); } } },
  dot(ONCE_C, 10),
  h("div", { class: "row-main" }, h("div", { class: "row-title" }, x.name), h("div", { class: "row-sub" }, shortDate(asDay(x.date)))),
  h("span", { class: "row-amount amt" }, fmtSek(x.amount)), icon("chevron", 15, "chev"));
  const sub = all.length ? months.map(([m, list]) => `${fmtSek(total(list))} in ${monthName(m)}`).join(", ")
    : "Something you bought once, like an air fryer. It's paid already, so your budget and plan stay as they are.";
  const names = months.map(([m]) => monthName(m));
  return h("div", { class: "card once-card" },
    head("One-time expenses", sub, h("button", { type: "button", class: "btn tinted small", onclick: () => open(null) }, "+  Add")),
    all.length ? h("div", { class: "list" }, months.length > 1
      ? months.flatMap(([m, list]) => [h("div", { class: "once-month" }, monthName(m)), ...list.map(row)])
      : all.map(row)) : null,
    all.length ? h("div", { class: "hint amt-soft" },
      `Paid already, so your budget and plan stay as they are. ${all.length > 1 ? "They lower" : "It lowers"} what you save in ${both(names)}: `
      + `History lists ${all.length > 1 ? "them" : "it"} ${historyPlace(months.map(([m]) => m))}.`) : null);
}

// ---------------------------------------------------------------------------
export function openOneTimeSheet(ctx, snap, item = null) {
  const today = isoDay(ctx.today);
  const first = monthOf(snap.start), last = monthOf(addDays(snap.end, -1));
  const shown = (d) => d.slice(0, 7) >= first && d.slice(0, 7) <= last;           // in a month the card shows
  const name = h("input", { class: "form-input", type: "text", autocomplete: "off", placeholder: "e.g. Air fryer", "aria-label": "Name" });
  const amount = h("input", { class: "form-input", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "0", "aria-label": "Amount" });
  const date = h("input", { class: "form-input date-input", type: "date", value: item ? item.date : shown(today) ? today : isoDay(snap.start), "aria-label": "Date" });
  if (item) { name.value = item.name; amount.value = plainNumber(item.amount, item.amount === Math.round(item.amount) ? 0 : 2); }
  const note = footer("");
  let api = null;

  function validate() {
    const v = parseNumber(amount.value);
    const okDate = DAY_RX.test(date.value);
    note.textContent = okDate
      ? `Paid already, so your budget and plan stay as they are. It lowers what you save in ${monthName(date.value)}: History lists it ${historyPlace([date.value.slice(0, 7)])}.`
      : "Pick the day you bought it.";
    api?.setRight({ disabled: !(name.value.trim() && v !== null && v > 0 && okDate) });
  }
  for (const el of [name, amount, date]) el.addEventListener("input", validate);
  date.addEventListener("change", validate);

  function save(sh) {
    const v = parseNumber(amount.value);
    if (!name.value.trim() || v === null || !(v > 0) || !DAY_RX.test(date.value)) return;
    const next = { id: item ? item.id : null, date: date.value, name: name.value.trim(), amount: v };
    store.saveOneTime(next);
    sh.close();
    toast(`✓  ${item ? "Saved" : "Added"} ${next.name}`);
    syncNow();
  }
  async function remove() {
    const ok = await alertBox({ title: `Delete “${item.name}”?`, message: "It will be removed from your one-time expenses.",
      buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Delete", value: true, style: "destructive" }] });
    if (!ok) return;
    store.deleteOneTime(item.id);
    api.close();
    toast(`Deleted ${item.name}`);
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
