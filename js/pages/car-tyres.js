// Car monitor: your tyres one by one, on a car seen from above, and the sheet of one tyre.
import { h, dot, segmented, sheet, group, caption, footer, toast, toggle } from "../ui.js";
import { COLORS, fmtSek, isoDay, daysBetween, parseNumber, plainNumber, plural } from "../core.js";
import { parseDay, POS_NAME, positionsOf, tyreList, tyreSets, tyrePeriods, dotDate, minTread, lowTread } from "../car.js";
import { store } from "../store.js";
import { card, head, actions, btn, dayText, syncTap, pairWord, numField, textField, row, DATE_RX } from "./car-common.js";
import { carSvg } from "./car-picture.js";
import { openCarLogSheet } from "./car-sheets.js";

const TONE_COLOR = { up: COLORS.green, warn: COLORS.orange, down: COLORS.red, flat: COLORS.gray3 };
const SET_LABEL = { summer: "Summer", studded: "Studded", winter: "Non-studded" };
const SET_TITLE = { summer: "Summer tyres", studded: "Studded winter tyres", winter: "Non-studded winter tyres" };
const ageShort = (days) => (days < 45 ? "New" : days < 365 ? `${Math.max(1, Math.round(days / 30.44))} mo`
  : `${(days / 365.25).toFixed(1).replace(/\.0$/, "")} yrs`);
function ageLong(days) {
  if (days < 45) return "New";
  const months = Math.round(days / 30.44);
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? plural(y, "year") : null, m ? plural(m, "month") : null].filter(Boolean).join(" ");
}
const kmShort = (t) => (t.km === 0 && t.partial ? "— km" : `${plainNumber(Math.round(t.km / 100) * 100)}${t.partial ? "+" : ""} km`);
const dotWords = (code) => `week ${Number(code.slice(0, 2))} of 20${code.slice(2)}`;
function tyreLabel(t, onTap, row) {
  return h("button", { type: "button", class: `tm-label ${row}`, onclick: () => onTap(t) },
    // on a small phone: FL, FR, RL, RR
    h("div", { class: "cap-row" }, dot(TONE_COLOR[t.tone], 7),
      h("span", { class: "caption" }, h("span", { class: "tm-long" }, POS_NAME[t.pos]), h("span", { class: "tm-short" }, t.pos))),
    t.age_days === null ? h("div", { class: "tm-age add" }, "Add age") : h("div", { class: "tm-age" }, ageShort(t.age_days)),
    h("div", { class: "tm-km" }, kmShort(t)),
    t.info?.tread ? h("div", { class: "tm-km" }, `${plainNumber(t.info.tread.mm, 1)} mm`, h("span", { class: "tm-long" }, " tread")) : null);
}

/** The car from above, with what each tyre has done above and below it. tyres: {FL: tyre, FR: ..., RL, RR} */
function tyreMap(tyres, onTap) {
  const carEl = h("div", { class: "tm-carwrap" });
  carEl.innerHTML = carSvg((p) => `tone-${tyres[p]?.tone || "flat"}`);
  for (const g of carEl.querySelectorAll("[data-pos]")) g.addEventListener("click", () => tyres[g.dataset.pos] && onTap(tyres[g.dataset.pos]));
  // the front to the left: the right side of the car at the top, the left side at the bottom
  const rowOf = (cls, front, rear) => h("div", { class: `tm-row ${cls}` }, tyreLabel(tyres[front], onTap, "front"), tyreLabel(tyres[rear], onTap, "rear"));
  return h("div", { class: "tyre-map" }, rowOf("top", "FR", "RR"), carEl, rowOf("bottom", "FL", "RL"));
}

const tyreSetShown = new Map();       // car id -> the set Your tyres shows (the one on the car at first)

