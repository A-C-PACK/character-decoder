// How often does the recogniser find a character from a shaky copy of its own strokes?
//   node tools/rectest.js [samples]
// The copies are made from the stroke centre lines: wobble on every point, each stroke nudged, the whole character
// squeezed, and sometimes two strokes swapped, one stroke drawn backwards, or two strokes joined into one.
const fs = require("fs");
const path = require("path");
const REC = require("../src/app/02-recognise.js");
const root = path.join(__dirname, "..");
REC.load(fs.readFileSync(path.join(root, "build/rec.txt"), "utf8"));
const chars = [...JSON.parse(fs.readFileSync(path.join(root, "build/index.json"), "utf8")).chars];
const gfx = {};
for (const line of fs.readFileSync(path.join(root, "cache/graphics.txt"), "utf8").split("\n")) {
  if (line) { const r = JSON.parse(line); gfx[r.character] = r.medians; }
}
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

function shaky(ch, mode) {
  let strokes = gfx[ch].map((m) => m.map(([x, y]) => [x, 900 - y]));
  const sx = 0.8 + rnd() * 0.4, sy = 0.8 + rnd() * 0.4;
  strokes = strokes.map((s) => {
    const dx = gauss() * 28, dy = gauss() * 28;
    return s.map(([x, y]) => [x * sx + dx + gauss() * 12, y * sy + dy + gauss() * 12]);
  });
  if (mode === "swap" && strokes.length > 2) {
    const i = Math.floor(rnd() * (strokes.length - 1));
    [strokes[i], strokes[i + 1]] = [strokes[i + 1], strokes[i]];
    const j = Math.floor(rnd() * strokes.length);
    strokes[j] = [...strokes[j]].reverse();
  }
  if (mode === "join" && strokes.length > 3) {
    const i = Math.floor(rnd() * (strokes.length - 1));
    strokes.splice(i, 2, [...strokes[i], ...strokes[i + 1]]);
  }
  return strokes;
}

const N = Number(process.argv[2] || 600);
for (const [label, pool] of [["2,500 most used", chars.slice(0, 2500)], ["all", chars]]) {
  for (const mode of ["clean", "swap", "join"]) {
    let top1 = 0, top8 = 0, ms = 0;
    for (let k = 0; k < N; k++) {
      const ch = pool[Math.floor(rnd() * pool.length)];
      const t = Date.now();
      const got = REC.match(shaky(ch, mode), 8).map((g) => g.ch);
      ms += Date.now() - t;
      if (got[0] === ch) top1++;
      if (got.includes(ch)) top8++;
    }
    console.log(`${label.padEnd(16)} ${mode.padEnd(6)} first ${(100 * top1 / N).toFixed(1)}%  in top 8 ${(100 * top8 / N).toFixed(1)}%  ${(ms / N).toFixed(0)} ms each`);
  }
}
