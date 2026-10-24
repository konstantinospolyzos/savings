// Reading a photo of a fuel pump display (or a fuel receipt) with Claude: litres, price per litre and
// the amount. The photo is made smaller on the phone and sent, with your own API key, straight to the
// Claude API. The answer is checked the way every pump works: litres × price per litre = amount.
// Nothing here is saved: the numbers go into the refuel form, where you check them and save.

export const API_URL = "https://api.anthropic.com/v1/messages";
export const FAST_MODEL = "claude-haiku-5-5";       // reads almost every photo, in a second or two
export const CAREFUL_MODEL = "claude-sonnet-5-5";   // a second, slower look when the numbers don't add up
const KEY_STORE = "savingsTracker.anthropicKey";    // on this device only: not in the data file, Drive or backups

export function getKey() { try { return localStorage.getItem(KEY_STORE) || ""; } catch { return ""; } }
export function setKey(key) {
  try { if (key) localStorage.setItem(KEY_STORE, key); else localStorage.removeItem(KEY_STORE); } catch { /* blocked */ }
}

export class PumpError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}

// ---------------------------------------------------------------------------
// What we ask, and the shape of the answer
// ---------------------------------------------------------------------------
const SYSTEM = "You read the numbers on photos of fuel pump displays at Swedish petrol stations, or on fuel receipts. Answer only with the JSON the schema describes.";

const PROMPT = `Read this fuel pump display (or fuel receipt).

A pump display shows three numbers for the refuel that just happened:
- the amount to pay in kronor, labelled Kr, KRONOR, Belopp or Att betala. It is the biggest number.
- the volume in litres, labelled L or LITER, usually right under the amount.
- the price per litre, labelled Kr/L or Kr/liter, usually in a small window below the main display.

Some pumps also have a column of small windows with the price of every fuel (95, 98, Diesel, E85, V-Power, miles, miles+ ...). Put those in other_prices. price_per_litre is the price of the fuel that was used: the Kr/L window under the main display, or else the lit or highlighted one. On every pump, litres × price per litre = amount, rounded to öre.

The digits are seven-segment LCD digits, and the decimal separator is a small comma or point that is easy to miss: read every digit and the separator carefully. Amounts and prices have two decimals; litres have two, sometimes three. The photo may be at an angle, dark, or have glare or reflections.

Give the numbers as plain decimals with a point, for example 737.91. Use 0 for a number you can't see. fuel: the fuel that was used if you can tell (for example "95", "98", "Diesel", "E85"), otherwise "". found: false if the photo shows no pump display or fuel receipt.`;

export const SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    total_kr: { type: "number" },
    litres: { type: "number" },
    price_per_litre: { type: "number" },
    fuel: { type: "string" },
    other_prices: {
      type: "array",
      items: { type: "object", properties: { label: { type: "string" }, price: { type: "number" } },
        required: ["label", "price"], additionalProperties: false },
    },
  },
  required: ["found", "total_kr", "litres", "price_per_litre", "fuel", "other_prices"],
  additionalProperties: false,
};

/** The Messages API request. With a first reading that didn't add up, the careful model is told so. */
export function buildRequest(model, imageB64, firstTry = null) {
  let text = PROMPT;
  if (firstTry) {
    const L = num(firstTry.litres), P = num(firstTry.price_per_litre), T = num(firstTry.total_kr);
    text += `\n\nA first reading gave amount ${T}, litres ${L} and price per litre ${P}, but ${L} × ${P} = ${round(L * P, 2)}, which is not the amount, so at least one digit or decimal separator was misread (or a number was missed). Read all three numbers again, digit by digit.`;
  }
  const careful = model === CAREFUL_MODEL;
  return {
    model,
    max_tokens: careful ? 8000 : 1024,
    ...(careful ? {} : { thinking: { type: "disabled" } }),
    output_config: { effort: careful ? "medium" : "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageB64 } },
      { type: "text", text },
    ] }],
  };
}

