// Car monitor: the Log tab, every visit, with filters and a CSV export.
import { h, dot, segmented, icon, toast, saveFile } from "../ui.js";
import { COLORS, CUR, fmtSek, fmtMoney, isoDay, plainNumber, plural } from "../core.js";
import { TYRE_LOGS, estimateKm, fuelStats, byDateKm, fmtKm, fmtKmSigned, carCsv, carTitle, energy, positionsOf, positionsWord } from "../car.js";
import { store } from "../store.js";
import { dayText, typeName, perUnit, selectedCar, carPicker, typeBadge } from "./car-common.js";
import { noCarState, openCarLogSheet, openCarSheet } from "./car-sheets.js";

const TYRE_ON = { summer: "Summer tyres on", studded: "Studded winter tyres on", winter: "Non-studded winter tyres on" };
// ---------------------------------------------------------------------------
// Log page
// ---------------------------------------------------------------------------
const FILTERS = [["All", () => true], ["Refuels", (l) => l.type === "fuel"],
  ["Service & tyres", (l) => ["service", "tires", "tyre_buy", "inspection"].includes(l.type)],   // and the inspections
  ["Other", (l) => !["fuel", "service", "tires", "tyre_buy", "inspection"].includes(l.type)]];

function logRow(l, ctx, car, perFill, prevKm, today, en) {
  const est = l.km === null && TYRE_LOGS.has(l.type) ? estimateKm(car, l.date) : null;     // an older tyre change: estimated
  const sub = [dayText(l.date, today), l.km !== null ? fmtKm(l.km) : est !== null ? `≈ ${fmtKm(est)}` : null].filter(Boolean).join("  ·  ");
  const extra = [];
  let use = null;
  if (l.type === "tires" && l.tires) extra.push(TYRE_ON[l.tires]);
  if (l.type === "tyre_buy" && l.tires) {
    extra.push(l.fitted === false ? `${TYRE_ON[l.tires].replace(/ on$/, "")}, not fitted` : TYRE_ON[l.tires]);
    if (positionsOf(l).length < 4) extra.push(`${plural(positionsOf(l).length, "tyre")} (${positionsWord(positionsOf(l))})`);
  }
  if (l.type === "fuel") {
    if (l.litres) extra.push(`${plainNumber(l.litres, Math.round(l.litres * 100) % 10 ? 2 : Math.round(l.litres * 10) % 10 ? 1 : 0)} ${en.unit}`);
    if (l.litres > 0 && l.cost > 0) extra.push(perUnit(l.cost / l.litres, en));
    if (l.full === false) extra.push("top-up");
    const seg = perFill.get(l.id);
    if (seg) use = h("div", { class: "crow-use" }, dot(COLORS.orange, 7), `${seg.per100.toFixed(1)} ${en.per100}`,
      seg.per_km !== null ? h("span", { class: "amt" }, `  ·  ${fmtMoney(CUR.local, seg.per_km, 2)}/km`) : null);
  }
  if (l.km !== null && prevKm !== null && l.km >= prevKm) extra.push(`${fmtKmSigned(l.km - prevKm)}`);
  if (/^(auto|fc)-/.test(l.id)) extra.push("fixed cost, every month");
  if (l.photos?.length) extra.push(`📎 ${plural(l.photos.length, l.photos.some((p) => p.pdf) ? "file" : "photo")}`);
  return h("button", { type: "button", class: "crow", onclick: () => openCarLogSheet(ctx, car, l) },
    typeBadge(l.type),
    h("div", { class: "crow-main" },
      h("div", { class: "crow-title" }, typeName(l.type, en)),
      h("div", { class: "crow-sub" }, sub),
      extra.length ? h("div", { class: `crow-extra ${l.type === "fuel" ? "amt-soft" : ""}` }, extra.join("  ·  ")) : null,
      use,
      l.note ? h("div", { class: "crow-note" }, l.note) : null),
    h("div", { class: `crow-cost ${l.cost ? "amt" : "muted"}` }, l.cost ? fmtSek(l.cost) : "—"),
    icon("chevron", 16, "chev"));
}

export function renderCarLog(ctx) {
  const car = selectedCar(ctx.data);
  if (!car) return ["Every refuel, service and tyre change", noCarState(ctx)];
  const logs = car.logs;
  const today = ctx.today;
  const en = energy(car);
  const view = { filter: 0, ...(store.pref("car_log_view", {}) || {}) };
  const { perFill } = fuelStats(logs);
  const prevKm = new Map();
  let last = null;
  for (const l of [...logs].sort(byDateKm)) { prevKm.set(l.id, last); if (l.km !== null) last = l.km; }
  const subtitle = h("span");
  const list = h("div", { class: "history-list" });
  const multi = ctx.data.cars.length > 1;

  function fill() {
    const shown = logs.filter(FILTERS[view.filter][1]).slice().sort(byDateKm).reverse();
    const whose = multi ? `${carTitle(car)}: ` : "";
    subtitle.textContent = !logs.length ? `${whose}nothing logged yet`
      : view.filter ? `${whose}${shown.length} of ${plural(logs.length, "log")}  ·  tap one to edit it` : `${whose}${plural(logs.length, "log")}  ·  tap one to edit or delete it`;
    list.replaceChildren();
    if (!shown.length) {
      list.append(h("div", { class: "card empty-small" }, logs.length ? "No logs of this kind yet." : "No logs yet. Tap + to log the odometer."));
      return;
    }
    const groups = [];
    for (const l of shown) {
      const y = l.date.slice(0, 4);
      if (!groups.length || groups.at(-1)[0] !== y) groups.push([y, []]);
      groups.at(-1)[1].push(l);
    }
    for (const [year, items] of groups) {
      const costs = items.reduce((a, l) => a + (l.cost || 0), 0);
      list.append(h("div", { class: "year-head" }, h("div", { class: "year-title" }, year),
        h("div", { class: "year-sum" }, `${plural(items.length, "log")}${costs ? `  ·  ${fmtSek(costs)}` : ""}`)));
      list.append(h("div", { class: "hgroup" }, items.map((l) => logRow(l, ctx, car, perFill, prevKm.get(l.id), today, en))));
    }
  }

  const exportBtn = h("button", { type: "button", class: "pill-btn" }, icon("table", 15), "Export CSV");
  exportBtn.addEventListener("click", async () => {
    if (!logs.length) { toast("Nothing to export yet"); return; }
    const slug = carTitle(car).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "car";
    await saveFile(`${slug}-${isoDay(today)}.csv`, "text/csv", carCsv(logs));
  });
  fill();
  return [subtitle,
    carPicker(ctx, car),
    segmented(FILTERS.map(([t]) => (t === "Refuels" ? `${en.refuel}s` : t)), view.filter, (i) => { view.filter = i; store.setPref("car_log_view", view); fill(); }, "full"),
    h("div", { class: "pill-row" },
      h("button", { type: "button", class: "pill-btn", onclick: () => openCarSheet(ctx, car) }, icon("car", 15), "Car details"),
      h("button", { type: "button", class: "pill-btn", onclick: () => openCarSheet(ctx, null) }, icon("plus", 15), "Add a car"),
      exportBtn),
    list];
}
