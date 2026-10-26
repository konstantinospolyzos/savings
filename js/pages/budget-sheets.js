// Sheets for the Budget page: a fixed cost, a saving goal, the saving profiles.
import { h, sheet, group, caption, footer, toggle, segmented, selectRow, alertBox, toast, icon } from "../ui.js";
import {
  CATEGORIES, GOAL_CATEGORIES, PROFILE_DEFS, addMonths, mShort, mIndex, parseNumber, plainNumber, fmtSek,
  goalPlannedBy, roundTo10, CUR, CURRENCIES, inSweden, localSym, rateShown, fromSek, MIN_FLOOR_SEK,
} from "../core.js";
import { store } from "../store.js";

function field(placeholder, mode = "decimal") {
  return h("input", { class: "form-input", type: "text", inputmode: mode, autocomplete: "off", autocorrect: "off",
    spellcheck: "false", placeholder });
}
const row = (labelText, input, unit = null, extra = null) => h("label", { class: "form-row" },
  h("span", { class: "form-label" }, labelText), input, unit ? h("span", { class: "form-unit" }, unit) : null, extra);
const plainRow = (labelText, ...right) => h("div", { class: "form-row" }, h("span", { class: "form-label" }, labelText),
  h("span", { class: "form-right" }, right));
const switchRow = (labelText, sw, extra = null) => h("div", { class: "form-row switch-row" },
  h("span", { class: "form-label" }, labelText), extra, sw);

function monthStepper(get, set, onChange) {
  const label = h("span", { class: "mini-month" }, mShort(get()));
  const step = (n) => { set(addMonths(get(), n)); label.textContent = mShort(get()); onChange?.(); };
  const el = h("span", { class: "mini-stepper" },
    h("button", { type: "button", class: "stepper small", "aria-label": "Earlier", onclick: () => step(-1) }, icon("chevronLeft", 15)),
    label,
    h("button", { type: "button", class: "stepper small", "aria-label": "Later", onclick: () => step(1) }, icon("chevron", 15)));
  el.refresh = () => { label.textContent = mShort(get()); };
  return el;
}

const syncNow = () => { if (store.mode === "drive" && !store.drive.tokenValid()) store.syncFromTap(); };
const nextPosition = (list) => Math.max(-1, ...list.map((x) => x.position)) + 1;

