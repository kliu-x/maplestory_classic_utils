"""Reads the MapleStory screen: the EXP bar and the mesos in the inventory.

It only looks at pictures handed to it (BGR arrays from a screenshot) and never touches the game,
the network or any other program. There is no Windows code in here, so it can be tested with
saved screenshots.

How the EXP bar is read
-----------------------
The status bar shows  EXP. 372,741 [67.08%]  in white digits with green brackets. Instead of
general-purpose OCR (which struggles with this tiny pixel font) the reader:
  1. finds the green brackets and the white digits next to them, at any window size;
  2. cuts out each digit and rescales it to a standard height;
  3. compares it, pixel by pixel, with saved examples of every digit of the game's own font.
A reading only counts when the number and the % agree with each other and with the EXP the level
needs (see exp_tracker.fits_exp_table), so a misread is thrown away instead of being believed.

The approach (and the saved digit examples in assets/digits.npz, mesos_digits.npz) come from the
MIT-licensed Maple-Classic-Exp-Overlay by beanguri: see NOTICE.txt. This file is a fresh
implementation of the idea.
"""

from collections import namedtuple
from pathlib import Path

import cv2
import numpy as np

from exp_tracker import fits_exp_table, levels_for

cv2.setNumThreads(1)       # the pictures are small: one thread is as fast, and it never spreads a burst across every core

CANON = 24                 # digits are compared at this height (px)
PH, PW = 28, 19            # size of one digit patch at that height
SHIFT = 3                  # px of wiggle room when lining a digit up with an example
MIN_SCORE = 0.75           # correlation the best digit needs (true matches score ~0.9+)
MIN_LEAD = 0.03            # ... and how far ahead of the runner-up it must be
SEARCH_STRIP = 0.22        # bottom part of the game window searched for the EXP text

Blob = namedtuple("Blob", "i x y w h")
# gh: digit height, cy: line centre, exp / pct: digit cells (x centre, width, "digit"|"wide"),
# box: (x0, y0, x1, y1) around the whole "EXP. 372,741 [67.08%]" text, V: brightness image
Layout = namedtuple("Layout", "gh cy exp pct box V")
ExpRead = namedtuple("ExpRead", "status exp pct levels layout")     # status: ok | no_bar | unclear


# --------------------------------------------------------------------------- shapes
def _blobs(mask):
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    return labels, [Blob(i, *map(int, stats[i][:4])) for i in range(1, n)]


def _left_heavy(labels, b):
    """True for '[' (its stroke is on the left), False for ']'."""
    m = labels[b.y:b.y + b.h, b.x:b.x + b.w] == b.i
    half = max(1, b.w // 2)
    return m[:, :half].sum() > m[:, b.w - half:].sum()


def _cells(blobs, gh):
    """Digit positions. A blob as wide as several digits (digits that touch) is split evenly,
    and a blob wider than tall is the '%' sign."""
    pitch = 0.84 * gh
    out = []
    for b in blobs:
        if 0.95 * b.h < b.w < 1.25 * gh:
            out.append((b.x + b.w / 2, b.w, "wide"))
            continue
        n = max(1, int(round((b.w + 0.1 * gh) / pitch)))
        out.extend((b.x + (k + 0.5) * b.w / n, b.w / n, "digit") for k in range(n))
    return out


def find_exp(bgr):
    """Locate the EXP text in a screenshot. Returns a Layout or None."""
    hue, sat, val = cv2.split(cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV))
    green = (sat >= 90) & (val >= 110) & (hue >= 26) & (hue <= 50)       # the brackets
    white = (sat < 70) & (val >= 140)                                    # the digits
    glabels, gblobs = _blobs(green)
    _, wblobs = _blobs(white)
    brackets = sorted((b for b in gblobs if b.h >= 5 and b.w <= 0.6 * b.h), key=lambda b: b.x)
    V = val.astype(np.float32)
    found = []
    for o in brackets:
        bh, cy = o.h, o.y + o.h / 2
        on_line = lambda b: abs(b.y + b.h / 2 - cy) <= 0.3 * bh
        if o.w >= 6 and not _left_heavy(glabels, o):
            continue                                       # clearly a ']'
        right = [c for c in brackets if c.x > o.x + o.w and c.x - o.x <= 9 * bh
                 and on_line(c) and abs(c.h - bh) <= 0.25 * bh]
        if not right:
            continue
        c = right[0]
        if c.w >= 6 and _left_heavy(glabels, c):
            continue                                       # clearly another '['
        line = [b for b in wblobs if on_line(b) and b.h >= 0.6 * bh]
        inside = sorted((b for b in line if b.x >= o.x + o.w and b.x + b.w <= c.x), key=lambda b: b.x)
        if len(inside) < 2 or any(b.h > 1.25 * bh for b in inside):
            continue
        # The EXP number ends right before '['. Walk left until a gap or the taller "EXP." label.
        dh = float(np.median([b.h for b in inside]))
        run, edge = [], o.x
        for b in sorted((b for b in line if b.x + b.w <= o.x), key=lambda b: -b.x):
            if edge - (b.x + b.w) > 2.0 * bh or b.h > 1.25 * bh or b.h > 1.15 * dh:
                break
            run.append(b)
            edge = b.x
        if not run:
            continue                                       # e.g. the HP/MP numbers: a label sits before '['
        run.reverse()
        heights = [b.h for b in run + inside if b.w <= 0.85 * b.h]
        gh = float(np.median(heights)) if heights else float(bh)
        found.append(Layout(gh, cy, _cells(run, gh), _cells(inside, gh),
                            (run[0].x, int(cy - bh), c.x + c.w, int(cy + bh)), V))
    if not found:
        return None
    # The status bar is the lowest line found; EXP is the right-most value on it.
    low = max(f.cy for f in found)
    return max((f for f in found if f.cy >= low - 0.5 * f.gh), key=lambda f: f.box[0])


