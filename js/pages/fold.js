// Cards you can fold down to their title: tap the title to fold or open it. Remembered per card on this device.
import { icon } from "../ui.js";
import { store } from "../store.js";

/**
 * A folder for one page's cards: pref is where the page remembers them, folded the cards it shows folded until
 * you open them. Returns foldable(key, card, open): open shows the card open this time (something in it needs
 * you). The card gets card.unfold().
 */
export function makeFoldable(pref, folded = new Set()) {
  return function foldable(key, el, open = false) {
    if (!el) return el;
    const top = el.firstElementChild;
    const saved = store.pref(pref, {}) || {};
    let isFolded = open ? false : key in saved ? Boolean(saved[key]) : folded.has(key);
    const set = () => { el.classList.toggle("folded", isFolded); top.setAttribute("aria-expanded", String(!isFolded)); };
    const flip = () => {
      isFolded = !isFolded;
      set();
      store.setPref(pref, { ...(store.pref(pref, {}) || {}), [key]: isFolded });
    };
    el.classList.add("foldable");
    top.append(icon("chevron", 16, "fold-chev"));
    top.setAttribute("role", "button");
    top.setAttribute("tabindex", "0");
    top.addEventListener("click", (ev) => { if (!ev.target.closest("button, input, a")) flip(); });
    top.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); flip(); } });
    el.unfold = () => { if (isFolded) flip(); };
    set();
    return el;
  };
}
