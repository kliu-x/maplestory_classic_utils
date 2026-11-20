"""Runs the WHOLE program (window, worker, tracker, log) with a stand-in for tkinter and a fake screen
that contains a real game EXP bar. Proves the pieces fit together; it can't show how the window looks.
Run:  python tests/test_app_smoke.py"""

import os
import sys
import tempfile
import types

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, ROOT)

import cv2
import numpy as np

# ------------------------------------------------------------------ a stand-in for tkinter
_shown = []


class Widget:
    """Accepts any call, remembers what text it was given."""

    def __init__(self, *args, **kw):
        self.kw = dict(kw)
        self.master = args[0] if args and isinstance(args[0], Widget) else None
        self._rows = 0
        self.bound = {}

    def config(self, *a, **kw):
        self.kw.update(kw)

    configure = itemconfig = config

    def cget(self, k):
        return self.kw.get(k)

    def bind(self, seq, fn=None, add=None):
        self.bound[seq] = fn

    def grid(self, *a, **kw):
        if self.master is not None:
            self.master._rows = max(self.master._rows, kw.get("row", 0) + 1)

    def grid_size(self):
        return (4, self._rows)

    def winfo_x(self): return 80
    def winfo_y(self): return 80
    def winfo_rootx(self): return 80
    def winfo_rooty(self): return 80
    def winfo_width(self): return 360
    def winfo_height(self): return 700
    def winfo_screenwidth(self): return 1920
    def winfo_fpixels(self, spec): return 96.0
    def winfo_screenheight(self): return 1080
    def focus_get(self): return None
    def after(self, ms, fn=None, *a): return None
    def mainloop(self): pass
    def destroy(self): _shown.append("destroyed")
    def get(self): return self.kw.get("text", "")
    def lift(self): pass
    def get_children(self, *a): return ()
    def selection(self): return ()
    def focus_get(self): return None
    def __getattr__(self, name):                      # pack, place, create_*, delete, attributes, title, ...
        if name.startswith("__"):
            raise AttributeError(name)
        return lambda *a, **k: None


class TextBox(Widget):
    """tk.Text: remembers what is put in it."""
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.buf = ""
    def insert(self, idx, s, *a): self.buf += s
    def get(self, a=None, b=None): return self.buf
    def delete(self, a=None, b=None): self.buf = ""


class ListBox(Widget):
    """tk.Listbox: a list of lines and one that is picked."""
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.items, self.sel = [], ()
    def insert(self, idx, s): self.items.append(s)
    def delete(self, a, b=None): self.items = []
    def curselection(self): return self.sel


class Var:
    def __init__(self, master=None, value=None, **kw): self.v = value
    def get(self): return self.v
    def set(self, v): self.v = v
    def trace_add(self, *a, **k): pass


class FakeFont:
    def __init__(self, **kw): pass
    def measure(self, text): return 7 * len(text)


def install_fakes():
    tk = types.ModuleType("tkinter")
    for n in ("Frame", "Canvas", "Label", "Entry", "Button", "Checkbutton", "Radiobutton", "Toplevel", "Tk"):
        setattr(tk, n, type(n, (Widget,), {}))
    tk.Text, tk.Listbox = TextBox, ListBox
    tk.StringVar = tk.BooleanVar = tk.DoubleVar = Var
    tk.TclError = type("TclError", (Exception,), {})
    ttk = types.ModuleType("tkinter.ttk")
    for n in ("Combobox", "Scale", "Treeview"):
        setattr(ttk, n, type(n, (Widget,), {}))
    ttk.Style = type("Style", (Widget,), {})
    mb = types.ModuleType("tkinter.messagebox")
    mb.showinfo = lambda *a, **k: _shown.append(("info", a[1] if len(a) > 1 else ""))
    mb.showerror = lambda *a, **k: _shown.append(("error", a))
    mb.askyesno = lambda *a, **k: True
    fd = types.ModuleType("tkinter.filedialog")
    fd.asksaveasfilename = lambda **k: os.path.join(tempfile.mkdtemp(), "out.csv")
    sd = types.ModuleType("tkinter.simpledialog")
    sd.askstring = lambda *a, **k: "Renamed Map"
    font = types.ModuleType("tkinter.font")
    font.Font = FakeFont
    tk.ttk, tk.messagebox, tk.filedialog, tk.simpledialog, tk.font = ttk, mb, fd, sd, font
    for name, mod in (("tkinter", tk), ("tkinter.ttk", ttk), ("tkinter.messagebox", mb), ("tkinter.filedialog", fd),
                      ("tkinter.simpledialog", sd), ("tkinter.font", font)):
        sys.modules[name] = mod
    import PIL
    imagetk = types.ModuleType("PIL.ImageTk")
    imagetk.PhotoImage = lambda *a, **k: object()
    sys.modules["PIL.ImageTk"] = imagetk
    PIL.ImageTk = imagetk


# ------------------------------------------------------------------ a fake screen with a real EXP bar in it
SCREEN_W, SCREEN_H = 1920, 1080
WIN = (100, 50, 1280, 720)                                  # the fake game window: left, top, width, height
bar_img = cv2.imread(os.path.join(HERE, "samples", "exp_bar.png"))
rng = np.random.default_rng(3)


def make_screen():
    scr = np.full((SCREEN_H, SCREEN_W, 4), 255, np.uint8)
    l, t, w, h = WIN
    scr[t:t + h, l:l + w, :3] = rng.integers(10, 60, 3)
    for _ in range(80):                                     # sprites and UI clutter
        x, y = l + rng.integers(0, w - 80), t + rng.integers(0, h - 60)
        scr[y:y + rng.integers(8, 50), x:x + rng.integers(8, 90), :3] = rng.integers(0, 255, 3)
    by, bx = t + h - bar_img.shape[0] - 6, l + 30
    scr[by:by + bar_img.shape[0], bx:bx + bar_img.shape[1], :3] = bar_img
    return scr


class FakeSct:
    monitors = [{"left": 0, "top": 0, "width": SCREEN_W, "height": SCREEN_H}]
    screen = make_screen()

    def grab(self, mon):
        l, t, w, h = mon["left"], mon["top"], mon["width"], mon["height"]
        return self.screen[t:t + h, l:l + w].copy()

    def __enter__(self): return self
    def __exit__(self, *a): pass


def install_fake_mss():
    m = types.ModuleType("mss")
    m.mss = lambda: FakeSct()
    sys.modules["mss"] = m


install_fakes()
install_fake_mss()
import winapi
# Three fake open windows: the game, another program with no EXP bar in it, and a small one.
OTHER = (1400, 50, 400, 300)
FAKE_WINDOWS = [(4242, "MapleStory", "MapleStoryClass", WIN[2] * WIN[3]),
                (7, "Some Other Game", "OtherClass", OTHER[2] * OTHER[3]),
                (8, "Notepad", "Notepad", 120 * 100)]
