"""Reading the chat box: a picture of it goes in, lines of text come out.

The game's chat font is a tiny pixel font (about 10 pixels tall, strokes 1 pixel wide) that the game
draws bigger by an exact whole number (2x, 3x ...) when its window is large. So:

  1. find the lines of text (the rows that have ink on them) and the channel "tags" (white-bordered pills);
  2. work out the enlargement and shrink the text back to the font's real size, where every letter is a
     small exact bitmap, however big the game window is;
  3. read each line by sliding known letter shapes along it and choosing the best overall explanation
     (so letters that touch, like the two r's in a bold "Earrings", still come out right);
  4. anything it can't match is written as "?", and "teaching" it (typing what a line says) adds the
     missing letters to the library. Letters learned from your own screen are kept in your data folder.

It only works on a picture it is handed. It never touches the game or the screen itself.
"""

from collections import defaultdict

import cv2
import numpy as np

A, D = 11, 4                       # rows kept above (including) and below the baseline, at the font's own size
HEIGHT = A + D
SPACE_GAP = 5                      # this many empty columns (in font pixels) or more between letters = a space
MAX_GLYPH = 14                     # no letter is wider than this
UNKNOWN_BASE, UNKNOWN_PER_PIXEL = 3.0, 0.9      # what it costs to leave a run of ink unexplained ("?")
FRAGMENT_PENALTY = 15.0           # extra cost when a known letter is glued to an unknown shape (it is probably a piece of that shape)
MATCH_TOLERANCE = 0.08             # a known letter is accepted only if at most this share of its pixels differ (none, for small letters)
INK_DISTANCE = 90                  # how different from the background a pixel must be to count as text


# --------------------------------------------------------------------------- the letter library
class GlyphSet:
    """Known letter shapes: a list of (character, bitmap), each bitmap HEIGHT rows tall, aligned on the baseline."""

    def __init__(self):
        self.items = []                  # the letters that were learned (these are what gets saved)
        self.derived = []                # their "bold" twins: used only for matching (item links are drawn bold)
        self._keys = set()

    def __len__(self):
        return len(self.items)

    def all_items(self):
        return self.items + self.derived

    def copy(self):
        """An independent copy (so a library can be changed while another thread is still reading with the old one)."""
        other = GlyphSet()
        for ch, m in self.items:
            other.add(ch, m)
        return other

    def chars(self):
        return {c for c, _ in self.items}

    def add(self, char, mask):
        """Add a shape; returns False if exactly this shape is already known for this character."""
        mask = (np.asarray(mask) > 0).astype(np.uint8)
        if mask.shape[0] != HEIGHT or mask.shape[1] < 1 or mask.shape[1] > MAX_GLYPH or not mask.any():
            return False
        key = (char, mask.shape[1], mask.tobytes())
        if key in self._keys:
            return False
        self._keys.add(key)
        self.items.append((char, mask))
        if mask.shape[1] + 1 <= MAX_GLYPH:               # the bold look is the same letter with every stroke one pixel wider
            bold = np.zeros((HEIGHT, mask.shape[1] + 1), np.uint8)
            bold[:, :-1] |= mask
            bold[:, 1:] |= mask
            self.derived.append((char, bold))
        return True

    def save(self, path):
        chars = np.array([c for c, _ in self.items], dtype="U4")
        widths = np.array([m.shape[1] for _, m in self.items], dtype=np.int32)
        data = np.concatenate([m.reshape(-1) for _, m in self.items]) if self.items else np.zeros(0, np.uint8)
        np.savez_compressed(path, chars=chars, widths=widths, data=data.astype(np.uint8), height=np.int32(HEIGHT))

    def load(self, path):
        """Add everything in a library file. A missing, damaged or different-sized file is ignored."""
        try:
            z = np.load(path, allow_pickle=False)
            chars, widths, data = z["chars"], z["widths"], z["data"]
            if int(z["height"]) != HEIGHT or int(widths.sum()) * HEIGHT != len(data):
                return self
            pos = 0
            for c, w in zip(chars, widths):
                n = int(w) * HEIGHT
                self.add(str(c), data[pos:pos + n].reshape(HEIGHT, int(w)))
                pos += n
        except Exception:
            pass
        return self


