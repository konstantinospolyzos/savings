// Invoice photos for car logs. A log only holds references ({id, drive}); the pictures themselves live
// in Google Drive, as files in the Savings Tracker folder next to the data file. The phone keeps a
// photo only until it's uploaded (so you can attach one without signal), then deletes its copy.
// Without Drive ("this device only") the phone is the only place, so it keeps them.

const DB_NAME = "savingsTracker-photos";
const STORE_NAME = "photos";
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE_NAME, mode);
    const req = fn(t.objectStore(STORE_NAME));
    t.oncomplete = () => resolve(req?.result ?? null);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const putLocal = (id, blob) => run("readwrite", (s) => s.put(blob, id));
// photos seen in this session, so they don't download again every time (not kept when the app closes)
const memory = new Map();
function remember(id, blob) {
  memory.set(id, blob);
  while (memory.size > 24) memory.delete(memory.keys().next().value);
}
export const getLocal = (id) => run("readonly", (s) => s.get(id)).catch(() => null);
export const deleteLocal = (id) => run("readwrite", (s) => s.delete(id)).catch(() => null);
export const newPhotoId = () => `ph-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Smaller, but sharp enough to read the lines of an invoice (about 300-600 kB). */
export async function shrinkInvoice(file, maxEdge = 2200, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    const s = Math.min(1, maxEdge / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * s);
    canvas.height = Math.round(h * s);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) throw new Error("no blob");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The picture: not uploaded yet (on this device), or from Google Drive. null if not reachable now. */
export async function loadPhoto(store, ref) {
  if (memory.has(ref.id)) return memory.get(ref.id);
  const local = await getLocal(ref.id);
  if (local) return local;
  if (ref.drive && store.mode === "drive" && store.drive.tokenValid()) {
    try {
      const blob = await store.drive.downloadPhoto(ref.drive);
      if (blob) { remember(ref.id, blob); return blob; }
    } catch { /* not reachable now */ }
  }
  return null;
}

/** Remove pictures from this device and (when signed in) from Drive. Best effort. */
export async function removePhotos(store, refs) {
  for (const p of refs || []) {
    memory.delete(p.id);
    await deleteLocal(p.id);
    if (p.drive && store.mode === "drive" && store.drive.tokenValid()) {
      try { await store.drive.remove(p.drive); } catch { /* stays in the Drive folder */ }
    }
  }
}

/** After each sync: upload the photos that aren't in Drive yet, and note their Drive ids in the logs. */
let uploading = false;
export async function uploadPending(store) {
  if (uploading || store.mode !== "drive" || !store.drive.tokenValid() || !store.data) return;
  uploading = true;
  try {
    for (const car of store.data.cars || []) {
      for (const log of car.logs) {
        const todo = (log.photos || []).filter((p) => !p.drive);
        if (!todo.length) continue;
        const done = new Map();
        for (const p of todo) {
          const blob = await getLocal(p.id);
          if (!blob) continue;                                   // taken on another device: it uploads it
          const made = await store.drive.uploadPhoto(blob, `${car.make || "car"}-${log.type}-${log.date}-${p.id}.jpg`.toLowerCase().replace(/[^a-z0-9.-]+/g, "-"));
          if (made?.id) { done.set(p.id, made.id); remember(p.id, blob); }
        }
        if (!done.size) continue;
        // the log as it is now (it may have changed meanwhile)
        const fresh = store.data.cars.find((c) => c.id === car.id)?.logs.find((l) => l.id === log.id);
        if (fresh) store.saveCarLog(car.id, { ...fresh, photos: fresh.photos.map((p) => (done.has(p.id) ? { ...p, drive: done.get(p.id) } : p)) });
        for (const id of done.keys()) await deleteLocal(id);      // in Drive now: the phone's copy can go
      }
    }
  } catch { /* offline or signed out: tried again after the next sync */ }
  finally { uploading = false; }
}
