"""Tests for screen_reader.py (run: python tests/test_reader.py). Uses a real screenshot of the game's
EXP bar (tests/samples/exp_bar.png) plus pictures built from the shipped digit examples."""
import os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..")
sys.path.insert(0, ROOT)
import cv2, numpy as np
import screen_reader as S

ok = fail = 0
def check(name, cond, detail=""):
    global ok, fail
    if cond: ok += 1; print(f"  ok   {name}")
    else: fail += 1; print(f"  FAIL {name}  {detail}")

tpl = S.DigitTemplates.load(os.path.join(ROOT, "assets", "digits.npz"))
mtpl = S.DigitTemplates.load(os.path.join(ROOT, "assets", "mesos_digits.npz"))
bar = cv2.imread(os.path.join(HERE, "samples", "exp_bar.png"))
rng = np.random.default_rng(7)

print("1) the real EXP bar")
r = S.read_exp_bar(bar, tpl)
check("reads 372,741 [67.08%] and level 47", r.status == "ok" and (r.exp, r.pct, r.levels) == (372741, 67.08, [47]), r)

print("2) the bar somewhere inside a full 1280x720 window with clutter around it")
def window(bar_img, x, y, w=1280, h=720, noise=True):
    """A fake game window: dark scene + random sprites, with `bar_img` pasted at (x, y) if given."""
    bg = np.zeros((h, w, 3), np.uint8)
    bg[:] = rng.integers(10, 60, 3)                                  # dark scene
    if noise:
        for _ in range(60):                                          # random coloured rectangles (sprites, UI)
            x0, y0 = rng.integers(0, w - 60), rng.integers(0, h - 60)
            bg[y0:y0 + rng.integers(8, 50), x0:x0 + rng.integers(8, 90)] = rng.integers(0, 255, 3)
    if bar_img is not None:
        bg[y:y + bar_img.shape[0], x:x + bar_img.shape[1]] = bar_img
    return bg
strip_of = lambda win: win[int(win.shape[0] * (1 - S.SEARCH_STRIP)):]
fails = 0
for x in (0, 150, 600, 1100):
    for y in (560, 600, 680):
        win = window(bar, x, y)
        rr = S.read_exp_bar(strip_of(win), tpl)
        fails += not (rr.status == "ok" and rr.exp == 372741 and rr.pct == 67.08)
check("found and read correctly at 12 different positions on a cluttered screen", fails == 0, f"{fails} of 12 failed")

print("3) other window sizes (the whole window scaled, as the game would draw it)")
for scale, label in ((0.8, "small"), (1.0, "normal"), (1.5, "bigger"), (2.0, "large"), (3.0, "very large")):
    b = cv2.resize(bar, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA)
    W, H = (1920, 1080) if scale > 1.4 else (1280, 720)
    win = window(b, 40, H - b.shape[0] - 8, w=W, h=H)                  # the bar sits at the bottom of the window
    rr = S.read_exp_bar(strip_of(win), tpl)
    check(f"{label} window (x{scale})", rr.status == "ok" and rr.exp == 372741, rr.status)

print("4) it must say 'unclear' or 'no bar', never a wrong number")
tiny = cv2.resize(bar, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
rr = S.read_exp_bar(tiny, tpl); check("text too small to read -> not trusted", rr.status != "ok" or rr.exp == 372741, rr)
check("an empty scene -> no_bar", S.read_exp_bar(window(bar, 0, 0, noise=False)[300:420, 600:900] * 0, tpl).status == "no_bar")
check("a scene full of random clutter -> no number invented", all(S.read_exp_bar(strip_of(window(None, 0, 0)), tpl).status != "ok" for _ in range(20)))
# digits damaged: smudge one digit of the real bar, the reader must refuse rather than guess
dmg = bar.copy(); dmg[3:11, 44:50] = (128, 128, 128)
rr = S.read_exp_bar(dmg, tpl)
check("one digit smudged out -> never reports a wrong number", rr.status != "ok" or (rr.exp, rr.pct) == (372741, 67.08), (rr.status, rr.exp))

print("5) speed (the app reads about every 1.5 s)")
win = strip_of(window(bar, 300, 650)); t0 = time.time()
for _ in range(20): S.read_exp_bar(win, tpl)
ms = (time.time() - t0) / 20 * 1000; check(f"{ms:.0f} ms per read of a 1280-wide strip", ms < 150, ms)

print("6) mesos box (built from the shipped mesos digit examples: tests the plumbing, not real game pixels)")
from synth import mesos_window
for n in (7, 40, 158227, 1234567, 99_000_000, 2_048_576_123):
    got = S.read_mesos(mesos_window(n), 14.0, mtpl)
    check(f"mesos {n:,}", got == n, got)
import random
random.seed(5)
for gh in (11.0, 14.0, 18.0, 24.0):                              # other window sizes, random numbers
    good = wrong = 0
    for _ in range(40):
        n = random.choice([random.randint(0, 999), random.randint(1000, 999_999), random.randint(10**6, 10**9)])
        got = S.read_mesos(mesos_window(n, gh), gh, mtpl)
        good += got == n; wrong += (got is not None and got != n)
    check(f"digit height {gh:g}px: never a wrong number, at least 85% read ({good}/40)", wrong == 0 and good >= 34, (good, wrong))
check("no mesos box on screen -> None", S.read_mesos(np.full((720, 1280, 3), 40, np.uint8), 14.0, mtpl) is None)
bad = mesos_window(158227).copy(); bad[303:318, 600:640] = 255            # wipe out some digits
check("digits wiped out -> None, not a wrong number", S.read_mesos(bad, 14.0, mtpl) in (None,))

print("7) the map list (used for the pick-a-map drop-down)")
names = S.load_map_names(os.path.join(ROOT, "assets", "maps.txt"))
check("maps.txt loaded: hundreds of maps, with the towns flagged", len(names) > 400 and sum(names.values()) > 50, (len(names), sum(names.values())))
print(f"\n{ok} passed, {fail} failed"); sys.exit(1 if fail else 0)
