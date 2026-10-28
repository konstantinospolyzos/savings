// Car monitor: the Garage tab, all your cars at a glance.
import { h, chip, dot, kv } from "../ui.js";
import { COLORS, localSym, fmtSek, mLong, plainNumber, plural } from "../core.js";
import { FUEL_NAME, carSummary, fmtKm, carTitle, energy } from "../car.js";
import { store } from "../store.js";
import { fileGrid } from "./car-files.js";
import { card, head, actions, btn, dayText, round100, PREF, selectedCar, fmetric } from "./car-common.js";
import { noCarState, openCarSheet } from "./car-sheets.js";
import { fixedSection } from "./car-fixed.js";

/** The odometer when you bought the car, and how far you've driven it since (with a later reading). */
function purchaseKmRows(car) {
  const pu = car.purchase;
  if (pu.km === null || pu.km === undefined) return [];
  const latest = car.logs.reduce((m, l) => (l.km !== null && l.km > m ? l.km : m), -1);
  return [kv("Odometer when bought", fmtKm(pu.km), { amt: false }),
    latest >= pu.km ? kv("Driven since then", fmtKm(latest - pu.km), { amt: false }) : null];
}

// ---------------------------------------------------------------------------
// Garage page: all your cars at a glance
// ---------------------------------------------------------------------------
const serviceEvery = (car) => [car.service_km ? fmtKm(car.service_km) : null, car.service_months ? `${car.service_months} months` : null]
  .filter(Boolean).join(" or ") || "—";

function garageCard(car, ctx, showing) {
  const today = ctx.today;
  const sum = carSummary(car, today);
  const en = energy(car), kwh = en.unit === "kWh";
  const f = sum.fuel;
  const recent = f.recent.n >= 2 && f.recent.per100 !== null;
  const v = recent ? f.recent : f.all;
  const L = sum.latest;
  const makeModel = [car.make, car.model].filter(Boolean).join(" ");
  const pu = car.purchase;
  const sec = (title, ...children) => h("div", { class: "garage-sec" }, h("div", { class: "caption" }, title), ...children);
  const open = () => { store.setPref(PREF, car.id); ctx.go("car"); window.scrollTo(0, 0); };
  return card(
    head(carTitle(car), car.name && makeModel ? makeModel : null, showing ? chip("Showing", "flat") : null),
    h("div", { class: "cap-row" }, dot(COLORS.blue), h("span", { class: "caption" }, "ODOMETER"),
      L ? h("span", { class: "hint" }, `on ${dayText(L.date, today)}`) : null),
    h("div", { class: "block-value" }, L ? fmtKm(L.km) : "—"),
    h("div", { class: "muted" }, !L ? "No odometer reading yet" : sum.per_year !== null ? `≈ ${fmtKm(round100(sum.per_year))} a year` : plural(sum.n, "log")),
    v.per100 !== null
      ? h("div", { class: "fmetrics garage-use" },
        fmetric(kwh ? "ENERGY USE" : "CONSUMPTION", COLORS.orange, [v.per100.toFixed(1), en.per100], recent ? "last 12 months" : "all your logs"),
        fmetric(kwh ? "CHARGING COST" : "FUEL COST", COLORS.green, v.per_km !== null ? [plainNumber(v.per_km, 2), `${localSym()}/km`] : ["—", ""],
          v.per_km !== null ? `${fmtSek(v.per_km * 100)} per 100 km` : "no prices logged", true))
      : sec(kwh ? "ENERGY USE" : "CONSUMPTION", h("div", { class: "muted garage-none" },
        `Shows from the second ${kwh ? "full charge" : "full tank"} logged with the odometer.`)),
    fixedSection(car, ctx),
    sec("SPECS", h("div", { class: "kv-list" },
      kv("Make and model", makeModel || "—", { amt: false }),
      kv("Model year", car.year ? String(car.year) : "—", { amt: false }),
      kv("Registration", car.plate || "—", { amt: false }),
      kv("Runs on", FUEL_NAME[car.fuel], { amt: false }),
      kv("First registered", car.first_registered ? mLong(car.first_registered) : "—", { amt: false }),
      kv("Service every", serviceEvery(car), { amt: false }))),
    sec("PURCHASE", h("div", { class: "kv-list" },
      kv("Bought", [pu.date ? dayText(pu.date, today) : null, pu.price ? fmtSek(pu.price) : null].filter(Boolean).join("  ·  ") || "—"),
      ...purchaseKmRows(car),
      pu.seller ? kv("Bought from", pu.seller, { amt: false }) : null),
    pu.docs.length ? fileGrid(pu.docs, { readOnly: true }).el
      : h("div", { class: "muted garage-none" }, "No invoice or papers yet. Add them in Edit details.")),
    actions(btn("Open", open), btn("Edit details", () => openCarSheet(ctx, car), "plain")));
}

export function renderGarage(ctx) {
  const cars = ctx.data.cars;
  if (!cars.length) return ["All your cars at a glance", noCarState(ctx)];
  const shown = selectedCar(ctx.data);
  return [cars.length > 1 ? `${cars.length} cars  ·  Open one for its logs and charts` : "Your car at a glance",
    ...cars.map((c) => garageCard(c, ctx, cars.length > 1 && c === shown)),
    h("button", { type: "button", class: "btn tinted wide garage-add", onclick: () => openCarSheet(ctx, null) }, "+  Add a car")];
}
