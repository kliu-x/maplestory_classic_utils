"""The few Windows things the tracker needs, through ctypes (no extra packages).

Everything here is the kind of thing an Alt-Tab window switcher does:

  * list the open windows (their titles and where they are on screen), so you can pick the game;
  * the Shift+1/2/3 hotkeys (Windows "hot keys", the kind Discord and OBS use);
  * tell Windows to give real pixel positions on scaled displays, and a one-copy-at-a-time lock.

It also asks Windows to run this program at slightly lower priority than normal, so it never competes with the game.

What it does NOT do: it never opens the game's process, reads the game's files or memory, hooks the
keyboard or mouse, sends input to the game, or starts other programs. (The picture of the game comes
from a normal screen capture, in maple_tracker.py, the same as a screenshot tool.) The complete list of
Windows functions used is the _api(...) lines below; tests/test_external_only.py checks that list.

On anything other than Windows every function reports "not available", so the rest of the program can
still be tested.
"""

import ctypes
import os
import sys
import threading

IS_WINDOWS = sys.platform == "win32"
GAME_WINDOW_CLASS = "MapleStoryClass"

if IS_WINDOWS:
    from ctypes import wintypes

    _user32 = ctypes.WinDLL("user32", use_last_error=True)
    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    def _api(fn, restype, *argtypes):
        fn.restype, fn.argtypes = restype, list(argtypes)
        return fn

    # --- looking at windows (titles, size, position) ---
    _EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    _EnumWindows = _api(_user32.EnumWindows, wintypes.BOOL, _EnumWindowsProc, wintypes.LPARAM)
    _IsWindow = _api(_user32.IsWindow, wintypes.BOOL, wintypes.HWND)
    _IsWindowVisible = _api(_user32.IsWindowVisible, wintypes.BOOL, wintypes.HWND)
    _IsIconic = _api(_user32.IsIconic, wintypes.BOOL, wintypes.HWND)
    _GetClassName = _api(_user32.GetClassNameW, ctypes.c_int, wintypes.HWND, wintypes.LPWSTR, ctypes.c_int)
    _GetWindowText = _api(_user32.GetWindowTextW, ctypes.c_int, wintypes.HWND, wintypes.LPWSTR, ctypes.c_int)
    _GetWindowLong = _api(_user32.GetWindowLongW, ctypes.c_long, wintypes.HWND, ctypes.c_int)
    _GetClientRect = _api(_user32.GetClientRect, wintypes.BOOL, wintypes.HWND, ctypes.POINTER(wintypes.RECT))
    _ClientToScreen = _api(_user32.ClientToScreen, wintypes.BOOL, wintypes.HWND, ctypes.POINTER(wintypes.POINT))
    _GetForegroundWindow = _api(_user32.GetForegroundWindow, wintypes.HWND)
    _GetWindowThreadProcessId = _api(_user32.GetWindowThreadProcessId, wintypes.DWORD, wintypes.HWND,
                                     ctypes.POINTER(wintypes.DWORD))      # only reads a window's process NUMBER
    # --- this program's own priority (so the game always comes first) ---
    _GetCurrentProcess = _api(_kernel32.GetCurrentProcess, wintypes.HANDLE)
    _SetPriorityClass = _api(_kernel32.SetPriorityClass, wintypes.BOOL, wintypes.HANDLE, wintypes.DWORD)
    # --- one copy at a time ---
    _CreateMutex = _api(_kernel32.CreateMutexW, wintypes.HANDLE, wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR)
    # --- hotkeys ---
    _RegisterHotKey = _api(_user32.RegisterHotKey, wintypes.BOOL, wintypes.HWND, ctypes.c_int, wintypes.UINT, wintypes.UINT)
    _UnregisterHotKey = _api(_user32.UnregisterHotKey, wintypes.BOOL, wintypes.HWND, ctypes.c_int)
    _SetTimer = _api(_user32.SetTimer, ctypes.c_size_t, wintypes.HWND, ctypes.c_size_t, wintypes.UINT, ctypes.c_void_p)
    _GetMessage = _api(_user32.GetMessageW, wintypes.BOOL, ctypes.POINTER(wintypes.MSG), wintypes.HWND,
                       wintypes.UINT, wintypes.UINT)


