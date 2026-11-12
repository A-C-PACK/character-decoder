// ---------------------------------------------------------------- which character was drawn?
// Every character's strokes are stored as five points each, in a box that hugs the character (see prep.py).
// A drawing is cut down the same way and compared stroke against stroke. Stroke order and direction are
// rewarded when they are right, but a wrong order still finds the character.
const REC = (() => {
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const VAL = {};
  for (let i = 0; i < 64; i++) VAL[B64[i]] = i / 63 - 0.5;
  const K = 5, STEP = K * 2;
  let byCount = null;       // stroke count -> [{ch, rank, pts: Float32Array}]

  function load(text) {
    byCount = {};
    text.split("\n").forEach((line, rank) => {
      const ch = String.fromCodePoint(line.codePointAt(0));
      const code = line.slice(ch.length);
      const pts = new Float32Array(code.length);
      for (let i = 0; i < code.length; i++) pts[i] = VAL[code[i]];
      const n = code.length / STEP;
      (byCount[n] ||= []).push({ ch, rank, pts, n });
    });
  }

  function resample(pts) {
    const seg = [];
    let total = 0;
    for (let i = 0; i + 1 < pts.length; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(d); total += d; }
    if (!total) return Array.from({ length: K }, () => pts[0]);
    const out = [];
    let acc = 0, i = 0;
    for (let j = 0; j < K; j++) {
      const want = (total * j) / (K - 1);
      while (i < seg.length - 1 && acc + seg[i] < want) { acc += seg[i]; i++; }
      const t = seg[i] ? Math.min(1, (want - acc) / seg[i]) : 0;
      out.push([pts[i][0] + t * (pts[i + 1][0] - pts[i][0]), pts[i][1] + t * (pts[i + 1][1] - pts[i][1])]);
    }
    return out;
  }

  /** strokes: [[[x, y], ...], ...] in any units, y pointing down -> the same five-point form as the stored characters */
  function encode(strokes) {
    const rs = strokes.map(resample);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of rs) for (const [x, y] of s) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const size = Math.max(x1 - x0, y1 - y0, 1), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const pts = new Float32Array(rs.length * STEP);
    rs.forEach((s, i) => s.forEach(([x, y], k) => { pts[i * STEP + k * 2] = (x - cx) / size; pts[i * STEP + k * 2 + 1] = (y - cy) / size; }));
    return pts;
  }

  // distance between drawn stroke i and stored stroke j: the five points in order, or backwards at a small price
  function strokeDist(a, i, b, j) {
    let f = 0, r = 0;
    const ao = i * STEP, bo = j * STEP;
    for (let k = 0; k < K; k++) {
      const ax = a[ao + k * 2], ay = a[ao + k * 2 + 1];
      f += Math.hypot(ax - b[bo + k * 2], ay - b[bo + k * 2 + 1]);
      const q = K - 1 - k;
      r += Math.hypot(ax - b[bo + q * 2], ay - b[bo + q * 2 + 1]);
    }
    return Math.min(f, r + 0.4) / K;
  }

  const MISS = 0.3;          // the price of a stroke with no partner
  /** Best one-to-one pairing of strokes (Hungarian method on a square table padded with MISS). */
  function assign(cost, n, m) {
    const N = Math.max(n, m);
    const u = new Float64Array(N + 1), v = new Float64Array(N + 1), p = new Int32Array(N + 1), way = new Int32Array(N + 1);
    const at = (i, j) => (i < n && j < m ? cost[i * m + j] : MISS);
    for (let i = 1; i <= N; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Float64Array(N + 1).fill(Infinity), used = new Uint8Array(N + 1);
      do {
        used[j0] = 1;
        const i0 = p[j0];
        let delta = Infinity, j1 = 0;
        for (let j = 1; j <= N; j++) {
          if (used[j]) continue;
          const cur = at(i0 - 1, j - 1) - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= N; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    let total = 0;
    for (let j = 1; j <= N; j++) total += at(p[j] - 1, j - 1);
    return total / N;
  }

  /** The likeliest characters for a drawing, best first. */
  function match(strokes, limit = 10) {
    if (!byCount || !strokes.length) return [];
    const a = encode(strokes), n = strokes.length;
    const slack = Math.max(2, Math.round(n * 0.25));
    const rough = [];
    for (let m = Math.max(1, n - slack); m <= n + slack; m++) {
      for (const cand of byCount[m] || []) {
        const b = cand.pts, cost = new Float32Array(n * m);
        let fromA = 0;
        const bestB = new Float32Array(m).fill(9);
        for (let i = 0; i < n; i++) {
          let best = 9;
          for (let j = 0; j < m; j++) {
            const d = strokeDist(a, i, b, j);
            cost[i * m + j] = d;
            if (d < best) best = d;
            if (d < bestB[j]) bestB[j] = d;
          }
          fromA += best;
        }
        let fromB = 0;
        for (let j = 0; j < m; j++) fromB += bestB[j];
        rough.push({ cand, cost, m, score: (fromA + fromB) / (n + m) + 0.03 * Math.abs(n - m) });
      }
    }
    rough.sort((x, y) => x.score - y.score);
    const fine = rough.slice(0, 60).map((r) => {
      const { cand, cost, m } = r;
      let s = assign(cost, n, m);
      if (n === m) {            // drawn in the usual order: each stroke already sits opposite its partner
        let inOrder = 0;
        for (let i = 0; i < n; i++) inOrder += cost[i * m + i];
        s = 0.6 * s + 0.4 * Math.min(inOrder / n, s * 1.8);
      } else s *= 1.08;
      // between near ties, the everyday character wins
      return { ch: cand.ch, score: 0.75 * s + 0.25 * r.score + 0.006 * Math.log10(1 + cand.rank / 300) };
    });
    fine.sort((x, y) => x.score - y.score);
    return fine.slice(0, limit);
  }

  return { load, match, ready: () => Boolean(byCount) };
})();
if (typeof module !== "undefined") module.exports = REC;
