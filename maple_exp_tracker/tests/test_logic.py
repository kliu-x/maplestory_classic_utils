"""Tests for exp_tracker.py (run: python tests/test_logic.py). No game, screen or Windows needed."""
import os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import exp_tracker as E

def reading(level, exp):
    need = E.exp_needed(level); pct = round(exp / need * 100, 2)
    return exp, pct, E.levels_for(exp, pct)

class Sim:
    """Feeds readings to a tracker the way the app does: one reading every 1.5 s."""
    def __init__(self, level, exp, gap=15, start=True):
        self.t = 1000.0; self.level = level; self.exp = exp
        self.tr = E.ExpTracker(gap)
        self.ev = []
        self.read()                      # first reading = baseline
        if start: self.tr.start(self.t)
    def read(self, override=None):
        e, p, c = reading(self.level, self.exp)
        self.ev += self.tr.observe(self.t, e, p, c, override); self.tr.tick(self.t)
    def step(self, gain=0, seconds=1.5, n=1):
        for _ in range(n):
            self.t += seconds; self.exp += gain; self.read()
    def stats(self): return self.tr.stats(self.t)

ok = fail = 0
def check(name, cond, detail=""):
    global ok, fail
    if cond: ok += 1; print(f"  ok   {name}")
    else: fail += 1; print(f"  FAIL {name}  {detail}")

print("1) steady farming: +1,200 EXP every 3 s for 2 minutes at level 47")
s = Sim(47, 100_000)
for _ in range(40): s.step(0); s.step(1200)          # 80 readings = 120 s
st = s.stats()
check("gained = 40 x 1,200", st["gained"] == 48_000, st["gained"])
check("EXP/hr is about 1,200 x 1200 = 1.44M", abs(st["session"] - 1_440_000) < 60_000, st["session"])
check("time to level is a sane number", st["eta"] and 0 < st["eta"] < 10 * 3600, st["eta"])
check("left = need - exp", st["left"] == 555_680 - s.exp, st["left"])

print("2) auto-pause: nothing for 60 s, then farming again")
s = Sim(47, 100_000)
for _ in range(10): s.step(0); s.step(1200)          # 30 s active
before = s.stats()["elapsed"]
s.step(0, seconds=1.5, n=40)                         # 60 s idle (gap is 15 s)
idle = s.stats()
check("clock stopped while idle", abs(idle["elapsed"] - before) < 17, (before, idle["elapsed"]))
check("shows as auto-paused", idle["auto_paused"])
s.step(1200); s.step(0); s.step(1200)
after = s.stats()
check("resumed by itself", not after["auto_paused"] and after["elapsed"] > idle["elapsed"])
check("idle minute did not drag EXP/hr down", after["session"] > 0.8 * before_rate if (before_rate := before and (10 * 1200 / before * 3600)) else True, after["session"])

print("3) level-up: bar wraps round")
s = Sim(47, 555_000)
s.step(0); s.step(400, n=1)                           # 555,400
s.level, s.exp = 48, 600                              # next readings are at level 48
s.step(0, n=3)
st = s.stats()
check("level is now 48", st["level"] == 48, st["level"])
check("gain = what was left (280) + new EXP (600) + 400 earlier", st["gained"] == 400 + 280 + 600, st["gained"])
check("level-up counted once", st["levelups"] == 1, st["levelups"])
check("announced", any("Level up" in e for e in s.ev), s.ev)

print("4) level-up that lands under 0.2% (too little EXP to identify the level from the %)")
s = Sim(47, 555_000); s.step(0, n=2)
s.level, s.exp = 48, 90                               # 0.01%
s.step(0, n=3)
check("still resolves to level 48", s.stats()["level"] == 48, s.stats()["level"])

