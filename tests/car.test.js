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
const log = (date, type, o = {}) => ({ id: `t${++n}`, date, type, km: null, cost: null, litres: null, tires: null, note: "", ...o });

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

test("fuel use assumes a full tank each time", () => {
  const f = car.fuelStats(LOGS);
  close(f.per100, (60 + 66) / 2000 * 100);                // 6.3 l/100 km
  close(f.price, 3320 / 166);                             // 20 kr a litre
  close(f.cost100, 6.3 * 20);
  close(f.perFill.get(LOGS[1].id), 6.0);
  close(f.perFill.get(LOGS[3].id), 6.6);
});

test("a refuel without litres is skipped, not counted as zero", () => {
  const logs = [log("2026-01-01", "fuel", { km: 1000, litres: 50 }), log("2026-01-10", "fuel", { km: 1500 }),
    log("2026-01-20", "fuel", { km: 2000, litres: 30 })];
  close(car.fuelStats(logs).per100, 6.0);                 // only 1 500 -> 2 000: 30 l on 500 km
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
});

test("data file: older files without a car get an empty one, and it survives a round trip", () => {
  const old = normalize({ entries: [] });
  assert.deepEqual(old.car, car.emptyCar());
  let d = emptyData();
  d = applyOp(d, { type: "putCarLog", log: LOGS[1] });
  d = applyOp(d, { type: "putCarLog", log: LOGS[0] });
  d = applyOp(d, { type: "putCarLog", log: { ...LOGS[1], km: 11111 } });     // edit: same id
  d = applyOp(d, { type: "setCar", fields: { name: "Volvo", service_km: 20000 } });
  assert.deepEqual(d.car.logs.map((l) => l.km), [10000, 11111]);
  assert.equal(d.car.name, "Volvo");
  d = applyOp(d, { type: "deleteCarLog", id: LOGS[0].id });
  assert.equal(d.car.logs.length, 1);
  const again = normalize(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(again.car, d.car);
});

test("CSV export", () => {
  const csv = car.carCsv([log("2026-04-01", "tires", { km: 12000, cost: 600, tires: "summer", note: "Changed, \"rims\"" })]);
  const lines = csv.replace("﻿", "").split("\r\n");
  assert.equal(lines[0], "Date,Type,Odometer (km),Cost (SEK),Litres,Tyres put on,Note");
  assert.equal(lines[1], '2026-04-01,Tyre change,12000,600,,Summer,"Changed, ""rims"""');
});
