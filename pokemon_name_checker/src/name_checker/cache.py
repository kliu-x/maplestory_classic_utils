"""Tiny JSON-file cache for lookup results, keyed by source/world/name."""
from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from .models import ERROR, SourceResult


class ResultCache:
    def __init__(self, path: Path, ttl_hours: float):
        self.path = path
        self.ttl = timedelta(hours=ttl_hours)
        self._data = {}
        if path.exists():
            try:
                self._data = json.loads(path.read_text(encoding="utf-8"))
            except ValueError:
                self._data = {}

    @staticmethod
    def key(source: str, world: str, name: str) -> str:
        return f"{source}|{world.lower()}|{name}"

    def get(self, source: str, world: str, name: str, now: Optional[datetime] = None):
        """Return (SourceResult, checked_at_iso) or None if missing/expired."""
        entry = self._data.get(self.key(source, world, name))
        if not entry:
            return None
        checked = datetime.fromisoformat(entry["checked_at_utc"].replace("Z", "+00:00"))
        if (now or datetime.now(timezone.utc)) - checked > self.ttl:
            return None
        return SourceResult(**entry["result"]), entry["checked_at_utc"]

    def put(self, source: str, world: str, name: str, result: SourceResult, checked_at: str) -> None:
        # Errors are never cached, so they are retried next run.
        if result.status == ERROR:
            return
        self._data[self.key(source, world, name)] = {"checked_at_utc": checked_at, "result": asdict(result)}

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self._data, indent=1, sort_keys=True), encoding="utf-8")
