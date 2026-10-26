"""ClassicRank (Windia Rankings) adapter.

Facts verified against https://classicrank.com/developer and live responses on
2026-10-26 (see README "Source research"):

* GET https://classicrank.com/api/v1/characters?names=a,b,c
  - max 20 names per request without a read key, 100 with one
  - 30 requests/minute per IP without a key (60 with a key)
  - names= lookups limited to 300/day per IP without a key
  - 429 + Retry-After when rate limited or busy
* Name matching in the source is case-insensitive ("dragonite" returns "Dragonite").
* Names containing punctuation (e.g. "Mr.Mime") make the whole request fail with 400.
* "Hidden or removed characters are not returned" and only scanned/uploaded
  characters exist in the dataset, so an empty result is NOT proof of availability.
* Only one world ("windia") is served.
"""
from __future__ import annotations

import json
import os
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Tuple

from ..models import ERROR, FOUND, INVALID, NOT_FOUND, SourceResult
from .base import SourceAdapter

API_URL = "https://classicrank.com/api/v1/characters"
FIELDS = "name,level,job,verified,last_checked"
USER_AGENT = "pokemon-name-checker/0.1 (personal name lookups; polite rate limit)"

# Characters the source accepts in names= (anything else -> HTTP 400 for the batch).
VALID_NAME = re.compile(r"^[A-Za-z0-9]{1,13}$")

# (status_code, headers, body). status_code 0 = network error / timeout.
Response = Tuple[int, Dict[str, str], str]
Fetcher = Callable[[str, Dict[str, str], float], Response]


def _ssl_context() -> ssl.SSLContext:
    """Prefer the Mozilla CA bundle (certifi) over the Windows store.

    On some Windows machines Python 3.9 / OpenSSL 1.1.1 builds ClassicRank's new
    Let's Encrypt chain (YE2 -> Root YE -> ISRG Root X2) through an expired
    certificate in the system store and fails with "certificate has expired",
    while certifi's bundle verifies it fine. SSL_CERT_FILE always wins.
    """
    cafile = os.environ.get("SSL_CERT_FILE")
    if not cafile:
        try:
            import certifi  # type: ignore

            cafile = certifi.where()
        except ImportError:
            try:
                from pip._vendor import certifi  # type: ignore  # same bundle, shipped with pip

                cafile = certifi.where()
            except ImportError:
                cafile = None
    return ssl.create_default_context(cafile=cafile)


def urllib_fetch(url: str, headers: Dict[str, str], timeout: float) -> Response:
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, body
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        if isinstance(getattr(e, "reason", e), ssl.SSLCertVerificationError):
            # Not transient: retrying would only burn the rate limit.
            return -1, {}, f"TLS certificate verification failed: {e}. Install certifi or set SSL_CERT_FILE."
        return 0, {}, f"network error: {e}"


