// Car monitor: the sheets to add or edit a log and a car.
import { h, segmented, icon, sheet, group, caption, footer, alertBox, toast, selectRow, toggle, pickFile } from "../ui.js";
import { CUR, localSym, fmtMoney, isoDay, daysBetween, parseNumber, plainNumber, plural, inSweden } from "../core.js";
import { NEEDS_KM, TYRE_LOGS, estimateKm, TYRE_SETS, FUELS, previousReading, byDateKm, fmtKm, fmtKmSigned, parseDay, newLogId, emptyCar, carTitle, energy, fillPreview, POS_KEYS, positionsOf } from "../car.js";
import { store } from "../store.js";
import { getKey, readPump, shrinkPhoto, exifDate } from "../pump.js";
import { openPhotoSetup } from "./pump-sheet.js";
import { removePhotos } from "../photos.js";
import { fileGrid } from "./car-files.js";
import { dayText, daysWord, syncTap, typeName, PREF, pairWord, numField, textField, row, DATE_RX, MONTH_RX } from "./car-common.js";
import { carSvg } from "./car-picture.js";
import { cachedPrices } from "./car-prices.js";

const OTHER_KINDS = [["inspection", "Inspection (besiktning)"], ["repair", "Repair"], ["tax", "Vehicle tax (fordonsskatt)"],
  ["insurance", "Insurance"], ["parking", "Parking"], ["other", "Other"]];

/** No car yet: add the first one. */
export function noCarState(ctx) {
  return h("div", { class: "card empty-state" },
    h("span", { class: "car-icon" }, icon("car", 40)),
    h("div", { class: "empty-title" }, "Add your car"),
    h("div", { class: "empty-text" }, "Start with the basics: make, model, registration number and when it was first registered. Then log the odometer every time you refuel or service it. You can add more cars later and switch between them."),
    h("button", { class: "btn primary", type: "button", onclick: () => openCarSheet(ctx, null) }, "+  Add your car"));
}

const NOTE_HINTS = {
  fuel: "Optional, e.g. the station, or a trip.",
  service: "What was done: oil, filters, brakes…",
  tires: "Optional, e.g. where the other set is stored.",
  tyre_buy: "Optional, e.g. the brand, the size, or where you bought them.",
  inspection: "Optional, e.g. remarks from the inspection.",
  repair: "What was fixed.",
  tax: "Optional, e.g. which year it's for.",
  insurance: "Optional, e.g. the period it covers. Insurance you pay every month goes in Fixed costs, in the Garage, and logs itself.",
  parking: "Optional, e.g. where. A parking space you rent every month goes in Fixed costs, in the Garage, and logs itself.",
  other: "What it was: washing, parking, a toll, a part…",
};

