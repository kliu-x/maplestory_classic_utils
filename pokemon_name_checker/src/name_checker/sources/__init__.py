from .base import SourceAdapter, UnsupportedWorldError
from .classicrank import ClassicRankSource

SOURCES = {ClassicRankSource.name: ClassicRankSource}

__all__ = ["SourceAdapter", "UnsupportedWorldError", "ClassicRankSource", "SOURCES"]
