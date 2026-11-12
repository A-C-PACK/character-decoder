// ---------------------------------------------------------------- one word, and the characters it is made of
const wordHash = (w) => "#w-" + [...w].map((c) => c.codePointAt(0).toString(16)).join("-");
/** Must match word_chunk() in prep.py. */
function wordChunk(w) {
  let h = 0;
  for (const c of w) h = (h * 31 + c.codePointAt(0)) % 9973;
  return h % INDEX.nWord;
}
const wordOf = (w) => getJSON(`data/w/${wordChunk(w)}.json`).then((d) => d[w]);

/** A sentence in which every known character links to its page and the word itself is lit. */
function tappableWord(text, word) {
  const chars = [...text], wl = [...word].length, lit = new Set();
  for (let k = 0; k + wl <= chars.length; k++) {
    if (chars.slice(k, k + wl).join("") === word) for (let j = k; j < k + wl; j++) lit.add(j);
  }
  return el("span.zh.tap", { lang: "zh-Hans" }, chars.map((c, i) => (known(c)
    ? el("a" + (lit.has(i) ? ".now" : ""), { href: hashOf(c) }, c)
    : el("span" + (lit.has(i) ? ".now" : ""), c))));
}

function charCard(c, e, syl) {
  if (!e) return el("li.wchar", el("div.wchar-glyph", zh(c, "hz-font")));
  const comps = e.c || [];
  const parts = comps.map((x) => ({ s: x.s, role: mainRole(x.r || []) }));
  const reading = syl || (e.p && e.p[0] ? e.p[0][0] : "");
  return el("li",
    el("a.wchar", { href: hashOf(c), "aria-label": `${c}, ${e.g || ""}. Take it apart` },
      el("div.wchar-glyph", hanzi(c, { parts })),
      el("div.wchar-body",
        el("div.wchar-top", reading ? py(reading) : null, reading ? listenSyllable(reading, c) : null),
        el("strong.wchar-gloss", e.g || "—"),
        el("span.wchar-kind", (KIND[e.k] || KIND.other)[0]),
        comps.length ? el("ul.wchar-parts", comps.map((x) => el("li.r-" + mainRole(x.r || []), zh(x.c), x.g ? ` ${x.g}` : ""))) : null,
        el("span.wchar-go", "Take it apart"))));
}

function wordView(word) {
  const view = el("section.decode.wordpage");
  const wrap = el("div.wrap");
  view.append(wrap);
  wrap.append(el("p.loading", "Looking up ", zh(word), "…"));
  const chars = [...word];
  Promise.all([wordOf(word).catch(() => null), ...chars.map((c) => (known(c) ? entryOf(c).catch(() => null) : Promise.resolve(null)))])
    .then(([wd, ...ents]) => Promise.all(chars.filter(known).map((c) => strokesOf(c).catch(() => null))).then(() => [wd, ents]))
    .then(([wd, ents]) => { $(".loading", wrap)?.remove(); wrap.append(wordBody(word, wd, ents)); })
    .catch(() => { $(".loading", wrap)?.replaceChildren("This word could not be loaded. Check your connection and try again."); });
  return view;
}

function wordBody(word, wd, ents) {
  const chars = [...word];
  const syl = (wd && wd.s && wd.s.length === chars.length) ? wd.s : [];
  const head = el("header.word-head",
    el("p.eyebrow", "Word"),
    el("h1.word-big", { lang: "zh-Hans" }, word),
    el("div.readings", wd ? el("span.reading", py(wd.p)) : null, listenText(word),
      wd && wd.hsk ? el("span.hsk", wd.hsk >= 7 ? "HSK 7–9" : `HSK ${wd.hsk}`) : null),
    wd ? el("ol.word-defs", wd.d.map((d) => el("li", d))) : el("p.sub", "No dictionary entry for this word."));
  const parts = el("section.sec",
    el("p.eyebrow", chars.length === 2 ? "Its two characters" : `Its ${chars.length} characters`),
    el("ul.wchars", chars.map((c, i) => charCard(c, ents[i], syl[i]))));
  const out = el("div.word-body", head, parts);
  if (wd && wd.x) {
    const own = wd.x.some((x) => x[3]);
    out.append(el("section.sec", el("p.eyebrow", "In a sentence"),
      el("ul.examples", wd.x.map(([s, p, en, mine]) => el("li.example",
        el("div.ex-zh", tappableWord(s, word), listenText(s)),
        el("div.ex-py", py(p)),
        el("div.ex-en", en),
        mine ? el("span.ex-tag", "AI-written, not yet checked by a Chinese speaker") : null))),
      el("p.source", own ? "Examples from Wiktionary, and ones written for this site" : "Examples from Wiktionary")));
  }
  return out;
}
