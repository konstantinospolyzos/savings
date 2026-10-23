// Insights: what your logs and your budget say, with a personal action plan.
import { h, chip, dot, segmented, splitBar, kv, appIcon, toast } from "../ui.js";
import { chart } from "../charts.js";
import {
  COLORS, MONTHS, NOTE_TAGS, BROKERS, CAPITAL_GAINS_TAX, ISK_TAX_FREE, CATEGORY_COLORS,
  monthFlows, summarize, tagAnalysis, quietMonths, tripComparison, travelFund, incomeAnalysis, investmentStatus,
  buildActions, futureValue, tripStatus, isTrip, mean, mLong, mShort, mNum, fmtSek, fmtEur, fmtAxisSek, pct, toneOf,
  parseNumber, plainNumber, expenseMonthlySek, shortNote, roundTo10, investedSek,
} from "../core.js";
import { store } from "../store.js";
import { statCard } from "./overview.js";

const LIVING_C = COLORS.purple;
// subtitles that mention amounts get blurred in privacy mode
const MONEY_RX = /\d\s?kr\b|€\s?\d/;
const card = (...children) => h("div", { class: "card" }, children);
const head = (title, sub = null, right = null) => h("div", { class: "card-head" },
  h("div", { class: "card-head-text" }, h("div", { class: "card-title" }, title), sub ? h("div", { class: `card-sub ${typeof sub === "string" && MONEY_RX.test(sub) ? "amt-soft" : ""}` }, sub) : null),
  right);
