// Car monitor: the Charts tab (odometer, fuel price, consumption, costs, forecast, year by year).
import { h, chip, dot, segmented, splitBar, kv, icon } from "../ui.js";
import { chart } from "../charts.js";
import { COLORS, CUR, MONTHS, WEEKDAYS, fmtSek, fmtMoney, fmtAxisSek, mLong, mIndex, monthOf, addMonths, isoDay, daysBetween, weekday, plainNumber, pct, plural, shortNote, mean, inSweden } from "../core.js";
import { CAR_TYPES, TYPE, carSummary, monthlyKm, monthlyCosts, fmtKm, fmtKmSigned, fmtPerKm, fmtAxisKm, monthPos, parseDay, carTitle, energy, priceSummary, paidPrices, consumptionByMonth, yearForecast } from "../car.js";
import { store } from "../store.js";
import { card, head, dayText, round100, daysWord, typeName, selectedCar, carPicker } from "./car-common.js";
import { noCarState, openCarLogSheet } from "./car-sheets.js";
import { cachedPrices, fetchPrices } from "./car-prices.js";

const DAY_MS = 86400000;
const dayLong = (iso) => { const d = parseDay(iso); return `${WEEKDAYS[weekday(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const costName = (type, en) => (type === "fuel" && en.unit === "kWh" ? "Charging" : TYPE[type].costName);

// ---------------------------------------------------------------------------
function chartCard(car, sum, today) {
  const en = energy(car);
  const st = { view: 0, range: 1, ...(store.pref("car_chart", {}) || {}) };
  const save = () => store.setPref("car_chart", st);
  const body = h("div", { class: "chart-body" });
  const legend = h("div", { class: "legend" });
  const sub = h("div", { class: "card-sub" });
  const thisMonth = monthOf(today);
  const yearAgo = today.getTime() - 365 * DAY_MS;
  const empty = (text) => body.replaceChildren(h("div", { class: "chart-empty" }, text));

  function draw() {
    legend.replaceChildren();
    if (st.view === 0) {
      const pts = st.range === 0 ? sum.points.filter((p) => p.t >= yearAgo) : sum.points;
      sub.textContent = "Each dot is a reading you logged.";
      if (pts.length < 2) { empty("Log at least two odometer readings to see the line"); return; }
      body.replaceChildren(chart({
        xs: pts.map((p) => monthPos(p.date)), kind: "line", format: fmtAxisKm, zeroBased: false, label: "Odometer",
        series: [{ color: COLORS.blue, values: pts.map((p) => p.km), fill: true }],
        tooltip: (i) => {
          const p = pts[i], q = sum.points[sum.points.indexOf(p) - 1];
          const rows = [["Odometer", fmtKm(p.km), COLORS.blue]];
          if (q) rows.push(["Since the reading before", `${fmtKmSigned(p.km - q.km)} in ${daysWord(daysBetween(parseDay(q.date), parseDay(p.date)))}`, null]);
          const that = sum.logs.filter((l) => l.date === p.date).map((l) => typeName(l.type, en));
          return { title: dayLong(p.date), rows, note: that.length ? [...new Set(that)].join(", ") : null };
        },
      }));
    } else if (st.view === 1) {
      let mk = monthlyKm(sum.points);
      if (st.range === 0) mk = mk.filter((m) => mIndex(m.month) > mIndex(thisMonth) - 12);
      sub.textContent = "Estimated between your readings. Grey = only part of the month is covered.";
      if (!mk.length) { empty("Log at least two odometer readings to see this"); return; }
      const colors = mk.map((m) => (m.from || m.until ? "var(--gray2)" : COLORS.cyan));
      const lines = sum.per_month !== null ? [{ value: sum.per_month, color: COLORS.gray, dotted: true, label: `Average ${fmtKm(sum.per_month)}` }] : [];
      legend.append(h("span", { class: "legend-item" }, dot(COLORS.cyan), "Driven"),
        ...lines.map((l) => h("span", { class: "legend-item" }, h("span", { class: "line-swatch dotted", style: { borderColor: l.color } }), l.label)));
      body.replaceChildren(chart({
        months: mk.map((m) => m.month), kind: "bar", format: fmtAxisKm, zeroBased: true, lineLabels: false, label: "Kilometres per month",
        series: [{ color: COLORS.cyan, colors, values: mk.map((m) => m.km) }], lines,
        tooltip: (i) => {
          const m = mk[i];
          return { title: mLong(m.month), rows: [["Driven", `≈ ${fmtKm(m.km)}`, colors[i]]],
            note: m.from ? `From your first reading on ${dayText(m.from, today)}` : m.until ? `Up to your latest reading on ${dayText(m.until, today)}` : null };
        },
      }));
    } else {
      const firstMonth = sum.cost_logs.length ? sum.cost_logs[0].date.slice(0, 7) : thisMonth;
      const from = st.range === 0 && mIndex(firstMonth) < mIndex(thisMonth) - 11 ? addMonths(thisMonth, -11) : firstMonth;
      const mc = monthlyCosts(sum.cost_logs, from, mIndex(thisMonth) >= mIndex(firstMonth) ? thisMonth : firstMonth);
      sub.textContent = "Each colour is a kind of cost, so a service or tyre change stands out from the fuel.";
      if (!mc.some((m) => m.total > 0)) { empty("Add what each visit cost to see this"); return; }
      const used = CAR_TYPES.filter(([k]) => mc.some((m) => m.byType[k] > 0));
      const avg = sum.cost_per_month;
      const lines = avg ? [{ value: avg, color: COLORS.gray, dotted: true, label: `Average ${fmtSek(avg)}` }] : [];
      legend.append(...used.map(([k, , , color]) => h("span", { class: "legend-item" }, dot(color), costName(k, en))),
        ...lines.map((l) => h("span", { class: "legend-item" }, h("span", { class: "line-swatch dotted", style: { borderColor: l.color } }), h("span", { class: "amt" }, l.label))));
      body.replaceChildren(chart({
        months: mc.map((m) => m.month), kind: "bar", stacked: true, format: fmtAxisSek, zeroBased: true, lineLabels: false, label: "Costs per month",
        series: used.map(([k, , , color]) => ({ color, values: mc.map((m) => m.byType[k] || 0) })), lines,
        tooltip: (i) => {
          const m = mc[i];
          const rows = CAR_TYPES.filter(([k]) => m.byType[k] > 0).map(([k, , , color]) => [costName(k, en), fmtSek(m.byType[k]), color]);
          if (rows.length > 1) rows.push(["Total", fmtSek(m.total), null]);
          if (!rows.length) rows.push(["No costs logged", "", null]);
          const notes = m.items.map((l) => l.note).filter(Boolean);
          return { title: mLong(m.month), rows, note: notes.length ? shortNote(notes.join(" · "), 140) : null };
        },
      }));
    }
  }
  draw();
  return h("div", { class: "card chart-card" },
    h("div", { class: "card-title" }, "Mileage and costs"), sub,
    segmented(["Odometer", "Km per month", "Costs"], st.view, (i) => { st.view = i; save(); draw(); }, "full"),
    h("div", { class: "chart-controls" }, segmented(["1Y", "All"], st.range, (i) => { st.range = i; save(); draw(); }, "small")),
    legend, body,
    h("div", { class: "hint center" }, "Touch the chart to see the details."));
}

const fmtL = (v) => `${fmtMoney(CUR.local, v, 2)}/l`;
const signedKr = (v) => `${v >= 0 ? "+" : "−"}${fmtMoney(CUR.local, Math.abs(v), 2)}`;
const fmtAxisPrice = (v) => `${Number.isInteger(v) ? v : v.toFixed(1)} kr`;

function fuelPriceContent(car, sum, today, key, data) {
  const label = key === "diesel" ? "Diesel" : "Petrol 95";
  const title = h("div", { class: "card-title" }, `${label} price`);
  if (!data) return [title, h("div", { class: "muted" }, "Getting the latest prices…")];
  const series = data.prices[key] || [];
  const ps = priceSummary(series, today);
  if (!ps) return [title, h("div", { class: "muted" }, "No prices in the file yet.")];
  const paid = paidPrices(sum.logs, series);
  const use = sum.fuel.recent.per100 ?? sum.fuel.all.per100;
  const litresYear = use !== null && sum.per_year !== null ? Math.round((use / 100) * sum.per_year) : null;   // at your pace
  const st = { range: 0, ...(store.pref("fuel_chart", {}) || {}) };
  const RANGES = [365, 5 * 365 + 1, null];
  const chips = [];
  if (ps.change_week !== null) chips.push(chip(`${signedKr(ps.change_week)} vs the week before`, ps.change_week > 0.005 ? "down" : ps.change_week < -0.005 ? "up" : "flat"));
  if (ps.change_year !== null) chips.push(chip(`${signedKr(ps.change_year)} vs a year ago`, "flat"));
  const diffs = paid.filter((p) => p.week).map((p) => p.price - p.week[1]);
  if (diffs.length) {
    const d = mean(diffs);
    chips.push(chip(Math.abs(d) < 0.05 ? "You pay about the average" : `You pay ${fmtMoney(CUR.local, Math.abs(d), 2)}/l ${d < 0 ? "less" : "more"} than average`,
      d < -0.05 ? "up" : d > 0.05 ? "down" : "flat"));
  }
  const body = h("div", { class: "chart-body" });
  const legend = h("div", { class: "legend" });
  function draw() {
    const days = RANGES[st.range];
    const vis = days ? series.filter(([d]) => daysBetween(parseDay(d), today) <= days) : series;
    const dots = paid.map((p) => ({ x: monthPos(p.log.date), y: p.price, color: COLORS.blue }));
    legend.replaceChildren(h("span", { class: "legend-item" }, dot(COLORS.orange), "Sweden, average"),
      paid.length ? h("span", { class: "legend-item" }, dot(COLORS.blue), "What you paid") : null);
    if (vis.length < 2) { body.replaceChildren(h("div", { class: "chart-empty" }, "Not enough prices for this range")); return; }
    body.replaceChildren(chart({
      xs: vis.map(([d]) => monthPos(d)), kind: "line", format: fmtAxisPrice, zeroBased: false, label: `${label} price`,
      series: [{ color: COLORS.orange, values: vis.map(([, v]) => v) }], dots,
      tooltip: (i) => {
        const [d, v] = vis[i];
        const end = isoDay(new Date(parseDay(d).getTime() + 6 * DAY_MS));
        const rows = [["Average in Sweden", fmtL(v), COLORS.orange]];
        for (const p of paid) if (p.log.date >= d && p.log.date <= end) rows.push([`You paid, ${dayText(p.log.date, today)}`, fmtL(p.price), COLORS.blue]);
        return { title: `Week of ${dayText(d, today)}`, rows };
      },
    }));
  }
  draw();
  const source = h("a", { href: data.link, target: "_blank", rel: "noopener" }, data.source);
  return [
    head(`${label} price`, `Average at the pump in Sweden, week of ${dayText(ps.latest[0], today)}`),
    h("div", { class: "block-value" }, fmtL(ps.latest[1])),
    ps.low !== null ? h("div", { class: "muted" }, `Last 12 months: ${fmtMoney(CUR.local, ps.low, 2)} – ${fmtL(ps.high)}, average ${fmtL(ps.avg)}`) : null,
    chips.length ? h("div", { class: "chips" }, chips) : null,
    litresYear ? h("div", { class: "kv-list" },
      kv("A year of fuel at this price", `≈ ${fmtSek(litresYear * ps.latest[1])}`),
      kv("Every krona more per litre", `≈ ${fmtSek(litresYear)} a year`)) : null,
    h("div", { class: "chart-controls" }, segmented(["1Y", "5Y", "All"], st.range, (i) => { st.range = i; store.setPref("fuel_chart", { range: i }); draw(); }, "small")),
    legend, body,
    h("div", { class: "hint" }, "Monday prices, taxes included, updated every week. Source: ", source, " (CC BY 4.0)."),
    !paid.length ? h("div", { class: "hint" }, "Log the cost and litres when you refuel to see what you paid next to the average.") : null,
  ];
}

function fuelPriceCard(car, sum, today) {
  const key = energy(car).priceKey;
  if (!key || !inSweden()) return null;
  const wrap = h("div", { class: "card chart-card fuel-card" });
  const build = () => wrap.replaceChildren(...fuelPriceContent(car, sum, today, key, cachedPrices()).filter(Boolean));
  build();
  fetchPrices().then((changed) => { if (changed && wrap.isConnected) build(); })
    .catch(() => { if (!cachedPrices() && wrap.isConnected) wrap.replaceChildren(head(`${key === "diesel" ? "Diesel" : "Petrol 95"} price`), h("div", { class: "muted" }, "Couldn't load the fuel prices. Check your connection and open the page again.")); });
  return wrap;
}

/** Insights: consumption per full tank, and through the year */
function consumptionChartCard(car, sum, today) {
  const en = energy(car), f = sum.fuel;
  const kwh = en.unit === "kWh";
  const title = kwh ? "Energy use" : "Fuel consumption";
  const tank = kwh ? "full charge" : "full tank";
  const v = f.recent.n >= 2 && f.recent.per100 !== null ? f.recent : f.all;
  if (v.per100 === null) return null;
  const st = { view: 0, range: 1, ...(store.pref("fuel_use_chart", {}) || {}) };
  const save = () => store.setPref("fuel_use_chart", st);
  const body = h("div", { class: "chart-body" });
  const legend = h("div", { class: "legend" });
  const sub = h("div", { class: "card-sub" });
  const rangeRow = h("div", { class: "chart-controls" }, segmented(["1Y", "All"], st.range, (i) => { st.range = i; save(); draw(); }, "small"));
  function draw() {
    rangeRow.style.display = st.view === 2 ? "none" : "";
    if (st.view === 2) return drawYear();
    sub.textContent = st.view === 0 ? `Each dot is one ${tank}: what the car used since the one before.` : `What each ${tank} cost per kilometre.`;
    const all = st.range === 0 ? f.segments.filter((x) => daysBetween(parseDay(x.to), today) <= 365) : f.segments;
    const segs = st.view === 0 ? all : all.filter((x) => x.per_km !== null);
    const color = st.view === 0 ? COLORS.orange : COLORS.green;
    const value = (x) => (st.view === 0 ? x.per100 : x.per_km);
    const avg = st.view === 0 ? v.per100 : v.per_km;
    const label = (x) => (st.view === 0 ? `${x.toFixed(1)} ${en.per100}` : `${fmtMoney(CUR.local, x, 2)}/km`);
    legend.replaceChildren(h("span", { class: "legend-item" }, dot(color), `Each ${tank}`),
      avg !== null ? h("span", { class: "legend-item" }, h("span", { class: "line-swatch dotted", style: { borderColor: COLORS.gray } }),
        h("span", { class: st.view === 1 ? "amt" : "" }, `Average ${label(avg)}`)) : null);
    if (segs.length < 2) {
      body.replaceChildren(h("div", { class: "chart-empty" }, segs.length ? `One ${tank} so far: the line starts with the next one` : "Nothing in this range yet"));
      return;
    }
    body.replaceChildren(chart({
      xs: segs.map((x) => monthPos(x.to)), kind: "line", zeroBased: false, lineLabels: false,
      format: st.view === 0 ? (x) => x.toFixed(1) : (x) => `${x.toFixed(2)} kr`, label: title,
      series: [{ color, values: segs.map(value) }], dots: segs.map((x) => ({ x: monthPos(x.to), y: value(x), color })),
      lines: avg !== null ? [{ value: avg, color: COLORS.gray, dotted: true, label: "" }] : [],
      tooltip: (i) => {
        const x = segs[i];
        const rows = [[kwh ? "Used" : "Consumption", `${x.per100.toFixed(1)} ${en.per100}`, COLORS.orange]];
        if (x.per_km !== null) rows.push([kwh ? "Charging cost" : "Fuel cost", `${fmtMoney(CUR.local, x.per_km, 2)}/km`, COLORS.green]);
        rows.push(["Driven", fmtKm(x.km), null],
          [kwh ? "Charged" : "Filled", `${plainNumber(x.litres, 1)} ${en.unit}${x.topups ? ` (${plural(x.topups, "top-up")})` : ""}`, null]);
        return { title: `${dayText(x.from, today)} – ${dayText(x.to, today)}`, rows };
      },
    }));
  }
  // the same car through the year: what winter does to the consumption
  function drawYear() {
    const byMonth = consumptionByMonth(f.segments);
    const known = byMonth.filter((m) => m.per100 !== null);
    sub.textContent = "Average per calendar month, all your years together. Winter months in blue.";
    const isWinter = (m) => [11, 12, 1, 2, 3].includes(m);
    legend.replaceChildren(h("span", { class: "legend-item" }, dot(COLORS.indigo), "Winter (Nov–Mar)"),
      h("span", { class: "legend-item" }, dot(COLORS.orange), "Rest of the year"));
    if (known.length < 3) { body.replaceChildren(h("div", { class: "chart-empty" }, "Needs full tanks in at least 3 different months")); return; }
    const colors = byMonth.map((m) => (isWinter(m.month) ? COLORS.indigo : COLORS.orange));
    body.replaceChildren(chart({
      months: byMonth.map((m) => `2000-${String(m.month).padStart(2, "0")}`), kind: "bar", noYears: true, zeroBased: true, lineLabels: false,
      format: (x) => x.toFixed(1), label: "Consumption by month",
      series: [{ color: COLORS.orange, colors, values: byMonth.map((m) => m.per100) }],
      lines: [{ value: v.per100, color: COLORS.gray, dotted: true, label: "" }],
      tooltip: (i) => {
        const m = byMonth[i];
        return { title: MONTHS[i], rows: m.per100 === null ? [["No full tanks logged", "", null]]
          : [["Consumption", `${m.per100.toFixed(1)} ${en.per100}`, colors[i]], ["Driven", fmtKm(m.km), null], [`${kwh ? "Charges" : "Full tanks"}`, String(m.n), null]] };
      },
    }));
  }
  const w = f.winter, su = f.summer;
  const winterExtra = w.n >= 2 && su.n >= 2 && w.per100 !== null && su.per100 !== null ? w.per100 - su.per100 : null;
  draw();
  return h("div", { class: "card chart-card fuel-use-card" },
    head(title, `${plural(f.segments.length, tank)} logged  ·  average ${v.per100.toFixed(1)} ${en.per100}`), sub,
    segmented(["Per tank", "kr/km", "Through the year"], st.view, (i) => { st.view = i; save(); draw(); }, "full"),
    rangeRow, legend, body,
    winterExtra !== null && Math.abs(winterExtra) >= 0.2 && sum.per_year !== null
      ? h("div", { class: "muted amt-soft" }, `In winter the car uses ${Math.abs(winterExtra).toFixed(1)} ${en.per100} ${winterExtra > 0 ? "more" : "less"} than the rest of the year${f.price !== null ? `: about ${fmtSek(Math.abs(winterExtra) / 100 * (sum.per_year / 12) * f.price)} a month ${winterExtra > 0 ? "extra" : "less"} at your pace and price` : ""}.`)
      : null,
    h("div", { class: "hint center" }, "Touch the chart to see the details."));
}

// ---------------------------------------------------------------------------
function costsCard(car, sum, today) {
  const en = energy(car);
  const total = sum.costs;
  const period = sum.costs_full_year ? "Last 12 months" : `Since ${dayText(sum.costs_from, today)}`;
  if (total <= 0) return card(head("Where the money goes", "Add what each visit cost to see where the money goes."));
  const types = CAR_TYPES.filter(([k]) => sum.by_type[k] > 0).sort((a, b) => sum.by_type[b[0]] - sum.by_type[a[0]]);
  const rows = types.map(([k, , , color]) => {
    const v = sum.by_type[k];
    return h("div", { class: "cost-type" }, dot(color, 9), h("span", { class: "cost-type-name" }, costName(k, en)),
      h("span", { class: "cost-type-month amt" }, `${fmtSek(v / sum.costs_months)}/mo`),
      h("span", { class: "cost-type-value amt" }, fmtSek(v)), h("span", { class: "cost-type-pct" }, pct(v / total)));
  });
  return card(head("Where the money goes", h("span", { class: "amt-soft" }, `${period}  ·  ${fmtSek(total)}`)),
    splitBar(types.map(([k, , , color]) => [sum.by_type[k], color]), 10),
    h("div", { class: "cost-types" }, rows),
    sum.costs_all > total + 0.5 ? h("div", { class: "hint amt-soft" }, `All your costs together: ${fmtSek(sum.costs_all)}.`) : null);
}

function forecastCard(car, sum, today) {
  const f = yearForecast(sum, today);
  if (f.km_end === null) return null;
  const en = energy(car);
  const row = (label, now, end, money = true) => h("div", { class: "fc-row" },
    h("div", { class: "fc-label" }, label),
    h("div", { class: `fc-num ${money ? "amt" : ""}` }, now),
    h("div", { class: `fc-num strong ${money ? "amt" : ""}` }, end));
  const rows = [row("Driven", fmtKm(f.km), `≈ ${fmtKm(round100(f.km_end))}`, false)];
  if (f.fuel_end !== null) rows.push(row(en.unit === "kWh" ? "Charging" : "Fuel", fmtSek(f.fuel), `≈ ${fmtSek(Math.round(f.fuel_end / 100) * 100)}`));
  if (f.costs_end !== null) rows.push(row("All costs", fmtSek(f.costs), `≈ ${fmtSek(Math.round(f.costs_end / 100) * 100)}`));
  const last = f.last;
  return card(head(`${f.year} so far, and by 31 December`, `At the pace of your last 12 months, with ${daysWord(f.days_left)} to go.`),
    h("div", { class: "fc-table" },
      h("div", { class: "fc-row head" }, h("div", null, ""), h("div", null, "So far"), h("div", null, "By 31 Dec")),
      rows),
    last ? h("div", { class: "hint amt-soft" }, `${last.year}: ${fmtKm(last.km)} and ${fmtSek(last.costs)} in all.`) : null,
    h("div", { class: "hint" }, "Fuel goes on at your cost per km; services and other costs at their monthly average. A rough guide, not a promise."));
}

function yearsCard(sum, today) {
  if (!sum.years.length) return null;
  const rows = [...sum.years].reverse().map((y) => h("div", { class: "year-row" },
    h("div", { class: "yr-year" }, String(y.year),
      y.year === today.getFullYear() ? h("span", { class: "yr-sub" }, "so far") : y.from ? h("span", { class: "yr-sub" }, `from ${dayText(y.from, parseDay(y.from))}`) : null),
    h("div", { class: "yr-num" }, y.km ? fmtKm(y.km) : "—"),
    h("div", { class: "yr-num amt" }, fmtSek(y.costs)),
    h("div", { class: "yr-num amt" }, y.per_km !== null ? fmtPerKm(y.per_km) : "—")));
  return card(head("Year by year", "Kilometres are estimated between your readings."),
    h("div", { class: "year-table" },
      h("div", { class: "year-row head" }, h("div", null, "Year"), h("div", null, "Driven"), h("div", null, "Costs"), h("div", null, "Per km")),
      rows));
}

// ---------------------------------------------------------------------------
// The Charts tab: the charts and trends
// ---------------------------------------------------------------------------
export function renderCarInsights(ctx) {
  const today = ctx.today;
  const car = selectedCar(ctx.data);
  if (!car) return ["Charts and trends for your car", noCarState(ctx)];
  const sum = carSummary(car, today);
  const picker = carPicker(ctx, car);
  if (sum.points.length < 2) {
    return [ctx.data.cars.length > 1 ? carTitle(car) : "Charts and trends for your car", picker,
      h("div", { class: "card empty-state" },
        h("span", { class: "car-icon" }, icon("charts", 40)),
        h("div", { class: "empty-title" }, "Insights need a few logs"),
        h("div", { class: "empty-text" }, "Log your refuels and services with the odometer for a few weeks, and this page fills with charts: your mileage, what the car costs and where the money goes, the real fuel consumption through the year, and where this year is heading."),
        h("button", { class: "btn primary", type: "button", onclick: () => openCarLogSheet(ctx, car, null, { type: "fuel" }) }, `+  Log ${energy(car).unit === "kWh" ? "a charge" : "a refuel"}`)),
      fuelPriceCard(car, sum, today)];
  }
  const subtitle = `${ctx.data.cars.length > 1 ? `${carTitle(car)}  ·  ` : ""}from ${plural(sum.n, "log")} since ${dayText(sum.logs[0].date, today)}`;
  return [subtitle, picker, chartCard(car, sum, today), consumptionChartCard(car, sum, today), costsCard(car, sum, today),
    forecastCard(car, sum, today), fuelPriceCard(car, sum, today), yearsCard(sum, today)];
}
