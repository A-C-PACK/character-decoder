"""Turn the downloaded sources into the data files the site loads.

    ~/tools/lessonvenv/bin/python prep.py        # cache/ -> build/ (entries, strokes, drawing index)

Sources (all in cache/, fetched by hand, see README):
  dong/dictionary_char_*.jsonl, dong/dictionary_word_*.jsonl   Dong Chinese character wiki dump (CC BY-SA 4.0)
  graphics.txt                                                 Make Me a Hanzi stroke outlines and centre lines
  ../radicals-site/cache/dictionary.txt                        Make Me a Hanzi dictionary (radical, decomposition)
  cmn_sentences.tsv.bz2, eng_sentences.tsv.bz2, links.tar.bz2  Tatoeba sentences and their translations (CC BY 2.0 FR)
"""
import bz2
import collections
import glob
import json
import math
import re
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "cache"
OUT = ROOT / "build"
sys.path.insert(0, str(CACHE / "pylib"))
import jieba  # noqa: E402
from pypinyin import Style, lazy_pinyin  # noqa: E402

jieba.setLogLevel(60)
N_DATA, N_STROKE = 64, 128

# ---------------------------------------------------------------- pinyin
MARKS = {"ā": "a1", "á": "a2", "ǎ": "a3", "à": "a4", "ē": "e1", "é": "e2", "ě": "e3", "è": "e4", "ī": "i1", "í": "i2", "ǐ": "i3",
         "ì": "i4", "ō": "o1", "ó": "o2", "ǒ": "o3", "ò": "o4", "ū": "u1", "ú": "u2", "ǔ": "u3", "ù": "u4", "ǖ": "v1", "ǘ": "v2",
         "ǚ": "v3", "ǜ": "v4", "ü": "v0", "ń": "n2", "ň": "n3", "ǹ": "n4", "ḿ": "m2"}
INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w"]


def plain(py):
    """'qīng' -> ('qing', 1). The light tone is 5. ü is written v."""
    tone, out = 5, ""
    for ch in py.strip().lower():
        if ch in MARKS:
            out += MARKS[ch][0]
            if MARKS[ch][1] != "0":
                tone = int(MARKS[ch][1])
        elif ch.isalpha():
            out += ch
    return out, tone


def split(syl):
    for i in INITIALS:
        if syl.startswith(i):
            return i, syl[len(i):]
    return "", syl


def sound_match(a, b):
    """How well reading b (the sound part) predicts reading a (the character)."""
    (sa, ta), (sb, tb) = plain(a), plain(b)
    if not sa or not sb:
        return None
    if sa == sb:
        return "same" if ta == tb else "tone"
    (ia, fa), (ib, fb) = split(sa), split(sb)
    # j/q/x + u is the ü sound, and y/w only spell a missing initial
    norm = lambda i, f: ("v" + f[1:] if i in ("j", "q", "x", "y") and f.startswith("u") else f)
    fa, fb = norm(ia, fa), norm(ib, fb)
    if fa == fb:
        return "rhyme"
    if ia == ib and ia:
        return "initial"
    return "far"


RANK = {"same": 0, "tone": 1, "rhyme": 2, "initial": 3, "far": 4}

# ---------------------------------------------------------------- load
print("loading Dong Chinese…")
DONG = {}
for line in open(sorted(glob.glob(str(CACHE / "dong/dictionary_char_*.jsonl")))[-1], encoding="utf8"):
    r = json.loads(line)
    if r.get("char"):
        DONG[r["char"]] = r
WORDS = {}
for line in open(sorted(glob.glob(str(CACHE / "dong/dictionary_word_*.jsonl")))[-1], encoding="utf8"):
    r = json.loads(line)
    if r["simp"] in WORDS:            # 听 is listed twice: once under 聽 (tīng) and once as itself (yǐn)
        old = WORDS[r["simp"]]
        first, second = (old, r) if (old.get("statistics") or {}).get("bookWordCount", 0) >= (r.get("statistics") or {}).get("bookWordCount", 0) else (r, old)
        first["items"] = (first.get("items") or []) + (second.get("items") or [])
        WORDS[r["simp"]] = first
    else:
        WORDS[r["simp"]] = r

MMAH = {}
for line in open(ROOT.parent / "radicals-site/cache/dictionary.txt", encoding="utf8"):
    r = json.loads(line)
    MMAH[r["character"]] = r
