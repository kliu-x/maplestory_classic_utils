"""Draws fake chat pictures for the tests: a chat box made of lines of text in some font (the real letter shapes, or a made-up
alphabet), at any size, on any colour. Nothing here is used by the program itself."""
import random

import numpy as np

import chat_reader as C

BANDS = {"pink": ((218, 173, 189), (109, 18, 65)), "gold": ((228, 185, 64), (66, 40, 13)), "dark": ((24, 24, 40), (255, 255, 255)), "blue": ((60, 90, 150), (250, 250, 210))}
ALL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?%.,:;+-/()[]<>='*&#@$"


def made_up_font(seed=3):
    """An invented alphabet: a different random pixel shape for every character, standing on the baseline (a few with tails)."""
    rng = random.Random(seed)
    font, seen = {}, set()
    for ch in ALL_CHARS:
        while True:
            w, h = rng.randint(3, 9), rng.randint(7, 10)
            bits = np.array([[1 if rng.random() < 0.5 else 0 for _ in range(w)] for _ in range(h)], np.uint8)
            if not (bits.any(axis=0).all() and bits[0].any() and bits[-1].any()):          # every column has ink: one connected letter
                continue
            tail = 3 if ch in "gjpqy,;" else 0
            m = np.zeros((C.HEIGHT, w), np.uint8)
            top = C.A - h - 0                               # the bottom row of the letter sits on the baseline row (A - 1)
            m[top - tail + tail: top + h] = bits if tail == 0 else bits
            if tail:
                m[top + h: top + h + tail, w // 2] = 1      # a tail below the baseline
            key = m.tobytes() + bytes([w])
            if key in seen:
                continue
            seen.add(key)
            font[ch] = m
            break
    return font


def real_shapes(glyphs):
    """One shape per character from a GlyphSet (the starter library)."""
    out = {}
    for ch, m in glyphs.items:
        if len(ch) == 1:
            out.setdefault(ch, m)
    return out


def draw_native(text, shapes, bold_ranges=()):
    """A line of text at the font's own size: letters 2 px apart, words 7 px apart, bold where asked."""
    x, pieces = 0, []
    for i, ch in enumerate(text):
        if ch == " ":
            x += 7
            continue
        m = shapes[ch]
        if any(a <= i < b for a, b in bold_ranges):
            b = np.zeros((C.HEIGHT, m.shape[1] + 1), np.uint8)
            b[:, :-1] |= m
            b[:, 1:] |= m
            m = b
        pieces.append((x, m))
        x += m.shape[1] + 2
    canvas = np.zeros((C.HEIGHT, x + 2), np.uint8)
    for px, m in pieces:
        canvas[:, px:px + m.shape[1]] |= m
    return canvas


def draw_chat(lines, shapes, scale=2, band="pink", offset=(0, 0)):
    """lines: [(name, message, bold_ranges_in_message)] -> an RGB picture of a chat box (16 rows to a line, as in the game)."""
    bg, fg = BANDS[band]
    rows = []
    for name, msg, bold in lines:
        n_img, m_img, colon = draw_native(name, shapes), draw_native(msg, shapes, bold), draw_native(":", shapes)
        row = np.zeros((16, 6 + n_img.shape[1] + 34 + colon.shape[1] + 7 + m_img.shape[1] + 20), np.uint8)
        x = 4
        row[1:1 + C.HEIGHT, x:x + n_img.shape[1]] |= n_img
        x += n_img.shape[1] + 34
        row[1:1 + C.HEIGHT, x:x + colon.shape[1]] |= colon
        x += colon.shape[1] + 7
        row[1:1 + C.HEIGHT, x:x + m_img.shape[1]] |= m_img
        rows.append(row)
    width = max(r.shape[1] for r in rows)
    native = np.zeros((16 * len(rows) + 4, width), np.uint8)
    for i, r in enumerate(rows):
        native[2 + i * 16: 2 + i * 16 + 16, :r.shape[1]] |= r
    big = np.repeat(np.repeat(native, scale, 0), scale, 1)
    img = np.empty(big.shape + (3,), np.uint8)
    img[:] = bg
    img[big > 0] = fg
    return np.ascontiguousarray(img[offset[0]:, offset[1]:])