print("5) death: EXP drops, then farming carries on")
s = Sim(47, 300_000)
for _ in range(10): s.step(0); s.step(1000)
g = s.stats()["gained"]
s.exp -= 20_000; s.step(0, n=3)
st = s.stats()
check("loss reported, not subtracted from gains", st["lost"] == 20_000 and st["gained"] == g, (st["lost"], st["gained"], g))
s.step(1000); s.step(0); s.step(1000)
check("gains continue from the lower EXP", s.stats()["gained"] == g + 2000, s.stats()["gained"])

print("6) a single misread is ignored")
s = Sim(47, 300_000); s.step(1000); s.step(0)
good = s.exp; s.exp = 123_456; s.step(0)              # one bad reading...
s.exp = good; s.step(0, n=2)                          # ...then the real value again
check("gained is only the real 1,000", s.stats()["gained"] == 1000, s.stats()["gained"])
check("no loss recorded", s.stats()["lost"] == 0, s.stats()["lost"])

print("7) user pause: EXP earned while paused is not counted")
s = Sim(47, 300_000); s.step(1000); s.step(1000); g = s.stats()["gained"]
s.tr.pause(s.t); s.step(5000); s.step(0)
check("nothing added while paused", s.stats()["gained"] == g, s.stats()["gained"])
s.tr.start(s.t); s.step(700)
check("counting again after resume (only the new 700)", s.stats()["gained"] == g + 700, s.stats()["gained"])

print("8) EXP before pressing Start is not counted")
s = Sim(47, 300_000, start=False); s.step(5000); s.step(5000)
check("zero gained", s.stats()["gained"] == 0)
s.tr.start(s.t); s.step(300)
check("counts from Start", s.stats()["gained"] == 300)

print("9) the 'last 5 minutes' rate follows recent play, session rate follows the whole session")
s = Sim(47, 100_000)
for _ in range(100): s.step(0); s.step(500)           # 5 min of slow farming (500 per 3 s)
for _ in range(100): s.step(0); s.step(2000)          # 5 min of fast farming (2000 per 3 s)
st = s.stats()
check("recent rate ~ 2,000 x 1200 = 2.4M/hr", abs(st["recent"] - 2_400_000) < 150_000, st["recent"])
check("session rate in between", 1_000_000 < st["session"] < 2_000_000, st["session"])

print("10) a level typed in by hand")
s = Sim(47, 100_000)
e, p, c = reading(47, 110_000); s.ev += s.tr.observe(s.t + 1.5, e, p, c, override=47)
check("override accepted when it fits", s.tr.level == 47)
s.tr.observe(s.t + 3, e, p, c, override=60)
check("a level that cannot fit this EXP is refused with a message", "doesn't fit" in s.tr.note, s.tr.note)

print("11) mesos")
m = E.MesosTracker()
for v in (1000, 1000, 1500, 1500, 1700, 90_000, 1700, 1700, 400, 400):  # pickups, a one-off misread, then spending
    m.observe(0, v)
check("pickups counted (500 + 200), misread ignored, spending not subtracted", m.gained == 700, m.gained)

