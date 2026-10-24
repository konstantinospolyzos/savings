// Setting up photo reading: your own Claude API key, kept on this device only.
import { h, sheet, group, caption, footer, alertBox, toast } from "../ui.js";
import { getKey, setKey, testKey } from "../pump.js";

const masked = (k) => (k ? `…${k.slice(-4)}` : "");

/** after(): called once a working key is saved. */
export function openPhotoSetup(ctx, after = null) {
  const current = getKey();
  const input = h("input", { class: "form-input key-input", type: "password", autocomplete: "off", autocapitalize: "off",
    autocorrect: "off", spellcheck: "false", placeholder: current ? `saved (${masked(current)})` : "sk-ant-…", "aria-label": "Claude API key" });
  const status = h("div", { class: "section-footer" });
  const link = (href, text) => h("a", { href, target: "_blank", rel: "noopener" }, text);
  let api = null;

  input.addEventListener("input", () => { status.textContent = ""; status.className = "section-footer"; api?.setRight({ disabled: !input.value.trim() }); });

  async function save(sh) {
    const key = input.value.trim();
    if (!key) return;
    sh.setRight({ text: "Checking…", disabled: true });
    try {
      await testKey(key);
      setKey(key);
      sh.close();
      toast("✓  The key works. Take a photo of the pump next time you refuel");
      after?.();
    } catch (err) {
      if (err.kind === "network") {
        setKey(key);
        sh.close();
        toast("Saved. Couldn't check the key right now (no connection)");
        after?.();
        return;
      }
      status.textContent = err.message;
      status.className = "section-footer tone-text-down";
      sh.setRight({ text: "Save", disabled: false });
    }
  }

  async function remove() {
    const ok = await alertBox({ title: "Remove the key?", message: "Photo reading stops on this device until you add a key again.",
      buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Remove", value: true, style: "destructive" }] });
    if (!ok) return;
    setKey("");
    api.close();
    toast("Removed the key");
  }

  const body = h("div", { class: "form" },
    footer("Take a photo of the pump display (or the receipt) and Claude reads the litres, the price per litre and the amount into the refuel form. You check them and save. The app makes sure litres × price matches the amount, so a misread digit is caught."),
    caption("CLAUDE API KEY"),
    group(h("label", { class: "form-row" }, h("span", { class: "form-label" }, "Key"), input)),
    status,
    h("div", { class: "section-footer steps" },
      h("b", null, "Getting a key: "), "sign in at ", link("https://console.anthropic.com", "console.anthropic.com"),
      ", add a little credit under Billing, then create a key under API keys and paste it here. ",
      "A photo costs a fraction of an öre; when the numbers don't add up the app takes a second, more careful look, about 20 öre."),
    footer("The key is saved only on this device: it's not in your Google Drive file or the backups. To be safe, set a monthly spend limit in the Console. The photo goes to Anthropic only to read the numbers; the app doesn't keep it."),
    current ? h("button", { type: "button", class: "btn destructive-row", onclick: remove }, `Remove the key (${masked(current)})`) : null);

  api = sheet({ title: "Pump Photos", left: { text: "Cancel" }, right: { text: "Save", bold: true, disabled: true, onClick: save }, body });
  if (matchMedia("(pointer: fine)").matches) setTimeout(() => input.focus(), 350);
  return api;
}
