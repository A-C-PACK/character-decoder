"""Pull the Mandarin usage examples out of the Wiktionary extract (kaikki.org) -> cache/wikt_examples.json

    python3 wikt.py

Each kept example is [sentence, pinyin, English, the word it illustrates, simplified?, which sense of the word]. Only editors' own examples are kept
(not quotations from books), only ones marked as Mandarin with pinyin, and only the simplified spelling.
"""
import collections
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "cache/kaikki-chinese.jsonl"
OTHER = {"Cantonese", "Jyutping", "Hokkien", "Min-Nan", "Teochew", "Hakka", "Wu", "Gan", "Xiang", "Jin", "Min-Dong", "Min-Bei",
         "Classical-Chinese", "Literary-Chinese", "Pe̍h-ōe-jī", "Peng'im", "Wugniu", "Sixian", "Taishanese", "Shanghainese",
         "Leizhou", "Puxian-Min", "Sichuanese", "Dungan", "Written-vernacular-Chinese", "Pre-Classical-Chinese"}
import re
PINYIN = re.compile("[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]")
NOT_PINYIN = re.compile("[0-9ⁿ\u0358\u030d\u0302\u0304\u0306]|-|oo|[âêîôû]")
out, seen, tags = [], set(), collections.Counter()
for line in open(SRC, encoding="utf8"):
    r = json.loads(line)
    for si, s in enumerate(r.get("senses", [])):
        if any(t in ("obsolete", "archaic", "Classical", "literary", "vulgar", "offensive", "derogatory", "slang") for t in s.get("tags", [])):
            continue
        for e in s.get("examples", []):
            t = set(e.get("tags", []))
            tags.update(t)
            if e.get("type") != "example" or e.get("ref") or t & OTHER or any("Cantonese" in x or "Min" in x or "Taiwan" in x for x in t):
                continue
            text, roman, en = e.get("text", "").strip(), e.get("roman", "").strip(), (e.get("translation") or e.get("english") or "").strip()
            offs = e.get("bold_text_offsets") or []
            if not text or not roman or not en or not offs or "\n" in text:
                continue
            # the "Pinyin" tag is often missing, so the romanisation itself has to look like pinyin:
            # tone marks, and none of the digits, hyphens or nasal marks the other lects' spellings use
            if "Pinyin" not in t and (not PINYIN.search(roman) or NOT_PINYIN.search(roman)):
                continue
            bold = text[offs[0][0]:offs[0][1]]
            key = (text, bold)
            if key in seen:
                continue
            seen.add(key)
            out.append([text, roman, en, bold, "Simplified-Chinese" in t, si])
(ROOT / "cache/wikt_examples.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf8")
print(len(out), "examples;", "tags seen:", [k for k, _ in tags.most_common(40)])
