// ---------------------------------------------------------------- one character, taken apart
const SIXTY_URL = "https://a-c-pack.github.io/sixty-radicals/";
const TONES_URL = "https://a-c-pack.github.io/mandarin-tone-trainer/";
const DONG_URL = "https://www.dong-chinese.com/wiki/";

const KIND = {
  ps: ["Meaning + sound", "One part points to the meaning and another to the sound. Most Chinese characters are built this way."],
  s: ["Built on a sound", "A part was borrowed for its sound. The rest tells this character apart from others that sound alike."],
  mm: ["Two ideas joined", "Every part carries meaning. Put the ideas together and you have the character."],
  pic: ["A picture", "It began as a drawing of the thing itself, and two thousand years of brushwork squared it off."],
  pic2: ["A picture in parts", "The parts were drawn, not spelled: each one shows something you could see."],
  one: ["One shape", "It does not split into smaller parts that mean or sound like anything."],
  other: ["A changed form", "Time or simplification has changed its parts, so they no longer explain it well."],
};
const ROLE_NAME = { meaning: "Meaning part", sound: "Sound part", iconic: "Picture part", simplified: "Shorthand part", remnant: "Worn-down part",
  distinguishing: "Marker", deleted: "Dropped part", unknown: "Unexplained part" };
const ROLE_NOTE = {
  simplified: "A quick stand-in for a fuller shape in the traditional form. It carries no meaning or sound of its own.",
  remnant: "What is left of an older shape. It no longer means or sounds like anything here.",
  distinguishing: "Added only to tell this character apart from a look-alike.",
  unknown: "Scholars do not agree on what this part is doing here.",
};
/** the colour a part takes: sound, meaning and picture parts have one each */
const mainRole = (roles) => ["sound", "meaning", "iconic"].find((r) => roles.includes(r)) || "other";

const MATCH = {
  same: [4, "Exact", "says it exactly"],
  tone: [3, "Same syllable, different tone", "gives the syllable, but not the tone"],
  rhyme: [2, "Rhymes", "only rhymes with it now"],
  initial: [1, "Same first sound", "shares only the first sound now"],
  far: [0, "No longer helps", "has drifted too far to help"],
};

function meter(level) {
  return el("span.meter", { "aria-hidden": "true" }, [0, 1, 2, 3].map((i) => el("i" + (i < level ? ".on" : ""))));
}

function partCard(ch, e, comp, i) {
  const roles = comp.r || [];
  const role = mainRole(roles);
  const isRad = e.rad && (e.rad[0] === comp.c) && role !== "sound";
  const label = roles.includes("sound") && roles.includes("meaning") ? "Sound + meaning part" : ROLE_NAME[roles[0]] || "Part";
  const main = e.p && e.p[0] ? e.p[0][0] : "";
  const glyph = comp.in ? el("a.part-glyph", { href: hashOf(comp.c), title: `Decode ${comp.c}` }, zh(comp.c)) : el("span.part-glyph", zh(comp.c));
  const body = el("div.part-body",
    el("div.part-tags", el("span.role", label), isRad ? el("span.role.rad-tag", "Radical") : null),
    el("div.part-name", comp.g ? el("strong", comp.g) : null, comp.p ? py(comp.p) : null, comp.p ? listenSyllable(comp.p, comp.c) : null));
  if (roles.includes("sound") && comp.m && main) {
    const [level, title, words] = MATCH[comp.m];
    body.append(el("div.match",
      el("div.match-head", meter(level), el("strong", title)),
      el("p", zh(comp.c), " ", py(comp.p), ` ${words}: `, zh(ch), " ", py(main), ".",
        comp.old && level < 3 ? " The two sounded alike when the character was made, about two thousand years ago." : "")));
  }
  if (roles.includes("meaning") && comp.om) body.append(el("p.part-note", `It fits an older meaning of the character${e.om ? `, “${e.om}”` : ""}.`));
  if (comp.h && !/represents the (meaning|sound)/.test(comp.h)) body.append(el("p.part-note", noteText(comp.h)));
  for (const r of roles) if (ROLE_NOTE[r]) body.append(el("p.part-note", ROLE_NOTE[r]));
  if (comp.sib && comp.sib.length) {
    body.append(el("div.sibs", el("span.sibs-label", "Same sound part"),
      comp.sib.map(([s, p]) => el("a.sib", { href: hashOf(s) }, zh(s), p ? py(p) : null))));
  }
  const links = [];
  if (comp.six) links.push(el("a.out", { href: `${SIXTY_URL}#r-${comp.six[0]}`, target: "_blank", rel: "noopener" }, `The ${comp.six[1]} radical in Sixty Radicals`));
  if (comp.fam) links.push(el("a.out", { href: `${SIXTY_URL}#f-${comp.fam}`, target: "_blank", rel: "noopener" }, "This sound family in Sixty Radicals"));
  if (links.length) body.append(el("div.part-links", links));
  const card = el("li.part.r-" + role, { "data-part": i }, glyph, body);
  if (comp.in && comp.c !== ch) subParts(comp, card);
  return card;
}

