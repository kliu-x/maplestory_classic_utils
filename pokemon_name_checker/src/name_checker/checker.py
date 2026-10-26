"""Load names, run lookups through a source (with cache), and write results."""
from __future__ import annotations

import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from .cache import ResultCache
from .models import (
    CONFIRMED_AVAILABLE,
    CONFIRMED_UNAVAILABLE,
    OUTPUT_FIELDS,
    STATUS_LABELS,
    PokemonEntry,
    ResultRow,
    SourceResult,
)
from .sources.base import SourceAdapter


def _int_or_none(v) -> Optional[int]:
    if v is None or str(v).strip() == "":
        return None
    return int(v)


def load_entries(path: Path) -> List[PokemonEntry]:
    """Read a CSV or JSON list. Accepts `pokemon_name` (or `name`) plus optional
    `lookup_name`, `generation`, `popularity_rank`, `naming_note`."""
    if path.suffix.lower() == ".json":
        raw = json.loads(path.read_text(encoding="utf-8"))
        rows = [{"pokemon_name": r} if isinstance(r, str) else r for r in raw]
    else:
        with path.open(newline="", encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
    entries = []
    for r in rows:
        name = (r.get("pokemon_name") or r.get("name") or "").strip()
        if not name:
            continue
        entries.append(
            PokemonEntry(
                pokemon_name=name,
                lookup_name=(r.get("lookup_name") or name).strip(),
                generation=_int_or_none(r.get("generation")) or 0,
                popularity_rank=_int_or_none(r.get("popularity_rank")),
                naming_note=(r.get("naming_note") or "").strip(),
            )
        )
    return entries


def order_entries(entries: List[PokemonEntry]) -> List[PokemonEntry]:
    """Ranked names first (by rank), then the rest in file order."""
    ranked = sorted((e for e in entries if e.popularity_rank is not None), key=lambda e: e.popularity_rank)
    unranked = [e for e in entries if e.popularity_rank is None]
    return ranked + unranked


def load_manual(path: Optional[Path]) -> Dict[str, dict]:
    """Manual official in-game checks: CSV with name,status,evidence,checked_at_utc.
    status must be confirmed_available or confirmed_unavailable."""
    if not path or not path.exists():
        return {}
    out = {}
    with path.open(newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            status = (r.get("status") or "").strip()
            if status not in (CONFIRMED_AVAILABLE, CONFIRMED_UNAVAILABLE):
                raise ValueError(f"Manual verification for {r.get('name')!r} has invalid status {status!r}")
            out[(r.get("name") or "").strip().lower()] = r
    return out


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def run_checks(
    entries: List[PokemonEntry],
    source: SourceAdapter,
    world: str,
    cache: Optional[ResultCache] = None,
    refresh: bool = False,
    manual: Optional[Dict[str, dict]] = None,
) -> List[ResultRow]:
    world = source.check_world(world)
    manual = manual or {}
    resolved: Dict[str, tuple] = {}  # lookup_name -> (SourceResult, checked_at, from_cache)

    to_query = []
    for e in entries:
        n = e.lookup_name
        if n in resolved or n in to_query:
            continue
        hit = None if (refresh or cache is None) else cache.get(source.name, world, n)
        if hit:
            resolved[n] = (hit[0], hit[1], True)
        else:
            to_query.append(n)

    if to_query:
        fresh = source.lookup_names(to_query, world)
        checked_at = utc_now_iso()
        for n in to_query:
            res = fresh[n]
            resolved[n] = (res, checked_at, False)
            if cache is not None:
                cache.put(source.name, world, n, res, checked_at)

    rows = []
    counts = Counter(e.lookup_name for e in entries)
    for e in entries:
        res, checked_at, from_cache = resolved[e.lookup_name]
        notes = list(res.notes)
        status = res.status
        if e.naming_note:
            notes.insert(0, e.naming_note)
        if counts[e.lookup_name] > 1:
            notes.append(f"Lookup name shared by {counts[e.lookup_name]} entries; queried once.")
        if from_cache:
            notes.append("From local cache.")
        m = manual.get(e.lookup_name.lower())
        if m:
            notes.append(
                f"Automated status was {status}; overridden by manual in-game check "
                f"({m.get('checked_at_utc', 'date unknown')}): {m.get('evidence', '')}".strip()
            )
            status = m["status"].strip()
        rows.append(
            ResultRow(
                pokemon_name=e.pokemon_name,
                lookup_name=e.lookup_name,
                generation=e.generation,
                popularity_rank=e.popularity_rank,
                world=world,
                lookup_status=status,
                matched_character_name=res.matched_character_name,
                matched_level=res.matched_level,
                matched_job=res.matched_job,
                source=source.name,
                checked_at_utc=checked_at,
                notes=" | ".join(notes),
            )
        )
    return rows


def write_outputs(rows: List[ResultRow], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    with (out_dir / "results.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow(r.to_dict())
    payload = {
        "generated_at_utc": utc_now_iso(),
        "status_meanings": STATUS_LABELS,
        "summary": summarize(rows),
        "results": [r.to_dict() for r in rows],
    }
    (out_dir / "results.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def summarize(rows: List[ResultRow]) -> Dict[str, int]:
    """Counts per status; found / not found / error are always present."""
    c = Counter(r.lookup_status for r in rows)
    always = ("found", "not_found_in_source", "error_unknown")
    return {s: c[s] for s in STATUS_LABELS if s in always or c[s]}


def format_summary(rows: List[ResultRow]) -> str:
    lines = [f"Checked {len(rows)} names"]
    for status, n in summarize(rows).items():
        lines.append(f"  {STATUS_LABELS[status]:<50} {n}")
    lines.append("Note: 'not found in source' does NOT mean available; verify in game before relying on it.")
    return "\n".join(lines)
