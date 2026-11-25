// The steps on Home (payday, the 1st, before payday) you untick to do again, or tick by hand, by pay period.
// Kept in the data file (period_steps), so your other devices show the same.
import { loadSteps, withStep } from "../core.js";
import { store } from "../store.js";

/** Untick a step to do it again ("redo"), tick one by hand ("done"), or forget it (null). */
export function setStep(base, key, state) {
  store.setSetting("period_steps", withStep(loadSteps(store.data), base, key, state));
}

/** You did a step again (logged, saved, picked): it ticks itself again, so forget that you unticked it. */
export function stepDone(base, ...keys) {
  let all = loadSteps(store.data), changed = false;
  for (const key of keys) if (all[base]?.[key] === "redo") { all = withStep(all, base, key, null); changed = true; }
  if (changed) store.setSetting("period_steps", all);
}
