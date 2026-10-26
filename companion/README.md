# Classic World Companion

A fast, offline-friendly MapleStory **Classic World** companion. It runs in the browser with no backend and no AI calls; everything is computed locally and instantly.

- **Dashboard.** Shows "what should I do next?" for the active character: next 3 SP, next 5 AP and the top 3 training maps.
- **Characters.** Holds multiple editable profiles: base and equipment stats are kept separate, plus skills and measured damage.
- **Training.**
  - Maps are ranked by EXP/min, with **EXP/cast shown separately**.
  - You can compare two maps side by side.
  - Every assumption is editable.
- **Monsters / Maps / Quests.** These are searchable tables built from the Classic World game files. You can mark favorites, see recently viewed entries and track quest completion per character.
- **Skills & AP.**
  - Proposed build orders, validated against verified caps and prerequisites.
  - A level-by-level SP table.
  - AP advice driven by gear stat goals.
- **Gear.** Estimates the damage and EXP/min gain from an upgrade, and throwing-star costs.
- **Name Checker.** Views `results.json` from [../pokemon_name_checker](../pokemon_name_checker).
- **Sources.** Lists citations, verification labels, known conflicts and the data refresh workflow.

## Run it

Requires Node 18+ (tested with Node 24 LTS).

```bash
cd companion
npm install
npm run dev        # http://localhost:5173
npm test           # 97 unit tests (calculators, builds, dataset spot-checks)
npm run build      # static site in dist/ (deployable to GitHub Pages / Netlify / Cloudflare Pages)
npm run preview    # serve the built site locally
```

`vite.config.ts` uses `base: './'`, so the built `dist/` works from any sub-path.

## Data integrity

| Label | Meaning |
|---|---|
| **Verified** | Official Nexon notes, or values read from the Classic World client files via [maplestory.io](https://maplestory.io/api/MCW/1) (region `MCW`, version 1). |
| **Community** | A Classic World community guide (MeowDB). |
| **Unverified** | An app default or proposal with no Classic World source. You should edit it. |
| **Conflicting** | Sources disagree. Both are shown and you choose which to use. |

- Classic World uses its own IDs and rebalanced numbers (Snail: 45 HP / 2 EXP; pre-Big-Bang: 8 HP / 3 EXP). No pre-Big-Bang database is used for any value. Tests fail if legacy IDs appear.
- **Damage provenance** is shown on every result, in order of trust:
  1. *Measured*: you recorded hits on that monster.
  2. *Projected*: your measurement on another monster, rescaled by its defense and level.
  3. *Estimate*: the community damage formula applied to your stats.
- **Known conflicts and open questions:**
  - Element multipliers conflict: weak ×1.25 per MeowDB versus ×1.5 under the legacy convention. Element adjustment is off by default.
  - Respawn time, attack speed and potion prices are unverified defaults.
  - Poison Breath's damage is taken from a hidden linked skill entry (an inference).

### Refreshing the dataset

The dataset is updated manually, never scraped in the background.

```bash
npm run data:fetch            # polite: 1 request at a time, >=300 ms apart; skips files already in data-raw/
npm run data:fetch -- --refresh   # re-download everything (~710 requests, ~4 min)
npm run data:build            # data-raw/mcw-1 -> src/data/generated/*.json (adds source metadata)
npm test                      # spot-checks flag values a patch changed
```

## How training is estimated

1. **Casts to kill.**
   - The calculation is exact, not an average: it computes the distribution of hits needed to kill on a discretised HP grid.
   - Per-line damage follows a triangular distribution fitted to your min/avg/max.
   - Misses are folded in with a binomial on lines per cast × hit rate.
   - It reports best, expected, median and p90 casts.
2. **Per monster.**
   - EXP/cast = EXP × targets ÷ expected casts.
   - Targets = the skill's mob count capped by your pack-size assumption, e.g. Thunder Bolt hits 6.
3. **Per map.** Kills/min = min(attack-limited, spawn-limited).
   - Attack-limited = casts/s × 60 × uptime ÷ casts per kill.
   - Spawn-limited = spawn points × reachable share × 60 ÷ respawn seconds.
   - Spawn points are counted from the map files, so they are verified. Maps with several species are spawn-weighted.
4. **Net EXP/min.** EXP/min is net of travel time (amortised over the session) and the expected death penalty. Meso cost/min covers MP and HP potions plus star recharge.

Pure calculators live in `src/calculators/` and are unit-tested in `src/tests/`.

## Layout

```
companion/
  scripts/            fetch-mcw-data.mjs, build-data.mjs (dataset refresh workflow)
  data-raw/mcw-1/     trimmed raw API responses (inputs to build-data)
  src/
    models/           TypeScript types (source data vs user data kept apart)
    data/             generated/*.json, sources.ts (citations), rules.ts (job/SP/AP rules), builds.ts (proposed builds)
    calculators/      damage, formulas, attack resolution, training, ranking, SP, planner, AP
    storage/          localStorage persistence + JSON import/export
    integrations/     name-checker results adapter
    pages/, components/
    tests/
```

## Privacy

Profiles, measurements and settings stay in this browser's `localStorage`. Use **Characters → Export JSON** to back them up or move them to another device. There are no accounts, no backend and no API keys.
