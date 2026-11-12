// ---------------------------------------------------------------- home: type, paste or draw
const SAMPLE = "我想喝一杯清水。";
const TRY = ["清", "好", "听", "想", "明", "休", "妈", "森", "饭", "国"];

function lookUp(text) {
  const chars = [...text].filter((c) => HAN_RE.test(c));
  if (!chars.length) { toast("Type or paste some Chinese characters first"); return; }
  const first = chars.find(known);
  if (!first) { toast("None of those characters are in the decoder yet"); return; }
  state.text = chars.length > 1 ? text.trim().slice(0, 300) : "";
  save();
  if (location.hash === hashOf(first)) render(true); else location.hash = hashOf(first);
}

function homeView() {
  const input = el("textarea#lookup-text", { rows: 2, placeholder: "清 or 我想喝一杯清水", lang: "zh-Hans", autocomplete: "off", autocapitalize: "off",
    spellcheck: "false", "aria-label": "Chinese characters to decode" });
  input.value = state.text || "";
  const form = el("form.lookup#lookup", { onsubmit: (ev) => { ev.preventDefault(); lookUp(input.value); } },
    el("label.field-label", { for: "lookup-text" }, "Type or paste"),
    input,
    el("div.lookup-row",
      el("button.btn.primary", { type: "submit" }, "Decode"),
      el("span.dim.small", "One character, a word or a whole sentence")));
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); lookUp(input.value); } });

  const sample = el("div.sample",
    el("p.field-label", "Or start from this sentence"),
    el("div.strip-row", [...SAMPLE].map((c) => (known(c)
      ? el("a.tile", { href: hashOf(c), onclick: () => { state.text = SAMPLE; save(); } }, zh(c))
      : el("span.tile.plain", c)))),
    el("p.dim.small", "I'd like a glass of water. Tap any character."));

  const tryRow = el("div.try",
    el("span.field-label", "Good ones to try"),
    el("div.try-row", TRY.filter(known).map((c) => el("a.guess", { href: hashOf(c), onclick: () => { state.text = ""; save(); } }, zh(c)))));
  const recent = (state.recent || []).filter(known);
  const recentRow = recent.length ? el("div.try",
    el("span.field-label", "You looked at"),
    el("div.try-row", recent.map((c) => el("a.guess", { href: hashOf(c) }, zh(c))))) : null;

  const pad = el("div.draw-side", el("p.field-label", "Or draw it"), drawPad((ch) => { state.text = ""; save(); location.hash = hashOf(ch); }));

  const hero = el("section.hero", el("div.wrap.hero-in",
    el("div.hero-text",
      el("p.eyebrow", "Character decoder"),
      el("h1", "Take any character ", el("span.red", "apart.")),
      el("p.lede", "Paste a character or draw one. See which part carries the meaning, which part carries the sound, the words it lives in, and why it looks the way it does."),
      form, sample, tryRow, recentRow),
    pad));

  const what = el("section.band#what", el("div.wrap",
    el("p.eyebrow", "What you get for each character"),
    el("h2", "Five things, one page"),
    el("ol.five",
      el("li", el("h3", el("i.dot.r-meaning"), "The meaning part"), el("p", "Usually the radical. It tells you what kind of thing the character is about: water, speech, a hand, the heart.")),
      el("li", el("h3", el("i.dot.r-sound"), "The sound part"), el("p", "The other half hints at how to say it. A four-bar meter shows how far you can trust the hint today.")),
      el("li", el("h3", "Words"), el("p", "The everyday words the character appears in, most used first, with pinyin and HSK level.")),
      el("li", el("h3", "Company it keeps"), el("p", "Words that often stand next to it, and short sentences that show it at work.")),
      el("li", el("h3", "Where it comes from"), el("p", "What the people who designed it were picturing, and a line to remember it by.")))));

  const dumpDate = INDEX.dump || "";
  const about = el("section.band#about", el("div.wrap",
    el("p.eyebrow", "Sources"),
    el("h2", "Whose work this is"),
    el("div.credits",
      el("p", "Parts, origin notes and word lists come from the ", el("a.out", { href: "https://www.dong-chinese.com/wiki", target: "_blank", rel: "noopener" }, "Dong Chinese character wiki"),
        dumpDate ? ` (data of ${dumpDate})` : "", ", shared under the Creative Commons Attribution-ShareAlike 4.0 licence. This site's character data is shared under the same licence."),
      el("p", "Stroke outlines, stroke order and dictionary radicals come from ", el("a.out", { href: "https://github.com/skishore/makemeahanzi", target: "_blank", rel: "noopener" }, "Make Me a Hanzi"),
        ". Word meanings come from CC-CEDICT. Example sentences and their translations come from ", el("a.out", { href: "https://tatoeba.org", target: "_blank", rel: "noopener" }, "Tatoeba"),
        " (CC BY 2.0 FR); volunteers wrote them, and the pinyin above each one was added by machine, so the odd tone may be off."),
      el("p", "Sister sites: ", el("a.out", { href: SIXTY_URL, target: "_blank", rel: "noopener" }, "Sixty Radicals"), ", ",
        el("a.out", { href: TONES_URL, target: "_blank", rel: "noopener" }, "Mandarin Tone Trainer"), " and ",
        el("a.out", { href: "https://a-c-pack.github.io/pinyin-starter/", target: "_blank", rel: "noopener" }, "Pinyin Starter"), "."))));

  return el("div.home", hero, what, about);
}
