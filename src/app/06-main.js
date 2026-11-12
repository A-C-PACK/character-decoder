// ---------------------------------------------------------------- routes, start-up
function route() {
  const h = (location.hash || "#home").slice(1);
  const m = h.match(/^c-([0-9a-f]{4,6})$/i);
  if (m) {
    const ch = String.fromCodePoint(parseInt(m[1], 16));
    return { kind: "decode", key: h, make: () => decodeView(ch) };
  }
  return { kind: "home", key: "home", make: homeView, anchor: ["what", "about", "lookup"].includes(h) ? h : null };
}

let lastKey = null;
function render(force) {
  const r = route();
  const view = $("#view");
  try { window.speechSynthesis?.cancel(); } catch (e) { /* no speech */ }
  if (r.key === lastKey && !force && view.firstChild) {
    if (r.anchor) document.getElementById(r.anchor)?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth" });
    return;
  }
  lastKey = r.key;
  view.replaceChildren(r.make());
  document.body.dataset.view = r.kind;
  if (r.anchor) requestAnimationFrame(() => document.getElementById(r.anchor)?.scrollIntoView());
  else window.scrollTo({ top: 0 });
}

function start() {
  $("#brand-seal").append(hanzi("解"));
  window.addEventListener("hashchange", () => render());
  render(true);
}
start();
