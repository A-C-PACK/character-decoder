"""Put the site together.

    python3 build.py        # src/ + build/ -> docs/ (the site: index.html and the data files it fetches)

Run prep.py first (it makes build/ from the downloaded sources) and, for new spoken syllables, voices.py.
The page is one HTML file; character data, stroke outlines and audio sit beside it in docs/data and are fetched
a small file at a time. dist/artifact.html is the same page for publishing as a Claude Artifact with docs/data.
"""
import base64
import collections
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SIS = ROOT.parent
BUILD, DOCS, DIST = ROOT / "build", ROOT / "docs", ROOT / "dist"
N_AUDIO = 32
FONTS = ("https://fonts.googleapis.com/css2?family=Anton&family=Lexend:wght@400;500&family=Noto+Sans:wght@500;700"
         "&family=Noto+Sans+SC:wght@400;500&family=Outfit:wght@400;500;700&display=swap")
dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))


def chunk_of(clip_id):
    """Must match clipChunk() in src/app/01-core.js."""
    h = 0
    for ch in clip_id:
        h = (h * 31 + ord(ch)) % 9973
    return h % N_AUDIO


def clips():
    """{syllable id: mp3 path}: this site's own clips first, then checked clips borrowed from the sister sites."""
    found = {}
    own = ROOT / "src/audio"
    if (own / "clips.json").exists():
        for cid in json.loads((own / "clips.json").read_text(encoding="utf8")):
            if (own / "mp3" / f"{cid}.mp3").exists():
                found[cid] = own / "mp3" / f"{cid}.mp3"
    for site, name in (("radicals-site", "clips.json"), ("tone-trainer", "singles.json")):
        base = SIS / site / "src/audio"
        if not (base / name).exists():
            continue
        for key, c in json.loads((base / name).read_text(encoding="utf8")).items():
            if len(key) == 1 and c.get("pinyin") and c.get("tone") and (base / "mp3" / f"{key}.mp3").exists():
                found.setdefault(f"{c['pinyin'].replace('ü', 'v')}{c['tone']}", base / "mp3" / f"{key}.mp3")
    base = SIS / "pinyin-starter/src/audio"
    if (base / "clips.json").exists():
        for key in json.loads((base / "clips.json").read_text(encoding="utf8")):
            m = re.fullmatch(r"([a-zü]+)([0-5])", key)
            if m and (base / "mp3" / f"{key}.mp3").exists():
                found.setdefault(f"{m[1].replace('ü', 'v')}{m[2] if m[2] != '0' else '5'}", base / "mp3" / f"{key}.mp3")
    return found


def main():
    index = json.loads((BUILD / "index.json").read_text(encoding="utf8"))
    wanted = json.loads((BUILD / "syllables.json").read_text(encoding="utf8"))
    have = {k: v for k, v in clips().items() if k in wanted}

    data = DOCS / "data"
    if data.exists():
        shutil.rmtree(data)
    shutil.copytree(BUILD / "d", data / "d")
    shutil.copytree(BUILD / "s", data / "s")
    shutil.copytree(BUILD / "w", data / "w")
    shutil.copy(BUILD / "rec.txt", data / "rec.txt")
    (data / "a").mkdir()
    audio = collections.defaultdict(dict)
    for cid, path in have.items():
        audio[chunk_of(cid)][cid] = base64.b64encode(path.read_bytes()).decode()
    for n in range(N_AUDIO):
        (data / "a" / f"{n}.json").write_text(dump(audio.get(n, {})), encoding="utf8")
    (DOCS / ".nojekyll").write_text("")

    # the seal in the top bar is drawn from outlines, so it ships inside the page
    seal = json.loads((BUILD / "s" / f"{ord('解') % index['nStroke']}.json").read_text(encoding="utf8"))["解"]
    index.update(nAudio=N_AUDIO, clips=sorted(have), strokes={"解": seal})

    css = "\n".join(p.read_text(encoding="utf8") for p in sorted((ROOT / "src/css").glob("*.css")))
    js = "\n".join(p.read_text(encoding="utf8") for p in sorted((ROOT / "src/app").glob("*.js")))
    page = (ROOT / "src/page.html").read_text(encoding="utf8")
    page = (page.replace("{{FONTS}}", FONTS).replace("/*CSS*/", css)
            .replace("/*DATA*/", "window.DECODER_DATA = " + dump(index) + ";").replace("/*JS*/", js))
    DIST.mkdir(exist_ok=True)
    (DIST / "artifact.html").write_text(page, encoding="utf8")
    head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<meta name="description" content="Paste or draw a Chinese character and see its meaning part, sound part, words, '
            'example sentences and origin.">\n')
    body_at = page.index('<div id="app">')
    (DOCS / "index.html").write_text(head + page[:body_at] + "</head>\n<body>\n" + page[body_at:] + "</body>\n</html>\n", encoding="utf8")

    files = [p for p in data.rglob("*") if p.is_file()]
    missing = sorted((k for k in wanted if k not in have), key=lambda k: -wanted[k][1])
    print(f"page {len(page) / 1e3:.0f} KB, {len(files)} data files, {sum(p.stat().st_size for p in files) / 1e6:.1f} MB")
    print(f"spoken syllables: {len(have)} of {len(wanted)}; missing ones cover "
          f"{sum(wanted[k][1] for k in missing)} of {sum(v[1] for v in wanted.values())} readings")
    print("most wanted missing:", " ".join(missing[:30]))


if __name__ == "__main__":
    main()
