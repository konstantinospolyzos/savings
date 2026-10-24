import { h, sheet, group, caption, footer, icon, alertBox, toast, saveFile, pickFile, toggle, selectRow } from "../ui.js";
import {
  APP_NAME, APP_VERSION, toCsv, COUNTRIES, CURRENCIES, currencySettings, configure, convertSecond, fetchMonthlyRates,
  getSetting, DEFAULT_BROKERS, symOf,
} from "../core.js";
import { store, FILE_NAME, FOLDER_NAME, describeData, readBackupFile } from "../store.js";

function actionRow(iconName, text, onClick, { tone = "", detail = "" } = {}) {
  return h("button", { type: "button", class: `action-row ${tone}`, onclick: onClick },
    icon(iconName, 20, "row-icon"),
    h("span", { class: "action-text" }, h("span", null, text), detail ? h("span", { class: "action-detail" }, detail) : null),
    icon("chevron", 15, "chev"));
}

function infoRow(label, value) {
  return h("div", { class: "info-row" }, h("span", { class: "info-label" }, label), h("span", { class: "info-value" }, value));
}

const curName = (code) => `${code} · ${CURRENCIES[code][3]}`;
const NO = { text: "Cancel", value: false, style: "cancel" };

/** Change the currencies. With logged months, the second-currency amounts are converted so nothing breaks. */
async function changeCurrency(next, rebuild) {
  const data = store.data;
  const now = currencySettings(data);
  if (next.second === next.local) next.second = null;
  const es = data.entries;
  const localChanged = next.local !== now.local, secondChanged = next.second !== now.second;
  if (!es.length || (!localChanged && !secondChanged)) {
    store.setSetting("currency", next);
    return;
  }
  const n = `${es.length} logged month${es.length !== 1 ? "s" : ""}`;

  if (localChanged) {
    const ok = await alertBox({ title: `Use ${next.local} for salary and bank?`,
      message: `Your ${n} keep their numbers: they're not converted, only shown in ${symOf(next.local)} from now on. Change this only if you picked the wrong currency before.`,
      buttons: [NO, { text: "Change", value: true, style: "bold" }] });
    if (!ok) { rebuild(); return; }
    const d = JSON.parse(JSON.stringify(data));
    d.settings.currency = next;
    if (!next.second) {           // your new currency is the old second one: investments are already in it
      for (const e of d.entries) e.sek_to_eur = 1;
      for (const x of d.expenses) x.currency = "SEK";
      if (d.settings.inv_basis && typeof d.settings.inv_basis === "object") d.settings.inv_basis.currency = "SEK";
      d.settings.budget_rate = null;
    }
    store.replaceAll(d);
    toast(`✓  Salary and bank in ${next.local}`);
    return;
  }

  // only the second currency changes: convert the investments
  let message, rates = null;
  if (!next.second) {
    message = `Your investments are logged in ${now.second}. They'll be converted to ${now.local} with each month's exchange rate, so everything is in ${now.local}.`;
  } else if (!now.second) {
    message = `Your ${n} are in ${now.local} only. The app fetches each month's ECB exchange rate and shows your investments in ${next.second} too. Needs an internet connection.`;
  } else {
    message = `Your investments are logged in ${now.second}. The app fetches each month's ECB exchange rate and converts them to ${next.second}. Needs an internet connection.`;
  }
  const ok = await alertBox({ title: next.second ? `Add ${next.second} as second currency?` : `Use only ${now.local}?`, message,
    buttons: [NO, { text: next.second ? "Convert" : "Use one currency", value: true, style: "bold" }] });
  if (!ok) { rebuild(); return; }
  if (next.second) {
    toast("Fetching exchange rates…");
    try { rates = await fetchMonthlyRates(es.map((e) => e.month), next.local, next.second); }
    catch (err) {
      alertBox({ title: "Couldn't fetch the exchange rates", message: `Nothing was changed. Check your connection and try again.\n\n(${err.message})` });
      rebuild();
      return;
    }
  }
  const d = convertSecond(data, (m) => (rates ? rates.get(m) : 1));
  d.settings.currency = next;
  store.replaceAll(d);
  toast(next.second ? `✓  Investments now in ${next.second}` : `✓  Everything in ${next.local}`);
  if (store.mode === "drive" && !store.drive.tokenValid()) store.syncFromTap();
}

