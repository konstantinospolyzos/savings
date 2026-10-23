import { h, chip, dot, segmented, toggle, appIcon, icon } from "../ui.js";
import { chart, linearFit } from "../charts.js";
import {
  COLORS, SERIES, MONTHS, fmtEur, fmtSek, fmtAxisEur, mLong, mShort, mIndex, mNum, nMonths, pct, toneOf, mean,
  monthFlows, summarize, paydayStatus, paydayReason, shortDate, longDate, daysBetween,
  bankEur, incomeEur, totalEur, investedSek,
} from "../core.js";
import { store } from "../store.js";

function emptyState(ctx) {
  return h("div", { class: "card empty-state" },
    appIcon(64),
    h("div", { class: "empty-title" }, "No months yet"),
    h("div", { class: "empty-text" }, "Log your salary, bank savings and investments once a month. The app converts everything to euro and draws the charts for you."),
    h("button", { class: "btn primary", type: "button", onclick: () => ctx.openMonth(null) }, "+  Add your first month"),
    h("button", { class: "btn plain", type: "button", onclick: () => ctx.importDesktop() }, "Import from the desktop app"));
}

function balanceHero(es, inv) {
  const last = es.at(-1), first = es[0], prev = es.length > 1 ? es.at(-2) : null;
  const vs = prev ? MONTHS[mNum(prev.month) - 1] : "";
  const half = (title, color, hint, value, sub, chips) => h("div", { class: "hero-half" },
    h("div", { class: "cap-row" }, dot(color), h("span", { class: "caption" }, title), h("span", { class: "hint" }, hint)),
    h("div", { class: "big-value amt" }, value),
    h("div", { class: "muted amt" }, sub),
    chips.length ? h("div", { class: "chips amt" }, chips) : null);

  const bankChips = [];
  const invChips = [];
  if (prev) {
    const d = last.bank_sek - prev.bank_sek;
    bankChips.push(chip(`${d >= 0 ? "▲" : "▼"} ${fmtSek(Math.abs(d))} vs ${vs}`, toneOf(d)));
    bankChips.push(chip(`${fmtSek(last.bank_sek - first.bank_sek, true)} since ${mShort(first.month)}`, "flat"));
    const di = last.invested_eur - prev.invested_eur;
    invChips.push(chip(`${di >= 0 ? "▲" : "▼"} ${fmtEur(Math.abs(di))} vs ${vs}`, toneOf(di)));
  }
  if (inv && inv.after !== null) invChips.push(chip(`≈ ${fmtEur(inv.after)} after tax`, "flat"));
  else if (prev) invChips.push(chip(`${fmtEur(last.invested_eur - first.invested_eur, 0, true)} since ${mShort(first.month)}`, "flat"));

  return h("div", { class: "card hero" },
    half("BANK SAVINGS", COLORS.blue, "money you can use", fmtEur(bankEur(last)), fmtSek(last.bank_sek), bankChips),
    h("div", { class: "hairline" }),
    half("INVESTED", COLORS.orange, "market value, before tax", fmtEur(last.invested_eur), `≈ ${fmtSek(investedSek(last))}`, invChips));
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

function stats(es, snap) {
  const last = es.at(-1);
  const last12 = es.slice(-12);
  const cards = [];
  cards.push(statCard("INCOME", COLORS.cyan, fmtEur(incomeEur(last)), fmtSek(last.income_sek),
    `Average ${fmtEur(mean(last12.map(incomeEur)))}`, "flat", "vsc"));

  const summ = summarize(monthFlows(es).slice(-12));
  if (summ) {
    let chipText = "", tone = "flat";
    if (snap.plan_ready) {
      const plan = snap.save_rate;
      chipText = `Plan ${pct(plan)}`;
      tone = summ.rate >= plan - 0.02 ? "up" : summ.rate < plan - 0.10 ? "down" : "flat";
    }
    cards.push(statCard("SAVED PER MONTH", COLORS.green, fmtSek(summ.saved, true),
      `${pct(summ.rate)} of income, last ${summ.n} months`, chipText, tone, "v"));
  } else cards.push(statCard("SAVED PER MONTH", COLORS.green, "—", "needs two months"));

  if (snap.plan_ready) {
    cards.push(statCard("BUFFER", COLORS.blue, `${(last.bank_sek / snap.fixed).toFixed(1)} months`, "of fixed costs in the bank",
      `Target ${snap.buffer_months} months`, snap.shortfall <= 0 ? "up" : "flat"));
  } else cards.push(statCard("BUFFER", COLORS.blue, "—", "fill in fixed costs in Budget"));

  const today = snap.today;
  const ps = paydayStatus(today);
  if (ps.isToday) cards.push(statCard("NEXT PAYDAY", COLORS.purple, "Today", `next one ${shortDate(ps.next)}`, "Salary lands today", "up"));
  else {
    const days = daysBetween(today, ps.next);
    const reason = paydayReason(ps.next);
    cards.push(statCard("NEXT PAYDAY", COLORS.purple, `${days} day${days !== 1 ? "s" : ""}`, longDate(ps.next),
      reason ? `25th is ${reason}` : "On the 25th"));
  }
  return h("div", { class: "stats" }, cards);
}

function chartCard(es) {
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
        tooltip: (i) => ({ title: mLong(vis[i].month), rows: series.map((ser) => [ser.label, fmtEur(ser.values[i]), ser.color]) }),
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
          const out = [["Saved in bank", `${fmtEur(bankE[i], 0, true)} (${fmtSek(bankSek, true)})`, COLORS.blue],
            ["Invested change", fmtEur(dInv, 0, true), COLORS.orange]];
          if (e.added_eur !== null && e.added_eur !== undefined) out.push(["of which you added", fmtEur(e.added_eur), null]);
          return { title: mLong(e.month), rows: out };
        },
      }));
    }
  }

  const sw = toggle(st.trend, (on) => { st.trend = on; save(); render(); }, "Trend lines");
  trendRow.append(h("span", null, "Trend lines"), sw);
  render();
  return h("div", { class: "card chart-card" },
    h("div", { class: "card-title" }, "Your money in EUR"),
    segmented(["Balances", "Monthly changes"], st.view, (i) => { st.view = i; save(); render(); }, "full"),
    h("div", { class: "chart-controls" },
      segmented(["6M", "1Y", "All"], st.range, (i) => { st.range = i; save(); render(); }, "small"),
      trendRow),
    legend,
    body,
    h("div", { class: "hint center" }, "Touch the chart to see each month."));
}

function noteCard(es) {
  const noted = [...es].reverse().find((e) => e.comment);
  if (!noted) return null;
  return h("div", { class: "card note-card" },
    h("div", { class: "caption" }, `LATEST NOTE  ·  ${mLong(noted.month).toUpperCase()}`),
    h("div", { class: "note-text" }, noted.comment));
}

export function renderOverview(ctx) {
  const es = ctx.entries;
  const subtitle = es.length ? `${nMonths(es.length)} logged  ·  latest: ${mLong(es.at(-1).month)}` : "Nothing logged yet";
  if (!es.length) return [subtitle, emptyState(ctx)];
  return [subtitle, balanceHero(es, ctx.inv), stats(es, ctx.snap), chartCard(es), noteCard(es)];
}

export const overviewIcon = () => icon("overview");