class ClassicRankSource(SourceAdapter):
    name = "classicrank"
    supported_worlds = ("windia",)
    coverage_note = (
        "ClassicRank only lists characters its Scanner/uploads have seen; hidden, "
        "removed and never-scanned characters are absent."
    )

    def __init__(
        self,
        fetch: Fetcher = urllib_fetch,
        sleep: Callable[[float], None] = time.sleep,
        read_key: Optional[str] = None,
        timeout: float = 20.0,
        max_retries: int = 4,
        raw_dir: Optional[Path] = None,
    ):
        self.fetch = fetch
        self.sleep = sleep
        self.read_key = read_key if read_key is not None else os.environ.get("CLASSICRANK_READ_KEY", "")
        self.timeout = timeout
        self.max_retries = max_retries
        self.raw_dir = raw_dir
        self.batch_size = 100 if self.read_key else 20
        per_minute = 60 if self.read_key else 30
        # Stay comfortably under the per-minute limit.
        self.min_interval = 60.0 / per_minute * 1.1
        self._last_request = 0.0
        self.requests_made = 0

    # -- public -------------------------------------------------------------
    def lookup_names(self, names: Iterable[str], world: str) -> Dict[str, SourceResult]:
        self.check_world(world)
        results: Dict[str, SourceResult] = {}
        valid: List[str] = []
        seen = set()
        for n in names:
            if n in results or n in seen:
                continue
            if not VALID_NAME.match(n):
                results[n] = SourceResult(
                    n, INVALID, notes=["Source rejects names with non-alphanumeric characters (HTTP 400)."]
                )
                continue
            seen.add(n)
            valid.append(n)

        for i in range(0, len(valid), self.batch_size):
            batch = valid[i : i + self.batch_size]
            results.update(self._lookup_batch(batch))
        return results

    # -- internals ----------------------------------------------------------
    def _headers(self) -> Dict[str, str]:
        h = {"Accept": "application/json", "User-Agent": USER_AGENT}
        if self.read_key:
            h["Authorization"] = f"Bearer {self.read_key}"
        return h

    def _throttle(self) -> None:
        wait = self._last_request + self.min_interval - time.monotonic()
        if self._last_request and wait > 0:
            self.sleep(wait)
        self._last_request = time.monotonic()

    def _save_raw(self, url: str, status: int, body: str) -> None:
        if not self.raw_dir:
            return
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        # URL never contains the key (it is sent as a header), so this is secret-free.
        (self.raw_dir / f"classicrank_{stamp}.json").write_text(
            json.dumps({"url": url, "status": status, "body": body}, indent=1), encoding="utf-8"
        )

    def _lookup_batch(self, batch: List[str]) -> Dict[str, SourceResult]:
        query = urllib.parse.urlencode({"names": ",".join(batch), "fields": FIELDS, "limit": 50})
        url = f"{API_URL}?{query}"
        last_error = ""
        for attempt in range(self.max_retries + 1):
            self._throttle()
            status, headers, body = self.fetch(url, self._headers(), self.timeout)
            self.requests_made += 1
            self._save_raw(url, status, body)
            if status == 200:
                return self._parse(batch, body)
            if status == 429 or status == 0 or status >= 500:
                last_error = f"HTTP {status}" if status else body
                if attempt < self.max_retries:
                    retry_after = headers.get("retry-after", "")
                    delay = float(retry_after) if retry_after.isdigit() else min(60.0, 2.0 * 2 ** attempt)
                    self.sleep(delay)
                    continue
                break
            # 400/403/404, TLS failures (-1) etc: not retryable.
            last_error = body if status < 0 else f"HTTP {status}: {_error_message(body)}"
            break
        return {n: SourceResult(n, ERROR, notes=[f"Lookup failed: {last_error}"]) for n in batch}

    def _parse(self, batch: List[str], body: str) -> Dict[str, SourceResult]:
        try:
            payload = json.loads(body)
            rows = payload["data"]
            if not isinstance(rows, list):
                raise TypeError("data is not a list")
            returned = {}
            for row in rows:
                returned[str(row["name"]).lower()] = row
        except (ValueError, KeyError, TypeError) as e:
            return {n: SourceResult(n, ERROR, notes=[f"Malformed response: {e}"]) for n in batch}

        out = {}
        for n in batch:
            row = returned.get(n.lower())
            if row is None:
                out[n] = SourceResult(n, NOT_FOUND, notes=[self.coverage_note])
                continue
            notes = []
            if row["name"] != n:
                notes.append(
                    f"Source matched case-insensitively ({row['name']!r}); whether the game treats "
                    "different capitalisation as the same name is unverified."
                )
            if row.get("verified") is False:
                notes.append("Record came from a screenshot upload, not the Scanner.")
            if row.get("last_checked"):
                notes.append(f"Source last_checked {row['last_checked']}.")
            out[n] = SourceResult(
                n,
                FOUND,
                matched_character_name=str(row["name"]),
                matched_level=row.get("level"),
                matched_job=row.get("job") or "",
                notes=notes,
            )
        return out


def _error_message(body: str) -> str:
    try:
        return json.loads(body)["error"]["message"]
    except (ValueError, KeyError, TypeError):
        return body[:200]