def enable_dpi_awareness():
    """Use real screen pixels, so window positions, tkinter and screenshots all agree on scaled displays."""
    if not IS_WINDOWS:
        return
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


def lower_priority():
    """Ask Windows to run THIS program (and only this program) just below normal priority, so that if the PC is ever
    fully busy, the game gets the processor first and the tracker waits a moment. Returns True if Windows agreed."""
    if not IS_WINDOWS:
        return False
    try:
        return bool(_SetPriorityClass(_GetCurrentProcess(), 0x00004000))        # BELOW_NORMAL_PRIORITY_CLASS
    except Exception:
        return False


_mutex = None


def already_running(name="MapleExpTracker_single_copy"):
    """True if another copy of the tracker is already open (two copies would fight over the log)."""
    global _mutex
    if not IS_WINDOWS:
        return False
    _mutex = _CreateMutex(None, False, name)
    return ctypes.get_last_error() == 183              # ERROR_ALREADY_EXISTS (read right after the call)


# --------------------------------------------------------------------------- windows
def _text(fn, hwnd, size=256):
    buf = ctypes.create_unicode_buffer(size)
    fn(hwnd, buf, size)
    return buf.value


def window_exists(hwnd):
    return bool(IS_WINDOWS and hwnd and _IsWindow(hwnd))


def window_title(hwnd):
    return _text(_GetWindowText, hwnd) if window_exists(hwnd) else ""


def client_rect(hwnd):
    """(left, top, width, height) of the window's content area in screen pixels, or None (minimized etc.)."""
    if not window_exists(hwnd) or _IsIconic(hwnd):
        return None
    r, pt = wintypes.RECT(), wintypes.POINT(0, 0)
    if not _GetClientRect(hwnd, ctypes.byref(r)) or not _ClientToScreen(hwnd, ctypes.byref(pt)):
        return None
    if r.right < 100 or r.bottom < 100:
        return None
    return pt.x, pt.y, r.right, r.bottom


