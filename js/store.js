// Where the data lives: a JSON file in the user's own Google Drive, cached on the device.
// Every change is an "operation". Operations are applied locally at once and queued; when the
// app syncs it downloads the newest Drive file (if another device changed it), replays the
// queued operations on top and uploads the result - so phone and computer never overwrite
// each other's months.

import { CONFIG } from "./config.js";
import { APP_NAME, DATA_VERSION, DEFAULT_EXPENSES, DEFAULT_GOALS, byPosition, mLong } from "./core.js";
import { emptyCar, normalizeCar, describeCar, byDateKm } from "./car.js";

const KEY_DATA = "savingsTracker.data";
const KEY_META = "savingsTracker.meta";
const KEY_TOKEN = "savingsTracker.token";
const KEY_PREFS = "savingsTracker.prefs";
const KEY_BASE = "savingsTracker.driveCopy";   // the file as it was last seen in Drive
export const FILE_NAME = "savings-tracker.json";
export const FOLDER_NAME = "Savings Tracker";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const BACKUP_EVERY = 7 * 86400000;     // a copy of the data file in Drive once a week...
const BACKUPS_KEPT = 8;                // ...keeping the last 8 (about two months)

const lsGet = (k, fallback = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

// ---------------------------------------------------------------------------
// The data file
// ---------------------------------------------------------------------------
export function emptyData() {
  return {
    app: APP_NAME, version: DATA_VERSION, updated: null, entries: [],
    expenses: DEFAULT_EXPENSES.map(([name, category], i) => ({ id: i + 1, name, amount: 0, per: "month", category,
      active: true, end_month: null, position: i, currency: "SEK" })),
    goals: DEFAULT_GOALS.map(([name, category], i) => ({ id: i + 1, name, category, kind: "year", amount: 0, saved: 0,
      start_month: null, target_month: null, active: true, position: i })),
    settings: { expenses_seeded: true, goals_seeded: true, brokers: "" },
    car: emptyCar(),
  };
}

const MONTH_RX = /^\d{4}-\d{2}$/;
const num = (v, def = 0) => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : def; };
const optNum = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const optMonth = (v) => { if (!v) return null; const m = String(v).slice(0, 7); return MONTH_RX.test(m) ? m : null; };

/** Check and tidy a data file (from Drive, a backup, or the desktop import). */
export function normalize(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.entries))
    throw new Error("This isn't a Savings Tracker file.");
  const byMonth = new Map();
  for (const e of raw.entries) {
    const month = optMonth(e?.month);
    const rate = num(e?.sek_to_eur, 0);
    if (!month || rate <= 0) continue;
    byMonth.set(month, {
      month, income_sek: num(e.income_sek), bank_sek: num(e.bank_sek), invested_eur: num(e.invested_eur),
      sek_to_eur: rate, comment: typeof e.comment === "string" ? e.comment : "",
      added_eur: optNum(e.added_eur), trip: e.trip === null || e.trip === undefined ? null : Boolean(e.trip),
    });
  }
  const entries = [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
  let nextId = 1;
  const ids = new Set();
  const takeId = (v) => { let id = Number.isInteger(v) && !ids.has(v) ? v : null; if (id === null) { while (ids.has(nextId)) nextId++; id = nextId; } ids.add(id); return id; };
  const expenses = (Array.isArray(raw.expenses) ? raw.expenses : []).filter((x) => x && x.name).map((x, i) => ({
    id: takeId(x.id), name: String(x.name), amount: num(x.amount), per: x.per === "year" ? "year" : "month",
    category: String(x.category || "Other"), active: x.active !== false && x.active !== 0, end_month: optMonth(x.end_month),
    position: Number.isInteger(x.position) ? x.position : i, currency: x.currency === "EUR" ? "EUR" : "SEK",
  })).sort(byPosition);
  ids.clear(); nextId = 1;
  const goals = (Array.isArray(raw.goals) ? raw.goals : []).filter((g) => g && g.name).map((g, i) => ({
    id: takeId(g.id), name: String(g.name), category: String(g.category || "Other"), kind: g.kind === "once" ? "once" : "year",
    amount: num(g.amount), saved: num(g.saved), start_month: optMonth(g.start_month), target_month: optMonth(g.target_month),
    active: g.active !== false && g.active !== 0, position: Number.isInteger(g.position) ? g.position : i,
  })).filter((g) => g.kind === "year" || (g.start_month && g.target_month)).sort(byPosition);
  const settings = raw.settings && typeof raw.settings === "object" ? { ...raw.settings } : {};
  delete settings.window;
  return { app: APP_NAME, version: DATA_VERSION, updated: raw.updated || null, entries, expenses, goals, settings,
    car: normalizeCar(raw.car) };
}

