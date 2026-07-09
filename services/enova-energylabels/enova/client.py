"""HTTP client for Enova's public-data (v2) energy-label bulk files.

The v2 "offentlige data" service exposes the full attest set as one file per
calendar month::

    GET {base}/{endpoint}/{year}/{month}
    x-api-key: <key>

Fetching every year+month yields all Norwegian energy labels. Each file is JSON
(an array, or an object wrapping one) — an NDJSON fallback is also handled.
"""
from __future__ import annotations

import json
from typing import Any, Iterator

import httpx

_ENVELOPE_KEYS = ("Energiattestene", "energiattester", "Energiattester", "results", "value", "data", "items")


def _get_path(obj: Any, path: str) -> Any:
    if not path or path == "$":
        return obj
    cur = obj
    for key in path.lstrip("$.").split("."):
        if cur is None:
            return None
        cur = cur.get(key) if isinstance(cur, dict) else None
    return cur


def parse_file_body(text: str, results_path: str = "") -> list[dict[str, Any]]:
    """Parse a monthly file body into a list of attest records.

    Handles a top-level JSON array, an object wrapping the array (several
    envelope keys tried, or an explicit ``results_path``), and NDJSON.
    """
    text = text.strip()
    if not text:
        return []
    try:
        body = json.loads(text)
    except json.JSONDecodeError:
        # NDJSON: one JSON object per line.
        rows = []
        for line in text.splitlines():
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return [r for r in rows if isinstance(r, dict)]

    if results_path:
        picked = _get_path(body, results_path)
        return picked if isinstance(picked, list) else []
    if isinstance(body, list):
        return [r for r in body if isinstance(r, dict)]
    if isinstance(body, dict):
        for key in _ENVELOPE_KEYS:
            if isinstance(body.get(key), list):
                return [r for r in body[key] if isinstance(r, dict)]
    return []


class EnovaClient:
    """Downloads Enova monthly energy-label files."""

    def __init__(
        self,
        base_url: str,
        endpoint: str,
        api_key: str,
        *,
        api_key_header: str = "x-api-key",
        timeout: float = 120.0,
        results_path: str = "",
        client: httpx.Client | None = None,
    ) -> None:
        self.base = f"{base_url.rstrip('/')}/{endpoint.strip('/')}"
        self.api_key = api_key
        self.api_key_header = api_key_header
        self.results_path = results_path
        self._client = client or httpx.Client(timeout=timeout)

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            self.api_key_header: self.api_key,
        }

    def iter_month(self, year: int, month: int) -> Iterator[dict[str, Any]]:
        """Yield raw attest records for one year+month file.

        A 404 means "no file for that month" (e.g. a future month) and yields
        nothing. 401/403 is fatal (bad/missing key). Other errors raise too.
        """
        url = f"{self.base}/{year}/{month}"
        resp = self._client.get(url, headers=self._headers)
        if resp.status_code == 404:
            return
        if resp.status_code in (401, 403):
            raise EnovaApiError(f"Enova API {resp.status_code} (auth) for {url}: {resp.text[:200]}")
        if resp.status_code >= 400:
            raise EnovaApiError(f"Enova API {resp.status_code} for {url}: {resp.text[:200]}")
        yield from parse_file_body(resp.text, self.results_path)

    def close(self) -> None:
        self._client.close()


class EnovaApiError(RuntimeError):
    pass
