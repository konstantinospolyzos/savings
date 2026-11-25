// Pieces the savings pages share: the stat card (Insights, the car monitor), your money over the months (Insights)
// and the empty state (Home). The Overview tab became Home.
import { h, chip, dot, segmented, toggle, appIcon } from "../ui.js";
import { chart, linearFit } from "../charts.js";
import { SERIES, fmtEur, fmtSek, fmtAxisEur, logName, mIndex, COLORS, bankEur, incomeEur, totalEur, CUR } from "../core.js";
import { store } from "../store.js";

export function emptyState(ctx) {
  return h("div", { class: "card empty-state" },
    appIcon(64),
    h("div", { class: "empty-title" }, "No months yet"),
    h("div", { class: "empty-text" }, "Log your salary, bank savings and investments once a month. The app converts everything to euro and draws the charts for you."),
    h("button", { class: "btn primary", type: "button", onclick: () => ctx.openMonth(null) }, "+  Add your first month"),
    h("button", { class: "btn plain", type: "button", onclick: () => ctx.importDesktop() }, "Import from the desktop app"));
}

/** hide: which parts are money and get blurred in privacy mode, e.g. "vsc" = value, sub, chip */
export function statCard(title, color, value, sub, chipText = "", tone = "flat", hide = "") {
  const amt = (part) => (hide.includes(part) ? " amt" : "");
  return h("div", { class: "card stat" },
    h("div", { class: "cap-row" }, dot(color, 7), h("span", { class: "caption" }, title)),
    h("div", { class: `stat-value${amt("v")}` }, value),
    h("div", { class: `stat-sub${amt("s")}` }, sub),
    chipText ? chip(chipText, tone, amt("c")) : null);
}

/** Your money over the months: balances or monthly changes (Insights shows it at the top). */
export function chartCard(es) {
  const st = { series: { bank: true, invested: true, income: true, total: false }, trend: true, view: 0, range: 2,
    ...(store.pref("overview_chart", {}) || {}) };
  st.series = { bank: true, invested: true, income: true, total: false, ...(st.series || {}) };
  const save = () => store.setPref("overview_chart", st);

  const body = h("div", { class: "chart-body" });
  const legend = h("div", { class: "legend" });
  const trendRow = h("label", { class: "trend-row" });

  function visible() {
    const n = { 0: 6, 1: 12 }[st.range];
    if (!n) return es;
    const cutoff = mIndex(es.at(-1).month) - (n - 1);
    return es.filter((e) => mIndex(e.month) >= cutoff);
  }

  function render() {
    const vis = visible();
    legend.replaceChildren();
    trendRow.style.display = st.view === 0 ? "" : "none";
    if (st.view === 0) {
      const values = { bank: vis.map(bankEur), invested: vis.map((e) => e.invested_eur), income: vis.map(incomeEur), total: vis.map(totalEur) };
      const xs = vis.map((e) => mIndex(e.month));
      const series = [];
      for (const [key, [label, color]] of Object.entries(SERIES)) {
        const fit = vis.length >= 2 ? linearFit(xs, values[key]) : null;
        const on = st.series[key];
        const b = h("button", { type: "button", class: `series-chip ${on ? "on" : ""}`, "aria-pressed": String(on) },
          dot(on ? color : "var(--gray3)", 8), label,
          fit && st.trend ? h("span", { class: "slope" }, `${fmtEur(fit[0], 0, true)}/mo`) : null);
        b.addEventListener("click", () => { st.series[key] = !st.series[key]; save(); render(); });
        legend.appendChild(b);
        if (on) series.push({ key, label, color, values: values[key], fill: key === "bank", trend: st.trend ? fit : null });
      }
      if (!vis.length) body.replaceChildren(h("div", { class: "chart-empty" }, "Add a month to see your chart"));
      else if (!series.length) body.replaceChildren(h("div", { class: "chart-empty" }, "Pick at least one line above"));
      else body.replaceChildren(chart({
        months: vis.map((e) => e.month), kind: "line", series, format: fmtAxisEur, zeroBased: true, label: "Your money in euro",
        tooltip: (i) => ({ title: logName(vis[i].month), rows: series.map((ser) => [ser.label, fmtEur(ser.values[i]), ser.color]) }),
      }));
    } else {
      const visibleSet = new Set(vis.map((e) => e.month));
      const rows = [];
      for (let k = 1; k < es.length; k++) {
        const a = es[k - 1], b = es[k];
        if (visibleSet.has(b.month)) rows.push([b, b.bank_sek - a.bank_sek, b.invested_eur - a.invested_eur]);
      }
      legend.append(h("span", { class: "legend-item" }, dot(COLORS.blue), "Saved in bank"),
        h("span", { class: "legend-item" }, dot(COLORS.orange), "Invested change"));
      if (!rows.length) { body.replaceChildren(h("div", { class: "chart-empty" }, "Log at least two months to see changes")); return; }
      const bankE = rows.map(([e, d]) => d * e.sek_to_eur);
      body.replaceChildren(chart({
        months: rows.map(([e]) => e.month), kind: "bar", format: fmtAxisEur, zeroBased: true, label: "Monthly changes",
        series: [{ color: COLORS.blue, values: bankE }, { color: COLORS.orange, values: rows.map((r) => r[2]) }],
        tooltip: (i) => {
          const [e, bankSek, dInv] = rows[i];
          const out = [["Saved in bank", CUR.single ? fmtSek(bankSek, true) : `${fmtEur(bankE[i], 0, true)} (${fmtSek(bankSek, true)})`, COLORS.blue],
            ["Invested change", fmtEur(dInv, 0, true), COLORS.orange]];
          if (e.added_eur !== null && e.added_eur !== undefined) out.push(["of which you added", fmtEur(e.added_eur), null]);
          return { title: logName(e.month), rows: out };
        },
      }));
    }
  }

  const sw = toggle(st.trend, (on) => { st.trend = on; save(); render(); }, "Trend lines");
  trendRow.append(h("span", null, "Trend lines"), sw);
  render();
  return h("div", { class: "card chart-card" },
    h("div", { class: "card-title" }, `Your money in ${CUR.second}`),
    segmented(["Balances", "Monthly changes"], st.view, (i) => { st.view = i; save(); render(); }, "full"),
    h("div", { class: "chart-controls" },
      segmented(["6M", "1Y", "All"], st.range, (i) => { st.range = i; save(); render(); }, "small"),
      trendRow),
    legend,
    body,
    h("div", { class: "hint center" }, "Touch the chart to see each month."));
}

