"""Offline tests: every HTTP call goes through a fake fetcher."""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from name_checker.cache import ResultCache  # noqa: E402
from name_checker.checker import load_entries, run_checks, summarize, write_outputs  # noqa: E402
from name_checker.models import ERROR, FOUND, INVALID, NOT_FOUND, PokemonEntry  # noqa: E402
from name_checker.sources import ClassicRankSource, UnsupportedWorldError  # noqa: E402

DB = {"dragonite": {"name": "Dragonite", "level": 38, "job": "Spearman", "verified": True,
                    "last_checked": "2026-10-26T15:36:10Z"}}


class FakeFetch:
    """Answers like the real API: case-insensitive names= matching against DB."""

    def __init__(self, script=None):
        self.script = list(script or [])  # queued (status, headers, body) to return first
        self.calls = []

    def __call__(self, url, headers, timeout):
        self.calls.append(url)
        if self.script:
            return self.script.pop(0)
        names = parse_qs(urlparse(url).query)["names"][0].split(",")
        rows = [DB[n.lower()] for n in names if n.lower() in DB]
        return 200, {}, json.dumps({"data": rows, "meta": {"total": len(rows)}})


def make_source(fetch, **kw):
    return ClassicRankSource(fetch=fetch, sleep=lambda s: None, read_key="", **kw)


def entry(name, lookup=None):
    return PokemonEntry(pokemon_name=name, lookup_name=lookup or name, generation=1)


class ClassicRankTests(unittest.TestCase):
    def test_exact_match_found(self):
        res = make_source(FakeFetch()).lookup_names(["Dragonite"], "windia")
        r = res["Dragonite"]
        self.assertEqual(r.status, FOUND)
        self.assertEqual(r.matched_character_name, "Dragonite")
        self.assertEqual(r.matched_level, 38)
        self.assertFalse(any("case-insensitively" in n for n in r.notes))

    def test_empty_result_is_not_found_never_available(self):
        r = make_source(FakeFetch()).lookup_names(["Pikachu"], "windia")["Pikachu"]
        self.assertEqual(r.status, NOT_FOUND)
        self.assertNotIn("available", r.status)
        self.assertTrue(r.notes)  # coverage caveat attached

    def test_case_variation_is_flagged(self):
        r = make_source(FakeFetch()).lookup_names(["dragonite"], "windia")["dragonite"]
        self.assertEqual(r.status, FOUND)
        self.assertEqual(r.matched_character_name, "Dragonite")
        self.assertTrue(any("case-insensitively" in n for n in r.notes))

    def test_malformed_response(self):
        fetch = FakeFetch(script=[(200, {}, "<html>oops</html>")])
        r = make_source(fetch).lookup_names(["Pikachu"], "windia")["Pikachu"]
        self.assertEqual(r.status, ERROR)
        self.assertIn("Malformed", r.notes[0])

    def test_missing_data_key_is_malformed(self):
        fetch = FakeFetch(script=[(200, {}, json.dumps({"meta": {}}))])
        self.assertEqual(make_source(fetch).lookup_names(["Pikachu"], "windia")["Pikachu"].status, ERROR)

    def test_timeout_retries_then_errors(self):
        fetch = FakeFetch(script=[(0, {}, "network error: timed out")] * 10)
        src = make_source(fetch, max_retries=2)
        r = src.lookup_names(["Pikachu"], "windia")["Pikachu"]
        self.assertEqual(r.status, ERROR)
        self.assertEqual(len(fetch.calls), 3)

    def test_timeout_then_success(self):
        fetch = FakeFetch(script=[(0, {}, "network error: timed out")])
        r = make_source(fetch).lookup_names(["Dragonite"], "windia")["Dragonite"]
        self.assertEqual(r.status, FOUND)
        self.assertEqual(len(fetch.calls), 2)

    def test_429_honours_retry_after(self):
        slept = []
        fetch = FakeFetch(script=[(429, {"retry-after": "7"}, "")])
        src = ClassicRankSource(fetch=fetch, sleep=slept.append, read_key="")
        r = src.lookup_names(["Dragonite"], "windia")["Dragonite"]
        self.assertEqual(r.status, FOUND)
        self.assertIn(7.0, slept)

    def test_400_not_retried(self):
        fetch = FakeFetch(script=[(400, {}, json.dumps({"error": {"status": 400, "message": "bad"}}))])
        r = make_source(fetch).lookup_names(["Pikachu"], "windia")["Pikachu"]
        self.assertEqual(r.status, ERROR)
        self.assertEqual(len(fetch.calls), 1)
        self.assertIn("bad", r.notes[0])

    def test_tls_failure_not_retried(self):
        fetch = FakeFetch(script=[(-1, {}, "TLS certificate verification failed: expired")])
        r = make_source(fetch).lookup_names(["Pikachu"], "windia")["Pikachu"]
        self.assertEqual(r.status, ERROR)
        self.assertEqual(len(fetch.calls), 1)
        self.assertIn("TLS", r.notes[0])

    def test_duplicates_queried_once(self):
        fetch = FakeFetch()
        res = make_source(fetch).lookup_names(["Pikachu", "Pikachu", "Dragonite"], "windia")
        self.assertEqual(len(res), 2)
        names = parse_qs(urlparse(fetch.calls[0]).query)["names"][0].split(",")
        self.assertEqual(names, ["Pikachu", "Dragonite"])

    def test_punctuated_names_never_sent(self):
        fetch = FakeFetch()
        res = make_source(fetch).lookup_names(["Mr. Mime", "Ho-Oh", "Farfetch'd", "HoOh"], "windia")
        self.assertEqual(res["Mr. Mime"].status, INVALID)
        self.assertEqual(res["Ho-Oh"].status, INVALID)
        self.assertEqual(res["Farfetch'd"].status, INVALID)
        self.assertEqual(res["HoOh"].status, NOT_FOUND)
        self.assertEqual(len(fetch.calls), 1)

    def test_batches_of_20_without_key(self):
        fetch = FakeFetch()
        names = [f"Name{i:02d}" for i in range(45)]
        make_source(fetch).lookup_names(names, "windia")
        self.assertEqual(len(fetch.calls), 3)

    def test_read_key_raises_batch_size_and_stays_out_of_url(self):
        fetch = FakeFetch()
        seen_headers = []
        def f(url, headers, timeout):
            seen_headers.append(headers)
            return fetch(url, headers, timeout)
        src = ClassicRankSource(fetch=f, sleep=lambda s: None, read_key="crk_secret")
        src.lookup_names([f"Name{i:03d}" for i in range(150)], "windia")
        self.assertEqual(len(fetch.calls), 2)
        self.assertTrue(all("crk_secret" not in u for u in fetch.calls))
        self.assertEqual(seen_headers[0]["Authorization"], "Bearer crk_secret")

    def test_unsupported_world(self):
        with self.assertRaises(UnsupportedWorldError):
            make_source(FakeFetch()).lookup_names(["Pikachu"], "scania")

    def test_world_is_case_insensitive(self):
        self.assertEqual(make_source(FakeFetch()).lookup_names(["Dragonite"], "Windia")["Dragonite"].status, FOUND)


class CheckerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_cache_hit_skips_network_and_refresh_bypasses(self):
        cache = ResultCache(self.tmp / "c.json", ttl_hours=24)
        fetch = FakeFetch()
        run_checks([entry("Dragonite")], make_source(fetch), "windia", cache=cache)
        self.assertEqual(len(fetch.calls), 1)
        rows = run_checks([entry("Dragonite")], make_source(fetch), "windia", cache=cache)
        self.assertEqual(len(fetch.calls), 1)
        self.assertIn("cache", rows[0].notes)
        run_checks([entry("Dragonite")], make_source(fetch), "windia", cache=cache, refresh=True)
        self.assertEqual(len(fetch.calls), 2)

    def test_cache_expires(self):
        cache = ResultCache(self.tmp / "c.json", ttl_hours=1)
        run_checks([entry("Dragonite")], make_source(FakeFetch()), "windia", cache=cache)
        later = datetime.now(timezone.utc) + timedelta(hours=2)
        self.assertIsNone(cache.get("classicrank", "windia", "Dragonite", now=later))

    def test_errors_not_cached(self):
        cache = ResultCache(self.tmp / "c.json", ttl_hours=24)
        bad = FakeFetch(script=[(400, {}, "{}")])
        run_checks([entry("Pikachu")], make_source(bad), "windia", cache=cache)
        self.assertIsNone(cache.get("classicrank", "windia", "Pikachu"))

    def test_shared_lookup_name(self):
        fetch = FakeFetch()
        rows = run_checks([entry("Nidoran♀", "Nidoran"), entry("Nidoran♂", "Nidoran")],
                          make_source(fetch), "windia")
        self.assertEqual(len(rows), 2)
        self.assertEqual(len(fetch.calls), 1)
        self.assertIn("shared by 2", rows[0].notes)

    def test_manual_override_is_the_only_way_to_confirm(self):
        manual = {"pikachu": {"status": "confirmed_unavailable", "evidence": "name taken at creation screen",
                              "checked_at_utc": "2026-10-26"}}
        rows = run_checks([entry("Pikachu")], make_source(FakeFetch()), "windia", manual=manual)
        self.assertEqual(rows[0].lookup_status, "confirmed_unavailable")
        self.assertIn("not_found_in_source", rows[0].notes)

    def test_outputs_and_summary(self):
        rows = run_checks([entry("Dragonite"), entry("Pikachu"), entry("Ho-Oh")],
                          make_source(FakeFetch()), "windia")
        write_outputs(rows, self.tmp)
        data = json.loads((self.tmp / "results.json").read_text(encoding="utf-8"))
        self.assertEqual(data["summary"], {"found": 1, "not_found_in_source": 1, "error_unknown": 0,
                                           "invalid_for_source": 1})
        header = (self.tmp / "results.csv").read_text(encoding="utf-8").splitlines()[0].split(",")
        for col in ["pokemon_name", "generation", "popularity_rank", "world", "lookup_status",
                    "matched_character_name", "source", "checked_at_utc", "notes"]:
            self.assertIn(col, header)
        self.assertNotIn("available", summarize(rows))

    def test_bundled_name_list(self):
        entries = load_entries(Path(__file__).resolve().parents[1] / "data" / "pokemon_names.csv")
        self.assertEqual(len(entries), 251)
        self.assertEqual(sum(1 for e in entries if e.popularity_rank), 39)
        by_name = {e.pokemon_name: e for e in entries}
        self.assertEqual(by_name["Ho-Oh"].lookup_name, "HoOh")
        self.assertEqual(by_name["Mr. Mime"].lookup_name, "MrMime")
        self.assertEqual(by_name["Farfetch'd"].lookup_name, "Farfetchd")
        self.assertEqual(by_name["Porygon2"].lookup_name, "Porygon2")
        self.assertTrue(all(e.generation in (1, 2) for e in entries))


if __name__ == "__main__":
    unittest.main()
