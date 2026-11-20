"""Tests for the chat reader (chat_reader.py) and the market side (market.py).  Run: python tests/test_chat.py

Part 1 uses plain text (no pictures): what an offer is, prices, the watch list, which lines are new, the saved log.
Part 2 reads pictures: your real screenshot, the same chat at other game sizes / cut at odd offsets / recoloured,
brand-new chat lines drawn from the real letter shapes, teaching, and random garbage that must never crash it."""

import os
import random
import re
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, ROOT)
import numpy as np
from PIL import Image

import chat_reader as C
import market as M
import synth_chat as SC

ok = fail = 0


def check(name, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ok   {name}")
    else:
        fail += 1
        print(f"  FAIL {name}  {detail}")


# =============================================================================== part 1: text
print("1) offers: what B> S> PMO and prices mean (your five example lines)")


def offers(name, msg, rules=None):
    out = M.parse_message(name, msg)
    for o in out:
        o.watch = M.watch_match(rules, o.item_text) if rules else ""
    return out


o = offers("Hydrogen", "B>Pink Rabbit Puppet pm offer")
check("'B>Pink Rabbit Puppet pm offer' = buying, no price, wants an offer", len(o) == 1 and o[0].side == "B" and o[0].item_text == "Pink Rabbit Puppet" and o[0].price is None and o[0].pmo, o)
o = offers("FrankieJ", "B> Kumbi 700k")
check("'B> Kumbi 700k' = buying Kumbi at 700,000", len(o) == 1 and o[0].side == "B" and o[0].item_text == "Kumbi" and o[0].price == 700_000 and not o[0].pmo, o)
o = offers("davidlife", "[Zard] S>PMO,B>Two handed Axe Attack Scroll 60% 100k")
check("'[Zard] S>PMO,B>Two handed Axe ...' = two offers: selling the linked Zard (send offers) and buying the scroll at 100k",
      len(o) == 2 and (o[0].side, o[0].item_text, o[0].pmo, o[0].price) == ("S", "Zard", True, None)
      and (o[1].side, o[1].item_text, o[1].price) == ("B", "Two handed Axe Attack Scroll 60%", 100_000), o)
o = offers("YouDkMyStory", "[Emerald Earrings] S > PMO")
check("'[Emerald Earrings] S > PMO' = selling Emerald Earrings, send offers (spaces around > are fine)", len(o) == 1 and (o[0].side, o[0].item_text, o[0].pmo, o[0].price) == ("S", "Emerald Earrings", True, None), o)
o = offers("Yossi", "B>White Labels 650k !")
check("'B>White Labels 650k !' = buying White Labels at 650,000", len(o) == 1 and (o[0].side, o[0].item_text, o[0].price) == ("B", "White Labels", 650_000), o)
check("PMO in any case and 'pm me' / 'pm offer' / 'offer' all mean 'send me an offer'",
      all(offers("x", f"S>Rower {w}")[0].pmo for w in ("pmo", "PMO", "Pmo", "pm me", "pm offer", "pm offers", "dm offer", "offer")))
check("a message with no B> or S> is not an offer", offers("x", "anyone want to party at Ant Tunnel?") == [] and offers("x", "boss run at 8 pm") == [])
check("B and S inside words are not markers ('Sub>' / 'Mob>' ...)", offers("x", "Mob>Rower 5m") == [] and offers("x", "Dubs> hi") == [])
check("WTB / WTS / selling / buying work too", [(x.side) for w in ("WTB Rower 5k", "wts rower 5k", "selling rower 5k", "Buying rower 5k") for x in offers("x", w)] == ["B", "S", "S", "B"])

print("2) prices")
PRICES = {"100k": 100_000, "2.5m": 2_500_000, "1,200,000": 1_200_000, "350000": 350_000, "50 mil": 50_000_000, "1.2B": 1_200_000_000, "1,5m": 1_500_000,
          "750K": 750_000, "3m": 3_000_000, "650k": 650_000, "120 k": 120_000, "5 million": 5_000_000, "10,000 mesos": 10_000, "2000": 2000}
check("prices in every common way of writing them", all(M.find_price(f"Rower {t} ea")[0] == v for t, v in PRICES.items()), [(t, M.find_price(f"Rower {t} ea")[0]) for t, v in PRICES.items() if M.find_price(f"Rower {t} ea")[0] != v])
NOT_PRICES = ["Scroll 60%", "scroll 60 %", "lvl 50 crossbow", "Lv50 xbow", "level 50", "x3 rower", "3x rower", "5pcs rower", "Rower 60", "Shoe 10%", "attack 60% scroll", "2nd job", "lv.50"]
check("percentages, levels, quantities and small plain numbers are NOT prices", all(M.find_price(t)[0] is None for t in NOT_PRICES), [(t, M.find_price(t)[0]) for t in NOT_PRICES if M.find_price(t)[0] is not None])
check("'ea' / 'each' / '/ea' mark a per-item price", [offers("x", f"S>Rower {w}")[0].each for w in ("5k ea", "5k each", "5k/ea", "5k")] == [True, True, True, False])
check("the price is picked out even when the item has numbers in it", offers("x", "S>Crossbow Attack Scroll 60% 2.5m")[0].price == 2_500_000 and offers("x", "B>lvl 50 crossbow 800k")[0].price == 800_000)
check("prices are shown short", [M.format_price(v) for v in (700_000, 2_500_000, 1_200_000_000, 999, 1500, 650_000)] == ["700k", "2.5m", "1.2b", "999", "1.5k", "650k"])

print("3) the watch list (your six items)")
rules, problems = M.parse_watch(M.DEFAULT_WATCH)
check("the starting watch list has your six items and no problems", [r.name for r in rules] == ["Rower", "Lvl 50 crossbow", "Crossbow attack scroll 60%", "White label ring", "Earring/Overall/Cape scroll for DEX/STR", "Shoe scroll for speed 60%"] and not problems, (len(rules), problems))
SHOULD = {
    "Rower": ["S>Rower 350k", "B>rower 1m", "WTS Rowers 200k", "S>[Rower] PMO", "b>ROWER pmo"],
    "Lvl 50 crossbow": ["S>Lvl 50 crossbow 800k", "B>lv50 xbow 1.2m", "S>crossbow lvl.50 2m", "B>level 50 x-bow pmo", "S>Lv 50 Crossbow 900k", "S>l50 crossbow 1m"],
    "Crossbow attack scroll 60%": ["B>Crossbow attack scroll 60% 2m", "S>xbow att scroll 60 3.2m", "B>Crossbow Att Scroll 60% 1m ea", "S>crossbow atk scrl 60% 2m"],
    "White label ring": ["B>White Labels 650k !", "S>white label ring 1m", "B>Whitelabel 500k", "S>wl ring 900k"],
    "Earring/Overall/Cape scroll for DEX/STR": ["B>Earring scroll DEX 60% 1m", "S>Overall scroll for STR 2m", "B>Cape dex scroll 10% 500k", "S>earrings str scrl 800k", "B>Overall Armor Scroll for DEX 60% 4m"],
    "Shoe scroll for speed 60%": ["B>Shoe scroll for speed 60% 150k", "S>shoes speed scroll 60% 200k", "S>Shoe spd scroll 60 1m"],
}
miss = [(item, t) for item, texts in SHOULD.items() for t in texts if not any(x.watch == item for x in offers("p", t, rules))]
check("every way of writing each of your six items is matched", not miss, miss)
SHOULDNT = ["S>Crossbow scroll 60% 300k", "S>Crossbow 50% scroll att 1.2m", "B>Two handed Axe Attack Scroll 60% 100k", "S>Lvl 50 Crossbow Attack Scroll 60% 2m", "S>Cape 10% 300k", "B>Pink Rabbit Puppet pm offer",
            "S>Shoe scroll for jump 60% 150k", "S>Overall scroll for INT 60% 1m", "B>Crossbow 60% 4m", "S>lvl 150 crossbow 1m", "S>crossbow 50k", "S>Emerald Earrings PMO", "S>Prower 5k"]
wrong = [(t, x.watch) for t in SHOULDNT for x in offers("p", t, rules) if x.watch and not (t == "S>Lvl 50 Crossbow Attack Scroll 60% 2m")]
check("look-alikes are NOT matched (different scroll, different level, plain 50% scrolls, a '50k' price, words that only contain 'rower')", not wrong, wrong)
check("a crossbow ATTACK scroll isn't mistaken for the level-50 crossbow itself", [x.watch for x in offers("p", "S>Lvl 50 Crossbow Attack Scroll 60% 2m", rules)] == ["Crossbow attack scroll 60%"], [x.watch for x in offers("p", "S>Lvl 50 Crossbow Attack Scroll 60% 2m", rules)])
r2, p2 = M.parse_watch("# my list\nRing = ring + gold\nBad line without equals\nEmpty =\nDagger = dagger/knife - scroll + cursed")
check("a custom watch list is understood, and bad lines are reported (not silently dropped)", [r.name for r in r2] == ["Ring", "Dagger"] and len(p2) == 2, (r2, p2))
check("'-' words really exclude, '/' really means either", M.watch_match(r2, "S>gold ring 5k") == "Ring" and M.watch_match(r2, "S>knife 5k") == "Dagger" and M.watch_match(r2, "S>dagger scroll 5k") == "")

print("4) which chat lines are new (the chat scrolls, so the same lines are seen again and again)")
T = M.ChatTracker()
a = [("Anna", "S>Rower 1m"), ("Bob", "B>Kumbi 700k"), ("Cy", "S>PMO")]
check("the first look: everything is new", T.update(a) == a)
check("the same lines again: nothing new", T.update(a) == [] and T.update(a) == [])
d = ("Dee", "B>White Label 650k")
check("one more line at the bottom: just that one is new", T.update(a + [d]) == [d])
check("the chat scrolls up by one and another line arrives: only the new one", T.update(a[1:] + [d] + [("Eve", "S>Rower 2m")]) == [("Eve", "S>Rower 2m")])
check("a misread letter in a line that is already known doesn't make it 'new'", T.update([("Dee", "B>White Labe? 650k"), ("Eve", "S>Rower 2m")]) == [])
check("a completely different screen: all new", len(T.update([("Zed", "S>Rower 9m"), ("Yan", "B>xbow 1m")])) == 2)
check("nothing on screen, then lines again: the lines are new (the chat was cleared)", T.update([]) == [] and len(T.update([("Zed", "S>Rower 9m")])) == 1)

print("5) the saved list of offers")
d = tempfile.mkdtemp()
log = M.MarketLog(os.path.join(d, "m.json"))
white = offers("Yossi", "B>White Labels 650k !", rules)[0]
e1, n1 = log.add(white, now=1000)
e2, n2 = log.add(white, now=1100)
check("a new offer is kept; the same player offering the same thing again is one entry seen twice", n1 and not n2 and e2["count"] == 2 and len(log.load()) == 1, e2)
white2 = offers("Yossi", "B>White Labels 700k", rules)[0]
log.add(white2, now=1200)
check("a different price is a different entry", len(log.load()) == 2)
log.add(white, now=1100 + M.MarketLog.MERGE_SECONDS + 5)
check("the same offer after more than ten minutes is a new line (they posted it again)", len(log.load()) == 3)
check("it survives being reloaded from the file", len(M.MarketLog(os.path.join(d, "m.json")).load()) == 3)
bad_name = offers("=cmd|'/c calc'!A1", "S>Rower 5k", rules)[0]
log.add(bad_name, now=3000)
out = os.path.join(d, "o.csv")
n = log.export_csv(out)
text = open(out, encoding="utf-8-sig").read()
check("CSV export writes every entry, and a player name starting with = is saved as text, not a formula", n == 4 and "'=cmd" in text and ",=cmd" not in text, text[:300])
log.delete([log.load()[0]["id"]])
check("delete removes just the chosen offer", len(log.load()) == 3)
log.clear()
check("clear removes everything", log.load() == [])
open(os.path.join(d, "bad.json"), "w").write('[{"id": "a"}, 5, null, {"x": 1}, "text"]')
check("a damaged file keeps the good lines and drops the rest", [e["id"] for e in M.MarketLog(os.path.join(d, "bad.json")).load()] == ["a"])
open(os.path.join(d, "bad2.json"), "w").write("{ not json")
check("a file that isn't valid at all just reads as empty", M.MarketLog(os.path.join(d, "bad2.json")).load() == [])
big = M.MarketLog(os.path.join(d, "big.json"))
for i in range(5100):
    big.add(M.parse_message(f"P{i}", "S>Rower 5k")[0], now=10_000 + i * 700, save=False)
big.flush()
check("the list is capped (oldest dropped) so the file never grows without limit", len(big.load()) == M.MarketLog.MAX)

# =============================================================================== part 2: pictures
print("6) reading your real screenshot with the starter letters")
SHOT = np.asarray(Image.open(os.path.join(HERE, "samples", "chat_sample.png")).convert("RGB"))
STARTER = C.GlyphSet().load(os.path.join(ROOT, "assets", "chat_glyphs.npz"))
check("the starter library loads (51+ shapes, the letters from your screenshot)", len(STARTER) >= 50 and {"R", "o", "w", "e", "r", "0", "5", "k", "%"} <= STARTER.chars(), (len(STARTER), sorted(STARTER.chars())))
chat = C.read_chat(SHOT, STARTER)
TRUTH = ["Hydrogen : B>Pink Rabbit Puppet pm offer", "FrankieJ : B> Kumbi 700k", "davidlife : [Zard] S>PMO,B>Two handed Axe Attack Scroll 60% 100k",
         "YouDkMyStory : [Emerald Earrings] S > PMO", "Yossi : B>White Labels 650k !"]
check("the picture is read as 5 lines at scale 2", len(chat.lines) == 5 and chat.scale == 2, (len(chat.lines), chat.scale))


def is_subsequence(read, truth):
    """Every letter that WAS read is the right letter in the right order (letters it couldn't read are just missing / '?')."""
    t = iter(truth.replace(" ", ""))
    return all(c in t for c in read.replace(" ", "").replace("?", ""))


check("it NEVER reads a wrong letter: everything it read is right (it writes ? for what it hasn't learned). Line 3 of the screenshot is left out: the mouse pointer is drawn over it",
      all(is_subsequence(l.raw, t) for k, (l, t) in enumerate(zip(chat.lines, TRUTH)) if k != 2), [(l.raw, t) for k, (l, t) in enumerate(zip(chat.lines, TRUTH)) if k != 2 and not is_subsequence(l.raw, t)])
clean = lambda t: re.sub(r"(^(\? )+)|((?: \?+)+$)", "", t).strip()
check("three lines are read EXACTLY (including the bold item link '[Emerald Earrings]')", [clean(chat.lines[i].raw) for i in (3, 4)] == [TRUTH[3], TRUTH[4]]
      and clean(chat.lines[0].raw) == TRUTH[0], [clean(l.raw) for l in chat.lines])
msgs = C.messages(chat.lines)
check("lines become whole messages (the player, the text) with stray marks at the end dropped", msgs[4][:2] == ("Yossi", "B>White Labels 650k !") and msgs[3][:2] == ("YouDkMyStory", "[Emerald Earrings] S > PMO"), msgs)
white_offer = [o for n, t, _ in msgs for o in M.parse_message(n, t) if M.watch_match(rules, o.item_text)]
check("end to end: from the picture, the only watched offer is Yossi buying White Labels at 650k", [(o.name, o.side, o.price, M.watch_match(rules, o.item_text)) for o in white_offer] == [("Yossi", "B", 650_000, "White label ring")], white_offer)

print("7) the same chat at other game sizes, cut out at odd places, recoloured")
WANT = [TRUTH[3], TRUTH[4]]


def exact(img, scale=None):
    c = C.read_chat(np.ascontiguousarray(img), STARTER, scale)
    got = [clean(l.raw) for l in c.lines]
    return all(w in got for w in WANT), c.scale


half = SHOT[::2, ::2]                                           # the game at its smallest size (the screenshot is the font drawn 2x)
for label, img, sc in (("1x", half, 1), ("2x (as in your screenshot)", SHOT, 2), ("3x", np.repeat(np.repeat(half, 3, 0), 3, 1), 3), ("4x", np.repeat(np.repeat(half, 4, 0), 4, 1), 4)):
    good, found = exact(img)
    check(f"read exactly when the game is drawn at {label} (the size is worked out by itself: found {found}x)", good and found == sc, (good, found))
bad = [(dy, dx) for dy in (0, 1, 3, 5, 7) for dx in (0, 1, 2, 5, 9) if not exact(SHOT[dy:, dx:])[0]]
check("read exactly wherever the selected box happens to start (25 different offsets)", not bad, bad)
bad = [(dy, dx) for dy in (0, 1) for dx in (0, 1, 3) if not exact(half[dy:, dx:])[0]]
check("... also at 1x with odd offsets", not bad, bad)
check("read exactly in other colours (red and blue swapped; brighter)", exact(SHOT[..., ::-1])[0] and exact(np.clip(SHOT.astype(int) + 25, 0, 255).astype(np.uint8))[0])
check("read exactly when everything is dimmer (90%, 80%, 70% brightness)", all(exact(np.ascontiguousarray((SHOT * f).astype(np.uint8)))[0] for f in (0.9, 0.8, 0.7)))
def messages_of(img):
    return [(n, t) for n, t, _ in C.messages(C.read_chat(np.ascontiguousarray(img), STARTER).lines)]


no_tags = SHOT.copy()
no_tags[(no_tags >= 250).all(axis=2)] = (150, 150, 150)
got = messages_of(no_tags)
check("even when the channel tags are NOT recognised as tags (borders recoloured), the messages are still read exactly", C.find_tags(no_tags) == []
      and ("Yossi", "B>White Labels 650k !") in got and ("YouDkMyStory", "[Emerald Earrings] S > PMO") in got, got)
got = messages_of(np.pad(SHOT, ((20, 20), (30, 30), (0, 0)), constant_values=15))
check("with a dark margin around the chat the messages are still read exactly, and junk marks don't spoil the names",
      ("Yossi", "B>White Labels 650k !") in got and ("YouDkMyStory", "[Emerald Earrings] S > PMO") in got, got)
check("read exactly from just the last two lines (a small box)", exact(SHOT[96:, :])[0])
rng = np.random.default_rng(1)
check("a touch of pixel noise (+-4) doesn't matter", exact(np.clip(SHOT.astype(int) + rng.integers(-4, 5, SHOT.shape), 0, 255).astype(np.uint8))[0])

print("8) brand-new chat lines (never seen), drawn from the real letter shapes at different sizes and colours")
SHAPES = SC.real_shapes(STARTER)


def draw_chat(lines, scale=2, band="pink", offset=(0, 0)):
    return SC.draw_chat(lines, SHAPES, scale, band, offset)


PHRASES = [("Hydrogen", "B>White Labels 650k !", ()), ("Yossi", "S>Rower 700k", ()), ("Kumbi", "B>Lv 50 crossbow 100k", ()),
           ("Fry", "B>Shoe scroll for speed 60% 150k", ()), ("Dougy", "S>[Rower] PMO", ((3, 8),)), ("Hanna", "S>White label ring 1500k", ())]
for scale in (1, 2, 3, 4):
    for band in ("pink", "gold", "dark", "blue"):
        img = draw_chat(PHRASES, scale, band)
        got = [l.raw for l in C.read_chat(img, STARTER).lines]
        want = [f"{n} : {m}" for n, m, _ in PHRASES]
        check(f"six new lines read exactly: size {scale}x, {band} background", got == want, [(g, w) for g, w in zip(got, want) if g != w][:2] or (len(got), len(want)))
bad = []
for scale in (1, 2, 3):
    for off in ((0, 0), (1, 1), (2, 3), (3, 3 * scale), (3, 0)):                    # (the box never starts further in than the margin: that would cut a letter)
        got = [l.raw for l in C.read_chat(draw_chat(PHRASES, scale, "pink", off), STARTER).lines]
        if got != [f"{n} : {m}" for n, m, _ in PHRASES]:
            bad.append((scale, off, got[:2]))
check("... and with the box cut at odd offsets (15 combinations)", not bad, bad[:2])
img = draw_chat([("Hydrogen", "B>White Labels 650k !", ())], 2, "pink")
offer = [o for n, t, _ in C.messages(C.read_chat(img, STARTER).lines) for o in M.parse_message(n, t)]
check("a brand-new line goes all the way: name, side, item, price, watch-list match", [(o.name, o.side, o.price, M.watch_match(rules, o.item_text)) for o in offer] == [("Hydrogen", "B", 650_000, "White label ring")], offer)
wrapped = C.messages(C.read_chat(draw_chat([("Hanna", "S>Rower", ())], 2, "pink"), STARTER).lines)
check("a message that fills the line and carries on below (no name on the second line) is joined into one message",
      len(C.messages(C.read_chat(draw_chat([("Hanna", "S>Rower", ()), ("", "700k", ())], 2, "pink"), STARTER).lines)) >= 1 and wrapped[0][:2] == ("Hanna", "S>Rower"))
white_chat = draw_chat(PHRASES, 4, "dark")
check("white text on a dark chat at 4x is NOT mistaken for tags and erased (no letter is lost)", [l.raw for l in C.read_chat(white_chat, STARTER).lines] == [f"{n} : {m}" for n, m, _ in PHRASES] and C.find_tags(white_chat) == [], C.find_tags(white_chat))

print("9) teaching: learning a letter from what someone typed")


def without(glyphs, chars):
    g = C.GlyphSet()
    for ch, m in glyphs.items:
        if ch not in chars:
            g.add(ch, m)
    return g


for dropped in ("k", "L", "5", "ff", "W"):
    lib = without(STARTER, {dropped} if dropped != "ff" else {"f", "ff"})
    c = C.read_chat(SHOT, lib)
    before = clean(c.lines[4].raw)
    learned, why = C.teach(c, 4, "Yossi : B>White Labels 650k !", lib) if dropped != "ff" else C.teach(c, 0, "Hydrogen : B>Pink Rabbit Puppet pm offer", lib)
    c2 = C.read_chat(SHOT, lib)
    got = clean(c2.lines[4 if dropped != "ff" else 0].raw)
    want = TRUTH[4 if dropped != "ff" else 0]
    check(f"forget '{dropped}', then teach it from one typed line: it is read correctly afterwards (was: {before!r})", dropped in "".join(learned) and got == want and not why, (learned, got, why))
lib = without(STARTER, {"k"})
c = C.read_chat(SHOT, lib)
n0 = len(lib)
learned, why = C.teach(c, 4, "Yossi : B>Black Labels 650k !", lib)
check("a typed line that doesn't match what is on screen is refused, and nothing is learned from it", why and learned == [] and len(lib) == n0, (learned, why))
learned, why = C.teach(c, 4, "Yossi : B>White Labels 650k !", lib)
n1 = len(lib)
learned2, _ = C.teach(C.read_chat(SHOT, lib), 4, "Yossi : B>White Labels 650k !", lib)
check("teaching the same line twice learns nothing new the second time", n1 > n0 and learned2 == [] and len(lib) == n1)
p = os.path.join(tempfile.mkdtemp(), "g.npz")
STARTER.save(p)
back = C.GlyphSet().load(p)
check("the letter library can be saved and loaded again, identical", len(back) == len(STARTER) and sorted(back.chars()) == sorted(STARTER.chars())
      and all(np.array_equal(a[1], b[1]) for a, b in zip(STARTER.items, back.items)))
open(p, "wb").write(b"not a library")
check("a damaged library file is ignored (an empty library, no crash)", len(C.GlyphSet().load(p)) == 0 and len(C.GlyphSet().load(p + ".missing")) == 0)
wide = C.GlyphSet()
check("a shape that is the wrong size or empty is refused", not wide.add("x", np.zeros((C.HEIGHT, 5))) and not wide.add("x", np.ones((3, 3))) and not wide.add("x", np.ones((C.HEIGHT, 40))))

print("9b) teaching from scratch in a font it has never seen (an invented alphabet), the way the Teach window does it")
FONT = SC.made_up_font(3)
TEACH = ("The quick brown fox jumps over the lazy dog", "ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789", "!?%.,:;+-/()[]<>='*&#@$")
for size, band in ((2, "dark"), (1, "pink"), (3, "gold")):
    pic = SC.draw_chat([("Hanna", s, ()) for s in TEACH], FONT, size, band)
    lib = C.GlyphSet()
    results = [C.teach(C.read_chat(pic, lib), i, f"Hanna : {s}", lib) for i, s in enumerate(TEACH)]
    check(f"from an empty library, the three suggested lines teach every character ({len(lib.chars())} of {len(set(SC.ALL_CHARS))}) at {size}x on {band}", lib.chars() >= set(SC.ALL_CHARS) and not any(w for _, w in results), (len(lib.chars()), [w for _, w in results]))
    new = [("Hanna", "B>Rower 700k", ()), ("Kuma", "S>[White] 60% PMO", ((3, 8),)), ("Zed", "WTB crossbow 2.5m ea", ()), ("Qx", "B>Lv 50 xbow 1.2b !?", ())]
    got = [l.raw for l in C.read_chat(SC.draw_chat(new, FONT, size, band), lib).lines]
    check(f"... and then brand-new messages in that font read exactly at {size}x (including a bold link)", got == [f"{n} : {m}" for n, m, _ in new], got)
lib = C.GlyphSet()
pic = SC.draw_chat([("Hanna", s, ()) for s in TEACH], FONT, 2, "dark")
learned, why = C.teach(C.read_chat(pic, lib), 0, "Hanna : The quick brown fox jumps over the lazy cat", lib)
check("teaching with text that doesn't match the line (one word wrong) is refused: nothing is learned, nothing spoilt", why and learned == [] and len(lib) == 0, (learned, why, len(lib)))
learned, why = C.teach(C.read_chat(pic, lib), 0, "Hanna : The quick brown fox", lib)
check("teaching with only part of the line typed is refused too", why and len(lib) == 0, (learned, why))
learned, why = C.teach(C.read_chat(pic, lib), 0, "Hanna : The quick brown fox jumps over the lazy dog and more", lib)
check("... and with extra text that isn't on the line", why and len(lib) == 0, (learned, why))
good = C.GlyphSet()
C.teach(C.read_chat(pic, good), 0, "Hanna : The quick brown fox jumps over the lazy dog", good)
n = len(good)
C.teach(C.read_chat(pic, good), 1, "Hanna : ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 oops", good)
check("a refused line can't damage what was already learned", len(good) == n, (n, len(good)))
pic2 = SC.draw_chat([("Hanna", "ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789", ()), ("Kuma", "S>Rower 5k", ())], FONT, 2, "dark")
check("a teaching line is read as '?' where a letter isn't known, never as a wrong letter",
      all(is_subsequence(l.raw, t) for l, t in zip(C.read_chat(pic2, good).lines, ["Hanna : ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789", "Kuma : S>Rower 5k"])), [l.raw for l in C.read_chat(pic2, good).lines])

print("10) random pictures must never crash it or make it invent text")
rng = np.random.default_rng(5)
crashed, invented, count = [], 0, 0
t0 = time.time()
for i in range(150):
    h, w = int(rng.integers(1, 220)), int(rng.integers(1, 420))
    kind = i % 6
    if kind == 0:
        img = rng.integers(0, 256, (h, w, 3), dtype=np.uint8)
    elif kind == 1:
        img = np.full((h, w, 3), int(rng.integers(0, 256)), np.uint8)
    elif kind == 2:
        img = np.tile(np.linspace(0, 255, w).astype(np.uint8)[None, :, None], (h, 1, 3))
    elif kind == 3:
        img = np.full((h, w, 3), 90, np.uint8)
        for _ in range(30):
            y, x = int(rng.integers(0, h)), int(rng.integers(0, w))
            img[y:y + int(rng.integers(1, 12)), x:x + int(rng.integers(1, 40))] = rng.integers(0, 256, 3)
    elif kind == 4:
        img = np.repeat(np.repeat(rng.integers(0, 2, (max(1, h // 4), max(1, w // 4), 1), dtype=np.uint8) * 255, 4, 0), 4, 1)[:h, :w].repeat(3, 2)
        img = img if img.shape[0] and img.shape[1] else np.zeros((1, 1, 3), np.uint8)
    else:
        img = np.zeros((h, w, 3), np.uint8)
    try:
        res = C.read_chat(img, STARTER)
        count += len(res.lines)
        invented += sum(1 for l in res.lines for t in l.tiles if t.char is not None)
    except Exception as e:                                                          # noqa: BLE001
        crashed.append((img.shape, repr(e)[:80]))
check(f"150 random / blank / striped / blocky pictures of random sizes: no crash ({time.time() - t0:.1f} s)", not crashed, crashed[:3])
check(f"... few letters are 'recognised' in them ({invented} in {count} lines) and none of it is ever an offer", invented <= count * 0.5 and not any(
    M.parse_message(n, t) for n, t, _ in C.messages(C.read_chat(np.random.default_rng(i).integers(0, 256, (120, 300, 3), dtype=np.uint8), STARTER).lines) for i in range(1)), invented)
for shape in ((0, 0, 3), (1, 1, 3), (11, 500, 3), (500, 20, 3), (40, 40, 4)):
    try:
        C.read_chat(np.zeros(shape, np.uint8), STARTER)
        okay = True
    except Exception:                                                               # noqa: BLE001
        okay = False
    check(f"a picture of shape {shape} is handled", okay)
check("an empty letter library reads everything as ? (no crash)", all(t.char is None for l in C.read_chat(SHOT, C.GlyphSet()).lines for t in l.tiles))

print("11) speed (the chat is read every ~2 seconds)")
t0 = time.time()
for _ in range(5):
    C.read_chat(SHOT, STARTER)
per = (time.time() - t0) / 5 * 1000
check(f"reading a 5-line chat box takes {per:.0f} ms", per < 600, per)
print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
