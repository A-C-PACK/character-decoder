# Character Decoder

Paste or draw a Chinese character and see it taken apart: the meaning part (radical), the sound part and how far
its hint can be trusted, the words it is used in, words it often stands beside, example sentences, and where the
shape comes from. A sister site of Sixty Radicals, the Mandarin Tone Trainer and Pinyin Starter, in the same look.

## Build

    python3 wikt.py                           # once: Wiktionary extract -> cache/wikt_examples.json
    ~/tools/lessonvenv/bin/python prep.py     # cache/ -> build/   (under a minute)
    python3 build.py                          # src/ + build/ -> docs/ and dist/artifact.html
    ~/tools/node/bin/node tools/shoot.js dm home c-6e05     # screenshots into shots/
    ~/tools/node/bin/node tools/try.js        # draws, pastes and opens 200 pages in a headless browser
    ~/tools/node/bin/node tools/rectest.js    # how well the drawing pad recognises shaky copies

`docs/` is the whole site: `index.html` plus `data/` (64 files of character entries, 64 of word pages, 128 of stroke outlines,
32 of spoken syllables and `rec.txt` for the drawing pad). The page fetches these a file at a time, so it has to be
served over http; opening `docs/index.html` from disk will not load any character.

## Sources (downloaded into cache/, not in git)

| What | From | Licence |
|---|---|---|
| parts and their roles, origin notes, readings, word lists, frequency, HSK level | Dong Chinese character wiki dump, `data.dong-chinese.com/dump/dictionary_{char,word}_<date>.jsonl` | CC BY-SA 4.0 |
| stroke outlines and centre lines | Make Me a Hanzi `graphics.txt` | Arphic Public License |
| dictionary radical, which strokes belong to which part | Make Me a Hanzi `dictionary.txt` (in ../radicals-site/cache) | LGPL |
| word meanings | CC-CEDICT, through the Dong Chinese word dump | CC BY-SA 4.0 |
| example sentences and phrases, with pinyin and translations | Wiktionary usage examples, from the kaikki.org extract `kaikki.org-dictionary-Chinese.jsonl` (run `python3 wikt.py` once after downloading) | CC BY-SA 4.0 |

The character data in `docs/data/d` is adapted from Dong Chinese and is shared under CC BY-SA 4.0.

## What is machine-made

- The "To remember it" line, composed from the parts and their roles.
- The sound-hint rating, worked out by comparing the two readings.
- Spoken syllables: the Serena voice (`voices.py`), each take checked by whisper and a pitch-contour test,
  never by ear. Syllables with no clip fall back to the device's own Mandarin voice, as words and sentences do.
