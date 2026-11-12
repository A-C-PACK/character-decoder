"""Machine checks on the sentences written for this site, and the files for the review pass.

    ~/tools/lessonvenv/bin/python check_own.py           # cache/own/out_*.jsonl -> cache/own/review_*.json + problems
    ~/tools/lessonvenv/bin/python check_own.py merge     # + cache/own/verdict_*.jsonl -> src/content/own_sentences.json

A sentence passes the machine check when it contains its character and word, is 5-16 characters of plain simplified
Chinese that the decoder knows, and its pinyin can be read off character by character: every syllable must be a
reading the dictionaries list for that character (or that reading without its tone, for the neutral tone).
"""
import glob
import json
import re
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OWN = ROOT / "cache/own"
sys.path.insert(0, str(ROOT / "cache/pylib"))
from pypinyin import Style, pinyin  # noqa: E402

HAN = re.compile(r"[㐀-鿿]")
BAD = re.compile(r"fuck|shit|\\bsex|\\bkill|murder|suicide|\bdie[ds]?\b|dead|death|drunk|beer|wine|alcohol|smok|cigar|gambl|naked|drug|"
                 r"party member|communis", re.I)
TONED = {"ā": "a", "á": "a", "ǎ": "a", "à": "a", "ē": "e", "é": "e", "ě": "e", "è": "e", "ī": "i", "í": "i", "ǐ": "i", "ì": "i",
         "ō": "o", "ó": "o", "ǒ": "o", "ò": "o", "ū": "u", "ú": "u", "ǔ": "u", "ù": "u", "ǖ": "ü", "ǘ": "ü", "ǚ": "ü", "ǜ": "ü",
         "ń": "n", "ň": "n", "ǹ": "n"}
strip = lambda s: "".join(TONED.get(ch, ch) for ch in s)

ENTRY = {}
for f in glob.glob(str(ROOT / "build/d/*.json")):
    ENTRY.update(json.loads(Path(f).read_text(encoding="utf8")))
DONG = {}
for line in open(sorted(glob.glob(str(ROOT / "cache/dong/dictionary_char_*.jsonl")))[-1], encoding="utf8"):
    r = json.loads(line)
    if r.get("char"):
        DONG[r["char"]] = r


@lru_cache(maxsize=None)
def readings(ch):
    out = set()
    d = DONG.get(ch, {})
    for p in d.get("pinyinFrequencies") or []:
        out.add(p["pinyin"].strip().lower())
    for p in d.get("oldPronunciations") or []:
        if p.get("pinyin"):
            out.add(p["pinyin"].strip().lower())
    for p in pinyin(ch, style=Style.TONE, heteronym=True)[0]:
        out.add(p.lower())
    out |= {strip(p) for p in out}          # any reading may lose its tone in a word
    if ch == "儿":
        out.add("r")
    return {p for p in out if p}


def pinyin_fits(zh, py):
    chars = HAN.findall(zh)
    stream = "".join(ch for ch in py.lower() if ch.isalpha())

    @lru_cache(maxsize=None)
    def go(i, at):
        if i == len(chars):
            return at == len(stream)
        return any(stream.startswith(r, at) and go(i + 1, at + len(r)) for r in readings(chars[i]))

    return go(0, 0)


def load():
    rows, skips = [], []
    for f in sorted(glob.glob(str(OWN / "out_*.jsonl"))):
        for n, line in enumerate(open(f, encoding="utf8")):
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except ValueError:
                print("unreadable line", f, n + 1)
                continue
            (skips if "skip" in r else rows).append(r)
    return rows, skips


def problems(r):
    zh, py, en, ch, word = r.get("zh", ""), r.get("py", ""), r.get("en", ""), r.get("ch", ""), r.get("word", "")
    out = []
    han = HAN.findall(zh)
    if not (zh and py and en and ch and word):
        return ["missing field"]
    if ch not in word or word not in zh:
        out.append("word or character not in sentence")
    if not 5 <= len(han) <= 16:
        out.append(f"length {len(han)}")
    if re.search(r"[A-Za-z0-9]", zh) or zh[-1] not in "。？！":
        out.append("letters, digits or no final punctuation")
    if any(c not in ENTRY or ENTRY[c].get("to") for c in han):
        out.append("unknown or traditional character")
    if BAD.search(en):
        out.append("topic")
    if not pinyin_fits(zh, py):
        out.append("pinyin does not fit the characters")
    return out


def main():
    rows, skips = load()
    good, bad = [], []
    seen = set()
    for r in rows:
        why = problems(r)
        if (r.get("ch"), r.get("zh")) in seen:       # one sentence may serve two characters (蜘 and 蛛), not one twice
            why.append("duplicate")
        seen.add((r.get("ch"), r.get("zh")))
        (bad if why else good).append((r, why))
    print(len(rows), "sentences,", len(skips), "characters skipped by the writers,", len(bad), "fail the machine check")
    for r, why in bad[:400]:
        print("  FAIL", r.get("ch"), r.get("zh"), "|", r.get("py"), "|", "; ".join(why))
    good = [r for r, _ in good]
    for i, r in enumerate(good):
        r["id"] = i + 1
    (OWN / "machine_ok.json").write_text(json.dumps(good, ensure_ascii=False, indent=0), encoding="utf8")
    if sys.argv[1:2] != ["merge"]:
        n = 6
        size = -(-len(good) // n)
        for k in range(n):
            part = [{"id": r["id"], "word": r["word"], "zh": r["zh"], "py": r["py"], "en": r["en"]} for r in good[k * size:(k + 1) * size]]
            (OWN / f"review_{k + 1}.json").write_text(json.dumps(part, ensure_ascii=False, indent=0), encoding="utf8")
        print("wrote", n, "review files of about", size)
        return
    verdict = {}
    for f in glob.glob(str(OWN / "verdict_*.jsonl")):
        for line in open(f, encoding="utf8"):
            line = line.strip()
            if line:
                try:
                    v = json.loads(line)
                    verdict[v["id"]] = v
                except (ValueError, KeyError):
                    print("unreadable verdict line in", f)
    kept = {}
    dropped = [r for r in good if not (verdict.get(r["id"]) or {}).get("ok")]
    for r in good:
        if (verdict.get(r["id"]) or {}).get("ok") is True:
            kept.setdefault(r["ch"], []).append([r["zh"], r["py"], r["en"]])
    (ROOT / "src/content/own_sentences.json").write_text(json.dumps(kept, ensure_ascii=False, indent=0, sort_keys=True), encoding="utf8")
    print(len(verdict), "verdicts;", sum(len(v) for v in kept.values()), "sentences kept for", len(kept), "characters;", len(dropped), "dropped by the review")
    for r in dropped[:300]:
        print("  DROP", r["zh"], "|", (verdict.get(r["id"]) or {}).get("why", "no verdict"))


if __name__ == "__main__":
    main()
