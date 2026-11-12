// ---------------------------------------------------------------- the drawing pad
// Draw a character with a finger or the mouse. After every stroke the likeliest characters appear underneath.
let recLoading = null;
function loadRec() {
  return (recLoading ||= fetch("data/rec.txt").then((r) => { if (!r.ok) throw new Error("rec"); return r.text(); })
    .then((t) => REC.load(t)).catch((e) => { recLoading = null; throw e; }));
}

function drawPad(onPick) {
  const canvas = el("canvas.pad-canvas", { width: 600, height: 600, "aria-label": "Drawing area. Draw one character.", role: "img" });
  const hint = el("p.pad-hint", "Draw one character here");
  const guesses = el("div.guesses", { "aria-live": "polite" });
  const undoBtn = el("button.btn.small.ghost", { type: "button", disabled: true }, "Undo stroke");
  const clearBtn = el("button.btn.small.ghost", { type: "button", disabled: true }, "Clear");
  const strokes = [];
  let cur = null;
  const ctx = canvas.getContext("2d");
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function paint() {
    ctx.clearRect(0, 0, 600, 600);
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.lineWidth = 15;
    ctx.strokeStyle = css("--ink");
    for (const s of cur ? [...strokes, cur] : strokes) {
      ctx.beginPath();
      s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (s.length === 1) ctx.lineTo(s[0][0] + 0.1, s[0][1]);
      ctx.stroke();
    }
    hint.hidden = strokes.length > 0 || Boolean(cur);
    undoBtn.disabled = clearBtn.disabled = !strokes.length;
  }

  function guess() {
    if (!strokes.length) { guesses.replaceChildren(); return; }
    if (!REC.ready()) {
      guesses.replaceChildren(el("span.dim", "Loading the character shapes…"));
      loadRec().then(guess).catch(() => guesses.replaceChildren(el("span.dim", "The character shapes could not be loaded. Check your connection and draw another stroke.")));
      return;
    }
    const found = REC.match(strokes, 8);
    guesses.replaceChildren(el("span.guess-label", "Is it"),
      ...found.map((f) => el("button.guess", { type: "button", "aria-label": `Decode ${f.ch}`, onclick: () => onPick(f.ch) }, zh(f.ch))));
  }

  const at = (ev) => {
    const box = canvas.getBoundingClientRect();
    return [((ev.clientX - box.left) / box.width) * 600, ((ev.clientY - box.top) / box.height) * 600];
  };
  canvas.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic pointer */ }
    cur = [at(ev)];
    paint();
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!cur) return;
    const p = at(ev), last = cur[cur.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 3) { cur.push(p); paint(); }
  });
  const end = () => {
    if (!cur) return;
    strokes.push(cur);
    cur = null;
    paint();
    guess();
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  undoBtn.addEventListener("click", () => { strokes.pop(); paint(); guess(); });
  clearBtn.addEventListener("click", () => { strokes.length = 0; paint(); guess(); });
  paint();
  // fetch the shapes as soon as the pad is on screen, so the first stroke gets an answer at once
  setTimeout(() => loadRec().catch(() => {}), 600);
  return el("div.pad",
    el("div.pad-box", canvas, hint),
    el("div.pad-tools", undoBtn, clearBtn),
    guesses);
}