GFX = {}
for line in open(CACHE / "graphics.txt", encoding="utf8"):
    r = json.loads(line)
    GFX[r["character"]] = r

CHARS = [c for c in GFX if c in DONG and len(c) == 1 and ord(c) >= 0x3400]


def stat(c, key, default=None):
    return (DONG.get(c, {}).get("statistics") or {}).get(key, default)


def freq_rank(c):
    return min(stat(c, "bookCharRank", 99999), stat(c, "movieCharRank", 99999))


CHARS.sort(key=lambda c: (freq_rank(c), ord(c)))
CHARSET = set(CHARS)
print(len(CHARS), "characters")


def readings(c):
    """[(pinyin, share 0-100)] most used first."""
    pf = DONG.get(c, {}).get("pinyinFrequencies") or []
    pf = [p for p in pf if p.get("pinyin")]
    total = sum(p["count"] for p in pf) or 1
    out = [(p["pinyin"].strip(), round(100 * p["count"] / total)) for p in sorted(pf, key=lambda p: -p["count"])]
    if not out:
        old = [o["pinyin"].strip() for o in DONG.get(c, {}).get("oldPronunciations") or [] if o.get("pinyin")]
        mm = [p for p in MMAH.get(c, {}).get("pinyin") or []]
        seen = []
        for p in mm + old:
            if p and p not in seen:
                seen.append(p)
        out = [(p, 0) for p in seen]
    return out


def is_trad_only(c):
    """A traditional form that simplified text does not use."""
    sv = [s for s in DONG.get(c, {}).get("simpVariants") or [] if s != c]
    # traditional forms carry their simplified partner's counts, so the HSK list (simplified) is what tells them apart
    return bool(sv) and stat(c, "hskLevel", 10) >= 10


# ---------------------------------------------------------------- the sister sites, for links
SIXTY, FAMILY, TONES, CHART = {}, {}, set(), {}
SIS = ROOT.parent
for f in sorted(glob.glob(str(SIS / "radicals-site/src/content/g*.json"))):
    if "games" in f:
        continue
    for rad in json.load(open(f, encoding="utf8"))["radicals"]:
        for g in {rad["glyph"], rad.get("full"), rad.get("alt")} - {None}:
            SIXTY.setdefault(g, [rad["id"], rad["name"].lower()])
for s in json.load(open(SIS / "radicals-site/src/content/families.json", encoding="utf8")):
    for fam in s["families"]:
        FAMILY[fam["glyph"]] = fam["id"]
for s in json.load(open(SIS / "tone-trainer/content.json", encoding="utf8"))["singles"]:
    TONES.add(s["syl"])
# 阝 is two radicals; which one depends on the side it stands on, so it is left to the lesson pages
SIXTY.pop("阝", None)

# ---------------------------------------------------------------- which strokes belong to which part
IDC = {"⿰": 2, "⿱": 2, "⿴": 2, "⿵": 2, "⿶": 2, "⿷": 2, "⿸": 2, "⿹": 2, "⿺": 2, "⿻": 2, "⿲": 3, "⿳": 3}
FORMS = {"氵": "水", "亻": "人", "扌": "手", "忄": "心", "讠": "言", "饣": "食", "纟": "糸", "钅": "金", "艹": "艸", "辶": "辵", "刂": "刀",
         "犭": "犬", "礻": "示", "衤": "衣", "灬": "火", "罒": "网", "⺮": "竹", "阝": "阜", "牜": "牛", "⺼": "肉", "月": "肉",
         "飠": "食", "糹": "糸", "訁": "言", "釒": "金", "爫": "爪", "攵": "攴", "王": "玉", "⻊": "足", "𧾷": "足"}


def tree_paths(ids):
    """{component: [path, ...]} for every node in a decomposition string."""
    found = collections.defaultdict(list)
    pos = 0

    def walk(path):
        nonlocal pos
        if pos >= len(ids):
            return
        ch = ids[pos]
        pos += 1
        if ch in IDC:
            for k in range(IDC[ch]):
                walk(path + [k])
        else:
            found[ch].append(path)

    walk([])
    return found


