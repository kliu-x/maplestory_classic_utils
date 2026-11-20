"""Maple EXP Tracker: an EXP/hr overlay for MapleStory Classic World (Windows).

A small window sits next to the game and shows how fast you are levelling: EXP/hr (whole session and
the last 5 minutes), time to your next level, EXP gained and lost, mesos/hr, and a log of your
sessions. It works by LOOKING AT YOUR SCREEN, like a screen recorder. It never touches the game's
files or memory, never presses keys or clicks for you, and it has no network code at all: nothing
you do here is ever sent anywhere.

Run it with run.bat (or:  python maple_tracker.py ). Needs Python 3.10+ and the packages in
requirements.txt. Run the game in windowed or borderless mode.
"""

import json
import os
import queue
import sys
import threading
import time
import traceback
from pathlib import Path

for _name in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):    # keep the maths library from using every core
    os.environ.setdefault(_name, "1")                                          # (these must be set before numpy is loaded)

try:
    import tkinter as tk
    from tkinter import filedialog, messagebox, simpledialog, ttk
    import cv2
    import mss
    import numpy as np
    from PIL import Image, ImageTk
except ImportError as _e:                               # a missing package: say so in plain words
    msg = (f"The tracker needs a package that isn't installed ({_e}).\n\n"
           "Open a Command Prompt in this folder and run:\n    py -3 -m pip install -r requirements.txt")
    try:
        import tkinter as _tk
        from tkinter import messagebox as _mb
        _r = _tk.Tk(); _r.withdraw(); _mb.showerror("Maple EXP Tracker", msg)
    except Exception:
        print(msg)
    sys.exit(1)

import chat_reader as CR
import exp_tracker as E
import market as MK
import screen_reader as S
import winapi
from gfx import Gfx
from themes import DEFAULT_THEME, THEMES
from view import KEY, LAYOUTS, View

VERSION = "1.4"
APP_DIR = Path(__file__).resolve().parent
ASSETS = APP_DIR / "assets"
POLL_SECONDS = 1.5          # how often the EXP bar is read
SCAN_SECONDS = 4.0          # how often the whole window is checked for the inventory and minimap
SAVE_SECONDS = 60           # how often a running session is written to the log
CHAT_SECONDS = 2.0          # how often the chat box is read (when chat watching is on)
AUTO_CHOICE = "Automatic: the MapleStory window"      # first entry of the window list
UI_FONT = "Segoe UI"


def _pick_data_dir():
    """Settings, log and error file go in a 'data' folder next to the program (or in %APPDATA% if
    that folder can't be written to)."""
    for d in (APP_DIR / "data", Path(os.environ.get("APPDATA") or Path.home()) / "MapleExpTracker"):
        try:
            d.mkdir(parents=True, exist_ok=True)
            probe = d / ".write_test"
            probe.write_text("x")
            probe.unlink()
            return d
        except Exception:
            continue
    return APP_DIR


DATA_DIR = _pick_data_dir()
CONFIG_PATH = DATA_DIR / "config.json"
LOG_PATH = DATA_DIR / "session_log.json"
ERROR_LOG_PATH = DATA_DIR / "errors.log"
MARKET_PATH = DATA_DIR / "market_log.json"            # the buy/sell offers that were kept
WATCH_PATH = DATA_DIR / "watchlist.txt"               # the items to watch for (you can edit it)
GLYPHS_USER_PATH = DATA_DIR / "chat_glyphs_user.npz"  # chat letters learned from your own screen

DEFAULTS = {"gap_seconds": 15, "opacity": 0.97, "topmost": True, "layout": "square", "theme": DEFAULT_THEME, "hotkeys_on": True, "recent_maps": [], "chat_on": False, "market_all": False, "main_feed": True,
            "mode": "window", "window_title": "", "level": 0, "map": ""}

_error_lock = threading.Lock()
_last_errors = {}


def log_error(what, exc=None):
    """Adds an error, with details, to errors.log in the data folder (the same one at most once a
    minute). Stays on your PC; send it in if something goes wrong."""
    key = (what, repr(exc))
    with _error_lock:
        now = time.monotonic()
        if now - _last_errors.get(key, -1e9) < 60:
            return
        _last_errors[key] = now
        try:
            if ERROR_LOG_PATH.exists() and ERROR_LOG_PATH.stat().st_size > 1_000_000:
                os.replace(ERROR_LOG_PATH, ERROR_LOG_PATH.with_suffix(".old.log"))
            details = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__)) if exc else ""
            with open(ERROR_LOG_PATH, "a", encoding="utf-8") as f:
                f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] v{VERSION}: {what}\n{details}\n")
        except Exception:
            pass


def load_config():
    """The saved settings, with anything missing or damaged replaced by the defaults."""
    try:
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        cfg = {}
    except Exception as e:
        log_error("reading settings (using the defaults)", e)
        cfg = {}
    if not isinstance(cfg, dict):
        cfg = {}
    for key, default in DEFAULTS.items():
        v = cfg.get(key)
        ok = isinstance(v, (int, float)) and not isinstance(v, bool) if isinstance(default, float) else type(v) is type(default)
        if not ok:
            cfg[key] = default
    cfg["gap_seconds"] = min(600, max(3, cfg["gap_seconds"]))
    if cfg["layout"] not in LAYOUTS:
        cfg["layout"] = "square"
    if cfg["theme"] not in THEMES:
        cfg["theme"] = DEFAULT_THEME
    cfg["opacity"] = min(1.0, max(0.3, float(cfg["opacity"])))
    if cfg["mode"] not in ("window", "region"):
        cfg["mode"] = "window"
    r = cfg.get("region")
    if not (isinstance(r, dict) and all(type(r.get(k)) is int for k in ("left", "top", "width", "height"))
            and r["width"] > 20 and r["height"] > 8):
        cfg.pop("region", None)
        if cfg["mode"] == "region":
            cfg["mode"] = "window"
    rm = cfg.get("recent_maps")                       # the maps used lately (newest first), for the quick picker
    cfg["recent_maps"] = [x for x in rm if isinstance(x, str) and x.strip()][:8] if isinstance(rm, list) else []
    cr = cfg.get("chat_region")                       # where the chat box is: relative to the game window, or on the screen
    good = isinstance(cr, dict) and ((isinstance(cr.get("rel"), list) and len(cr["rel"]) == 4 and isinstance(cr.get("client"), list) and len(cr["client"]) == 2
                                      and all(type(x) is int for x in cr["rel"] + cr["client"]) and cr["rel"][2] > 40 and cr["rel"][3] > 16)
                                     or (isinstance(cr.get("abs"), list) and len(cr["abs"]) == 4 and all(type(x) is int for x in cr["abs"])
                                         and cr["abs"][2] > 40 and cr["abs"][3] > 16))
    if not good:
        cfg.pop("chat_region", None)
    if not (isinstance(cfg.get("pos"), list) and len(cfg["pos"]) == 2 and all(type(x) is int for x in cfg["pos"])):
        cfg.pop("pos", None)
    return cfg


def save_config(cfg):
    try:
        tmp = CONFIG_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
        os.replace(tmp, CONFIG_PATH)                    # never leaves a half-written file
    except Exception as e:
        log_error("saving settings", e)


# --------------------------------------------------------------------------- the screen worker
class Frame:
    """One look at the screen, handed from the worker thread to the window."""

    def __init__(self, t):
        self.t = t
        self.status = "ok"             # ok | no_window | minimized | off_screen | no_bar | unclear | error
        self.exp = self.pct = None
        self.levels = []
        self.gh = None
        self.box = None                # where the EXP text is, in screen pixels
        self.rect = None               # the game window: (left, top, width, height)
        self.strip = self.layout = None
        self.scanned = False           # the whole window was checked this time (inventory, minimap)
        self.mesos = None
        self.title = ""                # title of the window being watched
        self.chat = None               # the chat box as whole messages [(player, text, unknown letters)], when it was read this time
        self.chat_state = ""           # ok | size_changed | no_window | off_screen | error  (when chat watching is on)


class ScreenWorker(threading.Thread):
    """Takes a screenshot every ~1.5 s and reads the EXP bar (and, every few seconds, the mesos in the
    inventory). Runs on its own thread so the window never freezes. It only looks at the picture of the
    screen: it never opens the game or anything it owns."""

    def __init__(self, out, exp_tpl, mesos_tpl):
        super().__init__(daemon=True)
        self.out, self.exp_tpl, self.mesos_tpl = out, exp_tpl, mesos_tpl
        self.mode, self.region = "window", None
        self.window_title = ""         # "" = find the MapleStory window by itself, else the window you picked
        self.hwnd = None
        self._stop_flag = threading.Event()
        self._next_scan = 0.0
        self.chat_on, self.chat_region, self.glyphs = False, None, None      # chat watching (set by the window)
        self.last_chat_img = None                                           # the latest picture of the chat box (for the Teach window)
        self._next_chat = 0.0
        self.force_chat = False                                             # read it again even if the picture hasn't changed

    def stop(self):
        self._stop_flag.set()

    @staticmethod
    def grab(sct, left, top, width, height):
        """Screenshot of a screen rectangle, clipped to the monitors: (bgr, left, top) or None."""
        v = sct.monitors[0]
        x0, y0 = max(left, v["left"]), max(top, v["top"])
        x1, y1 = min(left + width, v["left"] + v["width"]), min(top + height, v["top"] + v["height"])
        if x1 - x0 < 8 or y1 - y0 < 8:
            return None
        shot = np.array(sct.grab({"left": x0, "top": y0, "width": x1 - x0, "height": y1 - y0}))
        return np.ascontiguousarray(shot[:, :, :3]), x0, y0

    def run(self):
        sct = None
        while not self._stop_flag.is_set():
            t0 = time.monotonic()
            try:
                if sct is None:
                    sct = mss.mss()                      # mss objects belong to the thread that made them
                frame = self.look(sct, t0)
                self.read_chat(sct, frame, t0)
            except Exception as e:
                log_error("reading the screen", e)
                frame = Frame(t0)
                frame.status = "error"
                sct = None                                # start afresh next time
            self.out.put(frame)
            self._stop_flag.wait(max(0.2, POLL_SECONDS - (time.monotonic() - t0)))
        try:
            if sct is not None:
                sct.close()
        except Exception:
            pass

    def chat_box(self, fr):
        """The chat box on the screen: (left, top, width, height), or a reason why it can't be found right now."""
        spec = self.chat_region
        if spec is None:
            return None, "no_region"
        if "rel" in spec:
            if not fr.rect:
                return None, "no_window"
            cw, ch = spec["client"]
            if abs(fr.rect[2] - cw) > 3 or abs(fr.rect[3] - ch) > 3:
                return None, "size_changed"
            x, y, w, h = spec["rel"]
            return (fr.rect[0] + x, fr.rect[1] + y, w, h), "ok"
        return tuple(spec["abs"]), "ok"

    def read_chat(self, sct, fr, t):
        """Every couple of seconds: look at the chat box and read the messages in it. Never raises."""
        if not self.chat_on or self.glyphs is None or t < self._next_chat:
            return
        self._next_chat = t + CHAT_SECONDS
        try:
            box, why = self.chat_box(fr)
            fr.chat_state = why
            if box is None:
                return
            g = self.grab(sct, *box)
            if g is None:
                fr.chat_state = "off_screen"
                return
            rgb = np.ascontiguousarray(g[0][:, :, ::-1])
            same = self.last_chat_img is not None and self.last_chat_img.shape == rgb.shape and np.array_equal(self.last_chat_img, rgb)
            self.last_chat_img = rgb
            if same and not self.force_chat:
                return                                  # nothing on screen changed: nothing to read (this is most of the time)
            self.force_chat = False
            fr.chat = CR.messages(CR.read_chat(rgb, self.glyphs).lines)
        except Exception as e:
            fr.chat_state = "error"
            log_error("reading the chat", e)

    def look(self, sct, t):
        fr = Frame(t)
        whole_rect = None
        if self.mode == "region" and self.region:
            r = self.region
            g = self.grab(sct, r["left"], r["top"], r["width"], r["height"])
            if g is None:
                fr.status = "off_screen"
                return fr
            strip, ox, oy = g
        else:
            hwnd = self.hwnd                           # (read once: the window can change it while this runs)
            if not winapi.window_exists(hwnd):
                hwnd = self.hwnd = (winapi.find_window_by_title(self.window_title) if self.window_title
                                    else winapi.find_game_window())
            if hwnd is None:
                fr.status = "no_window"
                return fr
            fr.title = winapi.window_title(hwnd)
            rect = winapi.client_rect(hwnd)
            if rect is None:
                fr.status = "minimized"
                return fr
            left, top, w, h = fr.rect = whole_rect = rect
            sh = int(h * S.SEARCH_STRIP)
            g = self.grab(sct, left, top + h - sh, w, sh)
            if g is None:
                fr.status = "off_screen"
                return fr
            strip, ox, oy = g

        res = S.read_exp_bar(strip, self.exp_tpl)
        fr.status, fr.strip, fr.layout = res.status, strip, res.layout
        if res.layout is not None:
            b = res.layout.box
            fr.box, fr.gh = (ox + b[0], oy + b[1], ox + b[2], oy + b[3]), res.layout.gh
        if res.status == "ok":
            fr.exp, fr.pct, fr.levels = res.exp, res.pct, res.levels

        # Now and then look at the whole window for the inventory (mesos).
        if res.status == "ok" and whole_rect and t >= self._next_scan:
            self._next_scan = t + SCAN_SECONDS
            whole = self.grab(sct, *whole_rect)
            if whole is not None:
                bgr = whole[0]
                fr.scanned = True
                try:
                    fr.mesos = S.read_mesos(bgr, fr.gh, self.mesos_tpl)
                except Exception as e:
                    log_error("reading the mesos", e)
        return fr