def digit_patch(V, cx, cy, gh, shift):
    """Brightness patch around one digit, rescaled so the digit is CANON px tall."""
    k = gh / CANON
    x0 = cx - (PW / 2 + shift) * k
    y0 = cy - (PH / 2 + shift) * k
    M = np.float32([[1 / k, 0, -x0 / k], [0, 1 / k, -y0 / k]])
    return cv2.warpAffine(V, M, (PW + 2 * shift, PH + 2 * shift), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_REPLICATE)


def _unit_rows(a):
    a = a - a.mean(axis=1, keepdims=True)
    return a / np.maximum(np.linalg.norm(a, axis=1, keepdims=True), 1e-6)


class DigitTemplates:
    """Saved examples of each digit; scores a patch against all of them at once."""

    def __init__(self, examples):
        labels, rows = [], []
        for digit, patches in sorted(examples.items()):
            for p in patches:
                labels.append(digit)
                rows.append(np.asarray(p, np.float32).reshape(-1))
        self.labels = np.array(labels)
        self.digits = sorted(set(labels))
        self.mat = _unit_rows(np.stack(rows))

    @classmethod
    def load(cls, path):
        """The examples in an .npz file, or None if it is missing or isn't the expected kind."""
        try:
            data = np.load(path, allow_pickle=False)           # plain numbers only, never pickled code
            if int(data["canon"]) != CANON:
                return None
            return cls({k[1:]: data[k] for k in data.files if k.startswith("d")})
        except Exception:
            return None

    def scores(self, patch):
        """Best correlation per digit, trying every small shift of the patch."""
        windows = np.lib.stride_tricks.sliding_window_view(patch, (PH, PW)).reshape(-1, PH * PW)
        s = (_unit_rows(windows) @ self.mat.T).max(axis=0)
        return {d: float(s[self.labels == d].max()) for d in self.digits}

    def match(self, lay, cell):
        """(digit, score, lead over the runner-up) for one digit position."""
        best = {}
        for f in (0.95, 1.0, 1.05):                     # allow for small errors in the size estimate
            for d, s in self.scores(digit_patch(lay.V, cell[0], lay.cy, lay.gh * f, SHIFT)).items():
                best[d] = max(best.get(d, -1.0), s)
        ranked = sorted(best.values(), reverse=True)
        lead = ranked[0] - ranked[1] if len(ranked) > 1 else 1.0
        return max(best, key=best.get), ranked[0], lead


def _pct_cells(lay):
    """The digits inside the brackets: drops the '%' sign right before the ']'."""
    return [c for c in lay.pct if lay.box[2] - c[0] > 1.5 * lay.gh]


def _read_digits(tpl, lay, cells):
    s = ""
    for cell in cells:
        if cell[2] != "digit":
            return None
        digit, score, lead = tpl.match(lay, cell)
        if score < MIN_SCORE or lead < MIN_LEAD:
            return None
        s += digit
    return s


def read_layout(tpl, lay):
    """(exp, pct) read with the digit examples, or None if any digit is unclear."""
    exp_s = _read_digits(tpl, lay, lay.exp)
    pct_s = _read_digits(tpl, lay, _pct_cells(lay))
    if not exp_s or not pct_s or not 3 <= len(pct_s) <= 5:
        return None
    if (len(exp_s) > 1 and exp_s[0] == "0") or (len(pct_s) > 3 and pct_s[0] == "0"):
        return None                                     # a leading 0: some digits were cut off
    return int(exp_s), int(pct_s) / 100                 # the game always shows 2 decimals


def read_exp_bar(bgr, tpl):
    """Read the EXP bar from a screenshot. Returns an ExpRead:
       ok       exp, pct and the levels that fit them
       no_bar   the bar isn't visible (a menu, the login screen, something covering it)
       unclear  the bar is there but the digits can't be trusted"""
    lay = find_exp(bgr)
    if lay is None:
        return ExpRead("no_bar", None, None, [], None)
    got = read_layout(tpl, lay)
    if got is None:
        return ExpRead("unclear", None, None, [], lay)
    exp, pct = got
    if not fits_exp_table(exp, pct):                    # number and % don't add up: a misread
        return ExpRead("unclear", None, None, [], lay)
    return ExpRead("ok", exp, pct, levels_for(exp, pct), lay)


