import { h, appIcon, icon, alertBox } from "../ui.js";
import { APP_NAME } from "../core.js";
import { store } from "../store.js";

export function renderWelcome() {
  const configured = store.drive.configured;
  const busy = h("div", { class: "welcome-busy" });

  const googleBtn = h("button", { type: "button", class: "btn primary wide", disabled: configured ? null : true }, icon("cloud", 19), "Continue with Google");
  googleBtn.addEventListener("click", () => {
    busy.textContent = "Connecting to Google Drive…";
    googleBtn.disabled = true;
    store.connectDrive()
      .catch((err) => alertBox({ title: "Couldn't connect to Google Drive", message: err.message }))
      .finally(() => { busy.textContent = ""; googleBtn.disabled = false; });
  });

  return h("div", { class: "welcome" },
    appIcon(72),
    h("h1", { class: "welcome-title" }, `Welcome to ${APP_NAME}`),
    h("p", { class: "welcome-text" }, "Log your salary, savings and investments once a month and see where your money goes. First, choose where your data is kept."),
    h("div", { class: "choice-card recommended" },
      h("div", { class: "choice-head" }, icon("cloud", 22, "choice-icon blue"), h("div", { class: "choice-title" }, "Google Drive"), h("span", { class: "chip tone-info" }, "Recommended")),
      h("div", { class: "choice-text" }, "Your data is one file in your own Google Drive, so it's the same on your phone and your computer, and it's backed up."),
      configured ? null : h("div", { class: "choice-note" }, "Not set up for this website yet. See SETUP.md, step 2."),
      googleBtn, busy),
    h("div", { class: "choice-card" },
      h("div", { class: "choice-head" }, icon("phone", 22, "choice-icon"), h("div", { class: "choice-title" }, "Only on this device")),
      h("div", { class: "choice-text" }, "Try the app first. You can move your data to Google Drive later in Settings."),
      h("button", { type: "button", class: "btn tinted wide", onclick: () => store.startLocal() }, "Use on this device")));
}