winapi.list_windows = lambda: list(FAKE_WINDOWS)         # find_window_by_title / find_game_window use this
winapi.window_exists = lambda h: any(w[0] == h for w in FAKE_WINDOWS)      # None must read as 'no window'
winapi.client_rect = lambda h: {4242: WIN, 7: OTHER, 8: (1500, 400, 120, 100)}.get(h)
winapi.window_title = lambda h: next((w[1] for w in FAKE_WINDOWS if w[0] == h), "")
winapi.already_running = lambda *a, **k: False
import maple_tracker as M
import exp_tracker as E
import screen_reader as S

# Record every file the program opens from here on (Python's audit hook sees them all).
AUDIT = {"on": False, "opened": []}


def _audit(event, args):
    if AUDIT["on"] and event == "open" and isinstance(args[0], (str, bytes, os.PathLike)):
        AUDIT["opened"].append((os.fsdecode(args[0]), args[1] or "r", args[2] if len(args) > 2 else 0))


sys.addaudithook(_audit)

# A clock the test controls (the program asks `time.monotonic()` for "now"), and no background thread.
import time as _real_time
clock = [1000.0]
M.time = types.SimpleNamespace(monotonic=lambda: clock[0], strftime=_real_time.strftime, time=_real_time.time, localtime=_real_time.localtime, sleep=lambda s: None)
M.ScreenWorker.start = lambda self: None                  # the test calls worker.look() itself

tmp = tempfile.mkdtemp()
M.DATA_DIR = M.Path(tmp)
M.CONFIG_PATH, M.LOG_PATH, M.ERROR_LOG_PATH = M.DATA_DIR / "config.json", M.DATA_DIR / "log.json", M.DATA_DIR / "errors.log"
M.MARKET_PATH, M.WATCH_PATH, M.GLYPHS_USER_PATH = M.DATA_DIR / "market_log.json", M.DATA_DIR / "watchlist.txt", M.DATA_DIR / "chat_glyphs_user.npz"

ok = fail = 0


