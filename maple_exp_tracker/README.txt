MAPLE EXP TRACKER  v1.0
An EXP/hr overlay for MapleStory Classic World (Windows 10/11).

A small window sits next to the game and shows how fast you are levelling. It works by LOOKING AT YOUR
SCREEN, like a screen recorder. It never touches the game's files or memory, never presses keys or clicks
for you, and has NO network code at all: nothing you do here is ever sent anywhere.


WHAT IT SHOWS
  * EXP per hour in big gold numbers, with a small badge showing whether the last 5 minutes are faster
    or slower than your session average
  * How long until your next level ("Lv 48 in 2 h 06 min"), a progress bar, and the % of the level done
  * EXP left, EXP gained, EXP lost when you die (death doesn't pull your EXP/hr down), and the last-5-minutes rate
  * Mesos gained: any increase in the mesos shown in your open inventory (drops, but also selling items or quest
    rewards); spending is not subtracted. The inventory must be open and solid. The Square layout shows both
    mesos per hour and mesos gained; the Wide and Slim layouts show mesos gained
  * A log of your sessions (map, level, EXP/hr, mesos/hr) you can export to a spreadsheet (CSV)
  * It pauses by itself when no EXP comes in for 15 seconds (adjustable), and carries on when it does. The clock
    runs on for about one usual gap between kills after your last EXP and then stops, so time tracked never
    jumps back and breaks don't drag EXP/hr down.
  * Market watch: reads the game's chat for buy/sell offers (B> / S> / PMO) on a watch list you can edit, with prices
  * Five layouts: Square (the full view), Wide (four big stats in a row), Slim bar (a thin strip),
    Mesos only (just the mesos tracker: mesos gained, per hour, in your inventory, and time tracked) and
    Market feed (the 5 newest buy / sell offers from the chat, with a button to open the history)
  * Two designs: "Dark & Gold" (near-black glass with gold glowing numbers) and "MapleStory Classic"
    (cream parchment, an orange title banner with a maple leaf, a lime-green EXP gauge and brown outlined
    numbers, like the game's own windows). Change it in Settings > Design; it applies everywhere, including
    the Settings and Log windows.


WILL IT MAKE MY GAME LAG?
  It is built to stay out of the game's way, and it should not. What it costs (measured):
    * About 4-5% of ONE processor core at 1080p (under 1% of a typical multi-core PC), about 8% of one core at 4K.
      It looks at the bottom strip of the game every 1.5 seconds (about 20 milliseconds of work), at the whole window
      every 4 seconds for mesos (about 20 ms at 1080p), and redraws its own window when something changes.
    * About 80-150 MB of memory. No graphics card use at all.
    * Its work is kept on one thread (it never spreads a burst across every core) and it asks Windows to run it at
      slightly lower priority than normal, so if your PC is ever fully busy the game gets the processor first.
  If you do notice lag: use the Slim bar layout, close the Settings/Log windows, make sure the game is in windowed or
  borderless mode (not exclusive fullscreen), and check Task Manager to see whether anything else is using the processor.
  Very old or two-core PCs running a demanding game are the only case where you might feel it.


MARKET WATCH: READING THE CHAT FOR BUY / SELL OFFERS
  The tracker can read the game's chat box (the megaphone / item-link announcements) and keep a list of who is
  buying or selling the items you care about, and at what price. It only looks at the picture of the chat box on your
  screen; it never types, never joins any channel, and never sends anything anywhere.
  Set it up (once):
    1. Settings > "Select chat area": drag a box around the chat text, INSIDE the chat window (not its border or
       scroll bar), covering several lines. It is remembered relative to the game window. If you resize the game
       window, select it again (the tracker tells you).
    2. Tick "Read the chat for buy / sell offers".
    3. Teach it the letters it doesn't know yet (see below). Anything it can't read shows as "?"; it never guesses.
    4. Press the price-tag button on the main window (or Settings > "Market list") to see the offers.
  What it understands:  B>  S>  (spaces allowed: "S > PMO"), also WTB / WTS / buying / selling.
    PMO, "pm offer", "pm me" and "offer" mean "send me an offer" (no price). An item link before the first marker
    ("[Zard] S>PMO") belongs to that first offer. One message can hold several offers ("S>PMO,B>Scroll 60% 100k").
    Prices: 100k, 2.5m, 1.2b, 1,200,000, 350000, 50 mil, "5k ea" / "5k each" / "5k/ea" (per item). Percentages (60%),
    levels (lvl 50 / lv50), quantities (x3, 5pcs) and small plain numbers are never taken for prices.
  THE MARKET FEED (the "Market feed" layout: arrows button, Shift+3, or Settings > Layout):
    Five rows, newest at the top. Each row: BUY or SELL, the item, the price (or PMO), the player and how long ago
    ("Yossi . 2m . seen 3x"). When a new offer comes in it takes the top row and the oldest drops off the bottom; if
    the same offer is seen again it moves back to the top. The feed shows offers on your watch list only.
    The dot at the top says whether chat reading is on and working (it also tells you if the chat area still needs
    choosing or the game window changed size).
  ON THE MAIN LAYOUT TOO: the Square layout has a MARKET card under the stats: the same newest offers (up to five, one
    line each: BUY/SELL, item, player and how long ago, price) with the chat status dot. Click the card to open the
    history. It makes the window taller; switch it off with Settings > "Show the newest offers on the main (Square)
    layout" and the window goes back to its old size. (The Wide and Slim layouts don't have it.)
  THE HISTORY LOG: every offer that was kept is saved, even after it leaves the feed. Open it with the big "Open the
    history log" button in the feed, or the price-tag button on the other layouts, or Settings > "Market list". You can
    filter by item, buy/sell or player, delete lines, and export everything to a spreadsheet (CSV).
  The watch list (Market window > "Watch list..."): one item per line, e.g.
        Crossbow attack scroll 60% = crossbow/xbow + attack/att/atk + scroll/scrl + 60
        Lvl 50 crossbow = crossbow/xbow + lvl 50/lv 50/level 50/l50 - scroll/scrl
    "+" = and, "/" = either, "-" = must NOT appear. Plurals and spacing are handled. It starts with Rower, Lvl 50
    crossbow, Crossbow attack scroll 60%, White label ring, Earring/Overall/Cape scroll for DEX/STR and Shoe scroll
    for speed 60%. Only offers that match the list are kept, unless you tick "Also keep offers for items that are
    not on my watch list". The same player offering the same thing at the same price again within 10 minutes is one
    line that was "seen" more than once. Export to a spreadsheet with "Export CSV".
  TEACHING THE CHAT FONT (a few minutes, once):
    The tracker starts out knowing about 50 characters (from a sample of the game's chat). Missing, for example, are
    the digits 2 3 4 8 9 and a number of capital letters, so a price like 350k would show as "?50k" until taught.
    Market window > "Teach chat font...": type the three lines it shows into the game's chat (any tab), one after
    another, enter your character name, press "Learn from the newest 3 lines". It lines up the letters you typed with
    the shapes on screen and keeps them in data/chat_glyphs_user.npz. It refuses any line that doesn't fit what you
    typed (for example a typo), so a mistake can't spoil what it has learned. You can also teach one line at a time:
    pick it from the list and type what it says. If you taught something wrong, delete data/chat_glyphs_user.npz.
  Limits to know about:
    * It reads only what is on screen when it looks (every 2 seconds). Offers that scroll off before then are missed.
    * The game must be in windowed or borderless mode and nothing may cover the chat box.
    * It works at any whole-number size of the game's chat font (1x, 2x, 3x...) and any text colours. A blurred or
      scaled-with-smoothing picture will not read well.
    * Player names: letters it hasn't learned show as "?", so a name may be shown as "Yo?r" until taught.
    * Offers show what was written, not whether they are fair or real. Names are saved only on your PC.
    * Check that the game's rules allow tools that read chat. This one only reads the screen, but that is up to you.
  Files it adds in the data folder: market_log.json (the offers), watchlist.txt (your list), chat_glyphs_user.npz (taught letters).
  Cost: when the chat picture hasn't changed it does nothing; when it has, reading takes about 0.15 s. The feed itself is just a drawing.


HOW IT WATCHES THE GAME
  It takes a screenshot of the game window about every 1.5 seconds (like a screen recorder or the Windows
  Snipping Tool) and reads the numbers off that picture. That is all. It does not look inside the game: it
  never opens the game's process, files or memory, never sends it key presses or clicks, and the game has no
  way to tell it is there. Because it reads the picture, anything lying on top of the game (another window,
  this tracker) hides what's underneath, and the game must be in windowed or borderless mode.


SET IT UP  (about 5 minutes, once)
  1. Install Python 3.10 or newer from https://www.python.org/downloads/
     On the first installer screen tick  "Add python.exe to PATH"  before clicking Install.
  2. Double-click  install.bat   It installs four small packages and says "Done" when finished.
  3. Double-click  run.bat       The tracker opens.
  4. Start MapleStory in WINDOWED or BORDERLESS mode (the tracker can't see exclusive fullscreen).
  5. Press the big  Start  button in the tracker. You're tracking.

If nothing opens, double-click  run_debug.bat  : it keeps a window open that shows any error message.


USING IT
  The big button starts / pauses tracking. Next to it: reset, and the session log.
  Top right: the arrows button changes the layout (Square > Wide > Slim bar > Mesos only > Market feed > Square), the gear opens
  Settings, and the x closes the tracker. Drag the window by anywhere that isn't a button.
  Hotkeys (they work while the game or the tracker is in front, and change nothing in the game):
        Shift+1  start / pause        Shift+2  reset        Shift+3  change the layout
  The coloured dot in the top-left chip says what's happening: green = tracking, gold = waiting for EXP,
  grey = ready (press Start), red = a problem (the line at the bottom says what to do).
  Big numbers that are too wide for their space are shortened (for example 123.46M) instead of spilling out.
  Don't cover the EXP bar: keep this window out of the way of the bottom of the game. If it is in the way,
  the tracker tells you.

  THE MAP (each logged session has one):
    The MAP line on the main layout shows which map this session is on. Click it, pick one from the list (your recent
    maps come first) or type any name, press Save. Do it before you press Start; if you forget, the tracker reminds you.
    Every session in the log is saved WITH its map. If you change the map in the middle of a session, that session is
    saved under the OLD map and a new session starts for the new map (otherwise the time on the old map would be
    counted under the new one). A session shorter than a minute isn't logged, so a quick change just sets the map.
    The Log window has a Map filter and shows totals for what is on screen (sessions, time, EXP, average EXP/hr, mesos/hr),
    so you can compare maps. "Rename map" there fixes the map on lines you already have. The CSV export includes the map.

  SETTINGS (the gear):
    Window         Which window to watch. "Automatic" finds the MapleStory window by itself. Or open the list
                   and pick any open window (it shows the windows you have open right now, like Alt-Tab).
                   Your pick is remembered, and if that program is closed and opened again it is found
                   again by its title.
    Select area    Only if the EXP bar can't be found by itself: drag a box around the EXP line.
    View capture   Shows exactly what the tracker is reading, with boxes around each digit.
    Level          Worked out from the EXP bar. Type a level and press Enter only to force it (it must still
                   agree with the % on screen). Press Auto to go back.
    Map            The map you are farming (the same as the MAP line on the main window: see "THE MAP" above).
    Pause when no EXP for ... seconds
    Design         Click a preview to switch between Dark & Gold and MapleStory Classic.
    Layout, Opacity, Always on top, Hotkeys on/off


IF SOMETHING DOESN'T WORK
  "MapleStory not found"            Start the game first (windowed/borderless), then open Settings (the gear)
                                    and press Refresh. If it still isn't found, pick the game's window by
                                    name from the Window list there.
  "Can't find the EXP bar"          Make sure nothing covers it, including this window. If it still can't,
                                    open Settings > Select area and drag a box around the whole line
                                    "EXP. 372,741 [67.08%]". Press "Follow the game window" later to go back.
  "EXP bar found, but not clear"    The digits are too small or blurry. Make the game window bigger.
  Numbers look wrong                Open Settings > View capture. It shows what was read, with boxes around the
                                    digits. "Save picture" saves it in the data folder (it stays on your PC).
  Mesos say "Select area is on"     Mesos can't be read in Select-area mode (only the EXP line is looked at).
                                    Open Settings and press "Follow the game window".
  Mesos say "open your inventory"   Open your inventory (any tab) and keep the mesos at the bottom visible.
                                    The inventory must be solid, not see-through (stand still a moment).
  Anything else                     Look in the  data  folder: errors.log lists problems, in plain text.


PRIVACY AND SAFETY
  * No network code: the program never connects to the internet. (No update check, no sharing, no reports.)
  * It never starts other programs, opens the game's process, reads other programs' memory, hooks the
    keyboard or mouse, or sends input to the game. The only things it asks Windows are: the list of open
    windows with their titles and positions (what Alt-Tab does), the three hotkeys, and a lock so two copies
    can't run at once, plus one request to run at slightly lower priority (for this program only). The complete list of Windows functions is in winapi.py, and
    python tests/test_external_only.py checks it (and that no network, process or code-loading modules are
    imported) from the source code itself.
  * The only files it writes are in its own  data  folder, plus a CSV if you ask for an export.
  * Your settings and log live in the  data  folder next to the program (or %APPDATA%\MapleExpTracker if
    that folder can't be written to). Delete the folder to remove everything.
  * The .npz files in assets/ are plain numbers (digit pictures), never code. They are loaded with
    pickling switched off.
  * All the source is here in .py files you can read.


WHAT'S DIFFERENT FROM THE COMMUNITY OVERLAY THIS WAS MODELLED ON
  Same idea, same kinds of numbers, and the same family of look (dark glass cards, gold accents, three
  layouts). Every picture is drawn by this program's own code; none of the community overlay's images are used.
  Left out on purpose: the update check, the sharing of runs, the daily "health" report, "Send report", the
  "best maps" website link, reading the map name off the minimap (it needed a helper program), potions and
  the macOS version.
  Added: a window picker, a typed-level override, and a plain session log with CSV export.
  Not included: reading the level from the orange LV badge (the level comes from the EXP number and %, which
  identify it), and EXP bars that show only a % with no number.


HOW IT READS THE SCREEN (short version)
  The EXP line in the status bar is white digits with green brackets. The tracker finds those, cuts out each
  digit, and compares it with saved pictures of the game's own digits (assets/digits.npz). A reading is only
  believed if the number and the % agree with each other and with the EXP your level needs, so a misread is
  thrown away instead of shown. That is why it's reliable where general-purpose text recognition isn't.


TESTS (for the curious)
  python tests/test_logic.py        EXP/hr, level-ups, deaths, pauses, mesos, the log
  python tests/test_reader.py       the screen reader, on a real screenshot of the EXP bar and cluttered scenes
  python tests/test_app_smoke.py    the whole program, against a fake screen: clicking the buttons, picking a
                                    window, every layout and design, a stress run of 1,500 random events, and a
                                    check of every file it touched
  python tests/test_chat.py         the chat reader and market side: offers, prices, the watch list, reading chat
                                    pictures at every size, teaching, random garbage that must not crash it
  python tests/test_themes.py       both designs: every option present, text readable (contrast measured),
                                    every layout drawing at 100%-200% display scaling
  python tests/test_external_only.py   the "stays outside the game" audit of the source code
  What these can't prove: how the window looks, and the parts that need Windows and the live game (finding
  windows, hotkeys, reading mesos off a real screen).


CREDITS AND LICENSE
  The approach, and the saved digit pictures in assets/ (digits.npz, mesos_digits.npz, maps.txt), come from
  Maple-Classic-Exp-Overlay by beanguri (MIT License): https://github.com/beanguri/Maple-Classic-Exp-Overlay
  The text font is Manrope (SIL Open Font License, assets/fonts/OFL.txt). The MapleStory Classic design is
  original artwork drawn by the program, inspired by the look of the game's windows (no game files or
  pictures are used; MapleStory belongs to Nexon). See NOTICE.txt. The program code
  in this folder is a fresh implementation. Not affiliated with Nexon;
  like any third-party tool, you use it at your own risk.