const signedPct = (x, d = 0) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(d)}%`;
const syncNow = () => { if (store.mode === "drive" && !store.drive.tokenValid()) store.syncFromTap(); };

// ---------------------------------------------------------------------------
function kpis(snap, summ, inv) {
  const cards = [];
  let chipText = "", tone = "flat";
  if (snap.plan_ready) {
    const plan = snap.save_rate;
    chipText = `Plan ${pct(plan)}`;
    tone = summ.rate >= plan - 0.02 ? "up" : summ.rate < plan - 0.10 ? "down" : "flat";
  }
  cards.push(statCard("SAVINGS RATE", COLORS.green, pct(summ.rate), `of income, last ${summ.n} months`, chipText, tone));
  const budget = snap.fixed + snap.living + snap.goals;
  if (snap.plan_ready) {
    const over = summ.spending - budget;
    cards.push(statCard("SPENDING PER MONTH", LIVING_C, fmtSek(summ.spending), "estimated: income − saved",
      `Budget ${fmtSek(budget)}`, over > 1000 ? "down" : "up", "vc"));
  } else cards.push(statCard("SPENDING PER MONTH", LIVING_C, fmtSek(summ.spending), "estimated: income − saved", "", "flat", "v"));
  if (snap.plan_ready) {
    cards.push(statCard("BUFFER", COLORS.blue, `${(snap.bank / snap.fixed).toFixed(1)} months`, "of fixed costs in the bank",
      `Target ${snap.buffer_months} months`, snap.shortfall <= 0 ? "up" : "flat"));
  } else cards.push(statCard("BUFFER", COLORS.blue, "—", "fill in fixed costs in Budget"));
  if (inv && inv.after !== null) {
    cards.push(statCard("INVESTED AFTER TAX", COLORS.orange, fmtEur(inv.after), `of ${fmtEur(inv.value)} market value`,
      inv.gain_sek >= 0 ? `${fmtSek(inv.tax_sek)} tax if sold today` : "At a loss, so no tax", "flat", "vsc"));
  } else cards.push(statCard("INVESTED AFTER TAX", COLORS.orange, inv ? fmtEur(inv.value) : "—", "market value, before tax",
    "Add what it cost below", "flat", "v"));
  return h("div", { class: "stats" }, cards);
}

// ---------------------------------------------------------------------------
function actionsCard(items) {
  return card(head("Your action plan", "Personal tips from your logs and your budget, most important first."),
    items.length ? h("div", { class: "actions" }, items.map(([title, detail, color], k) => h("div", { class: "action" },
      h("span", { class: "action-badge", style: { background: color } }, String(k + 1)),
      h("div", { class: "action-text" }, h("div", { class: "action-title amt-soft" }, title), h("div", { class: "muted amt-soft" }, detail)))))
      : h("div", { class: "muted" }, "Nothing urgent. Keep logging every month and check back."));
}

// ---------------------------------------------------------------------------
function monthChartCard(flows, snap) {
  let view = store.pref("insights_chart", 0) === 1 ? 1 : 0;
  const sub = h("div", { class: "card-sub" });
  const body = h("div", { class: "chart-body" });
  const legend = h("div", { class: "legend" });

  function draw() {
    const lines = [];
    let values, colors, tooltip;
    legend.replaceChildren();
    if (view === 0) {
      values = flows.map((f) => f.saved);
      colors = values.map((v) => (v >= 0 ? COLORS.green : COLORS.red));
      const planned = snap.future;
      if (snap.plan_ready && planned > 0) lines.push({ value: planned, color: COLORS.blue, label: `Plan ${fmtSek(planned)}` });
      if (values.length) { const avg = mean(values); lines.push({ value: avg, color: COLORS.gray, dotted: true, label: `Your average ${fmtSek(avg)}` }); }
      tooltip = (i) => {
        const f = flows[i];
        const rows = [["Saved", `${fmtSek(f.saved, true)} (${pct(f.rate)})`, colors[i]],
          ["Bank", fmtSek(f.bank_d, true), null],
          [f.exact ? "Investments" : "Investments (incl. market moves)", fmtSek(f.to_inv, true), null]];
        if (isTrip(f.entry)) rows.push(["✈  Trip month", "", null]);
        return { title: mLong(f.month), rows, note: f.entry.comment ? shortNote(f.entry.comment, 140) : null };
      };
      sub.textContent = "Bank change + money put into investments. Green = you put money aside, red = savings went down.";
      legend.append(h("span", { class: "legend-item" }, dot(COLORS.green), "Saved"), h("span", { class: "legend-item" }, dot(COLORS.red), "Went down"));
    } else {
      values = flows.map((f) => f.spending);
      colors = flows.map((f) => (isTrip(f.entry) ? COLORS.cyan : LIVING_C));
      const budget = snap.fixed + snap.living + snap.goals;
      if (snap.plan_ready) lines.push({ value: budget, color: COLORS.blue, label: `Budget ${fmtSek(budget)}` });
      if (values.length) { const avg = mean(values); lines.push({ value: avg, color: COLORS.gray, dotted: true, label: `Your average ${fmtSek(avg)}` }); }
      tooltip = (i) => {
        const f = flows[i];
        const tags = NOTE_TAGS.filter(([, , rx]) => rx.test(f.entry.comment || "")).map(([, label]) => label.toLowerCase());
        const rows = [["Spent (estimate)", fmtSek(f.spending), colors[i]], ["Income", fmtSek(f.income), null],
          ["Saved", fmtSek(f.saved, true), null]];
        if (isTrip(f.entry)) rows.push(["✈  Trip month", "", null]);
        if (tags.length) rows.push([`Note mentions: ${tags.join(", ")}`, "", null]);
        return { title: mLong(f.month), rows, note: f.entry.comment ? shortNote(f.entry.comment, 140) : null };
      };
      sub.textContent = "Estimated as income minus what you saved. Light blue = trip months.";
      legend.append(h("span", { class: "legend-item" }, dot(LIVING_C), "Normal month"), h("span", { class: "legend-item" }, dot(COLORS.cyan), "Trip month"));
    }
    for (const l of lines) legend.append(h("span", { class: "legend-item" },
      h("span", { class: `line-swatch ${l.dotted ? "dotted" : ""}`, style: { borderColor: l.color } }), h("span", { class: "amt" }, l.label)));
    body.replaceChildren(chart({ months: flows.map((f) => f.month), kind: "bar", format: fmtAxisSek, zeroBased: true, lineLabels: false,
      label: view === 0 ? "Saved each month" : "Spending each month", height: 240,
      series: [{ color: colors[0], colors, values }], lines, tooltip }));
  }
  draw();
  return h("div", { class: "card chart-card" },
    h("div", { class: "card-title" }, "Month by month"), sub,
    segmented(["Saved", "Spending"], view, (i) => { view = i; store.setPref("insights_chart", i); draw(); }, "full"),
    legend, body,
    h("div", { class: "hint center" }, "Touch a bar for the details and that month's note."));
}

// ---------------------------------------------------------------------------
function tripCard(comp, flows) {
  const t = comp.trip, o = comp.other;
  const nT = t ? t.n : 0, nO = o ? o.n : 0;
  let sub = `Last ${comp.total} months: ${nT} trip month${nT !== 1 ? "s" : ""} and ${nO} other. Spending is estimated as income minus what you saved.`;
  if (comp.guessed) sub += ` ${comp.guessed} of the ${comp.total} months are guessed from your notes; flag them below or when you edit a month.`;

  const block = (title, color, big, bigSub, rows) => h("div", { class: "trip-block" },
    h("div", { class: "cap-row" }, dot(color, 9), h("span", { class: "caption" }, title)),
    h("div", { class: "block-value amt" }, big), h("div", { class: "muted" }, bigSub),
    rows.length ? h("div", { class: "kv-list" }, rows) : null);
  const statRows = (st) => [kv("Saved per month", fmtSek(st.saved, true), { tone: toneOf(st.saved) }),
    kv("Savings rate", pct(st.rate), { tone: toneOf(st.rate), amt: false }),
    kv("Bank savings per month", fmtSek(st.bank, true), { tone: toneOf(st.bank) }),
    kv("Income per month", fmtSek(st.income))];
  const sideBlock = (key, title, color) => {
    const st = comp[key];
    return st ? block(title, color, fmtSek(st.spending), "spent per month on average", statRows(st))
      : block(title, color, "—", "no months yet", []);
  };
  let diff;
  if (comp.gap === null) diff = block("WHAT TRIPS COST YOU", COLORS.orange, "—", "needs both trip months and other months", []);
  else {
    const rows = [kv("Trip months a year", `≈ ${Math.round(nT / comp.total * 12)}`, { amt: false })];
    if (comp.gap > 0) {
      rows.push(kv("Extra spending a year", fmtSek(comp.per_year)));
      rows.push(kv("Travel goal that covers it", `≈ ${fmtSek(Math.round(comp.per_year / 12 / 100) * 100)} / month`));
      const savedGap = t && o ? o.saved - t.saved : 0;
      rows.push(savedGap >= 0 ? kv("Less saved in a trip month", fmtSek(savedGap)) : kv("More saved in a trip month", fmtSek(-savedGap)));
    } else rows.push(kv("Extra spending a year", "none, trips don't push spending up", { amt: false }));
    diff = block("WHAT TRIPS COST YOU", COLORS.orange, fmtSek(comp.gap, true), "spent in a trip month vs the others", rows);
  }

  const chips = flows.map((f) => {
    const e = f.entry;
    const [trip, flagged] = tripStatus(e);
    return h("button", { type: "button", class: `month-chip ${trip ? "trip" : ""} ${flagged ? "" : "guessed"}`,
      "aria-pressed": String(trip), title: `${mLong(e.month)}: ${trip ? "trip" : "normal"} month${flagged ? "" : " (guessed from the note)"}. Tap to switch.`,
      onclick: () => {
        const on = !isTrip(e);
        store.saveEntry({ ...e, trip: on }, null);
        toast(`✈  ${mLong(e.month)}: ${on ? "trip month" : "normal month"}`);
        syncNow();
      } }, `${trip ? "✈ " : ""}${MONTHS[mNum(e.month) - 1].slice(0, 3)}`);
  });

  return card(head("✈  Trip months vs other months", sub),
    sideBlock("trip", "TRIP MONTHS", COLORS.cyan), h("div", { class: "hairline" }),
    sideBlock("other", "OTHER MONTHS", "var(--gray2)"), h("div", { class: "hairline" }),
    diff, h("div", { class: "hairline" }),
    h("div", { class: "caption" }, "YOUR MONTHS"),
    h("div", { class: "month-chips" }, chips),
    h("div", { class: "hint" }, "Tap a month to switch it between trip and normal. Dashed = guessed from the note, not flagged by you yet."));
}

// ---------------------------------------------------------------------------
function notesCard(tags, quiet, fund) {
  const all = tags.concat([{ label: "No notes / none of these", color: "var(--gray3)", n: quiet.length,
    total: tags.length ? tags[0].total : 0, avg: mean(quiet.map((f) => f.bank_d)) }]);
  return card(head("What your notes say", "Average change in your bank savings in months whose note mentions…"),
    h("div", { class: "tag-list" }, all.map((t) => h("div", { class: "tag-row" }, dot(t.color, 9),
      h("div", { class: "tag-text" }, h("div", { class: "tag-name" }, t.label), h("div", { class: "hint" }, `${t.n} of ${t.total} months`)),
      chip(t.avg === null ? "—" : fmtSek(t.avg, true), t.avg === null ? "flat" : toneOf(t.avg), "amt")))),
    h("div", { class: "hairline" }),
    h("div", { class: "muted amt-soft" }, fund
      ? `In trip months you spend about ${fmtSek(fund.gap)} more than in the others. A travel goal of about ${fmtSek(fund.per_month)} a month (Budget page) would cover them.`
      : "Write a short note when you log a month (trips, gifts, bonus...). The more notes, the sharper this gets."));
}

// ---------------------------------------------------------------------------
function incomeCard(inc) {
  const last = inc.latest;
  const d = inc.avg ? last.income_sek / inc.avg - 1 : 0;
  const note = inc.top.comment;
  return card(head("Income"),
    h("div", { class: "block-value amt" }, fmtSek(inc.avg)),
    h("div", { class: "muted" }, `average per month, last ${inc.n} months`),
    h("div", { class: "hairline" }),
    h("div", { class: "kv-list" },
      kv("Latest month", `${fmtSek(last.income_sek)}  (${signedPct(d)} vs average)`),
      kv("Last 3 months vs a year earlier", inc.yoy === null ? "needs 15 months of logs" : signedPct(inc.yoy, 1), { amt: inc.yoy !== null }),
      kv("Highest month", `${mShort(inc.top.month)}  ·  ${fmtSek(inc.top.income_sek)}`),
      kv("Lowest month", `${mShort(inc.low.month)}  ·  ${fmtSek(inc.low.income_sek)}`)),
    note ? h("div", { class: "hint note-text" }, `${mShort(inc.top.month)}: “${shortNote(note, 110)}”`) : null);
}

// ---------------------------------------------------------------------------
function investmentsCard(inv, ctx) {
  if (!inv) return null;
  const entries = ctx.entries;
  let cur = inv.cost_input && inv.cost_input[1] === "EUR" ? 1 : 0;
  const input = h("input", { class: "fx-input wide amt", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "e.g. 40 000",
    "aria-label": "What your holdings cost" });
  if (inv.cost_input) { const a = inv.cost_input[0]; input.value = plainNumber(a, a === Math.round(a) ? 0 : 2); }
  const saveCost = () => {
    const text = input.value, v = parseNumber(text);
    input.classList.toggle("invalid", Boolean(text.trim()) && (v === null || v < 0));
    if (!text.trim()) store.setSetting("inv_basis", null);
    else if (v !== null && v >= 0 && entries.length)
      store.setSetting("inv_basis", { amount: v, currency: cur === 1 ? "EUR" : "SEK", as_of: entries.at(-1).month });
  };
  input.addEventListener("change", saveCost);
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") input.blur(); });

  let costNote;
  if (inv.cost_sek === null) costNote = "Type it once, in kronor or euro, to see what your holdings are worth after tax. Money you log under “Added this month” is added on top by itself.";
  else {
    const c = inv.cost_input[1];
    costNote = `As of ${mLong(inv.as_of)}`;
    if (c === "EUR") costNote += `, converted at that month's rate (1 € = ${(1 / inv.as_of_rate).toFixed(2)} kr)`;
    if (inv.added_since_eur > 0.5) costNote += `, plus ${fmtEur(inv.added_since_eur)} logged since`;
    costNote += ".";
    if (c === "EUR") costNote += " Type it in kronor for the exact tax figure.";
  }
  const rows = [];
  if (inv.cost_sek !== null) {
    rows.push(kv("Worth today, in kronor", fmtSek(inv.value_sek)), kv("What it cost, in kronor", fmtSek(inv.cost_sek)));
    if (inv.gain_sek >= 0) rows.push(kv("Taxable gain", fmtSek(inv.gain_sek, true)),
      kv("Tax if you sold everything today (30%)", `${fmtSek(inv.tax_sek)}  ·  ${fmtEur(inv.tax)}`));
    else rows.push(kv("Loss if you sold everything today", fmtSek(inv.gain_sek, true)), kv("Tax", "None, the loss can lower other tax", { amt: false }));
    rows.push(kv("Worth after tax", `${fmtEur(inv.after)}  ·  ${fmtSek(inv.after_sek)}`, { strong: true, tone: "up" }));
  }
  if (inv.logged_months) {
    const n = inv.logged_months;
    rows.push(kv(`Added in ${n} logged month${n !== 1 ? "s" : ""}`, fmtEur(inv.added_logged)),
      kv("Market result in those months", fmtEur(inv.market_logged, 0, true), { tone: toneOf(inv.market_logged) }));
  }
  const isk = inv.isk_tax_year;
  const compare = isk < 1
    ? `For comparison: in an ISK, holdings up to ${fmtSek(ISK_TAX_FREE)} are tax-free in 2026 (yours would pay 0 kr), and selling isn't taxed.`
    : `For comparison: in an ISK these holdings would pay about ${fmtSek(isk)} a year (2026: the first ${fmtSek(ISK_TAX_FREE)} is tax-free), with no tax when you sell.`;

  return card(head("Investments", `${BROKERS}  ·  regular accounts`, chip("30% tax on gains", "flat")),
    h("div", { class: "block-value amt" }, fmtEur(inv.value)),
    h("div", { class: "muted amt-soft" }, `≈ ${fmtSek(inv.value_sek)}  ·  market value in your latest log`),
    h("div", { class: "cost-row" }, h("span", { class: "cost-label" }, "What your holdings cost"), input,
      segmented(["kr", "€"], cur, (i) => { cur = i; if (input.value.trim()) saveCost(); }, "small")),
    h("div", { class: "hint amt-soft" }, costNote),
    rows.length ? h("div", { class: "hairline" }) : null,
    rows.length ? h("div", { class: "kv-list" }, rows) : null,
    h("div", { class: "hairline" }),
    h("div", { class: "hint" }, `How it's taxed: ${Math.round(CAPITAL_GAINS_TAX * 100)}% of the gain when you sell, worked out in kronor (what you get in SEK minus what you paid in SEK), so the euro's moves count too. Dividends are taxed 30%, minus tax already withheld abroad. Losses are set off against gains, and 70% of a loss that's left is deductible. Foreign brokers usually don't report to Skatteverket, so check that your sales (K4) and dividends are in your tax return.`),
    h("div", { class: "hint amt-soft" }, compare));
}