# --------------------------------------------------------------------------- finding the text in a picture
def find_tags(img):
    """The channel tags: the brightest colour drawn as a hollow rounded box with an unbroken border (68 x 24 px at 2x).
    Returns [(x, y, w, h)]. Letters and words never have a border that runs unbroken round their whole outline."""
    lowest = img.min(axis=2)
    top = int(lowest.max())
    if top < 150:
        return []
    bright = (lowest >= top - 12).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(bright, connectivity=8)
    found = []
    for i in range(1, n):
        x, y, w, h, area = (int(v) for v in stats[i])
        if w < 24 or not 10 < h < 60 or area < 80 or area > 0.6 * w * h or w < 1.8 * h:
            continue
        comp = lab[y:y + h, x:x + w] == i
        edge = comp[0].sum() + comp[-1].sum() + comp[:, 0].sum() + comp[:, -1].sum()
        if edge >= 0.7 * (2 * w + 2 * h - 4):
            found.append((x, y, w, h))
    return sorted(found)


def _coarse_ink(img, tags):
    """Rough text mask: pixels unlike their neighbourhood. Good enough to find lines and the scale."""
    h, w, _ = img.shape
    k = 31 if min(h, w) >= 31 else max(3, (min(h, w) // 2) * 2 - 1)
    bg = cv2.medianBlur(img, k).astype(np.int16)
    ink = np.abs(img.astype(np.int16) - bg).sum(axis=2) > INK_DISTANCE
    for x, y, tw, th in tags:
        ink[max(0, y - 3): y + th + 3, max(0, x - 4): x + tw + 4] = False
    ink[ink.mean(axis=1) > 0.6] = False              # the thin seams between coloured bands are not text
    return ink


def _runs(mask_rows):
    """Lengths of the horizontal runs of ink in a 2-D boolean array."""
    padded = np.zeros((mask_rows.shape[0], mask_rows.shape[1] + 2), np.int8)
    padded[:, 1:-1] = mask_rows
    d = np.diff(padded, axis=1)
    starts, ends = np.nonzero(d == 1), np.nonzero(d == -1)
    return ends[1] - starts[1]


def _drop_long_runs(ink, longest_h, longest_v):
    """Erase horizontal strokes longer than any letter's and vertical ones taller than a line: borders, seams, frames."""
    out = ink.copy()
    for mask, limit in ((out, longest_h), (out.T, longest_v)):
        padded = np.zeros((mask.shape[0], mask.shape[1] + 2), np.int8)
        padded[:, 1:-1] = mask
        d = np.diff(padded, axis=1)
        sr, sc = np.nonzero(d == 1)
        er, ec = np.nonzero(d == -1)
        for r, c0, c1 in zip(sr, sc, ec):
            if c1 - c0 > limit:
                mask[r, c0:c1] = False
    return out


def estimate_scale(ink_rows):
    """How many screen pixels make one pixel of the font: the largest whole number that nearly every horizontal
    stroke length is a multiple of (1 if the text isn't enlarged, or the enlargement isn't a whole number)."""
    runs = _runs(ink_rows)
    runs = runs[(runs >= 1) & (runs <= 48)]
    if len(runs) < 20:
        return 1
    best = 1
    for s in range(2, 9):
        if np.mean(runs % s == 0) >= 0.9 and np.mean(runs == s) + np.mean(runs == 2 * s) + np.mean(runs == 3 * s) >= 0.4:
            best = s
    return best


def _grid_phase(mask, s):
    """Which offset (0..s-1) along axis 1 makes blocks of s columns most uniform: where the enlarged pixels start."""
    if s == 1:
        return 0
    best, phase = -1.0, 0
    for p in range(s):
        width = (mask.shape[1] - p) // s * s
        if width <= 0:
            continue
        blocks = mask[:, p:p + width].reshape(mask.shape[0], -1, s).mean(axis=2)
        score = float(np.abs(blocks - 0.5).sum())
        if score > best:
            best, phase = score, p
    return phase


def _line_rows(ink, s):
    """Rows that hold a line of text: [(top, bottom)] in screen pixels."""
    counts = ink.sum(axis=1)
    positive = counts[counts > 0]
    if len(positive) == 0:
        return []
    thr = max(6, 0.25 * float(np.percentile(positive, 75)))
    has = counts >= thr
    lines, y, n = [], 0, len(has)
    while y < n:
        if has[y]:
            y0 = y
            while y < n and (has[y] or has[y + 1: y + 1 + 2 * s].any()):
                y += 1
            if (y - y0) >= 5 * s:
                lines.append((y0, y))
        y += 1
    return lines


def _clean_mask(img, y0, y1, tags, ref=None):
    """Exact text mask for rows y0..y1: the background is the line's own dominant colour (judged from the rows
    `ref` = (top, bottom) that hold the text, so margin below the last line can't be mistaken for the background)."""
    h, w, _ = img.shape
    y0, y1 = max(0, y0), min(h, y1)
    if y1 - y0 < 2:
        return np.zeros((max(0, y1 - y0), w), bool)
    win = img[y0:y1].astype(np.int16)
    r0, r1 = (max(y0, ref[0]), min(y1, ref[1])) if ref else (y0, y1)
    sample = img[r0:r1].astype(np.int16) if r1 - r0 >= 2 else win
    q = (sample >> 4).reshape(-1, 3)
    key = q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2]
    vals, counts = np.unique(key, return_counts=True)
    bg = sample.reshape(-1, 3)[key == vals[counts.argmax()]].mean(axis=0)
    m = np.abs(win - bg).sum(axis=2) > INK_DISTANCE
    rows = np.arange(y0, y1)[:, None]
    for x, y, tw, th in tags:
        m &= ~((rows >= y - 3) & (rows <= y + th + 3) & (np.arange(w)[None, :] >= x - 4) & (np.arange(w)[None, :] <= x + tw + 4))
    m[m.mean(axis=1) > 0.5] = False                  # a row that is mostly "ink" is the edge of the band, not text
    m[:, m.mean(axis=0) > 0.85] = False              # ... and so is a solid column (a window frame)
    return m


def _shrink(mask, s, dx):
    """Take the enlargement out of a mask: blocks of s x s pixels become one."""
    if s == 1:
        return mask
    m = mask[:, dx:]
    h2, w2 = (m.shape[0] // s) * s, (m.shape[1] // s) * s
    if h2 == 0 or w2 == 0:
        return np.zeros((0, 0), bool)
    return m[:h2, :w2].reshape(h2 // s, s, w2 // s, s).mean(axis=(1, 3)) > 0.5


def _baseline(native):
    """The row the letters stand on: the most common bottom edge among tall-enough shapes."""
    n, _, stats, _ = cv2.connectedComponentsWithStats(native.astype(np.uint8), connectivity=8)
    bottoms = [int(s[1] + s[3] - 1) for s in stats[1:] if s[3] >= 7]
    if not bottoms:
        return None
    vals, counts = np.unique(bottoms, return_counts=True)
    return int(vals[counts.argmax()])


def _canvas(native, base):
    """HEIGHT rows of the line, with the baseline at row A-1."""
    out = np.zeros((HEIGHT, native.shape[1]), np.uint8)
    for r in range(HEIGHT):
        y = base - (A - 1) + r
        if 0 <= y < native.shape[0]:
            out[r] = native[y]
    return out


# --------------------------------------------------------------------------- reading a line
class Tile:
    """One letter (or one "?") found on a line."""
    __slots__ = ("x", "w", "char", "cost", "mask")

    def __init__(self, x, w, char, cost, mask):
        self.x, self.w, self.char, self.cost, self.mask = x, w, char, cost, mask


def decode(canvas, glyphs):
    """Best explanation of a line as a row of known letters: every column that has ink must be covered by a letter
    (or by a "?" for a shape it doesn't know), and the total mismatch is as small as possible."""
    wc = canvas.shape[1]
    col_ink = canvas.any(axis=0)
    img = canvas.astype(np.float32)
    cands = defaultdict(list)
    pool = glyphs.all_items()
    for idx, (ch, tpl) in enumerate(pool):
        w = tpl.shape[1]
        if w > wc:
            continue
        cost = cv2.matchTemplate(img, tpl.astype(np.float32), cv2.TM_SQDIFF)[0]
        limit = MATCH_TOLERANCE * float(tpl.sum())           # small shapes must match exactly; bigger ones may differ by a pixel or two
        for x in np.nonzero(cost <= limit)[0]:
            if col_ink[x]:
                cands[int(x)].append((float(cost[x]), w, idx))
    inf = float("inf")
    # best[x][k]: cheapest way to explain everything left of column x, where k says how the last shape ended:
    # 0 = nothing touches x, 1 = a known letter ends right at x, 2 = an unknown shape ends right at x
    best = [[inf, inf, inf] for _ in range(wc + 1)]
    back = [[None, None, None] for _ in range(wc + 1)]
    best[0][0] = 0.0

    def relax(x, kind, total, how):
        if total < best[x][kind]:
            best[x][kind], back[x][kind] = total, how
    for x in range(wc):
        for kind in range(3):
            c0 = best[x][kind]
            if c0 == inf:
                continue
            if not col_ink[x]:
                relax(x + 1, 0, c0, (x, kind, None, 0.0))
                continue
            glued = FRAGMENT_PENALTY if kind == 2 else 0.0           # a known letter stuck to an unknown shape: probably a mis-split
            for cost, w, idx in cands.get(x, ()):
                relax(x + w, 1, c0 + cost + 0.001 + glued, (x, kind, idx, cost))
            end = x
            while end < wc and col_ink[end] and end - x < MAX_GLYPH:
                end += 1
            glued = FRAGMENT_PENALTY if kind == 1 else 0.0
            u = UNKNOWN_BASE + UNKNOWN_PER_PIXEL * float(canvas[:, x:end].sum())
            relax(end, 2, c0 + u + glued, (x, kind, -1, u))
    kind = min(range(3), key=lambda k: best[wc][k])
    if best[wc][kind] == inf:
        return []
    tiles, pos = [], wc
    while pos > 0:
        prev, prev_kind, idx, cost = back[pos][kind]
        if idx is not None:
            if idx == -1:
                tiles.append(Tile(prev, pos - prev, None, cost, canvas[:, prev:pos].copy()))
            else:
                tiles.append(Tile(prev, pos - prev, pool[idx][0], cost, None))
        pos, kind = prev, prev_kind
    tiles.reverse()
    return tiles


def tiles_to_text(tiles):
    out, prev_end = [], None
    for t in tiles:
        if prev_end is not None and t.x - prev_end >= SPACE_GAP:
            out.append(" ")
        out.append(t.char if t.char is not None else "?")
        prev_end = t.x + t.w
    return "".join(out)


class ChatLine:
    def __init__(self, y, raw, tiles):
        self.y, self.raw, self.tiles = y, raw, tiles
        name, colon, message = raw.partition(":")
        words = name.split()
        self.has_name = bool(colon) and bool(words)
        first = words[0] if words else ""
        trimmed = first.lstrip("?") if first.startswith("??") else first          # two or more ?s in a row at either end are junk,
        trimmed = trimmed.rstrip("?") if trimmed.endswith("??") else trimmed      # a single ? is a letter that hasn't been learned yet
        self.name, self.message = ((trimmed or first), message.strip()) if self.has_name else ("", raw.strip())
        self.unknown = sum(1 for t in tiles if t.char is None)

    def __repr__(self):
        return f"ChatLine(y={self.y}, name={self.name!r}, message={self.message!r}, unknown={self.unknown})"


class ChatImage:
    """Everything worked out about one picture of the chat box (so the Teach window can use it too)."""

    def __init__(self, scale, lines, canvases):
        self.scale, self.lines, self.canvases = scale, lines, canvases


def read_chat(img_rgb, glyphs, scale=None):
    """Read every line in a picture of the chat box. Returns a ChatImage (.lines is a list of ChatLine)."""
    img = np.ascontiguousarray(img_rgb[..., :3]).astype(np.uint8)
    if img.shape[0] < 12 or img.shape[1] < 40:
        return ChatImage(1, [], [])
    tags = find_tags(img)
    ink = _coarse_ink(img, tags)
    s = scale or estimate_scale(ink[ink.sum(axis=1) >= 6])
    ink = _drop_long_runs(ink, (MAX_GLYPH + 2) * s, (HEIGHT + 4) * s)
    rows = _line_rows(ink, s)
    if not rows:
        return ChatImage(s, [], [])
    text_rows = np.zeros(len(ink), bool)
    for a, b in rows:
        text_rows[a:b] = True
    dx = _grid_phase(ink[text_rows].astype(float), s)
    dy = _grid_phase(ink.T.astype(float), s)
    lines, canvases = [], []
    for (a, b) in rows:
        top = max(0, a - 2 * s)
        top -= (top - dy) % s
        if top < 0:
            top += s
        bottom = min(img.shape[0], b + (D + 2) * s)
        try:                                           # one odd line must never stop the others from being read
            native = _shrink(_clean_mask(img, top, bottom, tags, (a, b)), s, dx)
            if native.size == 0:
                continue
            base = _baseline(native)
            if base is None:
                continue
            canvas = _canvas(native, base)
            tiles = decode(canvas, glyphs)
            if not tiles:
                continue
        except Exception:
            continue
        lines.append(ChatLine(top, tiles_to_text(tiles), tiles))
        canvases.append(canvas)
    return ChatImage(s, lines, canvases)


# --------------------------------------------------------------------------- teaching
STRAY_COST, KNOWN_STRAY_COST, HIDDEN_COST, LIGATURE_COST, MISMATCH_COST = 3.0, 7.0, 3.0, 3.0, 4.0


def align(tiles, typed):
    """Match the shapes found on a line with the letters someone typed for it. Handles a shape that is really several
    touching letters (a "ligature"), a stray mark that isn't a letter, and a letter hidden behind something.
    Returns (labels, doubt, irregular): one entry per shape - its letter(s), or None if it was judged to be a stray mark -
    a measure of doubt about the typed text (how much of it disagrees with what was recognised; unreadable marks don't
    count), and how many typed letters had no shape / shapes in the middle of the text were thrown away."""
    chars = [c for c in typed if not c.isspace()]
    n, m = len(tiles), len(chars)
    inf = float("inf")
    cost = [[inf] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    cost[0][0] = 0.0

    def relax(i, j, c, how):
        if c < cost[i][j]:
            cost[i][j], back[i][j] = c, how
    for i in range(n + 1):
        for j in range(m + 1):
            c0 = cost[i][j]
            if c0 == inf:
                continue
            if i < n and j < m:
                t = tiles[i]
                disagree = not (t.char is None or t.char == chars[j])
                relax(i + 1, j + 1, c0 + (MISMATCH_COST if disagree else 0.0), (i, j, chars[j], MISMATCH_COST if disagree else 0.0))
            if i < n and tiles[i].char is None:
                for k in range(2, 5):                      # an unknown shape that is really k touching letters
                    if j + k <= m:
                        relax(i + 1, j + k, c0 + LIGATURE_COST * (k - 1), (i, j, "".join(chars[j:j + k]), LIGATURE_COST * (k - 1)))      # (touching letters are rare: it counts as doubt)
            if i < n:
                known = tiles[i].char is not None           # throwing away a letter that WAS recognised is a much bigger step
                relax(i + 1, j, c0 + (KNOWN_STRAY_COST if known else STRAY_COST), (i, j, None, KNOWN_STRAY_COST if known else 0.0))
            if j < m:
                relax(i, j + 1, c0 + HIDDEN_COST, (i, j, "hidden", HIDDEN_COST))
    if cost[n][m] == inf:
        return [None] * n, inf, n + m
    labels, i, j, doubt, hidden = [None] * n, n, m, 0.0, 0
    while i > 0 or j > 0:
        pi, pj, what, d = back[i][j]
        doubt += d
        if what == "hidden":
            hidden += 1
        elif pi + 1 == i:
            labels[pi] = what
        i, j = pi, pj
    named = [k for k, lab in enumerate(labels) if lab is not None]
    inner = sum(1 for k in range(named[0], named[-1] + 1) if labels[k] is None) if named else 0     # shapes thrown away in the middle of the text
    return labels, doubt, hidden + inner


def teach(chat, line_index, typed, glyphs, max_doubt=None, max_label=2):
    """Learn from a line the player has typed out. The shapes on the line are lined up with the typed letters; every
    "?" (and every wrong letter) is given the letter typed in its place. Returns (letters learned, message)."""
    line, canvas = chat.lines[line_index], chat.canvases[line_index]
    labels, doubt, irregular = align(line.tiles, typed)
    typed_n = sum(1 for c in typed if not c.isspace())
    limit = max_doubt if max_doubt is not None else 0.12 * typed_n + 4
    unknown = any(t.char is None for t in line.tiles[:])
    # Letters are only learned from a line where every shape and every typed letter pairs up cleanly: a guess here would
    # put wrong letters in the library, and those would spoil every later reading.
    if doubt > limit or (irregular and unknown):
        return [], "That line doesn't line up with what you typed. Type exactly what you see on this line."
    # In a bitmap font the same letter always has the same shape. If the typed text gives one letter two different shapes
    # on this line, the text has a mistake in it (and learning from it would put wrong letters in the library).
    seen = {}
    for tile, label in zip(line.tiles, labels):
        if label is None or len(label) != 1 or (tile.char is not None and tile.cost > 0):
            continue
        shape = _trim(canvas[:, tile.x:tile.x + tile.w])
        if seen.setdefault(label, (shape.shape, shape.tobytes())) != (shape.shape, shape.tobytes()):
            return [], f"The letter {label} looks different in two places on that line, so what you typed has a mistake in it. Check it and try again."
    learned = []
    for tile, label in zip(line.tiles, labels):
        if label is None or tile.char == label:
            continue
        mask = canvas[:, tile.x:tile.x + tile.w]
        if len(label) <= max_label and mask.any() and glyphs.add(label, _trim(mask)):      # (a run of 3+ touching letters isn't worth keeping)
            learned.append(label)
    return learned, ""


def _trim(mask):
    """Cut a letter's bitmap to the columns that have ink."""
    cols = np.nonzero(mask.any(axis=0))[0]
    return mask[:, cols[0]:cols[-1] + 1]


# --------------------------------------------------------------------------- whole messages
def _plausible_name(name):
    """Character names are one word, a few letters long."""
    return 1 <= len(name) <= 14 and " " not in name


def messages(lines):
    """Chat lines -> whole messages [(player, text, unknown letters)]. A line without a name that follows a message is the
    rest of that message (long lines wrap), and stray marks (a cursor, a scroll bar) at the end of a line are dropped."""
    out = []
    for ln in lines:
        text = ln.message
        while text.endswith("?") and (len(text) == 1 or text[-2] == " " or text.endswith("??")):
            text = text[:-1].rstrip()
        if ln.has_name and _plausible_name(ln.name):
            out.append([ln.name, text, ln.unknown])
        elif out:
            out[-1][1] = (out[-1][1] + " " + (text if not ln.has_name else ln.raw.strip())).strip()
            out[-1][2] += ln.unknown
    return [tuple(x) for x in out]
