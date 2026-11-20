"""What the chat means: who wants to buy or sell what, at what price, and which of it is on your watch list.

Text goes in and plain facts come out, so all of it can be tested without a screen:

  * parse_message()  "S>PMO,B>Two handed Axe Attack Scroll 60% 100k"  ->  two offers (a sale with no price, a purchase at 100k)
  * Watchlist        the items you care about, written as simple rules (see DEFAULT_WATCH)
  * ChatTracker      works out which chat lines are new since the last look (chat scrolls, so the same line is seen many times)
  * MarketLog        the offers that were kept, saved in your data folder, with CSV export
"""

import csv
import difflib
import json
import os
import re
import time
from datetime import datetime

DEFAULT_WATCH = """# Your watch list. One item per line:   Name = word + word + word - word
#   +  means "and" (all of these must appear);   /  separates alternatives;   - starts words that must NOT appear.
#   Letters don't need to match case, plurals are fine ("earring" matches "earrings"), and spaces are flexible
#   ("lvl 50" matches "lvl50"). Lines starting with # are ignored.
Rower = rower
Lvl 50 crossbow = crossbow/xbow/x-bow + lvl 50/lv 50/level 50/lvl.50/lv.50/l50 - scroll/scrl
Crossbow attack scroll 60% = crossbow/xbow/x-bow + attack/att/atk + scroll/scrl + 60
White label ring = white label/whitelabel/wl ring
Earring/Overall/Cape scroll for DEX/STR = earring/overall/cape + scroll/scrl + dex/str
Shoe scroll for speed 60% = shoe + scroll/scrl + speed/spd + 60
"""

SIDE_NAMES = {"B": "Buy", "S": "Sell"}
_MARKER = re.compile(r"(?<![A-Za-z0-9])(?P<side>[bBsS])\s*>|(?<![A-Za-z0-9])(?P<word>wtb|wts|buying|selling)(?![A-Za-z0-9])", re.I)
_PMO = re.compile(r"(?<![a-z0-9])(pmo|pm\s*(?:me|offers?)|dm\s*offers?|offers?)(?![a-z0-9])", re.I)
_EACH = re.compile(r"(?:(?<![a-z0-9])(?:ea|each|per\s*piece)|/\s*ea)(?![a-z0-9])", re.I)
_LINK = re.compile(r"\[([^\]]*)\]")
_NUMBER = re.compile(r"(?<![A-Za-z0-9.,])(?P<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?)\s*(?P<unit>k|m|b|mil|mill|million|mesos?|ms)?(?![A-Za-z0-9])", re.I)
_UNITS = {"k": 1_000, "m": 1_000_000, "mil": 1_000_000, "mill": 1_000_000, "million": 1_000_000, "b": 1_000_000_000}


# --------------------------------------------------------------------------- reading prices
def parse_amount(num, unit):
    """'2.5','m' -> 2_500_000;  '1,200,000','' -> 1_200_000;  '350','k' -> 350_000. None if it isn't a plausible price."""
    unit = (unit or "").lower()
    text = num
    if re.fullmatch(r"\d+,\d{1,2}", text) and unit in _UNITS:          # "1,5m" written the European way
        text = text.replace(",", ".")
    text = text.replace(",", "")
    try:
        value = float(text)
    except ValueError:
        return None
    if unit in _UNITS:
        value *= _UNITS[unit]
    elif unit in ("mesos", "meso", "ms", ""):
        pass
    result = int(round(value))
    if unit in _UNITS or unit in ("mesos", "meso", "ms"):
        return result if result > 0 else None
    return result if result >= 1000 else None                           # a bare small number (60, 50 ...) is not a price


def find_price(text):
    """The price in a piece of text: (amount, the text it was written as, (start, end)) or (None, '', None).
    Numbers that are percentages (60%), levels (lvl 50), quantities (x3, 3x, 5pcs) or part of a word are skipped."""
    for m in _NUMBER.finditer(text):
        after = text[m.end():m.end() + 2]
        before = text[max(0, m.start() - 6):m.start()].lower()
        if after.lstrip().startswith("%") or text[m.end(): m.end() + 1] == "%":
            continue
        if re.search(r"(lv|lvl|level|l)\.?\s*$", before):
            continue
        if re.search(r"(?:^|[^a-z])x\s*$", before) or re.match(r"\s*(x|pcs?|pieces?)(?![a-z])", text[m.end():], re.I) and not m.group("unit"):
            continue
        amount = parse_amount(m.group("num"), m.group("unit"))
        if amount is not None:
            return amount, m.group(0).strip(), (m.start(), m.end())
    return None, "", None


