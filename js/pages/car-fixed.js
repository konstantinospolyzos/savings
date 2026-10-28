// Car monitor: fixed costs (insurance, a parking space...), logged by themselves on their day every month.
import { h, icon, sheet, group, caption, footer, alertBox, toast, selectRow } from "../ui.js";
import { MONTHS, localSym, fmtSek, monthOf, addMonths, todayDate, parseNumber, plainNumber, plural, getSetting, carMonthly, defaultPeriodMonth } from "../core.js";
import { TYPE, carTitle, FIXED_TYPES, newFixedId, dueFixedLogs, dueCarFixed, nextFixedDate } from "../car.js";
import { store } from "../store.js";
import { dayText, syncTap, typeBadge, numField, textField, row, MONTH_RX } from "./car-common.js";

// ---------------------------------------------------------------------------
// Fixed costs: what you pay every month (insurance, a parking space...), logged by themselves
// ---------------------------------------------------------------------------
/** Add the logs of the fixed costs that are due (on opening the app, after a sync, at midnight). */
export function addFixedCostLogs() {
  if (!store.ready) return;
  const today = todayDate();
  for (const car of store.data.cars || []) {
    const due = dueCarFixed(car, today);
    if (due) store.addFixedLogs(car.id, due.entries, due.done);
  }
}

const ordinal = (n) => (n === 31 ? "the last day" : `the ${n}${[11, 12, 13].includes(n) ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`);
const DAY_OPTIONS = [...Array.from({ length: 28 }, (_, i) => [String(i + 1), ordinal(i + 1).replace("the ", "")]), ["31", "Last day of the month"]];
const fixedName = (f) => f.name || (f.type === "tax" ? "Vehicle tax" : TYPE[f.type].name);
const fixedLogCount = (car, f) => car.logs.filter((l) => l.id.startsWith(`${f.id}-`) || (f.id === `fc-${f.type}` && l.id.startsWith(`auto-${f.type}-`))).length;

/** Whether the Budget counts the car (its fixed costs + fuel), and how much. */
function budgetLine(car, ctx) {
  const on = (getSetting(ctx.data, "budget_cars", {}) || {})[car.id];
  if (typeof on !== "boolean") return null;
  const m = carMonthly(car, defaultPeriodMonth(ctx.today));
  if (!(m.total > 0)) return null;
  return h("div", { class: "hint amt-soft garage-budget" }, on
    ? `In your Budget's fixed costs: ${fmtSek(m.total)} a month${m.fuel > 0 ? `, with ≈ ${fmtSek(m.fuel)} ${m.electric ? "charging" : "fuel"}` : ""}.`
    : "Left out of your Budget (its switch among the fixed costs).");
}

/** The car's fixed costs, in its Garage card: tap one to change it. */
export function fixedSection(car, ctx) {
  const today = ctx.today;
  const items = car.fixed || [];
  const total = items.reduce((a, f) => a + f.amount, 0);
  const rows = items.map((f) => h("button", { type: "button", class: "crow", onclick: () => openFixedSheet(ctx, car, f) },
    typeBadge(f.type),
    h("div", { class: "crow-main" },
      h("div", { class: "crow-title" }, fixedName(f)),
      h("div", { class: "crow-sub" }, `Every month on ${ordinal(f.day)}`),
      h("div", { class: "crow-extra" }, `Next log ${dayText(nextFixedDate(f, today), today)}  ·  since ${MONTHS[Number(f.from.slice(5)) - 1].slice(0, 3)} ${f.from.slice(0, 4)}`)),
    h("div", { class: "crow-cost amt" }, fmtSek(f.amount)),
    icon("chevron", 16, "chev")));
  return h("div", { class: "garage-sec" },
    h("div", { class: "cap-row" }, h("span", { class: "caption" }, "FIXED COSTS"),
      items.length ? h("span", { class: "hint amt-soft" }, `${fmtSek(total)} a month, logged by themselves`) : null),
    items.length ? h("div", { class: "fixed-list" }, rows)
      : h("div", { class: "muted garage-none" }, "Costs you pay every month, like insurance or a parking space you rent. Add them here and the app logs them on their day every month, so you don't have to."),
    budgetLine(car, ctx),
    h("button", { type: "button", class: "link-btn garage-link", onclick: () => openFixedSheet(ctx, car, null) }, "+  Add a fixed cost"));
}

