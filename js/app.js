// Savings Tracker for phones: app shell (navigation bar, tabs, pages).
import { store, readDesktopFile, describeData } from "./store.js";
import { todayDate, budgetSnapshot, investmentStatus, configure } from "./core.js";
import { h, icon, alertBox, toast, pickFile } from "./ui.js";
import { renderOverview } from "./pages/overview.js";
import { renderHistory } from "./pages/history.js";
import { renderBudget } from "./pages/budget.js";
import { renderInsights } from "./pages/insights.js";
import { renderWelcome } from "./pages/welcome.js";
import { openMonthSheet } from "./pages/month.js";
import { openSettings } from "./pages/settings.js";
import { renderCar, renderCarLog, renderCarInsights, renderGarage, openNewCarLog, openCarSheet, carHeading, addFixedCostLogs } from "./pages/car.js";
import { uploadPending } from "./photos.js";
import { renderPlan } from "./pages/plan.js";
import { renderDraft } from "./pages/draft.js";

const TABS = [
  { key: "overview", title: "Overview", icon: "overview", render: renderOverview },
  { key: "plan", title: "My plan", icon: "target", render: renderPlan },     // this pay period's saving plan
  { key: "budget", title: "Budget", icon: "budget", render: renderBudget },
  { key: "history", title: "History", icon: "history", render: renderHistory },
  { key: "insights", title: "Insights", icon: "insights", render: renderInsights },
  // a copy of the budget to try changes on, from a button on the Budget page (not in the tab bar)
  { key: "draft", title: "Draft budget", icon: "budget", render: renderDraft, hidden: true, parent: "budget" },
];
// The car monitor: its own section, opened with the car button; the € button goes back to the
// savings tab you were on.
const CAR_TABS = [
  { key: "car", title: "Car", icon: "car", render: renderCar, heading: carHeading },
  { key: "car-log", title: "Log", icon: "history", render: renderCarLog },
  { key: "car-insights", title: "Charts", icon: "charts", render: renderCarInsights },
  { key: "car-garage", title: "Garage", icon: "garage", render: renderGarage },
];
const ALL_TABS = [...TABS, ...CAR_TABS.filter((t) => !t.exit)];
const tabKeys = ALL_TABS.map((t) => t.key);
let current = tabKeys.includes(location.hash.slice(1)) ? location.hash.slice(1) : store.pref("tab", "overview");
if (!tabKeys.includes(current)) current = "overview";
const inCar = () => current.startsWith("car");
if (!inCar()) store.setPref("savings_tab", current);
const scrolls = {};

const main = document.getElementById("main");
const navbar = document.getElementById("navbar");
const navTitle = document.getElementById("nav-title");
const syncBtn = document.getElementById("sync-btn");
const tabbar = document.getElementById("tabbar");
const addBtn = document.getElementById("add-btn");
const carBtn = document.getElementById("car-btn");
let statusPill = null;

// ---------------------------------------------------------------------------
// Shared actions
// ---------------------------------------------------------------------------
function context() {
  const data = store.data;
  configure(data);
  const today = todayDate();
  return {
    data, entries: data.entries, today,
    snap: budgetSnapshot(data, today),
    inv: investmentStatus(data, data.entries),
    openMonth: (entry) => openMonthSheet(context(), entry),
    openSettings: () => openSettings(context()),
    inCar: inCar(),
    importDesktop, confirmReplace,
    privacy: () => Boolean(store.pref("privacy", false)),
    setPrivacy,
    go,
    refresh: () => { const y = window.scrollY; render(); window.scrollTo(0, y); },
  };
}

async function confirmReplace(data, name = "") {
  const nCosts = data.expenses.length, nGoals = data.goals.length;
  const where = store.mode === "drive" ? " and in your Google Drive file" : "";
  const ok = await alertBox({
    title: "Use this data?",
    message: `${name ? `${name}: ` : ""}${describeData(data)}, ${nCosts} fixed cost${nCosts !== 1 ? "s" : ""} and ${nGoals} goal${nGoals !== 1 ? "s" : ""}.\n\nIt replaces what's in the app now${where}.`,
    buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Replace", value: true, style: "bold" }],
  });
  if (!ok) return false;
  // a desktop file has no cars: keep the ones already in the app
  if (!data.cars?.length && store.data.cars?.length) data = { ...data, cars: store.data.cars };
  store.replaceAll(data);
  toast(`✓  Imported ${data.entries.length} month${data.entries.length !== 1 ? "s" : ""}`);
  if (store.mode === "drive" && !store.drive.tokenValid()) store.syncFromTap();
  return true;
}