function currencySection(rebuild) {
  const c = currencySettings(store.data);
  const two = Boolean(c.second);
  const countryRow = selectRow("Country", COUNTRIES.map(([id, name]) => [id, name]), c.country, (id) => {
    const cur = COUNTRIES.find((x) => x[0] === id)?.[2] || c.local;
    changeCurrency({ country: id, local: cur, second: c.second === cur ? null : c.second }, rebuild);
  });
  const codes = Object.keys(CURRENCIES);
  const localRow = selectRow("Your currency", codes.map((k) => [k, curName(k)]), c.local, (code) =>
    changeCurrency({ ...c, local: code, second: c.second === code ? null : c.second }, rebuild));
  const twoRow = h("div", { class: "form-row switch-row" }, h("span", { class: "form-label" }, "Two currencies"),
    toggle(two, (on) => setTimeout(() => changeCurrency({ ...c, second: on ? (c.local === "EUR" ? "USD" : "EUR") : null }, rebuild), 220),
      "Two currencies"));
  const secondRow = two ? selectRow("Second currency", codes.filter((k) => k !== c.local).map((k) => [k, curName(k)]), c.second,
    (code) => changeCurrency({ ...c, second: code }, rebuild)) : null;
  const brokers = getSetting(store.data, "brokers");
  const brokerInput = h("input", { class: "form-input", type: "text", autocomplete: "off", placeholder: "e.g. Avanza",
    value: typeof brokers === "string" ? brokers : DEFAULT_BROKERS, "aria-label": "Where you invest" });
  brokerInput.addEventListener("change", () => store.setSetting("brokers", brokerInput.value.trim()));
  brokerInput.addEventListener("keydown", (ev) => { if (ev.key === "Enter") brokerInput.blur(); });

  const explain = two
    ? `Salary, bank savings and the budget are in ${c.local}. Investments and the Overview totals are in ${c.second}, with the exchange rate you log each month.`
    : `Everything is in ${c.local}: salary, bank savings, investments and the budget.`;
  const local = c.country === "SE" ? " Swedish bank holidays move payday, and the 30% tax on investments is worked out." : "";
  return [
    caption("COUNTRY AND CURRENCY"),
    group(countryRow, localRow, twoRow, secondRow),
    footer(explain + local),
    group(h("label", { class: "form-row" }, h("span", { class: "form-label" }, "Where you invest"), brokerInput)),
    footer("Your broker or investment account, shown in your plan (“To Avanza: long-term money”). Leave it empty if you don't want a name."),
  ];
}

const dayText = (ms) => new Date(ms).toLocaleDateString([], { day: "numeric", month: "short" });
function backupNote() {
  const m = store.meta;
  const base = "A backup is one file with all your months, fixed costs, goals and settings.";
  if (store.mode === "drive")
    return `${base} Google Drive also keeps a copy each week in the “${FOLDER_NAME}” folder (the last 8)${m.lastBackup ? `, latest ${dayText(m.lastBackup)}` : ""}. To go back to one, download it from Drive and use Restore a backup.`;
  return `${base} Your data is only on this device, so save one now and then. Last saved: ${m.lastManualBackup ? dayText(m.lastManualBackup) : "never"}.`;
}