// ---------------------------------------------------------------------------
function donut(rows) {
  const total = rows.reduce((a, r) => a + r[2], 0);
  const R = 70, W = 22, C = 2 * Math.PI * R, GAP = rows.length > 1 ? 1.5 : 0;
  let acc = 0, selected = -1;
  const arcs = rows.map(([, color, yearly]) => {
    const len = yearly / total * C;
    const el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    for (const [k, v] of Object.entries({ cx: 90, cy: 90, r: R, fill: "none", stroke: color, "stroke-width": W,
      "stroke-dasharray": `${Math.max(len - GAP, 0.5)} ${C}`, "stroke-dashoffset": String(-acc), transform: "rotate(-90 90 90)", class: "slice" })) el.setAttribute(k, v);
    acc += len;
    return el;
  });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 180 180");
  svg.setAttribute("class", "donut-svg");
  arcs.forEach((a) => svg.appendChild(a));
  const top = h("div", { class: "donut-top" }), mid = h("div", { class: "donut-mid amt" }), bottom = h("div", { class: "donut-bottom amt" });
  const legendRows = rows.map(([name, color, yearly], k) => h("button", { type: "button", class: "donut-row", onclick: () => pick(k) },
    dot(color, 9), h("span", { class: "donut-name" }, name), h("span", { class: "donut-value amt" }, fmtSek(yearly)),
    h("span", { class: "donut-pct" }, `${Math.round(yearly / total * 100)}%`)));
  function pick(k) {
    selected = selected === k ? -1 : k;
    arcs.forEach((a, i) => a.classList.toggle("dim", selected >= 0 && i !== selected));
    legendRows.forEach((r, i) => r.classList.toggle("on", i === selected));
    if (selected >= 0) { const [name, , yearly] = rows[selected]; top.textContent = name; mid.textContent = fmtSek(yearly); bottom.textContent = `${fmtSek(yearly / 12)}/mo`; }
    else { top.textContent = "Per year"; mid.textContent = fmtSek(total); bottom.textContent = `${fmtSek(total / 12)}/mo`; }
  }
  arcs.forEach((a, k) => a.addEventListener("click", () => pick(k)));
  pick(-1);
  return h("div", { class: "donut" }, h("div", { class: "donut-chart" }, svg, h("div", { class: "donut-center" }, top, mid, bottom)),
    h("div", { class: "donut-legend" }, legendRows));
}