export function openCarLogSheet(ctx, car, original = null, preset = {}) {
  const logs = car.logs;
  const today = ctx.today;
  const en = energy(car);
  const kwh = en.unit === "kWh";
  const MAIN = ["fuel", "service", "tires"];
  let type = original ? original.type : preset.type || "fuel";
  const TYRE_KINDS = ["tires", "tyre_buy"];
  let tyreKind = TYRE_KINDS.includes(type) ? type : "tires";
  let otherKind = MAIN.includes(type) || TYRE_KINDS.includes(type) ? "other" : type;
  let tires = original?.tires || preset.tires || "summer";
  const latestKm = logs.reduce((m, l) => (l.km !== null && l.km > m ? l.km : m), -1);
  // this week's Swedish average, as a hint in the price field
  const avg = en.priceKey && inSweden() ? cachedPrices()?.prices?.[en.priceKey]?.at(-1)?.[1] : null;

  const date = h("input", { class: "form-input date-input", type: "date", value: original ? original.date : isoDay(today), "aria-label": "Date" });
  const km = numField(latestKm >= 0 ? `Last: ${plainNumber(latestKm)}` : "e.g. 45 210", "numeric");
  const litres = numField(kwh ? "e.g. 45" : "e.g. 42,5");
  const price = numField(avg ? `average ${plainNumber(avg, 2)}` : kwh ? "e.g. 2,50" : "e.g. 18,21");
  const cost = numField("optional");
  const note = h("textarea", { class: "note-input", rows: "2", placeholder: "Note" });
  const fullSwitch = toggle(original ? original.full !== false : true, () => validate(), "Full tank");

  const kindRow = selectRow("What", OTHER_KINDS, otherKind, (v) => { otherKind = v; type = v; update(); });
  const kindGroup = group(kindRow);
  const kmRow = row("Odometer", km, "km");
  const litresRow = row(en.amount, litres, en.unit);
  const priceRow = row("Price", price, `${localSym()}/${en.unit}`);
  const costLabel = h("span", { class: "form-label" }, "Cost");
  const costRow = h("label", { class: "form-row" }, costLabel, cost, h("span", { class: "form-unit" }, localSym()));
  const moneyCaption = caption("COST");
  // read the litres, price and amount off a photo of the pump (petrol and diesel cars)
  const photoBtn = h("button", { type: "button", class: "photo-btn" }, icon("camera", 20), h("span", { class: "photo-btn-text" }, "Read a photo of the pump"));
  const photoNote = h("div", { class: "photo-note" });
  const photoBox = h("div", { class: "photo-box" }, photoBtn, photoNote);
  let dateTouched = Boolean(original);

  // invoice photos and PDFs (services, repairs, tyres, inspections...): on the device, and in Drive with Drive
  const files = fileGrid(original?.photos, { from: "this log" });
  let saved = false;
  const photoCaption = caption("PHOTOS");
  const photoGrid = files.el;
  const photoFooter = footer("A photo or PDF of the invoice shows later what was done and changed. Tap one to see it full size. With Google Drive they're saved in your Savings Tracker folder, next to your data (seeing them needs internet); otherwise on this device.");
  const fullGroup = group(h("label", { class: "form-row switch-row" }, h("span", { class: "form-label" }, kwh ? "Charged to full" : "Full tank"), fullSwitch));
  const fullFooter = footer(`Turn it off if you only ${kwh ? "topped up the battery" : "topped up"}. The consumption is then worked out at your next full ${kwh ? "charge" : "tank"}, with these ${en.amount.toLowerCase()} included.`);
  const kmFooter = footer("");
  const costFooter = footer("");
  const tyreCaption = caption("TYRES PUT ON");
  const tyreSeg = segmented(["Summer", "Studded", "Non-studded"], Math.max(0, TYRE_SETS.findIndex(([k]) => k === tires)),
    (i) => { tires = TYRE_SETS[i][0]; update(); }, "full");
  const tyreFooter = footer("Studded and non-studded are both winter tyres. In Sweden winter tyres are required 1 December – 31 March when the roads are wintry, and studs are allowed 1 October – 15 April.");
  const noteFooter = footer("");
  const typeSeg = segmented([en.refuel, "Service", "Tyres", "Other"], TYRE_KINDS.includes(type) ? 2 : MAIN.includes(type) ? MAIN.indexOf(type) : 3,
    (i) => { type = i === 3 ? otherKind : i === 2 ? tyreKind : MAIN[i]; update(); }, "full");
  // Tyres: a change of sets, or new tyres bought (and fitted at once, or later)
  const tyreKindSeg = segmented(["Tyre change", "New tyres"], tyreKind === "tyre_buy" ? 1 : 0,
    (i) => { tyreKind = TYRE_KINDS[i]; type = tyreKind; update(); }, "full tyre-kind");
  const fittedSwitch = toggle(original?.type === "tyre_buy" ? original.fitted !== false : true, () => update(), "Fitted right away");
  const fittedGroup = group(h("label", { class: "form-row switch-row" }, h("span", { class: "form-label" }, "Fitted right away"), fittedSwitch));
  const fittedFooter = footer("On: they were put on the car when you bought them, so this also counts as your tyre change. Off: bought for later; log a tyre change when you put them on.");
  // which ones: sometimes only two are new, and the others keep their age and kilometres
  let positions = original?.type === "tyre_buy" ? [...positionsOf(original)] : [...POS_KEYS];
  const posCaption = caption("WHICH ONES");
  const posPick = h("div", { class: "tm-pick" });
  const posFooter = footer("");
  function drawPick() {
    posPick.innerHTML = carSvg((p) => (positions.includes(p) ? "on" : "off"));
    for (const g of posPick.querySelectorAll("[data-pos]")) {
      g.addEventListener("click", () => {
        const p = g.dataset.pos;
        positions = positions.includes(p) ? positions.filter((x) => x !== p) : POS_KEYS.filter((x) => x === p || positions.includes(x));
        drawPick();
        validate();
      });
    }
    posFooter.textContent = !positions.length ? "Tap the tyres you bought."
      : positions.length === 4 ? "All four. Tap a tyre to leave it out, e.g. when you bought only two: the others keep their age and kilometres."
        : `${plural(positions.length, "new tyre")}: ${pairWord(positions)}. The others keep their age and kilometres.`;
  }
  drawPick();

  // a refuel: type any two of litres, price and total, and the third is worked out (shown in grey)
  const money = { litres, price, cost };
  const auto = { litres: false, price: false, cost: false };
  const typed = (k) => !auto[k] && parseNumber(money[k].value) !== null;
  function setAuto(k, v) {
    auto[k] = v !== null && Number.isFinite(v);
    money[k].value = auto[k] ? plainNumber(v, 2) : "";
    money[k].classList.toggle("auto", auto[k]);
  }
  function recalc(changed) {
    if (changed) { auto[changed] = false; money[changed].classList.remove("auto"); }
    if (type !== "fuel") return;
    const L = parseNumber(litres.value), P = parseNumber(price.value), T = parseNumber(cost.value);
    const n = ["litres", "price", "cost"].filter(typed).length;
    if (n === 2 && !typed("cost")) setAuto("cost", L * P);
    else if (n === 2 && !typed("price")) setAuto("price", L > 0 ? T / L : null);
    else if (n === 2 && !typed("litres")) setAuto("litres", P > 0 ? T / P : null);
    else if (n < 2) for (const k of Object.keys(auto)) if (auto[k]) setAuto(k, null);
  }

  let api = null;
  const read = () => ({ d: date.value, k: parseNumber(km.value), c: parseNumber(cost.value), l: parseNumber(litres.value), p: parseNumber(price.value) });

  function update() {
    const isFuel = type === "fuel", isTyres = TYRE_KINDS.includes(type), isOther = !MAIN.includes(type) && !isTyres;
    tyreKindSeg.style.display = isTyres ? "" : "none";
    for (const el of [fittedGroup, fittedFooter, posCaption, posPick, posFooter]) el.style.display = type === "tyre_buy" ? "" : "none";
    tyreCaption.textContent = type === "tyre_buy" ? "WHICH TYRES" : "TYRES PUT ON";
    kindGroup.style.display = isOther ? "" : "none";
    for (const el of [litresRow, priceRow, fullGroup, fullFooter]) el.style.display = isFuel ? "" : "none";
    photoBox.style.display = isFuel && !kwh ? "" : "none";
    for (const el of [tyreCaption, tyreSeg, tyreFooter]) el.style.display = isTyres ? "" : "none";
    for (const el of [photoCaption, photoGrid, photoFooter]) el.style.display = isFuel ? "none" : "";
    photoCaption.textContent = ["service", "repair", "tyre_buy"].includes(type) ? "INVOICE PHOTOS" : "PHOTOS";
    costLabel.textContent = isFuel ? "Total" : "Cost";
    moneyCaption.textContent = isFuel ? (kwh ? "CHARGING" : "FUEL") : "COST";
    if (!isFuel) for (const k of ["litres", "price"]) if (auto[k]) setAuto(k, null);
    if (!isFuel && auto.cost) setAuto("cost", null);
    noteFooter.textContent = NOTE_HINTS[type];
    recalc(null);
    validate();
  }

  function validate() {
    const { d, k, c, l, p } = read();
    const isFuel = type === "fuel";
    const dateOk = DATE_RX.test(d);
    const kmBad = Boolean(km.value.trim()) && (k === null || k < 0);
    const costBad = Boolean(cost.value.trim()) && (c === null || c < 0);
    const litresBad = isFuel && Boolean(litres.value.trim()) && (l === null || l <= 0);
    const priceBad = isFuel && Boolean(price.value.trim()) && (p === null || p <= 0);
    km.classList.toggle("invalid", kmBad);
    cost.classList.toggle("invalid", costBad);
    litres.classList.toggle("invalid", litresBad);
    price.classList.toggle("invalid", priceBad);
    const needKm = NEEDS_KM.has(type);
    const ok = dateOk && !kmBad && !costBad && !litresBad && !priceBad && (!needKm || k !== null) && (type !== "tyre_buy" || positions.length > 0);
    api?.setRight({ disabled: !ok });

    // odometer: compared with the reading before this date
    const prev = dateOk ? previousReading(logs, d, original?.id) : null;
    kmFooter.className = "section-footer";
    if (k !== null && !kmBad && prev) {
      const diff = k - prev.km;
      if (diff < 0) {
        kmFooter.textContent = `That's lower than the ${fmtKm(prev.km)} you logged on ${dayText(prev.date, today)}. Check the number.`;
        kmFooter.className = "section-footer tone-text-warn";
      } else {
        const days = daysBetween(parseDay(prev.date), parseDay(d));
        kmFooter.textContent = `${fmtKmSigned(diff)} since ${dayText(prev.date, today)}${days > 0 ? ` (${daysWord(days)})` : ""}`;
      }
    } else if (k === null && dateOk && TYRE_LOGS.has(type) && estimateKm(car, d, original?.id) !== null) {
      // an older tyre change: the odometer from the readings before and after that day
      kmFooter.textContent = `Leave it empty if you don't know it: about ${fmtKm(estimateKm(car, d, original?.id))}, from your readings before and after this day.`;
    } else if (prev) kmFooter.textContent = `Last reading: ${fmtKm(prev.km)} on ${dayText(prev.date, today)}.${needKm ? "" : " Optional for this one."}`;
    else kmFooter.textContent = needKm ? "What the odometer shows, in kilometres." : "Optional for this one.";

    // a refuel: the real consumption and the fuel cost per km since the last full tank, live
    costFooter.className = "section-footer";
    if (!isFuel) { costFooter.textContent = `What it cost, in ${CUR.local}. Leave it empty if you don't know.`; return; }
    const full = fullSwitch.input.checked;
    const unitWord = kwh ? "charge" : "tank";
    if (!(l > 0)) { costFooter.textContent = `Type the ${en.amount.toLowerCase()} and the price (or the total) from the ${kwh ? "charger" : "pump"}: the app works out the rest.`; return; }
    if (!full) { costFooter.textContent = `Top-up: the consumption is worked out at your next full ${unitWord}.`; return; }
    if (k === null || !dateOk) { costFooter.textContent = "Add the odometer to see the consumption."; return; }
    const seg = fillPreview(logs, { date: d, km: k, litres: l, cost: c, full: true }, original?.id);
    if (!seg) { costFooter.textContent = `The first full ${unitWord}: the consumption shows from the next one.`; return; }
    const high = seg.per100 > (kwh ? 40 : 25), low = seg.per100 < (kwh ? 8 : 2.5);
    const value = `${seg.per100.toFixed(1)} ${en.per100}${seg.per_km !== null ? ` and ${fmtMoney(CUR.local, seg.per_km, 2)}/km` : ""}`;
    const over = `over the ${fmtKm(seg.km)} since your full ${unitWord} on ${dayText(seg.from, today)}${seg.topups ? ` (with ${plural(seg.topups, "top-up")})` : ""}`;
    if (high || low) {
      costFooter.textContent = `${value} ${over} looks ${high ? "high" : "low"}. ${high ? `Check the odometer and the ${en.amount.toLowerCase()}.` : `Is a ${en.refuel.toLowerCase()} in between missing?`}`;
      costFooter.className = "section-footer tone-text-warn";
    } else {
      costFooter.replaceChildren(h("b", { class: "use-now" }, value), ` ${over}.`);
    }
  }

  for (const [k, f] of Object.entries(money)) f.addEventListener("input", () => { recalc(k); validate(); });
  for (const f of [date, km]) f.addEventListener("input", validate);
  date.addEventListener("input", () => { dateTouched = true; });

  const looksLike = (fuel) => (/diesel|^d\b/i.test(fuel) ? "diesel" : /95|98|bensin|petrol|e10|v-power|miles/i.test(fuel) ? "petrol" : null);
  const carRuns = car.fuel === "diesel" ? "diesel" : ["95", "98", "hybrid"].includes(car.fuel) ? "petrol" : null;
  function photoMessage(cls, ...parts) {
    photoNote.querySelector(".photo-msg")?.remove();
    photoNote.prepend(h("div", { class: `photo-msg ${cls}` }, parts));
  }
  photoBtn.addEventListener("click", async () => {
    if (!getKey()) { openPhotoSetup(ctx); return; }       // the file picker needs a fresh tap, so the next tap reads
    const file = await pickFile("image/*");
    if (!file) return;
    photoBtn.disabled = true;
    photoBtn.classList.add("busy");
    const label = photoBtn.querySelector(".photo-btn-text");
    label.textContent = "Reading the photo…";
    photoNote.replaceChildren();
    try {
      const [img, head] = await Promise.all([shrinkPhoto(file), file.slice(0, 256 * 1024).arrayBuffer()]);
      const thumb = h("img", { class: "photo-thumb", src: img.dataUrl, alt: "The photo", onclick: () => thumb.classList.toggle("big") });
      photoNote.append(thumb);
      const r = await readPump(img.b64, getKey(), { onStage: (text) => { label.textContent = text; } });
      for (const [k, v] of [["litres", r.litres], ["price", r.price], ["cost", r.total]]) {
        money[k].value = v ? plainNumber(v, 2) : "";
        auto[k] = false;
        money[k].classList.remove("auto");
      }
      const taken = exifDate(head);
      let when = null;
      if (taken && !dateTouched && taken !== date.value && taken <= isoDay(today)) { date.value = taken; when = `Date from the photo: ${dayText(taken, today)}.`; }
      const sum = `${plainNumber(r.litres || 0, 2)} l × ${plainNumber(r.price || 0, 2)} kr/l = ${plainNumber((r.litres || 0) * (r.price || 0), 2)} kr`;
      const fixed = { decimal: " (a decimal point was put back)", "other-price": " (the price of the fuel you used)" }[r.how] || "";
      const wrongFuel = r.fuel && carRuns && looksLike(r.fuel) && looksLike(r.fuel) !== carRuns
        ? ` The pump says ${r.fuel}, but this car runs on ${carRuns}.` : "";
      if (r.ok && r.verified) photoMessage(wrongFuel ? "warn" : "good", `✓  ${plainNumber(r.litres, 2)} l × ${plainNumber(r.price, 2)} kr/l = ${plainNumber(r.total, 2)} kr${fixed}${r.fuel ? `  ·  ${r.fuel}` : ""}.`, wrongFuel, when ? ` ${when}` : "");
      else if (r.ok) photoMessage("warn", `Read two of the numbers; the ${r.fixed === "total" ? "amount" : r.fixed === "price" ? "price" : "litres"} was worked out. Check it against the photo.${wrongFuel}`, when ? ` ${when}` : "");
      else photoMessage("warn", `These don't add up: ${sum}, not ${plainNumber(r.total || 0, 2)} kr. Check them against the photo and fix the one that's wrong.`, when ? ` ${when}` : "");
      validate();
    } catch (err) {
      photoMessage("bad", err.message, err.kind === "key" || err.kind === "credit" ? " " : null, err.kind === "key" || err.kind === "credit"
        ? h("button", { type: "button", class: "link-btn", onclick: () => openPhotoSetup(ctx) }, "Check the key") : null);
    } finally {
      photoBtn.disabled = false;
      photoBtn.classList.remove("busy");
      label.textContent = "Read another photo";
    }
  });
  date.addEventListener("change", validate);
  note.addEventListener("input", () => { note.style.height = "auto"; note.style.height = `${Math.max(note.scrollHeight, 56)}px`; });

  if (original) {
    if (original.km !== null) km.value = plainNumber(original.km);
    if (original.cost !== null) cost.value = plainNumber(original.cost, original.cost % 1 ? 2 : 0);
    if (original.litres !== null) litres.value = plainNumber(original.litres, original.litres % 1 ? 2 : 0);
    note.value = original.note || "";
  }

  const body = h("div", { class: "form" },
    ctx.data.cars.length > 1 ? footer(`For ${carTitle(car)}`) : null,
    caption("WHAT"), typeSeg, kindGroup, tyreKindSeg,
    caption("WHEN AND HOW FAR"),
    group(h("label", { class: "form-row" }, h("span", { class: "form-label" }, "Date"), date), kmRow),
    kmFooter,
    moneyCaption,
    photoBox,
    group(litresRow, priceRow, costRow),
    costFooter,
    fullGroup, fullFooter,
    tyreCaption, tyreSeg, tyreFooter, posCaption, posPick, posFooter, fittedGroup, fittedFooter,
    photoCaption, photoGrid, photoFooter,
    caption("NOTE"),
    group(h("div", { class: "note-wrap" }, note)),
    noteFooter,
    original ? h("button", { type: "button", class: "btn destructive-row", onclick: () => remove() }, "Delete Log") : null);

  function save(sh) {
    const { d, k, c, l } = read();
    const needKm = NEEDS_KM.has(type);
    if (!DATE_RX.test(d) || (needKm && k === null) || (type === "tyre_buy" && !positions.length)) return;
    const isFuel = type === "fuel";
    const log = { id: original ? original.id : newLogId(), date: d, type, km: k, cost: c === null ? null : Math.round(c * 100) / 100,
      litres: isFuel ? l : null, full: isFuel ? fullSwitch.input.checked : null, tires: TYRE_KINDS.includes(type) ? tires : null,
      fitted: type === "tyre_buy" ? fittedSwitch.input.checked : null,
      ...(type === "tyre_buy" ? { positions: [...positions] } : {}),
      photos: isFuel ? [] : files.list(),
      note: note.value.trim() };
    saved = true;
    removePhotos(store, isFuel ? files.removed.concat(files.list()) : files.removed);
    store.saveCarLog(car.id, log);
    sh.close();
    const seg = isFuel && log.full ? fillPreview(logs, log, original?.id) : null;
    toast(seg ? `✓  ${seg.per100.toFixed(1)} ${en.per100}${seg.per_km !== null ? `  ·  ${fmtMoney(CUR.local, seg.per_km, 2)}/km` : ""}`
      : `✓  Saved ${typeName(type, en).toLowerCase()}${k !== null ? `  ·  ${fmtKm(k)}` : ""}`);
    syncTap();
  }

  async function remove() {
    const ok = await alertBox({ title: "Delete this log?",
      message: `${typeName(original.type, en)} on ${dayText(original.date, today)}${original.km !== null ? `, ${fmtKm(original.km)}` : ""}. This can't be undone.`,
      buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Delete", value: true, style: "destructive" }] });
    if (!ok) return;
    saved = true;
    removePhotos(store, (original.photos || []).concat(files.list().filter((p) => files.isAdded(p.id))));
    store.deleteCarLog(car.id, original.id);
    api.close();
    toast("Deleted the log");
    syncTap();
  }

  api = sheet({ title: original ? "Edit Log" : "New Log", left: { text: "Cancel" }, right: { text: "Save", bold: true, onClick: save }, body,
    onClose: () => files.close(saved) });
  update();          // for a refuel being edited, this works out the price from the litres and the total
  note.dispatchEvent(new Event("input"));
  if (!original && matchMedia("(pointer: fine)").matches) setTimeout(() => km.focus(), 350);
  return api;
}

/** Add a car (car = null) or change its details. */
export function openCarSheet(ctx, car = null) {
  const isNew = !car;
  const c = car || emptyCar();
  const name = textField("optional, e.g. The Volvo", c.name, { "aria-label": "Name" });
  const make = textField("e.g. Volvo", c.make, { "aria-label": "Make", autocapitalize: "words" });
  const model = textField("e.g. V60", c.model, { "aria-label": "Model", autocapitalize: "words" });
  const year = numField("e.g. 2019", "numeric");
  if (c.year) year.value = String(c.year);
  const plate = textField("e.g. ABC 123", c.plate, { "aria-label": "Registration number", autocapitalize: "characters", class: "form-input plate-input" });
  let fuel = c.fuel;
  const fuelRow = selectRow("Runs on", FUELS, fuel, (v) => { fuel = v; });
  const reg = h("input", { class: "form-input date-input", type: "month", value: c.first_registered || "", placeholder: "YYYY-MM", "aria-label": "First registered" });
  const kmI = numField("e.g. 15 000", "numeric");
  const monthsI = numField("e.g. 12", "numeric");
  if (c.service_km) kmI.value = plainNumber(c.service_km);
  if (c.service_months) monthsI.value = String(c.service_months);
  // the purchase: when, the price, from whom, and the invoice (not a running cost)
  const pu = c.purchase || { date: null, price: null, km: null, seller: "", docs: [] };
  const bought = h("input", { class: "form-input date-input", type: "date", value: pu.date || "", "aria-label": "Bought on" });
  const priceI = numField("optional", "decimal");
  if (pu.price) priceI.value = plainNumber(pu.price, pu.price % 1 ? 2 : 0);
  const seller = textField("optional, e.g. the dealer", pu.seller, { "aria-label": "Bought from", autocapitalize: "words" });
  // the odometer when you bought it: most cars are bought used
  const boughtKm = numField("optional", "numeric");
  if (pu.km !== null && pu.km !== undefined) boughtKm.value = plainNumber(pu.km);
  const readings = c.logs.filter((l) => l.km !== null).sort(byDateKm);
  const purchaseFooter = footer("");
  const docs = fileGrid(pu.docs, { max: 20, from: "the car details" });
  let saved = false;
  let api = null;

  const read = () => ({ y: parseNumber(year.value), k: parseNumber(kmI.value), m: parseNumber(monthsI.value), r: reg.value.trim() });
  const validate = () => {
    const { y, k, m, r } = read();
    const bad = {
      year: Boolean(year.value.trim()) && !(Number.isInteger(y) && y >= 1900 && y <= 2100),
      km: Boolean(kmI.value.trim()) && !(k > 0),
      months: Boolean(monthsI.value.trim()) && !(m > 0 && m <= 120),
      reg: Boolean(r) && !MONTH_RX.test(r),
      bought: Boolean(bought.value) && !DATE_RX.test(bought.value),
      price: Boolean(priceI.value.trim()) && !(parseNumber(priceI.value) > 0),
      boughtKm: Boolean(boughtKm.value.trim()) && !(parseNumber(boughtKm.value) >= 0),
    };
    priceI.classList.toggle("invalid", bad.price);
    boughtKm.classList.toggle("invalid", bad.boughtKm);
    // the odometer then: before your first log, and how far you've driven since
    const bk = bad.boughtKm || !boughtKm.value.trim() ? null : parseNumber(boughtKm.value);
    const first = readings[0], last = readings.at(-1);
    purchaseFooter.className = "section-footer";
    if (bk !== null && first && bk > first.km) {
      purchaseFooter.textContent = `That's more than the ${fmtKm(first.km)} of your first log (${dayText(first.date, ctx.today)}). Check the number.`;
      purchaseFooter.className = "section-footer tone-text-warn";
    } else if (bk !== null && last) purchaseFooter.textContent = `You've driven ${fmtKm(last.km - bk)} in it since you bought it.`;
    else purchaseFooter.textContent = "The odometer when you bought the car, from the contract or the ad.";
    year.classList.toggle("invalid", bad.year);
    kmI.classList.toggle("invalid", bad.km);
    monthsI.classList.toggle("invalid", bad.months);
    reg.classList.toggle("invalid", bad.reg);
    api?.setRight({ disabled: Object.values(bad).some(Boolean) });
  };
  for (const f of [year, kmI, monthsI, reg, bought, priceI, boughtKm]) f.addEventListener("input", validate);
  bought.addEventListener("change", validate);
  reg.addEventListener("change", validate);

  const others = ctx.data.cars.length - (isNew ? 0 : 1);
  const body = h("div", { class: "form" },
    caption("CAR"),
    group(row("Make", make), row("Model", model), row("Model year", year), row("Registration", plate), fuelRow),
    footer("Runs on decides which fuel price the Charts tab shows, and whether you log litres or kWh."),
    group(row("Name", name)),
    footer("A nickname for the title of the Car page. Leave it empty to use the make and model."),
    caption("FIRST REGISTERED"),
    group(row("In traffic since", reg)),
    footer("The month the car was registered for the first time (i trafik första gång), from the registration certificate. The first inspection is due 36 months after it and the second 24 months after the first."),
    caption("SERVICE EVERY"),
    group(row("Kilometres", kmI, "km"), row("or months", monthsI, "months")),
    footer("From your service book, e.g. every 15 000 km or 12 months, whichever comes first. Fill in one or both to get a reminder on the Car page."),
    caption("PURCHASE"),
    group(h("label", { class: "form-row" }, h("span", { class: "form-label" }, "Bought on"), bought), row("Price", priceI, localSym()),
      row("Odometer", boughtKm, "km"), row("Bought from", seller)),
    purchaseFooter,
    caption("INVOICE AND PAPERS"),
    docs.el,
    footer("The purchase invoice, the contract (köpekontrakt) or other papers, as photos or PDFs. With Google Drive they're saved in your Savings Tracker folder, next to your data; otherwise on this device. The price isn't counted in the running costs."),
    !isNew ? h("button", { type: "button", class: "btn destructive-row", onclick: () => remove() }, "Delete Car") : null);

  async function remove() {
    const n = c.logs.length;
    const ok = await alertBox({ title: `Delete ${carTitle(c)}?`,
      message: `${n ? `Its ${plural(n, "log")} will be deleted too. ` : ""}This can't be undone.${others ? "" : " You can add a car again any time."}`,
      buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Delete", value: true, style: "destructive" }] });
    if (!ok) return;
    if (store.pref(PREF, null) === c.id) store.setPref(PREF, null);
    for (const l of c.logs) removePhotos(store, l.photos);
    saved = true;
    removePhotos(store, pu.docs.concat(docs.list().filter((p) => docs.isAdded(p.id))));
    store.deleteCar(c.id);
    api.close();
    toast(`Deleted ${carTitle(c)}`);
    syncTap();
  }

  api = sheet({ title: isNew ? "New Car" : "Car Details", left: { text: "Cancel" }, body, onClose: () => docs.close(saved),
    right: { text: "Save", bold: true, onClick: (sh) => {
      const { y, k, m, r } = read();
      const next = { ...c, name: name.value.trim(), make: make.value.trim(), model: model.value.trim(),
        year: Number.isInteger(y) ? y : null, plate: plate.value.trim(), fuel, first_registered: MONTH_RX.test(r) ? r : null,
        service_km: k > 0 ? k : null, service_months: m > 0 ? Math.round(m) : null,
        purchase: { date: DATE_RX.test(bought.value) ? bought.value : null, price: parseNumber(priceI.value) > 0 ? parseNumber(priceI.value) : null,
          km: boughtKm.value.trim() && parseNumber(boughtKm.value) >= 0 ? Math.round(parseNumber(boughtKm.value)) : null,
          seller: seller.value.trim(), docs: docs.list() } };
      saved = true;
      removePhotos(store, docs.removed);
      if (isNew) store.setPref(PREF, c.id);
      store.saveCar(next);
      sh.close();
      if (isNew) setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);   // show the new car from the top
      toast(isNew ? `✓  Added ${carTitle(next)}` : "✓  Saved the car details");
      syncTap();
    } } });
  validate();
  if (isNew && matchMedia("(pointer: fine)").matches) setTimeout(() => make.focus(), 350);
  return api;
}
