"""Builds assets/chat_glyphs.npz (the starter library of chat letters) from a screenshot of the game's chat.

Only shapes that were checked by hand to be ONE clean letter are used: shapes where letters touch (such as the
"Ax" in "Axe") are left out, because a glued pair saved under one letter would later turn real text into the wrong
text. Anything not in this library is read as "?" and can be taught from inside the tracker (Market > Teach).

Run:  python tools/build_chat_glyphs.py  [screenshot.png]  [output.npz]
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
import chat_reader as C

SHOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "tests", "samples", "chat_sample.png")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "assets", "chat_glyphs.npz")


def labels(text):
    """'Hydrogen:Pink(ff)' -> ['H','y',...,'ff']: a (..) group is one shape made of touching letters."""
    out, i = [], 0
    while i < len(text):
        if text[i] == "(":
            j = text.index(")", i)
            out.append(text[i + 1:j])
            i = j + 1
        elif text[i] == " ":
            i += 1
        else:
            out.append(text[i])
            i += 1
    return out


# line -> {shape number: letter}. Whole lines where every shape was checked, then the clean stretches of two others.
WHOLE = {0: labels("Hydrogen:B>PinkRabbitPuppetpmo(ff)er"), 1: labels("FrankieJ:B>Kumbi700k"), 4: labels("Yossi:B>WhiteLabels650k!")}
PARTS = {
    2: dict(zip(range(0, 9), "davidlife")) | dict(zip(range(14, 31), "S>PMO,B>Twohanded")) | {36: "a", 37: "c", 38: "k", 41: "l", 42: "l"} | dict(zip(range(43, 50), "60%100k")),
    3: dict(zip(range(0, 10), "YouDkMySto")) | dict(zip(range(26, 31), "S>PMO")) | {12: "[", 13: "E", 25: "]"},      # the link's brackets and its E (drawn bold)
}


def main():
    img = np.asarray(Image.open(SHOT).convert("RGB"))
    chat = C.read_chat(img, C.GlyphSet())              # with no letters known, every shape is a "?" and we get the raw shapes
    lib = C.GlyphSet()
    for i, labs in WHOLE.items():
        for tile, lab in zip(chat.lines[i].tiles, labs):
            lib.add(lab, C._trim(chat.canvases[i][:, tile.x:tile.x + tile.w]))
    for i, mapping in PARTS.items():
        for k, lab in mapping.items():
            t = chat.lines[i].tiles[k]
            lib.add(lab, C._trim(chat.canvases[i][:, t.x:t.x + t.w]))
    lib.save(OUT)
    print(f"saved {len(lib)} shapes ({len(lib.chars())} characters) to {OUT}")
    print("characters:", "".join(sorted(lib.chars())))


if __name__ == "__main__":
    main()