def check(name, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ok   {name}")
    else:
        fail += 1
        print(f"  FAIL {name}  {detail}")


class Click:
    """A fake mouse event."""
    def __init__(self, x, y): self.x, self.y, self.x_root, self.y_root = x, y, x + 80, y + 80


def centre(app, name):
    r = next(r for r in app._regions if r[0] == name)
    return (r[1] + r[3]) // 2, (r[2] + r[4]) // 2


def click(app, name):
    x, y = centre(app, name)
    app.on_press(Click(x, y)); app.on_release(Click(x, y))


print("1) start-up")
AUDIT["on"] = True
root = M.tk.Tk()
app = M.App(root)
check("window built, templates loaded, no problem reported", app.problem is None and app.exp_tpl is not None and app.mesos_tpl is not None)
check("the window is one picture, drawn", app._photo is not None and app.view_state["title"] == "Maple EXP Tracker")
names = {r[0] for r in app._regions}
check("every button has a clickable area", {"toggle", "reset", "log", "settings", "layout", "close", "drag"} <= names, names)
check("dragging works from anywhere that isn't a button (the last area catches the rest)", app._regions[-1][0] == "drag")

print("2) the worker reads the real bar out of the fake game window (the real code path)")
sct = FakeSct()
fr = app.worker.look(sct, clock[0])
check("worker finds the game window and the EXP bar", fr.status == "ok", fr.status)
check("reads 372,741 [67.08%], level 47", (fr.exp, fr.pct, fr.levels) == (372741, 67.08, [47]), (fr.exp, fr.pct, fr.levels))
app.frames.put(fr)
app.pump()
v = app.view_state
check("status chip says Ready, level 47", v["status_text"] == "Ready · Lv 47" and v["status_kind"] == "idle", v["status_text"])
check("bar and numbers: 67.1%, 182,939 EXP left", v["pct"] == "67.1%" and v["stats"]["left"] == "182,939" and abs(v["frac"] - 0.6708) < 0.001, v)
check("level label and next level", v["level_label"] == "LV 47" and v["next_label"] == "TO LV 48")
check("tells the player to press Start", "Press Start" in v["hint"] and v["eta"] == "Press Start", (v["hint"], v["eta"]))
check("the mesos-only layout is told to ask for the inventory", v["mesos_hint"].startswith("Open your inventory"), v["mesos_hint"])
check("before Start: nothing counted", app.tracker.gained == 0 and v["stats"]["gained"] == "+0")
check("before the inventory is read: 'Open inventory' / --", v["stats"]["mesos_hr"] == "Open inventory" and v["stats"]["mesos_gained"] == "--", v["stats"])

print("3) Start (by clicking the button), farm for a while, watch the numbers")


def frame(exp, level=47, mesos=None):
    f = M.Frame(clock[0])
    pct = round(exp / E.exp_needed(level) * 100, 2)
    f.exp, f.pct, f.levels, f.status, f.gh, f.rect = exp, pct, E.levels_for(exp, pct), "ok", 8.0, WIN
    f.mesos = mesos
    return f


def look_at(exp, level=47, mesos=None, dt=1.5):
    clock[0] += dt
    app.frames.put(frame(exp, level, mesos))
    app.pump()


app.set_map("Henesys Hunting Ground I")                      # (the normal order: say which map you are on, then start)
click(app, "toggle")
check("clicking Start starts tracking", app.tracker.running and app.view_state["running"])
exp, mesos = 372_741, 1_000_000
for i in range(80):                                         # 80 looks = 2 minutes of farming
    exp += 700 if i % 2 else 0
    mesos += 120 if i % 8 == 0 else 0
    look_at(exp, mesos=mesos)
s = app.tracker.stats(clock[0]); v = app.view_state
check("EXP gained counted", s["gained"] == 700 * 40, s["gained"])
check("the big number is the EXP/hr", v["hero"] == E.fmt_int(s["session"]) and 700_000 < s["session"] < 1_000_000, v["hero"])
check("status chip says Tracking", v["status_text"] == "Tracking · Lv 47" and v["status_kind"] == "go", v["status_text"])
check("time to level shown the community way ('Lv 48 in 2 h 06 min')", v["eta"].startswith("Lv 48 in ") and v["to_next"] != "--", v["eta"])
check("mesos per hour shown", v["mesos"] != "--" and v["mesos_unit"] == "mesos / hr", (v["mesos"], v["mesos_unit"]))
check("the square layout gets MESOS / HR and MESOS GAINED values", v["stats"]["mesos_hr"] == v["mesos"] and v["stats"]["mesos_gained"] == E.fmt_int(app.mesos.gained, signed=True)
      and v["stats"]["mesos_gained"].startswith("+") and app.mesos.gained > 0, v["stats"])
check("gained shown with a +", v["stats"]["gained"] == "+28,000", v["stats"]["gained"])
check("footer says how long it has been tracking", v["hint"].startswith("Tracking for"), v["hint"])
check("for the mesos-only layout: what is in the inventory, and the time tracked", v["stats"]["mesos_now"] == E.fmt_int(app.mesos.last) and
      v["stats"]["elapsed"] == E.fmt_hms(s["elapsed"]) and v["mesos_hint"] == "", (v["stats"], v["mesos_hint"]))
check("the picture really changed (a new frame was drawn)", app._photo is not None and app._last_sig is not None)

if os.environ.get("PREVIEW_DIR"):                          # (for looking at it: saves what the window draws)
    for name in M.LAYOUTS:
        app.view.render(name, app.view_state)[0].save(os.path.join(os.environ["PREVIEW_DIR"], f"real_{name}.png"))
    big = M.View(M.Gfx(1.5, M.ASSETS / "fonts"))
    big.render("square", app.view_state)[0].save(os.path.join(os.environ["PREVIEW_DIR"], "real_square_150pct.png"))

print("4) level-up and a death, as they would arrive from the screen")
look_at(555_000); look_at(555_000)
look_at(2_000, level=48); look_at(2_000, level=48)
check("level-up noticed", app.tracker.level == 48 and app.tracker.levelups == 1, (app.tracker.level, app.tracker.levelups))
check("announced in the footer", "Level up" in app.view_state["hint"], app.view_state["hint"])
check("the screen now says level 48", app.view_state["level_label"] == "LV 48" and app.view_state["status_text"].endswith("Lv 48"))
g = app.tracker.gained
look_at(500, level=48); look_at(500, level=48)
check("death counted as lost EXP, not as negative EXP/hr", app.tracker.lost == 1500 and app.tracker.gained == g, (app.tracker.lost, app.tracker.gained, g))
check("lost shown on screen, EXP/hr still positive", app.view_state["stats"]["lost"] == "1,500" and app.tracker.stats(clock[0])["session"] > 0)

print("4b) choosing which window to watch")
FAKE_NAMES = ["MapleStory", "Some Other Game", "Notepad"]
values = app.window_values()
check("list = 'Automatic' + the open windows", values[0] == M.AUTO_CHOICE and values[1:] == FAKE_NAMES, values)
fr = app.worker.look(sct, clock[0] + 1)
check("Automatic finds the MapleStory window by its class", fr.status == "ok" and fr.title == "MapleStory", (fr.status, fr.title))
app.window_var.set("Some Other Game"); app.on_window_chosen()
check("picking another window changes what is watched", app.worker.window_title == "Some Other Game" and app.worker.hwnd is None)
fr = app.worker.look(sct, clock[0] + 2)
check("it now looks at THAT window (and finds no EXP bar there)", fr.title == "Some Other Game" and fr.rect == OTHER and fr.status in ("no_bar", "unclear"), (fr.title, fr.rect, fr.status))
app.window_var.set("MapleStory"); app.on_window_chosen()
fr = app.worker.look(sct, clock[0] + 3)
check("picking the game from the list reads the bar", fr.status == "ok" and fr.exp == 372741 and fr.title == "MapleStory", (fr.status, fr.exp))
check("the choice is saved", app.cfg["window_title"] == "MapleStory" and M.load_config()["window_title"] == "MapleStory")
FAKE_WINDOWS[:] = [w for w in FAKE_WINDOWS if w[0] != 4242]            # the game is closed
app.worker.hwnd = None
fr = app.worker.look(sct, clock[0] + 4)
app.frames.put(fr); app.pump()
check("a picked window that is closed is reported by name", fr.status == "no_window" and app.view_state["status_text"] == "'MapleStory' isn't open", app.view_state["status_text"])
check("the picked name stays in the list while it is closed", "MapleStory" in app.window_values())
FAKE_WINDOWS.insert(0, (4243, "MapleStory", "MapleStoryClass", WIN[2] * WIN[3]))   # the game starts again, new window handle
winapi.client_rect = lambda h: {4243: WIN, 7: OTHER, 8: (1500, 400, 120, 100)}.get(h)
fr = app.worker.look(sct, clock[0] + 5)
check("when the game comes back (new window), it is found again by its title", fr.status == "ok" and app.worker.hwnd == 4243, (fr.status, app.worker.hwnd))
app.window_var.set(M.AUTO_CHOICE); app.on_window_chosen()
check("'Automatic' goes back to finding it by itself", app.worker.window_title == "" and M.load_config()["window_title"] == "")
app.worker.mode = "region"
app.window_var.set("MapleStory"); app.on_window_chosen()
check("picking a window ends 'Select area' mode", app.worker.mode == "window")
app.window_var.set(M.AUTO_CHOICE); app.on_window_chosen()
winapi.list_windows = lambda: list(FAKE_WINDOWS)

print("5) the buttons and the Settings window")
before = app.layout
click(app, "layout")
check("the expand button changes the layout (square -> wide)", app.layout == "wide" and before == "square", (before, app.layout))
check("the picture is a different size now", app.view.size("wide") != app.view.size("square"))
app.actions.put("compact"); app.pump()
check("the Shift+3 hotkey changes the layout too (wide -> bar)", app.layout == "bar", app.layout)
click(app, "layout")
check("the next one is the mesos-only layout", app.layout == "mesos", app.layout)
check("it has its own clickable buttons", {"toggle", "reset", "log", "settings", "layout", "close"} <= {r[0] for r in app._regions}, [r[0] for r in app._regions])
click(app, "toggle"); click(app, "toggle")
check("Start/Pause works from the mesos-only layout too", True)
click(app, "layout")
check("then the market feed, which has its own buttons (history, settings, layout, close)", app.layout == "market" and {"history", "settings", "layout", "close"} <= {r[0] for r in app._regions}, (app.layout, [r[0] for r in app._regions]))
click(app, "history"); check("its 'Open the history log' button opens the history window", app.market_win is not None); app.market_win = None
click(app, "layout")
check("and it loops back to square", app.layout == "square")
for name in M.LAYOUTS:
    app.set_layout(name)
    img, regs = app.view.render(name, app.view_state)
    check(f"{name} layout draws ({img.size[0]}x{img.size[1]}) with {len(regs)} clickable areas", img.size == app.view.size(name, app.view_state) and len(regs) >= 5)
app.set_layout("square")
click(app, "settings")
check("the gear opens Settings", app.settings_win is not None and app.window_box is not None and app.level_entry is not None)
settings_first = app.settings_win
click(app, "settings")
check("clicking the gear again doesn't open a second one", app.settings_win is settings_first)
app.level_entry_var.set("48"); app._entry_dirty = True; app.commit_level()
check("typing a level sets it", app.level_override == 48 and "Level set to 48" in app._event_msg, app._event_msg)
app.level_entry_var.set("999"); app._entry_dirty = True; app.commit_level()
check("a silly level is refused with a message", app.level_override == 48 and "Enter a level" in app._event_msg, app._event_msg)
app.unlock_level()
check("Auto goes back to automatic", app.level_override == 0)
app.map_var.set("Henesys Hunting Ground I"); app.commit_map()
check("map name taken", app.map_name == "Henesys Hunting Ground I")
app.gap_var.set("30"); app.commit_gap()
check("pause-after setting taken", app.tracker.gap == 30)
app.close_settings()
check("Done closes Settings and it can be opened again", app.settings_win is None and app.window_box is None)
click(app, "settings"); check("reopens", app.settings_win is not None); app.close_settings()

print("5a) switching the design")
check("starts in the default design (Dark & Gold)", app.theme_key == "gold" and app.view.t.key == "gold" and M.SKIN.bg == M.THEMES["gold"].dlg_bg)
click(app, "settings")
check("Settings shows a thumbnail of every design", set(app._thumbs) == set(M.THEMES), set(app._thumbs))
first_picture = app._photo
settings_before = app.settings_win
app.theme_var.set("classic"); app.set_theme(app.theme_var.get())
check("choosing MapleStory Classic switches the window", app.theme_key == "classic" and app.view.t.key == "classic" and app._photo is not first_picture)
check("the choice is saved", M.load_config()["theme"] == "classic" and app.cfg["theme"] == "classic")
check("the pop-up windows take the new colours too", M.SKIN.bg == M.THEMES["classic"].dlg_bg and M.SKIN.highlight == M.THEMES["classic"].dlg_highlight)
check("the open Settings window is rebuilt in the new design (and is still open)", app.settings_win is not None and app.settings_win is not settings_before and app.window_box is not None)
for name in M.LAYOUTS:
    app.set_layout(name)
    img, regs = app.view.render(name, app.view_state)
    needed = {"history", "settings", "layout", "close"} if name == "market" else {"toggle", "settings", "layout", "close"}
    check(f"classic / {name}: draws ({img.size[0]}x{img.size[1]}) with every button clickable", img.size == app.view.size(name, app.view_state) and (needed <= {r[0] for r in regs} or name == "bar" and len(regs) >= 5))
app.set_layout("square")
app.set_theme("nonsense")
check("an unknown design name is ignored", app.theme_key == "classic" and app.theme_var.get() == "classic")
app.set_theme("gold")
check("and it switches back", app.theme_key == "gold" and M.load_config()["theme"] == "gold" and M.SKIN.bg == M.THEMES["gold"].dlg_bg)
app.close_settings()
M.CONFIG_PATH.write_text('{"theme": "no-such-design", "layout": "no-such-layout"}')
cfg = M.load_config()
check("a bad design or layout in the settings file falls back to the defaults", cfg["theme"] == "gold" and cfg["layout"] == "square", cfg)
app.save_settings()
print("5b) the mouse")
x, y = centre(app, "toggle")
app.on_motion(Click(x, y))
check("hovering a button highlights it (and redraws)", app._hover == "toggle")
app.on_motion(Click(5, 500))
check("moving off it clears the highlight", app._hover is None)
was = app.tracker.running
app.on_press(Click(x, y)); app.on_release(Click(x + 400, y))
check("pressing a button but releasing somewhere else does nothing", app.tracker.running == was)
app.on_press(Click(200, 12)); app.on_drag(Click(260, 40)); app.on_release(Click(260, 40))
check("dragging the title bar moves the window (and doesn't click anything)", app.tracker.running == was)
click(app, "toggle")
check("clicking Pause pauses and logs the session", (not app.tracker.running) and len(app.log.load()) == 1, app.log.load())
entry = app.log.load()[0]
check("log line has map, EXP/hr and mesos", entry["map"] == "Henesys Hunting Ground I" and entry["exp_per_hr"] > 0 and entry["mesos"] is not None, entry)
click(app, "reset")
check("Reset clears the numbers", app.tracker.gained == 0 and app.mesos.gained == 0)
click(app, "log"); check("the log button opens the log window", True)
app.show_capture(); check("capture viewer opens", True)
app.select_area(); check("area selector opens", True)

print("6) problems are explained, not hidden")


def see(status):
    clock[0] += 5
    f = M.Frame(clock[0]); f.status, f.rect = status, WIN
    app.frames.put(f); app._event_until = 0; app.pump()
    return app.view_state


v = see("no_window"); check("no game: chip + what to do", v["status_text"] == "MapleStory not found" and "Start MapleStory" in v["hint"], v)
v = see("minimized"); check("minimized", v["status_text"] == "Game is minimized" and v["status_kind"] == "wait")
v = see("no_bar"); check("overlay covering the bar -> 'move this window'", v["status_text"] == "Can't find the EXP bar" and "Move this window" in v["hint"], v["hint"])
v = see("unclear"); check("overlay covering a half-seen bar", "Move this window" in v["hint"], v["hint"])
app.root.winfo_rootx = lambda: 1700
v = see("no_bar"); check("nothing covering it -> check for things in the way", "Make sure nothing covers" in v["hint"], v["hint"])
v = see("unclear"); check("digits unclear, nothing covering -> make the game window bigger", "bigger" in v["hint"], v["hint"])
check("every error state still draws", all(app.view.render(l, v)[0].size == app.view.size(l, v) for l in M.LAYOUTS))

print("6b) audit regressions in the window")
app.worker.window_title = "メイプルストーリー"
v = see("no_window")
check("a window title the font can't draw is not shown as empty boxes", "メ" not in v["status_text"] and v["status_text"] == "The picked window isn't open", v["status_text"])
app.worker.window_title = "Notepad"
v = see("no_window")
check("a normal title still is shown", v["status_text"] == "'Notepad' isn't open", v["status_text"])
app.worker.window_title = ""
app.worker.mode = "region"
f = M.Frame(clock[0] + 5); f.exp, f.pct, f.levels, f.status = 372741, 67.08, [47], "ok"; app.frames.put(f); app._event_until = 0; app.pump()
check("in 'Select area' mode the mesos layout says mesos can't be read there (not just 'open your inventory')", "Select area" in app.view_state["mesos_hint"], app.view_state["mesos_hint"])
app.worker.mode = "window"
before = M.ERROR_LOG_PATH.read_text() if M.ERROR_LOG_PATH.exists() else ""
app.root.report_callback_exception(ValueError, ValueError("a button failed"), None)
check("an error inside a button handler is written to errors.log (it would be invisible otherwise)", "something in the window failed" in M.ERROR_LOG_PATH.read_text() and "a button failed" in M.ERROR_LOG_PATH.read_text())
wide_strip = np.zeros((300, 4000, 3), np.uint8); f = M.Frame(clock[0] + 6); f.status, f.strip, f.layout, f.rect = "no_bar", wide_strip, None, WIN
app.frames.put(f); app.pump(); app.show_capture()
check("the capture viewer copes with a 4000-pixel-wide picture", True)

print("6e) chat watching: the chat box on the fake screen is read, offers are kept once, windows open")
import chat_reader as CR
import market as MK
import synth_chat as SC
from PIL import Image as _Image
shot = np.asarray(_Image.open(os.path.join(HERE, "samples", "chat_sample.png")).convert("RGB"))
CHAT_AT = (40, 300)                                          # where the chat box is, inside the fake game window
sy, sx = WIN[1] + CHAT_AT[1], WIN[0] + CHAT_AT[0]
saved_screen = FakeSct.screen.copy()
FakeSct.screen[sy:sy + shot.shape[0], sx:sx + shot.shape[1], :3] = shot[..., ::-1]      # the fake screen holds BGR
spec = {"rel": [CHAT_AT[0], CHAT_AT[1], shot.shape[1], shot.shape[0]], "client": [WIN[2], WIN[3]]}
check("chat watching starts switched off, and the default watch list was written for the user to edit", not app.chat_on_var.get() and M.WATCH_PATH.exists()
      and len(app.watch_rules) == 6 and not app.watch_problems, (app.chat_on_var.get(), len(app.watch_rules)))
fr = app.worker.look(sct, clock[0] + 1); app.worker.read_chat(sct, fr, clock[0] + 1)
check("with chat watching off, the chat isn't read at all", fr.chat is None and app.worker.last_chat_img is None)
app.cfg["chat_region"] = spec
app.worker.chat_region = spec
app.chat_on_var.set(True); app.on_chat_toggle()
check("switching it on is remembered and passed to the reading thread", app.cfg["chat_on"] is True and app.worker.chat_on is True and M.load_config()["chat_on"] is True)
clock[0] += 5
fr = app.worker.look(sct, clock[0]); app.worker.read_chat(sct, fr, clock[0])
check("the worker reads the chat box from the screen: 5 messages, Yossi's among them", fr.chat is not None and len(fr.chat) == 5 and ("Yossi", "B>White Labels 650k !") == fr.chat[4][:2], fr.chat)
app.frames.put(fr); app.pump()
entries = app.market.entries()
check("only the offer on the watch list is kept: Yossi buying White Labels at 650k", [(e["name"], e["side"], e["item"], e["price"]) for e in entries] == [("Yossi", "B", "White label ring", 650_000)], entries)
check("the player is told about it", "White label ring" in app._event_msg and "650k" in app._event_msg and "Yossi" in app._event_msg, app._event_msg)
check("it reaches the saved file too", len(MK.MarketLog(M.MARKET_PATH).load()) == 1)
clock[0] += 5
fr = app.worker.look(sct, clock[0]); app.worker.read_chat(sct, fr, clock[0]); app.frames.put(fr); app.pump()
check("looking again at the same chat adds nothing (the same lines are not counted twice)", len(app.market.entries()) == 1 and app.market.entries()[0]["count"] == 1)
check("a chat picture that hasn't changed is not read again (saves the processor)", fr.chat is None)
app.market_all_var.set(True); app.on_market_all(); app.reset_chat()
clock[0] += 5
fr = app.worker.look(sct, clock[0]); app.worker.read_chat(sct, fr, clock[0]); app.frames.put(fr); app.pump()
names = sorted(e["name"] for e in app.market.entries())
check("with 'also keep other items' on, the other offers are kept as well (Pink Rabbit, Kumbi, Zard, Emerald Earrings ...)", len(names) >= 5 and "Hydrogen" in names and "YouDkMyStory" in names, names)
check("and the watch-list one is still just one entry (seen twice now)", [e["count"] for e in app.market.entries() if e["name"] == "Yossi"] == [2], [e for e in app.market.entries() if e["name"] == "Yossi"])
app.market_all_var.set(False); app.on_market_all()
spec_small = {"rel": spec["rel"], "client": [WIN[2] - 300, WIN[3]]}
app.worker.chat_region = spec_small; app.cfg["chat_region"] = spec_small
clock[0] += 5
fr = app.worker.look(sct, clock[0]); app.worker.read_chat(sct, fr, clock[0]); app.frames.put(fr); app.pump()
check("if the game window changes size after the chat area was chosen, it says so instead of reading the wrong place", fr.chat is None and fr.chat_state == "size_changed" and "select it again" in app.chat_status_text(), (fr.chat_state, app.chat_status_text()))
app.cfg["chat_region"] = spec; app.worker.chat_region = spec
app.clear_chat_area()
check("clearing the chat area stops reading it", app.worker.chat_region is None and "chat_region" not in M.load_config() and "not set" in app.chat_status_text())
app.cfg["chat_region"] = spec; app.worker.chat_region = spec; app.save_settings()
check("a chat area is saved in the settings and read back", M.load_config()["chat_region"] == spec)
bad_cfg = dict(M.load_config(), chat_region={"rel": [1, 2, 3], "client": "x"})
M.CONFIG_PATH.write_text(__import__("json").dumps(bad_cfg))
check("a damaged chat area in the settings file is dropped, not trusted", "chat_region" not in M.load_config())
app.save_settings()

app.show_market(); check("the Market window opens (and a second click doesn't open another)", app.market_win is not None); w1 = app.market_win; app.show_market(); check("... only one", app.market_win is w1)
app.edit_watch(); check("the watch-list editor opens", app.watch_win is not None)
M.WATCH_PATH.write_text("Gold ring = ring + gold\nBogus line\n", encoding="utf-8")
app.reload_watch()
check("a watch list with a bad line keeps the good rules and reports the bad one", [r.name for r in app.watch_rules] == ["Gold ring"] and len(app.watch_problems) == 1, (app.watch_rules, app.watch_problems))
M.WATCH_PATH.write_text(MK.DEFAULT_WATCH, encoding="utf-8"); app.reload_watch()
check("... and the proper list loads again", len(app.watch_rules) == 6)
app.show_teach(); check("the Teach window opens", app.teach_win is not None)
click(app, "market"); check("the Market button on the main window works", app.market_win is not None)

# teaching, as the Teach window does it, in a font the reader has never seen
FONT = SC.made_up_font(3)
keep_all, keep_user = app.glyphs, app.user_glyphs
app.glyphs, app.user_glyphs = CR.GlyphSet(), CR.GlyphSet(); app.worker.glyphs = app.glyphs
app.worker.last_chat_img = SC.draw_chat([("Hanna", s, ()) for s in app.TEACH_LINES], FONT, 2, "dark")
count, problems = app.teach_newest("Hanna")
check(f"'Learn from the newest 3 lines' teaches all {len(set(SC.ALL_CHARS))} characters from nothing", set(SC.ALL_CHARS) <= app.glyphs.chars() and not problems and count > 60, (count, problems, len(app.glyphs.chars())))
check("the reading thread is using the new letters, and they are saved in the data folder", app.worker.glyphs is app.glyphs and CR.GlyphSet().load(M.GLYPHS_USER_PATH).chars() >= set(SC.ALL_CHARS))
new_lines = SC.draw_chat([("Hanna", "B>Rower 700k", ()), ("Kuma", "S>[White] 60% PMO", ((3, 8),))], FONT, 2, "dark")
check("and brand-new text in that font is read exactly", [l.raw for l in CR.read_chat(new_lines, app.glyphs).lines] == ["Hanna : B>Rower 700k", "Kuma : S>[White] 60% PMO"])
chat_pic = CR.read_chat(app.worker.last_chat_img, app.glyphs)
learned, why = app.teach_line(chat_pic, 0, "Hanna : The quick brown fox jumps over the lazy cat")
check("a line typed with a mistake is refused and changes nothing", why and learned == [], (learned, why))
app.worker.last_chat_img = None
count, problems = app.teach_newest("Hanna")
check("no picture of the chat yet: the Teach window says so instead of failing", count == 0 and problems)
app.glyphs, app.user_glyphs = keep_all, keep_user; app.worker.glyphs = keep_all
M.GLYPHS_USER_PATH.unlink(missing_ok=True)
FakeSct.screen[:] = saved_screen
app.close_settings(); app.show_settings(); check("Settings has the new chat section and its status line", app.settings_win is not None and "Chat area" in app.chat_status_text()); app.close_settings()
app.chat_on_var.set(False); app.on_chat_toggle()
for w in ("market_win", "watch_win", "teach_win"): setattr(app, w, None)

print("6f) the market feed: the five newest offers on the watch list, replaced as new ones come in")
app.market.clear(); app.reset_chat()
app.chat_on_var.set(True); app.cfg["chat_region"] = spec; app.chat_state = "ok"
check("with nothing kept yet the feed is empty and says why", app.feed_view()["feed"] == [] and "Waiting for offers" in app.feed_view()["feed_empty"] and app.feed_view()["chat_kind"] == "go", app.feed_view())
OFFERS = [("A1", "S>Rower 100k"), ("A2", "B>White Labels 200k"), ("A3", "S>Lvl 50 crossbow 300k"), ("A4", "B>Shoe scroll for speed 60% 400k"),
          ("A5", "S>Rower 500k"), ("A6", "B>Crossbow att scroll 60% 600k")]
shown = []
for k in range(1, 7):
    app.process_chat([(n, tx, 0) for n, tx in OFFERS[:k]])
    shown.append([e["name"] for e in app.feed_view()["feed"]])
check("each new offer goes to the top of the feed", [x[0] for x in shown] == ["A1", "A2", "A3", "A4", "A5", "A6"], shown)
check("the feed never holds more than five: the sixth offer pushes the oldest (A1) off the bottom", shown[4] == ["A5", "A4", "A3", "A2", "A1"] and shown[5] == ["A6", "A5", "A4", "A3", "A2"], shown[4:])
f = app.feed_view()["feed"]
check("each row has the side, the item, the price, the player and how long ago", f[0] == {"side": "B", "item": "Crossbow attack scroll 60%", "price": "600k", "name": "A6", "ago": "now", "count": 1}, f[0])
check("... and everything is also in the history (all six kept, none lost when the feed moved on)", len(app.market.entries()) == 6 and len(MK.MarketLog(M.MARKET_PATH).load()) == 6)
app.process_chat([("A1", "S>Rower 100k", 0), ("A9", "S>Pink Rabbit Puppet 5m", 0)])
check("an offer seen again moves back to the top (and shows how many times)", app.feed_view()["feed"][0]["name"] == "A1" and app.feed_view()["feed"][0]["count"] == 2, app.feed_view()["feed"][0])
check("offers for items NOT on the watch list stay out of the feed (they only go to the history, if that is turned on)", all(e["name"] != "A9" for e in app.feed_view()["feed"]))
app.market_all_var.set(True); app.process_chat([("B1", "S>Emerald Earrings 1m", 0)]); app.market_all_var.set(False)
check("even with 'also keep other items' on, the feed shows only the watch list", all(e["name"] != "B1" for e in app.feed_view()["feed"]) and any(e["name"] == "B1" for e in app.market.entries()))
check("'how long ago' is written short: now / 45s / 3m / 2h / 1d", [app.ago(x) for x in (0, 15, 45, 100, 3600, 7200, 200000)] == ["now", "now", "45s", "2m", "60m", "2h", "2d"], [app.ago(x) for x in (0, 15, 45, 100, 3600, 7200, 200000)])
app.chat_on_var.set(False); check("with chat reading off the feed says so", app.feed_view()["chat_text"] == "Chat reading is off" and app.feed_view()["chat_kind"] == "idle")
app.chat_on_var.set(True); app.cfg.pop("chat_region"); check("with no chat area chosen it says so", app.feed_view()["chat_text"] == "Choose the chat area" and app.feed_view()["chat_kind"] == "bad")
app.cfg["chat_region"] = spec; app.chat_state = "size_changed"; check("and if the game window changed size", "changed size" in app.feed_view()["chat_text"])
app.chat_state = ""
app.set_layout("market"); app.redraw()
check("the market layout draws the feed from the real data", len(app.view_state["feed"]) == 5 and app.view.render("market", app.view_state)[0].size == app.view.size("market", app.view_state))
app.set_layout("square"); app.chat_on_var.set(False); app.market.clear(); app.reset_chat()

print("6g) the market section on the main layout")
app.set_layout("square")
check("it is shown by default and the window is taller because of it", app.main_feed_var.get() and app.view_state["show_feed"] and app.view.size("square", app.view_state)[1] > app.view.size("square")[1], app.view_state.get("show_feed"))
app.chat_on_var.set(True); app.cfg["chat_region"] = spec; app.chat_state = "ok"; app.market.clear(); app.reset_chat()
app.process_chat([("A1", "S>Rower 100k", 0), ("A2", "B>White Labels 200k", 0)]); app.redraw()
check("the newest offers appear in the main layout's data (newest first)", [e["name"] for e in app.view_state["feed"]] == ["A2", "A1"], app.view_state["feed"])
check("the card is clickable: it opens the history", "history" in {r[0] for r in app._regions})
click(app, "history"); check("... and clicking it does open the history window", app.market_win is not None); app.market_win = None
h_with = app.view.size("square", app.view_state)[1]
app.main_feed_var.set(False); app.on_main_feed()
check("switching it off in Settings takes the section away (the window shrinks back) and is remembered", app.view_state["show_feed"] is False and app.view.size("square", app.view_state)[1] < h_with
      and "history" not in {r[0] for r in app._regions} and M.load_config()["main_feed"] is False, (app.view_state["show_feed"], M.load_config()["main_feed"]))
app.main_feed_var.set(True); app.on_main_feed()
check("and back on again", app.view_state["show_feed"] and M.load_config()["main_feed"] is True)
app.chat_on_var.set(False); app.market.clear(); app.reset_chat()

print("6h) every session is logged with its map")
M.LOG_PATH.write_text("[]")
app.tracker.pause(clock[0]); app.tracker.reset(); app.mesos.reset(); app.map_name = ""; app.map_var.set(""); app.cfg["recent_maps"] = []
app.set_layout("square"); app.redraw()
check("the main layout has a MAP line, and it says when no map is set", "map" in {r[0] for r in app._regions} and app.view_state["map"] == "", app.view_state.get("map"))
click(app, "toggle"); check("starting a session with no map reminds you to set one", "set the map" in app._event_msg, app._event_msg)
app.tracker.pause(clock[0]); app.tracker.reset()


def farm(seconds, exp0, level=47):
    """Farm for a while: readings every 1.5 s, 700 EXP every other reading."""
    xp = exp0
    for i in range(int(seconds / 1.5)):
        xp += 700 if i % 2 else 0
        look_at(xp)
    return xp
xp = farm(0, 372_741); click(app, "toggle")
xp = farm(30, xp)                                                # (under a minute: not worth a log line yet)
check("clicking MAP opens the map window", (click(app, "map"), app.map_win is not None)[1]); app.map_win = None
changed = app.set_map("Henesys Hunting Ground I")
check("setting the map when the session is still too short to log just sets it (no split, nothing logged, the session carries on)", changed and app.map_name == "Henesys Hunting Ground I" and app.log.load() == [] and app.tracker.running and app.tracker.gained > 0, (app.map_name, app.log.load()))
check("the map shows on the main layout", app.view_state["map"] == "Henesys Hunting Ground I")
xp = farm(180, xp)
a_exp = app.tracker.gained
check("a session is under way on this map", a_exp > 0 and app.tracker.elapsed(clock[0]) > 60)
check("setting the same map again changes nothing", app.set_map("Henesys Hunting Ground I") is False and app.tracker.gained == a_exp)
app.set_map("  Ant   Tunnel  II ")
log = app.log.load()
check("changing the map in the middle of a session saves that session under the OLD map", len(log) == 1 and log[0]["map"] == "Henesys Hunting Ground I" and log[0]["exp"] == a_exp and log[0]["seconds"] >= 100, log)
check("... and starts a new session for the new map (still running, numbers back to zero), with the name tidied", app.tracker.running and app.tracker.gained == 0 and app.map_name == "Ant Tunnel II", (app.tracker.gained, app.map_name))
check("the player is told what happened", "Saved the last session under" in app._event_msg and "Henesys Hunting Ground I" in app._event_msg and "Ant Tunnel II" in app._event_msg, app._event_msg)
xp = farm(240, xp)
b_exp = app.tracker.gained
click(app, "toggle")
log = app.log.load()
check("the second session is logged with the second map", [e["map"] for e in log] == ["Henesys Hunting Ground I", "Ant Tunnel II"] and log[1]["exp"] == b_exp, [(e["map"], e["exp"]) for e in log])
check("each session has only its own EXP (nothing is counted twice or mixed up)", log[0]["exp"] == a_exp and log[1]["exp"] == b_exp and log[0]["id"] != log[1]["id"])
check("recently used maps are remembered, newest first", app.cfg["recent_maps"] == ["Ant Tunnel II", "Henesys Hunting Ground I"], app.cfg["recent_maps"])
app.set_map("Henesys Hunting Ground I"); app.set_map("Mu Lung Garden")
check("the recent list moves a map back to the front when it is used again, and keeps at most 8", app.cfg["recent_maps"][:3] == ["Mu Lung Garden", "Henesys Hunting Ground I", "Ant Tunnel II"] and len(app.cfg["recent_maps"]) <= 8)
for i in range(12): app.set_map(f"Map {i}")
check("... (12 different maps later, still only 8)", len(app.cfg["recent_maps"]) == 8 and app.cfg["recent_maps"][0] == "Map 11")
check("the recent maps are saved in the settings file", M.load_config()["recent_maps"] == app.cfg["recent_maps"])
M.CONFIG_PATH.write_text(__import__("json").dumps(dict(M.load_config(), recent_maps=["ok", 5, None, "", "  ", "fine"])))
check("a damaged recent-maps list in the settings file is cleaned", M.load_config()["recent_maps"] == ["ok", "fine"], M.load_config()["recent_maps"])
app.set_map("")
check("'No map' clears it", app.map_name == "" and app.view_state["map"] == "" and "cleared" in app._event_msg.lower())
app.map_var.set("From Settings Map"); app.commit_map()
check("choosing the map in Settings does the same thing as the MAP line", app.map_name == "From Settings Map")
app.set_map("x" * 200)
check("an absurdly long map name is cut to 60 characters", len(app.map_name) == 60)
app.set_map("")
app.show_log(); check("the Log window opens (with its map filter and totals)", True)
sm = E.summarize([{"seconds": 3600, "exp": 3_600_000, "mesos": 100_000}, {"seconds": 1800, "exp": 900_000, "mesos": None}])
check("totals for a map: sessions, time, EXP and the average rate over all the time (not an average of averages)", sm == {"sessions": 2, "seconds": 5400, "exp": 4_500_000, "exp_per_hr": 3_000_000, "mesos": 100_000, "mesos_per_hr": 100_000}, sm)
check("totals of nothing don't divide by zero", E.summarize([]) == {"sessions": 0, "seconds": 0, "exp": 0, "exp_per_hr": None, "mesos": None, "mesos_per_hr": None})
app.tracker.reset(); app.mesos.reset(); app.map_name = ""; app.map_var.set("Henesys Hunting Ground I"); app.map_name = "Henesys Hunting Ground I"; M.LOG_PATH.write_text("[]")

print("6c) stress test: 1,500 random events thrown at the whole running app (readings, clicks, settings, themes, layouts, bad input)")
import random
rnd = random.Random(99)
logged = []
real_log_error = M.log_error
M.log_error = lambda what, exc=None: logged.append((what, repr(exc)[:100]))
STATUSES = ["ok"] * 12 + ["no_window", "minimized", "off_screen", "no_bar", "unclear", "error"]
SETTINGS_ACTIONS = ["toggle", "reset", "log", "settings", "layout", "close_not"]
lvl, xp = 47, 300_000
for i in range(1500):
    clock[0] += rnd.choice([0.3, 1.5, 1.5, 4, 25])
    r = rnd.random()
    try:
        if r < 0.45:                                                               # a reading from the screen
            f = M.Frame(clock[0]); f.status = rnd.choice(STATUSES); f.rect = WIN
            if f.status == "ok":
                xp = max(0, min(E.exp_needed(lvl) - 1, xp + rnd.choice([0, 0, 500, 900, -4000, 90000])))
                if rnd.random() < 0.03 and lvl < 98: lvl, xp = lvl + 1, rnd.randint(0, 100)
                pct = round(xp / E.exp_needed(lvl) * 100, 2)
                f.exp, f.pct, f.levels, f.gh = xp, pct, (E.levels_for(xp, pct) if rnd.random() > 0.05 else []), 8.0
                f.mesos = rnd.choice([None, None, 1_000_000 + i * 50, rnd.randint(0, 99_999_999)])
            f.title = rnd.choice(["MapleStory", "", "メイプル", "x" * 200])
            app.frames.put(f)
        elif r < 0.65:                                                             # a click on a button
            name = rnd.choice([n for n in ("toggle", "reset", "log", "settings", "layout", "market")])
            if any(rg[0] == name for rg in app._regions): click(app, name)
        elif r < 0.72: app.on_motion(Click(rnd.randint(0, 600), rnd.randint(0, 700)))
        elif r < 0.76: app.set_theme(rnd.choice(list(M.THEMES) + ["bogus"]))
        elif r < 0.80: app.set_layout(rnd.choice(list(M.LAYOUTS) + ["bogus"]))
        elif r < 0.83: app.actions.put(rnd.choice(["start", "reset", "compact", "nonsense"]))
        elif r < 0.87: app.level_entry_var.set(rnd.choice(["", "47", "0", "-5", "abc", "1e9", "99999999999999999999", "４７", " 48 ", "🍁"])); app._entry_dirty = True; app.commit_level()
        elif r < 0.90: app.gap_var.set(rnd.choice(["", "15", "0", "-1", "abc", "1e9", "30.7", "999999999999"])); app.commit_gap()
        elif r < 0.93: app.map_var.set(rnd.choice(["", "Henesys", "=SUM(1)", "x" * 500, "メイプル"])); app.commit_map()
        elif r < 0.95:
            app.window_var.set(rnd.choice([M.AUTO_CHOICE, "MapleStory", "Notepad", "Not Open", "メイプル", ""])); app.on_window_chosen()
        elif r < 0.97: app.on_area_button() if app.worker.mode == "region" else None
        elif r < 0.98: app.show_capture()
        elif r < 0.99: app.close_settings() if app.settings_win else app.show_settings()
        else: app.unlock_level()
        app.pump()
    except Exception as e:                                                          # noqa: BLE001
        logged.append(("the test itself caught", repr(e)[:150]))
M.log_error = real_log_error
check("1,500 random events later: nothing was logged as an error and nothing crashed", not logged, logged[:4])
check("the window still draws correctly afterwards", app.view.render(app.layout, app.view_state)[0].size == app.view.size(app.layout, app.view_state))
app.set_theme("gold"); app.set_layout("square")
if app.tracker.running: click(app, "toggle")
app.close_settings()
app.gap_var.set("30"); app.commit_gap(); app.map_var.set("Henesys Hunting Ground I"); app.commit_map()      # put the settings back for the checks that follow

print("6d) keeping the tracker light for the game")
import cv2 as _cv2
check("OpenCV is limited to one thread (no burst across every core)", _cv2.getNumThreads() == 1, _cv2.getNumThreads())
check("numpy's maths library is limited to one thread too", all(os.environ.get(n) == "1" for n in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS")))
check("lowering the priority is safe where it isn't available (returns False, no error)", winapi.lower_priority() is False)

print("7) settings survive a restart")
app.save_settings()
cfg = M.load_config()
check("settings file written and read back", cfg["gap_seconds"] == 30 and cfg["layout"] == "square" and cfg["opacity"] > 0.3, cfg)
M.CONFIG_PATH.write_text("{ this is not valid json")
check("a damaged settings file falls back to defaults", M.load_config()["gap_seconds"] == 15 and M.load_config()["layout"] == "square")

print("8) closing")
click(app, "close")
check("the close button closes cleanly", "destroyed" in _shown)

print("9) which files the program touched while all of that ran")
AUDIT["on"] = False
data, assets = os.path.realpath(str(M.DATA_DIR)), os.path.realpath(str(M.ASSETS))
exports = os.path.realpath(tempfile.gettempdir())
py = tuple(os.path.realpath(p) for p in {sys.prefix, sys.base_prefix, sys.exec_prefix, os.path.dirname(os.__file__)})
WRITE_FLAGS = os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND
writes, reads, stray = [], [], []
for path, mode, flags in AUDIT["opened"]:
    p = os.path.realpath(path)
    is_write = (isinstance(mode, str) and any(c in mode for c in "wax+")) or (isinstance(flags, int) and flags & WRITE_FLAGS)
    if p.startswith(py) or p.startswith(("/proc", "/sys", "/dev", "/usr", "/etc")) or "__pycache__" in p:
        continue                                              # Python and the system itself
    (writes if is_write else reads).append(p)
    if p.startswith((data, assets, exports, os.path.realpath(ROOT))):
        continue
    stray.append(p)
check(f"it wrote {len(writes)} file(s), all inside its own data folder or a file you chose to export", all(w.startswith((data, exports)) for w in writes), writes)
check(f"it read {len(reads)} file(s): only its own assets, data folder and program files", not stray, stray)
print("      writes:", sorted({os.path.relpath(w, data) if w.startswith(data) else "(export) " + os.path.basename(w) for w in writes}))
print("      fonts and digit pictures read from assets:", sorted({os.path.relpath(r, assets) for r in reads if r.startswith(assets)}))
print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