def part_strokes(c, comps):
    """For each component, the stroke numbers that draw it (or None when the outline data cannot say)."""
    mm = MMAH.get(c)
    if not mm or not mm.get("matches") or len(mm["matches"]) != len(GFX[c]["strokes"]):
        return [None] * len(comps)
    # a path can run deeper than one level: 想 = ⿱相心, and 相 = ⿰木目
    paths = tree_paths(mm.get("decomposition") or "")
    # one level further down, through the parts' own decompositions
    deeper = collections.defaultdict(list)
    for part, plist in list(paths.items()):
        sub = MMAH.get(part, {}).get("decomposition") or ""
        if len(sub) > 1 and "？" not in sub:
            for ch, sl in tree_paths(sub).items():
                for p in plist:
                    for s in sl:
                        deeper[ch].append(p + s)
    used, out = collections.Counter(), []
    for comp in comps:
        names = [comp, FORMS.get(comp)] + [k for k, v in FORMS.items() if v == comp]
        hit = None
        for nm in names:
            cand = paths.get(nm) or deeper.get(nm) if nm else None
            if cand:
                hit = cand[min(used[nm], len(cand) - 1)]
                used[nm] += 1
                break
        if hit is None:
            out.append(None)
            continue
        idx = [i for i, m in enumerate(mm["matches"]) if m is not None and m[:len(hit)] == hit]
        out.append(idx or None)
    return out


# ---------------------------------------------------------------- words
BAD = re.compile(r"fuck|shit|\bcunt|penis|vagina|prostitut|whore|bastard|\bsex\b|sexual|rape|vulgar|damn|bitch|\bass\b|genital|"
                 r"erotic|masturb|ejaculat|\bslut|\bdick\b|\bcock\b|\btits?\b|\bpiss|\bfart|semen|orgasm|porn|homosex|brothel", re.I)
ZW = re.compile("[​‌‍﻿]")


def clean_def(d):
    d = re.sub(r"\s*\[[^\]]*\]", "", d)                 # [pin1 yin1]
    d = re.sub(r"([㐀-鿿]+)\|([㐀-鿿]+)", r"\2", d)   # trad|simp -> simp
    d = re.sub(r"\s*\((?:coll|fig|lit|old|dialect|literary|Tw|slang|bound form|loanword|polite|formal|archaic)\.?\)\s*", " ", d)
    return re.sub(r"\s+", " ", d).strip(" ,;")


def word_info(w):
    """(pinyin, gloss) of a word from CC-CEDICT, or None when it is a name or not for a classroom."""
    r = WORDS.get(w)
    if not r:
        return None
    items = [i for i in r.get("items") or [] if i.get("pinyin") and i.get("definitions")]
    low = [i for i in items if not ZW.sub("", i["pinyin"])[:1].isupper()]
    if not low:
        return None
    it = low[0]
    if len(w) == 1:                   # a character on its own: the entry for its usual reading, not the first one listed
        rd = readings(w)
        same = [i for i in low if rd and ZW.sub("", i["pinyin"]).strip() == rd[0][0]]
        if not same:
            return None
        it = same[0]
    defs = [clean_def(d) for d in it["definitions"]]
    defs = [d for d in defs if d and not re.match(r"(variant of|old variant|see |erhua variant|abbr\. for|also written|used in |"
                                                 r"surname |CL:|also pr\.|Taiwan pr\.)", d)]
    if not defs or any(BAD.search(d) for d in it["definitions"]):
        return None
    gloss = defs[0]
    for d in defs[1:3]:
        if len(gloss) + len(d) < 44:
            gloss += "; " + d
    if len(gloss) > 70:
        gloss = gloss[:67].rsplit(" ", 1)[0] + "…"
    syl = ZW.sub("", it["pinyin"]).split()
    # four-character words read more easily as two pairs
    py = "".join(syl[:2]) + " " + "".join(syl[2:]) if len(w) == 4 and len(syl) == 4 else "".join(syl)
    return py, gloss


def top_words(c, n=8):
    out = []
    for tw in stat(c, "topWords", []) or []:
        w = tw["word"]
        if tw.get("share", 0) < 0.0015 and len(out) >= 3:
            break
        info = word_info(w)
        if not info or len(w) > 4:
            continue
        hsk = (WORDS[w].get("statistics") or {}).get("hskLevel")
        out.append([w, info[0], info[1], hsk if hsk and hsk < 10 else 0, round(100 * tw.get("share", 0))])
        if len(out) >= n:
            break
    return out


