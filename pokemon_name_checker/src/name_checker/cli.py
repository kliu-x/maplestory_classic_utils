"""Command-line entry point: python -m name_checker --help"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .cache import ResultCache
from .checker import format_summary, load_entries, load_manual, order_entries, run_checks, write_outputs
from .models import STATUS_LABELS
from .sources import SOURCES, UnsupportedWorldError

ROOT = Path(__file__).resolve().parents[2]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="name_checker",
        description="Check whether Pokemon names appear in public MapleStory Classic World ranking data.",
    )
    p.add_argument("--input", type=Path, default=ROOT / "data" / "pokemon_names.csv", help="CSV or JSON name list")
    p.add_argument("--output", type=Path, default=ROOT / "output", help="Directory for results.csv / results.json")
    p.add_argument("--world", default="windia", help="Game world (default: windia)")
    p.add_argument("--source", default="classicrank", choices=sorted(SOURCES))
    p.add_argument("--limit", type=int, default=None, help="Only check the first N names (ranked names first)")
    p.add_argument("--refresh", action="store_true", help="Ignore cached results")
    p.add_argument("--ttl-hours", type=float, default=24.0, help="Cache lifetime (default 24h)")
    p.add_argument("--cache", type=Path, default=ROOT / "cache" / "results_cache.json")
    p.add_argument("--manual", type=Path, default=ROOT / "data" / "manual_verifications.csv",
                   help="Optional CSV of manual in-game checks (confirmed_available / confirmed_unavailable)")
    p.add_argument("--no-raw", action="store_true", help="Do not save raw API responses")
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    # Windows consoles default to cp1252, which cannot print "Nidoran♀".
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    entries = order_entries(load_entries(args.input))
    if args.limit is not None:
        entries = entries[: args.limit]
    if not entries:
        print("No names to check.", file=sys.stderr)
        return 1

    source = SOURCES[args.source](raw_dir=None if args.no_raw else ROOT / "cache" / "raw")
    cache = ResultCache(args.cache, args.ttl_hours)
    try:
        rows = run_checks(entries, source, args.world, cache=cache, refresh=args.refresh,
                          manual=load_manual(args.manual))
    except UnsupportedWorldError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    cache.save()
    write_outputs(rows, args.output)

    width = max(len(r.pokemon_name) for r in rows)
    for r in rows:
        match = f"-> {r.matched_character_name} (Lv {r.matched_level} {r.matched_job})" if r.matched_character_name else ""
        print(f"{r.pokemon_name:<{width}}  {STATUS_LABELS[r.lookup_status]:<48} {match}")
    print()
    print(format_summary(rows))
    print(f"API requests made this run: {getattr(source, 'requests_made', 'n/a')}")
    print(f"Wrote {args.output / 'results.csv'} and {args.output / 'results.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
