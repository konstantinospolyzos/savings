import { h, sheet, group, caption, footer, toggle, alertBox, toast, icon } from "../ui.js";
import {
  BROKERS, TRAVEL_RX, addMonths, defaultNewMonth, mLong, mShort, parseNumber, plainNumber, rateText,
  fmtEur, fmtSek, toneOf, fetchSekToEur,
} from "../core.js";
import { store } from "../store.js";

function field(placeholder) {
  return h("input", { class: "form-input", type: "text", inputmode: "decimal", autocomplete: "off", autocorrect: "off",
    spellcheck: "false", placeholder });
}

function row(labelText, input, unit = null, extra = null) {
  return h("label", { class: "form-row" }, h("span", { class: "form-label" }, labelText), input,
    unit ? h("span", { class: "form-unit" }, unit) : null, extra);
}

export function openMonthSheet(ctx, original = null) {
  const entries = ctx.entries;
  const last = entries.at(-1) || null;
  let month = original ? original.month : defaultNewMonth(entries, ctx.today);
  let fetchInfo = "", fetchError = "";
  let tripTouched = false;

  const ph = (v, d = 0) => `Last: ${plainNumber(v, d)}`;
  const income = field(last ? ph(last.income_sek) : "0");
  const bank = field(last ? ph(last.bank_sek) : "0");
  const invested = field(last ? ph(last.invested_eur, 2) : "0.00");
  const added = field("optional");
  const rate = field("0.0885");
  const note = h("textarea", { class: "note-input", rows: "3", placeholder: "What happened this month? Trips, gifts, big buys, bonus…" });

  const monthLabel = h("div", { class: "month-label" });
  const monthNote = footer("", "warn");
  const convFooter = footer("");
  const rateFooter = footer("");
  const tripFooter = footer("");
  const summary = h("div", { class: "form-summary" });
  const fetchBtn = h("button", { type: "button", class: "btn tinted small" }, "Fetch");

  const tripSwitch = toggle(false, () => { tripTouched = true; tripText(); }, "Trip month");

  function tripText() {
    tripFooter.textContent = tripSwitch.input.checked && !tripTouched
      ? "Turned on because your note mentions a trip. Switch it off if that's wrong."
      : "Turn on if you travelled or paid for a trip this month. Insights compares trip months with the others.";
  }

  note.addEventListener("input", () => {
    note.style.height = "auto";
    note.style.height = `${Math.max(note.scrollHeight, 76)}px`;
    if (!tripTouched) { tripSwitch.input.checked = TRAVEL_RX.test(note.value || ""); tripText(); }
  });

  const read = () => {
    const raw = parseNumber(rate.value, true);
    let r = null;
    if (raw !== null && raw > 0) r = raw < 1 ? raw : 1 / raw;       // 11.30 is understood as EUR->SEK
    return { inc: parseNumber(income.value), bnk: parseNumber(bank.value), inv: parseNumber(invested.value),
      add: parseNumber(added.value), raw, r };
  };

  let api = null;
  function validate() {
    const { inc, bnk, inv, add, raw, r } = read();
    for (const [f, v] of [[income, inc], [bank, bnk], [invested, inv], [rate, r], [added, add]])
      f.classList.toggle("invalid", Boolean(f.value.trim()) && v === null);

    if (r && (inc !== null || bnk !== null)) {
      const parts = [];
      if (inc !== null) parts.push(`Income ≈ ${fmtEur(inc * r)}`);
      if (bnk !== null) parts.push(`Bank ≈ ${fmtEur(bnk * r)}`);
      convFooter.textContent = parts.join("  ·  ");
    } else convFooter.textContent = "Type the amounts as you see them in your bank, Freedom24 and IBKR.";

    rateFooter.className = `section-footer ${fetchError ? "tone-text-down" : ""}`;
    if (fetchError) rateFooter.textContent = fetchError;
    else if (r) {
      let t = `1 EUR = ${(1 / r).toFixed(3)} SEK`;
      if (raw >= 1) t += "  ·  converted from EUR→SEK";
      if (fetchInfo) t += `  ·  ${fetchInfo}`;
      rateFooter.textContent = t;
    } else rateFooter.textContent = "Type 0.0885 (SEK→EUR) or 11.30 (EUR→SEK), or tap Fetch.";

    const ok = inc !== null && bnk !== null && inv !== null && r !== null && !(added.value.trim() && add === null);
    api?.setRight({ disabled: !ok });
    if (ok) {
      const prev = [...entries].reverse().find((e) => e.month < month && !(original && e.month === original.month));
      if (prev) {
        const dBank = bnk - prev.bank_sek, dInv = inv - prev.invested_eur;
        summary.textContent = `Bank ${fmtSek(dBank, true)}  ·  Invested ${fmtEur(dInv, 0, true)}  vs ${mShort(prev.month)}`;
        summary.className = `form-summary tone-text-${toneOf(dBank)}`;
      } else {
        summary.textContent = `Bank ≈ ${fmtEur(bnk * r)}  ·  Invested ${fmtEur(inv)}`;
        summary.className = "form-summary";
      }
    } else {
      summary.textContent = "Fill in income, bank, invested and the rate to save.";
      summary.className = "form-summary muted";
    }
  }

  function updateMonth() {
    monthLabel.textContent = mLong(month);
    fetchInfo = ""; fetchError = "";
    const clash = entries.some((e) => e.month === month) && !(original && original.month === month);
    monthNote.textContent = clash ? `${mLong(month)} is already logged. Saving will replace it.` : "";
    monthNote.style.display = clash ? "" : "none";
    api?.setRight({ text: clash ? "Replace" : "Save" });
    validate();
  }

  for (const f of [income, bank, invested, added, rate]) f.addEventListener("input", () => { if (f === rate) { fetchInfo = ""; fetchError = ""; } validate(); });

  fetchBtn.addEventListener("click", async () => {
    fetchBtn.disabled = true;
    fetchBtn.textContent = "…";
    fetchError = "";
    try {
      const [r, d] = await fetchSekToEur(month, ctx.today);
      rate.value = rateText(r);
      fetchInfo = `ECB rate of ${d}`;
    } catch {
      fetchError = "Couldn't fetch the rate. Check your connection, or type it in.";
    }
    fetchBtn.disabled = false;
    fetchBtn.textContent = "Fetch";
    validate();
  });

  const stepper = h("div", { class: "month-stepper" },
    h("button", { type: "button", class: "stepper", "aria-label": "Previous month", onclick: () => { month = addMonths(month, -1); updateMonth(); } }, icon("chevronLeft", 18)),
    monthLabel,
    h("button", { type: "button", class: "stepper", "aria-label": "Next month", onclick: () => { month = addMonths(month, 1); updateMonth(); } }, icon("chevron", 18)));

  const body = h("div", { class: "form" },
    caption("MONTH"), group(stepper), monthNote,
    caption("AMOUNTS"),
    group(row("Income (salary)", income, "kr"), row("Bank savings", bank, "kr"), row(`Invested (${BROKERS})`, invested, "€")),
    convFooter,
    caption("INVESTMENTS"),
    group(row("Added this month", added, "€")),
    footer("Money you moved into Freedom24 or IBKR this month. Optional, but it lets Insights tell your own saving apart from market ups and downs."),
    caption("EXCHANGE RATE"),
    group(row("1 SEK =", rate, "€", fetchBtn)),
    rateFooter,
    caption("TRAVEL"),
    group(h("label", { class: "form-row switch-row" }, h("span", { class: "form-label" }, icon("plane", 15, "inline-icon"), "Trip month"), tripSwitch)),
    tripFooter,
    caption("NOTE"),
    group(h("div", { class: "note-wrap" }, note)),
    footer("Notes feed the Insights page: it spots trips, gifts, bigger buys and extra income and shows what they do to your savings."),
    summary,
    original ? h("button", { type: "button", class: "btn destructive-row", onclick: () => remove() }, "Delete Month") : null);

  if (original) {
    income.value = plainNumber(original.income_sek);
    bank.value = plainNumber(original.bank_sek);
    invested.value = plainNumber(original.invested_eur, 2);
    rate.value = rateText(original.sek_to_eur);
    if (original.added_eur !== null && original.added_eur !== undefined) added.value = plainNumber(original.added_eur, 2);
    note.value = original.comment || "";
    if (original.trip !== null && original.trip !== undefined) { tripSwitch.input.checked = Boolean(original.trip); tripTouched = true; }
  } else if (last) rate.value = rateText(last.sek_to_eur);

  function save(sh) {
    const { inc, bnk, inv, add, r } = read();
    if ([inc, bnk, inv, r].includes(null) || (added.value.trim() && add === null)) return;
    const entry = { month, income_sek: inc, bank_sek: bnk, invested_eur: inv, sek_to_eur: r,
      comment: note.value.trim(), added_eur: add, trip: tripSwitch.input.checked };
    store.saveEntry(entry, original && original.month !== month ? original.month : null);
    sh.close();
    toast(`✓  Saved ${mLong(month)}`);
    if (store.mode === "drive" && !store.drive.tokenValid()) store.syncFromTap();   // sign-in needs this tap
  }

  async function remove() {
    const ok = await alertBox({ title: `Delete ${mLong(original.month)}?`,
      message: "This month will be removed from your history. This can't be undone.",
      buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Delete", value: true, style: "destructive" }] });
    if (!ok) return;
    store.deleteEntry(original.month);
    api.close();
    toast(`Deleted ${mLong(original.month)}`);
    if (store.mode === "drive" && !store.drive.tokenValid()) store.syncFromTap();
  }

  api = sheet({ title: original ? "Edit Month" : "New Month", left: { text: "Cancel" },
    right: { text: "Save", bold: true, onClick: save }, body });
  note.dispatchEvent(new Event("input"));
  if (original && original.trip !== null && original.trip !== undefined) tripTouched = true;
  tripText();
  updateMonth();
  if (!original && matchMedia("(pointer: fine)").matches) setTimeout(() => income.focus(), 350);
  return api;
}
