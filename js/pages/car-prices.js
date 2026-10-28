// Car monitor: Swedish pump prices, week by week (data/fuel-prices.json, kept on the device too).

// ---------------------------------------------------------------------------
// Fuel price: weekly Swedish average from data/fuel-prices.json (updated by a GitHub Action)
// ---------------------------------------------------------------------------
const FUEL_KEY = "savingsTracker.fuelPrices";
let fuelData;
let fuelFetch = null;
export function cachedPrices() {
  if (fuelData === undefined) {
    fuelData = null;
    try { const v = JSON.parse(localStorage.getItem(FUEL_KEY)); if (v?.prices?.["95"]?.length) fuelData = v; } catch { /* no copy */ }
  }
  return fuelData;
}
/** Resolves true when newer prices arrived. At most one request a minute. */
export function fetchPrices() {
  if (!fuelFetch) {
    fuelFetch = fetch("data/fuel-prices.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!d?.prices?.["95"]?.length) throw new Error("No prices in the file");
        const changed = !cachedPrices() || fuelData.updated !== d.updated;
        fuelData = d;
        try { localStorage.setItem(FUEL_KEY, JSON.stringify(d)); } catch { /* full or blocked */ }
        return changed;
      });
    fuelFetch.finally(() => setTimeout(() => { fuelFetch = null; }, 60000)).catch(() => {});
  }
  return fuelFetch;
}
