"""The tracker's designs. A theme is just a bundle of colours and a few style choices; view.py draws any of
them, and the dialogs (Settings, Log ...) take their colours from the same place, so everything matches.

  gold     "Dark & Gold": near-black glass cards, gold glowing numbers (the look of the community overlay)
  classic  "MapleStory Classic": cream parchment, an orange title banner with a maple leaf, bubbly orange
           buttons and a lime-green EXP gauge, with brown outlined numbers like MapleStory's damage numbers

A "face" is (top colour, bottom colour, edge colour, top-edge colour) for a panel or a button.
"""

from gfx import (CARD_BOTTOM, CARD_TOP, DIM, EDGE, EDGE_TOP, GOLD, GOLD_DARK, GOLD_LIGHT, GREEN, MUTED,
                 ON_GOLD, ORANGE, RED, TEXT, TRACK)


class Theme:
    def __init__(self, **kw):
        self.__dict__.update(kw)


GOLD_THEME = Theme(
    key="gold", label="Dark & Gold",
    # the window
    win=("#0b0c10", "#0b0c10", "#1d2029", "#2a2e3a"), win_border=1, win_radius=16,
    banner=None, title_style="plain", title_color=MUTED, title_stroke=None, title_icon="chart", title_icon_color=GOLD,
    title_icon_size=16, title_icon_shadow=None,
    close_icon=DIM, close_icon_hover=TEXT, close_hover_face=("#2a2d38", "#1c1f28", "#3a4050", "#5c6275"),
    # cards
    card=(CARD_TOP, CARD_BOTTOM, EDGE, EDGE_TOP), card_border=1, card_shadow=None, card_glow=(GOLD, 0.13),
    panel2=("#1a1c23", "#13151b", EDGE, EDGE_TOP), divider="#262a35",
    # text
    text=TEXT, muted=MUTED, dim="#818899", accent=GOLD, good=GREEN, warn=ORANGE,
    hero_gradient=(GOLD_LIGHT, GOLD), hero_glow=(GOLD, 12, 0.32), hero_stroke=None,
    # the progress bar
    bar_fill=(GOLD_DARK, GOLD_LIGHT), bar_track=TRACK, bar_glow=GOLD, bar_glow_alpha=0.55, bar_edge=None, bar_shine=False,
    bar_h={"square": 8, "wide": 8, "bar": 6},
    # chips and the status dot
    chip=("#10131a", "#232732"), chip_text=TEXT,
    trend_up=(GREEN, "#13201a", "#1f3a2b"), trend_down=(ORANGE, "#241a14", "#3d2a1c"),
    dots={"go": GREEN, "wait": GOLD, "idle": DIM, "bad": RED},
    # buttons
    btn=("#232632", "#181b23", "#2c313e", "#4a4f5e"), btn_hover=("#2a2d38", "#1c1f28", "#3a4050", "#5c6275"),
    btn_icon=MUTED, btn_icon_hover=TEXT,
    primary=("#232632", "#181b23", "#5a4a1e", "#8a7228"), primary_hover=("#2a2d38", "#1c1f28", "#8a7228", GOLD_DARK),
    primary_icon=GOLD, primary_text=TEXT, primary_stroke=None,
    # the Settings / Log / Capture windows
    dlg_bg="#14161c", dlg_field="#1b1e26", dlg_text=TEXT, dlg_muted=MUTED, dlg_accent=GOLD, dlg_accent_hover=GOLD_LIGHT,
    dlg_on_accent=ON_GOLD, dlg_highlight=GOLD_LIGHT, dlg_btn="#232632", dlg_btn_hover="#2e3240", dlg_border="#2c313e", dlg_select="#3a3320",
    dlg_select_text=GOLD_LIGHT, dlg_track="#222733",
)

CLASSIC_THEME = Theme(
    key="classic", label="MapleStory Classic",
    # the window: parchment with a brown frame and an orange title banner carrying a maple leaf
    win=("#fff8e6", "#f4e4bb", "#7b4a1f", "#a56d34"), win_border=2, win_radius=16,
    banner=("#ffb54e", "#ea7d20", "#9a5314", "#ffdc9c"), title_style="banner", title_color="#ffffff",
    title_stroke=("#8a4a12", 1.3), title_icon="leaf", title_icon_color="#ffffff",
    title_icon_size=19, title_icon_shadow="#8a4a12",
    close_icon="#ffffff", close_icon_hover="#ffffff", close_hover_face=("#ffc46b", "#f39a38", "#9a5314", "#ffe2ad"),
    # cards: cream panels with a tan edge and a soft brown shadow, like the in-game windows
    card=("#fffdf5", "#fbf0d4", "#d1b274", "#ead59f"), card_border=1, card_shadow=("#6b4520", 0.22, 6, 3), card_glow=None,
    panel2=("#f9ecd0", "#f3e2bb", "#d1b274", "#e6cf98"), divider="#e0c996",
    # text: dark brown, like the in-game text
    text="#4a2d12", muted="#6f4f2b", dim="#7f5e36", accent="#b03c12", good="#1b7326", warn="#b43a12",
    hero_gradient=("#ffd84d", "#f27d17"), hero_glow=None, hero_stroke=("#6b3a10", 2.4),
    # the EXP gauge: lime green on dark brown, glossy, like the in-game one
    bar_fill=("#86d12a", "#c3ee4e"), bar_track="#5b3d22", bar_glow=None, bar_glow_alpha=0.0, bar_edge="#33200f", bar_shine=True,
    bar_h={"square": 15, "wide": 13, "bar": 11},
    chip=("#fffdf5", "#d1b274"), chip_text="#4a2d12",
    trend_up=("#25702a", "#e6f6dc", "#a9d98a"), trend_down=("#a8400f", "#fde8d9", "#efb08a"),
    dots={"go": "#3fbf4a", "wait": "#f2a51e", "idle": "#b9a98c", "bad": "#e0432d"},
    # buttons: bubbly orange for the main one, cream for the rest
    btn=("#fffaf0", "#f1dfb0", "#c9a35b", "#e8d29a"), btn_hover=("#fff1d0", "#f5cf86", "#b8863a", "#f0d58f"),
    btn_icon="#7a5330", btn_icon_hover="#4a2d12",
    primary=("#ffc860", "#f28c22", "#9a4f10", "#ffe2a8"), primary_hover=("#ffd682", "#f79a2e", "#8a430a", "#fff0c8"),
    primary_icon="#ffffff", primary_text="#ffffff", primary_stroke=("#8a4a12", 1.4),
    # the Settings / Log / Capture windows
    dlg_bg="#fff6e0", dlg_field="#fffdf5", dlg_text="#4a2d12", dlg_muted="#6f4f2b", dlg_accent="#f7a535", dlg_accent_hover="#ffbc59",
    dlg_on_accent="#3a2108", dlg_highlight="#a8380f", dlg_btn="#f1dfb0", dlg_btn_hover="#f5cf86", dlg_border="#c9a35b", dlg_select="#ffd98a",
    dlg_select_text="#4a2d12", dlg_track="#e6cf98",
)

THEMES = {"gold": GOLD_THEME, "classic": CLASSIC_THEME}
DEFAULT_THEME = "gold"
