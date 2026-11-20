"""The tracker's window, drawn as one smooth picture, in three shapes (like the community overlay):

  square   the main view: big EXP/hr number, progress bar, details, Start/Pause button
  wide     a flat view with four stat columns
  bar      a slim strip to keep next to the game
  mesos    only the mesos tracker: mesos gained (big), per hour, in your inventory and time tracked
  market   a live feed of the 5 newest buy / sell offers from the chat, with a button to open the history

render() turns a plain dictionary of display values (all already text) into a picture plus a list of
clickable areas, in whichever design (theme, see themes.py) the View was given. It does no measuring of
the game and keeps no state, so it can be tested and previewed without a screen.
"""

import re

from PIL import Image

from gfx import Gfx, hexrgb
from themes import DEFAULT_THEME, THEMES

KEY = "#010203"                           # the window's "see-through" colour, so the corners can be rounded
LAYOUTS = ("square", "wide", "bar", "mesos", "market")
SIZES = {"square": (380, 560), "wide": (520, 262), "bar": (520, 150), "mesos": (380, 396), "market": (420, 446)}       # logical px


def blit(canvas, img, x, y):
    """Paste an RGBA picture with its top-left at (x, y), cropping whatever falls outside the canvas."""
    sx, sy = max(0, -x), max(0, -y)
    dx, dy = max(0, x), max(0, y)
    w, h = min(img.width - sx, canvas.width - dx), min(img.height - sy, canvas.height - dy)
    if w > 0 and h > 0:
        canvas.alpha_composite(img, (dx, dy), (sx, sy, sx + w, sy + h))