async function importDesktop() {
  const file = await pickFile();
  if (!file) return;
  try {
    const data = await readDesktopFile(file);
    await confirmReplace(data, file.name);
  } catch (err) {
    alertBox({ title: "Can't import that file", message: `${err.message}\n\nPick the savings.db file from the desktop app (its location is shown under Data file in the app's sidebar).` });
  }
}

/** First time a device with data meets a Drive file that also has data: which one to keep? */
store.chooser = (mine, theirs) => alertBox({
  title: "Which data do you want?",
  message: `Google Drive has ${describeData(theirs)}.\nThis device has ${describeData(mine)}.`,
  buttons: [
    { text: "Use Google Drive's", value: "drive", style: "bold" },
    { text: "Use this device's (replaces Drive's)", value: "device", style: "" },
  ],
});

const privacyBtn = document.getElementById("privacy-btn");
function setPrivacy(on, announce = false) {
  store.setPref("privacy", Boolean(on));
  document.body.classList.toggle("privacy", Boolean(on));
  privacyBtn.replaceChildren(icon(on ? "eyeOff" : "eye", 23));
  privacyBtn.setAttribute("aria-label", on ? "Show amounts" : "Hide amounts");
  privacyBtn.classList.toggle("on", Boolean(on));
  if (announce) toast(on ? "Amounts hidden" : "Amounts shown");
}

function go(key) {
  if (key === "savings") key = store.pref("savings_tab", "overview");
  if (!tabKeys.includes(key)) return;
  scrolls[current] = window.scrollY;
  current = key;
  store.setPref("tab", key);
  store.setPref(inCar() ? "car_tab" : "savings_tab", key);
  history.replaceState(null, "", `#${key}`);
  render();
  window.scrollTo(0, scrolls[key] || 0);
}

// ---------------------------------------------------------------------------
// Chrome: navigation bar, sync indicator, tab bar
// ---------------------------------------------------------------------------
const SYNC_ICONS = { local: "phone", synced: "cloudCheck", syncing: "sync", pending: "cloudUp", signin: "cloudUp",
  offline: "cloudOff", error: "cloudOff", idle: "cloud" };

function updateChrome() {
  const st = store.status;
  syncBtn.replaceChildren(icon(SYNC_ICONS[st.state] || "cloud", 23));
  syncBtn.className = `nav-btn sync-state-${st.state}`;
  syncBtn.setAttribute("aria-label", st.text || "Data");
  if (statusPill) {
    const attention = ["signin", "error", "offline"].includes(st.state) || (st.state === "pending");
    statusPill.className = `status-pill state-${st.state} ${attention ? "attention" : ""}`;
    statusPill.replaceChildren(icon(SYNC_ICONS[st.state] || "cloud", 15), h("span", null, st.text));
    statusPill.style.display = st.text ? "" : "none";
  }
}

function buildTabbar() {
  const shown = ALL_TABS.find((t) => t.key === current)?.parent || current;     // the draft shows under Budget
  tabbar.replaceChildren(...(inCar() ? CAR_TABS : TABS).filter((t) => !t.hidden).map((t) => {
    const b = h("button", { type: "button", class: `tab ${t.key === shown ? "on" : ""}`, "aria-label": t.title,
      "aria-current": t.key === shown ? "page" : null }, icon(t.icon, 26), h("span", null, t.title));
    b.addEventListener("click", () => (t.key === current ? window.scrollTo({ top: 0, behavior: "smooth" }) : go(t.key)));
    return b;
  }));
}

