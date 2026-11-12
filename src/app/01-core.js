"use strict";
// ---------------------------------------------------------------- data
// The page carries only the list of characters. Everything else is fetched in small files when it is needed:
// data/d/<n>.json (what we know about a character), data/s/<n>.json (its stroke outlines),
// data/rec.txt (for the drawing pad) and data/a/<n>.json (spoken syllables).
const INDEX = window.DECODER_DATA;
const CHARS = [...INDEX.chars];
const RANK = new Map(CHARS.map((c, i) => [c, i]));
const known = (ch) => RANK.has(ch);
const CLIPSET = new Set(INDEX.clips || []);

const files = {};
function getJSON(path) {
  return (files[path] ||= fetch(path).then((r) => { if (!r.ok) throw new Error(path); return r.json(); })
    .catch((e) => { delete files[path]; throw e; }));
}
const entryOf = (ch) => getJSON(`data/d/${ch.codePointAt(0) % INDEX.nData}.json`).then((d) => d[ch]);
const STROKES = Object.assign({}, INDEX.strokes);
const strokesOf = (ch) => (STROKES[ch] ? Promise.resolve(STROKES[ch])
  : getJSON(`data/s/${ch.codePointAt(0) % INDEX.nStroke}.json`).then((d) => { Object.assign(STROKES, d); return STROKES[ch]; }));

// ---------------------------------------------------------------- small helpers
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const SVGNS = "http://www.w3.org/2000/svg";
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** el("div.card", {onclick}, child, child...). An id may follow the classes: el("section.band#how"). */
function el(spec, attrs, ...kids) {
  const [head, id] = spec.split("#");
  const [tag, ...cls] = head.split(".");
  const node = document.createElement(tag || "div");
  if (cls.length) node.className = cls.join(" ");
  if (id) node.id = id;
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") {
      for (const [prop, val] of Object.entries(v)) { if (prop.startsWith("--")) node.style.setProperty(prop, val); else node.style[prop] = val; }
    }
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  const add = (kid) => {
    if (kid === null || kid === undefined || kid === false) return;
    if (Array.isArray(kid)) kid.forEach(add);
    else node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  };
  kids.forEach(add);
  return node;
}

const HAN_RE = /[㐀-鿿]/;
const hashOf = (ch) => "#c-" + ch.codePointAt(0).toString(16);
const zh = (text, cls) => el("span.zh" + (cls ? "." + cls : ""), { lang: "zh-Hans" }, text);
const py = (text) => el("span.py", text);

// ---------------------------------------------------------------- what the visitor typed, kept for this tab
const STORE_KEY = "character-decoder-v1";
let state = { text: "", recent: [] };
try { state = Object.assign(state, JSON.parse(localStorage.getItem(STORE_KEY) || "{}")); } catch (e) { /* private window */ }
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };
function remember(ch) {
  state.recent = [ch, ...state.recent.filter((c) => c !== ch)].slice(0, 14);
  save();
}

// ---------------------------------------------------------------- characters, drawn stroke by stroke
// Every stroke is its own outline, so each part of a character can take its own colour.
// While a stroke is being drawn, a fat line runs along its centre line, clipped to the outline.
let uid = 0;
const STROKE_S = 0.3;
/**
 * hanzi("清", { anim, parts }) -> svg. The outlines must already be loaded (strokesOf).
 * parts: [{ s: [stroke numbers], role: "meaning" | "sound" | "iconic" | "other" }]
 */