export function openFixedSheet(ctx, car, item = null) {
  const today = ctx.today;
  const thisMonth = monthOf(today);
  const isNew = !item;
  const f = item || { id: newFixedId(), type: "insurance", name: "", amount: null, day: 1, from: thisMonth, added: null };
  let type = f.type, day = String(f.day);
  const typeRow = selectRow("Kind", FIXED_TYPES.map((t) => [t, t === "tax" ? "Vehicle tax" : TYPE[t].name]), type, (v) => { type = v; validate(); });
  const name = textField("optional, e.g. the company", f.name, { "aria-label": "Name" });
  const amount = numField("e.g. 787");
  if (f.amount) amount.value = plainNumber(f.amount, f.amount % 1 ? 2 : 0);
  const dayRow = selectRow("Logged on", DAY_OPTIONS, day, (v) => { day = v; validate(); });
  const since = h("input", { class: "form-input date-input", type: "month", value: f.from, "aria-label": "Since" });
  const preview = footer("");
  let api = null;

  const draft = () => ({ ...f, type, name: name.value.trim(), amount: parseNumber(amount.value), day: Number(day), from: since.value });
  /** The logs saving adds at once: the months up to today (a new one), or the months before a start moved earlier. */
  const fillIn = (d) => (isNew || !f.added ? dueFixedLogs(car, today, { ...d, added: null })
    : d.from < f.from ? dueFixedLogs(car, today, d, d.from, addMonths(f.from, -1)) : { entries: [] }).entries;
  function validate() {
    const d = draft();
    const amountBad = Boolean(amount.value.trim()) && !(d.amount > 0);
    const sinceBad = !MONTH_RX.test(d.from);
    amount.classList.toggle("invalid", amountBad);
    since.classList.toggle("invalid", sinceBad);
    api?.setRight({ disabled: amountBad || sinceBad || !(d.amount > 0) });
    if (!(d.amount > 0) || sinceBad) {
      preview.textContent = "What you pay every month, and the day. The app adds a log for it on that day every month, from the month in Since.";
      return;
    }
    const now = fillIn(d).length;
    const next = nextFixedDate(isNew || !f.added ? { ...d, added: null } : d, today);
    preview.textContent = `${now ? `${plural(now, "log")} for the months up to today ${now === 1 ? "is" : "are"} added when you save. ` : ""}`
      + `Next log: ${dayText(next, today)}, ${fmtSek(d.amount)}.`
      + (isNew ? "" : " The logs already added stay as they are; you can edit or delete them in the Log.");
  }
  for (const el of [name, amount, since]) el.addEventListener("input", validate);
  since.addEventListener("change", validate);

  const body = h("div", { class: "form" },
    ctx.data.cars.length > 1 ? footer(`For ${carTitle(car)}`) : null,
    caption("WHAT"),
    group(typeRow, row("Name", name)),
    footer("The name goes in the note of every log, e.g. the insurance company or the garage."),
    caption("EVERY MONTH"),
    group(row("Amount", amount, `${localSym()}/month`), dayRow, row("Since", since)),
    preview,
    !isNew ? h("button", { type: "button", class: "btn destructive-row", onclick: () => remove() }, "Stop This Fixed Cost") : null);

  async function remove() {
    const n = fixedLogCount(car, f);
    const ok = await alertBox({ title: `Stop ${fixedName(f)}?`,
      message: `No more logs from now on.${n ? ` The ${plural(n, "log")} it added stay in your Log.` : ""}`,
      buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Stop", value: true, style: "destructive" }] });
    if (!ok) return;
    store.deleteFixed(car.id, f.id);
    api.close();
    toast(`Stopped ${fixedName(f).toLowerCase()}`);
    syncTap();
  }

  api = sheet({ title: isNew ? "New Fixed Cost" : "Fixed Cost", left: { text: "Cancel" }, body,
    right: { text: "Save", bold: true, onClick: (sh) => {
      const d = draft();
      if (!(d.amount > 0) || !MONTH_RX.test(d.from)) return;
      const next = { ...d, amount: Math.round(d.amount * 100) / 100 };
      const entries = fillIn(next);
      store.saveFixed(car.id, next);
      if (entries.length && !isNew && f.added) store.addFixedLogs(car.id, entries, {}, true);   // a start moved earlier
      addFixedCostLogs();                                                                       // the months up to today
      sh.close();
      toast(`✓  ${isNew ? "Added" : "Saved"} ${fixedName(next).toLowerCase()}${entries.length ? `  ·  ${plural(entries.length, "log")} added` : ""}`);
      syncTap();
    } } });
  validate();
  return api;
}