/** A part that is itself built from parts gets its own breakdown underneath, hung from it like replies in a thread. */
function subParts(comp, card) {
  entryOf(comp.c).then((sub) => {
    const kids = ((sub && sub.c) || []).filter((x) => x.c && x.c !== comp.c);
    if (kids.length < 2) return;
    const kind = (KIND[sub.k] || KIND.other)[0].toLowerCase();
    const note = plainOrigin(sub);
    card.append(el("div.thread",
      el("p.thread-head", zh(comp.c), ` is itself built from ${kids.length === 2 ? "two" : kids.length} parts: ${kind}`),
      note ? el("p.thread-note", noteText(note)) : null,
      el("ul.thread-list", kids.map((k) => {
        const roles = k.r || [];
        return el("li.kid.r-" + mainRole(roles),
          k.in ? el("a.kid-glyph", { href: hashOf(k.c), title: `Decode ${k.c}` }, zh(k.c)) : el("span.kid-glyph", zh(k.c)),
          el("div.kid-body",
            el("span.role", roles.includes("sound") && roles.includes("meaning") ? "Sound + meaning part" : ROLE_NAME[roles[0]] || "Part"),
            el("div.kid-name", k.g ? el("strong", k.g) : null, k.p ? py(k.p) : null, k.p ? listenSyllable(k.p, k.c) : null)));
      }))));
  }).catch(() => { /* the breakdown is extra; the card stands without it */ });
}

/** Chinese inside an English note becomes tappable. */
function noteText(text) {
  const out = document.createDocumentFragment();
  let buf = "", han = "";
  const flush = () => { if (buf) out.append(buf); buf = ""; };
  const flushHan = () => { if (han) out.append(tappable(han)); han = ""; };
  for (const ch of text) {
    if (HAN_RE.test(ch) || /[⺀-⿟]/.test(ch)) { flush(); han += ch; } else { flushHan(); buf += ch; }
  }
  flush(); flushHan();
  return out;
}

/** The wiki's origin note, with its one piece of jargon put into plain words. */
function plainOrigin(e) {
  const text = e.o || e.o2;
  if (!text) return "";
  const gloss = (c) => { const part = (e.c || []).find((x) => x.c === c); return part && part.g ? ` (${part.g})` : ""; };
  const sound = (c) => { const part = (e.c || []).find((x) => x.c === c); return part && part.p ? ` (${part.p})` : ""; };
  return text
    .replace(/Phonosemantic compound\. (\S+) represents the meaning and (\S+) represents the sound\./,
      (m, a, b) => `Its makers took ${a}${gloss(a)} for the meaning and borrowed ${b}${sound(b)} for the sound.`)
    .replace(/Phonosemantic compound\./g, "A meaning-and-sound character.");
}

