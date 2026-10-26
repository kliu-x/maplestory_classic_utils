# maplestory_classic_utils

Two independent tools for **MapleStory Classic World**, the official Nexon classic server that launched 2026-10-21 with one world, Windia.

| Folder | What it is | Start |
|---|---|---|
| [companion/](companion/) | React + TypeScript web app: training calculator, SP/AP planner, sourced monster/map/quest/skill data | `cd companion && npm install && npm run dev` |
| [pokemon_name_checker/](pokemon_name_checker/) | Python CLI: bulk-checks Gen 1–2 Pokémon names against ClassicRank's public API | `cd pokemon_name_checker && python check_names.py` |

## Requirements

- Node 18+ for the companion.
- Python 3.9+ for the name checker, standard library only.

## Results from the first run

- See [pokemon_name_checker/FINDINGS.md](pokemon_name_checker/FINDINGS.md).
- **"Not found in source" never means "available".**

## Sources and caveats

- For the companion, see the Sources page in the app or [companion/README.md](companion/README.md).
- For the name checker, see [pokemon_name_checker/README.md](pokemon_name_checker/README.md).
