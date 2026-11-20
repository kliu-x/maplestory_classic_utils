"""Smooth drawing for the tracker's window: rounded glass panels, soft glows, gold gradient numbers,
the progress bar, chips, buttons and icons.

Everything is drawn with Pillow at 3x size and shrunk down, which is what makes the edges smooth, and
every finished picture is remembered (cached) so a redraw only pays for what actually changed.
Sizes you pass in are "logical" pixels; `scale` turns them into real screen pixels (so the window has
the same size on a 150% display as on a 100% one).

This file only draws pictures. It knows nothing about the game, the screen or Windows.
"""

import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SS = 3                                   # draw at 3x, then shrink (2x on high-resolution displays: see Gfx.ss)


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# The overlay's palette (a dark theme with a gold accent).
BG = "#0b0c10"            # window
CARD_TOP, CARD_BOTTOM = "#22242b", "#12141a"
EDGE, EDGE_TOP = "#262a35", "#3a3f4d"
TRACK = "#222733"
TEXT, MUTED, DIM = "#f1efe9", "#9ba1ad", "#6c7280"
GOLD, GOLD_LIGHT, GOLD_DARK = "#ffcc33", "#ffd966", "#e5b52b"
ON_GOLD = "#1a1608"
GREEN, ORANGE, RED = "#5fd38a", "#ffb27a", "#ff7a5c"


