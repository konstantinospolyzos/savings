// The weekly Drive backup (js/store.js), with a stand-in for Google Drive.
import { test } from "node:test";
import assert from "node:assert/strict";
import { store } from "../js/store.js";

const DAY = 86400000;
const data = { entries: [{ month: "2026-10" }] };

/** A pretend Drive holding backups made `ages` days ago (any order). */
function fakeDrive(ages) {
  const files = ages.map((a, i) => ({ id: `b${i}`, createdTime: new Date(Date.now() - a * DAY).toISOString() }));
  const drive = {
    created: [], removed: [],
    async backups() { return [...files].sort((x, y) => Date.parse(y.createdTime) - Date.parse(x.createdTime)); },
    async create(d, opts) { drive.created.push(opts); files.push({ id: `new${drive.created.length}`, createdTime: new Date().toISOString() }); },
    async remove(id) { drive.removed.push(id); files.splice(files.findIndex((f) => f.id === id), 1); },
    files,
  };
  return drive;
}
function run(ages, lastBackup = null) {
  const drive = fakeDrive(ages);
  store.drive = drive;
  store.meta = { mode: "drive", pending: [], lastBackup };
  store._backingUp = false;
  return store._backupIfDue(data).then(() => drive);
}

test("first backup ever", async () => {
  const d = await run([]);
  assert.equal(d.created.length, 1);
  assert.match(d.created[0].name, /^savings-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(d.created[0].kind, "backup");
  assert.equal(d.removed.length, 0);
});

test("the other device made this week's copy: no second one", async () => {
  const d = await run([2, 9, 16]);
  assert.equal(d.created.length, 0);
  assert.ok(Date.now() - store.meta.lastBackup > 1.9 * DAY);   // Settings shows that copy's date
});

test("keeps the newest 8, deletes older ones", async () => {
  const d = await run([8, 15, 22, 29, 36, 43, 50, 57, 64]);
  assert.equal(d.created.length, 1);
  assert.deepEqual(d.removed.sort(), ["b7", "b8"]);           // 57 and 64 days old
  assert.equal(d.files.length, 8);
});

test("this device backed up recently: Drive isn't even asked", async () => {
  const d = await run([30], Date.now() - DAY);
  assert.equal(d.created.length, 0);
  assert.equal(d.removed.length, 0);
});

test("no months logged yet: nothing to back up", async () => {
  store.drive = fakeDrive([]);
  store.meta = { mode: "drive", pending: [], lastBackup: null };
  await store._backupIfDue({ entries: [] });
  assert.equal(store.drive.created.length, 0);
});

test("a Drive error never breaks anything", async () => {
  store.drive = { backups: async () => { throw new Error("offline"); } };
  store.meta = { mode: "drive", pending: [], lastBackup: null };
  await store._backupIfDue(data);                             // no throw
  assert.equal(store.meta.lastBackup, null);                  // tried again next sync
  assert.equal(store._backingUp, false);
});
