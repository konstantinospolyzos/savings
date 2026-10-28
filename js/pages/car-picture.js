// Car monitor: the car seen from above (your photo) with its four tyres, for Your tyres and the tyre picker.
import { POS_KEYS } from "../car.js";

// ---------------------------------------------------------------------------
// Your tyres, one by one: a car seen from above with its four tyres
// ---------------------------------------------------------------------------
// The car from above: your photo (img/car-top.webp, 1084 x 525 here), the front to the left. Its tyres where a
// Seat Leon has them: the axles 21 % and 82 % along its 4.37 m, the track 1.54 m of its 1.80 m, 225/45 R17
// tyres (63 cm across, 22.5 cm wide). Seen from above with the front to the left, the right side is at the top.
const TYRE_AT = { FR: [152, 45], RR: [814, 45], FL: [152, 425], RL: [814, 425] };   // the corner of each, 156 x 55
let carSvgN = 0;
export function carSvg(wheelClass = () => "") {
  const glow = `tg${++carSvgN}`;
  const wheels = POS_KEYS.map((p) => {
    const [x, y] = TYRE_AT[p];
    const tread = Array.from({ length: 7 }, (_, i) => `M${x + 20 + i * 19.3} ${y + 11}v33`).join("");
    return `<g class="cm-wheel ${wheelClass(p)}" data-pos="${p}">`
      + `<rect class="cm-hit" x="${x - 70}" y="${y < 200 ? 0 : 330}" width="296" height="195"/>`
      + `<rect class="cm-glow" x="${x}" y="${y}" width="156" height="55" rx="20" filter="url(#${glow})"/>`
      + `<rect class="cm-tyre" x="${x}" y="${y}" width="156" height="55" rx="20"/>`
      + `<path class="cm-tread" d="${tread}"/></g>`;
  }).join("");
  return `<svg class="tm-car" viewBox="0 0 1084 525" aria-hidden="true">`
    + `<defs><filter id="${glow}" x="-25%" y="-70%" width="150%" height="240%"><feGaussianBlur stdDeviation="10"/></filter></defs>`
    + `<image class="cm-photo" href="img/car-top.webp" x="0" y="0" width="1084" height="525"/>${wheels}</svg>`;
}
