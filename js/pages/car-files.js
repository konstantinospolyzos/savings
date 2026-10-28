// Car monitor: invoice photos and PDFs on a log or a car (the tiles, the viewer, PDF.js).
import { h, icon, alertBox, toast, saveFile, pickFile } from "../ui.js";
import { store } from "../store.js";
import { putLocal, deleteLocal, newPhotoId, shrinkInvoice, loadPhoto } from "../photos.js";

/** The pages of a PDF, drawn with PDF.js (in the app, loaded the first time you open a PDF). */
async function drawPdf(blob, into, isOpen) {
  const pdfjs = await import("../../vendor/pdfjs/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("../../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const width = Math.max(320, into.clientWidth || window.innerWidth);
  for (let i = 1; i <= Math.min(doc.numPages, 40) && isOpen(); i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    // sharp enough to zoom in on, without huge pictures (phones limit how big one can be)
    let scale = (width / base.width) * Math.min(3, window.devicePixelRatio || 1) * 1.6;
    scale = Math.min(scale, Math.sqrt(9e6 / (base.width * base.height)));
    const vp = page.getViewport({ scale });
    const canvas = h("canvas", { class: "viewer-page" });
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    into.append(canvas);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  }
  doc.destroy();
}

/** Full screen: a photo or a PDF (tap to zoom in, and scroll). Share opens a PDF in another app; Delete removes it. */
function openPhotoViewer(ref, { onDelete = null, from = "this log" } = {}) {
  let url = null, blob = null, open = true;
  const pdf = Boolean(ref.pdf);
  const img = pdf ? h("div", { class: "viewer-pages" }, h("div", { class: "viewer-missing" }, "Opening…")) : h("img", { class: "viewer-img", alt: "Invoice photo" });
  const scroller = h("div", { class: "viewer-scroll" }, img);
  const share = h("button", { type: "button", class: "viewer-btn", disabled: true, onclick: () => blob && saveFile(ref.name || "invoice.pdf", "application/pdf", blob) }, "Share");
  const wrap = h("div", { class: `viewer${pdf ? " pdf" : ""}`, role: "dialog", "aria-label": pdf ? "PDF" : "Photo" },
    h("div", { class: "viewer-bar" },
      h("button", { type: "button", class: "viewer-btn", onclick: () => close() }, "Done"),
      pdf ? share : h("span", { class: "viewer-hint" }, "Tap to zoom"),
      onDelete ? h("button", { type: "button", class: "viewer-btn danger", onclick: () => remove() }, "Delete") : h("span")),
    scroller);
  scroller.addEventListener("click", () => wrap.classList.toggle("zoom"));
  document.getElementById("layer").appendChild(wrap);
  loadPhoto(store, ref).then((b) => {
    if (b) {
      blob = pdf && b.type !== "application/pdf" ? new Blob([b], { type: "application/pdf" }) : b;
      share.disabled = false;
      if (!pdf) { url = URL.createObjectURL(blob); img.src = url; return; }
      drawPdf(blob, img, () => open).then(() => img.querySelector(".viewer-missing")?.remove()).catch(() => {
        // can't draw it here: the phone's own viewer
        url = URL.createObjectURL(blob);
        img.replaceChildren(h("iframe", { class: "viewer-pdf", src: url, title: ref.name || "PDF" }));
      });
      return;
    }
    img.replaceWith(h("div", { class: "viewer-missing" }, `This ${pdf ? "file" : "photo"} is in your Google Drive. Tap the cloud button at the top of the app to sign in, then open it again.`));
  });
  function close() { open = false; wrap.remove(); if (url) URL.revokeObjectURL(url); }
  async function remove() {
    const ok = await alertBox({ title: `Delete this ${pdf ? "file" : "photo"}?`, message: `It's removed from ${from} when you save.`,
      buttons: [{ text: "Cancel", value: false, style: "cancel" }, { text: "Delete", value: true, style: "destructive" }] });
    if (ok) { close(); onDelete(); }
  }
}

const MAX_PDF = 5 * 1024 * 1024;
const isPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
const thumbs = new Map();          // photo id -> picture URL, for the tiles on the pages (made once)

/**
 * The tiles of a list of photos and PDFs (invoices, papers), with "Add" unless it's read-only. New ones
 * are kept on the device until they're in Google Drive; cancel forgets them, and the ones you delete go
 * when you save.
 */
export function fileGrid(initial, { max = 12, from = "this log", readOnly = false } = {}) {
  let items = (initial || []).map((p) => ({ ...p }));
  const added = new Set();          // added in this sheet: forgotten again if you cancel
  const removed = [];               // already saved ones you deleted: removed when you save
  const urls = [];
  const el = h("div", { class: "invoice-grid amt-soft" });
  function tile(p, i) {
    const t = h("button", { type: "button", class: `invoice-tile${p.pdf ? " pdf" : ""}`, "aria-label": p.pdf ? p.name || "PDF" : `Photo ${i + 1}` });
    t.addEventListener("click", () => openPhotoViewer(p, readOnly ? {} : { from, onDelete: () => {
      items = items.filter((x) => x.id !== p.id);
      if (added.has(p.id)) { added.delete(p.id); deleteLocal(p.id); } else removed.push(p);
      draw();
    } }));
    if (p.pdf) { t.append(icon("pdf", 28), h("span", { class: "invoice-name" }, p.name || "PDF")); return t; }
    if (readOnly && thumbs.has(p.id)) { t.append(h("img", { src: thumbs.get(p.id), alt: "" })); return t; }
    loadPhoto(store, p).then((blob) => {
      if (!blob) { t.append(icon("cloud", 22, "invoice-missing")); return; }
      const u = URL.createObjectURL(blob);
      if (readOnly) thumbs.set(p.id, u); else urls.push(u);
      t.append(h("img", { src: u, alt: "" }));
    });
    return t;
  }
  function draw() {
    for (const u of urls.splice(0)) URL.revokeObjectURL(u);
    const tiles = items.map(tile);
    if (readOnly) { el.replaceChildren(...tiles); return; }
    const add = h("button", { type: "button", class: "invoice-tile add" }, icon("camera", 22), h("span", null, items.length ? "Add more" : "Add"));
    add.addEventListener("click", async () => {
      const files = await pickFile("image/*,application/pdf", true);
      if (!files?.length) return;
      add.disabled = true;
      for (const f of files) {
        if (items.length >= max) { toast(`Up to ${max} files here`); break; }
        if (isPdf(f) && f.size > MAX_PDF) { toast(`${f.name} is over 5 MB: a photo of it works too`); continue; }
        try {
          const blob = isPdf(f) ? f.slice(0, f.size, "application/pdf") : await shrinkInvoice(f);
          const id = newPhotoId();
          await putLocal(id, blob);
          items.push(isPdf(f) ? { id, drive: null, pdf: true, name: (f.name || "invoice.pdf").slice(0, 80) } : { id, drive: null });
          added.add(id);
        } catch { toast(`Couldn't add ${f.name || "that file"}`); }
      }
      draw();
    });
    el.replaceChildren(...tiles, add);
  }
  draw();
  return {
    el, list: () => items, removed, isAdded: (id) => added.has(id),
    /** When the sheet closes: the picture URLs go, and without Save the files added here too. */
    close(saved) { for (const u of urls.splice(0)) URL.revokeObjectURL(u); if (!saved) for (const id of added) deleteLocal(id); },
  };
}
