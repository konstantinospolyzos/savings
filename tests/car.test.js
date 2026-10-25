// Tests for the car monitor (js/car.js) and its changes in the data file (js/store.js).
// Every expected number is worked out by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as car from "../js/car.js";
import { normalize, applyOp, emptyData } from "../js/store.js";
import { configure, day, isoDay, mIndex } from "../js/core.js";

const close = (actual, expected, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ≈ ${expected}, got ${actual}`);
const NBSP = " ";
let n = 0;
const log = (date, type, o = {}) => ({ id: `t${++n}`, date, type, km: null, cost: null, litres: null,
  full: type === "fuel" ? true : null, tires: null, fitted: type === "tyre_buy" ? true : null, note: "", photos: [], ...o });

// Jan 1 -> Jan 31 is 30 days, Jan 31 -> Mar 2 is 30 days (February 2026 has 28)
const LOGS = [
  log("2026-01-01", "fuel", { km: 10000, litres: 40, cost: 800 }),
  log("2026-01-31", "fuel", { km: 11000, litres: 60, cost: 1200 }),    // 60 l on 1 000 km = 6.0
  log("2026-03-02", "service", { km: 12000, cost: 3000 }),
  log("2026-03-02", "fuel", { km: 12000, litres: 66, cost: 1320 }),    // 66 l on 1 000 km = 6.6
];

test.beforeEach(() => configure({ settings: {} }));

// ---------------------------------------------------------------------------
test("odometer between readings is a straight line, held outside them", () => {
  const pts = car.odoPoints(LOGS);
  assert.equal(pts.length, 3);                           // the service and refuel on 2 March are one reading
  close(car.odometerAt(pts, day(2026, 1, 16).getTime()), 10500);
  assert.equal(car.odometerAt(pts, day(2025, 12, 1).getTime()), 10000);
  assert.equal(car.odometerAt(pts, day(2026, 6, 1).getTime()), 12000);
});

test("kilometres per month, estimated between readings", () => {
  const m = car.monthlyKm(car.odoPoints(LOGS));
  assert.deepEqual(m.map((x) => x.month), ["2026-01", "2026-02", "2026-03"]);
  close(m[0].km, 1000 + 1000 / 30);                       // to 1 Feb: 1 day into the next stretch
  close(m[1].km, 1000 * 28 / 30);                         // 1 Feb -> 1 Mar
  close(m[2].km, 1000 / 30);                              // 1 Mar -> 2 Mar, the last reading
  assert.equal(m[2].until, "2026-03-02");
  assert.equal(m[0].from, null);
  close(m.reduce((a, x) => a + x.km, 0), 2000);
});

test("real fuel use and fuel cost per km, full tank to full tank", () => {
  const f = car.fuelStats(LOGS);
  close(f.per100, (60 + 66) / 2000 * 100);                // 6.3 l/100 km
  close(f.per_km, (1200 + 1320) / 2000);                  // 1.26 kr/km: the first full tank only starts the count
  close(f.price, 3320 / 166);                             // 20 kr a litre
  close(f.cost100, 6.3 * 20);
  const a = f.perFill.get(LOGS[1].id), b = f.perFill.get(LOGS[3].id);
  close(a.per100, 6.0);
  close(a.per_km, 1.2);
  assert.equal(a.km, 1000);
  assert.equal(a.from, "2026-01-01");
  close(b.per100, 6.6);
  close(b.per_km, 1.32);
  assert.equal(f.perFill.has(LOGS[0].id), false);
  assert.equal(f.best.id, LOGS[1].id);
  assert.equal(f.worst.id, LOGS[3].id);
  assert.equal(f.latest.id, LOGS[3].id);
});

test("a top-up counts at the next full tank", () => {
  const logs = [log("2026-01-01", "fuel", { km: 10000, litres: 40, cost: 800 }),
    log("2026-01-08", "fuel", { km: 10300, litres: 20, cost: 400, full: false }),   // topped up
    log("2026-01-15", "fuel", { km: 10600, litres: 25, cost: 500 })];
  const f = car.fuelStats(logs);
  const seg = f.perFill.get(logs[2].id);
  close(seg.per100, 45 / 600 * 100);                      // 7.5 l/100 km over both (without the switch: 6.7 and 8.3)
  close(seg.per_km, 900 / 600);                           // 1.50 kr/km
  assert.equal(seg.topups, 1);
  assert.equal(f.perFill.has(logs[1].id), false);
});

test("a refuel without a price still gives the consumption", () => {
  const logs = [log("2026-01-01", "fuel", { km: 10000, litres: 40, cost: 800 }), log("2026-01-15", "fuel", { km: 10600, litres: 36 })];
  const seg = car.fuelStats(logs).perFill.get(logs[1].id);
  close(seg.per100, 6.0);
  assert.equal(seg.per_km, null);
});

test("consumption: last 12 months, winter and summer", () => {
  const logs = [log("2025-06-01", "fuel", { km: 0, litres: 40 }), log("2025-07-01", "fuel", { km: 1000, litres: 80 }),   // old: 8.0
    log("2026-01-10", "fuel", { km: 2000, litres: 70 }), log("2026-02-10", "fuel", { km: 3000, litres: 70 }),           // winter 7.0
    log("2026-06-10", "fuel", { km: 4000, litres: 55 }), log("2026-07-10", "fuel", { km: 5000, litres: 55 })];          // summer 5.5
  const f = car.fuelStats(logs, day(2026, 10, 24));
  assert.equal(f.recent.n, 4);
  close(f.recent.per100, (70 + 70 + 55 + 55) / 4000 * 100);
  close(f.all.per100, (80 + 70 + 70 + 55 + 55) / 5000 * 100);
  close(f.winter.per100, 7.0);
  close(f.summer.per100, (80 + 55 + 55) / 3000 * 100);
});

test("the refuel being typed in shows its consumption before saving", () => {
  const p = car.fillPreview(LOGS, { date: "2026-03-20", km: 12500, litres: 35, cost: 700, full: true });
  close(p.per100, 7.0);                                   // 35 l on the 500 km since 2 March
  close(p.per_km, 1.4);
  assert.equal(car.fillPreview(LOGS, { date: "2026-03-20", km: 12500, litres: 35, full: false }), null);
  close(car.fillPreview(LOGS, { ...LOGS[3], litres: 70 }, LOGS[3].id).per100, 7.0);   // editing the 2 March refuel
});

test("a refuel without litres is skipped, not counted as zero", () => {
  const logs = [log("2026-01-01", "fuel", { km: 1000, litres: 50 }), log("2026-01-10", "fuel", { km: 1500 }),
    log("2026-01-20", "fuel", { km: 2000, litres: 30 })];
  close(car.fuelStats(logs).per100, 6.0);                 // only 1 500 -> 2 000: 30 l on 500 km
  assert.equal(car.fuelStats(logs).segments.length, 1);
});

// ---------------------------------------------------------------------------
test("summary: driving, costs per month and per km", () => {
  const s = car.carSummary({ ...car.emptyCar(), logs: LOGS }, day(2026, 3, 10));
  assert.equal(s.latest.km, 12000);
  assert.equal(s.driven_total, 2000);
  close(s.per_day, 2000 / 60);
  close(s.per_month, 2000 / 60 * 30.4375);
  close(s.this_year, 2000);
  assert.equal(s.this_year_from, null);                   // first reading is 1 January
  const months = 68 / 30.4375;                            // 1 Jan -> 10 Mar
  close(s.costs, 6320);
  close(s.cost_per_month, 6320 / months);
  close(s.cost_per_km, 6320 / 2000);
  close(s.cost_per_km_ex_fuel, 3000 / 2000);
  assert.equal(s.by_type.fuel, 3320);
  assert.equal(s.by_type.service, 3000);
  assert.deepEqual(s.years.map((y) => [y.year, Math.round(y.km), y.costs]), [[2026, 2000, 6320]]);
});

test("summary: only the last 12 months count for the averages", () => {
  const logs = [log("2024-01-01", "fuel", { km: 0, cost: 99999 }), log("2025-10-24", "fuel", { km: 20000 }),
    log("2026-10-24", "fuel", { km: 32000, cost: 1200 })];
  const s = car.carSummary({ ...car.emptyCar(), logs }, day(2026, 10, 24));
  close(s.per_year, 12000 / 365 * 365.25, 0.5);
  close(s.costs, 1200);                                   // the 2024 cost is outside the window
  close(s.cost_per_km, 0.1);
  assert.equal(s.costs_full_year, true);
});

test("summary: nothing logged yet", () => {
  const s = car.carSummary(car.emptyCar(), day(2026, 10, 24));
  assert.equal(s.latest, null);
  assert.equal(s.per_month, null);
  assert.equal(s.cost_per_month, null);
  assert.equal(s.tyres.on, null);
});

// ---------------------------------------------------------------------------
const tyres = (set, y, m, d) => car.tyreStatus([log("2026-04-01", "tires", { km: 12000, tires: set })], day(y, m, d), 15000);

test("tyres: summer tyres in autumn and winter", () => {
  const oct = tyres("summer", 2026, 10, 24);
  assert.equal(oct.tone, "warn");
  assert.equal(oct.deadline, "2026-12-01");
  assert.equal(oct.days_left, 38);
  assert.equal(oct.km_on, 3000);
  assert.equal(tyres("summer", 2026, 12, 5).tone, "down");
  assert.equal(tyres("summer", 2027, 3, 31).tone, "down");
  assert.equal(tyres("summer", 2026, 9, 30).tone, "up");
  assert.equal(tyres("summer", 2026, 6, 1).tone, "up");
});

test("tyres: studs from 1 October to 15 April", () => {
  const apr = tyres("studded", 2027, 4, 10);
  assert.equal(apr.tone, "warn");
  assert.equal(apr.days_left, 5);
  assert.equal(tyres("studded", 2027, 4, 16).tone, "down");
  assert.equal(tyres("studded", 2026, 9, 30).tone, "down");
  assert.equal(tyres("studded", 2026, 10, 1).tone, "up");
  assert.equal(tyres("studded", 2027, 3, 31).tone, "up");
});

test("tyres: non-studded winter tyres are legal all year", () => {
  assert.equal(tyres("winter", 2026, 5, 1).tone, "warn");
  assert.equal(tyres("winter", 2026, 1, 15).tone, "up");
  assert.equal(car.tyreStatus([], day(2026, 10, 24)).tone, "flat");
});

// ---------------------------------------------------------------------------
test("service: due by kilometres or by months, whichever is set", () => {
  const c = { ...car.emptyCar(), service_km: 15000, service_months: 12,
    logs: [log("2026-03-02", "service", { km: 12000 })] };
  const s = car.serviceStatus(c, day(2026, 10, 24), 25500, 50);
  assert.equal(s.due_km, 27000);
  assert.equal(s.km_left, 1500);
  assert.equal(isoDay(s.eta), "2026-11-23");              // 1 500 km at 50 km a day = 30 days
  assert.equal(s.due_date, "2027-03-02");
  assert.equal(s.tone, "warn");
  assert.equal(car.serviceStatus(c, day(2026, 10, 24), 27500, 50).tone, "down");
  assert.equal(car.serviceStatus(c, day(2026, 10, 24), 15000, 50).tone, "up");
  assert.equal(car.serviceStatus({ ...c, service_km: null, service_months: null }, day(2026, 10, 24), 15000).tone, "flat");
});

test("month arithmetic on days", () => {
  assert.equal(car.addMonthsToDay("2026-01-31", 1), "2026-02-28");
  assert.equal(car.addMonthsToDay("2028-01-31", 1), "2028-02-29");
  assert.equal(car.addMonthsToDay("2026-11-15", 3), "2027-02-15");
  close(car.monthPos("2026-10-16"), mIndex("2026-10") + 15 / 31, 1e-9);
});

test("the reading before a date", () => {
  assert.equal(car.previousReading(LOGS, "2026-02-15").id, LOGS[1].id);
  assert.equal(car.previousReading(LOGS, "2026-03-02", LOGS[3].id).id, LOGS[2].id);
  assert.equal(car.previousReading(LOGS, "2025-12-31"), null);
});

test("formatting", () => {
  assert.equal(car.fmtKm(45210), `45${NBSP}210${NBSP}km`);
  assert.equal(car.fmtKmSigned(-120), `−120${NBSP}km`);
  assert.equal(car.fmtPerKm(2.345), `2.35${NBSP}kr/km`);
  assert.equal(car.fmtAxisKm(45500), "45.5k");
  assert.equal(car.fmtAxisKm(46000), "46k");
  assert.equal(car.fmtAxisKm(800), "800");
});

// ---------------------------------------------------------------------------
test("data file: car logs are checked and tidied", () => {
  const c = car.normalizeCar({ name: "V60", service_km: "15000", logs: [
    { id: "a", date: "2026-02-30", type: "fuel", km: 1 },               // no such day
    { id: "b", date: "2026-03-01", type: "boat", km: -5, cost: 100 },   // unknown type, negative km
    { id: "b", date: "2026-03-02", type: "service", km: 900, litres: 40, tires: "summer" },
    { date: "2026-01-01", type: "tires", km: 800, tires: "studded" },
  ] });
  assert.equal(c.name, "V60");
  assert.equal(c.service_km, 15000);
  assert.deepEqual(c.logs.map((l) => [l.date, l.type, l.km]), [["2026-01-01", "tires", 800], ["2026-03-01", "other", null], ["2026-03-02", "service", 900]]);
  assert.equal(new Set(c.logs.map((l) => l.id)).size, 3);              // ids made unique
  assert.equal(c.logs[2].litres, null);                                 // litres only on refuels
  assert.equal(c.logs[2].tires, null);                                  // tyres only on tyre changes
  assert.equal(c.logs[0].tires, "studded");
  assert.equal(c.logs[0].full, null);                                   // only refuels have the full-tank switch
  const fills = car.normalizeCar({ logs: [{ date: "2026-01-01", type: "fuel", km: 1 }, { date: "2026-01-02", type: "fuel", km: 2, full: false }] }).logs;
  assert.deepEqual(fills.map((l) => l.full), [true, false]);             // older refuels count as full tanks
});

test("data file: the one car of the first version moves into the list of cars", () => {
  const old = normalize({ entries: [], car: { name: "V60", service_km: 15000, logs: [LOGS[0], LOGS[1]] } });
  assert.equal(old.cars.length, 1);
  assert.equal(old.cars[0].id, car.LEGACY_CAR_ID);                       // the same id on every device
  assert.equal(old.cars[0].name, "V60");
  assert.equal(old.cars[0].logs.length, 2);
  assert.equal(old.car, undefined);
  assert.deepEqual(normalize({ entries: [], car: { name: "", logs: [] } }).cars, []);   // nothing to keep
  assert.deepEqual(normalize({ entries: [] }).cars, []);
});

test("data file: cars and their logs survive a round trip", () => {
  let d = emptyData();
  const a = { ...car.emptyCar("car-a"), make: "Volvo", model: "V60", plate: "abc  123", year: 2019, first_registered: "2019-05-14" };
  d = applyOp(d, { type: "putCar", car: a });
  d = applyOp(d, { type: "putCar", car: car.emptyCar("car-b") });
  d = applyOp(d, { type: "putCarLog", carId: "car-a", log: LOGS[1] });
  d = applyOp(d, { type: "putCarLog", carId: "car-a", log: LOGS[0] });
  d = applyOp(d, { type: "putCarLog", carId: "car-a", log: { ...LOGS[1], km: 11111 } });   // edit: same id
  d = applyOp(d, { type: "putCarLog", carId: "car-b", log: LOGS[2] });
  d = applyOp(d, { type: "putCar", car: { ...a, name: "The Volvo", logs: undefined } });   // details change, logs stay
  const va = d.cars.find((c) => c.id === "car-a");
  assert.deepEqual(va.logs.map((l) => l.km), [10000, 11111]);
  assert.equal(va.name, "The Volvo");
  assert.equal(va.plate, "ABC 123");
  assert.equal(va.first_registered, "2019-05");
  assert.equal(d.cars.find((c) => c.id === "car-b").logs.length, 1);
  d = applyOp(d, { type: "deleteCarLog", carId: "car-a", id: LOGS[0].id });
  assert.equal(va.logs.length, 2);                                          // applyOp works on a copy
  assert.equal(d.cars.find((c) => c.id === "car-a").logs.length, 1);
  const again = normalize(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(again.cars, d.cars);
  d = applyOp(d, { type: "deleteCar", id: "car-b" });
  assert.deepEqual(d.cars.map((c) => c.id), ["car-a"]);
});

test("data file: changes queued by the first version still land", () => {
  let d = emptyData();
  d = applyOp(d, { type: "putCarLog", log: LOGS[0] });                   // no car named: the first car
  d = applyOp(d, { type: "setCar", fields: { service_km: 20000 } });
  assert.equal(d.cars.length, 1);
  assert.equal(d.cars[0].id, car.LEGACY_CAR_ID);
  assert.equal(d.cars[0].service_km, 20000);
  d = applyOp(d, { type: "deleteCarLog", id: LOGS[0].id });
  assert.equal(d.cars[0].logs.length, 0);
});

test("car names and words", () => {
  assert.equal(car.carTitle({ name: "", make: "Volvo", model: "V60" }), "Volvo V60");
  assert.equal(car.carTitle({ name: "The Volvo", make: "Volvo", model: "V60" }), "The Volvo");
  assert.equal(car.carTitle({ name: "", make: "", model: "" }), "Car");
  assert.equal(car.carLine({ name: "The Volvo", make: "Volvo", model: "V60", year: 2019, plate: "ABC 123" }),
    "Volvo V60  ·  2019  ·  ABC 123");
  assert.equal(car.energy({ fuel: "diesel" }).priceKey, "diesel");
  assert.equal(car.energy({ fuel: "hybrid" }).priceKey, "95");
  assert.equal(car.energy({ fuel: "electric" }).unit, "kWh");
  assert.equal(car.energy({ fuel: "electric" }).priceKey, null);
});

// ---------------------------------------------------------------------------
const insp = (o, logs = []) => car.inspectionStatus({ ...car.emptyCar(), ...o, logs }, day(2026, 10, 24));

test("inspection: 36 months after first registration, then 24, then 14", () => {
  const first = insp({ first_registered: "2024-02" });
  assert.equal(first.rule, "first");
  assert.equal(first.due, "2027-02-28");                                  // last day of Feb 2027
  const second = insp({ first_registered: "2023-03" }, [log("2026-03-10", "inspection")]);
  assert.equal(second.rule, "second");
  assert.equal(second.due, "2028-03-31");
  const later = insp({ first_registered: "2018-06" }, [log("2025-05-02", "inspection"), log("2026-04-20", "inspection")]);
  assert.equal(later.rule, "later");
  assert.equal(later.due_month, "2027-06");                               // April 2026 + 14 months
  assert.equal(later.due, "2027-06-30");
  assert.equal(later.tone, "up");
});

test("inspection: without the registration month, the 14-month rule; overdue and soon", () => {
  const s = insp({}, [log("2025-08-15", "inspection")]);
  assert.equal(s.rule, "later");
  assert.equal(s.due, "2026-10-31");
  assert.equal(s.days_left, 7);
  assert.equal(s.tone, "warn");
  assert.equal(insp({}, [log("2025-07-15", "inspection")]).tone, "down");   // due 30 Sep 2026
  assert.equal(insp({}).known, false);
  assert.equal(insp({ first_registered: "2019-01" }).needs, "last");      // older than 3 years, no inspection logged
});

test("tyre dates around the year", () => {
  const at = (m, d) => car.tyreDates(day(2026, m, d));
  const oct = at(10, 24);
  assert.equal(oct.winter_from, "2026-12-01");
  assert.equal(oct.winter_days, 38);
  assert.equal(oct.summer_from, "2027-04-01");
  assert.equal(oct.studs_now, true);
  assert.equal(oct.studs_until, "2027-04-15");
  const jan = at(1, 10);
  assert.equal(jan.winter_now, true);
  assert.equal(jan.winter_until, "2026-03-31");
  assert.equal(jan.summer_from, "2026-04-01");
  assert.equal(jan.studs_until, "2026-04-15");
  const apr = at(4, 10);
  assert.equal(apr.summer_now, true);
  assert.equal(apr.studs_now, true);
  assert.equal(apr.studs_days, 5);
  const jun = at(6, 1);
  assert.equal(jun.studs_now, false);
  assert.equal(jun.studs_from, "2026-10-01");
  assert.equal(jun.winter_from, "2026-12-01");
});

// ---------------------------------------------------------------------------
const SERIES = [["2025-10-20", 17.5], ["2026-10-05", 17.88], ["2026-10-12", 18.95], ["2026-10-19", 18.21]];

test("fuel price of the week a day falls in", () => {
  assert.deepEqual(car.weekPrice(SERIES, "2026-10-14"), ["2026-10-12", 18.95]);
  assert.deepEqual(car.weekPrice(SERIES, "2026-10-19"), ["2026-10-19", 18.21]);
  assert.deepEqual(car.weekPrice(SERIES, "2026-11-01"), ["2026-10-19", 18.21]);   // 13 days old: still fine
  assert.equal(car.weekPrice(SERIES, "2026-11-02"), null);                         // too old
  assert.equal(car.weekPrice(SERIES, "2025-01-01"), null);
});

test("fuel price summary and what you paid", () => {
  const s = car.priceSummary(SERIES, day(2026, 10, 24));
  close(s.change_week, 18.21 - 18.95);
  close(s.change_year, 18.21 - 17.5);
  assert.equal(s.low, 17.88);                                            // 20 Oct 2025 is 369 days back: outside the last 12 months
  assert.equal(s.high, 18.95);
  const paid = car.paidPrices([log("2026-10-14", "fuel", { km: 1, litres: 40, cost: 760 }), log("2026-10-15", "fuel", { km: 2, litres: 40 })], SERIES);
  assert.equal(paid.length, 1);
  close(paid[0].price, 19);
  assert.deepEqual(paid[0].week, ["2026-10-12", 18.95]);
});

test("CSV export", () => {
  const csv = car.carCsv([log("2026-04-01", "tires", { km: 12000, cost: 600, tires: "summer", note: "Changed, \"rims\"" }),
    log("2026-04-02", "fuel", { km: 12000, litres: 40, cost: 760 }), log("2026-04-20", "fuel", { km: 12600, litres: 39, cost: 741 })]);
  const lines = csv.replace("\uFEFF", "").split("\r\n");
  assert.equal(lines[0], "Date,Type,Odometer (km),Cost (SEK),Litres,Price per litre (SEK),Full tank,l/100 km,Fuel cost per km (SEK),Tyre set,Note");
  assert.equal(lines[1], '2026-04-01,Tyre change,12000,600,,,,,,Summer,"Changed, ""rims"""');
  assert.equal(lines[3], "2026-04-20,Refuel,12600,741,39,19,yes,6.5,1.24,,");
});

// ---------------------------------------------------------------------------
test("consumption by calendar month, all years together", () => {
  const segs = [{ to: "2025-01-20", km: 500, litres: 37.5 }, { to: "2026-01-10", km: 500, litres: 32.5 }, { to: "2026-07-01", km: 800, litres: 44 }];
  const m = car.consumptionByMonth(segs);
  assert.equal(m.length, 12);
  close(m[0].per100, 70 / 1000 * 100);                    // January: both years, 7.0
  assert.equal(m[0].n, 2);
  close(m[6].per100, 5.5);
  assert.equal(m[3].per100, null);
});

test("this year so far, and where it lands on 31 December", () => {
  const logs = [log("2025-10-01", "fuel", { km: 10000, litres: 40, cost: 800 }),
    log("2026-01-01", "fuel", { km: 13000, litres: 60, cost: 1200 }),     // 3 000 km in 92 days
    log("2026-03-01", "service", { km: 15000, cost: 3000 }),
    log("2026-04-01", "fuel", { km: 16000, litres: 60, cost: 1200 })];    // 60 l on 3 000 km: 0.40 kr/km
  const s = car.carSummary({ ...car.emptyCar(), logs }, day(2026, 4, 1));
  const f = car.yearForecast(s, day(2026, 4, 1));
  assert.equal(f.year, 2026);
  assert.equal(f.days_left, 274);
  close(f.km, 3000);
  close(f.km_end, 3000 + s.per_day * 274);
  close(f.fuel, 2400);
  close(f.fuel_end, 2400 + s.per_day * 274 * 0.4);
  close(f.costs, 5400);
  const other = 3000 / s.costs_months;                     // the service, spread per month
  close(f.costs_end, 5400 + s.per_day * 274 * 0.4 + other * 274 / 30.4375);
  assert.equal(f.last, null);                              // 2025 was only logged from October
});

test("vehicle tax is its own kind of cost", () => {
  const c = car.normalizeCar({ logs: [{ date: "2026-03-10", type: "tax", cost: 1406 }, { date: "2026-03-12", type: "fuel", km: 1, cost: 700 }] });
  assert.equal(c.logs[0].type, "tax");
  assert.equal(c.logs[0].km, null);                                      // no odometer needed
  assert.equal(car.NEEDS_KM.has("tax"), false);
  assert.equal(car.TYPE.tax.costName, "Tax");
  assert.equal(car.costsByType(c.logs).tax, 1406);
  const s = car.carSummary(c, day(2026, 10, 24));
  assert.equal(s.by_type.tax, 1406);
  assert.match(car.carCsv(c.logs), /2026-03-10,Vehicle tax,,1406,/);
});

test("new tyres: their own cost, and a tyre change too when they're fitted right away", () => {
  const logs = [log("2025-11-01", "tires", { km: 10000, cost: 500, tires: "studded" }),
    log("2026-04-10", "tires", { km: 12000, cost: 700, tires: "summer" }),
    log("2026-10-20", "tyre_buy", { km: 15000, cost: 8000, tires: "studded" })];
  const t = car.tyreStatus(logs, day(2026, 10, 24), 15100);
  assert.equal(t.on, "studded");                                         // bought and fitted: they're on now
  assert.equal(t.last.type, "tyre_buy");
  assert.equal(t.changes.length, 3);
  assert.equal(t.km_on, 100);
  assert.equal(t.avg_cost, 600);                                          // a swap costs 600; the tyres aren't in it
  assert.equal(t.priced_changes, 2);
  // bought for later: the summer tyres are still on, and it isn't a change
  const later = car.tyreStatus([...logs.slice(0, 2), { ...logs[2], fitted: false, km: null }], day(2026, 10, 24), 15100);
  assert.equal(later.on, "summer");
  assert.equal(later.changes.length, 2);
  assert.equal(later.tone, "warn");                                       // still time for winter tyres
  const by = car.costsByType(logs);
  assert.equal(by.tyre_buy, 8000);
  assert.equal(by.tires, 1200);
  assert.equal(car.TYPE.tyre_buy.costName, "New tyres");
  assert.equal(car.NEEDS_KM.has("tyre_buy"), false);                     // the odometer only when they're fitted
});

test("data file: new tyres keep which set and whether they were fitted", () => {
  const c = car.normalizeCar({ logs: [
    { id: "a", date: "2026-10-20", type: "tyre_buy", km: 15000, cost: 8000, tires: "winter" },
    { id: "b", date: "2026-10-21", type: "tyre_buy", cost: 7000, tires: "studded", fitted: false },
    { id: "c", date: "2026-10-22", type: "tyre_buy", tires: "slicks", fitted: "yes" },
    { id: "d", date: "2026-10-23", type: "tires", km: 15100, tires: "summer", fitted: false },
  ] });
  assert.deepEqual(c.logs.map((l) => [l.type, l.tires, l.fitted]),
    [["tyre_buy", "winter", true], ["tyre_buy", "studded", false], ["tyre_buy", null, true], ["tires", "summer", null]]);
  assert.deepEqual(normalize(JSON.parse(JSON.stringify({ entries: [], cars: [c] }))).cars[0].logs, c.logs);
  const lines = car.carCsv(c.logs).replace("\uFEFF", "").split("\r\n");
  assert.equal(lines[1], '2026-10-20,New tyres,15000,8000,,,,,,"Winter, non-studded (fitted)",');
  assert.equal(lines[2], '2026-10-21,New tyres,,7000,,,,,,"Winter, studded (not fitted)",');
});

test("fixed costs: a log on their day every month, from the month they started", () => {
  let d = emptyData();
  d = applyOp(d, { type: "putCar", car: car.emptyCar("c") });
  d = applyOp(d, { type: "putFixed", carId: "c", item: { id: "ins", type: "insurance", name: "Folksam", amount: 787, day: 1, from: "2025-03" } });
  d = applyOp(d, { type: "putFixed", carId: "c", item: { id: "park", type: "parking", amount: 863, day: 31, from: "2025-03" } });
  d = applyOp(d, { type: "putCarLog", carId: "c", log: log("2026-10-05", "fuel", { km: 1000, litres: 40, cost: 700 }) });
  const due = car.dueCarFixed(d.cars[0], day(2026, 10, 25));
  assert.equal(due.entries.length, 20 + 19);                             // insurance March 2025 - October 2026; parking to September
  const first = due.entries[0].log;
  assert.deepEqual([first.id, first.date, first.type, first.cost, first.note], ["ins-2025-03", "2025-03-01", "insurance", 787, "Folksam"]);
  assert.equal(due.entries.find((e) => e.item === "park" && e.month === "2026-02").log.date, "2026-02-28");   // the last day
  assert.deepEqual(due.done, { ins: "2026-10", park: "2026-09" });
  d = applyOp(d, { type: "addFixedLogs", carId: "c", entries: due.entries, done: due.done });
  assert.equal(d.cars[0].logs.length, 40);
  assert.equal(car.dueCarFixed(d.cars[0], day(2026, 10, 30)), null);
  assert.equal(car.dueCarFixed(d.cars[0], day(2026, 10, 31)).entries[0].log.id, "park-2026-10");
  assert.equal(car.nextFixedDate(d.cars[0].fixed[0], day(2026, 10, 25)), "2026-11-01");
  assert.equal(car.nextFixedDate(d.cars[0].fixed[1], day(2026, 10, 25)), "2026-10-31");
  // they're ordinary logs, so the costs count them
  const s = car.carSummary(d.cars[0], day(2026, 10, 25));
  assert.equal(s.by_type.insurance, 787 * 12);
  // a deleted log stays deleted, also when another phone adds that month again
  d = applyOp(d, { type: "deleteCarLog", carId: "c", id: "ins-2026-10" });
  assert.equal(car.dueCarFixed(d.cars[0], day(2026, 10, 30)), null);
  d = applyOp(d, { type: "addFixedLogs", carId: "c", entries: due.entries.slice(19, 20), done: due.done });
  assert.equal(d.cars[0].logs.some((l) => l.id === "ins-2026-10"), false);
  // a new price counts from the next log; the months logged don't go back
  d = applyOp(d, { type: "putFixed", carId: "c", item: { ...d.cars[0].fixed[0], amount: 812, added: "2025-01" } });
  assert.deepEqual([d.cars[0].fixed[0].amount, d.cars[0].fixed[0].added], [812, "2026-10"]);
  assert.equal(car.dueCarFixed(d.cars[0], day(2026, 11, 1)).entries[0].log.cost, 812);
  // the car details sheet can't undo them with an older copy of the car
  d = applyOp(d, { type: "putCar", car: { ...car.emptyCar("c"), make: "Volvo", logs: undefined } });
  assert.equal(d.cars[0].fixed.length, 2);
  // stopped: no more logs; the ones it added stay
  d = applyOp(d, { type: "deleteFixed", carId: "c", id: "park" });
  assert.deepEqual(d.cars[0].fixed.map((f) => f.id), ["ins"]);
  assert.equal(d.cars[0].logs.filter((l) => l.type === "parking").length, 19);
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(d))).cars[0], d.cars[0]);
});

test("fixed costs: a start moved earlier fills in the months before", () => {
  const c = { ...car.emptyCar("c"), fixed: [{ id: "ins", type: "insurance", name: "", amount: 787, day: 25, from: "2026-08", added: "2026-10" }] };
  const r = car.dueFixedLogs(c, day(2026, 10, 25), { ...c.fixed[0], from: "2026-05" }, "2026-05", "2026-07");
  assert.deepEqual(r.entries.map((e) => e.log.date), ["2026-05-25", "2026-06-25", "2026-07-25"]);
  let d = applyOp(emptyData(), { type: "putCar", car: c });
  d = applyOp(d, { type: "addFixedLogs", carId: "c", entries: r.entries, done: {}, backfill: true });
  assert.equal(d.cars[0].logs.length, 3);
  assert.equal(d.cars[0].fixed[0].added, "2026-10");
});

test("fixed costs: the cars saved before keep 787 kr insurance and 863 kr parking", () => {
  // no fixed costs yet: from the first log, on the 1st
  const old = car.normalizeCar({ logs: [{ date: "2025-06-14", type: "fuel", km: 1 }, { date: "2025-05-02", type: "service", km: 0 }] });
  assert.deepEqual(old.fixed.map((f) => [f.id, f.type, f.amount, f.day, f.from, f.added]),
    [["fc-insurance", "insurance", 787, 1, "2025-05", null], ["fc-parking", "parking", 863, 1, "2025-05", null]]);
  // the version just before: monthly periods, with the months it logged as "auto-..." logs
  const prev = car.normalizeCar({ monthly: [{ type: "insurance", amount: 787, from: "2025-03", to: "2026-09" }, { type: "insurance", amount: 800, from: "2026-10", to: null },
    { type: "parking", amount: 863, from: "2025-03", to: "2026-01" }], monthly_added: { insurance: "2026-10" },
  logs: [{ id: "auto-insurance-2026-10", date: "2026-10-01", type: "insurance", cost: 800 }] });
  assert.deepEqual(prev.fixed.map((f) => [f.id, f.amount, f.from, f.added]), [["fc-insurance", 800, "2025-03", "2026-10"]]);   // parking had stopped
  assert.equal(car.dueCarFixed(prev, day(2026, 10, 25)), null);
  const again = car.dueCarFixed({ ...prev, fixed: [{ ...prev.fixed[0], added: null }] }, day(2026, 10, 25));
  assert.equal(again.entries.some((e) => e.month === "2026-10"), false);   // its "auto-" log counts
  assert.deepEqual(car.normalizeCar({ fixed: [], logs: [{ date: "2025-06-14", type: "fuel", km: 1 }] }).fixed, []);   // stopped all: stays so
  assert.deepEqual(car.normalizeCar({ logs: [] }).fixed, []);
  assert.deepEqual(car.normalizeFixed([{ type: "fuel", amount: 1, from: "2025-01" }, { type: "parking", amount: -3, from: "2025-01" },
    { type: "parking", amount: 500, from: "Jan" }]), []);
  assert.equal(car.normalizeFixed([{ type: "other", amount: 99, from: "2025-01", day: 45 }])[0].day, 1);
});