function render() {
  const ready = store.ready;
  document.body.classList.toggle("welcome-mode", !ready);
  if (!ready) {
    statusPill = null;
    main.replaceChildren(renderWelcome());
    return;
  }
  const tab = ALL_TABS.find((t) => t.key === current);
  const ctx = context();
  const [subtitle, ...content] = tab.render(ctx);
  const title = tab.heading ? tab.heading(ctx) : tab.title;
  navTitle.textContent = title;
  // the car button opens the car monitor; in there it's a € button back to your savings
  carBtn.replaceChildren(icon(inCar() ? "euro" : "car", 25));
  carBtn.setAttribute("aria-label", inCar() ? "Back to Savings" : "Car monitor");
  statusPill = h("button", { type: "button", class: "status-pill" });
  statusPill.addEventListener("click", () => (store.mode === "drive" ? store.syncFromTap() : ctx.openSettings()));
  const showPill = current === "overview" || ["signin", "error"].includes(store.status.state);
  main.replaceChildren(h("div", { class: "page", dataset: { page: current } },
    h("h1", { class: "large-title" }, title),
    h("div", { class: "subtitle" }, subtitle),
    showPill ? statusPill : null,
    ...content.filter(Boolean)));
  addBtn.setAttribute("aria-label", current === "car-garage" ? "Add a car" : inCar() ? "Add a car log" : current === "draft" ? "Add a cost to the draft"
    : checkInput() ? "Check in" : "Add a month");
  buildTabbar();
  updateChrome();
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
document.getElementById("settings-btn").addEventListener("click", () => store.ready && openSettings(context()));
carBtn.addEventListener("click", () => store.ready && go(inCar() ? "savings" : store.pref("car_tab", "car")));
// +: a month; on My plan, while a plan runs, a check-in; in the car monitor a log for the car shown, or in the Garage a car
const checkInput = () => (current === "plan" ? main.querySelector(".check-input") : null);
function addNew() {
  if (current === "car-garage") return openCarSheet(context(), null);
  if (inCar()) return openNewCarLog(context());
  if (current === "draft") {
    const name = main.querySelector(".draft-add-name");
    name?.scrollIntoView({ block: "center", behavior: "smooth" });
    name?.focus({ preventScroll: true });
    return;
  }
  const input = checkInput();
  if (!input) return openMonthSheet(context(), null);
  input.scrollIntoView({ block: "center", behavior: "smooth" });
  input.focus({ preventScroll: true });
}
addBtn.addEventListener("click", () => store.ready && addNew());
privacyBtn.addEventListener("click", () => setPrivacy(!store.pref("privacy", false), true));
syncBtn.addEventListener("click", () => {
  if (!store.ready) return;
  if (store.mode === "drive") store.syncFromTap().then(() => toast(store.status.text));
  else openSettings(context());
});
// Google Drive: its sign-in lasts an hour, and the browser only lets Google's sign-in window open from a tap.
// So when it has run out (the orange cloud), the first tap anywhere signs in again and syncs, once; if that
// doesn't work, the cloud button is there as before.
// A tap is a touch that lifts where it went down (not a scroll); on a phone it counts even on plain text, which
// doesn't get a click there.
let autoSignIn = true, downAt = null;
function signInOnTap(ev) {
  if (!autoSignIn || !store.ready || store.mode !== "drive" || store.drive.tokenValid() || !navigator.onLine) return;
  if (!window.google?.accounts?.oauth2) return;                              // Google's sign-in isn't loaded yet
  if (ev.target.closest?.("#sync-btn, input, textarea, select, .sheet-wrap, .alert-wrap")) return;
  autoSignIn = false;
  store.syncFromTap();
}
document.addEventListener("pointerdown", (ev) => { downAt = [ev.clientX, ev.clientY]; }, true);
document.addEventListener("pointerup", (ev) => {
  if (ev.pointerType !== "mouse" && downAt && Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) < 10) signInOnTap(ev);
}, true);
document.addEventListener("click", signInOnTap, true);
store.on((kind) => { if (kind === "status" && store.drive.tokenValid()) autoSignIn = true; });   // signed in: next time too
window.addEventListener("scroll", () => navbar.classList.toggle("scrolled", window.scrollY > 38), { passive: true });
window.addEventListener("hashchange", () => { const k = location.hash.slice(1); if (k !== current && tabKeys.includes(k)) go(k); });
document.addEventListener("keydown", (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "n" && store.ready) { ev.preventDefault(); addNew(); }
});

store.on((kind) => (kind === "status" ? updateChrome() : render()));
// the car's fixed costs (insurance, parking...) log themselves on their day of the month
store.onSynced = () => { addFixedCostLogs(); uploadPending(store); };     // invoice photos go to Drive after each sync
store.load();
addFixedCostLogs();
setPrivacy(store.pref("privacy", false));
render();
if (store.mode === "drive") store.sync();

// midnight: the payday countdown moves on
setInterval(() => { const t = todayDate().getDate(); if (t !== render.lastDay) { render.lastDay = t; if (store.ready) { addFixedCostLogs(); render(); } } }, 60000);
render.lastDay = todayDate().getDate();

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