class Gfx:
    FONT_FILES = {"regular": "Manrope.ttf", "semibold": "ManropeSemiBold.ttf",
                  "bold": "ManropeBold.ttf", "extrabold": "ManropeExtraBold.ttf"}

    def __init__(self, scale=1.0, fonts_dir=None):
        self.scale = max(0.5, float(scale))
        self.ss = SS if self.scale < 1.5 else 2          # a screen with this many pixels needs less smoothing
        self.fonts_dir = Path(fonts_dir) if fonts_dir else None
        self._fonts, self._cache = {}, {}

    # ---- sizes
    def px(self, v):
        """Logical pixels -> real pixels."""
        return int(round(v * self.scale))

    # ---- fonts
    def font(self, weight, size):
        """The font at `size` logical px, already enlarged for drawing at 3x."""
        key = (weight, round(float(size), 2))
        if key not in self._fonts:
            win = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
            bold = weight in ("bold", "extrabold")
            candidates = [Path("/nonexistent")]
            if self.fonts_dir:
                candidates.append(self.fonts_dir / self.FONT_FILES.get(weight, "Manrope.ttf"))
            candidates += [win / ("segoeuib.ttf" if bold else "segoeui.ttf"),
                           Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")]
            for p in candidates:
                try:
                    self._fonts[key] = ImageFont.truetype(str(p), max(8, int(round(size * self.scale * self.ss))))
                    break
                except OSError:
                    continue
            else:
                self._fonts[key] = ImageFont.load_default()
        return self._fonts[key]

    CACHE_LIMIT = 400                    # pictures kept; the least recently used go first

    def cached(self, key, build):
        """Remember finished pictures. When full, only the pictures not used for longest are dropped, so what is
        drawn on every redraw (panels, buttons, labels) stays ready and a redraw never has to start from nothing."""
        hit = self._cache.pop(key, None)
        if hit is None:
            hit = build()
            while len(self._cache) >= self.CACHE_LIMIT:
                self._cache.pop(next(iter(self._cache)))
        self._cache[key] = hit                                 # (re)insert as the most recently used
        return hit

    # ---- building blocks (all at 3x)
    @staticmethod
    def _vgrad(w, h, top, bottom):
        t = np.linspace(0, 1, max(h, 1))[:, None, None]
        a, b = np.array(hexrgb(top), float), np.array(hexrgb(bottom), float)
        row = (a + (b - a) * t).astype(np.uint8)
        return Image.fromarray(np.repeat(row, w, axis=1), "RGB")

    @staticmethod
    def _hgrad(w, h, left, right):
        t = np.linspace(0, 1, max(w, 1))[None, :, None]
        a, b = np.array(hexrgb(left), float), np.array(hexrgb(right), float)
        col = (a + (b - a) * t).astype(np.uint8)
        return Image.fromarray(np.repeat(col, h, axis=0), "RGB")

    def _rr(self, w, h, r, inset=0):
        """Rounded-rectangle mask, w x h real pixels, drawn at 3x."""
        m = Image.new("L", (w * self.ss, h * self.ss), 0)
        i = inset * self.ss
        ImageDraw.Draw(m).rounded_rectangle((i, i, w * self.ss - 1 - i, h * self.ss - 1 - i), radius=max(0, (r - inset) * self.ss), fill=255)
        return m

    def _down(self, im, size):
        return im.resize(size, Image.LANCZOS)

    # ---- panels
    def panel(self, w, h, r=14, top=CARD_TOP, bottom=CARD_BOTTOM, edge=EDGE, edge_top=EDGE_TOP, border=1):
        """A rounded panel, lighter at the top, with an edge (`border` px thick) that catches light from above."""
        W, H, R = self.px(w), self.px(h), self.px(r)

        def build():
            line = max(1, self.px(border))
            out = Image.new("RGBA", (W * self.ss, H * self.ss), (0, 0, 0, 0))
            out.paste(self._vgrad(W * self.ss, H * self.ss, edge_top, edge), (0, 0), self._rr(W, H, R))
            out.paste(self._vgrad(W * self.ss, H * self.ss, top, bottom), (0, 0), self._rr(W, H, R, inset=line))
            return self._down(out, (W, H))
        return self.cached(("panel", W, H, R, top, bottom, edge, edge_top, border), build)

    def banner(self, w, h, r, top, bottom, edge, light=None):
        """The coloured title strip across the top of a window: rounded top corners, square bottom, a dark line
        under it and (optionally) a light line along its top edge."""
        W, H, R = self.px(w), self.px(h), self.px(r)

        def build():
            mask = self._rr(W, H + R, R).crop((0, 0, W * self.ss, H * self.ss))
            out = Image.new("RGBA", (W * self.ss, H * self.ss), (0, 0, 0, 0))
            out.paste(self._vgrad(W * self.ss, H * self.ss, top, bottom), (0, 0), mask)
            d = ImageDraw.Draw(out)
            lw = max(self.ss, int(self.scale * self.ss))
            d.rectangle((0, H * self.ss - lw, W * self.ss, H * self.ss), fill=hexrgb(edge) + (255,))
            if light:
                line = Image.new("RGBA", out.size, (0, 0, 0, 0))
                ImageDraw.Draw(line).rectangle((R * self.ss // 2, lw, W * self.ss - R * self.ss // 2, lw * 2), fill=hexrgb(light) + (200,))
                out = Image.alpha_composite(out, Image.composite(line, Image.new("RGBA", out.size, (0, 0, 0, 0)), mask))
            return self._down(out, (W, H))
        return self.cached(("banner", W, H, R, top, bottom, edge, light), build)

    def glow(self, w, h, r, color, pad=24, blur=14, alpha=0.5):
        """A soft coloured glow behind a rounded shape. The picture is (w + 2 pad) x (h + 2 pad)."""
        W, H, R, P = self.px(w), self.px(h), self.px(r), self.px(pad)

        def build():
            m = Image.new("L", ((W + 2 * P) * self.ss, (H + 2 * P) * self.ss), 0)
            ImageDraw.Draw(m).rounded_rectangle((P * self.ss, P * self.ss, (P + W) * self.ss, (P + H) * self.ss), radius=R * self.ss, fill=int(255 * alpha))
            m = m.filter(ImageFilter.GaussianBlur(self.scale * blur * self.ss))
            out = Image.new("RGBA", m.size, hexrgb(color) + (0,))
            out.putalpha(m)
            return self._down(out, (W + 2 * P, H + 2 * P))
        return self.cached(("glow", W, H, R, color, P, blur, alpha), build)

    # ---- text
    def text_width(self, text, weight, size, tabular=False):
        """Width in logical px."""
        return self._advances(text, self.font(weight, size), tabular)[1] / (self.scale * self.ss)

    @staticmethod
    def _advances(text, font, tabular):
        """x position of each character (3x px) and the total width. With tabular=True every digit gets the
        same width, so a number doesn't jiggle as its digits change."""
        digit = max(font.getlength(str(d)) for d in range(10)) if tabular else 0
        xs, x = [], 0.0
        for ch in text:
            xs.append(x)
            x += digit if (tabular and ch.isdigit()) else font.getlength(ch)
        return xs, x, digit

    def text(self, text, weight="semibold", size=14, color=TEXT, gradient=None, glow=None, tabular=False, spacing=0.0, stroke=None):
        """Text as a picture: (image, left pad, top pad, width) with all sizes in real pixels.
        gradient=(top, bottom) colours the text top to bottom; glow=(colour, blur, alpha) adds a soft halo;
        stroke=(colour, width) draws an outline around every letter (like MapleStory's damage numbers)."""
        key = ("text", text, weight, size, color, gradient, glow, tabular, spacing, stroke, self.scale)

        def build():
            font = self.font(weight, size)
            asc, desc = font.getmetrics()
            chars = list(text)
            xs, total, digit = self._advances(text, font, tabular)
            if spacing:
                xs = [x + i * spacing * self.scale * self.ss for i, x in enumerate(xs)]
                total += len(chars) * spacing * self.scale * self.ss
            sw = int(round(stroke[1] * self.scale * self.ss)) if stroke else 0
            pad = int((glow[1] * 2.2 * self.scale if glow else 2 * self.scale) * self.ss) + sw
            wpx, hpx = int(total) + 2 * pad, asc + desc + 2 * pad
            mask = Image.new("L", (wpx, hpx), 0)
            outline = Image.new("L", (wpx, hpx), 0) if sw else None
            d = ImageDraw.Draw(mask)
            do = ImageDraw.Draw(outline) if sw else None
            for ch, x in zip(chars, xs):
                dx = (digit - font.getlength(ch)) / 2 if (tabular and ch.isdigit()) else 0
                d.text((pad + x + dx, pad + asc), ch, font=font, fill=255, anchor="ls")
                if sw:
                    do.text((pad + x + dx, pad + asc), ch, font=font, fill=255, anchor="ls", stroke_width=sw, stroke_fill=255)
            fill = self._vgrad(wpx, hpx, *gradient) if gradient else Image.new("RGB", (wpx, hpx), hexrgb(color))
            if gradient:                                    # spread the gradient over the glyphs, not the padding
                fill = self._vgrad(wpx, asc + desc, *gradient)
                full = Image.new("RGB", (wpx, hpx), hexrgb(gradient[0]))
                full.paste(fill, (0, pad))
                fill = full
            im = fill.convert("RGBA")
            im.putalpha(mask)
            if sw:                                          # the outline goes underneath the letters
                ring = Image.new("RGBA", mask.size, hexrgb(stroke[0]) + (0,))
                ring.putalpha(outline)
                im = Image.alpha_composite(ring, im)
            if glow:
                g = (outline or mask).filter(ImageFilter.GaussianBlur(glow[1] * self.scale * self.ss)).point(lambda v: int(v * glow[2]))
                halo = Image.new("RGBA", mask.size, hexrgb(glow[0]) + (0,))
                halo.putalpha(g)
                im = Image.alpha_composite(halo, im)
            size_px = (max(1, wpx // self.ss), max(1, hpx // self.ss))
            return self._down(im, size_px), pad // self.ss, pad // self.ss, int(total) // self.ss
        return self.cached(key, build)

    # ---- the progress bar
    def bar(self, w, h, frac, fill=(GOLD_DARK, GOLD_LIGHT), track=TRACK, glow=GOLD, glow_alpha=0.55, edge=None, shine=False):
        """A track with a coloured fill. glow=colour adds a soft glow under the fill; edge=colour outlines the track
        (a game-gauge look); shine=True puts a glossy highlight along the top of the fill.
        The picture is (w + 2 pad) x (h + 2 pad); pad is returned."""
        H = max(1, self.px(h))
        W = max(H, self.px(w))                                  # never narrower than it is tall (and never negative)
        pad = self.px(8)
        frac = 0.0 if frac != frac else max(0.0, min(1.0, frac))      # (a NaN counts as empty)
        fw = int(round(W * frac)) if frac > 0 else 0
        fw = max(min(W, H), fw) if frac > 0 else 0              # always show at least a round dot

        def build():
            N = ((W + 2 * pad) * self.ss, (H + 2 * pad) * self.ss)
            out = Image.new("RGBA", N, (0, 0, 0, 0))
            e = max(self.ss, int(self.scale * self.ss)) if edge else 0

            def pill(x1, x2, inset=0):
                m = Image.new("L", N, 0)
                ImageDraw.Draw(m).rounded_rectangle((x1 * self.ss + inset, pad * self.ss + inset, x2 * self.ss - inset, (pad + H) * self.ss - inset), radius=max(1, H * self.ss // 2 - inset), fill=255)
                return m
            if edge:
                out.paste(Image.new("RGBA", N, hexrgb(edge) + (255,)), (0, 0), pill(pad, pad + W))
            out.paste(Image.new("RGBA", N, hexrgb(track) + (255,)), (0, 0), pill(pad, pad + W, e))
            if fw:
                fm = pill(pad, pad + fw, e)
                if glow:
                    g = fm.filter(ImageFilter.GaussianBlur(self.scale * 5 * self.ss)).point(lambda v: int(v * glow_alpha))
                    halo = Image.new("RGBA", N, hexrgb(glow) + (0,))
                    halo.putalpha(g)
                    out = Image.alpha_composite(out, halo)
                grad = self._hgrad(N[0], N[1], fill[0], fill[1]).convert("RGBA")
                out.paste(grad, (0, 0), fm)
                if shine:                                       # a glossy stripe over the top half of the fill
                    stripe = Image.new("L", N, 0)
                    ImageDraw.Draw(stripe).rounded_rectangle((pad * self.ss + 2 * e, pad * self.ss + e + self.ss // 2, (pad + fw) * self.ss - 2 * e, pad * self.ss + e + int(H * self.ss * 0.42)),
                                                             radius=max(1, H * self.ss // 5), fill=95)
                    gloss = Image.new("RGBA", N, (255, 255, 255, 0))
                    gloss.putalpha(Image.composite(stripe, Image.new("L", N, 0), fm))
                    out = Image.alpha_composite(out, gloss)
            return self._down(out, (W + 2 * pad, H + 2 * pad))
        return self.cached(("bar", W, H, fw, fill, track, glow, glow_alpha, edge, shine), build), pad

    # ---- dots, chips and buttons
    def dot(self, d, color, glow=True):
        """A filled circle (d logical px across) with a soft glow. Returns (picture, pad in real pixels)."""
        D, pad = self.px(d), self.px(d * 0.9)

        def build():
            out = Image.new("RGBA", (D + 2 * pad, D + 2 * pad), (0, 0, 0, 0))
            if glow:
                out.alpha_composite(self.glow(d, d, d / 2, color, pad=d * 0.9, blur=d * 0.45, alpha=0.9), (0, 0))
            m = Image.new("L", (D * self.ss, D * self.ss), 0)
            ImageDraw.Draw(m).ellipse((0, 0, D * self.ss - 1, D * self.ss - 1), fill=255)
            m = m.resize((D, D), Image.LANCZOS)
            out.paste(Image.new("RGBA", (D, D), hexrgb(color) + (255,)), (pad, pad), m)
            return out
        return self.cached(("dot", D, color, glow), build), pad

    def chip(self, text, dot=None, arrow=None, color=TEXT, size=12, h=28, bg="#10131a", edge="#232732", padding=12):
        """A pill with an optional glowing status dot, or a small up/down arrow: arrow=("up"|"down", colour)."""
        timg, tpx, tpy, tw = self.text(text, "semibold", size, color) if text else (Image.new("RGBA", (1, 1)), 0, 0, 0)
        lead = self.px(8 + 8) if dot else self.px(8 + 6) if arrow else 0
        W = tw + self.px(2 * padding) + lead if text else self.px(2 * padding) + lead
        H = self.px(h)

        def build():
            base = self.panel(W / self.scale, H / self.scale, h / 2, top=bg, bottom=bg, edge=edge, edge_top=edge).copy()
            cx, cy = self.px(padding) + self.px(4), H // 2
            if dot:
                dimg, dpad = self.dot(8, dot)
                base.alpha_composite(dimg, (cx - dimg.width // 2, cy - dimg.height // 2))
            if arrow:
                direction, acol = arrow
                S = self.px(8)
                tm = Image.new("L", (S * self.ss, S * self.ss), 0)
                pts = [(0, S * self.ss), (S * self.ss, S * self.ss), (S * self.ss / 2, 0)] if direction == "up" else [(0, 0), (S * self.ss, 0), (S * self.ss / 2, S * self.ss)]
                ImageDraw.Draw(tm).polygon(pts, fill=255)
                tm = tm.resize((S, S), Image.LANCZOS)
                base.paste(Image.new("RGBA", (S, S), hexrgb(acol) + (255,)), (cx - S // 2, cy - S // 2), tm)
            if text:
                base.alpha_composite(timg, (W - self.px(padding) - tw - tpx, (H - timg.height) // 2))
            return base
        return self.cached(("chip", W, H, dot, arrow, bg, edge, text, color, size), build)

    def button(self, w, h, face, r=12):
        """A rounded button face. face = (top, bottom, edge, edge_top) colours, so every theme can have its own."""
        top, bottom, edge, edge_top = face
        return self.panel(w, h, r, top=top, bottom=bottom, edge=edge, edge_top=edge_top)

    # ---- icons
    def icon(self, name, size=16, color=TEXT, width=1.8):
        """A small symbol drawn smoothly. names: play pause reset gear expand close list chart leaf coin tag pin dot"""
        S = self.px(size)

        def build():
            N = S * self.ss
            m = Image.new("L", (N, N), 0)
            d = ImageDraw.Draw(m)
            lw = max(2, int(width * self.scale * self.ss))
            u = N / 16.0
            if name == "play":
                d.polygon([(4.5 * u, 2.5 * u), (13.5 * u, 8 * u), (4.5 * u, 13.5 * u)], fill=255)
            elif name == "pause":
                for x in (3.5, 9.0):
                    d.rounded_rectangle((x * u, 2.5 * u, (x + 3.5) * u, 13.5 * u), radius=1.2 * u, fill=255)
            elif name == "reset":
                d.arc((2.2 * u, 2.2 * u, 13.8 * u, 13.8 * u), start=30, end=320, fill=255, width=lw)
                d.polygon([(9.3 * u, 0.6 * u), (14.6 * u, 3.0 * u), (9.9 * u, 6.2 * u)], fill=255)
            elif name == "gear":
                import math
                cx = cy = 8 * u
                for k in range(8):
                    a = k * math.pi / 4
                    p = [(cx + math.cos(a + da) * r * u, cy + math.sin(a + da) * r * u)
                         for r, da in ((4.6, -0.2), (7.4, -0.14), (7.4, 0.14), (4.6, 0.2))]
                    d.polygon(p, fill=255)
                d.ellipse((cx - 5.2 * u, cy - 5.2 * u, cx + 5.2 * u, cy + 5.2 * u), fill=255)
                d.ellipse((cx - 2.3 * u, cy - 2.3 * u, cx + 2.3 * u, cy + 2.3 * u), fill=0)
            elif name == "expand":
                d.line([(9.5 * u, 6.5 * u), (14 * u, 2 * u)], fill=255, width=lw)
                d.polygon([(9.6 * u, 2 * u), (14.2 * u, 1.8 * u), (14.2 * u, 6.4 * u)], fill=255)
                d.line([(6.5 * u, 9.5 * u), (2 * u, 14 * u)], fill=255, width=lw)
                d.polygon([(2 * u, 9.6 * u), (1.8 * u, 14.2 * u), (6.4 * u, 14.2 * u)], fill=255)
            elif name == "close":
                d.line([(3.5 * u, 3.5 * u), (12.5 * u, 12.5 * u)], fill=255, width=lw)
                d.line([(12.5 * u, 3.5 * u), (3.5 * u, 12.5 * u)], fill=255, width=lw)
            elif name == "list":
                for y in (4, 8, 12):
                    d.rounded_rectangle((2 * u, (y - 0.7) * u, 14 * u, (y + 0.7) * u), radius=0.7 * u, fill=255)
            elif name == "chart":
                for x, top in ((2.5, 8.5), (6.5, 4), (10.5, 1.5)):
                    d.rounded_rectangle((x * u, top * u, (x + 3) * u, 14.5 * u), radius=1.0 * u, fill=255)
            elif name == "leaf":
                # A maple leaf: five pointed lobes with notches between them and a short stem (right side listed
                # top to bottom, then mirrored for the left).
                right = [(8.0, 0.3), (9.5, 3.7), (11.3, 2.6), (11.2, 5.4), (14.2, 4.6), (13.3, 7.4), (15.8, 8.6),
                         (12.2, 10.3), (12.9, 12.6), (9.6, 11.6), (8.7, 12.4), (8.7, 15.7)]
                pts = right + [(16 - x, y) for x, y in reversed(right)]
                d.polygon([(x * u, y * u) for x, y in pts], fill=255)
            elif name == "coin":
                d.ellipse((1 * u, 1 * u, 15 * u, 15 * u), fill=255)                     # the coin
                d.ellipse((3.1 * u, 3.1 * u, 12.9 * u, 12.9 * u), fill=0)               # a gap, leaving a rim
                d.ellipse((4.3 * u, 4.3 * u, 11.7 * u, 11.7 * u), fill=255)             # the face inside the rim
            elif name == "tag":
                d.polygon([(1.5 * u, 8.5 * u), (8.5 * u, 1.5 * u), (14.5 * u, 1.5 * u), (14.5 * u, 7.5 * u), (7.5 * u, 14.5 * u)], fill=255)
                d.ellipse((10.2 * u, 3.4 * u, 12.6 * u, 5.8 * u), fill=0)
            elif name == "pin":
                d.polygon([(8 * u, 15.5 * u), (3.2 * u, 7.6 * u), (4.6 * u, 3.4 * u), (8 * u, 1.4 * u), (11.4 * u, 3.4 * u), (12.8 * u, 7.6 * u)], fill=255)
                d.ellipse((5.9 * u, 4.3 * u, 10.1 * u, 8.5 * u), fill=0)
            elif name == "dot":
                d.ellipse((3 * u, 3 * u, 13 * u, 13 * u), fill=255)
            im = Image.new("RGBA", (N, N), hexrgb(color) + (0,))
            im.putalpha(m)
            return self._down(im, (S, S))
        return self.cached(("icon", name, S, color, width), build)
