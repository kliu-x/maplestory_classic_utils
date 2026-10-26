"""Normalized record types shared by every source adapter."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Optional

# Lookup statuses. NOT_FOUND never means "available": public rankings omit
# hidden, removed, low-level and never-scanned characters.
FOUND = "found"
NOT_FOUND = "not_found_in_source"
ERROR = "error_unknown"
INVALID = "invalid_for_source"
# Only ever set from a manual verification file (an official in-game check
# performed by a human). Never produced by an automated lookup.
CONFIRMED_AVAILABLE = "confirmed_available"
CONFIRMED_UNAVAILABLE = "confirmed_unavailable"

ALL_STATUSES = (FOUND, NOT_FOUND, ERROR, INVALID, CONFIRMED_AVAILABLE, CONFIRMED_UNAVAILABLE)

STATUS_LABELS = {
    FOUND: "Found in rankings (likely taken)",
    NOT_FOUND: "Not found in source (availability unconfirmed)",
    ERROR: "Error / unknown",
    INVALID: "Not a valid name for this source",
    CONFIRMED_AVAILABLE: "Confirmed available (manual in-game check)",
    CONFIRMED_UNAVAILABLE: "Confirmed unavailable (manual in-game check)",
}

OUTPUT_FIELDS = [
    "pokemon_name",
    "lookup_name",
    "generation",
    "popularity_rank",
    "world",
    "lookup_status",
    "matched_character_name",
    "matched_level",
    "matched_job",
    "source",
    "checked_at_utc",
    "notes",
]


@dataclass
class PokemonEntry:
    pokemon_name: str  # Pokedex spelling, punctuation preserved (e.g. "Ho-Oh")
    lookup_name: str  # candidate in-game spelling actually queried (e.g. "HoOh")
    generation: int
    popularity_rank: Optional[int] = None
    naming_note: str = ""


@dataclass
class SourceResult:
    """What a source adapter returns for one queried name."""

    query_name: str
    status: str
    matched_character_name: str = ""
    matched_level: Optional[int] = None
    matched_job: str = ""
    notes: list = field(default_factory=list)


@dataclass
class ResultRow:
    pokemon_name: str
    lookup_name: str
    generation: int
    popularity_rank: Optional[int]
    world: str
    lookup_status: str
    matched_character_name: str
    matched_level: Optional[int]
    matched_job: str
    source: str
    checked_at_utc: str
    notes: str

    def to_dict(self) -> dict:
        return asdict(self)
