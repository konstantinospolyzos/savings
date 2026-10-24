// Small iOS-style building blocks: elements, icons, sheets, alerts, toasts, switches.

export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const SVGNS = "http://www.w3.org/2000/svg";
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
  for (const c of children.flat(Infinity)) if (c) el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

// ---------------------------------------------------------------------------
// Icons (simple strokes, tinted with currentColor)
// ---------------------------------------------------------------------------
const ICONS = {
  overview: '<path d="M4 17.5l5.2-5.6 3.6 3.4L20 7.5"/><path d="M15.5 7.5H20V12"/>',
  history: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="4.6" cy="7" r="1.1" fill="currentColor"/><circle cx="4.6" cy="12" r="1.1" fill="currentColor"/><circle cx="4.6" cy="17" r="1.1" fill="currentColor"/>',
  budget: '<circle cx="12" cy="12" r="8.2"/><path d="M12 3.8V12l6.6 4.6" />',
  insights: '<path d="M9.2 17.2h5.6M9.8 20.2h4.4"/><path d="M12 3.6a5.8 5.8 0 0 0-3.4 10.5c.6.5.8 1.1.8 1.8v.4h5.2v-.4c0-.7.2-1.3.8-1.8A5.8 5.8 0 0 0 12 3.6z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  cloud: '<path d="M7.2 18.5h10a4 4 0 0 0 .4-8A5.6 5.6 0 0 0 6.9 9.3 4.6 4.6 0 0 0 7.2 18.5z"/>',
  cloudCheck: '<path d="M7.2 18.5h10a4 4 0 0 0 .4-8A5.6 5.6 0 0 0 6.9 9.3 4.6 4.6 0 0 0 7.2 18.5z"/><path d="M9.6 13.6l1.9 1.9 3.4-3.6"/>',
  cloudUp: '<path d="M7.2 18.5h10a4 4 0 0 0 .4-8A5.6 5.6 0 0 0 6.9 9.3 4.6 4.6 0 0 0 7.2 18.5z"/><path d="M12 16.2v-5M9.9 13.2l2.1-2.1 2.1 2.1"/>',
  cloudOff: '<path d="M7.2 18.5h10a4 4 0 0 0 .4-8A5.6 5.6 0 0 0 6.9 9.3 4.6 4.6 0 0 0 7.2 18.5z"/><path d="M4 4l16 16"/>',
  phone: '<rect x="7" y="2.8" width="10" height="18.4" rx="2.4"/><path d="M10.5 18h3"/>',
  sync: '<path d="M19 8.5A7.5 7.5 0 0 0 5.6 7.4M5 15.5a7.5 7.5 0 0 0 13.4 1.1"/><path d="M19.2 4.2v4.4h-4.4M4.8 19.8v-4.4h4.4"/>',
  chevron: '<path d="M9.5 6l6 6-6 6"/>',
  chevronLeft: '<path d="M14.5 6l-6 6 6 6"/>',
  search: '<circle cx="10.6" cy="10.6" r="6"/><path d="M15.2 15.2l4.6 4.6"/>',
  close: '<path d="M7 7l10 10M17 7L7 17"/>',
  sort: '<path d="M8 5v14M4.8 15.8L8 19l3.2-3.2M16 19V5M12.8 8.2L16 5l3.2 3.2"/>',
  plane: '<path d="M21 12.6l-7.2-3V5.2a1.8 1.8 0 0 0-3.6 0v4.4L3 12.6v2l7.2-1.6v4.2l-2.2 1.6v1.6l4-1 4 1v-1.6l-2.2-1.6v-4.2l7.2 1.6z" fill="currentColor" stroke="none"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19.5h14"/>',
  receipt: '<path d="M6.5 3.5h11v17l-2.2-1.5-2.2 1.5-2.1-1.5-2.2 1.5-2.3-1.5z"/><path d="M9.5 8.5h5M9.5 12h5M9.5 15.5h3"/>',
  doc: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 6.5 20V4a.5.5 0 0 1 .5-.5z"/><path d="M14 3.5V8h4"/>',
  table: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M4 14.5h16M10 10v9"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".9" fill="currentColor"/>',
  share: '<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M7.5 11H6v9.5h12V11h-1.5"/>',
  // car monitor
  car: '<path d="M3.8 16.6v-3.3c0-.8.4-1.5 1.1-1.9l1.1-.6 1.6-3.7A2 2 0 0 1 9.4 6h5.2a2 2 0 0 1 1.8 1.1l1.6 3.7 1.1.6c.7.4 1.1 1.1 1.1 1.9v3.3z"/><path d="M7.4 10.8h9.2"/><path d="M6.2 16.6v1.9M17.8 16.6v1.9"/><circle cx="7.6" cy="13.8" r=".9" fill="currentColor"/><circle cx="16.4" cy="13.8" r=".9" fill="currentColor"/>',
  fuel: '<path d="M5 20.2V5.6A1.6 1.6 0 0 1 6.6 4h5.8A1.6 1.6 0 0 1 14 5.6v14.6"/><path d="M3.6 20.2h11.8"/><path d="M5 10h9"/><path d="M14 8.6l2.5 2.1c.3.3.5.7.5 1.1V17a1.4 1.4 0 0 0 2.8 0V9.2l-2.6-2.6"/>',
  wrench: '<path d="M14.8 6.2a4.1 4.1 0 0 0-5.4 5.4l-5.3 5.3a1.6 1.6 0 0 0 2.3 2.3l5.3-5.3a4.1 4.1 0 0 0 5.4-5.4l-2.6 2.6-2.2-.4-.4-2.2z"/>',
  tyre: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="3.3"/><path d="M12 3.6v5.1M12 15.3v5.1M3.6 12h5.1M15.3 12h5.1"/>',
  check: '<path d="M5 12.6l4.3 4.3L19 7.2"/>',
  euro: '<path d="M17.6 6.6a6.6 6.6 0 1 0 0 10.8"/><path d="M4.6 10.3h8.6M4.6 13.7h8.6"/>',
  charts: '<path d="M4.5 19.5h15"/><rect x="6" y="11.5" width="3" height="5" rx="1"/><rect x="10.5" y="6" width="3" height="10.5" rx="1"/><rect x="15" y="8.5" width="3" height="8" rx="1"/>',
  camera: '<path d="M4 8.6A1.6 1.6 0 0 1 5.6 7h2.2l1.5-2.1h5.4L16.2 7h2.2A1.6 1.6 0 0 1 20 8.6v9a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 17.6z"/><circle cx="12" cy="12.9" r="3.4"/>',
};

