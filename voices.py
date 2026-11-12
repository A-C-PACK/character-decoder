"""One Mandarin clip for every syllable-and-tone the decoder shows, made with the Qwen3-TTS server on this machine (:8100).

    ~/tools/lessonvenv/bin/python voices.py run serena           # make every clip that is missing -> src/audio/
    ~/tools/lessonvenv/bin/python voices.py run serena ju4 lv4   # make those again

The method is the one Sixty Radicals uses, and its code is imported from ../radicals-site: a character with the
wanted reading is spoken at the end of a carrier sentence, the last spoken segment is cut out, and every take is
checked by machine. Whisper must hear the right syllable, and the pitch contour must fit the tone. Syllables the
sister sites already have a checked clip for are not made again; build.py borrows those.

Each syllable has up to three everyday characters that are read that way and no other way. A take that fails is
tried again with the next seed and the next character.
"""
import glob
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import soundfile as sf
from pypinyin import Style, lazy_pinyin

ROOT = Path(__file__).resolve().parent
RADICALS = ROOT.parent / "radicals-site"
sys.path.insert(0, str(RADICALS))
_spec = importlib.util.spec_from_file_location("radical_voices", RADICALS / "voices.py")
rv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rv)       # speak, last_segment, check, fits, matches, level_out
sys.path.insert(0, str(ROOT))
import build  # noqa: E402

OUT = ROOT / "src" / "audio"
BATCH = 80
MARKS = {"ā": "a1", "á": "a2", "ǎ": "a3", "à": "a4", "ē": "e1", "é": "e2", "ě": "e3", "è": "e4", "ī": "i1", "í": "i2", "ǐ": "i3",
         "ì": "i4", "ō": "o1", "ó": "o2", "ǒ": "o3", "ò": "o4", "ū": "u1", "ú": "u2", "ǔ": "u3", "ù": "u4", "ǖ": "v1", "ǘ": "v2",
         "ǚ": "v3", "ǜ": "v4", "ü": "v0", "ń": "n2", "ň": "n3", "ǹ": "n4"}


def clip_id(py):
    tone, out = 5, ""
    for ch in py.lower():
        if ch in MARKS:
            out += MARKS[ch][0]
            if MARKS[ch][1] != "0":
                tone = int(MARKS[ch][1])
        elif ch.isalpha():
            out += ch
    return out + str(tone)


def candidates():
    """{clip id: [characters read that way, the most used first]} and how many characters want each clip."""
    order = json.loads((ROOT / "build/index.json").read_text(encoding="utf8"))["chars"]
    entries = {}
    for f in glob.glob(str(ROOT / "build/d/*.json")):
        entries.update(json.loads(Path(f).read_text(encoding="utf8")))
    sure, maybe = {}, {}
    for ch in order:
        e = entries[ch]
        if e.get("to") or not e.get("p"):
            continue
        p, share = e["p"][0]
        cid = clip_id(p)
        # pypinyin must agree, since it is what checks the take
        if lazy_pinyin(ch, style=Style.TONE3, neutral_tone_with_five=True, v_to_u=False)[0].replace("ü", "v") != cid:
            continue
        (sure if share >= 95 or len(e["p"]) == 1 else maybe).setdefault(cid, []).append(ch)
    return {cid: (sure.get(cid, []) + maybe.get(cid, []))[:3] for cid in set(sure) | set(maybe)}


def run(speaker, redo):
    wanted = json.loads((ROOT / "build/syllables.json").read_text(encoding="utf8"))
    cands = candidates()
    raw = ROOT / "voices" / "raw" / speaker
    for d in (raw, OUT / "wav", OUT / "mp3"):
        d.mkdir(parents=True, exist_ok=True)
    index = OUT / "clips.json"
    clips = json.loads(index.read_text(encoding="utf8")) if index.exists() else {}
    have = set(build.clips()) - redo
    todo = sorted((k for k in wanted if k not in have and cands.get(k)), key=lambda k: -wanted[k][1])
    nobody = [k for k in wanted if k not in have and not cands.get(k)]
    print(f"{len(wanted)} syllables wanted, {len(have & set(wanted))} ready, {len(todo)} to make, "
          f"{len(nobody)} with no character that is safely read that way", flush=True)
    carrier_want = lazy_pinyin("这个字读作", style=Style.NORMAL)
    for at in range(0, len(todo), BATCH):
        left = todo[at:at + BATCH]
        for n, seed in enumerate(rv.RUN_SEEDS):
            if not left:
                break
            files, said_as = [], {}
            for k in left:
                ch = cands[k][n % len(cands[k])]
                said_as[k] = ch
                a, sr = rv.speak(rv.CARRIER.format(ch), speaker, seed, rv.INSTRUCT)
                cut, found = rv.last_segment(a, sr)
                sf.write(raw / f"full_{k}_{seed}.wav", a, sr)
                sf.write(raw / f"cut_{k}_{seed}.wav", cut if found else a, sr)
                files += [raw / f"full_{k}_{seed}.wav", raw / f"cut_{k}_{seed}.wav"]
            heard = {}
            for i in range(0, len(files), 120):
                heard.update(rv.check(files[i:i + 120]))
            for k in list(left):
                syl, tone = k[:-1].replace("v", "ü"), int(k[-1])
                said, st = heard[f"full_{k}_{seed}.wav"], heard[f"cut_{k}_{seed}.wav"]
                a, sr = sf.read(raw / f"cut_{k}_{seed}.wav", dtype="float32")
                ok = rv.matches(said, carrier_want + [syl]) and rv.fits(tone, st) and 0.25 <= len(a) / sr <= 1.1
                print(f"{k:8s} {said_as[k]} seed {seed}: {'ok ' if ok else 'NO '} heard {said!r} {len(a) / sr:.2f}s contour {st}", flush=True)
                if ok:
                    sf.write(OUT / "wav" / f"{k}.wav", rv.level_out(a), sr)
                    subprocess.run([rv.FFMPEG, "-v", "error", "-y", "-i", str(OUT / "wav" / f"{k}.wav"), "-ac", "1", "-ar", "24000",
                                    "-b:a", "48k", str(OUT / "mp3" / f"{k}.mp3")], check=True)
                    clips[k] = dict(speaker=speaker, ch=said_as[k], seed=seed, heard=said, contour=st, seconds=round(len(a) / sr, 3))
                    left.remove(k)
            index.write_text(json.dumps(clips, ensure_ascii=False, indent=1), encoding="utf8")
        print(f"batch {at // BATCH + 1}: {len(clips)} clips made so far; this batch never passed: {' '.join(left) or 'none'}", flush=True)
        for f in raw.glob("*.wav"):          # the takes are only needed for the check
            f.unlink()
    print(f"{len(clips)} clips of this site's own")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "run":
        run(sys.argv[2], set(sys.argv[3:]))
    else:
        print(__doc__)