/** A line to hold on to, built from the parts themselves. */
function memoryLine(ch, e) {
  const comps = e.c || [];
  const main = e.p && e.p[0] ? e.p[0][0] : "";
  const m = comps.find((c) => (c.r || []).includes("meaning") && !(c.r || []).includes("sound") && c.g);
  const s = comps.find((c) => (c.r || []).includes("sound") && c.p);
  if (e.k === "ps" && m && s && e.g) {
    const how = { same: `sounds just like ${s.p}`, tone: `sounds like ${s.p} with a different tone`, rhyme: `rhymes with ${s.p}`,
      initial: `starts like ${s.p}`, far: `once sounded like ${s.p}` }[s.m] || `takes its sound from ${s.p}`;
    return el("p", "Something to do with ", el("strong.c-meaning", m.g), " ", zh(m.c), " that ", el("strong.c-sound", how), " ", zh(s.c), ": ",
      zh(ch), " ", py(main), ", “", e.g, "”.");
  }
  if (e.k === "mm" && comps.length >= 2 && comps.every((c) => c.g) && e.g) {
    return el("p", comps.map((c, i) => [i ? " + " : "", el("strong.c-meaning", c.g), " ", zh(c.c)]), " → “", e.g, "”.");
  }
  return null;
}

function sentenceStrip(ch) {
  const text = state.text || "";
  const chars = [...text].filter((c) => known(c));
  if (chars.length < 2 || !text.includes(ch)) return null;
  return el("nav.strip", { "aria-label": "Your text" },
    el("span.strip-label", "Your text"),
    el("div.strip-row", [...text].map((c) => (known(c)
      ? el("a.tile" + (c === ch ? ".now" : ""), { href: hashOf(c), "aria-current": c === ch ? "true" : null }, zh(c))
      : el("span.tile.plain", c)))));
}

function decodeView(ch) {
  const view = el("section.decode");
  const wrap = el("div.wrap");
  view.append(wrap);
  if (!known(ch)) {
    wrap.append(el("div.empty", el("p.big-zh", zh(ch)), el("h2", "Not in the decoder yet"),
      el("p.sub", "The decoder knows the 9,500 characters that have stroke data. This one is rarer than that."),
      el("a.btn.primary", { href: "#home" }, "Look up another")));
    return view;
  }
  const strip = sentenceStrip(ch);
  if (strip) wrap.append(strip);
  wrap.append(el("p.loading", "Taking ", zh(ch), " apart…"));
  Promise.all([entryOf(ch), strokesOf(ch)]).then(([e]) => {
    $(".loading", wrap)?.remove();
    wrap.append(decodeBody(ch, e));
    remember(ch);
  }).catch(() => {
    $(".loading", wrap)?.replaceChildren("This character's data could not be loaded. Check your connection and try again.");
  });
  return view;
}