async function confirmDelete(name, what) {
  return alertBox({ title: `Delete “${name}”?`, message: `It will be removed from your ${what}.`,
    buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Delete", value: true, style: "destructive" }] });
}

// ---------------------------------------------------------------------------
export function openExpenseSheet(ctx, snap, original = null) {
  const fx = snap.fx || 0;
  let endMonth = original?.end_month || addMonths(snap.base, 11);
  const name = field("e.g. Netflix", "text");
  const amount = field("0");
  let currency = original?.currency === "EUR" ? 1 : 0;
  let per = original?.per === "year" ? 1 : 0;
  const names = CATEGORIES.map(([c]) => c);
  let category = original && names.includes(original.category) ? original.category : original ? names.at(-1) : names[0];
  const amountFooter = footer("");
  amountFooter.classList.add("amt");

  if (CUR.single) currency = 0;
  const curSeg = CUR.single ? null : segmented([CUR.local, CUR.second], currency, (i) => { currency = i; validate(); }, "small");
  const perSeg = segmented(["Per month", "Per year"], per, (i) => { per = i; validate(); }, "small");
  const active = toggle(original ? original.active : true, () => {}, "Include in budget");
  const stepper = monthStepper(() => endMonth, (m) => { endMonth = m; });
  const hasEnd = toggle(Boolean(original?.end_month), (on) => { stepper.style.visibility = on ? "" : "hidden"; }, "Last month");
  stepper.style.visibility = hasEnd.input.checked ? "" : "hidden";
  const catRow = selectRow("Category", CATEGORIES.map(([c]) => [c, c]), category, (v) => {
    category = v;
    if (!original && v === "Instalments" && !hasEnd.input.checked) { hasEnd.input.checked = true; stepper.style.visibility = ""; }
  });

  if (original) {
    name.value = original.name;
    if (original.amount) amount.value = plainNumber(original.amount, original.amount === Math.round(original.amount) ? 0 : 2);
  }

  let api = null;
  function validate() {
    const v = parseNumber(amount.value);
    amount.classList.toggle("invalid", Boolean(amount.value.trim()) && (v === null || v < 0));
    const eur = currency === 1, yearly = per === 1;
    let t = CUR.single ? "Yearly bills are spread over 12 months."
      : `Pick ${CUR.second} for things billed in ${CUR.second}. Yearly bills are spread over 12 months.`;
    if (v && v > 0) {
      const perMonth = yearly ? v / 12 : v;
      if (eur && fx) t = `≈ ${fmtSek(perMonth / fx)} a month in the budget, at 1 ${CUR.second} = ${rateShown(fx)} ${CUR.local} (set on the Budget page).`;
      else if (eur) t = "Set an exchange rate on the Budget page to convert euro costs.";
      else if (yearly) t = `Counts as ${fmtSek(perMonth)} a month in the budget.`;
      else t = `That's ${fmtSek(v * 12)} a year.`;
    }
    amountFooter.textContent = t;
    api?.setRight({ disabled: !(name.value.trim() && v !== null && v >= 0) });
  }
  name.addEventListener("input", validate);
  amount.addEventListener("input", validate);

  function save(sh) {
    const v = parseNumber(amount.value);
    if (!name.value.trim() || v === null || v < 0) return;
    const x = {
      id: original ? original.id : null, name: name.value.trim(), amount: v, per: per === 1 ? "year" : "month",
      category, active: active.input.checked, end_month: hasEnd.input.checked ? endMonth : null,
      position: original ? original.position : nextPosition(snap.expenses), currency: currency === 1 ? "EUR" : "SEK",
    };
    store.saveExpense(x);
    sh.close();
    toast(`✓  ${original ? "Saved" : "Added"} ${x.name}`);
    syncNow();
  }
  async function remove() {
    if (!(await confirmDelete(original.name, "fixed costs"))) return;
    store.deleteExpense(original.id);
    api.close();
    toast(`✓  Deleted ${original.name}`);
    syncNow();
  }

  const body = h("div", { class: "form" },
    caption("DETAILS"),
    group(row("Name", name), row("Amount", amount, CUR.single ? localSym() : null, curSeg), plainRow("Paid", perSeg), catRow),
    amountFooter,
    caption("BUDGET"),
    group(switchRow("Include in budget", active), switchRow("Last month", hasEnd, stepper)),
    footer("For instalments: turn on “Last month” and pick the final payment. After that month the cost drops out of the budget by itself."),
    original ? h("button", { type: "button", class: "btn destructive-row", onclick: remove }, "Delete Fixed Cost") : null);
  api = sheet({ title: original ? "Edit Fixed Cost" : "New Fixed Cost", left: { text: "Cancel" },
    right: { text: "Save", bold: true, onClick: save }, body });
  validate();
  if (matchMedia("(pointer: fine)").matches) setTimeout(() => (original ? amount : name).focus(), 350);
  return api;
}

// ---------------------------------------------------------------------------
export function openGoalSheet(ctx, snap, original = null) {
  const base = snap.base;
  let once = original?.kind === "once";
  let target = original?.target_month || addMonths(base, 5);
  const names = GOAL_CATEGORIES.map(([c]) => c);
  let category = original && names.includes(original.category) ? original.category : original ? names.at(-1) : names[0];

  const name = field("e.g. Trip to Japan", "text");
  const amount = field("0");
  const saved = field("0");
  const amountLabel = h("span", { class: "form-label" });
  const goalFooter = footer("");
  goalFooter.classList.add("amt");
  const stepper = monthStepper(() => target, (m) => { target = m; }, () => validate());
  const onceBlock = h("div", null, caption("ONE-OFF"), group(plainRow("Needed by", stepper), row("Already saved", saved, localSym())));
  const kindSeg = segmented(["Every year", "One-off"], once ? 1 : 0, (i) => { once = i === 1; kindChanged(); }, "small");
  const active = toggle(original ? original.active : true, () => {}, "Include in the plan");

  if (original) {
    name.value = original.name;
    if (original.amount) amount.value = plainNumber(original.amount);
    if (once) {
      const done = base > original.start_month ? goalPlannedBy(original, addMonths(base, -1)) : original.saved;
      if (done) saved.value = plainNumber(roundTo10(done));
    }
  }

  const read = () => [parseNumber(amount.value), saved.value.trim() ? parseNumber(saved.value) : 0];
  let api = null;
  function validate() {
    const [a, sv] = read();
    amount.classList.toggle("invalid", Boolean(amount.value.trim()) && (a === null || a < 0));
    saved.classList.toggle("invalid", sv === null || sv < 0);
    let ok = Boolean(name.value.trim()) && a !== null && a >= 0;
    let t, tone = "";
    if (once) {
      ok = ok && sv !== null && sv >= 0;
      if (target < base) { t = `Pick a month from ${mShort(base)} on.`; tone = "down"; ok = false; }
      else if (a && sv !== null) {
        const n = mIndex(target) - mIndex(base) + 1;
        const left = Math.max(a - sv, 0);
        t = left > 0 ? `${fmtSek(left / n)} a month for ${n} month${n !== 1 ? "s" : ""} (${mShort(base)} – ${mShort(target)}).`
          : "Already saved, so nothing more to put aside.";
      } else t = "The total you'll need, and the month you need it by.";
    } else {
      t = a ? `${fmtSek(a / 12)} a month goes to this goal.` : "What it costs you in a normal year, e.g. all your trips together.";
    }
    goalFooter.textContent = t;
    goalFooter.className = `section-footer amt ${tone ? `tone-text-${tone}` : ""}`;
    api?.setRight({ disabled: !ok });
    return ok;
  }
  function kindChanged() {
    amountLabel.textContent = once ? "Total" : "Per year";
    onceBlock.style.display = once ? "" : "none";
    stepper.refresh();
    validate();
  }
  for (const f of [name, amount, saved]) f.addEventListener("input", validate);

  function save(sh) {
    if (!validate()) return;
    const [a, sv] = read();
    const g = {
      id: original ? original.id : null, name: name.value.trim(), category, kind: once ? "once" : "year", amount: a,
      saved: once ? sv || 0 : 0, start_month: once ? base : null, target_month: once ? target : null,
      active: active.input.checked, position: original ? original.position : nextPosition(snap.goals_list),
    };
    store.saveGoal(g);
    sh.close();
    toast(`✓  ${original ? "Saved" : "Added"} ${g.name}`);
    syncNow();
  }
  async function remove() {
    if (!(await confirmDelete(original.name, "saving goals"))) return;
    store.deleteGoal(original.id);
    api.close();
    toast(`✓  Deleted ${original.name}`);
    syncNow();
  }

  const body = h("div", { class: "form" },
    caption("GOAL"),
    group(row("Name", name), selectRow("Category", GOAL_CATEGORIES.map(([c]) => [c, c]), category, (v) => { category = v; })),
    caption("AMOUNT"),
    group(plainRow("Repeats", kindSeg), h("label", { class: "form-row" }, amountLabel, amount, h("span", { class: "form-unit" }, localSym()))),
    onceBlock,
    goalFooter,
    caption("PLAN"),
    group(switchRow("Include in the plan", active)),
    footer("Goal money goes to your savings account on payday and is spent when the trip or purchase comes. It's kept apart from your buffer, and it doesn't count as saving."),
    original ? h("button", { type: "button", class: "btn destructive-row", onclick: remove }, "Delete Goal") : null);
  api = sheet({ title: original ? "Edit Goal" : "New Goal", left: { text: "Cancel" },
    right: { text: "Save", bold: true, onClick: save }, body });
  kindChanged();
  if (matchMedia("(pointer: fine)").matches) setTimeout(() => (original ? amount : name).focus(), 350);
  return api;
}

// ---------------------------------------------------------------------------
export function openProfilesSheet(ctx, snap) {
  const fields = {}, floorFields = {};
  const minFloor = fromSek(MIN_FLOOR_SEK);
  const pctField = (key, title) => {
    const f = h("input", { class: "form-input pct-input", type: "text", inputmode: "decimal", autocomplete: "off",
      value: String(snap.profiles[key]), "aria-label": `${title} percent` });
    fields[key] = f;
    f.addEventListener("input", validate);
    return row(title, f, "% of salary");
  };
  const floorField = (key, title) => {
    const f = h("input", { class: "form-input pct-input", type: "text", inputmode: "numeric", autocomplete: "off",
      value: plainNumber(snap.floors[key]), "aria-label": `${title}: at least, per week` });
    floorFields[key] = f;
    f.addEventListener("input", validate);
    return row(title, f, `${localSym()} a week`);
  };
  const rows = PROFILE_DEFS.map(([key, title]) => pctField(key, title));
  const floorRows = PROFILE_DEFS.map(([key, title]) => floorField(key, title));
  const note = footer("");
  const values = () => Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, parseNumber(f.value, true)]));
  const floors = () => Object.fromEntries(Object.entries(floorFields).map(([k, f]) => [k, parseNumber(f.value)]));
  let api = null;
  function validate() {
    const v = values(), fl = floors();
    const bad = Object.keys(v).filter((k) => v[k] === null || v[k] < 0 || v[k] > 90);
    const badFloor = Object.keys(fl).filter((k) => fl[k] === null || fl[k] < minFloor || fl[k] > 1e8);
    for (const [k, f] of Object.entries(fields)) f.classList.toggle("invalid", bad.includes(k));
    for (const [k, f] of Object.entries(floorFields)) f.classList.toggle("invalid", badFloor.includes(k));
    if (bad.length) { note.textContent = "Use percentages from 0 to 90."; note.className = "section-footer tone-text-down"; }
    else if (badFloor.length) { note.textContent = `At least ${fmtSek(minFloor)} a week for every plan: living on less isn't realistic.`; note.className = "section-footer tone-text-down"; }
    else if (!(v.light <= v.balanced && v.balanced <= v.high)) { note.textContent = "Tip: keep Light ≤ Balanced ≤ High so the names still fit."; note.className = "section-footer tone-text-warn"; }
    else if (!(fl.light >= fl.balanced && fl.balanced >= fl.high)) { note.textContent = "Tip: give Light the most to live on and High the least."; note.className = "section-footer tone-text-warn"; }
    else { note.textContent = ""; note.className = "section-footer"; }
    note.style.display = note.textContent ? "" : "none";
    api?.setRight({ disabled: bad.length > 0 || badFloor.length > 0 });
    return !bad.length && !badFloor.length;
  }
  function save(sh) {
    if (!validate()) return;
    store.setSetting("profile_rates", values());
    store.setSetting("profile_floors", floors());
    sh.close();
    toast("✓  Profiles updated");
    syncNow();
  }
  const body = h("div", { class: "form" },
    footer("How much of your salary each profile puts toward your future (buffer + investing). Fixed costs and saving goals come first; living money is what's left."),
    caption("SAVE FOR YOUR FUTURE"),
    group(rows),
    footer(`Rules of thumb: about 10% is ${inSweden() ? "Swedbank's everyday suggestion" : "a common everyday minimum"}, 20% matches the 50/30/20 rule, and 30% or more is high saving.`),
    caption("LIVE ON AT LEAST"),
    group(floorRows),
    footer(`Living money is what you spend beyond your fixed costs: eating out, fun, small buys. A plan never leaves you less than this a week: when its % doesn't fit, it saves less instead. At least ${fmtSek(minFloor)} a week.`),
    note,
    h("button", { type: "button", class: "link-btn center", onclick: () => {
      for (const [key, , , def, floorDef] of PROFILE_DEFS) { fields[key].value = String(def); floorFields[key].value = plainNumber(fromSek(floorDef)); }
      validate();
    } }, "Reset to suggested"));
  api = sheet({ title: "Saving Profiles", left: { text: "Cancel" }, right: { text: "Save", bold: true, onClick: save }, body });
  validate();
  return api;
}