export function icon(name, size = 22, extra = "") {
  const span = document.createElement("span");
  span.className = `icon ${extra}`;
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  return span;
}

/** The app icon: green rounded square with a euro sign. */
export function appIcon(size = 64) {
  const span = document.createElement("span");
  span.className = "app-icon";
  span.style.width = span.style.height = `${size}px`;
  span.style.borderRadius = `${size * 0.225}px`;
  span.style.fontSize = `${size * 0.56}px`;
  span.textContent = "€";
  return span;
}

// ---------------------------------------------------------------------------
// Little pieces
// ---------------------------------------------------------------------------
export const chip = (text, tone = "flat", extra = "") => h("span", { class: `chip tone-${tone} ${extra}` }, text);
export const dot = (color, size = 8) => h("span", { class: "dot", style: { background: color, width: `${size}px`, height: `${size}px` } });
export const caption = (text) => h("div", { class: "section-caption" }, text);
export const footer = (text, tone = "") => h("div", { class: `section-footer ${tone ? `tone-text-${tone}` : ""}` }, text);

export function group(...rows) {
  return h("div", { class: "group" }, rows.flat().filter(Boolean));
}

export function segmented(options, index, onChange, extra = "") {
  const el = h("div", { class: `segmented ${extra}`, role: "tablist" });
  options.forEach((text, i) => {
    const b = h("button", { class: i === index ? "on" : "", type: "button", role: "tab", "aria-selected": String(i === index) }, text);
    b.addEventListener("click", () => {
      if (i === index) return;
      index = i;
      [...el.children].forEach((c, k) => { c.classList.toggle("on", k === i); c.setAttribute("aria-selected", String(k === i)); });
      onChange(i);
    });
    el.appendChild(b);
  });
  return el;
}

export function toggle(checked, onChange, label = "") {
  const input = h("input", { type: "checkbox", role: "switch", "aria-label": label });
  input.checked = Boolean(checked);
  input.addEventListener("change", () => onChange(input.checked));
  const el = h("label", { class: "switch" }, input, h("span", { class: "track" }, h("span", { class: "knob" })));
  el.input = input;
  return el;
}

// ---------------------------------------------------------------------------
// Layers: sheets, alerts, toasts
// ---------------------------------------------------------------------------
const layer = () => document.getElementById("layer");
let openSheets = 0;
const lockScroll = (on) => document.documentElement.classList.toggle("locked", on);

/**
 * A full-height iOS sheet that slides up.
 * nav: {left: {text, onClick}, title, right: {text, onClick, bold, disabled}}
 */