# ---------------------------------------------------------------- sentences
print("loading Tatoeba…")
TRAD_ONLY = {c for c in DONG if len(c) == 1 and is_trad_only(c)}
T2S = {c: [s for s in DONG[c]["simpVariants"] if s != c][0] for c in TRAD_ONLY
       if len([s for s in DONG[c]["simpVariants"] if s != c]) == 1}
HAN = re.compile(r"[㐀-鿿]")
cmn = {}
for line in bz2.open(CACHE / "cmn_sentences.tsv.bz2", "rt", encoding="utf8"):
    sid, _, text = line.rstrip("\n").split("\t", 2)
    cmn[int(sid)] = text.strip()
eng = {}
for line in bz2.open(CACHE / "eng_sentences.tsv.bz2", "rt", encoding="utf8"):
    sid, _, text = line.rstrip("\n").split("\t", 2)
    eng[int(sid)] = text.strip()
pair = {}
with tarfile.open(CACHE / "links.tar.bz2", "r:bz2") as tf:
    f = tf.extractfile(tf.getmembers()[0])
    for raw in f:
        a, b = raw.split(b"\t")
        a = int(a)
        if a in cmn:
            b = int(b)
            if b in eng and (a not in pair or len(eng[b]) < len(eng[pair[a]])):
                pair[a] = b
print(len(cmn), "sentences,", len(pair), "with English")

for w in WORDS:                      # so that the words the site shows are cut out whole
    if 1 < len(w) <= 4:
        jieba.add_word(w, freq=None)

STOP = set("的了是我你他她它们在不有这那就也都和很吗呢吧啊着把被给让得地个一么什没对还又而但与及或并等里上下中过到去来能会要想说"
           "做好大小多少人太更最再才只从向为以所其之于将已可这那些每各某本该此两几第")
STOPW = {"这个", "那个", "什么", "我们", "你们", "他们", "她们", "一个", "自己", "可以", "因为", "所以", "如果", "已经", "没有", "不是", "就是",
         "还是", "但是", "时候", "这些", "那些", "这样", "那样", "怎么", "为什么", "一些", "一下", "一点", "知道", "觉得", "现在", "不要",
         "不能", "不会", "应该", "可能", "非常", "真的", "这里", "那里", "这儿", "那儿", "哪里", "一起", "一直", "不太", "得很", "东西",
         "正在", "如何", "几个", "有没有", "多久", "哪儿", "一次", "一块", "一个人", "什么事", "任何", "出来", "起来", "有人", "很多"}
PUNCT = re.compile(r"[，。！？、；：“”‘’（）《》…—,.!?;:\"'()\s·~～-]")
uni, big = collections.Counter(), collections.Counter()
by_word = collections.defaultdict(list)       # word -> [(score, sid)]
SENT = {}
for sid, text in cmn.items():
    simp_native = not any(ch in TRAD_ONLY for ch in text)
    s = "".join(T2S.get(ch, ch) for ch in text)
    if any(ch in TRAD_ONLY for ch in s):
        continue
    toks = [t for t in jieba.cut(s, HMM=False)]
    prev = None
    for t in toks:
        if PUNCT.fullmatch(t) or not HAN.search(t):
            prev = None
            continue
        uni[t] += 1
        if prev:
            big[(prev, t)] += 1
        prev = t
    n_han = len(HAN.findall(s))
    if not simp_native or sid not in pair or not 4 <= n_han <= 15 or re.search(r"[A-Za-z0-9「」『』\u3000]", s):
        continue
    en = eng[pair[sid]]
    if BAD.search(en) or len(en) > 80 or re.search(r"\b(kill|murder|suicide|die[ds]?|dead|death|drunk|beer|wine|whisk|vodka|"
                                                   r"alcohol|smok|cigar|gambl|naked|kiss)", en, re.I):
        continue
    if any(ch not in CHARSET for ch in HAN.findall(s)):
        continue
    # the translations are linked by volunteers and some are loose: drop a pair when only one side says "not"
    neg_zh = bool(re.search(r"[不没别未无非]|甭", s))
    neg_en = bool(re.search(r"\b(not|no|never|nothing|nobody|none|neither|nor|without|cannot|can't|won't|un\w+|hardly|few|little)\b|n't", en, re.I))
    if neg_zh != neg_en:
        continue
    hardest = max(freq_rank(ch) for ch in HAN.findall(s))
    if hardest > 3000:
        continue
    SENT[sid] = (s, toks, en)
    score = hardest / 300 + abs(n_han - 8) * 0.6
    for t in set(toks):
        if HAN.search(t):
            by_word[t].append((score, sid))
