// Tests for js/pump.js: checking what Claude read off a pump photo, and the API calls (with a
// stand-in for the API, so no key or network is needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as pump from "../js/pump.js";

// The six pumps in the photos Konstantinos sent (Shell/Wayne, Circle K and St1/Gilbarco)
const PHOTOS = [
  { total_kr: 737.91, litres: 40.5, price_per_litre: 18.22, other_prices: [] },
  { total_kr: 500.23, litres: 27.35, price_per_litre: 18.29, other_prices: [] },
  { total_kr: 932.85, litres: 49.02, price_per_litre: 19.03, other_prices: [] },
  { total_kr: 897.68, litres: 48.03, price_per_litre: 18.69,
    other_prices: [{ label: "95", price: 18.69 }, { label: "V-Power", price: 19.94 }, { label: "E85", price: 14.89 }, { label: "Diesel", price: 18.45 }] },
  { total_kr: 1255.69, litres: 78.53, price_per_litre: 15.99,
    other_prices: [{ label: "95 miles", price: 15.99 }, { label: "98 miles+", price: 17.39 }, { label: "D miles+", price: 17.23 }, { label: "D miles", price: 16.64 }] },
  { total_kr: 200.06, litres: 14, price_per_litre: 14.29, other_prices: [{ label: "95 miles", price: 14.29 }, { label: "D miles", price: 16.04 }] },
];
const reading = (o) => ({ found: true, fuel: "95", other_prices: [], ...o });

test("all six pumps add up: litres × price = amount", () => {
  for (const p of PHOTOS) {
    const r = pump.checkReading(reading(p));
    assert.equal(r.ok, true, JSON.stringify(p));
    assert.equal(r.verified, true);
    assert.equal(r.how, "read");
    assert.equal(r.total, p.total_kr);
  }
});

test("a missed decimal separator is put back", () => {
  const r = pump.checkReading(reading({ total_kr: 737.91, litres: 4050, price_per_litre: 18.22 }));   // "40,50" read as 4050
  assert.equal(r.how, "decimal");
  assert.equal(r.fixed, "litres");
  assert.equal(r.litres, 40.5);
  const t = pump.checkReading(reading({ total_kr: 89768, litres: 48.03, price_per_litre: 18.69 }));
  assert.equal(t.total, 897.68);
  const p = pump.checkReading(reading({ total_kr: 200.06, litres: 14, price_per_litre: 1429 }));
  assert.equal(p.price, 14.29);
});

test("another fuel's price on the same pump is swapped for the right one", () => {
  const p = PHOTOS[4];
  const r = pump.checkReading(reading({ ...p, price_per_litre: 17.39 }));   // picked the 98 window
  assert.equal(r.how, "other-price");
  assert.equal(r.price, 15.99);
});

test("one number missing is worked out, but flagged as not checked", () => {
  const r = pump.checkReading(reading({ total_kr: 0, litres: 40.5, price_per_litre: 18.22 }));
  assert.equal(r.total, 737.91);
  assert.equal(r.ok, true);
  assert.equal(r.verified, false);
  assert.equal(pump.checkReading(reading({ total_kr: 932.85, litres: 49.02, price_per_litre: 0 })).price, 19.03);
});

test("a wrong digit is caught, not saved", () => {
  const r = pump.checkReading(reading({ total_kr: 737.91, litres: 40.5, price_per_litre: 18.72 }));   // 2 read as 7
  assert.equal(r.ok, false);
  assert.equal(r.how, "mismatch");
  assert.equal(pump.checkReading(reading({ total_kr: 0, litres: 0, price_per_litre: 18.22 })).ok, false);
  assert.equal(pump.checkReading(null).ok, false);
});

test("the request: fast model, the photo, JSON answer", () => {
  const b = pump.buildRequest(pump.FAST_MODEL, "AAAA");
  assert.equal(b.model, "claude-haiku-5-5");
  assert.deepEqual(b.thinking, { type: "disabled" });
  assert.equal(b.output_config.format.type, "json_schema");
  assert.equal(b.output_config.format.schema.additionalProperties, false);
  assert.deepEqual(b.messages[0].content[0], { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
  assert.equal(b.temperature, undefined);
  const again = pump.buildRequest(pump.CAREFUL_MODEL, "AAAA", { total_kr: 737.91, litres: 40.5, price_per_litre: 18.72 });
  assert.equal(again.model, "claude-sonnet-5-5");
  assert.equal(again.thinking, undefined);                       // adaptive thinking for the careful look
  assert.match(again.messages[0].content[1].text, /40\.5 × 18\.72 = 758\.16/);
});

// a stand-in for the API: answers with the readings given, in turn, and remembers the requests
function fakeApi(...answers) {
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a instanceof Error) throw a;
    if (a.status) return { ok: false, status: a.status, json: async () => ({ type: "error", error: { type: "x", message: a.message || "" } }) };
    return { ok: true, status: 200, json: async () => ({ type: "message", role: "assistant", stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(a) }] }) };
  };
  return { fetchFn, calls };
}