function hanzi(ch, opt = {}) {
  const g = STROKES[ch];
  if (!g) return zh(ch, "hz-font");
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 1024 1024");
  svg.setAttribute("class", "hz" + (opt.cls ? " " + opt.cls : ""));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", ch);
  const root = document.createElementNS(SVGNS, "g");
  root.setAttribute("transform", "scale(1,-1) translate(0,-900)");
  svg.append(root);
  const roleOf = {};
  (opt.parts || []).forEach((p, pi) => (p.s || []).forEach((i) => { roleOf[i] = `r-${p.role} part-${pi}`; }));
  const anim = opt.anim && !reduceMotion();
  const n = g.s.length;
  const step = n > 1 ? Math.min(0.22, 2.2 / (n - 1)) : 0;
  g.s.forEach((d, i) => {
    const kind = roleOf[i] || "r-none";
    const path = document.createElementNS(SVGNS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", kind);
    if (!anim) { root.append(path); return; }
    const at = (opt.delay || 0) + i * step;
    const id = "hz" + (++uid);
    const clip = document.createElementNS(SVGNS, "clipPath");
    clip.setAttribute("id", id);
    const cp = document.createElementNS(SVGNS, "path");
    cp.setAttribute("d", d);
    clip.append(cp);
    const line = document.createElementNS(SVGNS, "polyline");
    const m = g.m[i];
    let len = 140;
    for (let k = 1; k < m.length; k++) len += Math.hypot(m[k][0] - m[k - 1][0], m[k][1] - m[k - 1][1]);
    line.setAttribute("points", m.map((p) => p.join(",")).join(" "));
    line.setAttribute("clip-path", `url(#${id})`);
    line.setAttribute("class", "draw " + kind);
    line.style.strokeDasharray = `${len} ${len}`;
    line.style.strokeDashoffset = len;
    line.style.animation = `hz-draw ${STROKE_S}s ${at}s ease-out forwards`;
    path.style.opacity = 0;
    path.style.animation = `hz-show 0.01s ${at + STROKE_S}s forwards`;
    root.append(clip, line, path);
  });
  return svg;
}

// ---------------------------------------------------------------- sound
// Single syllables are recorded clips (the "Serena" voice used on the sister sites). Words and sentences use the
// browser's own Mandarin voice when the device has one.
const MARKS = { ā: "a1", á: "a2", ǎ: "a3", à: "a4", ē: "e1", é: "e2", ě: "e3", è: "e4", ī: "i1", í: "i2", ǐ: "i3", ì: "i4", ō: "o1", ó: "o2",
  ǒ: "o3", ò: "o4", ū: "u1", ú: "u2", ǔ: "u3", ù: "u4", ǖ: "v1", ǘ: "v2", ǚ: "v3", ǜ: "v4", ü: "v0", ń: "n2", ň: "n3", ǹ: "n4" };
/** "qīng" -> "qing1" (light tone 5), the name of its clip */
function clipId(pinyin) {
  let tone = 5, out = "";
  for (const ch of pinyin.toLowerCase()) {
    if (MARKS[ch]) { out += MARKS[ch][0]; if (MARKS[ch][1] !== "0") tone = Number(MARKS[ch][1]); }
    else if (/[a-z]/.test(ch)) out += ch;
  }
  return out + tone;
}
const clipChunk = (id) => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h % INDEX.nAudio; };

let actx = null, playing = null;
const BUFS = {};
function playClip(id) {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    actx.resume();
    const start = (buf) => {
      try { playing?.stop(); } catch (e) { /* already over */ }
      playing = actx.createBufferSource();
      playing.buffer = buf;
      playing.connect(actx.destination);
      playing.start();
    };
    if (BUFS[id]) { start(BUFS[id]); return; }
    getJSON(`data/a/${clipChunk(id)}.json`).then((d) => {
      const bin = atob(d[id]), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return actx.decodeAudioData(bytes.buffer);
    }).then((buf) => { BUFS[id] = buf; start(buf); }).catch(() => {});
  } catch (e) { /* no audio */ }
}

let zhVoice = null;
function findVoice() {
  try {
    const vs = window.speechSynthesis.getVoices().filter((v) => /^zh([-_](CN|Hans))?/i.test(v.lang) && !/HK|TW|yue/i.test(v.lang));
    zhVoice = vs.find((v) => /CN/i.test(v.lang) && v.localService) || vs.find((v) => /CN/i.test(v.lang)) || vs[0] || null;
  } catch (e) { zhVoice = null; }
  document.documentElement.classList.toggle("has-voice", Boolean(zhVoice));
}
if ("speechSynthesis" in window) {
  findVoice();
  try { window.speechSynthesis.addEventListener("voiceschanged", findVoice); } catch (e) { /* older browsers */ }
}
function speak(text) {
  if (!zhVoice) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = zhVoice; u.lang = zhVoice.lang; u.rate = 0.85;
    window.speechSynthesis.speak(u);
  } catch (e) { /* no speech */ }
}

const SPEAKER_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
/** Listen button for one syllable: the recorded clip, or the device voice reading the character when there is no clip. */
function listenSyllable(pinyin, ch) {
  const id = clipId(pinyin);
  const has = CLIPSET.has(id);
  return el("button.listen" + (has ? "" : ".voice-only"), { type: "button", title: "Listen", "aria-label": `Listen to ${pinyin}`,
    onclick: (e) => { e.stopPropagation(); e.preventDefault(); if (has) playClip(id); else speak(ch); }, html: SPEAKER_SVG });
}
/** Listen button for a word or sentence. It only shows on devices that have a Mandarin voice. */
function listenText(text) {
  return el("button.listen.voice-only", { type: "button", title: "Listen (your device's voice)", "aria-label": `Listen to ${text}`,
    onclick: (e) => { e.stopPropagation(); e.preventDefault(); speak(text); }, html: SPEAKER_SVG });
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2800);
}

/** Chinese text in which every character we can decode is a link to its page. */
function tappable(text, current) {
  const out = el("span.zh.tap", { lang: "zh-Hans" });
  for (const ch of text) {
    if (known(ch)) out.append(el("a" + (ch === current ? ".now" : ""), { href: hashOf(ch) }, ch));
    else out.append(ch);
  }
  return out;
}
