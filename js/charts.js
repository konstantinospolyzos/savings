// Touch-friendly SVG charts: lines (balances) and grouped bars (monthly changes).
// Drag a finger (or move the mouse) across a chart to read each month.

import { h, s } from "./ui.js";
import { mIndex, mAbbr, mYear } from "./core.js";

function niceStep(range, count) {
  const raw = range / Math.max(count, 1);
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

function ticks(lo, hi, count = 4) {
  if (hi === lo) hi = lo + 1;
  const step = niceStep(hi - lo, count);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const out = [];
  for (let v = start; v <= end + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** Linear trend (least squares) through ys at positions xs: [slope, intercept] */
export function linearFit(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den ? num / den : 0;
  return [slope, my - slope * mx];
}

/**
 * opts: {
 *   months: ["2026-01", ...],
 *   kind: "line" | "bar",
 *   series: [{ color, values, fill?, trend? }],
 *   format: (v) => axis label,
 *   tooltip: (i) => { title, rows: [[label, value, color]] },
 *   zeroBased: true,
 *   height: 230,
 * }
 */
export function chart(opts) {
  const wrap = h("div", { class: "chart" });
  const tip = h("div", { class: "chart-tip", "aria-hidden": "true" });
  wrap.appendChild(tip);
  let svgEl = null, state = null, active = -1;

  function draw() {
    const W = Math.max(wrap.clientWidth, 200);
    const H = opts.height || 230;
    const pad = { l: 4, r: 52, t: 14, b: 34 };
    const months = opts.months;
    const n = months.length;
    if (svgEl) svgEl.remove();
    svgEl = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "chart-svg", role: "img",
      "aria-label": opts.label || "Chart" });
    if (!n) { wrap.prepend(svgEl); return; }

    const xi = months.map(mIndex);
    const x0 = xi[0], x1 = xi.at(-1);
    const bar = opts.kind === "bar";
    const span = Math.max(x1 - x0, 1);
    const innerL = pad.l + (bar ? 14 : 10), innerR = W - pad.r - (bar ? 14 : 10);
    const X = (i) => (n === 1 ? (innerL + innerR) / 2 : innerL + ((xi[i] - x0) / span) * (innerR - innerL));

    const all = opts.series.flatMap((ser) => ser.values.filter((v) => v !== null));
    let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
    if (!opts.zeroBased) lo = Math.min(...all);
    if (hi === lo) hi = lo + 1;
    hi += (hi - lo) * 0.08;
    const tk = ticks(lo, hi, 4);
    lo = Math.min(lo, tk[0]); hi = Math.max(hi, tk.at(-1));
    const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);

    // grid + axis labels
    for (const t of tk) {
      svgEl.appendChild(s("line", { x1: pad.l, x2: W - pad.r + 4, y1: Y(t), y2: Y(t), class: t === 0 && lo < 0 ? "axis-zero" : "grid" }));
      svgEl.appendChild(s("text", { x: W - pad.r + 8, y: Y(t) + 4, class: "axis-label" }, opts.format(t)));
    }
    const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((innerR - innerL) / 44))));
    months.forEach((m, i) => {
      if ((n - 1 - i) % every) return;
      const showYear = i === 0 || mAbbr(m) === "Jan" || (i >= every && mYear(months[i - every]) !== mYear(m));
      svgEl.appendChild(s("text", { x: X(i), y: H - pad.b + 16, class: "axis-label mid" }, mAbbr(m)));
      if (showYear) svgEl.appendChild(s("text", { x: X(i), y: H - pad.b + 29, class: "axis-label mid year" }, String(mYear(m))));
    });

    const marks = [];
    if (bar) {
      const k = opts.series.length;
      const slot = n > 1 ? Math.min((innerR - innerL) / span, 60) : 60;
      const bw = Math.max(3, Math.min(14, (slot * 0.7) / k));
      opts.series.forEach((ser, j) => {
        ser.values.forEach((v, i) => {
          if (v === null) return;
          const x = X(i) - (k * bw) / 2 + j * bw;
          const y = Math.min(Y(v), Y(0)), hh = Math.max(Math.abs(Y(v) - Y(0)), 1);
          svgEl.appendChild(s("rect", { x, y, width: bw - 1, height: hh, rx: Math.min(3, bw / 3), fill: ser.color, class: "bar" }));
        });
      });
    } else {
      opts.series.forEach((ser) => {
        const pts = ser.values.map((v, i) => [X(i), Y(v)]);
        if (ser.fill && n > 1) {
          const area = `M${pts[0][0]},${Y(Math.max(lo, 0))} ` + pts.map(([x, y]) => `L${x},${y}`).join(" ") + ` L${pts.at(-1)[0]},${Y(Math.max(lo, 0))} Z`;
          svgEl.appendChild(s("path", { d: area, fill: ser.color, class: "area" }));
        }
        if (ser.trend && n > 1) {
          const [a, b] = ser.trend;
          svgEl.appendChild(s("line", { x1: X(0), y1: Y(a * xi[0] + b), x2: X(n - 1), y2: Y(a * xi[n - 1] + b), stroke: ser.color, class: "trend" }));
        }
        if (n > 1) svgEl.appendChild(s("path", { d: pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" "), stroke: ser.color, class: "line" }));
        const r = n <= 18 ? 3.2 : 0;
        const dots = pts.map(([x, y]) => {
          const c = s("circle", { cx: x, cy: y, r: r || 0.01, stroke: ser.color, class: "point" });
          svgEl.appendChild(c);
          return c;
        });
        marks.push(dots);
      });
    }
    const guide = s("line", { x1: 0, x2: 0, y1: pad.t - 6, y2: H - pad.b, class: "guide", visibility: "hidden" });
    svgEl.appendChild(guide);
    const hit = s("rect", { x: 0, y: 0, width: W, height: H, fill: "transparent", class: "hit" });
    svgEl.appendChild(hit);
    wrap.prepend(svgEl);
    state = { X, n, W, guide, marks };
    if (active >= 0 && active < n) show(active); else hide();

    const pick = (ev) => {
      const r = svgEl.getBoundingClientRect();
      const px = ev.clientX - r.left;
      let best = 0, bd = Infinity;
      for (let i = 0; i < n; i++) { const d = Math.abs(X(i) - px); if (d < bd) { bd = d; best = i; } }
      show(best);
    };
    hit.addEventListener("pointerdown", pick);
    hit.addEventListener("pointermove", (ev) => { if (ev.pointerType === "mouse" || ev.buttons || ev.pressure > 0) pick(ev); });
    hit.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse") hide(); });
  }

  function show(i) {
    active = i;
    const { X, W, guide, marks } = state;
    guide.setAttribute("x1", X(i)); guide.setAttribute("x2", X(i)); guide.setAttribute("visibility", "visible");
    marks.forEach((dots) => dots.forEach((c, k) => c.classList.toggle("on", k === i)));
    const t = opts.tooltip(i);
    tip.replaceChildren(h("div", { class: "tip-title" }, t.title),
      ...t.rows.map(([label, value, color]) => h("div", { class: "tip-row" },
        color ? h("span", { class: "dot", style: { background: color } }) : null,
        h("span", { class: "tip-label" }, label), h("span", { class: "tip-value" }, value))));
    tip.classList.add("show");
    const tw = tip.offsetWidth;
    let left = X(i) - tw / 2;
    left = Math.max(0, Math.min(left, W - tw));
    tip.style.left = `${left}px`;
  }

  function hide() {
    active = -1;
    if (!state) return;
    state.guide.setAttribute("visibility", "hidden");
    state.marks.forEach((dots) => dots.forEach((c) => c.classList.remove("on")));
    tip.classList.remove("show");
  }

  const ro = new ResizeObserver(() => { if (wrap.isConnected) draw(); });
  ro.observe(wrap);
  const outside = (ev) => {
    if (!wrap.isConnected) { document.removeEventListener("pointerdown", outside); ro.disconnect(); return; }
    if (!wrap.contains(ev.target)) hide();
  };
  document.addEventListener("pointerdown", outside, { passive: true });
  wrap.redraw = draw;
  return wrap;
}