export function sheet({ title, left = null, right = null, body, onClose = null, className = "" }) {
  const backdrop = h("div", { class: "sheet-backdrop" });
  const leftBtn = left ? h("button", { class: "nav-link", type: "button" }, left.text) : h("span", { class: "nav-spacer" });
  const rightBtn = right ? h("button", { class: `nav-link ${right.bold ? "bold" : ""}`, type: "button" }, right.text) : h("span", { class: "nav-spacer" });
  const scroller = h("div", { class: "sheet-body" }, body);
  const panel = h("div", { class: `sheet ${className}`, role: "dialog", "aria-modal": "true", "aria-label": title },
    h("div", { class: "sheet-grabber" }),
    h("div", { class: "sheet-nav" }, leftBtn, h("div", { class: "sheet-title" }, title), rightBtn),
    scroller);
  const wrap = h("div", { class: "sheet-wrap" }, backdrop, panel);
  let closed = false;
  const api = {
    el: panel, body: scroller,
    close(result) {
      if (closed) return;
      closed = true;
      wrap.classList.remove("open");
      openSheets -= 1;
      if (!openSheets) lockScroll(false);
      setTimeout(() => wrap.remove(), 320);
      onClose?.(result);
    },
    setRight({ text, disabled } = {}) {
      if (!right) return;
      if (text !== undefined) rightBtn.textContent = text;
      if (disabled !== undefined) rightBtn.disabled = disabled;
    },
  };
  leftBtn.addEventListener?.("click", () => (left.onClick ? left.onClick(api) : api.close()));
  if (right) {
    rightBtn.disabled = Boolean(right.disabled);
    rightBtn.addEventListener("click", () => right.onClick(api));
  }
  backdrop.addEventListener("click", () => (left?.onClick ? left.onClick(api) : api.close()));
  layer().appendChild(wrap);
  openSheets += 1;
  lockScroll(true);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add("open")));
  return api;
}

/** iOS alert. buttons: [{text, value, style: "cancel" | "destructive" | "bold"}] -> Promise(value) */
export function alertBox({ title, message = "", buttons = [{ text: "OK", value: true, style: "bold" }] }) {
  return new Promise((resolve) => {
    const row = h("div", { class: `alert-buttons ${buttons.length > 2 ? "stacked" : ""}` });
    const wrap = h("div", { class: "alert-wrap" },
      h("div", { class: "alert", role: "alertdialog", "aria-label": title },
        h("div", { class: "alert-text" }, h("div", { class: "alert-title" }, title),
          message ? h("div", { class: "alert-message" }, message) : null),
        row));
    for (const b of buttons) {
      const btn = h("button", { type: "button", class: `alert-btn ${b.style || ""}` }, b.text);
      btn.addEventListener("click", () => {
        wrap.classList.remove("open");
        setTimeout(() => wrap.remove(), 200);
        resolve(b.value);
      });
      row.appendChild(btn);
    }
    layer().appendChild(wrap);
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add("open")));
  });
}

let toastTimer = null;
export function toast(text) {
  let el = document.getElementById("toast");
  if (!el) { el = h("div", { id: "toast", role: "status" }); layer().appendChild(el); }
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

/** Save a file: the share sheet on phones (Files, Mail, Drive...), a download elsewhere. */
export async function saveFile(name, type, content) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  try {
    const file = new File([blob], name, { type });
    if (navigator.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (err) {
    if (err?.name === "AbortError") return;
  }
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Ask for a file (must be called from a tap). */
export function pickFile(accept = "", multiple = false) {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept: accept || null, multiple: multiple || null, style: { display: "none" } });
    input.addEventListener("change", () => { resolve(multiple ? [...input.files] : input.files[0] || null); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

/** A rounded bar split into coloured parts: [[value, colour], ...] */
export function splitBar(parts, height = 10) {
  const total = parts.reduce((a, [v]) => a + Math.max(v, 0), 0);
  const el = h("div", { class: "split-bar", style: { height: `${height}px`, borderRadius: `${height / 2}px` } });
  if (total > 0) for (const [v, color] of parts) {
    if (v <= 0) continue;
    el.appendChild(h("span", { style: { flexGrow: String(v), background: color } }));
  }
  return el;
}

/** Key/value row: "Saved per month ........ +2 232 kr" */
export function kv(label, value, { tone = "", amt = true, strong = false } = {}) {
  return h("div", { class: "kv" }, h("span", { class: "kv-label" }, label),
    h("span", { class: `kv-value ${tone ? `tone-text-${tone}` : ""} ${amt ? "amt" : ""} ${strong ? "strong" : ""}` }, value));
}

/** iOS-style picker row using the phone's own wheel / list */
export function selectRow(labelText, options, value, onChange) {
  const sel = h("select", { class: "form-select" }, options.map(([v, text]) => {
    const o = h("option", { value: v }, text);
    if (v === value) o.selected = true;
    return o;
  }));
  sel.addEventListener("change", () => onChange(sel.value));
  const row = h("label", { class: "form-row" }, h("span", { class: "form-label" }, labelText), sel, icon("chevron", 14, "select-chev"));
  row.select = sel;
  return row;
}