for w in by_word:
    by_word[w].sort()
print(len(SENT), "usable example sentences")

PUNCT_PY = {"，": ",", "。": ".", "！": "!", "？": "?", "、": ",", "；": ";", "：": ":", "“": "“", "”": "”", "‘": "‘",
            "’": "’", "（": "(", "）": ")", "…": "…", "—": "—", "《": "“", "》": "”"}


def tok_pinyin(t):
    if len(t) > 1:
        info = word_info(t)
        if info:
            return info[0]
    if len(t) == 1 and readings(t) and readings(t)[0][1] >= 90:
        return readings(t)[0][0]
    return "".join(lazy_pinyin(t, style=Style.TONE))


PRONOUN = {"我", "你", "他", "她", "它", "我们", "你们", "他们", "她们", "您", "咱们", "谁"}


def sent_pinyin(toks):
    out, prev = "", None
    for i, t in enumerate(toks):
        nxt = toks[i + 1] if i + 1 < len(toks) else ""
        if not HAN.search(t):
            out = out.rstrip() + PUNCT_PY.get(t, t) + " "
            prev = None
            continue
        # the little words whose reading depends on their job in the sentence
        if t == "地" and prev and len(prev) >= 2:
            py = "de"
        elif t == "得" and prev:
            py = "děi" if prev in PRONOUN else "de"
        elif t == "着" and prev:
            py = "zhe"
        elif t == "穿着" and HAN.search(nxt) and nxt != "的":
            py = "chuānzhe"
        else:
            py = tok_pinyin(t)
        out += py + " "
        prev = t
    out = re.sub(r"\s+([,.!?;:”’)])", r"\1", out).strip()
    out = re.sub(r"([“‘(])\s+", r"\1", out)
    return out[:1].upper() + out[1:]


used_sent = collections.Counter()


def examples(c, words, n=3):
    out, seen = [], set()
    # the character alone only when it really is used alone; otherwise the cut-up sentences give odd examples
    targets = [w[0] for w in words[:6] if len(w[0]) > 1 or w[4] >= 25]
    if c not in targets and not targets:
        targets.append(c)
    for w in targets:
        best = None
        for score, sid in by_word.get(w, [])[:40]:
            if sid in seen:
                continue
            sc = score + used_sent[sid] * 1.5
            if best is None or sc < best[0]:
                best = (sc, sid)
        if best:
            sid = best[1]
            seen.add(sid)
            used_sent[sid] += 1
            s, toks, en = SENT[sid]
            out.append([s, sent_pinyin(toks), en, w])
        if len(out) >= n:
            break
    return out


TOTAL = sum(uni.values())
BIG_BY = collections.defaultdict(list)
for (a, b), k in big.items():
    if k >= 4:
        BIG_BY[a].append((a, b, k))
        BIG_BY[b].append((a, b, k))


def partners(c, words, n=5):
    """Words that often stand right next to this character's words."""
    cands = []
    if c in STOP:
        return []
    heads = [w[0] for w in words[:6]]
    for h in heads:
        if uni[h] < 5:
            continue
        for a, b, k in BIG_BY.get(h, ()):
            other = b if a == h else a
            if other in STOPW or other == h or not 2 <= len(other) <= 3 or not all(ch in CHARSET for ch in other):
                continue
            if a + b in WORDS:       # a pair the dictionary lists as a word belongs with the words, not here
                continue
            info = word_info(other)
            if not info:
                continue
            g = info[1]
            pmi = math.log(k * TOTAL / (uni[a] * uni[b]))
            if pmi < 3.2 or k < 6:
                continue
            cands.append((k * pmi, a, b, h, g))
    cands.sort(reverse=True)
    out, seen = [], set()
    for _, a, b, h, g in cands:
        if a + b in seen:
            continue
        seen.add(a + b)
        other = b if a == h else a
        out.append([a, b, tok_pinyin(a) + " " + tok_pinyin(b), other, g.split(";")[0]])
        if len(out) >= n:
            break
    return out


# ---------------------------------------------------------------- entries
print("building entries…")
by_sound = collections.defaultdict(list)      # sound part -> characters that carry it
for c in CHARS:
    if is_trad_only(c):
        continue
    for comp in DONG[c].get("components") or []:
        if "sound" in (comp.get("type") or []) and freq_rank(c) <= 4000:
            by_sound[comp["character"]].append(c)