function decodeBody(ch, e) {
  const comps = e.c || [];
  const parts = comps.map((c) => ({ s: c.s, role: mainRole(c.r || []) }));
  const main = e.p && e.p[0] ? e.p[0][0] : "";
  const [kindName, kindText] = KIND[e.k] || KIND.other;

  // ---- the character itself
  const stage = el("div.stage");
  const drawIt = (anim) => stage.replaceChildren(hanzi(ch, { parts, anim }));
  drawIt(true);
  const readings = el("div.readings", (e.p || []).map(([p, share], i) => el("span.reading" + (i ? ".minor" : ""),
    py(p), listenSyllable(p, ch), e.p.length > 1 && share ? el("span.share", `${share}%`) : null)));
  const facts = el("ul.facts",
    e.hsk ? el("li", el("strong", e.hsk >= 7 ? "HSK 7–9" : `HSK ${e.hsk}`)) : null,
    e.rk && !e.to ? el("li", "No. ", el("strong", e.rk.toLocaleString("en")), " by use") : null,
    el("li", el("strong", String(e.n)), e.n === 1 ? " stroke" : " strokes"),
    (e.tr || []).map((t) => el("li", "Traditional ", known(t) ? el("a", { href: hashOf(t) }, zh(t)) : zh(t))),
    e.to ? (e.sp || []).map((t) => el("li", "Now written ", known(t) ? el("a", { href: hashOf(t) }, zh(t)) : zh(t))) : null);
  const colours = [...new Set(parts.filter((p) => p.s).map((p) => p.role))];
  const legend = colours.length ? el("ul.legend", colours.map((r) => el("li.r-" + r, el("i"), { meaning: "meaning", sound: "sound", iconic: "picture", other: "other" }[r]))) : null;
  const hero = el("aside.dec-hero",
    el("div.stage-box", stage, el("button.replay", { type: "button", onclick: () => drawIt(true) }, "Draw it again")),
    legend, readings, el("h1.gloss", e.g || "—"), facts);

  // ---- how it is built
  const build = el("section.sec",
    el("p.eyebrow", "How it is built"),
    el("h2", kindName),
    el("p.sub", kindText),
    comps.length ? el("ul.parts", comps.map((c, i) => partCard(ch, e, c, i))) : null);
  if (e.rad) {
    const [rad, radGloss, six] = e.rad;
    const inParts = comps.some((c) => c.c === rad);
    if (!inParts) {
      build.append(el("p.rad-line", "Dictionaries file it under the radical ", known(rad) && rad !== ch ? el("a", { href: hashOf(rad) }, zh(rad)) : zh(rad),
        radGloss ? ` (${radGloss})` : "", rad === ch ? ", which is the character itself" : "", ". ",
        six && !comps.some((c) => c.six) ? el("a.out", { href: `${SIXTY_URL}#r-${six}`, target: "_blank", rel: "noopener" }, "Its lesson in Sixty Radicals") : null));
    }
  }
  // lighting up a part's strokes when its card is under the pointer
  build.addEventListener("pointerover", (ev) => {
    const card = ev.target.closest?.(".part");
    stage.dataset.lit = card ? card.dataset.part : "";
  });
  build.addEventListener("pointerleave", () => { stage.dataset.lit = ""; });

  const body = el("div.dec-body", build);

  if (e.to && e.sp) {
    body.append(el("section.sec", el("p.eyebrow", "Traditional or older form"),
      el("p.sub", "This is a traditional or older way of writing ", (e.sp || []).map((t) => (known(t) ? el("a.inline-zh", { href: hashOf(t) }, zh(t)) : zh(t))),
        ". Words and example sentences are on that character's page.")));
  }

  // ---- words
  if (e.w) {
    body.append(el("section.sec",
      el("p.eyebrow", "Words it is used in"),
      el("ul.words", e.w.map(([w, p, g, hsk]) => el("li.word",
        el("div.word-zh", tappable(w, ch), listenText(w)),
        el("div.word-info", py(p), el("span.word-gloss", g)),
        hsk ? el("span.hsk", hsk >= 7 ? "HSK 7–9" : `HSK ${hsk}`) : el("span.hsk.none", ""))))));
  }

  // ---- what it goes with
  if (e.x) {
    const sec = el("section.sec", el("p.eyebrow", "In a sentence"));
    {
      sec.append(
        el("ul.examples", e.x.map(([s, p, en]) => el("li.example",
          el("div.ex-zh", tappable(s, ch), listenText(s)),
          el("div.ex-py", py(p)),
          el("div.ex-en", en)))));
    }
    sec.append(el("p.source", e.xo
      ? "Sentences written for this site by an AI model and not yet checked by a Chinese speaker."
      : "Examples from Wiktionary"));
    body.append(sec);
  }

  // ---- where it comes from, and how to keep it
  const origin = el("section.sec", el("p.eyebrow", "Where it comes from"));
  const text = plainOrigin(e);
  if (text) {
    origin.append(el("div.origin",
      el("p.origin-text", noteText(text)),
      e.om ? el("p.origin-old", "Original meaning: ", el("strong", e.om), ".") : null,
      el("p.source", e.o ? (text === e.o ? "From the Dong Chinese character wiki" : "From the Dong Chinese character wiki, reworded") : "From Make Me a Hanzi",
        e.v ? el("span.verified", { title: "Checked by the wiki's editors against published research" }, "checked by its editors") : null)));
  } else {
    origin.append(el("p.sub", "No origin note has been written for this character yet."));
  }
  const mem = memoryLine(ch, e);
  if (mem) origin.append(el("div.memory", el("p.memory-label", "To remember it"), mem, el("p.source", "Put together by this site from the parts above")));
  origin.append(el("p.more", el("a.out", { href: DONG_URL + encodeURIComponent(ch), target: "_blank", rel: "noopener" },
    "Its oldest written forms on Dong Chinese")));
  body.append(origin);

  if (e.tt) {
    body.append(el("p.more", el("a.out", { href: `${TONES_URL}#s-${e.tt}`, target: "_blank", rel: "noopener" },
      `Hear ${e.tt} in all four tones in the Mandarin Tone Trainer`)));
  }
  return el("div.dec-grid", hero, body);
}