export function tyresCard(car, ctx) {
  const today = ctx.today;
  const all = tyreList(car, today);
  const sets = tyreSets(car);
  const periods = tyrePeriods(car.logs);
  const onNow = periods.at(-1)?.set || null;
  let set = tyreSetShown.get(car.id);
  if (!sets.includes(set)) set = sets.includes(onNow) ? onNow : sets[0];
  const sub = h("span");
  const body = h("div");
  function draw() {
    const now = Object.fromEntries(all.filter((t) => t.set === set && t.current).map((t) => [t.pos, t]));
    const last = periods.filter((p) => p.set === set).at(-1);
    sub.textContent = `${SET_TITLE[set]}  ·  ${onNow === set ? `on the car${last ? ` since ${dayText(last.from, today)}` : ""}`
      : last ? `in storage since ${dayText(last.to, today)}` : "not logged on the car yet"}`;
    // which of them came from a New tyres log
    const byLog = new Map();
    for (const t of Object.values(now)) if (t.log) byLog.set(t.log.id, [...(byLog.get(t.log.id) || []), t]);
    const older = Object.values(now).filter((t) => !t.log).length;
    const lines = [...[...byLog.values()].map((ts) => `${ts.length === 4 ? "All four" : `${ts.length} (${pairWord(ts.map((t) => t.pos))})`} bought ${dayText(ts[0].log.date, today)}`),
      byLog.size && older ? `${older} older` : null].filter(Boolean).join("  ·  ");
    const unknown = Object.values(now).some((t) => t.age_days === null);
    body.replaceChildren(...[
      tyreMap(now, (t) => openTyreSheet(ctx, car, t)),
      lines ? h("div", { class: "tm-note" }, lines) : null,
      h("div", { class: "hint" }, unknown
        ? "Tap a tyre to add its age: the last four digits of the DOT code on its side are the week and year it was made (2321 = week 23 of 2021). New tyres you log fill this in by themselves."
        : "Kilometres from your odometer while the set was on the car (+: the tyre is older than your logs). Tap a tyre for its details."),
    ].filter(Boolean));
  }
  draw();
  const seg = sets.length > 1
    ? segmented(sets.map((k) => SET_LABEL[k]), sets.indexOf(set), (i) => { set = sets[i]; tyreSetShown.set(car.id, set); draw(); }, "full")
    : null;
  return card(head("Your tyres", sub), seg, body,
    actions(btn("+  New tyres", () => openCarLogSheet(ctx, car, null, { type: "tyre_buy", tires: set }))));
}