test("reading a photo: one call when the numbers add up", async () => {
  const api = fakeApi(reading(PHOTOS[0]));
  const stages = [];
  const r = await pump.readPump("AAAA", "sk-ant-test", { fetchFn: api.fetchFn, onStage: (s) => stages.push(s) });
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(api.calls[0].opts.headers["x-api-key"], "sk-ant-test");
  assert.equal(api.calls[0].opts.headers["anthropic-version"], "2023-06-01");
  assert.equal(api.calls[0].opts.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.deepEqual([r.litres, r.price, r.total], [40.5, 18.22, 737.91]);
  assert.equal(r.second, false);
  assert.deepEqual(stages, ["Reading the photo…"]);
});

test("reading a photo: a careful second look when they don't", async () => {
  const api = fakeApi(reading({ ...PHOTOS[2], price_per_litre: 19.08 }), reading(PHOTOS[2]));
  const r = await pump.readPump("AAAA", "k", { fetchFn: api.fetchFn });
  assert.equal(api.calls.length, 2);
  assert.equal(api.calls[1].body.model, "claude-sonnet-5-5");
  assert.equal(r.price, 19.03);
  assert.equal(r.verified, true);
  assert.equal(r.second, true);
});

test("reading a photo: if the second look fails too, the form gets the first reading to fix", async () => {
  const bad = reading({ ...PHOTOS[2], price_per_litre: 19.08 });
  const r = await pump.readPump("AAAA", "k", { fetchFn: fakeApi(bad, bad).fetchFn });
  assert.equal(r.ok, false);
  assert.equal(r.price, 19.08);
  const offline = await pump.readPump("AAAA", "k", { fetchFn: fakeApi(bad, new TypeError("offline")).fetchFn });
  assert.equal(offline.price, 19.08);
});

test("no pump in the photo, and API problems, give a clear message", async () => {
  await assert.rejects(pump.readPump("A", "k", { fetchFn: fakeApi({ ...reading(PHOTOS[0]), found: false }).fetchFn }), { kind: "notfound" });
  await assert.rejects(pump.readPump("A", "k", { fetchFn: fakeApi({ status: 401, message: "invalid x-api-key" }).fetchFn }), { kind: "key" });
  await assert.rejects(pump.readPump("A", "k", { fetchFn: fakeApi({ status: 400, message: "Your credit balance is too low" }).fetchFn }), { kind: "credit" });
  await assert.rejects(pump.readPump("A", "k", { fetchFn: fakeApi({ status: 529, message: "Overloaded" }).fetchFn }), { kind: "busy" });
  await assert.rejects(pump.readPump("A", "k", { fetchFn: fakeApi({ status: 400, message: "This API key is not scoped to a workspace." }).fetchFn }),
    { kind: "key", message: /workspace/ });
  await assert.rejects(pump.readPump("A", "k", { fetchFn: fakeApi(new TypeError("Failed to fetch")).fetchFn }), { kind: "network" });
});

test("testing a key is one tiny request", async () => {
  const api = fakeApi({ ok: 1 });
  assert.equal(await pump.testKey("k", api.fetchFn), true);
  assert.equal(api.calls[0].body.max_tokens, 16);
  await assert.rejects(pump.testKey("bad", fakeApi({ status: 401 }).fetchFn), { kind: "key" });
});

// a minimal JPEG with EXIF: IFD0 DateTime and the Exif IFD's DateTimeOriginal (little-endian)
function jpegWithExif(original, modified = "2026:10:24 21:10:35") {
  const ascii = (s) => [...s].map((c) => c.charCodeAt(0)).concat([0]);
  const tiff = [];
  const u16 = (v) => [v & 255, v >> 8], u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24];
  // header (8) + IFD0 with 2 entries (2+24+4=30) + Exif IFD with 1 entry (2+12+4=18) + two 20-byte strings
  const ifd0 = 8, exifIfd = ifd0 + 30, str1 = exifIfd + 18, str2 = str1 + 20;
  tiff.push(0x49, 0x49, ...u16(42), ...u32(ifd0));
  tiff.push(...u16(2), ...u16(0x0132), ...u16(2), ...u32(20), ...u32(str1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfd), ...u32(0));
  tiff.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(str2), ...u32(0));
  tiff.push(...ascii(modified), ...ascii(original));
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const bytes = [0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1, 0xff, 0xd9];
  return new Uint8Array(bytes).buffer;
}

test("the day the photo was taken comes from its EXIF", () => {
  assert.equal(pump.exifDate(jpegWithExif("2026:09:12 17:45:02")), "2026-09-12");
  assert.equal(pump.exifDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), null);   // a PNG
  assert.equal(pump.exifDate(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer), null);   // a JPEG without EXIF
});
