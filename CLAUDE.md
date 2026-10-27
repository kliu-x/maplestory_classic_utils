# CLAUDE.md

Two independent tools for MapleStory **Classic World** (official Nexon classic server, world Windia, launched 2026-10-21).

- `companion/`: React 18 + TypeScript + Vite static web app. No backend, no accounts, no API keys.
- `pokemon_name_checker/`: Python 3.9+ CLI, standard library only.

## Environment (this PC)

- Node 24 LTS is at `/c/Program Files/nodejs` and is **not on the shell PATH**. Prefix commands with `export PATH="/c/Program Files/nodejs:$PATH";`.
- Python 3.9 rejects ClassicRank's cert via the Windows store; the checker falls back to certifi (pip's vendored copy works). Don't "fix" this by disabling verification.
- Windows console is cp1252; the CLI already reconfigures stdout with `errors="replace"`.

## Commands

```bash
# companion
cd companion
npm test            # vitest, src/tests/**/*.test.ts (must stay green)
npm run typecheck
npm run build       # dist/; base './' so it works under any sub-path
npm run data:fetch  # polite fetch of maplestory.io MCW v1 into data-raw/mcw-1 (skips cached)
npm run data:build  # data-raw -> src/data/generated/*.json

# name checker
cd pokemon_name_checker
python -m unittest discover -s tests
python check_names.py --limit 39     # writes output/results.{csv,json}
```

Pushing to `main` runs `.github/workflows/pages.yml`: tests, build, deploy to https://kliu-x.github.io/maplestory_classic_utils/.

## Rules that must not be broken

- **Never label a name "available".** Automated statuses are only `found` / `not_found_in_source` / `error_unknown`. `confirmed_*` statuses come only from a manual in-game check in `data/manual_verifications.csv`.
- **Classic World data only.** It has its own IDs and rebalanced stats (Snail = id 2, 45 HP, 2 EXP). Never pull values from pre-Big-Bang / legacy databases; tests guard against legacy IDs.
- **Every data record carries** `source_url`, `source_title`, `retrieved_at`, `game_version_or_date`, `verification_status` (verified / community / unverified / conflicting).
- **Show conflicts, don't resolve them silently** (e.g. element weakness ×1.25 MeowDB vs ×1.5 legacy).
- Builds without a Classic World source are labelled **proposed**.
- Keep **EXP/cast** and **EXP/min** distinct.
- Damage provenance order: measured → projected → estimated.
- Calculators in `companion/src/calculators/` stay pure and unit-tested.
- No aggressive scraping: respect robots.txt and rate limits (ClassicRank: 20 names/req, 30 req/min, 300 lookups/day without a key). No automation of game login, character creation, CAPTCHAs or anti-bot evasion.
- Ask before adding a paid API, accounts or a backend. Never ship keys to the browser (`CLASSICRANK_READ_KEY` is CLI-only, env var).