function costBars(rows) {
  const topV = Math.max(...rows.map((r) => r[2]), 1);
  return h("div", { class: "cost-bars" }, rows.map(([name, color, yearly, share]) => h("div", { class: "cost-bar" },
    h("div", { class: "cost-bar-head" }, h("span", { class: "cost-bar-name" }, name),
      h("span", { class: "cost-bar-value amt" }, fmtSek(yearly)), h("span", { class: "cost-bar-pct" }, pct(share))),
    h("div", { class: "cost-bar-track" }, h("span", { style: { width: `${Math.max(yearly / topV * 100, 2)}%`, background: color } })))));
}

function yearCostsCard(snap) {
  const { fx, salary } = snap;
  const cats = new Map();
  for (const e of snap.active) cats.set(e.category, (cats.get(e.category) || 0) + expenseMonthlySek(e, fx) * 12);
  const rows = [...cats.entries()].sort((a, b) => b[1] - a[1]).filter(([, y]) => y > 0)
    .map(([c, y]) => [c, CATEGORY_COLORS[c] || COLORS.gray, y, salary ? y / (salary * 12) : 0]);
  const total = snap.fixed * 12;
  if (total <= 0 || !rows.length) return card(head("Fixed costs over a year", "Fill in your fixed costs on the Budget page to see where the money goes."));
  let pie = store.pref("costs_chart", "bars") === "pie";
  const body = h("div");
  const note = h("div", { class: "hint" });
  const draw = () => {
    body.replaceChildren(pie ? donut(rows) : costBars(rows));
    note.textContent = pie ? "% = share of your fixed costs  ·  tap a slice for the numbers" : "% = share of your salary";
  };
  draw();
  const biggest = snap.active.reduce((a, b) => (expenseMonthlySek(b, fx) > expenseMonthlySek(a, fx) ? b : a));
  const subs = snap.active.filter((e) => e.category === "Subscriptions").reduce((a, e) => a + expenseMonthlySek(e, fx), 0) * 12;
  let foot = `Biggest single cost: ${biggest.name}, ${fmtSek(expenseMonthlySek(biggest, fx) * 12)} a year.`;
  if (subs > 0) foot += ` Subscriptions together: ${fmtSek(subs)} a year.`;
  return card(head("Fixed costs over a year", salary ? `${fmtSek(total)} a year  ·  ${pct(snap.fixed / salary)} of your salary` : `${fmtSek(total)} a year`),
    segmented(["Bars", "Pie"], pie ? 1 : 0, (i) => { pie = i === 1; store.setPref("costs_chart", pie ? "pie" : "bars"); draw(); }, "full"),
    body, note, h("div", { class: "muted amt-soft" }, foot));
}