# --------------------------------------------------------------------------- offers
class Offer:
    """One buy or sell offer found in a chat message."""

    def __init__(self, name, side, item_text, price, price_text, pmo, each, raw):
        self.name, self.side, self.item_text = name, side, item_text
        self.price, self.price_text, self.pmo, self.each, self.raw = price, price_text, pmo, each, raw
        self.watch = ""                          # the name of the watch-list item it matches, if any

    def price_display(self):
        if self.price is not None:
            return format_price(self.price) + (" each" if self.each else "")
        return "PMO" if self.pmo else "-"

    def __repr__(self):
        return f"Offer({self.name!r}, {SIDE_NAMES[self.side]}, {self.item_text!r}, {self.price_display()}, watch={self.watch!r})"


def format_price(value):
    if value is None:
        return "-"
    for limit, suffix in ((1_000_000_000, "b"), (1_000_000, "m"), (1_000, "k")):
        if value >= limit:
            text = f"{value / limit:.2f}".rstrip("0").rstrip(".")
            return text + suffix
    return str(value)


def parse_message(name, message):
    """All the buy/sell offers in one chat message. A clause starts at B> or S> (or wtb / wts / buying / selling) and
    runs to the next one; an item link before the first marker (like [Zard] S>PMO) belongs to the first clause."""
    marks = list(_MARKER.finditer(message))
    if not marks:
        return []
    offers, prefix = [], message[:marks[0].start()]
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(message)
        body = message[m.end():end]
        raw = (m.group(0) + body).strip(" ,;")
        if m.group("side"):
            side = m.group("side").upper()
        else:
            side = "B" if m.group("word").lower() in ("wtb", "buying") else "S"
        links = list(_LINK.findall(body)) + (list(_LINK.findall(prefix)) if i == 0 else [])
        amount, price_text, span = find_price(body)
        pmo = bool(_PMO.search(body))
        each = bool(_EACH.search(body))
        item = body
        if span:
            item = item[:span[0]] + " " + item[span[1]:]
        item = _PMO.sub(" ", item)
        item = _EACH.sub(" ", item)
        item = re.sub(r"[\[\]!*~]+", " ", item)
        item = re.sub(r"\s+", " ", item).strip(" ,;.-:")
        item_text = " ".join(x for x in [*links, item] if x).strip()
        offers.append(Offer(name, side, item_text, amount, price_text, pmo, each, raw))
    return offers


# --------------------------------------------------------------------------- the watch list
class WatchRule:
    def __init__(self, name, must, must_not):
        self.name, self.must, self.must_not = name, must, must_not          # lists of lists of regexes (alternatives)

    @staticmethod
    def _regex(word):
        word = word.strip().lower()
        if not word:
            return None
        return re.compile(r"(?<![a-z0-9])" + re.escape(word).replace(r"\ ", r"\s*").replace(r"\-", r"[\s\-]?") + r"s?(?![a-z0-9])")

    def matches(self, text):
        text = text.lower()
        if not all(any(rx.search(text) for rx in group) for group in self.must):
            return False
        return not any(any(rx.search(text) for rx in group) for group in self.must_not)


def _groups(spec):
    """'a/b + c' -> [[regex a, regex b], [regex c]]: every group must be found, any one alternative in a group will do."""
    groups = []
    for term in re.split(r"\s*\+\s*", spec):
        alts = [WatchRule._regex(a) for a in term.split("/")]
        alts = [a for a in alts if a is not None]
        if alts:
            groups.append(alts)
    return groups


def parse_watch(text):
    """The watch list file -> (rules, problems). A line that can't be understood is reported, not silently skipped."""
    rules, problems = [], []
    for n, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            problems.append(f"Line {n}: expected  Name = words  but found: {line[:40]}")
            continue
        name, _, spec = line.partition("=")
        name = name.strip()
        parts = re.split(r"\s-\s", spec.strip(), maxsplit=1)             # "words + words  -  words that must not appear"
        required, excluded = parts[0], (parts[1] if len(parts) > 1 else "")
        groups = _groups(required)
        bad = _groups(excluded)
        if not name or not groups:
            problems.append(f"Line {n}: the item needs a name and at least one word to look for")
            continue
        rules.append(WatchRule(name, groups, bad))
    return rules, problems


def watch_match(rules, text):
    """The name of the first watch-list item that this text is about, or ''."""
    for rule in rules:
        if rule.matches(text):
            return rule.name
    return ""


# --------------------------------------------------------------------------- which lines are new
def _norm(line):
    return re.sub(r"\s+", " ", f"{line[0]} : {line[1]}".lower()).strip()


