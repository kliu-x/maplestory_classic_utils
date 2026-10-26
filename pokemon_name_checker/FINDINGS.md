# Findings: first live run

- **Run:** 2026-10-26 20:56 UTC with `python check_names.py`. All 251 Gen 1–2 names were checked in 13 API requests.
- **Source:** ClassicRank `GET /api/v1/characters?names=`, no read key.
- **World:** Windia, the only Classic World world the source covers.
- **Full table:** [output/results.csv](output/results.csv). The data is a snapshot, so re-run with `--refresh` for current values.

| Result | All 251 | Prioritized 39 |
|---|---|---|
| Found in rankings (likely taken) | 69 | 9 |
| Not found in source (**availability unconfirmed**) | 182 | 30 |
| Error / unknown | 0 | 0 |

## Prioritized 39: found (likely taken in Windia)

| Rank | Name | Character returned |
|---|---|---|
| 8 | Dragonite | Dragonite, Lv 38 Spearman |
| 11 | Bulbasaur | Bulbasaur, Lv 37 Wizard (F/P) |
| 12 | Ditto | Ditto, Lv 33 Hunter |
| 14 | Umbreon | Umbreon, Lv 26 Thief |
| 23 | Magikarp | Magikarp, Lv 58 Spearman |
| 26 | Scizor | Scizor, Lv 41 Assassin |
| 28 | Lugia | Lugia, Lv 45 Assassin |
| 32 | Totodile | Totodile, Lv 50 Bandit |
| 35 | Ampharos | Ampharos, Lv 27 Magician |

## Prioritized 39: not found in source

Pikachu, Eevee, Charizard, Mewtwo, Gengar, Mew, Snorlax, Charmander, Squirtle, Gyarados, Blastoise, Venusaur,
Jigglypuff, Psyduck, Vulpix, Lapras, Arcanine, Growlithe, Raichu, Espeon, Tyranitar, HoOh, Suicune, Celebi,
Cyndaquil, Chikorita, Steelix, Togepi, Porygon2, Ninetales.

**Do not read this list as "available".** Names like Pikachu, Eevee and Charizard were almost certainly claimed at launch. Their absence most likely means the character is hidden, removed, low-level or has never been scanned by ClassicRank. The only way to confirm availability is to try the name at character creation, then record it in `data/manual_verifications.csv`.

## Naming-rule test cases

| Name | Status | Note |
|---|---|---|
| MrMime | **found** | A character named `MrMime` exists. This shows the alphanumeric spelling is a valid in-game name. |
| HoOh / Farfetchd / NidoranF / NidoranM | not found in source | These spellings were queried. Whether the game allows the punctuated originals is unverified. |
| Porygon2 | not found in source | The source accepts digits. |
| Mew | not found in source | A 3-letter name may be invalid in game (the source documents 4–12 chars), so the result is uninformative. |