export function describeData(d) {
  const car = describeCar(d?.car);
  if (!d || !d.entries.length) return car ? `no months yet, ${car}` : "no months yet";
  const n = d.entries.length;
  const span = n === 1 ? mLong(d.entries[0].month) : `${mLong(d.entries[0].month)} – ${mLong(d.entries.at(-1).month)}`;
  return `${n} month${n !== 1 ? "s" : ""}, ${span}${car ? `, ${car}` : ""}`;
}

// unique across devices, so two phones adding a cost offline never clash
const newId = (list) => Math.max(list.reduce((m, x) => Math.max(m, x.id), 0) + 1, Date.now());

/** Apply one change to a copy of the data. */
export function applyOp(data, op) {
  const d = structuredClone(data);
  switch (op.type) {
    case "putEntry":
      d.entries = d.entries.filter((e) => e.month !== op.entry.month && e.month !== op.replace);
      d.entries.push(op.entry);
      d.entries.sort((a, b) => (a.month < b.month ? -1 : 1));
      break;
    case "deleteEntry":
      d.entries = d.entries.filter((e) => e.month !== op.month);
      break;
    case "setSetting":
      d.settings[op.key] = op.value;
      break;
    case "putExpense":
      d.expenses = d.expenses.filter((x) => x.id !== op.expense.id).concat([op.expense]).sort(byPosition);
      break;
    case "deleteExpense":
      d.expenses = d.expenses.filter((x) => x.id !== op.id);
      break;
    case "putGoal":
      d.goals = d.goals.filter((g) => g.id !== op.goal.id).concat([op.goal]).sort(byPosition);
      break;
    case "deleteGoal":
      d.goals = d.goals.filter((g) => g.id !== op.id);
      break;
    case "putCarLog":
      d.car = d.car || normalizeCar(null);
      d.car.logs = d.car.logs.filter((l) => l.id !== op.log.id).concat([op.log]).sort(byDateKm);
      break;
    case "deleteCarLog":
      d.car = d.car || normalizeCar(null);
      d.car.logs = d.car.logs.filter((l) => l.id !== op.id);
      break;
    case "setCar":
      d.car = { ...(d.car || normalizeCar(null)), ...op.fields };
      break;
    case "replaceAll":
      return normalize(op.data);
    default:
      throw new Error(`Unknown change: ${op.type}`);
  }
  return d;
}

// ---------------------------------------------------------------------------
// Google Drive (only the files this app creates: the drive.file permission)
// ---------------------------------------------------------------------------
class AuthError extends Error {}

class Drive {
  constructor(clientId) {
    this.clientId = clientId;
    this.client = null;
    const t = lsGet(KEY_TOKEN);
    this.token = t && t.expiry > Date.now() ? t.token : null;
    this.expiry = t ? t.expiry : 0;
    this.hint = t ? t.hint : null;
    this._gis = null;
  }

  get configured() { return Boolean(this.clientId); }
  tokenValid() { return Boolean(this.token) && Date.now() < this.expiry; }

