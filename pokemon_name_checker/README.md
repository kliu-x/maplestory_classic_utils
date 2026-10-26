# Pokémon Name Checker — MapleStory Classic World

Bulk-checks whether Gen 1–2 Pokémon names appear in **public MapleStory Classic World ranking data**.
It reports *found in rankings* vs *not found in source*, and **never** reports a name as "available".

## Quick start

Requires Python 3.9+ (standard library only, no `pip install` needed).

```bash
python check_names.py                      # all 251 names, ranked 39 first
python check_names.py --limit 39           # just the prioritized list
python check_names.py --refresh            # ignore the 24h cache
python -m unittest discover -s tests -v    # offline test suite
```

Options: `--input FILE.csv|json`, `--output DIR`, `--world windia`, `--limit N`, `--refresh`,
`--ttl-hours H`, `--manual FILE.csv`, `--no-raw`. Run `python check_names.py --help` for details.

Outputs `output/results.csv` and `output/results.json` with the fields `pokemon_name, lookup_name, generation,
popularity_rank, world, lookup_status, matched_character_name, matched_level, matched_job, source,
checked_at_utc, notes`. Raw API responses are kept in `cache/raw/`. They contain no secrets, because the read key is sent as a header and is never part of the URL.

## Status meanings

| `lookup_status` | Meaning |
|---|---|
| `found` | ClassicRank returned a character with this name. The name is **likely taken** in Windia. |
| `not_found_in_source` | ClassicRank returned no record. **Availability is unconfirmed.** Hidden, removed, unscanned and low-level characters are missing from the source. |
| `error_unknown` | The request failed (network, TLS, 4xx/5xx, malformed JSON) after retries. Errors are never cached. |
| `invalid_for_source` | The name contains characters ClassicRank rejects, e.g. `Ho-Oh`. It was not queried. |
| `confirmed_available` / `confirmed_unavailable` | **Only** set from `data/manual_verifications.csv` after a person checks in-game. The tool never automates login or character creation. |

Example `data/manual_verifications.csv`:
```csv
name,status,evidence,checked_at_utc
Pikachu,confirmed_unavailable,"Character creation said name in use",2026-10-26
```

## Source research (verified 2026-10-26)

**Target game.** MapleStory Classic World is Nexon's classic server; its notes are on nexon.com/maplestory/news. Character names are separate from main MapleStory ([FAQ](https://g.nexonstatic.com/maplestory/cms/v1/news/45385)). The only live world is **Windia**.

**ClassicRank (Windia Rankings).** Docs are at https://classicrank.com/developer and the API index is at https://classicrank.com/api/v1.
- `GET /api/v1/characters?names=a,b,c` is a valid, documented batch endpoint. It needs no key.
  - Limits without a key: **20 names per request**, **30 requests/min per IP**, **300 name lookups/day per IP**.
  - A free read key (`CLASSICRANK_READ_KEY` env var, sent as `Authorization: Bearer`) raises this to 100 names per request and 60 requests/min, with no daily limit.
- Hitting the limit returns 429 with a `Retry-After` header, which the tool honours. The tool also spaces requests about 2.2 s apart.
- **Match semantics (tested live).**
  - Matching is case-insensitive: `dragonite` returns `Dragonite`. The tool flags case differences, because whether the game treats different capitalisation as the same name is unverified.
  - Any name with punctuation (`Mr.Mime`) makes the whole request fail with HTTP 400, so such names are filtered out before sending.
  - 3-letter (`Mew`) and 13-letter names are accepted by the lookup.
- **Coverage caveats (from the docs).**
  - "Hidden or removed characters are not returned."
  - Data comes from the site's Scanner and screenshot uploads, so characters nobody has scanned are missing.
  - The site's ingest API documents names as "4-12 letters/digits", which is its own validation, not an official game rule.
  - On 2026-10-26 the site tracked 210,546 characters with a highest level of 85 (`/api/v1/stats`).
- **Site policy.**
  - `robots.txt` allows `/` for general agents with `Content-Signal: search=yes, ai-train=no, use=reference`.
  - Named AI-training crawlers are disallowed.
  - This tool makes a small number of user-initiated, rate-limited lookups and does no crawling or training.

**Other sources considered.**
- Nexon's own ranking page (https://www.nexon.com/maplestory/rankings) has no documented API for Classic World.
- metaroad.gg ranks EXP/hour from screen reading and has no documented API.
- Neither is used.

**Naming rules.**
- No official Classic World length or charset rule was found.
- Pre-Big-Bang GMS used 4–12 alphanumeric characters, but that is **unverified for Classic World**.
- The test cases are handled explicitly, with notes on every row:

| Pokédex name | Queried as | Why |
|---|---|---|
| Mr. Mime | `MrMime` | The source rejects punctuation and spaces |
| Farfetch'd | `Farfetchd` | The source rejects apostrophes |
| Ho-Oh | `HoOh` | The source rejects hyphens |
| Porygon2 | `Porygon2` | The digit is accepted |
| Nidoran♀ / Nidoran♂ | `NidoranF` / `NidoranM` | These are candidates only |
| Mew | `Mew` | 3 letters is below the 4-char ingest rule, so "not found" is uninformative |

Whether the game accepts the punctuated originals is **unverified**.

**Windows TLS note.** On this machine, Python 3.9 rejected classicrank.com's new Let's Encrypt chain because the Windows certificate store contains an expired root. The tool therefore uses the Mozilla CA bundle when it is available: first `certifi`, then pip's bundled copy. You can override this with the `SSL_CERT_FILE` environment variable.

## Name list

`data/pokemon_names.csv` lists all 251 Gen 1–2 Pokémon in Pokédex order, with standard English spellings.
- `popularity_rank` 1–39 is the **pragmatic recognizability ordering** from the project brief. It is not an official or measured popularity ranking.
- Ranked names are checked first.

## Architecture

```
src/name_checker/
  models.py              statuses + record types
  sources/base.py        SourceAdapter: lookup_names(names, world) -> {name: SourceResult}
  sources/classicrank.py ClassicRank adapter: batching, throttling, retry/backoff, parsing
  cache.py               JSON cache with TTL (errors are not cached)
  checker.py             load input, dedupe, cache, manual overrides, write CSV/JSON
  cli.py                 argparse front end
```

To add another source, subclass `SourceAdapter`, set `name` and `supported_worlds`, and register it in `sources/__init__.py`.

See [FINDINGS.md](FINDINGS.md) for the results of the first live run.