# --------------------------------------------------------------------------- mesos
# The inventory's mesos box is white with a gold coin on its left. Its digits are a different font
# from the EXP bar's, so they have their own examples (mesos_digits.npz). The number is
# right-aligned, with a wider gap after every third digit (the comma).

def find_mesos_field(bgr, gh=None):
    """(x, y, w, h) of the solid white mesos box (gold coin on its left), or None. With gh (the EXP
    digit height) the box must also be the right size for that window scale."""
    hue, sat, val = cv2.split(cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV))
    n, _, stats, _ = cv2.connectedComponentsWithStats(((val > 225) & (sat < 30)).astype(np.uint8), connectivity=8)
    coin = (hue >= 12) & (hue <= 35) & (sat >= 100) & (val >= 140)
    best = None
    for i in range(1, n):
        x, y, w, h, area = map(int, stats[i])
        if h < 8 or not 7 * h <= w <= 16 * h or area < 0.6 * w * h:
            continue
        if gh and not (16.2 * gh <= w <= 22 * gh and 1.45 * gh <= h <= 2.2 * gh):
            continue
        left = coin[y:y + h, max(0, x - int(1.6 * h)):x]
        if left.size == 0 or left.mean() < 0.15:
            continue
        if best is None or area > best[4]:
            best = (x, y, w, h, area)
    return best[:4] if best else None


def mesos_layout(bgr, field):
    """Digit cells of the number in the mesos box, or None if they can't be picked out cleanly.
    Works on how much darker each pixel is than the box around it. Anything doubtful returns None:
    a wrong number is worse than waiting for a clean look."""
    x, y, w, h = field
    inner = bgr[y + 2:y + h - 2, x + 2:x + w - 2]
    if inner.size == 0:
        return None
    V = cv2.cvtColor(inner, cv2.COLOR_BGR2HSV)[..., 2].astype(np.float32)
    dh0 = 0.61 * h                                      # digits are ~61% as tall as the box
    k = max(3, int(round(0.35 * dh0)) | 1)
    strokes = cv2.morphologyEx(V, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8)) - V
    peak = float(np.percentile(strokes, 99.7))
    if peak < 40:
        return None
    band = np.zeros(strokes.shape, bool)                # the row the digits sit on
    mid = inner.shape[0] / 2
    b0, b1 = max(0, int(mid - 0.65 * dh0)), int(mid + 0.65 * dh0)
    band[b0:b1] = strokes[b0:b1] > 0.4 * peak
    c = max(1, int(round(0.06 * dh0)))
    band = cv2.morphologyEx(band.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((c, c), np.uint8)) > 0
    _, blobs = _blobs(band)
    digits = sorted((b for b in blobs if 0.6 * dh0 <= b.h <= 1.25 * dh0), key=lambda b: -b.x)
    if not digits or inner.shape[1] - (digits[0].x + digits[0].w) > 0.8 * dh0:
        return None                                     # the number is right-aligned
    run, edge = [], None
    for b in digits:
        if edge is not None and edge - (b.x + b.w) > 0.9 * dh0:
            break
        run.append(b)
        edge = b.x if edge is None else min(edge, b.x)
    run.reverse()
    dh = float(np.median([b.h for b in run]))
    pitch = 0.74 * dh
    cells = []
    for b in run:
        n = max(1, int(round((b.w + 0.12 * dh) / pitch)))
        cells.extend((b.x + (j + 0.5) * b.w / n, b.w / n, "digit") for j in range(n))
    # Nothing digit-like may be left over to the left of the number (a dropped digit).
    left = band[:, :max(0, int(cells[0][0] - cells[0][1] / 2 - 0.25 * dh))]
    if left.sum() > 0.25 * band[:, int(cells[-1][0] - cells[-1][1] / 2):].sum():
        return None
    # A comma after every 3 digits from the right makes that gap wider; anything else is off.
    centers = [c[0] for c in cells][::-1]
    for i in range(len(centers) - 1):
        want = 1.11 * dh if (i + 1) % 3 == 0 else 0.74 * dh
        if abs(centers[i] - centers[i + 1] - want) > 0.2 * dh:
            return None
    cy = float(np.median([b.y + b.h / 2 for b in run]))
    return Layout(dh, cy, cells, [], (0, 0, 0, 0), strokes)


def read_mesos(bgr, gh, tpl):
    """The mesos amount shown in an open inventory, or None if it can't be read cleanly."""
    if tpl is None:
        return None
    field = find_mesos_field(bgr, gh)
    if field is None:
        return None
    lay = mesos_layout(bgr, field)
    if lay is None:
        return None
    digits = _read_digits(tpl, lay, lay.exp)
    if not digits or len(digits) > 12 or (len(digits) > 1 and digits[0] == "0"):
        return None
    return int(digits)


# --------------------------------------------------------------------------- maps
def load_map_names(path):
    """{name: is_town} from maps.txt (lines: name <tab> 1 for a town, 0 otherwise). Only used to fill
    the map list you pick from; the map is just a label for your log lines."""
    names = {}
    try:
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            if "\t" in line:
                name, flag = line.rsplit("\t", 1)
                names[name.strip()] = flag.strip() == "1"
    except Exception:
        pass
    return names