class View:
    def __init__(self, gfx: Gfx, theme=None):
        self.g = gfx
        self.t = theme or THEMES[DEFAULT_THEME]

    FEED_CARD_H = 160                                  # the market section on the main layout

    @classmethod
    def dims(cls, layout, s=None):
        """The window's size in logical px. The main layout grows by the market section when it is switched on."""
        w, h = SIZES[layout]
        if layout == "square" and s and s.get("show_feed"):
            h += cls.FEED_CARD_H + 12
        return w, h

    def size(self, layout, s=None):
        w, h = self.dims(layout, s)
        return self.g.px(w), self.g.px(h)

    # ---- small helpers (logical coordinates)
    def _text(self, c, s, x, y, weight="semibold", size=13, color=None, anchor="l", **kw):
        """Draw text with its top at y. anchor l/m/r says whether x is its left, middle or right. Returns its width."""
        g = self.g
        img, padx, pady, tw = g.text(s, weight, size, color or self.t.text, **kw)
        X = g.px(x) - (tw if anchor == "r" else tw // 2 if anchor == "m" else 0)
        blit(c, img, X - padx, g.px(y) - pady)
        return tw / g.scale

    def _wrap(self, text, weight, size, maxw, lines=2):
        """Word-wrap into at most `lines` lines, ending with '…' if it doesn't fit."""
        words, out, cur = text.split(), [], ""
        for w in words:
            trial = (cur + " " + w).strip()
            if self.g.text_width(trial, weight, size) <= maxw or not cur:
                cur = trial
            else:
                out.append(cur)
                cur = w
        out.append(cur)
        if len(out) > lines:
            out = out[:lines]
            last = out[-1]
            while last and self.g.text_width(last + "…", weight, size) > maxw:
                last = last[:-1]
            out[-1] = last.rstrip() + "…"
        return out

    @staticmethod
    def abbreviate(text):
        """'123,456,789' -> '123.46M' (only for plain numbers; anything else is returned as it is)."""
        m = re.fullmatch(r"([+\-]?)([\d,]+)", text)
        if not m:
            return text
        n = int(m.group(2).replace(",", ""))
        for limit, div, suffix, places in ((10 ** 9, 1e9, "B", 2), (10 ** 6, 1e6, "M", 2), (10 ** 4, 1e3, "K", 1)):
            if n >= limit:
                return f"{m.group(1)}{n / div:.{places}f}{suffix}"
        return text

    def _fit(self, text, weight, sizes, maxw, tabular=True):
        """(text, size): the biggest size at which the text fits. If even the smallest is too wide and the text
        is a number, a shorter form of it ('12.35B') is used instead, so nothing ever spills out of its card."""
        for s in sizes:
            if self.g.text_width(text, weight, s, tabular) <= maxw:
                return text, s
        short = self.abbreviate(text)
        for s in sizes:
            if self.g.text_width(short, weight, s, tabular) <= maxw:
                return short, s
        return short, sizes[-1]

    def _hero(self, c, s, x, y, sizes, maxw, anchor="l"):
        """The big EXP/hr number in the theme's style (gold glow, or an outlined brown/orange number)."""
        t = self.t
        s, size = self._fit(s, "extrabold", sizes, maxw)
        kw = {"gradient": t.hero_gradient, "tabular": True}
        if t.hero_glow:
            kw["glow"] = (t.hero_glow[0], t.hero_glow[1] * size / 50.0, t.hero_glow[2])
        if t.hero_stroke:
            kw["stroke"] = (t.hero_stroke[0], max(1.0, t.hero_stroke[1] * size / 50.0))
        return self._text(c, s, x, y, "extrabold", size, anchor=anchor, **kw)

    def _card(self, c, x, y, w, h, r=16, face=None):
        """A card with the theme's edge, an optional soft shadow under it."""
        g, t = self.g, self.t
        if t.card_shadow:
            colour, alpha, blur, dy = t.card_shadow
            sh = g.glow(w - 4, h - 4, r, colour, pad=14, blur=blur, alpha=alpha)
            blit(c, sh, g.px(x + 2 - 14), g.px(y + 2 + dy - 14))
        top, bottom, edge, edge_top = face or t.card
        blit(c, g.panel(w, h, r, top=top, bottom=bottom, edge=edge, edge_top=edge_top, border=t.card_border), g.px(x), g.px(y))

    def _gauge(self, c, x, y_mid, w, frac, layout):
        g, t = self.g, self.t
        h = t.bar_h[layout]
        bar, pad = g.bar(w, h, frac, fill=t.bar_fill, track=t.bar_track, glow=t.bar_glow, glow_alpha=t.bar_glow_alpha,
                         edge=t.bar_edge, shine=t.bar_shine)
        blit(c, bar, g.px(x) - pad, g.px(y_mid - h / 2) - pad)
        return h

    def _icon_button(self, c, regs, name, icon, x, y, size, hover, r=10, primary=False):
        g, t = self.g, self.t
        on = hover == name
        face = (t.primary_hover if on else t.primary) if primary else (t.btn_hover if on else t.btn)
        colour = t.primary_icon if primary else (t.btn_icon_hover if on else t.btn_icon)
        blit(c, g.button(size, size, face, r=r), g.px(x), g.px(y))
        ic = g.icon(icon, 16, colour)
        blit(c, ic, g.px(x + size / 2) - ic.width // 2, g.px(y + size / 2) - ic.height // 2)
        regs.append((name, g.px(x), g.px(y), g.px(x + size), g.px(y + size)))

    def _status_chip(self, c, s, x, y, text=None, kind=None):
        g, t = self.g, self.t
        chip = g.chip(text if text is not None else s["status_text"], dot=t.dots.get(kind or s["status_kind"], t.dim), color=t.chip_text, size=12, h=30,
                      bg=t.chip[0], edge=t.chip[1])
        blit(c, chip, g.px(x), g.px(y))

    def _trend_chip(self, c, s, right, y):
        """'▲ 12% last 5 min' (green) or '▼ 8% ...' (orange)."""
        if not s.get("trend_text"):
            return
        g, t = self.g, self.t
        up = s.get("trend_dir", "up") == "up"
        colour, bg, edge = t.trend_up if up else t.trend_down
        chip = g.chip(s["trend_text"], arrow=("up" if up else "down", colour), color=colour, size=11, h=24, bg=bg, edge=edge, padding=10)
        blit(c, chip, g.px(right) - chip.width, g.px(y))

    def _title_bar(self, c, regs, s, hover, W):
        g, t = self.g, self.t
        b = t.win_border
        if t.banner:                                                         # the coloured strip across the top
            blit(c, g.banner(W - 2 * b, 34 - b, t.win_radius - b, *t.banner), g.px(b), g.px(b))
        isz = t.title_icon_size
        if t.title_icon_shadow:                                              # a little brown shadow so a white icon stands out
            sh = g.icon(t.title_icon, isz, t.title_icon_shadow)
            blit(c, sh, g.px(13) + g.px(1), g.px(17 - isz / 2) + g.px(1))
        blit(c, g.icon(t.title_icon, isz, t.title_icon_color), g.px(13), g.px(17 - isz / 2))
        self._text(c, s.get("title", "Maple EXP Tracker"), 38, 8 if t.banner else 9, "bold" if t.banner else "semibold",
                   12.5 if t.banner else 12, t.title_color, stroke=t.title_stroke)
        on = hover == "close"
        if on:
            blit(c, g.button(28, 24, t.close_hover_face, r=8), g.px(W - 40), g.px(5))
        ic = g.icon("close", 14, t.close_icon_hover if on else t.close_icon)
        blit(c, ic, g.px(W - 26) - ic.width // 2, g.px(17) - ic.height // 2)
        regs.append(("close", g.px(W - 40), g.px(5), g.px(W - 12), g.px(29)))

    def _divider(self, c, x, y0, y1):
        g = self.g
        blit(c, Image.new("RGBA", (max(1, g.px(1)), g.px(y1 - y0)), hexrgb(self.t.divider) + (255,)), g.px(x), g.px(y0))

    def _footer(self, c, s, x, y, maxw, size=12, lines=2):
        for i, line in enumerate(self._wrap(s.get("hint", ""), "regular", size, maxw, lines)):
            self._text(c, line, x, y + i * (size + 5), "regular", size, self.t.muted)

    def _toggle_button(self, c, regs, s, hover, x, y, w, h):
        g, t = self.g, self.t
        on = hover == "toggle"
        blit(c, g.button(w, h, t.primary_hover if on else t.primary), g.px(x), g.px(y))
        label = "Pause" if s["running"] else "Start"
        lw = g.text_width(label, "bold" if t.primary_stroke else "semibold", 15)
        ic = g.icon("pause" if s["running"] else "play", 16, t.primary_icon)
        total = 16 + 10 + lw
        blit(c, ic, g.px(x + (w - total) / 2), g.px(y + h / 2) - ic.height // 2)
        self._text(c, label, x + (w - total) / 2 + 26, y + h / 2 - 10, "bold" if t.primary_stroke else "semibold", 15,
                   t.primary_text, stroke=t.primary_stroke)
        regs.append(("toggle", g.px(x), g.px(y), g.px(x + w), g.px(y + h)))

    # ---- the three layouts
    def render(self, layout, s, hover=None):
        """-> (RGB picture, [(name, x0, y0, x1, y1) in real pixels]). `s` is the display dictionary."""
        g, t = self.g, self.t
        W, H = self.dims(layout, s)
        canvas = Image.new("RGBA", (g.px(W), g.px(H)), hexrgb(KEY) + (255,))
        top, bottom, edge, edge_top = t.win
        blit(canvas, g.panel(W, H, t.win_radius, top=top, bottom=bottom, edge=edge, edge_top=edge_top, border=t.win_border), 0, 0)
        regs = []
        self._title_bar(canvas, regs, s, hover, W)
        {"square": self._square, "wide": self._wide, "bar": self._bar, "mesos": self._mesos, "market": self._market}[layout](canvas, regs, s, hover, W, H)
        regs.append(("drag", 0, 0, g.px(W), g.px(H)))                      # anywhere else drags the window
        return canvas.convert("RGB"), regs

    @staticmethod
    def _mesos_gained(s):
        """(value, is_prompt) for the mesos-gained figure: '+6,540', or the 'Open inventory' prompt before it is read."""
        st = s["stats"]
        if st.get("mesos_hr") == "Open inventory":
            return "Open inventory", True
        return st.get("mesos_gained", "--"), False

    def _hdivider(self, c, x0, x1, y):
        g = self.g
        blit(c, Image.new("RGBA", (g.px(x1 - x0), max(1, g.px(1))), hexrgb(self.t.divider) + (255,)), g.px(x0), g.px(y))

    def _square(self, c, regs, s, hover, W, H):
        g, t = self.g, self.t
        self._status_chip(c, s, 14, 46)
        self._icon_button(c, regs, "settings", "gear", W - 14 - 34, 44, 34, hover)
        self._icon_button(c, regs, "layout", "expand", W - 14 - 34 - 8 - 34, 44, 34, hover)
        self._icon_button(c, regs, "market", "tag", W - 14 - 34 - 8 - 34 - 8 - 34, 44, 34, hover)

        # the big card: EXP per hour, the bar and the time to level
        cx, cy, cw, ch = 14, 92, W - 28, 152
        if t.card_glow:
            blit(c, g.glow(cw - 80, 70, 35, t.accent, pad=34, blur=20, alpha=t.card_glow[1]), g.px(cx + 30 - 34), g.px(cy + 38 - 34))
        self._card(c, cx, cy, cw, ch)
        self._text(c, "EXP PER HOUR", cx + 18, cy + 17, "semibold", 10.5, t.dim, spacing=1.1)
        self._trend_chip(c, s, cx + cw - 14, cy + 12)
        self._hero(c, s["hero"], cx + 18, cy + 36, (50, 44, 38, 32, 27), cw - 36)
        bh = self._gauge(c, cx + 18, cy + 112, cw - 36, s["frac"], "square")
        ey = cy + 112 + bh / 2 + 8
        self._text(c, s["eta"], cx + 18, ey, "semibold", 14, t.accent)
        self._text(c, s["pct"], cx + cw - 18, ey + 1, "semibold", 13, t.muted, anchor="r")

        # the details: EXP on top, mesos underneath (three rows of two)
        my = cy + ch + 12
        self._map_line(c, regs, s, hover, 14, my, W - 28, 30)
        dx, dy, dw, dh = 14, my + 30 + 10, W - 28, 130
        self._card(c, dx, dy, dw, dh, r=14, face=t.panel2)
        st = s["stats"]
        gained, lost = st["gained"], st["lost"]
        mesos_hr, mesos_gained = st.get("mesos_hr", s.get("mesos", "--")), st.get("mesos_gained", "--")
        cells = [("EXP LEFT", st["left"], t.text),
                 ("GAINED", gained, t.good if gained.startswith("+") and gained != "+0" else t.text),
                 ("LAST 5 MIN", st["recent"], t.text),
                 ("LOST", lost, t.warn if lost not in ("0", "--") else t.text),
                 ("MESOS / HR", mesos_hr, t.muted if mesos_hr[:1].isalpha() else t.text),
                 ("MESOS GAINED", mesos_gained, t.good if mesos_gained.startswith("+") and mesos_gained != "+0" else t.text)]
        for i, (lab, val, col) in enumerate(cells):
            x, y = dx + 18 + (i % 2) * (dw / 2), dy + 12 + (i // 2) * 38
            self._text(c, lab, x, y, "semibold", 9.5, t.dim, spacing=1.0)
            val, vsz = self._fit(val, "semibold", (13, 12) if val[:1].isalpha() else (15, 14, 13, 12), dw / 2 - 34)      # a prompt like "Open inventory" is a hint, so smaller
            self._text(c, val, x, y + 13 + (15 - vsz) * 0.4, "semibold", vsz, col, tabular=True)
        self._divider(c, dx + dw / 2 - 8, dy + 14, dy + dh - 14)
        self._hdivider(c, dx + 14, dx + dw - 14, dy + 12 + 2 * 38 - 8)             # between the EXP rows and the mesos row

        by = dy + dh + 12
        if s.get("show_feed"):                                                    # the market section: the newest offers from the chat
            self._feed_card(c, regs, s, hover, 14, by, W - 28, self.FEED_CARD_H)
            by += self.FEED_CARD_H + 12
        self._toggle_button(c, regs, s, hover, 14, by, W - 28 - 52 - 52 - 16, 46)
        self._icon_button(c, regs, "reset", "reset", W - 14 - 46 - 6 - 46, by, 46, hover, r=12)
        self._icon_button(c, regs, "log", "list", W - 14 - 46, by, 46, hover, r=12)
        self._footer(c, s, 18, by + 46 + 12, W - 36, lines=3)

    def _map_line(self, c, regs, s, hover, x, y, w, h):
        """Which map this session is on (it is saved with the session in the log). Clicking it lets you change it."""
        g, t = self.g, self.t
        on = hover == "map"
        self._card(c, x, y, w, h, r=12, face=t.card if on else t.panel2)
        ic = g.icon("pin", 14, t.accent if not s.get("map") else t.btn_icon)
        blit(c, ic, g.px(x + 12), g.px(y + h / 2) - ic.height // 2)
        self._text(c, "MAP", x + 32, y + 10, "semibold", 9.5, t.dim, spacing=1.0)
        action = "Change" if s.get("map") else "Set"
        aw = self._text(c, action, x + w - 12, y + 8, "semibold", 11, t.accent if not s.get("map") else t.muted, anchor="r")
        room = w - 32 - 40 - aw - 12 - 12
        if s.get("map"):
            self._text(c, self._ellipsize(s["map"], "semibold", 12.5, room), x + 68, y + 7, "semibold", 12.5, t.text)
        else:
            self._text(c, "Not set: click to log this session with its map", x + 68, y + 8, "regular", 11.5, t.dim)
        regs.append(("map", g.px(x), g.px(y), g.px(x + w), g.px(y + h)))

    def _feed_card(self, c, regs, s, hover, x, y, w, h):
        """A compact market section: up to five of the newest offers, one line each. Clicking it opens the history."""
        g, t = self.g, self.t
        on = hover == "history"
        self._card(c, x, y, w, h, r=14, face=t.card if on else t.panel2)
        self._text(c, "MARKET", x + 14, y + 11, "semibold", 9.5, t.dim, spacing=1.0)
        ic = g.icon("list", 14, t.btn_icon_hover if on else t.btn_icon)
        blit(c, ic, g.px(x + w - 14) - ic.width, g.px(y + 16) - ic.height // 2)
        status = self._ellipsize(str(s.get("chat_text", "")), "regular", 10.5, w - 110)
        tw = self._text(c, status, x + w - 36, y + 10, "regular", 10.5, t.muted, anchor="r")
        dot, dpad = g.dot(6, t.dots.get(s.get("chat_kind"), t.dim), glow=False)
        blit(c, dot, g.px(x + w - 36 - tw - 12) - dpad, g.px(y + 16) - dpad)
        rows = [e for e in (s.get("feed") or []) if isinstance(e, dict)][:5]
        if not rows:
            self._text(c, "No offers yet", x + w / 2, y + 58, "semibold", 12.5, t.muted, anchor="m")
            self._text(c, self._ellipsize(str(s.get("feed_empty", "")), "regular", 10.5, w - 28), x + w / 2, y + 80, "regular", 10.5, t.dim, anchor="m")
        for i, e in enumerate(rows):
            ry = y + 32 + i * 24
            up = e.get("side") == "B"
            colour, bg, edge = t.trend_up if up else t.trend_down
            pill = g.chip("BUY" if up else "SELL", color=colour, size=9, h=16, bg=bg, edge=edge, padding=6)
            pill_col = 34
            blit(c, pill, g.px(x + 12 + (pill_col - pill.width / g.scale) / 2), g.px(ry + 3))
            price = str(e.get("price", "-"))
            pw = self._text(c, price, x + w - 12, ry + 3, "bold", 12.5, t.muted if price in ("PMO", "-") else t.accent, anchor="r", tabular=True)
            meta = self._ellipsize(f"{e.get('name', '')} · {e.get('ago', '')}", "regular", 10.5, 92)
            mw = g.text_width(meta, "regular", 10.5)
            self._text(c, meta, x + w - 12 - pw - 10, ry + 5, "regular", 10.5, t.muted, anchor="r")
            left = x + 12 + pill_col + 8
            self._text(c, self._ellipsize(str(e.get("item", "")), "semibold", 12.5, x + w - 12 - pw - 10 - mw - 10 - left), left, ry + 3, "semibold", 12.5, t.text)
        regs.append(("history", g.px(x), g.px(y), g.px(x + w), g.px(y + h)))

    def _ellipsize(self, text, weight, size, maxw):
        """The text, cut short with '…' if it is wider than maxw."""
        if self.g.text_width(text, weight, size) <= maxw:
            return text
        while text and self.g.text_width(text + "…", weight, size) > maxw:
            text = text[:-1]
        return text.rstrip() + "…"

    def _market(self, c, regs, s, hover, W, H):
        """The newest buy / sell offers from the chat, five rows at most, newest first."""
        g, t = self.g, self.t
        self._status_chip(c, s, 14, 46, s.get("chat_text", "Chat reading is off"), s.get("chat_kind", "idle"))
        self._icon_button(c, regs, "settings", "gear", W - 14 - 34, 44, 34, hover)
        self._icon_button(c, regs, "layout", "expand", W - 14 - 34 - 8 - 34, 44, 34, hover)
        self._icon_button(c, regs, "history", "list", W - 14 - 34 - 8 - 34 - 8 - 34, 44, 34, hover)

        rows = [e for e in (s.get("feed") or []) if isinstance(e, dict)][:5]
        pill_col = max(g.chip(w, color=t.text, size=10, h=20, padding=9).width for w in ("BUY", "SELL")) / g.scale      # both badges get the same column
        cx, cy, cw, ch = 14, 92, W - 28, 5 * 46 + 12
        self._card(c, cx, cy, cw, ch)
        if not rows:
            self._text(c, "No offers yet", cx + cw / 2, cy + 78, "semibold", 15, t.muted, anchor="m")
            for i, line in enumerate(self._wrap(s.get("feed_empty", "Waiting for offers on your watch list."), "regular", 12, cw - 60, 4)):
                self._text(c, line, cx + cw / 2, cy + 106 + i * 18, "regular", 12, t.dim, anchor="m")
        for i, e in enumerate(rows):
            y0 = cy + 6 + i * 46
            if i:
                self._divider_h(c, cx + 14, cx + cw - 14, y0 - 1)
            up = e.get("side") == "B"
            colour, bg, edge = t.trend_up if up else t.trend_down
            pill = g.chip("BUY" if up else "SELL", color=colour, size=10, h=20, bg=bg, edge=edge, padding=9)
            blit(c, pill, g.px(cx + 14 + (pill_col - pill.width / g.scale) / 2), g.px(y0 + 7))
            pill_w = pill_col
            price = str(e.get("price", "-"))
            price_colour = t.muted if price in ("PMO", "-") else t.accent
            pw = self._text(c, price, cx + cw - 16, y0 + 6, "bold", 15, price_colour, anchor="r", tabular=True)
            left = cx + 14 + pill_w + 10
            room = cx + cw - 16 - pw - 12 - left
            self._text(c, self._ellipsize(str(e.get("item", "")), "semibold", 13.5, room), left, y0 + 6, "semibold", 13.5, t.text)
            meta = f"{e.get('name', '')} · {e.get('ago', '')}" + (f" · seen {e['count']}x" if e.get("count", 1) > 1 else "")
            self._text(c, self._ellipsize(meta, "regular", 11, cx + cw - 16 - left), left, y0 + 26, "regular", 11, t.muted)

        by = cy + ch + 12
        on = hover == "history"
        blit(c, g.button(W - 28, 44, t.primary_hover if on else t.primary), g.px(14), g.px(by))
        label, lw = "Open the history log", g.text_width("Open the history log", "bold" if t.primary_stroke else "semibold", 15)
        total = 16 + 10 + lw
        ic = g.icon("list", 16, t.primary_icon)
        blit(c, ic, g.px(14 + (W - 28 - total) / 2), g.px(by + 22) - ic.height // 2)
        self._text(c, label, 14 + (W - 28 - total) / 2 + 26, by + 22 - 10, "bold" if t.primary_stroke else "semibold", 15, t.primary_text, stroke=t.primary_stroke)
        regs.append(("history", g.px(14), g.px(by), g.px(W - 14), g.px(by + 44)))
        self._footer(c, {"hint": s.get("feed_note", "")}, 18, by + 44 + 12, W - 36, size=11.5, lines=2)

    def _divider_h(self, c, x0, x1, y):
        g = self.g
        blit(c, Image.new("RGBA", (g.px(x1 - x0), max(1, g.px(1))), hexrgb(self.t.divider) + (255,)), g.px(x0), g.px(y))

    def _mesos(self, c, regs, s, hover, W, H):
        """Only the mesos: how many you have picked up, how fast, what you hold and for how long."""
        g, t = self.g, self.t
        st = s["stats"]
        gained, prompt = self._mesos_gained(s)
        self._status_chip(c, s, 14, 46)
        self._icon_button(c, regs, "settings", "gear", W - 14 - 34, 44, 34, hover)
        self._icon_button(c, regs, "layout", "expand", W - 14 - 34 - 8 - 34, 44, 34, hover)
        self._icon_button(c, regs, "market", "tag", W - 14 - 34 - 8 - 34 - 8 - 34, 44, 34, hover)

        cx, cy, cw, ch = 14, 92, W - 28, 164
        if t.card_glow:
            blit(c, g.glow(cw - 80, 70, 35, t.accent, pad=34, blur=20, alpha=t.card_glow[1]), g.px(cx + 30 - 34), g.px(cy + 38 - 34))
        self._card(c, cx, cy, cw, ch)
        coin = g.icon("coin", 14, t.dots["wait"])
        blit(c, coin, g.px(cx + 18), g.px(cy + 17) + (g.px(12) - coin.height) // 2 + g.px(1))
        self._text(c, "MESOS GAINED", cx + 40, cy + 17, "semibold", 10.5, t.dim, spacing=1.1)
        self._hero(c, "--" if prompt else gained, cx + 18, cy + 36, (50, 44, 38, 32, 27), cw - 36)
        self._hdivider(c, cx + 18, cx + cw - 18, cy + 108)
        colw = (cw - 36) / 3
        cells = [("PER HOUR", s["mesos"] if not prompt else "--", t.text), ("IN INVENTORY", st.get("mesos_now", "--"), t.text),
                 ("TIME TRACKED", st.get("elapsed", "--"), t.text)]
        for i, (lab, val, col) in enumerate(cells):
            x = cx + 18 + i * colw
            if i:
                self._divider(c, x - 8, cy + 118, cy + ch - 16)
            self._text(c, lab, x + (6 if i else 0), cy + 120, "semibold", 9.5, t.dim, spacing=1.0)
            val, vsz = self._fit(val, "semibold", (16, 15, 14, 13, 12), colw - 16)
            self._text(c, val, x + (6 if i else 0), cy + 135 + (16 - vsz) * 0.4, "semibold", vsz, col, tabular=True)

        by = cy + ch + 14
        self._toggle_button(c, regs, s, hover, 14, by, W - 28 - 52 - 52 - 16, 46)
        self._icon_button(c, regs, "reset", "reset", W - 14 - 46 - 6 - 46, by, 46, hover, r=12)
        self._icon_button(c, regs, "log", "list", W - 14 - 46, by, 46, hover, r=12)
        self._footer(c, {"hint": s.get("mesos_hint") or s["hint"]}, 18, by + 46 + 12, W - 36, lines=3)

    def _wide(self, c, regs, s, hover, W, H):
        g, t = self.g, self.t
        self._status_chip(c, s, 14, 46)
        self._icon_button(c, regs, "settings", "gear", W - 14 - 36, 43, 36, hover)
        self._icon_button(c, regs, "layout", "expand", W - 14 - 36 - 8 - 36, 43, 36, hover)
        self._icon_button(c, regs, "market", "tag", W - 14 - 36 - 8 - 36 - 8 - 36, 43, 36, hover)
        self._toggle_button(c, regs, s, hover, W - 14 - 36 - 8 - 36 - 8 - 36 - 8 - 116, 43, 116, 36)

        cx, cy, cw, ch = 14, 92, W - 28, 120
        self._card(c, cx, cy, cw, ch)
        label = s["level_label"][:12]                                   # ("LV 47"; never long, but never trust it)
        self._text(c, label, cx + 18, cy + 14, "bold", 13, t.accent)
        bx = cx + 18 + g.text_width(label, "bold", 13) + 14
        bw = max(40, cx + cw - 18 - 52 - bx)
        self._gauge(c, bx, cy + 23, bw, s["frac"], "wide")
        self._text(c, s["pct"], cx + cw - 18, cy + 14, "semibold", 13, t.muted, anchor="r")
        colw = (cw - 36) / 4
        gained, prompt = self._mesos_gained(s)
        cols = [("EXP / HR", s["hero"], True), ("LAST 5 MIN", s["stats"]["recent"], False), ("MESOS GAINED", gained, False), (s["next_label"], s["to_next"], False)]
        for i, (lab, val, hero) in enumerate(cols):
            x = cx + 18 + i * colw
            if i:
                self._divider(c, x - 10, cy + 52, cy + ch - 16)
            self._text(c, lab, x + (6 if i else 0), cy + 52, "semibold", 9.5, t.dim, spacing=1.0)
            if hero:
                self._hero(c, val, x, cy + 70, (28, 24, 20, 17), colw - 14)
            else:
                is_prompt = lab == "MESOS GAINED" and prompt                      # "Open inventory" is a hint: smaller and muted
                val, size = self._fit(val, "semibold", (14, 13, 12) if is_prompt else (22, 19, 16, 14), colw - 18)
                colour = t.muted if is_prompt else (t.good if lab == "MESOS GAINED" and val.startswith("+") and val != "+0" else t.text)
                self._text(c, val, x + 6, cy + 72 + (22 - size) * 0.3 + (3 if is_prompt else 0), "semibold", size, colour, tabular=True)
        self._footer(c, s, 18, cy + ch + 14, W - 36)

    def _bar(self, c, regs, s, hover, W, H):
        g, t = self.g, self.t
        cx, cy, cw, ch = 14, 42, W - 28, 80
        self._card(c, cx, cy, cw, ch)
        dimg, dpad = g.dot(8, t.dots.get(s["status_kind"], t.dim))
        blit(c, dimg, g.px(cx + 20) - dpad, g.px(cy + 28) - dpad)
        w1 = self._hero(c, s["hero"], cx + 34, cy + 10, (32, 28, 24, 20), 150)
        self._text(c, "EXP/hr", cx + 34 + w1 + 6, cy + 25, "regular", 12, t.muted)
        x2 = cx + 34 + 175 + 40
        gained, prompt = self._mesos_gained(s)
        mesos, msz = self._fit(gained if not prompt else "--", "semibold", (16, 14, 13), 70)
        positive = not prompt and mesos.startswith("+") and mesos != "+0"
        m1 = self._text(c, mesos, x2, cy + 14 + (16 - msz) * 0.4, "semibold", msz, t.good if positive else t.text, tabular=True)
        room = (cx + cw - 14 - 32 - 6 - 32 - 6 - 32) - 8 - (x2 + m1 + 5)                 # space before the buttons
        wanted = "open inventory" if prompt else "mesos gained"
        label = wanted if self.g.text_width(wanted, "regular", 11) <= room else ("inventory" if prompt else "mesos")
        self._text(c, label, x2 + m1 + 5, cy + 18, "regular", 11, t.muted)
        self._text(c, s["eta"], x2, cy + 36, "semibold", 13, t.accent)
        right = cx + cw - 14
        self._icon_button(c, regs, "settings", "gear", right - 32, cy + 8, 32, hover, r=9)
        self._icon_button(c, regs, "layout", "expand", right - 32 - 6 - 32, cy + 8, 32, hover, r=9)
        self._icon_button(c, regs, "toggle", "pause" if s["running"] else "play", right - 32 - 6 - 32 - 6 - 32, cy + 8, 32, hover, r=9, primary=True)
        self._gauge(c, cx + 18, cy + 65, cw - 36 - 52, s["frac"], "bar")
        self._text(c, s["pct"], cx + cw - 18, cy + 56, "semibold", 12, t.muted, anchor="r")
        self._footer(c, s, 18, cy + ch + 10, W - 36, size=11.5, lines=1)
