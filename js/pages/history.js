import { h, chip, icon, segmented, toast } from "../ui.js";
import {
  computeRows, monthFlows, tripStatus, isTrip, mLong, mYear, fmtSek, fmtEur, nMonths, pct, toneOf,
  incomeEur, bankEur, toCsv, CUR, localSym, secondSym,
} from "../core.js";
import { store } from "../store.js";
import { saveFile } from "../ui.js";

let query = "";

function highlight(text, q) {
  const span = h("span");
  if (!q) { span.textContent = text; return span; }
  const lower = text.toLowerCase(), ql = q.toLowerCase();
  let i = 0;
  while (i <= text.length) {
    const j = lower.indexOf(ql, i);
    if (j < 0) { span.append(text.slice(i)); break; }
    span.append(text.slice(i, j), h("mark", null, text.slice(j, j + q.length)));
    i = j + q.length;
  }
  return span;
}

function yearSummary(group, rows, flows) {
  const income = group.reduce((a, e) => a + e.income_sek, 0);
  const known = group.map((e) => rows.get(e.month).saved_sek).filter((v) => v !== null);
  const parts = [nMonths(group.length), `income ${fmtSek(income)}`];
  if (known.length) parts.push(`saved in bank ${fmtSek(known.reduce((a, b) => a + b, 0), true)}`);
  const fl = group.map((e) => flows.get(e.month)).filter(Boolean);
  const fi = fl.reduce((a, f) => a + f.income, 0);
  if (fi > 0) parts.push(`savings rate ${pct(fl.reduce((a, f) => a + f.saved, 0) / fi)}`);
  return parts.join("  ·  ");
}

function monthCell(e, row, flow, q, ctx) {
  const [trip, flagged] = tripStatus(e);
  const head = h("div", { class: "hrow-head" },
    h("div", { class: "hrow-title" }, highlight(mLong(e.month), q),
      trip ? h("span", { class: `trip-badge ${flagged ? "" : "guessed"}`, title: flagged ? "Trip month" : "Trip month, guessed from the note" }, icon("plane", 11), "Trip") : null),
    flow ? h("div", { class: `hrow-rate tone-text-${flow.rate >= 0.10 ? "up" : flow.rate < 0 ? "down" : "flat"}` },
      pct(flow.rate), h("span", { class: "hrow-rate-sub" }, fmtSek(flow.saved, true))) : h("div", { class: "hrow-rate muted" }, "—"),
    icon("chevron", 16, "chev"));

  const saved = row.saved_sek;
  const dInv = row.invested_delta;
  const invSub = [];
  if (dInv !== null) invSub.push(h("span", { class: `tone-text-${toneOf(dInv)}` }, `${fmtEur(dInv, 0, true)} this month`));
  if (e.added_eur !== null && e.added_eur !== undefined) invSub.push(h("span", { class: "muted" }, `added ${fmtEur(e.added_eur)}`));

  const grid = h("div", { class: "hrow-grid" },
    h("div", { class: "metric" }, h("div", { class: "metric-cap" }, "Income"),
      h("div", { class: "metric-value" }, fmtSek(e.income_sek)), CUR.single ? null : h("div", { class: "metric-sub" }, fmtEur(incomeEur(e)))),
    h("div", { class: "metric" }, h("div", { class: "metric-cap" }, "Bank savings"),
      h("div", { class: "metric-value" }, fmtSek(e.bank_sek)),
      h("div", { class: "metric-sub" }, saved === null ? (CUR.single ? "" : fmtEur(bankEur(e))) : chip(fmtSek(saved, true), toneOf(saved), "small"))),
    h("div", { class: "metric" }, h("div", { class: "metric-cap" }, "Invested"),
      h("div", { class: "metric-value" }, fmtEur(e.invested_eur, CUR.single ? 0 : 2)),
      invSub.length ? h("div", { class: "metric-sub stack" }, invSub) : null));

  return h("button", { type: "button", class: "hrow", onclick: () => ctx.openMonth(e) },
    head, grid,
    h("div", { class: "hrow-foot" },
      e.comment ? h("div", { class: "hrow-note" }, highlight(e.comment, q)) : null,
      CUR.single ? null : h("div", { class: "hrow-rate-line" }, `1 ${secondSym()} = ${(1 / e.sek_to_eur).toFixed(2)} ${localSym()}`)));
}

