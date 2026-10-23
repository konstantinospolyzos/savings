import { h, icon, chip } from "../ui.js";
import { paydayStatus, longDate, daysBetween, fmtRange, paydayFor, addMonths, defaultPeriodMonth } from "../core.js";

const TEXT = {
  budget: ["The budget planner is next",
    "Fixed costs, saving goals, the three saving profiles, your plan for the pay period and the week-by-week living money are being moved over from the desktop app in the next update."],
  insights: ["Insights are coming",
    "Your action plan, month-by-month saving, trip months vs other months, what your notes say, income, investments after tax and the growth projection follow after the budget."],
};

export function renderSoon(kind, ctx) {
  const [title, text] = TEXT[kind];
  const parts = [kind === "budget" ? "Fixed costs and goals first, then your future, and the rest is yours to live on"
    : "How your money actually moves"];
  if (kind === "budget") {
    const today = ctx.today;
    const ps = paydayStatus(today);
    const base = defaultPeriodMonth(today);
    const days = daysBetween(today, ps.next);
    parts.push(h("div", { class: "card payday-mini" },
      h("div", { class: "caption" }, "NEXT PAYDAY"),
      h("div", { class: "stat-value" }, ps.isToday ? "Today" : `${days} day${days !== 1 ? "s" : ""}`),
      h("div", { class: "stat-sub" }, longDate(ps.isToday ? ps.prev : ps.next)),
      ps.isToday ? chip("It's payday today!", "up") : null,
      h("div", { class: "hint" }, `Pay period ${fmtRange(paydayFor(base), paydayFor(addMonths(base, 1)))}`)));
  }
  parts.push(h("div", { class: "card soon" }, icon(kind === "budget" ? "budget" : "insights", 34, "soon-icon"),
    h("div", { class: "empty-title" }, title), h("div", { class: "empty-text" }, text)));
  return parts;
}