def _same(a, b):
    return a == b or difflib.SequenceMatcher(None, a, b).ratio() >= 0.88


class ChatTracker:
    """The chat box is looked at over and over; lines scroll up as new ones arrive. This works out which lines are
    new by finding where the last look continues into this one, so each line is handled once."""

    def __init__(self):
        self.prev = []

    def update(self, lines):
        """lines: [(name, message)] top to bottom. Returns the ones not seen in the last look."""
        cur = [_norm(x) for x in lines]
        new = list(range(len(lines)))
        if self.prev:
            for shift in range(len(self.prev)):
                overlap = self.prev[shift:]
                if len(overlap) <= len(cur) and all(_same(p, c) for p, c in zip(overlap, cur)):
                    new = list(range(len(overlap), len(lines)))
                    break
        self.prev = cur
        return [lines[i] for i in new]


# --------------------------------------------------------------------------- the saved list
class MarketLog:
    MAX = 5000
    MERGE_SECONDS = 600

    def __init__(self, path):
        self.path = str(path)
        self._cache, self._dirty = None, False

    def entries(self):
        """The saved offers (kept in memory after the first look, so a busy chat doesn't re-read the file every time)."""
        if self._cache is None:
            self._cache = self.load()
        return self._cache

    def flush(self):
        if self._dirty:
            self.save(self.entries())
            self._dirty = False

    def load(self):
        try:
            with open(self.path, encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            return []
        return [x for x in data if isinstance(x, dict) and isinstance(x.get("id"), str)] if isinstance(data, list) else []

    def save(self, entries):
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(entries[-self.MAX:], f, ensure_ascii=False, indent=1)
        os.replace(tmp, self.path)

    def add(self, offer, now=None, save=True):
        """Keep an offer. The same player offering the same thing at the same price again within ten minutes is one
        entry that is seen again (count goes up), not a new line. Returns (entry, is_new).
        save=False leaves the writing to flush(), for adding several in a row."""
        now = time.time() if now is None else now
        entries = self.entries()
        item = (offer.watch or offer.item_text).lower()
        for e in reversed(entries):
            if now - e.get("last_ts", 0) > self.MERGE_SECONDS:
                break
            if (e.get("name", "").lower() == offer.name.lower() and e.get("side") == offer.side and e.get("item", "").lower() == item
                    and e.get("price") == offer.price and bool(e.get("pmo")) == bool(offer.pmo)):
                e["count"] = e.get("count", 1) + 1
                e["last"], e["last_ts"] = datetime.fromtimestamp(now).strftime("%H:%M:%S"), now
                self._dirty = True
                if save:
                    self.flush()
                return e, False
        stamp = datetime.fromtimestamp(now).strftime("%Y-%m-%d %H:%M:%S")
        ids = {e["id"] for e in entries}
        eid, k = stamp, 1
        while eid in ids:
            k += 1
            eid = f"{stamp}#{k}"
        entry = {"id": eid, "ts": now, "last_ts": now, "last": stamp[11:], "count": 1, "name": offer.name, "side": offer.side,
                 "item": offer.watch or offer.item_text, "watched": bool(offer.watch), "item_text": offer.item_text,
                 "price": offer.price, "price_text": offer.price_text, "pmo": offer.pmo, "each": offer.each, "raw": offer.raw}
        entries.append(entry)
        if len(entries) > self.MAX:
            del entries[:len(entries) - self.MAX]
        self._dirty = True
        if save:
            self.flush()
        return entry, True

    def delete(self, ids):
        ids = set(ids)
        self._cache = [e for e in self.entries() if e["id"] not in ids]
        self._dirty = True
        self.flush()

    def clear(self):
        self._cache, self._dirty = [], True
        self.flush()

    def export_csv(self, path):
        entries = list(self.entries())
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["First seen", "Last seen", "Times seen", "Side", "Player", "Item", "Price", "Price (number)", "PMO", "Each", "Message"])
            for e in entries:
                w.writerow([e["id"], e.get("last", ""), e.get("count", 1), SIDE_NAMES.get(e.get("side"), ""), _cell(e.get("name", "")),
                            _cell(e.get("item", "")), format_price(e.get("price")) if e.get("price") is not None else ("PMO" if e.get("pmo") else ""),
                            e.get("price") if e.get("price") is not None else "", "yes" if e.get("pmo") else "", "yes" if e.get("each") else "",
                            _cell(e.get("raw", ""))])
        return len(entries)


def _cell(value):
    """Text a spreadsheet will show as text: text starting with = + - @ would otherwise be run as a formula."""
    return "'" + value if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r") else value