export function renderHistory(ctx) {
  const es = ctx.entries;
  const view = { filter: 0, order: 0, ...(store.pref("history_view", {}) || {}) };
  const rows = new Map(computeRows(es).map((r) => [r.entry.month, r]));
  const flows = new Map(monthFlows(es).map((f) => [f.month, f]));
  const subtitle = h("span");
  const list = h("div", { class: "history-list" });

  function fill() {
    const q = query.trim();
    const ql = q.toLowerCase();
    let shown = es.filter((e) => {
      if ((view.filter === 1 && !isTrip(e)) || (view.filter === 2 && isTrip(e))) return false;
      if (ql && !(e.comment || "").toLowerCase().includes(ql) && !mLong(e.month).toLowerCase().includes(ql)) return false;
      return true;
    });
    if (view.order === 0) shown = shown.reverse();
    const filtered = Boolean(ql) || view.filter !== 0;
    subtitle.textContent = !es.length ? "Nothing logged yet"
      : filtered ? `${shown.length} of ${nMonths(es.length)} shown  ·  tap a month to edit it`
        : `${nMonths(es.length)}  ·  tap a month to edit or delete it`;
    list.replaceChildren();
    if (!shown.length) {
      list.append(h("div", { class: "card empty-small" }, !es.length
        ? "No months yet. Tap + to log your first one."
        : `No months match${q ? ` “${q}”` : ""}. Try another search or filter.`));
      return;
    }
    const groups = [];
    for (const e of shown) {
      if (!groups.length || groups.at(-1)[0] !== mYear(e.month)) groups.push([mYear(e.month), []]);
      groups.at(-1)[1].push(e);
    }
    for (const [year, group] of groups) {
      list.append(h("div", { class: "year-head" }, h("div", { class: "year-title" }, String(year)),
        h("div", { class: "year-sum" }, yearSummary(group, rows, flows))));
      list.append(h("div", { class: "hgroup" }, group.map((e) => monthCell(e, rows.get(e.month), flows.get(e.month), q, ctx))));
    }
  }

  const input = h("input", { type: "search", class: "search-input", placeholder: "Search notes and months",
    value: query, enterkeyhint: "search", autocomplete: "off", "aria-label": "Search notes and months" });
  input.addEventListener("input", () => { query = input.value; fill(); });
  input.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { input.value = query = ""; fill(); input.blur(); } });

  const orderBtn = h("button", { type: "button", class: "pill-btn" }, icon("sort", 15), view.order === 0 ? "Newest first" : "Oldest first");
  orderBtn.addEventListener("click", () => {
    view.order = 1 - view.order;
    store.setPref("history_view", view);
    orderBtn.replaceChildren(icon("sort", 15), view.order === 0 ? "Newest first" : "Oldest first");
    fill();
  });
  const exportBtn = h("button", { type: "button", class: "pill-btn" }, icon("table", 15), "Export CSV");
  exportBtn.addEventListener("click", async () => {
    if (!es.length) { toast("Nothing to export yet"); return; }
    await saveFile(`savings-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv", toCsv(es));
  });

  fill();
  return [subtitle,
    h("div", { class: "search-wrap" }, icon("search", 17, "search-icon"), input),
    segmented(["All months", "✈ Trips", "Other months"], view.filter, (i) => { view.filter = i; store.setPref("history_view", view); fill(); }, "full"),
    h("div", { class: "pill-row" }, orderBtn, exportBtn),
    list];
}