def comp_reading(comp, target):
    """The reading of the sound part that sits closest to the character's own reading."""
    rs = [p for p, _ in readings(comp)]
    if not rs:
        return None, None
    if not target:
        return rs[0], None
    best = min(rs, key=lambda p: (RANK.get(sound_match(target, p), 9), rs.index(p)))
    return best, sound_match(target, best)


def kind_of(c, comps, hint):
    roles = [set(x.get("type") or []) for x in comps]
    h = (hint or "").lower()
    has = lambda r: any(r in x for x in roles)
    if has("sound") and (has("meaning") or has("iconic")):
        return "ps"
    if has("sound"):
        return "s"
    if not comps:
        return "pic" if "pictograph" in h or "depict" in h or "picture" in h else "one"
    if all(x <= {"meaning"} for x in roles):
        return "mm"
    if has("iconic"):
        return "pic2"
    return "other"


def tidy_hint(h):
    return re.sub(r"\s+", " ", h or "").strip()


ENTRIES, STROKES = {}, {}
for n, c in enumerate(CHARS):
    d = DONG[c]
    mm = MMAH.get(c, {})
    rd = readings(c)
    main = rd[0][0] if rd else None
    comps = [x for x in d.get("components") or [] if x.get("character")]
    owned = part_strokes(c, [x["character"] for x in comps])
    cs = []
    for x, idx in zip(comps, owned):
        ch = x["character"]
        roles = x.get("type") or []
        item = {"c": ch, "r": roles}
        g = DONG.get(ch, {}).get("gloss")
        if g:
            item["g"] = g
        if "sound" in roles:
            py, m = comp_reading(ch, main)
            if py:
                item["p"] = py
            if m:
                item["m"] = m
            sib = [s for s in by_sound.get(ch, []) if s != c][:10]
            if sib:
                item["sib"] = [[s, readings(s)[0][0] if readings(s) else ""] for s in sib]
            if ch in FAMILY:
                item["fam"] = FAMILY[ch]
        else:
            r0 = readings(ch)
            if r0:
                item["p"] = r0[0][0]
        h = tidy_hint(x.get("hint"))
        if h:
            item["h"] = h
        if x.get("isOldPronunciation"):
            item["old"] = 1
        if x.get("isFromOriginalMeaning"):
            item["om"] = 1
        if idx:
            item["s"] = idx
        if ch in SIXTY and "sound" not in roles:
            item["six"] = SIXTY[ch]
        if ch in CHARSET:
            item["in"] = 1
        cs.append(item)
    words = [] if is_trad_only(c) else top_words(c)
    e = {"n": len(GFX[c]["strokes"])}
    if d.get("gloss"):
        e["g"] = d["gloss"]
    elif mm.get("definition"):
        e["g"] = mm["definition"].split(";")[0]
    if rd:
        e["p"] = [[p, s] for p, s in rd[:4] if s >= 2 or p == main]
    hsk = stat(c, "hskLevel")
    if hsk and hsk < 10:
        e["hsk"] = hsk
    fr = freq_rank(c)
    if fr < 99999:
        e["rk"] = fr
    e["k"] = kind_of(c, comps, d.get("hint"))
    if cs:
        e["c"] = cs
    if d.get("hint"):
        e["o"] = tidy_hint(d["hint"])
    elif (mm.get("etymology") or {}).get("hint") and mm["etymology"].get("type") != "pictophonetic":
        e["o2"] = tidy_hint(mm["etymology"]["hint"])
    if d.get("isVerified"):
        e["v"] = 1
    if d.get("originalMeaning"):
        e["om"] = d["originalMeaning"]
    rad = mm.get("radical")
    if rad:
        e["rad"] = [rad, DONG.get(rad, {}).get("gloss") or DONG.get(FORMS.get(rad, ""), {}).get("gloss") or ""]
        if rad in SIXTY:
            e["rad"].append(SIXTY[rad][0])
    tv = [t for t in d.get("tradVariants") or [] if t != c]
    sv = [s for s in d.get("simpVariants") or [] if s != c]
    if tv:
        e["tr"] = tv[:3]
    if sv:
        e["sp"] = sv[:3]
    if is_trad_only(c):
        e["to"] = 1
    if words:
        e["w"] = words
        ex = examples(c, words)
        if ex:
            e["x"] = ex
        co = partners(c, words)
        if co:
            e["co"] = co
    if main and plain(main)[0] in TONES:
        e["tt"] = plain(main)[0]
    ENTRIES[c] = e
    STROKES[c] = {"s": GFX[c]["strokes"], "m": GFX[c]["medians"]}
    if n % 2000 == 0:
        print(" ", n)