// ---------------------------------------------------------------------------
// Talking to the API
// ---------------------------------------------------------------------------
function headers(key) {
  return { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true" };
}

async function post(key, body, fetchFn) {
  let resp;
  try {
    resp = await fetchFn(API_URL, { method: "POST", headers: headers(key), body: JSON.stringify(body) });
  } catch {
    throw new PumpError("Couldn't reach Claude. Check your connection and try again.", "network");
  }
  let data = null;
  try { data = await resp.json(); } catch { /* not JSON */ }
  if (!resp.ok) {
    const msg = data?.error?.message || `HTTP ${resp.status}`;
    if (resp.status === 401) throw new PumpError("The API key isn't valid, or it has expired. Check it in Settings › Reading pump photos.", "key");
    if (resp.status === 400 && /workspace/i.test(msg)) throw new PumpError("This key isn't tied to a workspace. Create a new key in the Claude Console and pick a workspace for it (Default is fine).", "key");
    if (/credit balance|billing/i.test(msg)) throw new PumpError("Your Anthropic account has no credit left. Add some under Billing in the Claude Console.", "credit");
    if (resp.status === 403) throw new PumpError(`The API key isn't allowed to do this: ${msg}`, "key");
    if (resp.status === 429) throw new PumpError("Too many requests right now. Try again in a minute.", "busy");
    if (resp.status >= 500) throw new PumpError("Claude is busy right now. Try again in a moment.", "busy");
    throw new PumpError(`Claude answered: ${msg}`, "api");
  }
  return data;
}

/** One reading: the JSON the model returned. */
export async function askClaude(key, body, fetchFn = globalThis.fetch?.bind(globalThis)) {
  const data = await post(key, body, fetchFn);
  if (data?.stop_reason === "refusal") throw new PumpError("Claude didn't read this photo. Type the numbers instead.", "refusal");
  const text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  try { return JSON.parse(text.slice(a, b + 1)); } catch {
    throw new PumpError("Couldn't understand Claude's answer. Try again, or type the numbers.", "parse");
  }
}

/** Checks a key with a tiny request (costs a fraction of an öre). */
export async function testKey(key, fetchFn = globalThis.fetch?.bind(globalThis)) {
  await post(key, { model: FAST_MODEL, max_tokens: 16, thinking: { type: "disabled" },
    messages: [{ role: "user", content: "Reply with OK." }] }, fetchFn);
  return true;
}

// ---------------------------------------------------------------------------
// Checking the numbers: litres × price = amount, as on every pump
// ---------------------------------------------------------------------------
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const round = (v, d) => { const f = 10 ** d; return Math.round(v * f) / f; };
const PLAUSIBLE = { litres: (v) => v >= 0.5 && v <= 250, price: (v) => v >= 3 && v <= 60, total: (v) => v >= 2 && v <= 15000 };
const plausible = (x) => PLAUSIBLE.litres(x.litres) && PLAUSIBLE.price(x.price) && PLAUSIBLE.total(x.total);
/**
 * The pump works out the amount from the exact volume, but shows the litres rounded to 0.01 l, so
 * litres × price can be off by at most half a hundredth of the price, plus the öre rounding.
 * A misread digit moves it much further (19.03 read as 19.08 on 49 l: 2.45 kr).
 */
export const agrees = (L, P, T) => L > 0 && P > 0 && T > 0 && Math.abs(L * P - T) <= 0.006 * P + 0.011;

/**
 * -> { litres, price, total, ok, verified, how, fixed }
 * how: "read" (all three agree), "other-price" (it picked another fuel's price), "decimal" (a missed
 * or extra decimal separator in one number), "computed" (one number missing, worked out from the
 * other two: ok but not verified), "mismatch" (doesn't add up).
 */
export function checkReading(raw) {
  const read = { litres: num(raw?.litres), price: num(raw?.price_per_litre), total: num(raw?.total_kr) };
  const done = (x, how, fixed = null, verified = true) => ({ ...x, ok: true, verified, how, fixed });
  if (agrees(read.litres, read.price, read.total)) return done(read, "read");
  for (const p of (raw?.other_prices || []).map((o) => num(o?.price))) {
    if (agrees(read.litres, p, read.total)) return done({ ...read, price: p }, "other-price", "price");
  }
  for (const k of ["litres", "price", "total"]) {
    for (const f of [0.1, 0.01, 10, 100, 0.001]) {
      const x = { ...read, [k]: round(read[k] * f, 3) };
      if (read[k] > 0 && plausible(x) && agrees(x.litres, x.price, x.total)) return done(x, "decimal", k);
    }
  }
  const { litres: L, price: P, total: T } = read;
  if (!T && L && P) { const x = { ...read, total: round(L * P, 2) }; if (plausible(x)) return done(x, "computed", "total", false); }
  if (!P && L && T) { const x = { ...read, price: round(T / L, 2) }; if (plausible(x)) return done(x, "computed", "price", false); }
  if (!L && P && T) { const x = { ...read, litres: round(T / P, 2) }; if (plausible(x)) return done(x, "computed", "litres", false); }
  return { litres: L || null, price: P || null, total: T || null, ok: false, verified: false, how: "mismatch", fixed: null };
}

/**
 * The whole reading: the fast model first; if its numbers don't add up (even after the fixes
 * above), one careful second look. onStage(text) tells the form what's happening.
 */
export async function readPump(imageB64, key, { fetchFn = globalThis.fetch?.bind(globalThis), onStage = () => {} } = {}) {
  onStage("Reading the photo…");
  const first = await askClaude(key, buildRequest(FAST_MODEL, imageB64), fetchFn);
  if (first.found === false) throw new PumpError("Couldn't find a pump display or fuel receipt in the photo. Try again a bit closer.", "notfound");
  const one = checkReading(first);
  if (one.ok && one.verified) return { ...one, fuel: first.fuel || "", model: FAST_MODEL, second: false };
  onStage("Taking a closer look…");
  try {
    const again = await askClaude(key, buildRequest(CAREFUL_MODEL, imageB64, first), fetchFn);
    const two = checkReading(again);
    if (two.ok && (two.verified || !one.ok)) return { ...two, fuel: again.fuel || first.fuel || "", model: CAREFUL_MODEL, second: true };
  } catch (err) {
    if (err.kind === "key" || err.kind === "credit") throw err;   // otherwise: keep the first reading
  }
  return { ...one, fuel: first.fuel || "", model: FAST_MODEL, second: true };
}

// ---------------------------------------------------------------------------
// The photo: smaller before it's sent, and the day it was taken
// ---------------------------------------------------------------------------
/** A JPEG at most maxEdge pixels on the long side (pump digits stay sharp; a few hundred kB to send). */
export async function shrinkPhoto(file, maxEdge = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    const s = Math.min(1, maxEdge / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * s);
    canvas.height = Math.round(h * s);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { b64: dataUrl.slice(dataUrl.indexOf(",") + 1), dataUrl, width: canvas.width, height: canvas.height };
  } catch {
    throw new PumpError("Couldn't open this photo. Try another one, or take a new photo.", "image");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** "2026-10-24" from the photo's EXIF (when it was taken), or null. Only JPEGs carry it. */
export function exifDate(buffer) {
  try {
    const v = new DataView(buffer);
    if (v.getUint16(0) !== 0xffd8) return null;
    let p = 2;
    while (p + 4 < v.byteLength) {
      const marker = v.getUint16(p), size = v.getUint16(p + 2);
      if (marker === 0xffe1 && v.getUint32(p + 4) === 0x45786966) {      // "Exif"
        const t = p + 10;                                                   // TIFF header
        const le = v.getUint16(t) === 0x4949;
        const u16 = (o) => v.getUint16(t + o, le), u32 = (o) => v.getUint32(t + o, le);
        const tag = (ifd, want) => {
          const n = u16(ifd);
          for (let i = 0; i < n; i++) {
            const e = ifd + 2 + i * 12;
            if (u16(e) === want) return { type: u16(e + 2), count: u32(e + 4), value: u32(e + 8) };
          }
          return null;
        };
        const ascii = (entry) => {
          if (!entry || entry.type !== 2) return null;
          let s = "";
          for (let i = 0; i < entry.count - 1 && i < 19; i++) s += String.fromCharCode(v.getUint8(t + entry.value + i));
          return s;
        };
        const ifd0 = u32(4);
        const exif = tag(ifd0, 0x8769);
        const text = (exif && ascii(tag(exif.value, 0x9003))) || ascii(tag(ifd0, 0x0132));   // DateTimeOriginal, else DateTime
        const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(text || "");
        return m && m[1] !== "0000" ? `${m[1]}-${m[2]}-${m[3]}` : null;
      }
      if ((marker & 0xff00) !== 0xff00) return null;
      p += 2 + size;
    }
  } catch { /* not a JPEG we can read */ }
  return null;
}
