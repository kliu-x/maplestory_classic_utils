"""Convenience launcher: python check_names.py [options]  (same as python -m name_checker)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from name_checker.cli import main  # noqa: E402

sys.exit(main())
