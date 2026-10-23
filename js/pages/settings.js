import { h, sheet, group, caption, footer, icon, alertBox, toast, saveFile, pickFile } from "../ui.js";
import { APP_NAME, APP_VERSION, toCsv } from "../core.js";
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

    parts.push(caption("IMPORT AND BACKUP"));
    parts.push(group(
      actionRow("upload", "Import from the desktop app", () => ctx.importDesktop(), { detail: "Your savings.db file" }),
      actionRow("doc", "Restore a backup", async () => {
        const file = await pickFile(".json,application/json");
        if (!file) return;
        try { await ctx.confirmReplace(await readBackupFile(file), file.name); }
        catch (err) { alertBox({ title: "Can't use that file", message: err.message }); }
      }),
      actionRow("download", "Save a backup", () => saveFile(`savings-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`,
        "application/json", JSON.stringify({ ...store.data, exported: new Date().toISOString() }, null, 1))),
      actionRow("table", "Export for Excel (CSV)", () => {
        if (!store.data.entries.length) { toast("Nothing to export yet"); return; }
        saveFile(`savings-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv", toCsv(store.data.entries));
      }),
    ));
    parts.push(footer("A backup is one file with all your months, fixed costs, goals and settings."));

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
