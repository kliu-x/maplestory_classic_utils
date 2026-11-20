"""EXP maths for the Maple EXP Tracker: the level table, EXP/hr and mesos/hr trackers and the
session log. Nothing in here touches the screen, the network or Windows, so it can be tested on
its own.

The numbers are made up from what the screen reader hands in: current EXP and the % shown next
to it. The level is worked out from those two (each level needs a different amount of EXP).
"""

import csv
import json
import os
from collections import deque
from datetime import datetime

# EXP needed to finish each level in MapleStory Classic World (index 0 = level 1).
EXP_TABLE = [
    15, 34, 57, 92, 135, 372, 560, 840, 1242, 1716,
    2360, 3216, 4200, 5460, 7050, 8840, 11040, 13716, 16680, 20216,
    24402, 28980, 34320, 40512, 47216, 54900, 63666, 73080, 83720, 95700,
    108480, 122760, 138666, 155540, 174216, 194832, 216600, 240500, 266682, 294216,
    324240, 356916, 391160, 428280, 468450, 510420, 555680, 604416, 655200, 709716,
    748608, 789631, 832902, 878545, 926689, 977471, 1031036, 1087536, 1147132, 1209994,
    1276301, 1346242, 1420016, 1497832, 1579913, 1666492, 1757815, 1854143, 1955750, 2062925,
    2175973, 2295216, 2420993, 2553663, 2693603, 2841212, 2996910, 3161140, 3334370, 3517093,
    3709829, 3913127, 4127566, 4353756, 4592341, 4844001, 5109452, 5389449, 5684790, 11938059,
    25069923, 52646838, 110558359, 232172553, 487562361, 1023880958, 2150150011, 4515315023, 9482161548,
]
MAX_LEVEL = len(EXP_TABLE)


def exp_needed(level):
    """EXP needed to finish `level`, or None for a level the table doesn't have."""
    return EXP_TABLE[level - 1] if level and 1 <= level <= MAX_LEVEL else None


def levels_for(exp, pct):
    """The levels whose EXP requirement fits `exp` being `pct`% of the level. (The game shows
    the % with 2 decimals, so the match has to allow for that rounding.) Empty when the % is
    too small to tell levels apart."""
    if pct < 0.2:
        return []
    need_est, err = exp / (pct / 100), 0.002 + 0.01 / pct
    return [lv for lv, need in enumerate(EXP_TABLE, start=1) if abs(need_est - need) <= err * need and exp < need]


def fits_exp_table(exp, pct):
    """True when exp at pct% matches some level. A misread digit almost never does, so a reading
    that doesn't fit isn't trusted. (Under 0.2% there is too little EXP to check.)"""
    return pct < 0.2 or bool(levels_for(exp, pct))


# --------------------------------------------------------------------------- formatting
def fmt_int(v, signed=False):
    if v is None:
        return "--"
    return f"{int(round(v)):+,}" if signed else f"{int(round(v)):,}"


def fmt_time(seconds):
    if seconds is None:
        return "--"
    seconds = int(seconds)
    d, rem = divmod(seconds, 86400)
    h, rem = divmod(rem, 3600)
    m, s = divmod(rem, 60)
    if d:
        return f"{d}d {h}h"
    return f"{h}h {m:02d}m" if h else f"{m}m {s:02d}s"


def fmt_eta(seconds):
    """'2 h 06 min' style, for 'Lv 48 in 2 h 06 min'."""
    if seconds is None:
        return "--"
    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds} s"
    if seconds < 3600:
        return f"{seconds // 60} min"
    if seconds < 86400:
        return f"{seconds // 3600} h {seconds % 3600 // 60:02d} min"
    return f"{seconds // 86400} d {seconds % 86400 // 3600} h"


def fmt_hms(seconds):
    seconds = int(seconds or 0)
    return f"{seconds // 3600:02d}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"