export function openSettings(ctx) {
  const body = h("div", { class: "form" });

  function build() {
    const m = store.meta;
    const parts = [];
    parts.push(caption("WHERE YOUR DATA IS SAVED"));
    if (store.mode === "drive") {
      parts.push(group(
        infoRow("Google Drive", m.email || "signed in"),
        infoRow("File", `My Drive › ${FOLDER_NAME} › ${FILE_NAME}`),
        infoRow("Status", store.status.text || "—"),
        actionRow("sync", "Sync now", () => store.syncFromTap().then(() => toast(store.status.text))),
        m.link ? actionRow("link", "Open the file in Google Drive", () => window.open(m.link, "_blank", "noopener")) : null,
      ));
      parts.push(footer("Your data is one file in your own Google Drive. Every phone or computer that opens this app with your Google account sees the same months. The app can only see the files it made itself."));
      parts.push(group(actionRow("cloudOff", "Stop using Google Drive", async () => {
        const ok = await alertBox({ title: "Stop using Google Drive?",
          message: "Your data stays on this device, and the file in Google Drive is not deleted. You can connect again later.",
          buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Stop", value: true, style: "destructive" }] });
        if (ok) { store.disconnectDrive(); toast("Now saving on this device only"); }
      }, { tone: "danger" })));
    } else {
      parts.push(group(infoRow("This device only", describeData(store.data))));
      if (store.drive.configured) {
        parts.push(group(actionRow("cloud", "Save to Google Drive", () => {
          store.connectDrive().then(() => toast(store.status.text)).catch((err) =>
            alertBox({ title: "Couldn't connect to Google Drive", message: err.message }));
        }, { detail: "Use the same data on your phone and computer" })));
      } else {
        parts.push(footer("Google Drive isn't set up for this website yet. See SETUP.md, step 2."));
      }
    }

    parts.push(...currencySection(build));

    parts.push(caption("PRIVACY"));
    parts.push(group(h("label", { class: "form-row switch-row" },
      h("span", { class: "form-label" }, icon("eyeOff", 18, "inline-icon"), "Hide amounts"),
      toggle(ctx.privacy(), (on) => ctx.setPrivacy(on), "Hide amounts"))));
    parts.push(footer("Blurs balances, salaries, changes and notes so you can show the app to others. Only on this device. The eye button at the top switches it too."));

    parts.push(caption("IMPORT AND BACKUP"));
    parts.push(group(
      actionRow("upload", "Import from the desktop app", () => ctx.importDesktop(), { detail: "Your savings.db file" }),
      actionRow("doc", "Restore a backup", async () => {
        const file = await pickFile(".json,application/json");
        if (!file) return;
        try { await ctx.confirmReplace(await readBackupFile(file), file.name); }
        catch (err) { alertBox({ title: "Can't use that file", message: err.message }); }
      }),
      actionRow("download", "Save a backup", () => {
        saveFile(`savings-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`,
          "application/json", JSON.stringify({ ...store.data, exported: new Date().toISOString() }, null, 1));
        store.noteManualBackup();
      }),
      actionRow("table", "Export for Excel (CSV)", () => {
        if (!store.data.entries.length) { toast("Nothing to export yet"); return; }
        saveFile(`savings-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv", toCsv(store.data.entries));
      }),
    ));
    parts.push(footer(backupNote()));

    parts.push(caption("ON YOUR PHONE"));
    parts.push(group(h("div", { class: "info-text" },
      h("p", null, h("b", null, "iPhone: "), "open this page in Safari, tap the Share button, then “Add to Home Screen”."),
      h("p", null, h("b", null, "Android: "), "open it in Chrome, tap ⋮, then “Add to Home screen” or “Install app”."))));
    parts.push(h("div", { class: "about" }, `${APP_NAME} ${APP_VERSION}  ·  same calculations as the desktop app`));
    body.replaceChildren(...parts.filter(Boolean));
  }

  build();
  const off = store.on(build);
  sheet({ title: "Settings", right: { text: "Done", bold: true, onClick: (api) => api.close() }, left: null, body,
    onClose: off });
}
