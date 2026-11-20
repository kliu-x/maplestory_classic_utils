"""Tests for the designs (themes.py) and how they draw (view.py / gfx.py). Run: python tests/test_themes.py

It checks that every design is complete, that every colour is valid, that the text is readable (using the
standard contrast ratio that web accessibility guidelines use), and that every layout draws in every design at
several display scales."""

import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
import numpy as np

from gfx import Gfx, hexrgb
from themes import DEFAULT_THEME, GOLD_THEME, THEMES
from view import KEY, LAYOUTS, SIZES, View

ok = fail = 0


def check(name, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ok   {name}")
    else:
        fail += 1
        print(f"  FAIL {name}  {detail}")


def lum(h):
    def f(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = hexrgb(h)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def colours(value):
    """Every '#rrggbb' string inside a theme value (it may be a tuple or a dict)."""
    if isinstance(value, str):
        return [value] if value.startswith("#") else []
    if isinstance(value, (tuple, list)):
        return [c for v in value for c in colours(v)]
    if isinstance(value, dict):
        return [c for v in value.values() for c in colours(v)]
    return []


print("1) every design is complete and its colours are valid")
check("there are at least two designs, including the default", len(THEMES) >= 2 and DEFAULT_THEME in THEMES, list(THEMES))
for key, th in THEMES.items():
    missing = set(vars(GOLD_THEME)) - set(vars(th))
    extra = set(vars(th)) - set(vars(GOLD_THEME))
    check(f"'{key}' defines exactly the same options as every other design", not missing and not extra, (missing, extra))
    bad = [c for v in vars(th).values() for c in colours(v) if not re.fullmatch(r"#[0-9a-fA-F]{6}", c)]
    check(f"'{key}': every colour is a valid #rrggbb", not bad, bad)
    check(f"'{key}': has a label and a bar height for every layout that has a bar", bool(th.label) and {"square", "wide", "bar"} <= set(th.bar_h))

print("2) the text is readable (contrast ratios; 4.5 is the usual minimum for small text, 3 for large)")
for key, th in THEMES.items():
    surfaces = {"card (top)": th.card[0], "card (bottom)": th.card[1], "details (top)": th.panel2[0], "details (bottom)": th.panel2[1],
                "window (top)": th.win[0], "window (bottom)": th.win[1]}

    def worst(colour, which=None):
        return min((contrast(colour, s), n) for n, s in surfaces.items() if which is None or any(w in n for w in which))
    for label, colour, need in (("main text", th.text, 7.0), ("muted text", th.muted, 4.5), ("small labels", th.dim, 4.3),
                                ("accent text (time to level)", th.accent, 4.5), ("'gained' green", th.good, 4.5), ("'lost' red", th.warn, 4.5)):
        c, where = worst(colour, ("card", "details") if label != "main text" else None)
        check(f"'{key}': {label} {colour} is {c:.1f}:1 on the cards (needs {need})", c >= need, (c, where))
    check(f"'{key}': chip text is readable on its chip", contrast(th.chip_text, th.chip[0]) >= 7)
    check(f"'{key}': trend badges are readable", contrast(th.trend_up[0], th.trend_up[1]) >= 4.5 and contrast(th.trend_down[0], th.trend_down[1]) >= 4.5,
          (contrast(th.trend_up[0], th.trend_up[1]), contrast(th.trend_down[0], th.trend_down[1])))
    check(f"'{key}': the button label reads on the button", contrast(th.primary_text, th.primary[1]) >= 4.5 or (th.primary_stroke and contrast(th.primary_text, th.primary_stroke[0]) >= 4.5))
    check(f"'{key}': the title reads on the title bar", (contrast(th.title_color, th.banner[1]) if th.banner else contrast(th.title_color, th.win[0])) >= 4.5
          or (th.title_stroke and contrast(th.title_color, th.title_stroke[0]) >= 4.5))
    hero_edge = th.hero_stroke[0] if th.hero_stroke else th.hero_gradient[1]
    check(f"'{key}': the big number stands out from the card (it is large text: 3:1)", contrast(hero_edge, th.card[1]) >= 3.0 and contrast(hero_edge, th.card[0]) >= 3.0,
          (contrast(hero_edge, th.card[0]), contrast(hero_edge, th.card[1])))
    check(f"'{key}': the filled part of the bar stands out from its track", contrast(th.bar_fill[0], th.bar_track) >= 3.0, contrast(th.bar_fill[0], th.bar_track))
    check(f"'{key}': Settings window text is readable (text, muted, on buttons, on the accent button, highlighted, selected row)",
          min(contrast(th.dlg_text, th.dlg_bg), contrast(th.dlg_text, th.dlg_btn), contrast(th.dlg_text, th.dlg_field)) >= 7
          and min(contrast(th.dlg_muted, th.dlg_bg), contrast(th.dlg_muted, th.dlg_field)) >= 4.5
          and contrast(th.dlg_on_accent, th.dlg_accent) >= 4.5 and contrast(th.dlg_on_accent, th.dlg_accent_hover) >= 4.5
          and contrast(th.dlg_highlight, th.dlg_bg) >= 4.5 and contrast(th.dlg_select_text, th.dlg_select) >= 7,
          [round(contrast(a, b), 1) for a, b in ((th.dlg_text, th.dlg_bg), (th.dlg_muted, th.dlg_field), (th.dlg_on_accent, th.dlg_accent), (th.dlg_highlight, th.dlg_bg))])

print("3) every layout draws, in every design, at several display scales")
STATES = {
    "tracking": dict(title="Maple EXP Tracker", status_text="Tracking · Lv 47", status_kind="go", hero="850,633", mesos="32,810", mesos_unit="mesos / hr",
                     trend_text="12% last 5 min", trend_dir="up", frac=0.721, pct="72.1%", level_label="LV 47", eta="Lv 48 in 2 h 06 min", to_next="2 h 06 min",
                     next_label="TO LV 48", running=True, hint="Tracking for 12m 04s.", stats=dict(left="154,939", gained="+28,000", recent="850,633", lost="0",
                                                                                                   mesos_hr="32,810", mesos_gained="+6,540", mesos_now="1,006,540", elapsed="00:12:04"), mesos_hint=""),
}
STATES["idle"] = dict(STATES["tracking"], status_text="Ready · Lv 47", status_kind="idle", hero="--", mesos="--", trend_text="", eta="Press Start", to_next="--", running=False,
                      frac=0.0, pct="--", hint="Press Start (or Shift+1) to begin tracking.",
                      mesos_hint="Open your inventory so the tracker can read your mesos.",
                      stats=dict(left="182,939", gained="+0", recent="--", lost="0", mesos_hr="Open inventory", mesos_gained="--", mesos_now="--", elapsed="00:00:00"))
STATES["problem"] = dict(STATES["idle"], status_text="Can't find the EXP bar", status_kind="bad", hint="Move this window: it is covering the bottom of the game, where the EXP bar is. "
                         "If it still can't find it, use Settings > Select area, or make the game window bigger so the numbers are clearer.")
STATES["huge"] = dict(STATES["tracking"], hero="12,345,678,901", status_text="Waiting for EXP · Lv 47", status_kind="wait", trend_text="8% last 5 min", trend_dir="down",
                      mesos="1,234,567,890", stats=dict(left="12,345,678", gained="+9,876,543,210", recent="1,234,567,890", lost="123,456,789",
                                         mesos_hr="1,234,567,890", mesos_gained="+12,345,678,901", mesos_now="98,765,432,109", elapsed="123:45:06"), eta="Lv 48 in 12 d 23 h")
for key, th in THEMES.items():
    for scale in (1.0, 1.25, 1.5, 2.0):
        view = View(Gfx(scale, os.path.join(ROOT, "assets", "fonts")), th)
        problems = []
        for layout in LAYOUTS:
            for sname, state in STATES.items():
                try:
                    img, regs = view.render(layout, state, hover="toggle")
                except Exception as e:                             # noqa: BLE001
                    problems.append((layout, sname, repr(e)))
                    continue
                arr = np.asarray(img)
                if img.size != view.size(layout) or arr.std() < 12 or len(regs) < 5 or regs[-1][0] != "drag":
                    problems.append((layout, sname, img.size, round(float(arr.std()), 1), len(regs)))
        check(f"'{key}' at {int(scale * 100)}%: {len(LAYOUTS)} layouts x {len(STATES)} states draw correctly", not problems, problems)

print("4) the designs really are different, and each looks as intended")
g = Gfx(1.0, os.path.join(ROOT, "assets", "fonts"))
shots = {k: View(g, th).render("square", STATES["tracking"])[0] for k, th in THEMES.items()}
mean_lum = {k: float(np.asarray(im.convert("L"))[60:480, 20:360].mean()) for k, im in shots.items()}
diff = float(np.abs(np.asarray(shots["gold"], float) - np.asarray(shots["classic"], float)).mean())
check(f"the two designs look clearly different (average difference {diff:.0f}/255)", diff > 40, diff)
check(f"Dark & Gold is dark (brightness {mean_lum['gold']:.0f}/255) and MapleStory Classic is light ({mean_lum['classic']:.0f}/255)", mean_lum["gold"] < 70 and mean_lum["classic"] > 170, mean_lum)
v = View(g, THEMES["classic"])
a, b = (np.asarray(v.render("square", STATES["tracking"], hover=h)[0], float) for h in (None, "toggle"))
check("hovering the Start/Pause button changes how it looks", float(np.abs(a - b).mean()) > 0.2)
im = shots["classic"]
check("the corners are 'see-through' (the key colour), so the window can have rounded corners", tuple(im.getpixel((0, 0))) == hexrgb(KEY) and tuple(im.getpixel((190, 250))) != hexrgb(KEY))
orange = np.asarray(im, int)[4:30, 40:200]                        # the title banner of the classic design is orange
check("Classic has an orange title banner", orange[..., 0].mean() > 200 and orange[..., 2].mean() < 120, orange.mean(axis=(0, 1)))
lime = np.asarray(im, int)[198:210, 40:330]                       # the EXP gauge row (square layout: its middle is at y=204)
check("Classic's EXP gauge has lime green in it", ((lime[..., 1] > 180) & (lime[..., 0] < 215) & (lime[..., 2] < 120)).sum() > 300)

print("4b) mesos: the square layout shows per hour AND gained; the wide and slim layouts show gained")


def drawn_text(view, layout, state):
    """Every piece of text a layout draws."""
    calls, orig = [], view._text
    view._text = lambda c, s, *a, _o=orig, _l=calls, **k: (_l.append(s), _o(c, s, *a, **k))[1]
    view.render(layout, state)
    view._text = orig
    return calls


for key, th in THEMES.items():
    view = View(Gfx(1.0, os.path.join(ROOT, "assets", "fonts")), th)
    sq, sq_idle = drawn_text(view, "square", STATES["tracking"]), drawn_text(view, "square", STATES["idle"])
    check(f"'{key}' square: MESOS / HR and MESOS GAINED, with their values", {"MESOS / HR", "MESOS GAINED", "32,810", "+6,540"} <= set(sq), sq)
    check(f"'{key}' square: before the inventory is read it says 'Open inventory' instead of a wrong number", {"MESOS / HR", "Open inventory"} <= set(sq_idle), sq_idle)
    wide, wide_idle = drawn_text(view, "wide", STATES["tracking"]), drawn_text(view, "wide", STATES["idle"])
    check(f"'{key}' wide: the mesos column is MESOS GAINED (+6,540), not per hour", {"MESOS GAINED", "+6,540"} <= set(wide) and "MESOS / HR" not in wide and "32,810" not in wide, wide)
    check(f"'{key}' wide: shows 'Open inventory' before the inventory is read", "Open inventory" in wide_idle, wide_idle)
    bar, bar_idle = drawn_text(view, "bar", STATES["tracking"]), drawn_text(view, "bar", STATES["idle"])
    check(f"'{key}' slim bar: shows '+6,540' labelled as mesos, not per hour", "+6,540" in bar and any(x.startswith("mesos") for x in bar) and "mesos/hr" not in bar and "32,810" not in bar, bar)
    check(f"'{key}' slim bar: says to open the inventory before it is read", any("inventory" in x for x in bar_idle), bar_idle)

print("4c) the Mesos-only layout shows the mesos tracker and nothing about EXP")
for key, th in THEMES.items():
    view = View(Gfx(1.0, os.path.join(ROOT, "assets", "fonts")), th)
    calls = drawn_text(view, "mesos", STATES["tracking"])
    check(f"'{key}': shows mesos gained, per hour, in inventory and time tracked", {"MESOS GAINED", "+6,540", "PER HOUR", "32,810", "IN INVENTORY", "1,006,540", "TIME TRACKED", "00:12:04"} <= set(calls), calls)
    exp_things = {"EXP PER HOUR", "EXP LEFT", "LAST 5 MIN", "LOST", "850,633", "Lv 48 in 2 h 06 min", "72.1%", "LV 47", "12% last 5 min", "154,939"}
    check(f"'{key}': shows nothing about EXP", not (exp_things & set(calls)), exp_things & set(calls))
    idle = drawn_text(view, "mesos", STATES["idle"])
    check(f"'{key}': before the inventory is read it says so, with a hint", "--" in idle and any(x.startswith("Open your inventory") for x in idle), idle)
    img, regs = view.render("mesos", STATES["tracking"])
    check(f"'{key}': has Start/Pause, reset, log, settings, layout and close buttons", {"toggle", "reset", "log", "settings", "layout", "close"} <= {r[0] for r in regs}, [r[0] for r in regs])

print("4d) the Market feed layout: five rows at most, newest first, empty state, hostile text")
FEED = [{"side": "B" if i % 2 == 0 else "S", "item": f"Item number {i}", "price": f"{i}00k", "name": f"Player{i}", "ago": f"{i}m", "count": 1 + i % 3} for i in range(1, 9)]
for key, th in THEMES.items():
    view = View(Gfx(1.0, os.path.join(ROOT, "assets", "fonts")), th)
    st = dict(STATES["tracking"], feed=FEED, chat_text="Watching the chat", chat_kind="go", feed_note="note")
    texts = drawn_text(view, "market", st)
    check(f"'{key}': only the first five of eight offers are drawn, in order", [x for x in texts if x.startswith("Item number")] == [f"Item number {i}" for i in range(1, 6)], texts)
    check(f"'{key}': each row shows its price, who, how long ago and (if more than once) how many times", {"100k", "500k", "Player3 · 3m"} <= set(texts) and "Player1 · 1m · seen 2x" in texts, texts)
    empty = drawn_text(view, "market", dict(STATES["tracking"], feed=[], chat_text="Choose the chat area", chat_kind="bad", feed_empty="Pick the chat area first."))
    check(f"'{key}': with no offers it says 'No offers yet' and why", "No offers yet" in empty and any("Pick the chat area" in x for x in empty), empty)
    img, regs = view.render("market", st)
    check(f"'{key}': it has a history button, settings, layout and close, and nothing for EXP", {"history", "settings", "layout", "close"} <= {r[0] for r in regs} and "toggle" not in {r[0] for r in regs})
    nasty = [{"side": s_, "item": it, "price": pr, "name": nm, "ago": ag, "count": c_} for s_ in ("B", "S", "?") for it, pr, nm, ag, c_ in
             (("x" * 400, "9" * 40, "n" * 60, "1d", 99), ("", "", "", "", 0), ("メイプル 🍁", "PMO", "メ", "now", 2))]
    crashes = []
    for scale in (1.0, 1.5, 2.0):
        for stx in (dict(st, feed=nasty), dict(st, feed=[{}]), dict(st, feed=None), {k: v for k, v in st.items() if k not in ("feed", "chat_text", "chat_kind", "feed_note")}):
            try:
                View(Gfx(scale, os.path.join(ROOT, "assets", "fonts")), th).render("market", stx)
            except Exception as e:                                                  # noqa: BLE001
                crashes.append((scale, repr(e)[:80]))
    check(f"'{key}': very long, empty, missing and non-Latin text in the feed never crashes it (3 sizes)", not crashes, crashes[:2])

print("4e) the market section on the main (Square) layout")
for key, th in THEMES.items():
    view = View(Gfx(1.0, os.path.join(ROOT, "assets", "fonts")), th)
    on = dict(STATES["tracking"], show_feed=True, feed=FEED, chat_text="Watching the chat", chat_kind="go", feed_empty="Waiting.")
    off = dict(on, show_feed=False)
    check(f"'{key}': the section adds exactly its height to the window, and not when it is off", view.size("square", on)[1] - view.size("square", off)[1] == Gfx(1.0).px(View.FEED_CARD_H + 12)
          and view.size("square", off) == view.size("square") and view.render("square", on)[0].size == view.size("square", on) and view.render("square", off)[0].size == view.size("square", off))
    texts = drawn_text(view, "square", on)
    check(f"'{key}': five offers at most, newest first, with price and player", [x for x in texts if x.startswith("Item number")] == [f"Item number {i}" for i in range(1, 6)] and "100k" in texts and "500k" in texts, texts)
    check(f"'{key}': the status line and the section name are shown", "Watching the chat" in texts and "MARKET" in texts, texts)
    check(f"'{key}': with no offers it says so and why", "No offers yet" in drawn_text(view, "square", dict(on, feed=[], feed_empty="Turn it on in Settings.")) and "Turn it on in Settings." in drawn_text(view, "square", dict(on, feed=[], feed_empty="Turn it on in Settings.")))
    check(f"'{key}': the whole card is one clickable 'history' area, and it isn't there when the section is off",
          "history" in {r[0] for r in view.render("square", on)[1]} and "history" not in {r[0] for r in view.render("square", off)[1]})
    a1 = np.asarray(view.render("square", on)[0], float)
    a2 = np.asarray(view.render("square", on, hover="history")[0], float)
    check(f"'{key}': pointing at the card changes how it looks", float(np.abs(a1 - a2).mean()) > 0.05)
    crashes = []
    for scale in (1.0, 1.5, 2.0):
        for stx in (dict(on, feed=nasty), dict(on, feed=[{}]), dict(on, feed=None), {k: v for k, v in on.items() if k not in ("feed", "chat_text", "chat_kind", "feed_empty")}):
            try:
                v2 = View(Gfx(scale, os.path.join(ROOT, "assets", "fonts")), th)
                if v2.render("square", stx)[0].size != v2.size("square", stx):
                    crashes.append((scale, "wrong size"))
            except Exception as e:                                                  # noqa: BLE001
                crashes.append((scale, repr(e)[:80]))
    check(f"'{key}': long, empty, missing, non-Latin text in the section never crashes it (3 sizes)", not crashes, crashes[:2])

print("4f) the MAP line on the main layout (each session is logged with this map)")
for key, th in THEMES.items():
    view = View(Gfx(1.0, os.path.join(ROOT, "assets", "fonts")), th)
    base = dict(STATES["tracking"], show_feed=False)
    with_map, no_map = dict(base, map="Henesys Hunting Ground I"), dict(base, map="")
    t1, t2 = drawn_text(view, "square", with_map), drawn_text(view, "square", no_map)
    check(f"'{key}': it shows MAP, the map's name and 'Change'", {"MAP", "Henesys Hunting Ground I", "Change"} <= set(t1), t1)
    check(f"'{key}': with no map it asks for one ('Set')", "Set" in t2 and any("Not set" in x for x in t2) and "Change" not in t2, t2)
    check(f"'{key}': the whole line is a clickable 'map' area", "map" in {r[0] for r in view.render("square", with_map)[1]} and "map" in {r[0] for r in view.render("square", no_map)[1]})
    a1, a2 = np.asarray(view.render("square", with_map)[0], float), np.asarray(view.render("square", with_map, hover="map")[0], float)
    check(f"'{key}': pointing at it changes how it looks", float(np.abs(a1 - a2).mean()) > 0.05)
    check(f"'{key}': the main layout is 40 px taller than before to fit it", view.size("square")[1] == Gfx(1.0).px(560) and view.size("square", dict(base, show_feed=True))[1] == Gfx(1.0).px(560 + 172))
    long_name = drawn_text(view, "square", dict(base, map="Some Very Long Map Name That Goes On And On And Never Seems To End Anywhere"))
    check(f"'{key}': a very long map name is cut short with an ellipsis instead of running over the edge", any(x.endswith("…") and x.startswith("Some Very") for x in long_name), long_name)
    crashes = []
    for scale in (1.0, 1.5, 2.0):
        for mp in ("", " ", "x" * 300, "メイプル 🍁", "<b>&amp;</b>", None, "Henesys\nGround"):
            try:
                v2 = View(Gfx(scale, os.path.join(ROOT, "assets", "fonts")), th)
                if v2.render("square", dict(base, map=mp))[0].size != v2.size("square", base):
                    crashes.append((scale, mp, "wrong size"))
            except Exception as e:                                                  # noqa: BLE001
                crashes.append((scale, repr(mp)[:12], repr(e)[:60]))
    check(f"'{key}': empty, huge, non-Latin and missing map names never crash it (3 sizes)", not crashes, crashes[:2])

print("5) a long number never leaves its card")
SPACE = {"square hero": ("extrabold", (50, 44, 38, 32, 27), 380 - 28 - 36), "wide hero": ("extrabold", (28, 24, 20, 17), (520 - 28 - 36) / 4 - 14),
         "wide stat": ("semibold", (22, 19, 16, 14), (520 - 28 - 36) / 4 - 18), "bar hero": ("extrabold", (32, 28, 24, 20), 150),
         "bar mesos": ("semibold", (16, 14, 13), 70), "square mesos": ("semibold", (16, 14, 13), 380 - 28 - 36 - 110),
         "mesos layout hero": ("extrabold", (50, 44, 38, 32, 27), 380 - 28 - 36), "mesos layout cell": ("semibold", (16, 15, 14, 13, 12), (380 - 28 - 36) / 3 - 16)}
for key, th in THEMES.items():
    view = View(Gfx(1.0, os.path.join(ROOT, "assets", "fonts")), th)
    for where, (weight, sizes, room) in SPACE.items():
        bad = []
        for text in ("0", "1,234", "123,456", "12,345,678", "123,456,789", "1,234,567,890", "12,345,678,901", "12,345,678,901,234"):
            shown, size = view._fit(text, weight, sizes, room)
            width = view.g.text_width(shown, weight, size, True)
            if width > room + 0.5:
                bad.append((text, shown, round(width), room))
        check(f"'{key}' {where}: numbers from 1 to 14 digits always fit ({int(room)}px)", not bad, bad)
view = View(Gfx(1.0, os.path.join(ROOT, "assets", "fonts")), THEMES["gold"])
check("long numbers are shortened sensibly", [view.abbreviate(x) for x in ("123,456,789", "12,345,678,901", "45,678", "999", "+9,876,543,210", "Lv 48")] == ["123.46M", "12.35B", "45.7K", "999", "+9.88B", "Lv 48"],
      [view.abbreviate(x) for x in ("123,456,789", "12,345,678,901", "45,678", "999", "+9,876,543,210", "Lv 48")])
print("6) audit regressions: hostile text and numbers can't crash any layout")
HOSTILE = ["", " ", "x" * 400, "メイプルストーリー", "메이플스토리", "Привет", "🍁" * 20, "line\nbreak\ttab", "9" * 60, "-", "+", "--", "nan"]
FIELDS = ["status_text", "hero", "mesos", "mesos_unit", "trend_text", "pct", "level_label", "eta", "to_next", "next_label", "hint", "mesos_hint", "title"]
crashes = []
for key, th in THEMES.items():
    view = View(Gfx(1.0, os.path.join(ROOT, "assets", "fonts")), th)
    for layout in LAYOUTS:
        for f in FIELDS:
            for val in HOSTILE:
                s = dict(STATES["tracking"], stats=dict(STATES["tracking"]["stats"])); s[f] = val
                try: view.render(layout, s)
                except Exception as e: crashes.append((key, layout, f, val[:10], repr(e)[:60]))
        for frac in (-3.0, 7.0, float("nan"), float("inf"), 0.0, 1.0):
            try: view.render(layout, dict(STATES["tracking"], frac=frac))
            except Exception as e: crashes.append((key, layout, "frac", frac, repr(e)[:60]))
        for f in ("left", "gained", "recent", "lost", "mesos_hr", "mesos_gained", "mesos_now", "elapsed"):
            for val in HOSTILE:
                s = dict(STATES["tracking"], stats=dict(STATES["tracking"]["stats"], **{f: val}))
                try: view.render(layout, s)
                except Exception as e: crashes.append((key, layout, "stats." + f, val[:10], repr(e)[:60]))
check(f"{len(THEMES) * len(LAYOUTS)} layout/design pairs x every text field x hostile values (empty, huge, emoji, Korean, ...): no crashes", not crashes, crashes[:5])
g = Gfx(1.0, os.path.join(ROOT, "assets", "fonts"))
check("a bar asked for a negative, zero or tiny width still draws", all(g.bar(w, h_, 0.5)[0].width > 0 for w in (-50, 0, 1, 3) for h_ in (6, 15)))
print("7) audit regressions: the picture cache keeps what is in use, and drawing quality adapts to the display")
g = Gfx(1.0, os.path.join(ROOT, "assets", "fonts")); g.CACHE_LIMIT = 20
keep = g.text("keep me", "semibold", 12)
for i in range(200):
    g.text(f"throw away {i}", "semibold", 12)
    g.text("keep me", "semibold", 12)                          # drawn every time, like a label
check("the cache never grows past its limit", len(g._cache) <= 20, len(g._cache))
check("a picture that is used all the time is never thrown out (so a redraw never starts from nothing)", g.text("keep me", "semibold", 12) is keep)
check("a picture nobody uses any more is thrown out first", ("text", "throw away 0", "semibold", 12, "#f1efe9", None, None, False, 0.0, None, 1.0) not in g._cache)
check("normal screens are drawn with 3x smoothing, large-scale ones with 2x (faster, same look)", Gfx(1.0).ss == 3 and Gfx(1.25).ss == 3 and Gfx(1.5).ss == 2 and Gfx(2.0).ss == 2)
for scale in (1.0, 1.5, 2.0, 3.0):
    gg = Gfx(scale, os.path.join(ROOT, "assets", "fonts")); v = View(gg, THEMES["classic"])
    img = v.render("square", STATES["tracking"])[0]
    check(f"at {int(scale * 100)}% the picture is exactly the right size ({img.size[0]}x{img.size[1]})", img.size == v.size("square"))
print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