/** One tyre: what it has done, and what you know about it (brand, DOT code, tread). */
function openTyreSheet(ctx, car, t) {
  const today = ctx.today;
  const inf = t.info || {};
  const notes = car.tyre_info || {};
  const others = t.together.filter((id) => id !== t.id);
  const brand = textField("e.g. Nokian Hakkapeliitta 10", inf.brand || "", { "aria-label": "Brand", autocapitalize: "words" });
  const dotI = numField("e.g. 2321", "numeric");
  dotI.value = inf.dot || "";
  dotI.maxLength = 4;
  const bought = t.log ? null : h("input", { class: "form-input date-input", type: "date", value: inf.bought || "", "aria-label": "Bought on" });
  const tread = numField(`e.g. ${WINTER_TREAD.has(t.set) ? "7,5" : "5,5"}`);
  if (inf.tread) tread.value = plainNumber(inf.tread.mm, 1);
  const same = others.length ? toggle(others.every((id) => !notes[id]?.brand && !notes[id]?.dot), () => {}, "Same for the others") : null;
  const dotFooter = footer("");
  let api = null;

  function validate() {
    const code = dotI.value.trim();
    const made = dotDate(code);
    const dotBad = Boolean(code) && (!made || made > isoDay(today));
    const mm = parseNumber(tread.value);
    const treadBad = Boolean(tread.value.trim()) && !(mm >= 0 && mm <= 20);
    const boughtBad = Boolean(bought?.value) && (!DATE_RX.test(bought.value) || bought.value > isoDay(today));
    dotI.classList.toggle("invalid", dotBad);
    tread.classList.toggle("invalid", treadBad);
    dotFooter.textContent = made && !dotBad ? `Made in ${dotWords(code)}: ${ageLong(daysBetween(parseDay(made), today))} old.`
      : "The DOT code on the side of the tyre ends with four digits: the week and the year it was made (2321 = week 23 of 2021). Tyres age even when they're not used.";
    api?.setRight({ disabled: dotBad || treadBad || boughtBad });
  }
  for (const el of [dotI, tread, ...(bought ? [bought] : [])]) el.addEventListener("input", validate);
  bought?.addEventListener("change", validate);

  const info = (label, value) => h("div", { class: "form-row" }, h("span", { class: "form-label" }, label), h("span", { class: "form-value" }, value));
  const driven = t.km === 0 && t.partial ? "Not logged yet" : `${kmShort(t)}${t.seasons ? `  ·  ${plural(t.seasons, "season")}` : ""}`;
  const age = t.age_days === null ? "—" : `${ageLong(t.age_days)}${inf.dot ? "" : " (since bought)"}`;
  const before = tyreList(car, today).filter((x) => x.set === t.set && x.pos === t.pos && x.until && x.until <= (t.since || "9999"))
    .sort((a, b) => (a.until < b.until ? 1 : -1));
  const body = h("div", { class: "form" },
    footer(SET_TITLE[t.set]),
    t.warn ? h("div", { class: `tyre-warn tone-text-${t.tone}` }, t.warn) : null,
    caption("SO FAR"),
    group(info("Driven", driven), info("Age", age),
      t.log ? info("Bought", `${dayText(t.log.date, today)}${t.price ? `  ·  ${fmtSek(t.price)} each` : ""}`) : null),
    footer(t.km === 0 && t.partial
      ? "The kilometres count from your first logged tyre change with this set."
      : t.partial ? `Counted since ${dayText(t.counted_from, today)}, your first logged change with this set; the tyre is older, so it has done more.`
        : "Counted from your odometer logs while the set was on the car."),
    caption("DETAILS"),
    group(row("Brand", brand), row("DOT code", dotI), bought ? h("label", { class: "form-row" }, h("span", { class: "form-label" }, "Bought on"), bought) : null,
      row("Tread depth", tread, "mm")),
    dotFooter,
    footer(`Measure the tread in the main grooves. In Sweden the legal minimum is ${WINTER_TREAD.has(t.set) ? `${minTread(t.set)} mm for winter tyres (1 December – 31 March), and under ${lowTread(t.set)} mm they're worn` : `${String(minTread(t.set)).replace(".", ",")} mm; under ${lowTread(t.set)} mm they grip worse in the wet`}.${inf.tread ? ` Last measured ${dayText(inf.tread.date, today)}.` : ""}`),
    same ? group(h("label", { class: "form-row switch-row" }, h("span", { class: "form-label" }, `Same for all ${t.together.length}`), same)) : null,
    same ? footer(t.log ? `The brand and the DOT code also for the ${plural(others.length, "other tyre")} bought with this one (${pairWord(positionsOf(t.log))}).`
      : "The brand, the DOT code and the day you bought them also for the other tyres of this set from before your logs.") : null,
    before.length ? caption("BEFORE THIS ONE") : null,
    before.length ? group(...before.map((x) => info(x.log ? `Bought ${dayText(x.log.date, today)}` : "From before your logs",
      `${kmShort(x)}, replaced ${dayText(x.until, today)}`))) : null);

  api = sheet({ title: POS_NAME[t.pos], left: { text: "Cancel" }, body,
    right: { text: "Save", bold: true, onClick: (sh) => {
      const code = dotI.value.trim();
      const mm = parseNumber(tread.value);
      const next = { brand: brand.value.trim(), dot: dotDate(code) ? code : null, bought: bought ? bought.value || null : inf.bought || null,
        tread: !tread.value.trim() ? null : inf.tread && Math.abs(inf.tread.mm - mm) < 0.05 ? inf.tread : { mm, date: isoDay(today) } };
      const items = { [t.id]: next };
      if (same?.input.checked) for (const id of others) items[id] = { ...(notes[id] || {}), brand: next.brand, dot: next.dot, ...(t.log ? {} : { bought: next.bought }) };
      store.saveTyreInfo(car.id, items);
      sh.close();
      toast(`✓  Saved ${POS_NAME[t.pos].toLowerCase()}${same?.input.checked ? ` and the ${plural(others.length, "other")}` : ""}`);
      syncTap();
    } } });
  validate();
  return api;
}
const WINTER_TREAD = new Set(["studded", "winter"]);