# Windows that belong to Windows itself, not to a program you would want to watch.
_SHELL_CLASSES = {"Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "NotifyIconOverflowWindow"}


def list_windows():
    """The open, visible, titled windows (like Alt-Tab shows): a list of (hwnd, title, class, area),
    biggest first. This program's own windows and Windows' taskbar/desktop are left out."""
    if not IS_WINDOWS:
        return []
    found, me = [], os.getpid()

    def check(hwnd, _):
        if not _IsWindowVisible(hwnd) or (_GetWindowLong(hwnd, -20) & 0x80):         # not a tool window
            return True
        title = _text(_GetWindowText, hwnd)
        cls = _text(_GetClassName, hwnd)
        if not title.strip() or cls in _SHELL_CLASSES:
            return True
        pid = wintypes.DWORD()
        _GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value == me:
            return True
        rect = client_rect(hwnd)
        if rect is None and not _IsIconic(hwnd):                                      # too small to be a program window
            return True
        found.append((hwnd, title, cls, rect[2] * rect[3] if rect else 0))
        return True

    _EnumWindows(_EnumWindowsProc(check), 0)
    return sorted(found, key=lambda w: -w[3])


def find_window_by_title(title):
    """The window to watch for a title you picked: an exact match first, then one starting with it,
    then one containing it. The biggest one wins when several match. None if it isn't open."""
    want = title.strip().lower()
    if not want:
        return None
    windows = list_windows()
    for test in (lambda t: t == want, lambda t: t.startswith(want), lambda t: want in t):
        for hwnd, name, _cls, _area in windows:                        # biggest first
            if test(name.strip().lower()):
                return hwnd
    return None


def find_game_window():
    """Automatic mode: the MapleStory game window (the biggest, if there are several), or None.
    It goes by the window's class name only. If your game isn't found this way, pick it from the list."""
    for hwnd, _title, cls, _area in list_windows():
        if cls == GAME_WINDOW_CLASS:
            return hwnd
    return None


def in_front(watched_hwnd=None):
    """True while the window being watched (or the game's window class, or this program) is in front."""
    if not IS_WINDOWS:
        return False
    hwnd = _GetForegroundWindow()
    if not hwnd:
        return False
    if watched_hwnd and hwnd == watched_hwnd:
        return True
    pid = wintypes.DWORD()
    _GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    return pid.value == os.getpid() or _text(_GetClassName, hwnd, 64) == GAME_WINDOW_CLASS


# --------------------------------------------------------------------------- hotkeys
DEFAULT_HOTKEYS = {"start": "Shift+1", "reset": "Shift+2", "compact": "Shift+3"}
_MODS = {"Ctrl": 0x2, "Alt": 0x1, "Shift": 0x4}          # MOD_CONTROL, MOD_ALT, MOD_SHIFT


def parse_hotkey(text):
    """'Shift+1' -> (modifiers, virtual key), or None. Takes Ctrl/Alt/Shift with a digit or letter, or an
    F key; a plain letter on its own is refused (it would stop you typing it)."""
    if not isinstance(text, str) or not text:
        return None
    *mods, key = text.split("+")
    if len(set(mods)) != len(mods) or any(m not in _MODS for m in mods):
        return None
    if len(key) == 1 and (key.isdigit() or "A" <= key <= "Z"):
        vk = ord(key)
    elif key[:1] == "F" and key[1:].isdigit() and 1 <= int(key[1:]) <= 12:
        vk = 0x70 + int(key[1:]) - 1
    else:
        return None
    if not mods and not key.startswith("F"):
        return None
    return sum(_MODS[m] for m in mods), vk


class Hotkeys:
    """Windows hot keys on their own thread. They are only switched on while the watched game window or
    the tracker is the window in front, so other programs can still use those keys (for example to type
    '!'). on_press(action) is called, from that thread, for each press. watched() gives the window being
    watched (or None)."""

    def __init__(self, on_press, watched=lambda: None):
        self.on_press, self.watched = on_press, watched
        self.problems = {}                              # action -> why it couldn't be used
        self._wanted, self._changed = {}, True
        self._lock = threading.Lock()
        self.available = IS_WINDOWS
        if IS_WINDOWS:
            threading.Thread(target=self._run, daemon=True).start()

    def set(self, keys, on=True):
        """keys: action -> 'Shift+1' (or '' for off)."""
        with self._lock:
            self._wanted = {a: parse_hotkey(k) for a, k in keys.items() if on and parse_hotkey(k)}
            self._changed = True

    def _run(self):
        msg, active, was_on = wintypes.MSG(), {}, None        # active: hotkey id -> action
        _SetTimer(None, 0, 250, None)                         # a WM_TIMER every 250 ms, to check what's in front
        while _GetMessage(ctypes.byref(msg), None, 0, 0) > 0:
            if msg.message == 0x0312:                         # WM_HOTKEY
                action = active.get(msg.wParam)
                if action:
                    try:
                        self.on_press(action)
                    except Exception:
                        pass
            elif msg.message == 0x0113:                       # WM_TIMER
                try:
                    on = in_front(self.watched())
                except Exception:
                    on = False
                with self._lock:
                    changed, wanted, self._changed = self._changed, dict(self._wanted), False
                if not changed and on == was_on:
                    continue
                for hid in active:
                    _UnregisterHotKey(None, hid)
                active, was_on = {}, on
                if on:
                    for hid, (action, (mods, vk)) in enumerate(wanted.items(), start=1):
                        if _RegisterHotKey(None, hid, mods | 0x4000, vk):       # MOD_NOREPEAT
                            active[hid] = action
                            self.problems.pop(action, None)
                        else:
                            self.problems[action] = "used by another program"