# ---------------------------------------------------------------- drawing index
# Each stroke's centre line, cut to five evenly spaced points, in a box that hugs the character.
B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
K = 5


def resample(pts, k=K):
    seg = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    total = sum(seg)
    if total == 0:
        return [pts[0]] * k
    out, acc, i = [], 0.0, 0
    for j in range(k):
        want = total * j / (k - 1)
        while i < len(seg) - 1 and acc + seg[i] < want:
            acc += seg[i]
            i += 1
        t = 0 if seg[i] == 0 else min(1, (want - acc) / seg[i])
        out.append((pts[i][0] + t * (pts[i + 1][0] - pts[i][0]), pts[i][1] + t * (pts[i + 1][1] - pts[i][1])))
    return out


def rec_code(c):
    strokes = [resample([(x, 900 - y) for x, y in m]) for m in GFX[c]["medians"]]
    xs = [p[0] for s in strokes for p in s]
    ys = [p[1] for s in strokes for p in s]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    size = max(max(xs) - min(xs), max(ys) - min(ys), 1)
    q = lambda v: B64[max(0, min(63, round((v + 0.5) * 63)))]
    return "".join(q((x - cx) / size) + q((y - cy) / size) for s in strokes for x, y in s)


# ---------------------------------------------------------------- write
for sub in ("d", "s"):
    (OUT / sub).mkdir(parents=True, exist_ok=True)
    for old in (OUT / sub).glob("*.json"):
        old.unlink()
dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
chunks = collections.defaultdict(dict)
for c, e in ENTRIES.items():
    chunks[ord(c) % N_DATA][c] = e
for k, v in chunks.items():
    (OUT / "d" / f"{k}.json").write_text(dump(v), encoding="utf8")
chunks = collections.defaultdict(dict)
for c, e in STROKES.items():
    chunks[ord(c) % N_STROKE][c] = e
for k, v in chunks.items():
    (OUT / "s" / f"{k}.json").write_text(dump(v), encoding="utf8")
(OUT / "rec.txt").write_text("\n".join(c + rec_code(c) for c in CHARS), encoding="utf8")
# what the page itself carries: the characters in order of use, and the traditional forms' simplified partners
index = {"chars": "".join(CHARS), "nData": N_DATA, "nStroke": N_STROKE,
         "dump": Path(sorted(glob.glob(str(CACHE / "dong/dictionary_char_*.jsonl")))[-1]).stem.split("_")[-1]}
(OUT / "index.json").write_text(dump(index), encoding="utf8")
# every reading a clip is wanted for
need = collections.Counter()
for c, e in ENTRIES.items():
    for p, s in e.get("p", []):
        syl, tone = plain(p)
        if syl:
            need[f"{syl}{tone}"] += 1
example = {}
for c in CHARS:                                   # the most used character for each reading says it for the clip
    for p, s in ENTRIES[c].get("p", [])[:1]:
        syl, tone = plain(p)
        example.setdefault(f"{syl}{tone}", c)
(OUT / "syllables.json").write_text(json.dumps({k: [example.get(k, ""), need[k]] for k in sorted(need)}, ensure_ascii=False, indent=0),
                                    encoding="utf8")
size = lambda p: sum(f.stat().st_size for f in (OUT / p).glob("*")) / 1e6
print(f"entries {size('d'):.1f} MB, strokes {size('s'):.1f} MB, rec {(OUT / 'rec.txt').stat().st_size / 1e6:.2f} MB, "
      f"{len(need)} readings")
print("kinds", collections.Counter(e["k"] for e in ENTRIES.values()))
print("with words", sum(1 for e in ENTRIES.values() if e.get("w")), "examples", sum(1 for e in ENTRIES.values() if e.get("x")),
      "partners", sum(1 for e in ENTRIES.values() if e.get("co")), "origin", sum(1 for e in ENTRIES.values() if e.get("o")))