# --------------------------------------------------------------------------- look of the pop-up windows
class Skin:
    """Colours for Settings, the log and the other pop-up windows: taken from the active design (themes.py)."""

    def update_from(self, th):
        self.bg, self.field, self.text, self.muted = th.dlg_bg, th.dlg_field, th.dlg_text, th.dlg_muted
        self.accent, self.accent_hover, self.on_accent = th.dlg_accent, th.dlg_accent_hover, th.dlg_on_accent
        self.btn, self.btn_hover, self.border = th.dlg_btn, th.dlg_btn_hover, th.dlg_border
        self.select, self.select_text, self.track = th.dlg_select, th.dlg_select_text, th.dlg_track
        self.highlight = th.dlg_highlight


SKIN = Skin()
SKIN.update_from(THEMES[DEFAULT_THEME])


def apply_skin(root, theme):
    SKIN.update_from(theme)
    st = ttk.Style(root)
    try:
        st.theme_use("clam")
    except tk.TclError:
        pass
    st.configure("Skin.TCombobox", fieldbackground=SKIN.field, background=SKIN.field, foreground=SKIN.text, arrowcolor=SKIN.accent,
                 bordercolor=SKIN.border, lightcolor=SKIN.field, darkcolor=SKIN.field, padding=4)
    st.map("Skin.TCombobox", fieldbackground=[("readonly", SKIN.field)], foreground=[("readonly", SKIN.text)],
           selectbackground=[("readonly", SKIN.field)], selectforeground=[("readonly", SKIN.text)])
    st.configure("Skin.Horizontal.TScale", background=SKIN.bg, troughcolor=SKIN.track, bordercolor=SKIN.bg,
                 lightcolor=SKIN.accent, darkcolor=SKIN.accent)
    st.configure("Skin.Treeview", background=SKIN.field, fieldbackground=SKIN.field, foreground=SKIN.text, rowheight=26, borderwidth=0)
    st.configure("Skin.Treeview.Heading", background=SKIN.btn, foreground=SKIN.muted, relief="flat", font=(UI_FONT, 9, "bold"))
    st.map("Skin.Treeview", background=[("selected", SKIN.select)], foreground=[("selected", SKIN.select_text)])
    st.map("Skin.Treeview.Heading", background=[("active", SKIN.btn_hover)])
    root.option_add("*TCombobox*Listbox.background", SKIN.field)
    root.option_add("*TCombobox*Listbox.foreground", SKIN.text)
    root.option_add("*TCombobox*Listbox.selectBackground", SKIN.select)
    root.option_add("*TCombobox*Listbox.selectForeground", SKIN.select_text)


def skin_button(parent, text, cmd, primary=False):
    return tk.Button(parent, text=text, command=cmd, bg=SKIN.accent if primary else SKIN.btn, fg=SKIN.on_accent if primary else SKIN.text,
                     activebackground=SKIN.accent_hover if primary else SKIN.btn_hover, activeforeground=SKIN.on_accent if primary else SKIN.text,
                     relief="flat", bd=0, padx=14, pady=6, font=(UI_FONT, 9, "bold"), cursor="hand2")


def skin_label(parent, text, muted=False, size=9, bold=False, **kw):
    return tk.Label(parent, text=text, bg=SKIN.bg, fg=SKIN.muted if muted else SKIN.text, font=(UI_FONT, size, "bold" if bold else "normal"),
                    anchor="w", justify="left", **kw)


def skin_entry(parent, var, width=8):
    return tk.Entry(parent, textvariable=var, width=width, bg=SKIN.field, fg=SKIN.text, insertbackground=SKIN.accent, relief="flat",
                    font=(UI_FONT, 10), highlightthickness=1, highlightbackground=SKIN.border, highlightcolor=SKIN.accent)


def skin_check(parent, text, var, cmd):
    return tk.Checkbutton(parent, text=text, variable=var, command=cmd, bg=SKIN.bg, fg=SKIN.text, selectcolor=SKIN.field,
                          activebackground=SKIN.bg, activeforeground=SKIN.text, font=(UI_FONT, 9), anchor="w", bd=0, highlightthickness=0)


def skin_window(root, title, resizable=False):
    win = tk.Toplevel(root)
    win.title(title)
    win.configure(bg=SKIN.bg)
    win.attributes("-topmost", True)
    win.resizable(resizable, resizable)
    return win


# What the design thumbnails in Settings show.
DEMO_STATE = {
    "title": "Maple EXP Tracker", "status_text": "Tracking · Lv 47", "status_kind": "go", "hero": "850,633",
    "trend_text": "12% last 5 min", "trend_dir": "up", "mesos": "32,810", "mesos_unit": "mesos / hr", "frac": 0.72, "pct": "72.1%",
    "level_label": "LV 47", "eta": "Lv 48 in 2 h 06 min", "to_next": "2 h 06 min", "next_label": "TO LV 48", "running": True,
    "hint": "Tracking for 12m 04s.", "stats": {"left": "154,939", "gained": "+28,000", "recent": "850,633", "lost": "0",
                                                   "mesos_hr": "32,810", "mesos_gained": "+6,540", "mesos_now": "1,006,540",
                                                   "elapsed": "00:12:04"},
}