// ---------------------------------------------------------------------------
function growthCard(startSek, monthly, fx, source) {
  const YEARS = [5, 10, 20], RETURNS = [0.03, 0.05, 0.07];
  let yi = 1, ri = 1;
  const big = h("div", { class: "block-value amt" }), bigSub = h("div", { class: "muted amt" }), after = h("div", { class: "muted amt" });
  const barWrap = h("div"), legend = h("div", { class: "legend" });
  const update = () => {
    const years = YEARS[yi], annual = RETURNS[ri];
    const [total, putIn] = futureValue(startSek, monthly, years, annual);
    const growth = Math.max(total - putIn, 0);
    big.textContent = `≈ ${fmtSek(roundTo10(total, 3))}`;
    bigSub.textContent = `after ${years} years  ·  ≈ ${fmtEur(total * fx)}`;
    after.textContent = `≈ ${fmtSek(roundTo10(total - CAPITAL_GAINS_TAX * growth, 3))} after the 30% tax on the growth, if you sold everything then`;
    barWrap.replaceChildren(splitBar([[putIn, COLORS.blue], [growth, COLORS.green]], 10));
    legend.replaceChildren(h("span", { class: "legend-item" }, dot(COLORS.blue), h("span", { class: "amt" }, `Your deposits ${fmtSek(roundTo10(putIn, 3))}`)),
      h("span", { class: "legend-item" }, dot(COLORS.green), h("span", { class: "amt" }, `Growth ${fmtSek(roundTo10(growth, 3))}`)));
  };
  update();
  return card(head("What steady investing could grow to", h("span", { class: "amt-soft" }, `Investing ${fmtSek(monthly)} a month (${source}) on top of today's ${fmtSek(startSek)}.`)),
    h("div", { class: "growth-controls" },
      h("div", { class: "growth-control" }, h("span", { class: "hint" }, "Years"), segmented(YEARS.map((y) => `${y}Y`), yi, (i) => { yi = i; update(); }, "small")),
      h("div", { class: "growth-control" }, h("span", { class: "hint" }, "Return per year"), segmented(RETURNS.map((r) => pct(r)), ri, (i) => { ri = i; update(); }, "small"))),
    big, bigSub, after, barWrap, legend,
    h("div", { class: "hint" }, "Illustration only, not a forecast. Fees and the yearly tax on dividends are left out, and real returns jump around a lot from year to year."));
}