# --------------------------------------------------------------------------- EXP tracker
class ExpTracker:
    """Turns a stream of (EXP, %) readings into EXP/hr, time to level and so on.

    * Time only counts while EXP is coming in: after `gap` seconds without a gain it pauses by
      itself, and carries on at the next gain (so breaks don't drag EXP/hr down).
    * Levelling up (the bar wraps round) is counted properly.
    * EXP lost by dying is reported but isn't taken off EXP/hr.
    * A reading that looks odd (EXP going down, a level change, a huge jump) has to be seen
      twice in a row before it counts, so a one-off misread can't spoil the numbers.
    """

    ROLLING = 300.0          # seconds of active time behind the "last 5 min" rate
    MIN_SECONDS = 30.0       # no rates before this much active time
    BIG_JUMP = 0.25          # a gain bigger than this share of a level needs confirming

    def __init__(self, gap=15.0):
        self.gap = float(gap)
        self.reset()

    # ---- control
    def reset(self):
        self.running = False                 # the user pressed Start
        self.level = self.exp = self.pct = None          # what is on screen now
        self.ref_level = self.ref_exp = None             # the last reading that counted
        self.start_level = None
        self.levelups = 0
        self.gained = 0
        self.gained_pct = 0.0                # gains as % of the level they were earned in
        self.lost = 0
        self.acc = 0.0                       # active seconds in finished stretches
        self.seg_start = None                # when the current stretch of EXP gains began
        self.last_gain = None
        self.last_read = None
        self.samples = deque()               # (active seconds, gained, gained_pct) at each gain
        self.intervals = deque(maxlen=20)    # recent seconds between gains: how long the clock runs on after the last one
        self.pending = None
        self.note = ""
        self.started_at = None               # wall-clock time of the first Start

    def start(self, now):
        if not self.running:
            self.running = True
            self.started_at = self.started_at or datetime.now()
            self.note = "Waiting for EXP..."

    def pause(self, now):
        if self.running:
            self._close_segment(now)
            self.running = False

    @property
    def auto_paused(self):
        return self.running and self.seg_start is None

    def set_gap(self, gap):
        self.gap = max(1.0, float(gap))

    # ---- time
    def tick(self, now):
        """Call regularly: pauses by itself once EXP has stopped coming in."""
        if self.running and self.seg_start is not None and now - self.last_gain > self.gap:
            self._close_segment(now)

    def _tail(self):
        """How long the clock runs on after the last EXP gain: about one typical gap between gains (the time the
        next kill was 'due'), never more than the pause setting. Counting that one gap, and no more, is what keeps
        EXP/hr honest, and because elapsed() and the auto-pause use the same number the clock never jumps back."""
        if len(self.intervals) >= 3:
            ordered = sorted(self.intervals)
            typical = ordered[len(ordered) // 2]
        else:
            typical = 3.0
        return min(self.gap, max(2.0, 1.5 * typical))

    def _close_segment(self, now):
        if self.seg_start is not None:
            end = min(now, self.last_gain + self._tail())
            self.acc += max(0.0, end - self.seg_start)
            self.seg_start = None

    def elapsed(self, now):
        if self.seg_start is None:
            return self.acc
        return self.acc + max(0.0, min(now, self.last_gain + self._tail()) - self.seg_start)

    # ---- readings
    def _pick_level(self, cands, override, exp, pct):
        """Which level this reading belongs to, or None."""
        if override:
            # The level typed in has to agree with the % on screen (or the % has to be too small to
            # tell). One level up is fine: that is what a level-up looks like.
            if override in cands or (not cands and pct < 0.2 and exp < (exp_needed(override) or 0)):
                return override
            if override + 1 in cands:
                return override + 1
            return None
        if len(cands) == 1:
            return cands[0]
        prev = self.ref_level
        if prev:
            for lv in (prev, prev + 1, prev - 1):       # most likely first
                if lv in cands:
                    return lv
            if not cands and pct < 0.2:
                # Too little EXP to tell levels apart. Right after the bar wrapped round, that
                # means a level-up; otherwise we are still on the same level.
                need = exp_needed(prev)
                if need and self.ref_exp is not None and self.ref_exp > 0.5 * need and exp_needed(prev + 1):
                    return prev + 1
                if need and exp < need:
                    return prev
        return cands[0] if cands else None

    def observe(self, now, exp, pct, cands, override=None):
        """One reading from the screen. `cands` are the levels that fit it (see levels_for).
        Returns a list of short messages about anything notable (level-ups, deaths...)."""
        events = []
        prev_read = self.last_read
        level = self._pick_level(cands, override, exp, pct)
        if level is None:
            self.note = ("That EXP doesn't fit the level you set." if override
                         else "Can't tell which level this is yet.")
            self.last_read = now
            return events
        self.level, self.exp, self.pct = level, exp, pct
        self.note = ""

        if self.ref_level is None:                       # the very first reading
            self.ref_level, self.ref_exp, self.start_level = level, exp, level
            self.last_read = now
            return events

        need_prev = exp_needed(self.ref_level)
        change = None                                    # (kind, gained, lost, gain_pct)
        if level == self.ref_level:
            d = exp - self.ref_exp
            if d == 0:
                self.pending = None
                self.last_read = now
                return events
            if d > 0:
                change = ("gain", d, 0, d / need_prev * 100)
                if d > self.BIG_JUMP * need_prev:
                    change = ("big",) + change[1:]
            else:
                change = ("loss", 0, -d, 0.0)
        elif level == self.ref_level + 1:
            g = (need_prev - self.ref_exp) + exp
            change = ("levelup", g, 0, (need_prev - self.ref_exp) / need_prev * 100 + exp / exp_needed(level) * 100)
        elif level == self.ref_level - 1:
            change = ("leveldown", 0, self.ref_exp + (exp_needed(level) - exp), 0.0)
        else:
            change = ("jump", 0, 0, 0.0)

        kind = change[0]
        if kind != "gain":                               # anything unusual: see it twice first
            key = (level, exp)
            if self.pending != key:
                self.pending = key
                self.last_read = now
                return events
        self.pending = None

        _, g, lost, gpct = change
        if kind == "levelup":
            events.append(f"Level up! Now level {level}.")
            if self.running:
                self.levelups += 1
        elif kind == "leveldown":
            events.append(f"Level lost. Now level {level}.")
        elif kind == "jump":
            events.append(f"Level changed to {level} (not counted).")
        if lost and kind in ("loss", "leveldown"):
            events.append(f"Lost {lost:,} EXP.")
            if self.running:
                self.lost += lost
        if g and self.running:
            self._count_gain(now, prev_read, g, gpct)
        self.ref_level, self.ref_exp = level, exp
        self.last_read = now
        return events

    def _count_gain(self, now, prev_read, g, gpct):
        if self.seg_start is None:                       # EXP is coming in again: a new stretch
            self.seg_start = prev_read if prev_read is not None and now - prev_read <= self.gap else now
        elif self.last_gain is not None and now - self.last_gain <= self.gap:
            self.intervals.append(now - self.last_gain)
        self.last_gain = now
        self.gained += g
        self.gained_pct += gpct
        self.samples.append((self.elapsed(now), self.gained, self.gained_pct))
        horizon = self.elapsed(now) - self.ROLLING - 60
        while len(self.samples) > 2 and self.samples[1][0] < horizon:
            self.samples.popleft()

    # ---- numbers for the screen
    def _at(self, t):
        """(gained, gained_pct) as of active time t."""
        best = (0, 0.0)
        for st, g, gp in self.samples:
            if st <= t:
                best = (g, gp)
            else:
                break
        return best

    def stats(self, now):
        el = self.elapsed(now)
        need = exp_needed(self.level)
        left = max(0, need - self.exp) if (need and self.exp is not None) else None
        session = recent = pct_hr = recent_pct_hr = None
        if el >= self.MIN_SECONDS:
            session = self.gained / el * 3600
            pct_hr = self.gained_pct / el * 3600
            window = min(el, self.ROLLING)
            if window >= self.MIN_SECONDS:
                g0, p0 = self._at(el - window)
                recent = (self.gained - g0) / window * 3600
                recent_pct_hr = (self.gained_pct - p0) / window * 3600
        rate = recent if recent is not None else session
        eta = left / rate * 3600 if (left is not None and rate and rate > 0) else None
        return {
            "level": self.level, "exp": self.exp, "pct": self.pct, "need": need, "left": left,
            "gained": self.gained, "lost": self.lost, "elapsed": el, "levelups": self.levelups,
            "start_level": self.start_level, "session": session, "recent": recent,
            "pct_hr": pct_hr, "recent_pct_hr": recent_pct_hr, "eta": eta, "rate": rate,
            "running": self.running, "auto_paused": self.auto_paused, "note": self.note,
        }


# --------------------------------------------------------------------------- mesos
class MesosTracker:
    """Mesos picked up, from the amount read off the inventory. A new amount has to be read twice
    in a row before it counts (a misread digit shows up once, not twice), and mesos you spend
    are simply forgotten rather than taken off."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.last = None
        self.pending = None
        self.gained = 0
        self.last_seen = None            # when the amount was last read

    def observe(self, now, value, counting=True):
        self.last_seen = now
        if self.last is None:
            self.last = value
            return
        if value == self.last:
            self.pending = None
            return
        if self.pending != value:
            self.pending = value
            return
        self.pending = None
        if value > self.last and counting:
            self.gained += value - self.last
        self.last = value

    def per_hour(self, elapsed):
        return self.gained / elapsed * 3600 if elapsed >= ExpTracker.MIN_SECONDS else None


# --------------------------------------------------------------------------- log
def summarize(entries):
    """Totals over a set of log lines (for example all the sessions on one map): how many, how long, how much EXP and mesos,
    and the average rates over all that time (not an average of averages, so a long session counts for more)."""
    seconds = sum(max(0, x.get("seconds") or 0) for x in entries)
    exp = sum(x.get("exp") or 0 for x in entries)
    with_mesos = [x for x in entries if x.get("mesos") is not None]
    mesos_seconds = sum(max(0, x.get("seconds") or 0) for x in with_mesos)
    mesos = sum(x.get("mesos") or 0 for x in with_mesos)
    return {"sessions": len(entries), "seconds": seconds, "exp": exp,
            "exp_per_hr": int(exp / seconds * 3600) if seconds > 0 else None,
            "mesos": mesos if with_mesos else None, "mesos_per_hr": int(mesos / mesos_seconds * 3600) if mesos_seconds > 0 else None}


class SessionLog:
    """Finished stretches of farming, kept in a small JSON file (one line per session)."""

    def __init__(self, path):
        self.path = path

    def load(self):
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                data = json.load(f)
            # only well-formed lines: a hand-edited or damaged file must not break the Log window
            return [x for x in data if isinstance(x, dict) and isinstance(x.get("id"), str)] if isinstance(data, list) else []
        except Exception:
            return []

    def save(self, entries):
        tmp = self.path + ".tmp"
        try:
            os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(entries, f, indent=1)
            os.replace(tmp, self.path)           # never leaves a half-written file
        except Exception:
            pass

    def upsert(self, entry):
        entries = [e for e in self.load() if e.get("id") != entry["id"]] + [entry]
        self.save(entries)

    def delete(self, ids):
        self.save([e for e in self.load() if e.get("id") not in set(ids)])

    def rename_map(self, ids, name):
        entries = self.load()
        for e in entries:
            if e.get("id") in set(ids):
                e["map"] = name
        self.save(entries)

    @staticmethod
    def _cell(value):
        """A CSV cell that a spreadsheet will show as text: text starting with = + - @ would be run as a formula."""
        if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
            return "'" + value
        return value

    def export_csv(self, path):
        entries = self.load()
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["started", "map", "level_start", "level_end", "minutes", "exp_gained", "exp_per_hr",
                        "pct_per_hr", "levelups", "mesos_gained", "mesos_per_hr"])
            for e in entries:
                w.writerow([e.get("id"), self._cell(e.get("map", "")), e.get("level_start"), e.get("level_end"),
                            round(e.get("seconds", 0) / 60, 1), e.get("exp"), e.get("exp_per_hr"),
                            e.get("pct_per_hr"), e.get("levelups"), e.get("mesos"), e.get("mesos_per_hr")])
        return len(entries)


def session_entry(tracker, mesos, now, map_name=""):
    """One log line for the session so far, or None when there is too little to log."""
    el = tracker.elapsed(now)
    if el < 60 or tracker.gained <= 0 or tracker.started_at is None:
        return None
    s = tracker.stats(now)
    return {
        "id": tracker.started_at.strftime("%Y-%m-%d %H:%M:%S"),
        "map": map_name or "",
        "level_start": tracker.start_level, "level_end": tracker.level,
        "seconds": int(el), "exp": int(tracker.gained),
        "exp_per_hr": int(tracker.gained / el * 3600),
        "pct_per_hr": round(s["pct_hr"], 2) if s["pct_hr"] is not None else None,
        "levelups": tracker.levelups,
        "mesos": int(mesos.gained) if mesos.last is not None else None,
        "mesos_per_hr": int(mesos.per_hour(el)) if (mesos.last is not None and mesos.per_hour(el) is not None) else None,
    }
