"""Source adapter interface. Add new ranking sources by subclassing SourceAdapter."""
from __future__ import annotations

from typing import Dict, Iterable

from ..models import SourceResult


class UnsupportedWorldError(ValueError):
    pass


class SourceAdapter:
    name = "base"
    #: Worlds this source covers, lower-case.
    supported_worlds: tuple = ()
    #: Free-text coverage caveat copied into every result's notes.
    coverage_note = ""

    def check_world(self, world: str) -> str:
        w = world.strip().lower()
        if w not in self.supported_worlds:
            raise UnsupportedWorldError(
                f"Source {self.name!r} does not cover world {world!r}. "
                f"Supported: {', '.join(self.supported_worlds) or 'none'}"
            )
        return w

    def lookup_names(self, names: Iterable[str], world: str) -> Dict[str, SourceResult]:
        """Return one SourceResult per distinct input name, keyed by the input name."""
        raise NotImplementedError
