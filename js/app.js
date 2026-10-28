// Savings Tracker for phones: app shell (navigation bar, tabs, pages).
import { store, readDesktopFile, describeData } from "./store.js";
import { todayDate, budgetSnapshot, investmentStatus, configure, loadPlans, currentPeriod } from "./core.js";
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

const TABS = [
  { key: "overview", title: "Overview", icon: "overview", render: renderOverview },
  { key: "history", title: "History", icon: "history", render: renderHistory },
  { key: "budget", title: "Budget", icon: "budget", render: renderBudget },
  { key: "insights", title: "Insights", icon: "insights", render: renderInsights },
  // the saving plan you started: a page of its own, opened with the target button at the top (not a tab)
  { key: "plan", title: "My plan", icon: "target", render: renderPlan, hidden: true },
];
// The car monitor: its own section, opened with the car button; the € button goes back to the
// savings tab you were on.
const CAR_TABS = [
  { key: "car", title: "Car", icon: "car", render: renderCar, heading: carHeading },
  { key: "car-log", title: "Log", icon: "history", render: renderCarLog },
  { key: "car-insights", title: "Insights", icon: "charts", render: renderCarInsights },
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
const planBtn = document.getElementById("plan-btn");
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
  tabbar.replaceChildren(...(inCar() ? CAR_TABS : TABS).filter((t) => !t.hidden).map((t) => {
    const b = h("button", { type: "button", class: `tab ${t.key === current ? "on" : ""}`, "aria-label": t.title,
      "aria-current": t.key === current ? "page" : null }, icon(t.icon, 26), h("span", null, t.title));
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
  addBtn.setAttribute("aria-label", current === "car-garage" ? "Add a car" : inCar() ? "Add a car log" : "Add a month");
  // the car button opens the car monitor; in there it's a € button back to your savings
  carBtn.replaceChildren(icon(inCar() ? "euro" : "car", 25));
  carBtn.setAttribute("aria-label", inCar() ? "Back to Savings" : "Car monitor");
  // the plan button: a green dot while a plan runs for this pay period; on its page it takes you back
  const running = Boolean(loadPlans(ctx.data)[currentPeriod(ctx.today).base]);
  planBtn.replaceChildren(...[icon("target", 24), running ? h("span", { class: "nav-badge" }) : null].filter(Boolean));
  planBtn.classList.toggle("on", current === "plan");
  planBtn.setAttribute("aria-label", current === "plan" ? "Back" : running ? "My saving plan" : "Start a saving plan");
  statusPill = h("button", { type: "button", class: "status-pill" });
  statusPill.addEventListener("click", () => (store.mode === "drive" ? store.syncFromTap() : ctx.openSettings()));
  const showPill = current === "overview" || ["signin", "error"].includes(store.status.state);
  main.replaceChildren(h("div", { class: "page", dataset: { page: current } },
    h("h1", { class: "large-title" }, title),
    h("div", { class: "subtitle" }, subtitle),
    showPill ? statusPill : null,
    ...content.filter(Boolean)));
  buildTabbar();
  updateChrome();
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
document.getElementById("settings-btn").addEventListener("click", () => store.ready && openSettings(context()));
carBtn.addEventListener("click", () => store.ready && go(inCar() ? "savings" : store.pref("car_tab", "car")));
planBtn.addEventListener("click", () => {
  if (!store.ready) return;
  if (current === "plan") { go(store.pref("plan_back", "overview")); return; }
  store.setPref("plan_back", current);
  go("plan");
});
// +: a month; in the car monitor a log for the car shown, or in the Garage a car
const addNew = () => (current === "car-garage" ? openCarSheet(context(), null) : inCar() ? openNewCarLog(context()) : openMonthSheet(context(), null));
addBtn.addEventListener("click", () => store.ready && addNew());
privacyBtn.addEventListener("click", () => setPrivacy(!store.pref("privacy", false), true));
syncBtn.addEventListener("click", () => {
  if (!store.ready) return;
  if (store.mode === "drive") store.syncFromTap().then(() => toast(store.status.text));
  else openSettings(context());
});
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