// ---------------------------------------------------------------------------
function monthsCard(flows) {
  const ranked = [...flows].sort((a, b) => b.bank_d - a.bank_d);
  const best = ranked.slice(0, 3), worst = [...ranked].reverse().slice(0, 3).filter((f) => f.bank_d < 0);
  const parts = [];
  for (const [title, group] of [["BEST", best], ["TOUGHEST", worst]]) {
    if (!group.length) continue;
    parts.push(h("div", { class: "caption months-cap" }, title));
    for (const f of group) {
      parts.push(h("div", { class: "best-row" }, h("span", { class: "row-title" }, mShort(f.month)), chip(fmtSek(f.bank_d, true), toneOf(f.bank_d), "amt")));
      if (f.entry.comment) parts.push(h("div", { class: "hint note-text best-note" }, shortNote(f.entry.comment, 120)));
    }
  }
  return card(head("Best and toughest months", "By change in your bank savings, with your notes."), parts);
}

// ---------------------------------------------------------------------------
export function renderInsights(ctx) {
  const es = ctx.entries;
  if (es.length < 2) {
    return ["Needs at least two logged months",
      h("div", { class: "card empty-state" }, appIcon(64),
        h("div", { class: "empty-title" }, "Not enough data yet"),
        h("div", { class: "empty-text" }, "Insights compare one month with the next, so they need at least two logged months."),
        h("button", { class: "btn primary", type: "button", onclick: () => ctx.openMonth(null) }, "+  Add a month"))];
  }
  const snap = ctx.snap;
  const flows = monthFlows(es);
  const recent = flows.slice(-12);
  const summ = summarize(recent);
  const tags = tagAnalysis(recent);
  const fund = travelFund(recent);
  const inv = investmentStatus(ctx.data, es);
  const planned = snap.plan_ready ? snap.invest : 0;
  let monthly, source;
  if (planned > 0) { monthly = planned; source = "your plan"; }
  else { monthly = roundTo10(Math.max(mean(recent.map((f) => f.to_inv)) || 0, 0)); source = "your recent average"; }
  return [`Based on ${mShort(recent[0].month)} – ${mShort(recent.at(-1).month)} and your budget`,
    kpis(snap, summ, inv),
    actionsCard(buildActions(snap, summ, tags, fund, inv, recent)),
    monthChartCard(recent, snap),
    tripCard(tripComparison(recent), recent),
    notesCard(tags, quietMonths(recent), fund),
    incomeCard(incomeAnalysis(es)),
    investmentsCard(inv, ctx),
    yearCostsCard(snap),
    growthCard(investedSek(es.at(-1)), monthly, snap.fx, source),
    monthsCard(recent),
    h("div", { class: "hint page-foot" }, "How this is worked out: “saved” = change in your bank savings + money put into investments (when you log “Added this month”; otherwise the change in invested value, which also includes market moves). “Spending” = income − saved. Notes are read for words like trip, gift, bought and bonus. Rules of thumb, not financial advice.")];
}
