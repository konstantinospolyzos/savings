// Car monitor: what its pages share (the car shown, small cards and buttons, dates and words).
import { h, dot, segmented, icon, group, selectRow } from "../ui.js";
import { CUR, MONTHS, fmtMoney, todayDate } from "../core.js";
import { TYPE, parseDay, carTitle, positionsWord } from "../car.js";
import { store } from "../store.js";

export const card = (...children) => h("div", { class: "card" }, children);
export const head = (title, sub = null, right = null) => h("div", { class: "card-head" },
  h("div", { class: "card-head-text" }, h("div", { class: "card-title" }, title), sub ? h("div", { class: "card-sub" }, sub) : null), right);
export const actions = (...buttons) => h("div", { class: "card-actions" }, buttons);
export const btn = (text, onclick, kind = "tinted") => h("button", { type: "button", class: `btn ${kind} small`, onclick }, text);

/** "24 Oct", or "24 Oct 2025" for another year */
export function dayText(iso, today = todayDate()) {
  const d = parseDay(iso);
  const s = `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  return d.getFullYear() === today.getFullYear() ? s : `${s} ${d.getFullYear()}`;
}
export const round100 = (v) => Math.round(v / 100) * 100;
export const daysWord = (n) => `${n} day${n !== 1 ? "s" : ""}`;
export const syncTap = () => { if (store.mode === "drive" && !store.drive.tokenValid()) store.syncFromTap(); };
export const typeName = (type, en) => (type === "fuel" ? en.refuel : TYPE[type].name);
export const perUnit = (v, en) => `${fmtMoney(CUR.local, v, 2)}/${en.unit}`;

// ---------------------------------------------------------------------------
// Which car: remembered on this device
// ---------------------------------------------------------------------------
export const PREF = "car_id";
export function selectedCar(data) {
  const cars = data.cars || [];
  const id = store.pref(PREF, null);
  return cars.find((c) => c.id === id) || cars[0] || null;
}
export const carHeading = (ctx) => { const c = selectedCar(ctx.data); return c ? carTitle(c) : "Car"; };

export function carPicker(ctx, current) {
  const cars = ctx.data.cars;
  if (cars.length < 2) return null;
  const pick = (id) => { store.setPref(PREF, id); ctx.refresh(); };   // the picker sits at the top, so the scroll can stay
  if (cars.length <= 3) return segmented(cars.map(carTitle), cars.indexOf(current), (i) => pick(cars[i].id), "full car-picker");
  return group(selectRow("Car", cars.map((c) => [c.id, carTitle(c)]), current.id, pick));
}

export function typeBadge(type, size = 32) {
  return h("span", { class: "car-badge", style: { background: TYPE[type].color, width: `${size}px`, height: `${size}px` } },
    icon(TYPE[type].icon, Math.round(size * 0.58)));
}

export const pairWord = (list) => { const w = positionsWord(list); return w.endsWith("pair") ? `the ${w}` : w; };

// ---------------------------------------------------------------------------
// A metric tile, and the rows of the sheets
// ---------------------------------------------------------------------------
/** A tile with the number big and its unit small, so "6.6 l/100 km" fits a phone. */
export const fmetric = (cap, color, [num, unit], sub, money = false) => h("div", { class: "fmetric" },
  h("div", { class: "cap-row" }, dot(color, 7), h("span", { class: "caption" }, cap)),
  // a long unit (kWh/100 km) goes under the number when the tile is too narrow for both
  h("div", { class: `fmetric-value ${money ? "amt" : ""} ${unit && unit.length > 8 ? "wrap" : ""}` }, num,
    unit ? h("span", { class: "fmetric-unit" }, ` ${unit}`) : null),
  h("div", { class: `fmetric-sub ${money ? "amt" : ""}` }, sub));

export function numField(placeholder, mode = "decimal") {
  return h("input", { class: "form-input", type: "text", inputmode: mode, autocomplete: "off", autocorrect: "off",
    spellcheck: "false", placeholder });
}
export function textField(placeholder, value = "", extra = {}) {
  return h("input", { class: "form-input", type: "text", autocomplete: "off", spellcheck: "false", placeholder, value, ...extra });
}
export function row(labelText, input, unit = null) {
  return h("label", { class: "form-row" }, h("span", { class: "form-label" }, labelText), input,
    unit ? h("span", { class: "form-unit" }, unit) : null);
}
export const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_RX = /^\d{4}-\d{2}$/;