print("12) log file round trip + CSV")
d = tempfile.mkdtemp(); log = E.SessionLog(os.path.join(d, "log.json"))
s = Sim(47, 100_000)
for _ in range(60): s.step(0); s.step(1200)
mm = E.MesosTracker(); mm.observe(0, 100); mm.observe(0, 100); mm.observe(0, 5100); mm.observe(0, 5100)
entry = E.session_entry(s.tr, mm, s.t, "Test Map"); log.upsert(entry); log.upsert(entry)
check("one entry (upsert, not duplicate)", len(log.load()) == 1)
check("entry has EXP/hr and mesos", entry["exp_per_hr"] > 0 and entry["mesos"] == 5000, entry)
n = log.export_csv(os.path.join(d, "out.csv")); check("CSV exported", n == 1 and os.path.getsize(os.path.join(d, "out.csv")) > 50)
print("13) audit regressions: the clock never jumps back, nothing goes negative, accuracy holds")
import random
rng = random.Random(11)
back, neg, steps = 0, [], 0
for session in range(60):
    tr = E.ExpTracker(rng.choice([5, 15, 60])); tr.start(0); now, prev, level = 0.0, 0.0, rng.randint(1, 98); exp = rng.randint(0, E.exp_needed(level) // 2)
    for _ in range(300):
        now += rng.choice([0.5, 1.5, 4, 40])
        r = rng.random()
        if r < 0.5: exp = min(E.exp_needed(level) - 1, exp + rng.randint(0, 900))
        elif r < 0.55: exp = max(0, exp - rng.randint(0, 5000))
        need = E.exp_needed(level); pct = round(exp / need * 100, 2)
        cands = E.levels_for(exp, pct)
        if rng.random() < 0.04: cands = [rng.randint(1, 99)]               # the reader claims an impossible level
        tr.observe(now, exp, pct, cands); tr.tick(now); s = tr.stats(now); steps += 1
        back += tr.elapsed(now) + 1e-9 < prev; prev = tr.elapsed(now)
        for k in ("left", "eta", "session", "recent", "rate"):
            if s[k] is not None and s[k] < 0: neg.append((k, s[k]))
check(f"the 'time tracked' clock never goes backwards ({steps:,} readings, with idle spells)", back == 0, back)
check("'EXP left' and 'time to level' are never negative, even if the reader claims an impossible level", not neg, neg[:3])
def accuracy(breaks, seed):
    r = random.Random(seed); tr = E.ExpTracker(15); tr.start(0.0); now = 0.0; exp = 100000; nxt = r.uniform(0, 3); active = 0.0; idle = -1
    pc = lambda x: round(x / E.exp_needed(47) * 100, 2)
    tr.observe(now, exp, pc(exp), E.levels_for(exp, pc(exp))); bk = sorted(r.uniform(60, 1680) for _ in range(breaks)); b = 0
    while now < 1800:
        now += 1.5
        if b < len(bk) and now >= bk[b] and idle < 0: idle = now + 40; b += 1
        brk = now < idle
        if now >= idle: idle = -1
        if not brk:
            active += 1.5
            if now >= nxt: exp += 900; nxt = now + r.expovariate(1 / 3.0)
        tr.observe(now, exp, pc(exp), E.levels_for(exp, pc(exp))); tr.tick(now)
    return (tr.stats(now)["session"] - (exp - 100000) / active * 3600) / ((exp - 100000) / active * 3600) * 100
errs = [accuracy(b, s) for b in (0, 3, 8) for s in range(8)]
check(f"EXP/hr matches a known true rate (average error {sum(errs) / len(errs):+.1f}%, worst {max(errs, key=abs):+.1f}%)", abs(sum(errs) / len(errs)) < 3 and max(abs(x) for x in errs) < 6, errs)

print("14) audit regressions: the log survives damaged lines, and the CSV can't carry spreadsheet formulas")
d = tempfile.mkdtemp(); path = os.path.join(d, "log.json"); log = E.SessionLog(path)
open(path, "w").write('[{"id": "2026-01-01 10:00:00", "map": "ok", "seconds": 600}, 7, "text", {"no_id": 1}, {"id": 5}, null, {"id": "2026-01-02 10:00:00", "map": "=HYPERLINK(\\"http://x\\")"}]')
lines = log.load()
check("a damaged or hand-edited log keeps its good lines and drops the bad ones", [x["id"] for x in lines] == ["2026-01-01 10:00:00", "2026-01-02 10:00:00"], lines)
out = os.path.join(d, "o.csv"); log.export_csv(out); rows = open(out, encoding="utf-8-sig").read().splitlines()
check("a map name that starts with = + - @ is saved as text, not as a formula", any("'=HYPERLINK" in r for r in rows) and not any(r.split(",")[1:2] == ["=HYPERLINK"] for r in rows), rows)
print(f"\n{ok} passed, {fail} failed"); sys.exit(1 if fail else 0)