# --------------------------------------------------------------------------- the window
class App:
    """The tracker. The main window is one smooth picture (see view.py) with clickable areas; everything
    you can change lives in the Settings window (the gear)."""

    ACTIONS = ("toggle", "reset", "log", "settings", "layout", "market", "history", "map", "close")

    def __init__(self, root):
        self.root = root
        self.cfg = load_config()
        self.log = E.SessionLog(str(LOG_PATH))
        self.tracker = E.ExpTracker(self.cfg["gap_seconds"])
        self.mesos = E.MesosTracker()
        self.frames, self.actions = queue.Queue(), queue.Queue()
        self.frame = None                       # the latest look at the screen
        self.level_override = int(self.cfg["level"]) or 0
        self.map_name = self.cfg["map"]
        self.layout = self.cfg["layout"]
        self.theme_key = self.cfg["theme"]
        self.theme = THEMES[self.theme_key]
        self._thumbs = {}
        self._event_msg, self._event_until = "", 0.0
        self._entry_dirty = False
        self._last_save = time.monotonic()
        self._regions, self._hover, self._press = [], None, None
        self._last_sig, self._photo, self._drag = None, None, (0, 0)
        self.settings_win = self.window_box = self.area_btn = self.level_entry = None
        self.market_win = self.teach_win = self.watch_win = self.map_win = None
        self.chat_state = ""

        # the chat reader's letters (a starter set plus whatever you taught it), the offers log and the watch list
        self.starter_glyphs = CR.GlyphSet().load(ASSETS / "chat_glyphs.npz")
        self.user_glyphs = CR.GlyphSet().load(GLYPHS_USER_PATH)
        self.glyphs = self.starter_glyphs.copy().load(GLYPHS_USER_PATH)
        self.market = MK.MarketLog(MARKET_PATH)
        self.chat_tracker = MK.ChatTracker()
        self.watch_rules, self.watch_problems = [], []
        self.reload_watch()

        self.exp_tpl = S.DigitTemplates.load(ASSETS / "digits.npz")
        self.mesos_tpl = S.DigitTemplates.load(ASSETS / "mesos_digits.npz")
        self.map_names = S.load_map_names(ASSETS / "maps.txt")
        self.problem = None if self.exp_tpl is not None else "assets/digits.npz is missing: the EXP bar can't be read."

        root.title("Maple EXP Tracker")
        root.configure(bg=KEY)
        root.overrideredirect(True)                       # we draw our own title bar
        root.attributes("-topmost", bool(self.cfg["topmost"]))
        root.attributes("-alpha", self.cfg["opacity"])
        try:
            root.attributes("-transparentcolor", KEY)     # lets the window have rounded corners
        except tk.TclError:
            pass
        root.resizable(False, False)
        sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
        x, y = self.cfg.get("pos", [80, 80])
        root.geometry(f"+{min(max(0, x), sw - 120)}+{min(max(0, y), sh - 80)}")
        root.protocol("WM_DELETE_WINDOW", self.on_close)
        root.report_callback_exception = lambda exc, val, tb: log_error("something in the window failed", val)
        apply_skin(root, self.theme)

        scale = round(max(1.0, min(3.0, root.winfo_fpixels("1i") / 96.0)) * 4) / 4      # 100%, 125%, 150% ...
        self.gfx = Gfx(scale, ASSETS / "fonts")
        self.view = View(self.gfx, self.theme)

        # the settings (kept here so they exist even while the Settings window is closed)
        self.window_var = tk.StringVar(root, value=self.cfg["window_title"] or AUTO_CHOICE)
        self.level_entry_var = tk.StringVar(root, value=str(self.level_override or ""))
        self.map_var = tk.StringVar(root, value=self.map_name)
        self.gap_var = tk.StringVar(root, value=str(int(self.cfg["gap_seconds"])))
        self.layout_var = tk.StringVar(root, value=self.layout)
        self.theme_var = tk.StringVar(root, value=self.theme_key)
        self.opacity = tk.DoubleVar(root, value=self.cfg["opacity"])
        self.topmost_var = tk.BooleanVar(root, value=bool(self.cfg["topmost"]))
        self.hotkeys_var = tk.BooleanVar(root, value=bool(self.cfg["hotkeys_on"]))
        self.chat_on_var = tk.BooleanVar(root, value=bool(self.cfg["chat_on"]))
        self.market_all_var = tk.BooleanVar(root, value=bool(self.cfg["market_all"]))
        self.main_feed_var = tk.BooleanVar(root, value=bool(self.cfg["main_feed"]))

        self.label = tk.Label(root, bd=0, highlightthickness=0, bg=KEY, cursor="arrow")
        self.label.pack()
        self.label.bind("<Motion>", self.on_motion)
        self.label.bind("<Leave>", self.on_leave)
        self.label.bind("<ButtonPress-1>", self.on_press)
        self.label.bind("<B1-Motion>", self.on_drag)
        self.label.bind("<ButtonRelease-1>", self.on_release)

        self.worker = ScreenWorker(self.frames, self.exp_tpl, self.mesos_tpl)
        self.worker.mode, self.worker.region = self.cfg["mode"], self.cfg.get("region")
        self.worker.window_title = self.cfg["window_title"]
        self.worker.chat_on, self.worker.chat_region, self.worker.glyphs = bool(self.cfg["chat_on"]), self.cfg.get("chat_region"), self.glyphs
        if self.exp_tpl is not None:
            self.worker.start()
        self.hotkeys = winapi.Hotkeys(lambda action: self.actions.put(action), watched=lambda: self.worker.hwnd)
        self.hotkeys.set(winapi.DEFAULT_HOTKEYS, bool(self.cfg["hotkeys_on"]))
        self.redraw()
        self.pump()

    # ---- mouse: the window is one picture, so clicks are matched to the areas the picture reported
    def hit(self, x, y):
        for name, x0, y0, x1, y1 in self._regions:
            if x0 <= x < x1 and y0 <= y < y1:
                return name
        return "drag"

    def on_motion(self, e):
        name = self.hit(e.x, e.y)
        hover = None if name == "drag" else name
        if hover != self._hover:
            self._hover = hover
            self.label.config(cursor="hand2" if hover else "arrow")
            self.redraw()

    def on_leave(self, _e):
        if self._hover is not None:
            self._hover = None
            self.label.config(cursor="arrow")
            self.redraw()

    def on_press(self, e):
        self._press = self.hit(e.x, e.y)
        if self._press == "drag":
            self._drag = (e.x_root - self.root.winfo_x(), e.y_root - self.root.winfo_y())

    def on_drag(self, e):
        if self._press == "drag":
            self.root.geometry(f"+{e.x_root - self._drag[0]}+{e.y_root - self._drag[1]}")

    def on_release(self, e):
        name, pressed, self._press = self.hit(e.x, e.y), self._press, None
        if pressed == "drag":
            self.save_settings()
        elif name == pressed and name in self.ACTIONS:
            {"toggle": self.toggle, "reset": self.on_reset, "log": self.show_log, "settings": self.show_settings,
             "layout": self.cycle_layout, "market": self.show_market, "history": self.show_market, "map": self.show_map_picker, "close": self.on_close}[name]()

    # ---- what to show
    SHORT_STATUS = {"minimized": ("Game is minimized", "wait"), "off_screen": ("Game is off the screen", "bad"),
                    "no_bar": ("Can't find the EXP bar", "bad"), "unclear": ("Can't read the EXP bar", "bad"),
                    "error": ("Screen read failed", "bad")}

    def compute_view(self, now):
        """Everything the window shows, as plain text, for view.py to draw."""
        s = self.tracker.stats(now)
        fr = self.frame
        lv = s["level"]
        lvtxt = f" · Lv {lv}" if lv else ""
        chosen = self.worker.window_title
        shown = chosen[:18] if all(32 <= ord(ch) < 0x530 for ch in chosen) else ""      # (the font has Latin, Greek and Cyrillic)
        if self.problem:
            status, kind = "Setup problem", "bad"
        elif fr is None:
            status, kind = "Looking for the game...", "idle"
        elif fr.status == "no_window":
            status, kind = ((f"'{shown}' isn't open" if shown else "The picked window isn't open") if chosen else "MapleStory not found"), "bad"
        elif fr.status != "ok":
            status, kind = self.SHORT_STATUS.get(fr.status, (fr.status, "bad"))
        elif s["running"] and not s["auto_paused"]:
            status, kind = f"Tracking{lvtxt}", "go"
        elif s["running"]:
            status, kind = f"Waiting for EXP{lvtxt}", "wait"
        else:
            status, kind = f"Ready{lvtxt}", "idle"

        trend, direction = "", "up"
        if s["recent"] is not None and s["session"] and s["session"] > 0:
            change = (s["recent"] - s["session"]) / s["session"] * 100
            if abs(change) >= 1:
                trend, direction = f"{abs(change):.0f}% last 5 min", "up" if change >= 0 else "down"

        if self.mesos.last is None:
            mesos, mesos_unit = "--", "open your inventory"
        else:
            per = self.mesos.per_hour(s["elapsed"])
            mesos, mesos_unit = (E.fmt_int(per) if per is not None else "--"), "mesos / hr"

        if s["eta"] is not None:
            eta, to_next = f"Lv {lv + 1} in {E.fmt_eta(s['eta'])}", E.fmt_eta(s["eta"])
        elif not s["running"]:
            eta, to_next = "Press Start", "--"
        elif s["auto_paused"]:
            eta, to_next = "Waiting for EXP", "--"
        else:
            eta, to_next = "Calculating...", "--"

        if now < self._event_until:
            hint = self._event_msg
        elif self.problem:
            hint = self.problem
        else:
            hint = s["note"] or self.help_text(fr)
            if not hint:
                hint = (f"Tracking for {E.fmt_time(s['elapsed'])}." if s["running"] and not s["auto_paused"] else
                        "No EXP coming in. It carries on by itself when EXP does." if s["running"] else
                        "Press Start (or Shift+1) to begin tracking." if fr is not None and fr.status == "ok" else "")
        problems = self.hotkeys.problems
        if problems and not hint:
            hint = "Hotkey problem: " + ", ".join(f"{a} ({why})" for a, why in problems.items())

        frac = (s["exp"] / s["need"]) if (s["exp"] is not None and s["need"]) else 0.0
        return {
            "title": "Maple EXP Tracker", "status_text": status, "status_kind": kind,
            "hero": E.fmt_int(s["session"]) if s["session"] is not None else "--",
            "trend_text": trend, "trend_dir": direction, "mesos": mesos, "mesos_unit": mesos_unit,
            "frac": round(frac, 4), "pct": f"{s['pct']:.1f}%" if s["pct"] is not None else "--",
            "level_label": f"LV {lv}" if lv else "LV --", "eta": eta, "to_next": to_next,
            "next_label": f"TO LV {lv + 1}" if lv else "TO LEVEL", "running": s["running"], "hint": hint,
            **self.feed_view(), "show_feed": bool(self.main_feed_var.get()), "map": self.map_name,
            "stats": {"left": E.fmt_int(s["left"]), "gained": E.fmt_int(s["gained"], signed=True),
                      "recent": E.fmt_int(s["recent"]), "lost": E.fmt_int(s["lost"]),
                      "mesos_hr": mesos if self.mesos.last is not None else "Open inventory",
                      "mesos_gained": E.fmt_int(self.mesos.gained, signed=True) if self.mesos.last is not None else "--",
                      "mesos_now": E.fmt_int(self.mesos.last) if self.mesos.last is not None else "--",
                      "elapsed": E.fmt_hms(s["elapsed"])},
            "mesos_hint": (("Mesos can't be read while 'Select area' is on: use Settings > Follow the game window."
                            if self.worker.mode == "region" else
                            "Open your inventory so the tracker can read your mesos (keep the mesos box in view).")
                           if self.mesos.last is None and fr is not None and fr.status == "ok" and now >= self._event_until else ""),
        }

    @staticmethod
    def ago(seconds):
        """'now', '45s', '3m', '2h', '1d': how long ago something was last seen."""
        seconds = max(0, int(seconds))
        if seconds < 20:
            return "now"
        if seconds < 90:
            return f"{seconds}s"
        if seconds < 5400:
            return f"{round(seconds / 60)}m"
        if seconds < 129600:
            return f"{round(seconds / 3600)}h"
        return f"{round(seconds / 86400)}d"

    def feed_view(self):
        """What the Market feed shows: the five newest offers on the watch list (newest first), and the line about the chat reading."""
        wall = time.time()
        entries = self.market.entries()
        watched = [(e.get("last_ts", 0), i, e) for i, e in enumerate(entries) if e.get("watched")]
        watched.sort(key=lambda p: (p[0], p[1]), reverse=True)          # newest first (two in the same instant: the one added later)
        feed = []
        for _, _, e in watched[:5]:
            price = MK.format_price(e["price"]) + (" each" if e.get("each") else "") if e.get("price") is not None else ("PMO" if e.get("pmo") else "-")
            feed.append({"side": e.get("side", "B"), "item": e.get("item", ""), "price": price, "name": e.get("name", ""),
                         "ago": self.ago(wall - e.get("last_ts", wall)), "count": e.get("count", 1)})
        if not self.chat_on_var.get():
            text, kind, empty = "Chat reading is off", "idle", 'Turn on "Read the chat for buy / sell offers" in Settings.'
        elif not self.cfg.get("chat_region"):
            text, kind, empty = "Choose the chat area", "bad", 'Settings > "Select chat area", then drag a box around the chat text.'
        elif self.chat_state == "size_changed":
            text, kind, empty = "Game window changed size", "bad", "Select the chat area again (Settings)."
        elif self.chat_state in ("no_window", "off_screen"):
            text, kind, empty = ("Waiting for the game", "wait", "Waiting for the game window.") if self.chat_state == "no_window" else ("Chat area is off screen", "bad", "The chat area is outside the screen.")
        elif self.chat_state == "error":
            text, kind, empty = "Couldn't read the chat", "bad", "See errors.log in the data folder."
        else:
            text, kind, empty = "Watching the chat", "go", f"Waiting for offers on your watch list ({len(self.watch_rules)} items)."
        note = f"The {len(feed)} newest offer{'s' if len(feed) != 1 else ''} on your watch list. {len(entries)} kept in the history." if feed else f"{len(entries)} offer{'s' if len(entries) != 1 else ''} kept in the history."
        return {"feed": feed, "chat_text": text, "chat_kind": kind, "feed_empty": empty, "feed_note": note}

    def redraw(self):
        """Draw the window again, but only if something it shows has changed."""
        state = self.compute_view(time.monotonic())
        sig = (self.layout, self._hover, repr(state))
        if sig == self._last_sig:
            return
        img, self._regions = self.view.render(self.layout, state, self._hover)
        self._photo = ImageTk.PhotoImage(img)           # (kept, or Tk would throw the picture away)
        self.label.configure(image=self._photo)
        self._last_sig = sig
        self.view_state = state

    def cycle_layout(self):
        self.set_layout(LAYOUTS[(LAYOUTS.index(self.layout) + 1) % len(LAYOUTS)])

    def set_layout(self, name):
        if name in LAYOUTS:
            self.layout = name
            self.layout_var.set(name)
            self._last_sig = None
            self.redraw()
            self.save_settings()

    def set_theme(self, key):
        """Switch the design (the window, and the pop-up windows too)."""
        if key not in THEMES or key == self.theme_key:
            self.theme_var.set(self.theme_key)
            return
        self.theme_key, self.theme = key, THEMES[key]
        self.theme_var.set(key)
        self.view = View(self.gfx, self.theme)
        apply_skin(self.root, self.theme)
        self._last_sig = None
        self.redraw()
        self.save_settings()
        if self.settings_win is not None:                  # rebuild Settings in the new colours, in the same place
            x, y = self.settings_win.winfo_x(), self.settings_win.winfo_y()
            self.close_settings()
            self.show_settings()
            self.settings_win.geometry(f"+{x}+{y}")

    def theme_thumbnail(self, key):
        """A small picture of a design for the Settings window."""
        if key not in self._thumbs:
            small = View(Gfx(0.34, ASSETS / "fonts"), THEMES[key])
            self._thumbs[key] = ImageTk.PhotoImage(small.render("square", DEMO_STATE)[0])
        return self._thumbs[key]

    # ---- explaining the screen reading
    def source_text(self, fr):
        """A plain sentence about what the screen reading is doing (used in the capture window)."""
        if self.problem:
            return self.problem
        if fr is None:
            return "Looking for MapleStory..."
        w = fr.rect[2:] if fr.rect else None
        name = (fr.title or "MapleStory")[:30]
        where = f"{name} {w[0]}×{w[1]}" if w else ("selected area" if self.worker.mode == "region" else "")
        chosen = self.worker.window_title
        return {
            "ok": f"Watching: {where}".strip(),
            "no_window": f"'{chosen[:30]}' isn't open" if chosen else "MapleStory window not found",
            "minimized": "MapleStory is minimized",
            "off_screen": "The game is off the screen",
            "no_bar": "Can't find the EXP bar",
            "unclear": "EXP bar found, but not clear",
            "error": "Screen read failed (see errors.log)",
        }.get(fr.status, fr.status)

    def help_text(self, fr):
        if self.problem or fr is None:
            return ""
        covering = self.overlay_covers_bar(fr)
        if fr.status == "no_window":
            return ("Open that program again, or pick another window in Settings (the gear)."
                    if self.worker.window_title else
                    "Start MapleStory first (windowed or borderless), or pick its window in Settings (the gear).")
        if fr.status == "minimized":
            return "Bring the game window back up."
        if fr.status == "no_bar":
            return ("Move this window: it is covering the bottom of the game, where the EXP bar is."
                    if covering else
                    "Make sure nothing covers the EXP bar at the bottom of the game. If it still can't "
                    "find it, use Settings > Select area.")
        if fr.status == "unclear":
            return ("Move this window: it is over part of the EXP bar." if covering else
                    "The digits are too small or blurry. Make the game window bigger.")
        return ""

    def overlay_covers_bar(self, fr):
        """True if this window sits over the bottom strip of the game window."""
        try:
            if not fr.rect:
                return False
            left, top, w, h = fr.rect
            sy = top + h * (1 - S.SEARCH_STRIP)
            ox, oy = self.root.winfo_rootx(), self.root.winfo_rooty()
            ow, oh = self.root.winfo_width(), self.root.winfo_height()
            return ox < left + w and ox + ow > left and oy < top + h and oy + oh > sy
        except Exception:
            return False

    # ---- settings (saved) and what the Settings window does
    def save_settings(self):
        self.cfg["opacity"] = round(float(self.opacity.get()), 2)
        self.cfg["layout"] = self.layout
        self.cfg["theme"] = self.theme_key
        self.cfg["level"] = self.level_override
        self.cfg["map"] = self.map_name
        self.cfg["topmost"] = bool(self.topmost_var.get())
        self.cfg["hotkeys_on"] = bool(self.hotkeys_var.get())
        self.cfg["chat_on"] = bool(self.chat_on_var.get())
        self.cfg["market_all"] = bool(self.market_all_var.get())
        self.cfg["main_feed"] = bool(self.main_feed_var.get())
        self.cfg["gap_seconds"] = int(self.tracker.gap)
        self.cfg["mode"], self.cfg["window_title"] = self.worker.mode, self.worker.window_title
        try:
            self.cfg["pos"] = [self.root.winfo_x(), self.root.winfo_y()]
        except tk.TclError:
            pass
        save_config(self.cfg)

    def say(self, text, seconds=8.0):
        self._event_msg, self._event_until = text, time.monotonic() + seconds
        self.redraw()

    def on_topmost(self):
        self.root.attributes("-topmost", bool(self.topmost_var.get()))
        self.save_settings()

    def on_hotkeys(self):
        self.hotkeys.set(winapi.DEFAULT_HOTKEYS, bool(self.hotkeys_var.get()))
        self.save_settings()

    def on_opacity(self, value):
        self.root.attributes("-alpha", float(value))

    def commit_gap(self):
        try:
            gap = int(float(self.gap_var.get()))
        except ValueError:
            gap = int(self.tracker.gap)
        gap = min(600, max(3, gap))
        self.gap_var.set(str(gap))
        self.tracker.set_gap(gap)
        self.save_settings()

    def commit_map(self):
        self.set_map(self.map_var.get())

    def set_map(self, name):
        """Change the map. Each logged session belongs to ONE map, so if a session with something worth logging is under way, it
        is saved under the old map and a new session starts for the new one. Returns True if the map changed."""
        name = " ".join(str(name).split())[:60]
        if name == self.map_name:
            self.map_var.set(name)
            return False
        old, now = self.map_name, time.monotonic()
        split = E.session_entry(self.tracker, self.mesos, now, old) is not None
        if split:
            was_running = self.tracker.running
            self.tracker.pause(now)
            self.save_session()                          # (written with the OLD map's name: map_name hasn't changed yet)
            self.tracker.reset()
            self.mesos.reset()
            if was_running:
                self.tracker.start(now)
        self.map_name = name
        self.map_var.set(name)
        if name:
            recent = [name] + [x for x in self.cfg.get("recent_maps", []) if x != name]
            self.cfg["recent_maps"] = recent[:8]
        self.save_settings()
        if split:
            self.say(f"Saved the last session under \"{old or 'no map'}\". A new session has started" + (f" for \"{name}\"." if name else " (no map)."), 10.0)
        else:
            self.say(f"Map: {name}." if name else "Map cleared.")
        return True

    def show_map_picker(self):
        """A small window to say which map you are on (the quick way, from the MAP line on the main window)."""
        if self.map_win is not None:
            try:
                self.map_win.lift()
                return
            except tk.TclError:
                self.map_win = None
        win = self.map_win = skin_window(self.root, "Which map are you on?")
        win.geometry(f"+{self.root.winfo_x() + self.root.winfo_width() + 12}+{self.root.winfo_y() + 60}")

        def closed():
            self.map_win = None
            win.destroy()
        win.protocol("WM_DELETE_WINDOW", closed)
        body = tk.Frame(win, bg=SKIN.bg, padx=18, pady=14)
        body.pack(fill="both")
        skin_label(body, "The map is saved with each session in the log.", muted=True, size=9).pack(anchor="w")
        recent = [x for x in self.cfg.get("recent_maps", []) if x]
        everything = sorted(n for n, town in self.map_names.items() if not town and n not in recent)
        var = tk.StringVar(win, value=self.map_name)
        box = ttk.Combobox(body, textvariable=var, style="Skin.TCombobox", width=46, values=recent + everything)
        box.pack(anchor="w", pady=(8, 4))
        skin_label(body, "Pick one (your recent maps are first) or type any name. Changing the map in the middle of a session saves that "
                         "session under the old map and starts a new one.", muted=True, size=8, wraplength=380).pack(anchor="w", pady=(0, 10))

        def save(_e=None):
            self.set_map(var.get())
            closed()

        def clear():
            var.set("")
            save()
        row = tk.Frame(body, bg=SKIN.bg)
        row.pack(fill="x")
        skin_button(row, "Save", save, primary=True).pack(side="left")
        skin_button(row, "No map", clear).pack(side="left", padx=8)
        skin_button(row, "Cancel", closed).pack(side="right")
        box.bind("<Return>", save)

    def commit_level(self, only_if_edited=False):
        """A level typed in by hand: used instead of working it out (it must still fit the EXP bar)."""
        if only_if_edited and not self._entry_dirty:
            return
        self._entry_dirty = False
        txt = self.level_entry_var.get().strip()
        if not txt:
            self.unlock_level()
            return
        try:
            n = int(txt)
        except ValueError:
            n = 0
        if not (1 <= n <= E.MAX_LEVEL):
            self.say(f"Enter a level from 1 to {E.MAX_LEVEL}.")
            self.level_entry_var.set(str(self.level_override or self.tracker.level or ""))
            return
        self.level_override = n
        self.say(f"Level set to {n}: {E.exp_needed(n):,} EXP needed.")
        self.save_settings()

    def unlock_level(self):
        self.level_override = 0
        self._entry_dirty = False
        self.level_entry_var.set(str(self.tracker.level or ""))
        self.say("Level is automatic again.")
        self.save_settings()

    # ---- choosing what to watch
    def window_values(self):
        titles = []
        for _hwnd, title, _cls, _area in winapi.list_windows():
            if title not in titles:
                titles.append(title)
        chosen = self.worker.window_title
        if chosen and chosen not in titles:
            titles.insert(0, chosen)                   # keep showing your pick while its window is closed
        return [AUTO_CHOICE] + titles

    def refresh_window_list(self):
        """Fill the window list with what is open right now (it is also called as the list opens)."""
        values = self.window_values()
        if self.window_box is not None:
            self.window_box.configure(values=values)
        return values

    def on_window_chosen(self, _event=None):
        """A window picked from the list (or 'Automatic'): that is the one to watch from now on."""
        choice = self.window_var.get()
        title = "" if choice == AUTO_CHOICE else choice
        self.worker.window_title = title
        self.worker.hwnd = None                        # look it up afresh
        self.worker.mode = "window"                    # picking a window ends 'Select area' mode
        self.update_area_button()
        self.say(f"Now watching: {title}" if title else "Watching the MapleStory window automatically.")
        self.save_settings()

    def current_window(self):
        """Handle of the window being watched right now, or None."""
        if winapi.window_exists(self.worker.hwnd):
            return self.worker.hwnd
        return (winapi.find_window_by_title(self.worker.window_title) if self.worker.window_title
                else winapi.find_game_window())

    def refresh_window(self):
        self.worker.hwnd = None                        # look for the window again
        self.refresh_window_list()
        self.say("Looking for the window again...")

    def update_area_button(self):
        if self.area_btn is not None:
            self.area_btn.config(text="Follow the game window" if self.worker.mode == "region" else "Select area")

    def on_area_button(self):
        if self.worker.mode == "region":
            self.worker.mode = "window"
            self.update_area_button()
            self.say("Following the game window again.")
            self.save_settings()
        else:
            self.select_area()

    # ---- controls
    def toggle(self):
        now = time.monotonic()
        if self.tracker.running:
            self.tracker.pause(now)
            self.save_session()
            self.say("Paused.")
        else:
            self.tracker.start(now)
            self.say("Tracking. EXP/hr shows once EXP starts coming in." + ("" if self.map_name else " Tip: set the map so the log shows where you farmed."))

    def on_reset(self):
        now = time.monotonic()
        was_running = self.tracker.running
        self.tracker.pause(now)
        self.save_session()
        self.tracker.reset()                           # (the pause-after-no-EXP setting is kept)
        self.mesos.reset()
        if was_running:
            self.tracker.start(now)
        self.say("Reset. The previous session was saved to the log.")

    def save_session(self):
        entry = E.session_entry(self.tracker, self.mesos, time.monotonic(), self.map_name)
        if entry:
            self.log.upsert(entry)
        self._last_save = time.monotonic()

    def on_close(self):
        try:
            self.tracker.pause(time.monotonic())
            self.save_session()
            self.save_settings()
            self.market.flush()
            self.worker.stop()
        finally:
            self.root.destroy()

    # ---- the heartbeat: take what the worker saw, feed the tracker, redraw
    def pump(self):
        try:
            while True:
                try:
                    action = self.actions.get_nowait()
                except queue.Empty:
                    break
                {"start": self.toggle, "reset": self.on_reset, "compact": self.cycle_layout}.get(action, lambda: None)()
            while True:
                try:
                    fr = self.frames.get_nowait()
                except queue.Empty:
                    break
                self.handle_frame(fr)
            now = time.monotonic()
            self.tracker.tick(now)
            if self.tracker.running and now - self._last_save > SAVE_SECONDS:
                self.save_session()
            self.redraw()
            self.sync_settings()
        except Exception as e:
            log_error("updating the window", e)
        self.root.after(250, self.pump)

    def reload_watch(self):
        """Read the watch list file (making it from the built-in list the first time) and turn it into rules."""
        try:
            text = WATCH_PATH.read_text(encoding="utf-8")
        except FileNotFoundError:
            text = MK.DEFAULT_WATCH
            try:
                WATCH_PATH.write_text(text, encoding="utf-8")
            except OSError:
                pass
        except Exception as e:
            log_error("reading the watch list", e)
            text = MK.DEFAULT_WATCH
        self.watch_rules, self.watch_problems = MK.parse_watch(text)
        return text

    def process_chat(self, messages):
        """Messages just read from the chat box -> the ones not seen before -> buy/sell offers -> the ones worth keeping."""
        new = self.chat_tracker.update([(name, text) for name, text, _ in messages])
        for name, text in new:
            for offer in MK.parse_message(name, text):
                offer.watch = MK.watch_match(self.watch_rules, offer.item_text)
                if not (offer.watch or self.market_all_var.get()):
                    continue
                _, is_new = self.market.add(offer, save=False)
                if offer.watch and is_new:
                    self.say(f"{'Buying' if offer.side == 'B' else 'Selling'}: {offer.watch}, {offer.price_display()} ({name})", 8.0)
        self.market.flush()

    def handle_frame(self, fr):
        self.frame = fr
        if fr.chat_state or not self.chat_on_var.get():
            self.chat_state = fr.chat_state if self.chat_on_var.get() else ""
        if fr.chat is not None and self.chat_on_var.get():
            try:
                self.process_chat(fr.chat)
            except Exception as e:
                log_error("handling the chat", e)
        if fr.status != "ok":
            return
        for ev in self.tracker.observe(fr.t, fr.exp, fr.pct, fr.levels, self.level_override or None):
            self.say(ev, 10.0)
        if fr.mesos is not None:
            self.mesos.observe(fr.t, fr.mesos, counting=self.tracker.running)

    # ---- the Settings window
    def show_settings(self):
        if self.settings_win is not None:
            try:
                self.settings_win.lift()
                return
            except tk.TclError:
                self.settings_win = None
        win = self.settings_win = skin_window(self.root, "Settings")
        win.geometry(f"+{self.root.winfo_x() + self.root.winfo_width() + 12}+{self.root.winfo_y()}")
        win.protocol("WM_DELETE_WINDOW", self.close_settings)
        body = tk.Frame(win, bg=SKIN.bg, padx=20, pady=16)
        body.pack(fill="both")
        row = [0]

        def heading(text):
            skin_label(body, text, muted=True, size=8, bold=True).grid(row=row[0], column=0, columnspan=3, sticky="w", pady=(12 if row[0] else 0, 4))
            row[0] += 1

        # what to watch
        heading("WHAT TO WATCH")
        skin_label(body, "Window").grid(row=row[0], column=0, sticky="w")
        self.window_box = ttk.Combobox(body, textvariable=self.window_var, state="readonly", style="Skin.TCombobox", width=40,
                                       values=self.window_values(), postcommand=self.refresh_window_list)
        self.window_box.grid(row=row[0], column=1, sticky="we", padx=8)
        self.window_box.bind("<<ComboboxSelected>>", self.on_window_chosen)
        skin_button(body, "Refresh", self.refresh_window).grid(row=row[0], column=2)
        row[0] += 1
        brow = tk.Frame(body, bg=SKIN.bg)
        brow.grid(row=row[0], column=1, sticky="w", padx=8, pady=(8, 0))
        self.area_btn = skin_button(brow, "Select area", self.on_area_button)
        self.area_btn.pack(side="left")
        skin_button(brow, "View capture", self.show_capture).pack(side="left", padx=8)
        row[0] += 1
        skin_label(body, "Automatic finds the MapleStory window itself. \"Select area\" is only for when it can't find the EXP bar.",
                   muted=True, size=8, wraplength=380).grid(row=row[0], column=1, columnspan=2, sticky="w", padx=8, pady=(4, 0))
        row[0] += 1

        # level and map
        heading("LEVEL AND MAP")
        skin_label(body, "Level").grid(row=row[0], column=0, sticky="w")
        lrow = tk.Frame(body, bg=SKIN.bg)
        lrow.grid(row=row[0], column=1, sticky="w", padx=8)
        self.level_entry = skin_entry(lrow, self.level_entry_var, 6)
        self.level_entry.pack(side="left")
        self.level_entry.bind("<Return>", lambda e: self.commit_level())
        self.level_entry.bind("<FocusOut>", lambda e: self.commit_level(only_if_edited=True))
        self.level_entry.bind("<Key>", lambda e: setattr(self, "_entry_dirty", e.keysym != "Return"), add="+")
        skin_button(lrow, "Auto", self.unlock_level).pack(side="left", padx=8)
        row[0] += 1
        skin_label(body, "Worked out from the EXP bar. Type a level and press Enter only if you want to force it.",
                   muted=True, size=8, wraplength=380).grid(row=row[0], column=1, columnspan=2, sticky="w", padx=8)
        row[0] += 1
        skin_label(body, "Map").grid(row=row[0], column=0, sticky="w", pady=(8, 0))
        mapbox = ttk.Combobox(body, textvariable=self.map_var, style="Skin.TCombobox", width=40,
                              values=sorted(n for n, town in self.map_names.items() if not town))
        mapbox.grid(row=row[0], column=1, columnspan=2, sticky="we", padx=8, pady=(8, 0))
        for seq in ("<<ComboboxSelected>>", "<Return>", "<FocusOut>"):
            mapbox.bind(seq, lambda e: self.commit_map())
        row[0] += 1
        skin_label(body, "Only labels your log lines.", muted=True, size=8).grid(row=row[0], column=1, sticky="w", padx=8)
        row[0] += 1

        # tracking
        heading("TRACKING")
        skin_label(body, "Pause when no EXP for").grid(row=row[0], column=0, sticky="w")
        grow = tk.Frame(body, bg=SKIN.bg)
        grow.grid(row=row[0], column=1, sticky="w", padx=8)
        ge = skin_entry(grow, self.gap_var, 5)
        ge.pack(side="left")
        ge.bind("<Return>", lambda e: self.commit_gap())
        ge.bind("<FocusOut>", lambda e: self.commit_gap())
        skin_label(grow, "seconds").pack(side="left", padx=8)
        row[0] += 1

        # market watch (the chat)
        heading("MARKET WATCH (CHAT)")
        skin_check(body, "Read the chat for buy / sell offers", self.chat_on_var, self.on_chat_toggle).grid(row=row[0], column=1, columnspan=2, sticky="w", padx=8)
        row[0] += 1
        crow = tk.Frame(body, bg=SKIN.bg)
        crow.grid(row=row[0], column=1, columnspan=2, sticky="w", padx=8, pady=(6, 0))
        skin_button(crow, "Select chat area", self.select_chat_area).pack(side="left")
        skin_button(crow, "Clear", self.clear_chat_area).pack(side="left", padx=8)
        skin_button(crow, "Market list", self.show_market).pack(side="left")
        skin_button(crow, "Watch list...", self.edit_watch).pack(side="left", padx=8)
        skin_button(crow, "Teach chat font...", self.show_teach).pack(side="left")
        row[0] += 1
        self.chat_label = skin_label(body, self.chat_status_text(), muted=True, size=8, wraplength=380)
        self.chat_label.grid(row=row[0], column=1, columnspan=2, sticky="w", padx=8, pady=(4, 0))
        row[0] += 1
        skin_check(body, "Also keep offers for items that are not on my watch list", self.market_all_var, self.on_market_all).grid(
            row=row[0], column=1, columnspan=2, sticky="w", padx=8)
        row[0] += 1
        skin_check(body, "Show the newest offers on the main (Square) layout", self.main_feed_var, self.on_main_feed).grid(
            row=row[0], column=1, columnspan=2, sticky="w", padx=8)
        row[0] += 1

        # the window itself
        heading("THE WINDOW")
        skin_label(body, "Design").grid(row=row[0], column=0, sticky="nw")
        drow = tk.Frame(body, bg=SKIN.bg)
        drow.grid(row=row[0], column=1, columnspan=2, sticky="w", padx=8)
        for key, th in THEMES.items():
            cell = tk.Frame(drow, bg=SKIN.bg)
            cell.pack(side="left", padx=(0, 16))
            pic = self.theme_thumbnail(key)
            thumb = tk.Label(cell, image=pic, bg=SKIN.bg, bd=0, cursor="hand2", highlightthickness=3,
                             highlightbackground=SKIN.accent if key == self.theme_key else SKIN.border)
            thumb.image = pic
            thumb.pack()
            thumb.bind("<Button-1>", lambda e, k=key: self.set_theme(k))
            tk.Radiobutton(cell, text=th.label, value=key, variable=self.theme_var, command=lambda: self.set_theme(self.theme_var.get()),
                           bg=SKIN.bg, fg=SKIN.text, selectcolor=SKIN.field, activebackground=SKIN.bg, activeforeground=SKIN.text,
                           font=(UI_FONT, 9), bd=0, highlightthickness=0).pack(pady=(6, 0))
        row[0] += 1
        skin_label(body, "Layout").grid(row=row[0], column=0, sticky="w", pady=(12, 0))
        lay = tk.Frame(body, bg=SKIN.bg)
        lay.grid(row=row[0], column=1, columnspan=2, sticky="w", padx=8, pady=(12, 0))
        for name, text in (("square", "Square"), ("wide", "Wide"), ("bar", "Slim bar"), ("mesos", "Mesos only"), ("market", "Market feed")):
            tk.Radiobutton(lay, text=text, value=name, variable=self.layout_var, command=lambda: self.set_layout(self.layout_var.get()),
                           bg=SKIN.bg, fg=SKIN.text, selectcolor=SKIN.field, activebackground=SKIN.bg, activeforeground=SKIN.text,
                           font=(UI_FONT, 9), bd=0, highlightthickness=0).pack(side="left", padx=(0, 14))
        row[0] += 1
        skin_label(body, "Opacity").grid(row=row[0], column=0, sticky="w", pady=(8, 0))
        sc = ttk.Scale(body, from_=0.4, to=1.0, variable=self.opacity, style="Skin.Horizontal.TScale", command=self.on_opacity)
        sc.grid(row=row[0], column=1, columnspan=2, sticky="we", padx=8, pady=(8, 0))
        sc.bind("<ButtonRelease-1>", lambda e: self.save_settings())
        row[0] += 1
        skin_check(body, "Always on top of other windows", self.topmost_var, self.on_topmost).grid(row=row[0], column=1, columnspan=2, sticky="w", padx=8, pady=(6, 0))
        row[0] += 1
        keys = winapi.DEFAULT_HOTKEYS
        skin_check(body, f"Hotkeys: {keys['start']} start/pause · {keys['reset']} reset · {keys['compact']} layout",
                   self.hotkeys_var, self.on_hotkeys).grid(row=row[0], column=1, columnspan=2, sticky="w", padx=8)
        row[0] += 1

        skin_label(body, f"Your settings and log are saved in:\n{DATA_DIR}", muted=True, size=8, wraplength=470).grid(
            row=row[0], column=0, columnspan=3, sticky="w", pady=(14, 0))
        row[0] += 1
        skin_button(body, "Done", self.close_settings, primary=True).grid(row=row[0], column=2, sticky="e", pady=(12, 0))
        body.columnconfigure(1, weight=1)

    def close_settings(self):
        self.commit_gap()
        self.commit_map()
        win, self.settings_win, self.window_box, self.area_btn, self.level_entry = self.settings_win, None, None, None, None
        self.chat_label = None
        if win is not None:
            win.destroy()

    def sync_settings(self):
        """Keep the Settings window's level box in step with the level being tracked."""
        if self.settings_win is None or self.level_entry is None:
            return
        try:
            focused = self.root.focus_get() is self.level_entry or self.settings_win.focus_get() is self.level_entry
        except Exception:
            focused = False
        shown = str(self.level_override or self.tracker.level or "")
        if not focused and not self._entry_dirty and self.level_entry_var.get() != shown:
            self.level_entry_var.set(shown)

    # ---- chat watching: settings and helpers
    TEACH_LINES = ("The quick brown fox jumps over the lazy dog", "ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789", "!?%.,:;+-/()[]<>='*&#@$")
    COMMON_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?%.,:;+-/()[]<>=&'*#@$"

    def known_chars(self):
        return {c for c in self.glyphs.chars() if len(c) == 1}

    def chat_status_text(self):
        spec = self.cfg.get("chat_region")
        if not spec:
            return 'Chat area: not set. Press "Select chat area" and drag a box around the chat text.'
        w, h = (spec["rel"][2], spec["rel"][3]) if "rel" in spec else (spec["abs"][2], spec["abs"][3])
        notes = {"size_changed": " The game window has changed size since the area was selected: select it again.",
                 "no_window": " Waiting for the game window.", "off_screen": " The chat area is off the screen.",
                 "error": " Couldn't read it (see errors.log)."}
        known = len(self.known_chars() & set(self.COMMON_CHARS))
        return f"Chat area: {w} x {h} pixels.{notes.get(self.chat_state, '')} The reader knows {known} of {len(self.COMMON_CHARS)} usual characters."

    def reset_chat(self):
        """Forget which chat lines have been seen and read the chat again at the next look."""
        self.chat_tracker = MK.ChatTracker()
        self.worker.force_chat = True

    def update_chat_label(self):
        lbl = getattr(self, "chat_label", None)
        if lbl is not None and self.settings_win is not None:
            try:
                lbl.config(text=self.chat_status_text())
            except tk.TclError:
                pass

    def on_chat_toggle(self):
        self.worker.chat_on = bool(self.chat_on_var.get())
        self.reset_chat()
        self.chat_state = ""
        if self.worker.chat_on and not self.cfg.get("chat_region"):
            self.say('Chat watching is on, but the chat area isn\'t chosen yet: Settings > "Select chat area".', 10.0)
        self.save_settings()
        self.update_chat_label()

    def on_market_all(self):
        self.save_settings()

    def on_main_feed(self):
        """Show or hide the market section on the main layout (the window grows or shrinks to fit)."""
        self._last_sig = None
        self.redraw()
        self.save_settings()

    def select_chat_area(self):
        self.select_area("chat")

    def clear_chat_area(self):
        self.cfg.pop("chat_region", None)
        self.worker.chat_region = None
        self.reset_chat()
        self.save_settings()
        self.update_chat_label()
        self.say("Chat area cleared.")

    # ---- the market window
    def show_market(self):
        if self.market_win is not None:
            try:
                self.market_win.lift()
                return
            except tk.TclError:
                self.market_win = None
        win = self.market_win = skin_window(self.root, "Market history", resizable=True)
        win.geometry(f"+{self.root.winfo_x() + self.root.winfo_width() + 12}+{self.root.winfo_y()}")

        def closed():
            self.market_win = None
            win.destroy()
        win.protocol("WM_DELETE_WINDOW", closed)
        top = tk.Frame(win, bg=SKIN.bg)
        top.pack(fill="x", padx=12, pady=(12, 4))
        item_var, side_var, who_var = tk.StringVar(win, value="All items"), tk.StringVar(win, value="Buy and sell"), tk.StringVar(win, value="")
        skin_label(top, "Item").pack(side="left")
        item_box = ttk.Combobox(top, textvariable=item_var, state="readonly", style="Skin.TCombobox", width=36,
                                values=["All items", "Watch list only", *[r.name for r in self.watch_rules], "Other items"])
        item_box.pack(side="left", padx=(6, 12))
        side_box = ttk.Combobox(top, textvariable=side_var, state="readonly", style="Skin.TCombobox", width=12, values=["Buy and sell", "Buy", "Sell"])
        side_box.pack(side="left", padx=(0, 12))
        skin_label(top, "Player").pack(side="left")
        who_entry = skin_entry(top, who_var, 14)
        who_entry.pack(side="left", padx=6)
        cols = ("Last seen", "Side", "Player", "Item", "Price", "Seen", "Message")
        tree = ttk.Treeview(win, columns=cols, show="headings", height=14, selectmode="extended", style="Skin.Treeview")
        widths = {"Last seen": 90, "Side": 50, "Player": 110, "Item": 230, "Price": 90, "Seen": 50, "Message": 330}
        for c in cols:
            tree.heading(c, text=c)
            tree.column(c, width=widths[c], anchor="e" if c in ("Price", "Seen") else "w")
        tree.pack(fill="both", expand=True, padx=12, pady=6)
        status = skin_label(win, "", muted=True, size=8)
        status.pack(fill="x", padx=14)

        def shown(e):
            want, side, who = item_var.get(), side_var.get(), who_var.get().strip().lower()
            if want == "Watch list only" and not e.get("watched"):
                return False
            if want == "Other items" and e.get("watched"):
                return False
            if want not in ("All items", "Watch list only", "Other items") and e.get("item") != want:
                return False
            if (side == "Buy" and e.get("side") != "B") or (side == "Sell" and e.get("side") != "S"):
                return False
            return not who or who in e.get("name", "").lower()

        def refresh(*_):
            try:
                selected = set(tree.selection())
                tree.delete(*tree.get_children())
                rows = [e for e in reversed(self.market.entries()) if shown(e)][:500]
                for e in rows:
                    price = MK.format_price(e["price"]) + (" each" if e.get("each") else "") if e.get("price") is not None else ("PMO" if e.get("pmo") else "-")
                    when = time.strftime("%m-%d %H:%M", time.localtime(e.get("last_ts", e.get("ts", 0))))
                    tree.insert("", "end", iid=e["id"], values=(when, MK.SIDE_NAMES.get(e.get("side"), "?"), e.get("name", ""), e.get("item", ""), price, e.get("count", 1), e.get("raw", "")))
                keep = [i for i in selected if tree.exists(i)]
                if keep:
                    tree.selection_set(keep)
                status.config(text=f"{len(rows)} shown of {len(self.market.entries())} kept." + ("" if self.chat_on_var.get() else "  Chat watching is OFF: turn it on in Settings."))
            except tk.TclError:
                pass

        def tick():
            if self.market_win is win:
                refresh()
                win.after(2000, tick)
        for box in (item_box, side_box):
            box.bind("<<ComboboxSelected>>", refresh)
        who_entry.bind("<KeyRelease>", refresh)

        def export():
            path = filedialog.asksaveasfilename(parent=win, defaultextension=".csv", filetypes=[("CSV", "*.csv")], initialfile="market_offers.csv")
            if path:
                try:
                    n = self.market.export_csv(path)
                    messagebox.showinfo("Maple EXP Tracker", f"Saved {n} offers.", parent=win)
                except Exception as e:
                    log_error("exporting the offers", e)
                    messagebox.showerror("Maple EXP Tracker", f"Couldn't save the file: {e}", parent=win)

        def delete():
            sel = tree.selection()
            if sel and messagebox.askyesno("Maple EXP Tracker", f"Delete {len(sel)} offer(s)?", parent=win):
                self.market.delete(sel)
                refresh()

        def clear():
            if messagebox.askyesno("Maple EXP Tracker", "Delete ALL saved offers?", parent=win):
                self.market.clear()
                refresh()
        bar = tk.Frame(win, bg=SKIN.bg)
        bar.pack(fill="x", padx=12, pady=(4, 12))
        skin_button(bar, "Export CSV", export, primary=True).pack(side="left")
        skin_button(bar, "Delete selected", delete).pack(side="left", padx=8)
        skin_button(bar, "Clear all", clear).pack(side="left")
        skin_button(bar, "Watch list...", self.edit_watch).pack(side="left", padx=8)
        skin_button(bar, "Teach chat font...", self.show_teach).pack(side="left")
        skin_button(bar, "Close", closed).pack(side="right")
        refresh()
        win.after(2000, tick)

    # ---- the watch list editor
    def edit_watch(self):
        if self.watch_win is not None:
            try:
                self.watch_win.lift()
                return
            except tk.TclError:
                self.watch_win = None
        text = self.reload_watch()
        win = self.watch_win = skin_window(self.root, "Watch list", resizable=True)

        def closed():
            self.watch_win = None
            win.destroy()
        win.protocol("WM_DELETE_WINDOW", closed)
        skin_label(win, "One item per line:   Name = word + word + word - word\n"
                        "  +  means AND (all must appear)     /  separates alternatives     -  starts words that must NOT appear\n"
                        "Plurals and spacing are handled (\"earring\" matches \"earrings\", \"lvl 50\" matches \"lvl50\"). Lines starting with # are notes.",
                   muted=True, size=8).pack(fill="x", padx=14, pady=(12, 4))
        box = tk.Text(win, width=100, height=14, bg=SKIN.field, fg=SKIN.text, insertbackground=SKIN.accent, relief="flat", font=("Consolas", 10), wrap="none",
                      highlightthickness=1, highlightbackground=SKIN.border, highlightcolor=SKIN.accent)
        box.pack(fill="both", expand=True, padx=14, pady=4)
        box.insert("1.0", text)
        note = skin_label(win, "", size=9)
        note.pack(fill="x", padx=14)

        def save():
            content = box.get("1.0", "end").rstrip() + "\n"
            rules, problems = MK.parse_watch(content)
            if problems:
                note.config(text="Not saved. " + "  ".join(problems[:3]), fg=SKIN.highlight)
                return
            try:
                WATCH_PATH.write_text(content, encoding="utf-8")
            except OSError as e:
                log_error("saving the watch list", e)
                note.config(text=f"Couldn't save: {e}", fg=SKIN.highlight)
                return
            self.reload_watch()
            note.config(text=f"Saved: {len(rules)} item(s) on the watch list.", fg=SKIN.muted)

        def reset():
            box.delete("1.0", "end")
            box.insert("1.0", MK.DEFAULT_WATCH)
        bar = tk.Frame(win, bg=SKIN.bg)
        bar.pack(fill="x", padx=14, pady=10)
        skin_button(bar, "Save", save, primary=True).pack(side="left")
        skin_button(bar, "Back to the starting list", reset).pack(side="left", padx=8)
        skin_button(bar, "Close", closed).pack(side="right")

    # ---- teaching the reader the chat font
    def adopt_glyphs(self, new_all, new_user):
        """Start using a bigger letter library (the reading thread gets the new one in a single step) and keep what was learned."""
        self.glyphs, self.user_glyphs = new_all, new_user
        self.worker.glyphs = new_all
        try:
            new_user.save(GLYPHS_USER_PATH)
        except OSError as e:
            log_error("saving the learned letters", e)
        self.update_chat_label()

    def teach_line(self, chat, index, typed):
        """Learn from one line of the chat picture, given what it really says. Returns (letters learned, a problem or '')."""
        new_all, new_user = self.glyphs.copy(), self.user_glyphs.copy()
        before = len(new_all.items)
        learned, why = CR.teach(chat, index, typed, new_all)
        if why:
            return [], why
        for ch, mask in new_all.items[before:]:
            new_user.add(ch, mask)
        if len(new_all.items) > before:
            self.adopt_glyphs(new_all, new_user)
        return learned, ""

    def teach_newest(self, name):
        """The quick way: the three suggested lines were typed into the game's chat, so the newest three named lines are them.
        Returns (shapes learned, [lines that didn't line up])."""
        img = self.worker.last_chat_img
        if img is None:
            return 0, ["(no picture of the chat yet)"]
        new_all, new_user = self.glyphs.copy(), self.user_glyphs.copy()
        before = len(new_all.items)
        problems = []
        chat = CR.read_chat(img, new_all)
        total = len(self.TEACH_LINES)
        for k, sentence in enumerate(self.TEACH_LINES):
            # the three lines just typed are the newest three on screen (we can't rely on telling "named" lines apart yet:
            # that needs the colon and letters that may not have been learned)
            if len(chat.lines) < total:
                problems.append(sentence[:20] + "...")
                continue
            idx = len(chat.lines) - total + k
            _, why = CR.teach(chat, idx, f"{name} : {sentence}", new_all)
            if why:
                problems.append(sentence[:20] + "...")
            chat = CR.read_chat(img, new_all)                          # read again with what was just learned
        for ch, mask in new_all.items[before:]:
            new_user.add(ch, mask)
        if len(new_all.items) > before:
            self.adopt_glyphs(new_all, new_user)
        return len(new_all.items) - before, problems

    def show_teach(self):
        if self.teach_win is not None:
            try:
                self.teach_win.lift()
                return
            except tk.TclError:
                self.teach_win = None
        win = self.teach_win = skin_window(self.root, "Teach the chat font", resizable=True)

        def closed():
            self.teach_win = None
            win.destroy()
        win.protocol("WM_DELETE_WINDOW", closed)
        skin_label(win, "Letters the reader hasn't learned show as ?. Teach it once and it remembers them.\n"
                        "QUICK WAY: type these three lines into the game's chat, one after another, put your character name below,\n"
                        "then press \"Learn from the newest 3 lines\".", muted=True, size=9).pack(fill="x", padx=14, pady=(12, 4))
        sample = tk.Text(win, width=70, height=3, bg=SKIN.field, fg=SKIN.text, relief="flat", font=("Consolas", 10), highlightthickness=1,
                         highlightbackground=SKIN.border)
        sample.pack(padx=14, pady=4, anchor="w")
        sample.insert("1.0", "\n".join(self.TEACH_LINES))
        sample.config(state="disabled")
        row = tk.Frame(win, bg=SKIN.bg)
        row.pack(fill="x", padx=14, pady=4)
        skin_label(row, "Your character name").pack(side="left")
        name_var = tk.StringVar(win, value=self.cfg.get("teach_name", ""))
        skin_entry(row, name_var, 16).pack(side="left", padx=8)
        info = skin_label(win, "", size=9, wraplength=620)
        info.pack(fill="x", padx=14, pady=(2, 4))
        skin_label(win, "OR teach one line at a time: pick it, type what it really says (name, a colon, then the message), press Teach.",
                   muted=True, size=9).pack(fill="x", padx=14, pady=(6, 2))
        lst = tk.Listbox(win, width=100, height=8, bg=SKIN.field, fg=SKIN.text, selectbackground=SKIN.select, selectforeground=SKIN.select_text,
                         relief="flat", font=("Consolas", 10), highlightthickness=1, highlightbackground=SKIN.border, exportselection=False)
        lst.pack(fill="x", padx=14, pady=4)
        typed_var = tk.StringVar(win, value="")
        skin_entry(win, typed_var, 100).pack(fill="x", padx=14, pady=2)
        state = {"chat": None}

        def reread():
            img = self.worker.last_chat_img
            lst.delete(0, "end")
            if img is None:
                state["chat"] = None
                info.config(text="No picture of the chat yet. Turn on chat watching in Settings and choose the chat area, then wait a moment.", fg=SKIN.highlight)
                return
            state["chat"] = CR.read_chat(img, self.glyphs)
            for ln in state["chat"].lines:
                lst.insert("end", ln.raw)
            known = self.known_chars() & set(self.COMMON_CHARS)
            missing = "".join(c for c in self.COMMON_CHARS if c not in known)
            info.config(text=f"The reader knows {len(known)} of {len(self.COMMON_CHARS)} usual characters." + (f"  Still missing: {missing}" if missing else "  That's all of them."), fg=SKIN.muted)

        def pick(_e=None):
            sel = lst.curselection()
            if sel and state["chat"] is not None:
                typed_var.set(state["chat"].lines[sel[0]].raw)
        lst.bind("<<ListboxSelect>>", pick)

        def teach_one():
            sel = lst.curselection()
            if state["chat"] is None or not sel:
                info.config(text="Pick a line from the list first.", fg=SKIN.highlight)
                return
            learned, why = self.teach_line(state["chat"], sel[0], typed_var.get())
            if why:
                info.config(text=why, fg=SKIN.highlight)
                return
            reread()
            info.config(text=(f"Learned: {' '.join(learned)}.  " if learned else "Nothing new on that line.  ") + info.cget("text"), fg=SKIN.muted)

        def quick():
            name = name_var.get().strip()
            if not name or state["chat"] is None:
                info.config(text="Type your character name and make sure the chat is being read.", fg=SKIN.highlight)
                return
            self.cfg["teach_name"] = name
            self.save_settings()
            count, problems = self.teach_newest(name)
            reread()
            msg = f"Learned {count} new shape(s)." + (f"  Couldn't line up: {', '.join(problems)}. Check the three lines are the newest in chat." if problems else "")
            info.config(text=msg + "  " + info.cget("text"), fg=SKIN.muted)
        bar = tk.Frame(win, bg=SKIN.bg)
        bar.pack(fill="x", padx=14, pady=10)
        skin_button(bar, "Learn from the newest 3 lines", quick, primary=True).pack(side="left")
        skin_button(bar, "Teach the picked line", teach_one).pack(side="left", padx=8)
        skin_button(bar, "Re-read the chat", reread).pack(side="left")
        skin_button(bar, "Close", closed).pack(side="right")
        reread()

    # ---- the log window
    def show_log(self):
        entries = self.log.load()
        win = skin_window(self.root, "Session log", resizable=True)
        win.geometry(f"+{self.root.winfo_x() + self.root.winfo_width() + 12}+{self.root.winfo_y()}")
        topbar = tk.Frame(win, bg=SKIN.bg)
        topbar.pack(fill="x", padx=12, pady=(12, 0))
        skin_label(topbar, "Map").pack(side="left")
        map_filter = tk.StringVar(win, value="All maps")
        filter_box = ttk.Combobox(topbar, textvariable=map_filter, state="readonly", style="Skin.TCombobox", width=44, values=["All maps"])
        filter_box.pack(side="left", padx=8)
        totals = skin_label(win, "", muted=True, size=9)
        cols = ("Started", "Map", "Level", "Time", "EXP", "EXP/hr", "%/hr", "Mesos", "Mesos/hr")
        tree = ttk.Treeview(win, columns=cols, show="headings", height=12, selectmode="extended", style="Skin.Treeview")
        widths = {"Started": 130, "Map": 170, "Level": 70, "Time": 80, "EXP": 90, "EXP/hr": 90, "%/hr": 60, "Mesos": 90, "Mesos/hr": 80}
        for c in cols:
            tree.heading(c, text=c)
            tree.column(c, width=widths[c], anchor="w" if c in ("Started", "Map") else "e")

        def chosen():
            want = map_filter.get()
            return [e for e in entries if want == "All maps" or (e.get("map") or "(no map)") == want]

        def fill():
            names = sorted({e.get("map") or "(no map)" for e in entries})
            filter_box.configure(values=["All maps"] + names)
            if map_filter.get() not in ["All maps"] + names:
                map_filter.set("All maps")
            tree.delete(*tree.get_children())
            shown = chosen()
            sm = E.summarize(shown)
            totals.config(text=(f"{sm['sessions']} session{'s' if sm['sessions'] != 1 else ''}  ·  {E.fmt_time(sm['seconds'])} in total  ·  "
                                f"{E.fmt_int(sm['exp'])} EXP  ·  {E.fmt_int(sm['exp_per_hr'])} EXP/hr on average"
                                + (f"  ·  {E.fmt_int(sm['mesos_per_hr'])} mesos/hr" if sm["mesos_per_hr"] is not None else "")) if shown else "No sessions logged for this map yet.")
            for e in reversed(shown):
                a, b = e.get("level_start"), e.get("level_end")
                tree.insert("", "end", iid=e["id"], values=(
                    e["id"], e.get("map") or "", f"{a}→{b}" if a != b else str(a), E.fmt_time(e.get("seconds", 0)),
                    E.fmt_int(e.get("exp")), E.fmt_int(e.get("exp_per_hr")),
                    "--" if e.get("pct_per_hr") is None else f"{e['pct_per_hr']:.1f}",
                    E.fmt_int(e.get("mesos")), E.fmt_int(e.get("mesos_per_hr"))))

        def reload():
            nonlocal entries
            entries = self.log.load()
            fill()

        def export():
            path = filedialog.asksaveasfilename(parent=win, defaultextension=".csv", filetypes=[("CSV", "*.csv")],
                                                initialfile="exp_log.csv")
            if path:
                try:
                    n = self.log.export_csv(path)
                    messagebox.showinfo("Maple EXP Tracker", f"Saved {n} lines.", parent=win)
                except Exception as e:
                    log_error("exporting the log", e)
                    messagebox.showerror("Maple EXP Tracker", f"Couldn't save the file: {e}", parent=win)

        def rename():
            sel = tree.selection()
            if sel:
                name = simpledialog.askstring("Rename map", "Map name for the selected lines:", parent=win)
                if name is not None:
                    self.log.rename_map(sel, name.strip())
                    reload()

        def delete():
            sel = tree.selection()
            if sel and messagebox.askyesno("Maple EXP Tracker", f"Delete {len(sel)} line(s)?", parent=win):
                self.log.delete(sel)
                reload()

        totals.pack(fill="x", padx=14, pady=(6, 0))
        tree.pack(fill="both", expand=True, padx=12, pady=8)
        filter_box.bind("<<ComboboxSelected>>", lambda e: fill())
        bar = tk.Frame(win, bg=SKIN.bg)
        bar.pack(fill="x", padx=12, pady=(0, 12))
        skin_button(bar, "Export CSV", export, primary=True).pack(side="left")
        skin_button(bar, "Rename map", rename).pack(side="left", padx=8)
        skin_button(bar, "Delete", delete).pack(side="left")
        skin_button(bar, "Close", win.destroy).pack(side="right")
        fill()

    # ---- what the tracker sees
    def show_capture(self):
        fr = self.frame
        if fr is None or fr.strip is None:
            messagebox.showinfo("Maple EXP Tracker", "Nothing has been captured yet. " + (self.source_text(fr) or ""))
            return
        img = fr.strip.copy()
        lay = fr.layout
        if lay is not None:
            gh = lay.gh
            for cells, colour in ((lay.exp, (80, 220, 80)), (S._pct_cells(lay), (220, 200, 60))):
                for cx, w, kind in cells:
                    cv2.rectangle(img, (int(cx - w / 2), int(lay.cy - gh / 2 - 1)), (int(cx + w / 2), int(lay.cy + gh / 2 + 1)), colour, 1)
            x0, y0, x1, y1 = lay.box
            cv2.rectangle(img, (x0 - 2, y0), (x1 + 2, y1), (60, 160, 255), 1)
            pad = int(lay.gh * 3)                       # zoom in on the text so the boxes are easy to see
            img = img[max(0, y0 - pad): y1 + pad, max(0, x0 - pad): x1 + pad]
        room = max(300, int(self.root.winfo_screenwidth() * 0.8))
        if img.shape[1] > room:                                             # a very wide picture is shrunk to fit the screen
            f = room / img.shape[1]
            img = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        else:
            scale = max(1, min(8, room // max(1, img.shape[1])))
            img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_NEAREST)
        win = skin_window(self.root, "What the tracker is reading")
        photo = ImageTk.PhotoImage(Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
        lbl = tk.Label(win, image=photo, bg=SKIN.bg)
        lbl.image = photo
        lbl.pack(padx=14, pady=14)
        if fr.status == "ok":
            said = f"Read: {fr.exp:,}  [{fr.pct:.2f}%]   →   level {', '.join(map(str, fr.levels))}"
        else:
            said = self.source_text(fr)
        tk.Label(win, text=said, bg=SKIN.bg, fg=SKIN.highlight, font=(UI_FONT, 11, "bold")).pack(pady=(0, 4))
        tk.Label(win, text="Green boxes: the EXP digits. Yellow: the percent digits. Blue: the whole EXP text.\n"
                           "If the boxes are in the wrong place, use Settings > Select area.", bg=SKIN.bg, fg=SKIN.muted,
                 font=(UI_FONT, 9), justify="center").pack()

        def save():
            path = DATA_DIR / "capture.png"
            cv2.imwrite(str(path), fr.strip)
            messagebox.showinfo("Maple EXP Tracker", f"Saved to {path}\n(It stays on your PC.)", parent=win)
        bar = tk.Frame(win, bg=SKIN.bg)
        bar.pack(pady=14)
        skin_button(bar, "Save picture", save, primary=True).pack(side="left", padx=4)
        skin_button(bar, "Close", win.destroy).pack(side="left", padx=4)

    # ---- choose the EXP area by hand
    def select_area(self, target="exp"):
        """Drag a box around the EXP text (if it can't be found by itself), or around the chat text (target="chat")."""
        with mss.mss() as sct:
            hwnd = self.current_window()
            rect = winapi.client_rect(hwnd) if hwnd else None
            if rect:
                left, top, w, h = rect
            else:
                m = sct.monitors[1]
                left, top, w, h = m["left"], m["top"], m["width"], m["height"]
            shot = ScreenWorker.grab(sct, left, top, w, h)
        if shot is None:
            messagebox.showinfo("Maple EXP Tracker", "Can't capture the screen right now.")
            return
        bgr, ox, oy = shot
        img = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        win = skin_window(self.root, "Drag a box around the whole EXP text" if target == "exp" else "Drag a box around the chat text (inside the chat box)")
        sw, sh = self.root.winfo_screenwidth(), self.root.winfo_screenheight()
        scale = min(1.0, (sw * 0.9) / img.width, (sh * 0.8) / img.height)
        disp = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS) if scale < 1 else img
        photo = ImageTk.PhotoImage(disp)
        bar = tk.Frame(win, bg=SKIN.bg)
        bar.pack(fill="x", padx=12, pady=10)
        canvas = tk.Canvas(win, width=disp.width, height=disp.height, cursor="cross", highlightthickness=0, bg=SKIN.bg)
        canvas.pack()
        canvas.create_image(0, 0, anchor="nw", image=photo)
        canvas.image = photo
        state = {"start": None, "rect": None, "box": None}

        def press(e):
            state["start"] = (e.x, e.y)
            if state["rect"]:
                canvas.delete(state["rect"])

        def drag(e):
            if not state["start"]:
                return
            if state["rect"]:
                canvas.delete(state["rect"])
            x0, y0 = state["start"]
            state["rect"] = canvas.create_rectangle(x0, y0, e.x, e.y, outline=SKIN.accent, width=2)
            state["box"] = (min(x0, e.x), min(y0, e.y), max(x0, e.x), max(y0, e.y))

        def save():
            b = state["box"]
            need_w, need_h = (20, 8) if target == "exp" else (100, 30)
            if not b or (b[2] - b[0]) / scale < need_w or (b[3] - b[1]) / scale < need_h:
                messagebox.showinfo("Maple EXP Tracker", "Drag a box around the EXP text first." if target == "exp"
                                    else "Drag a box around the chat text first (it needs to be at least a few lines tall).", parent=win)
                return
            region = {"left": int(ox + b[0] / scale), "top": int(oy + b[1] / scale),
                      "width": int((b[2] - b[0]) / scale), "height": int((b[3] - b[1]) / scale)}
            if target == "chat":
                box = [region["left"], region["top"], region["width"], region["height"]]
                spec = ({"rel": [box[0] - rect[0], box[1] - rect[1], box[2], box[3]], "client": [rect[2], rect[3]]} if rect else {"abs": box})
                self.cfg["chat_region"] = spec
                self.worker.chat_region = spec
                self.reset_chat()
                self.chat_state = ""
                self.say("Chat area saved." + ("" if self.chat_on_var.get() else " Now tick \"Read the chat\" in Settings."))
                self.save_settings()
                self.update_chat_label()
                win.destroy()
                return
            self.cfg["region"] = region
            self.worker.region, self.worker.mode = region, "region"
            self.update_area_button()
            self.say("Area saved. It now reads just that part of the screen.")
            self.save_settings()
            win.destroy()

        canvas.bind("<ButtonPress-1>", press)
        canvas.bind("<B1-Motion>", drag)
        skin_button(bar, "Save", save, primary=True).pack(side="left")
        skin_button(bar, "Cancel", win.destroy).pack(side="left", padx=8)
        tk.Label(bar, text=('Box the whole line: "EXP.", the number and the [percent] with its green brackets.' if target == "exp" else
                            "Box the chat text. Keep inside the chat window: not its border or scroll bar. Include several lines."),
                 bg=SKIN.bg, fg=SKIN.text, font=(UI_FONT, 9)).pack(side="left", padx=10)


def main():
    winapi.enable_dpi_awareness()
    winapi.lower_priority()                                   # the game always gets the processor first
    root = tk.Tk()
    if winapi.already_running():
        root.withdraw()
        messagebox.showinfo("Maple EXP Tracker", "The tracker is already running (look for its window).")
        root.destroy()
        return
    app = App(root)
    root.mainloop()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:                         # never fail silently: say what happened, and keep a record
        log_error("the tracker stopped unexpectedly", exc)
        try:
            messagebox.showerror("Maple EXP Tracker", f"The tracker hit a problem and has to close:\n\n{exc}\n\n"
                                 f"Details were saved in {ERROR_LOG_PATH}")
        except Exception:
            pass
        raise