  loadGis() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (!this._gis) {
      this._gis = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { this._gis = null; reject(new Error("Couldn't load Google sign-in. Check your connection.")); };
        document.head.appendChild(s);
      });
    }
    return this._gis;
  }

  _ensureClient() {
    if (this.client) return true;
    if (!window.google?.accounts?.oauth2) return false;
    this.client = window.google.accounts.oauth2.initTokenClient({
      client_id: this.clientId, scope: SCOPE,
      callback: (resp) => this._done(resp),
      error_callback: (err) => this._fail(err),
    });
    return true;
  }

  /** Must be called straight from a tap (browsers only allow sign-in pop-ups then). */
  requestToken() {
    return new Promise((resolve, reject) => {
      if (!this._ensureClient()) {
        this.loadGis().then(() => reject(new Error("Google sign-in is ready now. Tap again."))).catch(reject);
        return;
      }
      this._resolve = resolve;
      this._reject = reject;
      this.client.requestAccessToken({ prompt: "", login_hint: this.hint || undefined });
    });
  }

  _done(resp) {
    if (resp.error) return this._reject?.(new Error(resp.error_description || resp.error));
    if (!window.google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE))
      return this._reject?.(new Error("Google Drive access wasn't allowed. Tick the Drive box when you sign in."));
    this.token = resp.access_token;
    this.expiry = Date.now() + (Number(resp.expires_in || 3600) - 120) * 1000;
    lsSet(KEY_TOKEN, { token: this.token, expiry: this.expiry, hint: this.hint });
    this._resolve?.(this.token);
  }

  _fail(err) {
    const why = err?.type === "popup_closed" ? "Sign-in was closed before it finished."
      : err?.type === "popup_failed_to_open" ? "The sign-in window was blocked. Allow pop-ups for this site and tap again."
        : "Google sign-in didn't work. Try again.";
    this._reject?.(new Error(why));
  }

  setHint(email) {
    this.hint = email;
    lsSet(KEY_TOKEN, { token: this.token, expiry: this.expiry, hint: email });
  }

  signOut() {
    if (this.token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(this.token, () => {});
    this.token = null; this.expiry = 0; this.hint = null;
    lsDel(KEY_TOKEN);
  }

  async call(method, url, { body, headers = {}, raw = false } = {}) {
    if (!this.tokenValid()) throw new AuthError("Sign in again");
    const resp = await fetch(url, { method, body, headers: { Authorization: `Bearer ${this.token}`, ...headers } });
    if (resp.status === 401) { this.token = null; lsDel(KEY_TOKEN); throw new AuthError("Sign in again"); }
    if (resp.status === 404 || resp.status === 204) return null;
    if (!resp.ok) {
      let msg = `Google Drive answered ${resp.status}`;
      try { const j = await resp.json(); msg = j.error?.message || msg; } catch { /* keep msg */ }
      throw new Error(msg);
    }
    return raw ? resp.text() : resp.json();
  }

  about() { return this.call("GET", `${API}/about?fields=user(emailAddress,displayName)`); }

  async find(kind) {
    const q = encodeURIComponent(`appProperties has { key='savingsTracker' and value='${kind}' } and trashed=false`);
    const res = await this.call("GET", `${API}/files?q=${q}&spaces=drive&orderBy=modifiedTime desc` +
      "&fields=files(id,name,version,modifiedTime,webViewLink,parents)");
    return res?.files?.[0] || null;
  }

  getMeta(id) { return this.call("GET", `${API}/files/${id}?fields=id,name,version,modifiedTime,webViewLink,trashed`); }

  async download(id) {
    const text = await this.call("GET", `${API}/files/${id}?alt=media`, { raw: true });
    if (text === null) return null;
    return JSON.parse(text);
  }

  async folder() {
    const found = await this.find("folder");
    if (found) return found.id;
    const made = await this.call("POST", `${API}/files?fields=id`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder",
        appProperties: { savingsTracker: "folder" } }),
    });
    return made.id;
  }

  async create(data, { name = FILE_NAME, kind = "data" } = {}) {
    const parent = await this.folder();
    const boundary = `st${Math.random().toString(36).slice(2)}`;
    const meta = { name, mimeType: "application/json", parents: [parent], appProperties: { savingsTracker: kind } };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data, null, 1)}\r\n--${boundary}--`;
    return this.call("POST", `${UPLOAD}/files?uploadType=multipart&fields=id,name,version,modifiedTime,webViewLink`, {
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
    });
  }

  /** Weekly copies, newest first */
  async backups() {
    const q = encodeURIComponent("appProperties has { key='savingsTracker' and value='backup' } and trashed=false");
    const res = await this.call("GET", `${API}/files?q=${q}&spaces=drive&orderBy=createdTime desc&pageSize=100&fields=files(id,name,createdTime)`);
    return res?.files || [];
  }

  remove(id) { return this.call("DELETE", `${API}/files/${id}`); }

  upload(id, data) {
    return this.call("PATCH", `${UPLOAD}/files/${id}?uploadType=media&fields=id,name,version,modifiedTime,webViewLink`, {
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(data, null, 1),
    });
  }
}

// ---------------------------------------------------------------------------
// The store the pages use
// ---------------------------------------------------------------------------
class Store {
  constructor() {
    this.drive = new Drive(CONFIG.googleClientId);
    this.data = null;
    this.base = null;             // last version seen in Drive; queued changes are replayed on it
    this.meta = { mode: null, fileId: null, version: null, link: null, pending: [], lastSync: null, email: null };
    this.status = { state: "idle", text: "" };
    this.listeners = new Set();
    this.prefs = lsGet(KEY_PREFS, {}) || {};
    this._syncing = false;
    this._again = false;
    this._timer = null;
    this.chooser = null;          // the app sets this: asks which data to keep when both differ
  }

  load() {
    const m = lsGet(KEY_META);
    if (m) Object.assign(this.meta, m);
    const d = lsGet(KEY_DATA);
    try { this.data = d ? normalize(d) : null; } catch { this.data = null; }
    try { const b = lsGet(KEY_BASE); this.base = b ? normalize(b) : null; } catch { this.base = null; }
    if (this.meta.mode === "drive" && !this.drive.configured) this.meta.mode = this.data ? "local" : null;
    if (this.meta.mode === "drive") this.drive.loadGis().then(() => this.drive._ensureClient()).catch(() => {});
    this._status();
    window.addEventListener("online", () => this.syncSoon(0));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) this.syncSoon(0); });
  }

  get ready() { return Boolean(this.meta.mode && this.data); }
  get mode() { return this.meta.mode; }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  /** kind: "data" (redraw the page) or "status" (only the sync indicator changed) */
  emit(kind = "data") { for (const fn of this.listeners) fn(kind); }
  persist() {
    lsSet(KEY_DATA, this.data);
    lsSet(KEY_META, this.meta);
    if (this.base) lsSet(KEY_BASE, this.base); else lsDel(KEY_BASE);
  }

  pref(key, fallback) { return this.prefs[key] ?? fallback; }
  setPref(key, value) { this.prefs[key] = value; lsSet(KEY_PREFS, this.prefs); }

  // -- choosing where the data lives -----------------------------------------
  startLocal() {
    this.meta.mode = "local";
    this.data = this.data || emptyData();
    this.persist();
    this._status();
    this.emit();
  }

  /** Call straight from a tap. Signs in, then finds or creates the Drive file. */
  connectDrive() {
    const p = this.drive.requestToken();
    return p.then(async () => {
      if (this.meta.mode !== "drive") {
        this.meta.mode = "drive";
        this.meta.fileId = null;
        this.meta.version = null;
        this.meta.adopting = true;      // first sync with Drive: decide which data to keep
      }
      this.persist();
      await this.sync();
      if (this.status.state === "error") throw new Error(this.status.text);
    });
  }

  disconnectDrive() {
    this.drive.signOut();
    this.meta = { ...this.meta, mode: "local", fileId: null, version: null, link: null, pending: [], email: null, adopting: false, lastBackup: null };
    this.base = null;
    this.persist();
    this._status();
    this.emit();
  }

  // -- changes ---------------------------------------------------------------
  commit(op) {
    this.data = applyOp(this.data, op);
    if (this.meta.mode === "drive") this.meta.pending.push(op);
    this.persist();
    this._status();
    this.emit();
    this.syncSoon();
  }

  saveEntry(entry, replace = null) { this.commit({ type: "putEntry", entry, replace }); }
  deleteEntry(month) { this.commit({ type: "deleteEntry", month }); }
  setSetting(key, value) { this.commit({ type: "setSetting", key, value }); }
  saveExpense(expense) {
    if (expense.id === null || expense.id === undefined) expense = { ...expense, id: newId(this.data.expenses) };
    this.commit({ type: "putExpense", expense });
  }
  deleteExpense(id) { this.commit({ type: "deleteExpense", id }); }
  saveGoal(goal) {
    if (goal.id === null || goal.id === undefined) goal = { ...goal, id: newId(this.data.goals) };
    this.commit({ type: "putGoal", goal });
  }
  deleteGoal(id) { this.commit({ type: "deleteGoal", id }); }
  saveCarLog(log) { this.commit({ type: "putCarLog", log }); }
  deleteCarLog(id) { this.commit({ type: "deleteCarLog", id }); }
  setCar(fields) { this.commit({ type: "setCar", fields }); }
  replaceAll(data) { this.commit({ type: "replaceAll", data: normalize(data) }); }

  // -- syncing with Drive -------------------------------------------------------
  syncSoon(ms = 1200) {
    if (this.meta.mode !== "drive") return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.sync(), ms);
  }

  /** Tap on the cloud button: sign in again if needed, then sync. */
  syncFromTap() {
    if (this.meta.mode !== "drive") return Promise.resolve();
    if (this.drive.tokenValid()) return this.sync();
    return this.drive.requestToken().then(() => this.sync()).catch((err) => {
      this._status("error", err.message);
      this.emit("status");
    });
  }

  async sync() {
    if (this.meta.mode !== "drive") return;
    if (this._syncing) { this._again = true; return; }
    if (!this.drive.tokenValid()) { this._status(); this.emit("status"); return; }
    if (!navigator.onLine) { this._status(); this.emit("status"); return; }
    this._syncing = true;
    this._status("syncing");
    this.emit("status");
    const sending = this.meta.pending.length;
    const before = JSON.stringify(this.data);
    try {
      if (!this.meta.email) {
        const me = await this.drive.about();
        this.meta.email = me?.user?.emailAddress || null;
        if (this.meta.email) this.drive.setHint(this.meta.email);
      }
      let remote = this.meta.fileId ? await this.drive.getMeta(this.meta.fileId) : null;
      if (!remote || remote.trashed) remote = await this.drive.find("data");
      let result;
      if (!remote) {
        // No file in Drive yet: this device's data becomes the Drive file
        const start = this.data || emptyData();
        const stamped = { ...start, updated: new Date().toISOString() };
        const made = await this.drive.create(stamped);
        result = { data: stamped, meta: made };
      } else if (this.meta.adopting) {
        const theirs = normalize(await this.drive.download(remote.id));
        const mine = this.data;
        let keep = "drive";
        if (mine && mine.entries.length && theirs.entries.length && this.chooser) keep = await this.chooser(mine, theirs);
        else if (mine && mine.entries.length && !theirs.entries.length) keep = "device";
        if (keep === "device") {
          const stamped = { ...mine, updated: new Date().toISOString() };
          result = { data: stamped, meta: await this.drive.upload(remote.id, stamped) };
        } else {
          result = { data: theirs, meta: remote };
        }
        this.meta.pending = [];
      } else {
        const changedElsewhere = remote.id !== this.meta.fileId || String(remote.version) !== String(this.meta.version);
        const base = !changedElsewhere && this.base ? this.base : normalize(await this.drive.download(remote.id));
        const ops = this.meta.pending.slice(0, sending);
        let merged = ops.reduce(applyOp, base);
        if (ops.length) {
          merged = { ...merged, updated: new Date().toISOString() };
          result = { data: merged, meta: await this.drive.upload(remote.id, merged) };
        } else {
          result = { data: merged, meta: remote };
        }
      }
      // changes made while we were talking to Drive stay queued and are applied on top
      const later = this.meta.adopting ? [] : this.meta.pending.slice(sending);
      this.meta.adopting = false;
      this.base = result.data;
      this.data = later.reduce(applyOp, result.data);
      this.meta.pending = later;
      this.meta.fileId = result.meta.id;
      this.meta.version = result.meta.version;
      this.meta.link = result.meta.webViewLink || this.meta.link;
      this.meta.lastSync = Date.now();
      this.persist();
      this._status();
      if (later.length) this._again = true;
      this._backupIfDue(result.data);
    } catch (err) {
      if (err instanceof AuthError) this._status();
      else this._status("error", err.message || "Couldn't reach Google Drive.");
    } finally {
      this._syncing = false;
      this.emit(JSON.stringify(this.data) === before ? "status" : "data");
      if (this._again) { this._again = false; this.syncSoon(300); }
    }
  }

  /** Once a week, keep a copy of the Drive file next to it. Best effort: never blocks or breaks a sync. */
  async _backupIfDue(data) {
    if (this._backingUp || !data?.entries?.length || Date.now() - (this.meta.lastBackup || 0) < BACKUP_EVERY) return;
    this._backingUp = true;
    try {
      // The phone or the computer may already have made this week's copy: one copy a week in total.
      const existing = await this.drive.backups();
      const newest = existing.length ? Date.parse(existing[0].createdTime) : 0;
      if (Date.now() - newest < BACKUP_EVERY) {
        this.meta.lastBackup = newest;
        lsSet(KEY_META, this.meta);
        return;
      }
      const name = `savings-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
      await this.drive.create({ ...data, exported: new Date().toISOString() }, { name, kind: "backup" });
      this.meta.lastBackup = Date.now();
      lsSet(KEY_META, this.meta);
      for (const f of existing.slice(BACKUPS_KEPT - 1)) await this.drive.remove(f.id);   // the new one + 7 newest
    } catch { /* try again on the next sync */ }
    finally { this._backingUp = false; }
  }

  /** The user saved a backup file themselves */
  noteManualBackup() {
    this.meta.lastManualBackup = Date.now();
    lsSet(KEY_META, this.meta);
  }

  _status(state = null, text = "") {
    const m = this.meta;
    if (state) { this.status = { state, text }; return; }
    if (m.mode === "local") this.status = { state: "local", text: "Saved on this device only" };
    else if (m.mode !== "drive") this.status = { state: "idle", text: "" };
    else if (!navigator.onLine) this.status = { state: "offline", text: m.pending.length ? "Offline · changes will be saved to Drive later" : "Offline" };
    else if (!this.drive.tokenValid()) this.status = { state: "signin", text: m.pending.length
      ? `${m.pending.length} change${m.pending.length !== 1 ? "s" : ""} not in Drive yet · tap to save`
      : "Tap to get the latest from Google Drive" };
    else if (m.pending.length) this.status = { state: "pending", text: "Saving to Google Drive…" };
    else this.status = { state: "synced", text: m.lastSync ? `Saved to Google Drive · ${new Date(m.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Google Drive" };
  }
}

export const store = new Store();

// ---------------------------------------------------------------------------
// Import from the desktop app (savings.db, read in the browser with sql.js)
// ---------------------------------------------------------------------------
let sqlPromise = null;
function loadSql() {
  if (!sqlPromise) {
    sqlPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "vendor/sql-wasm.js";
      s.onload = () => window.initSqlJs({ locateFile: (f) => `vendor/${f}` }).then(resolve, reject);
      s.onerror = () => { sqlPromise = null; reject(new Error("Couldn't load the importer.")); };
      document.head.appendChild(s);
    });
  }
  return sqlPromise;
}

export async function readDesktopFile(file) {
  const SQL = await loadSql();
  let db;
  try {
    db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
    db.exec("SELECT name FROM sqlite_master");
  } catch {
    throw new Error("This file isn't a Savings Tracker database.");
  }
  try {
    const tables = new Set((db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values || []).map((r) => r[0]));
    if (!tables.has("entries")) throw new Error("This database wasn't made by Savings Tracker.");
    const rows = (sql) => {
      const res = db.exec(sql)[0];
      return res ? res.values.map((v) => Object.fromEntries(res.columns.map((c, i) => [c, v[i]]))) : [];
    };
    const cols = (t) => new Set(rows(`PRAGMA table_info(${t})`).map((r) => r.name));
    const entries = rows("SELECT * FROM entries ORDER BY month").map((r) => ({
      ...r, trip: cols("entries").has("trip") ? (r.trip === null ? null : Boolean(r.trip)) : null,
    }));
    const expenses = tables.has("expenses") ? rows("SELECT * FROM expenses ORDER BY position, id") : [];
    const goals = tables.has("goals") ? rows("SELECT * FROM goals ORDER BY position, id") : [];
    const settings = {};
    if (tables.has("settings")) for (const r of rows("SELECT key, value FROM settings")) {
      try { settings[r.key] = JSON.parse(r.value); } catch { /* skip */ }
    }
    return normalize({ entries, expenses, goals, settings });
  } finally {
    db.close();
  }
}

export async function readBackupFile(file) {
  let raw;
  try { raw = JSON.parse(await file.text()); } catch { throw new Error("This file isn't a Savings Tracker backup."); }
  return normalize(raw);
}
