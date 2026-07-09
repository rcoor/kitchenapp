"""HTTP client for Enova's public-data (v2) energy-label "bank" files.

The v2 "offentlige data" service works in two hops per calendar month::

    GET {base}/{endpoint}/{year}/{month}       (x-api-key header)
      -> {"fromDate", "toDate", "bankFileUrl"}  # a short-lived signed URL
    GET bankFileUrl                             (Azure blob, no key)
      -> the monthly CSV of energy certificates

v2 covers 2026 onward; earlier months return 404 (historical data lives on a
separate /bank/v1/ endpoint with a different format). Future months return 400.
"""
from __future__ import annotations

import csv
import io
from typing import Any, Iterator

import httpx


class EnovaApiError(RuntimeError):
    pass


def parse_csv(text: str) -> list[dict[str, Any]]:
    """Parse a bank-file CSV (comma-delimited, UTF-8 BOM) into row dicts."""
    text = text.lstrip("﻿")
    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]


class EnovaClient:
    """Fetches Enova monthly energy-label CSVs via the signed-URL envelope."""

    def __init__(
        self,
        base_url: str,
        endpoint: str,
        api_key: str,
        *,
        api_key_header: str = "x-api-key",
        v2_start_year: int = 2026,
        timeout: float = 120.0,
        client: httpx.Client | None = None,
    ) -> None:
        self.root = base_url.rstrip("/")
        self.endpoint = endpoint.strip("/")
        self.api_key = api_key
        self.api_key_header = api_key_header
        self.v2_start_year = v2_start_year
        self._client = client or httpx.Client(timeout=timeout, follow_redirects=True)

    @property
    def _headers(self) -> dict[str, str]:
        return {"Accept": "application/json", "Cache-Control": "no-cache", self.api_key_header: self.api_key}

    def _month_url(self, year: int, month: int) -> str:
        version = 2 if year >= self.v2_start_year else 1
        return f"{self.root}/v{version}/{self.endpoint}/{year}/{month}"

    def get_bank_file_url(self, year: int, month: int) -> str | None:
        """Return the signed CSV URL for a month, or None if there is no file.

        404 => no file for that month. 400 "future" => skip. 401/403 => fatal
        auth error. Other 4xx/5xx => raise. The API version (v1 for pre-2026,
        v2 otherwise) is chosen by year.
        """
        url = self._month_url(year, month)
        resp = self._client.get(url, headers=self._headers)
        if resp.status_code == 404:
            return None
        if resp.status_code == 400 and "future" in resp.text.lower():
            return None
        if resp.status_code in (401, 403):
            raise EnovaApiError(f"Enova API {resp.status_code} (auth) for {url}: {resp.text[:200]}")
        if resp.status_code >= 400:
            raise EnovaApiError(f"Enova API {resp.status_code} for {url}: {resp.text[:200]}")
        return (resp.json() or {}).get("bankFileUrl") or None

    def iter_month(self, year: int, month: int) -> Iterator[dict[str, Any]]:
        """Yield raw CSV rows for one year+month (empty if no file)."""
        file_url = self.get_bank_file_url(year, month)
        if not file_url:
            return
        resp = self._client.get(file_url)
        if resp.status_code >= 400:
            raise EnovaApiError(f"Enova bank file {resp.status_code} for {year}-{month:02d}")
        yield from parse_csv(resp.text)

    def close(self) -> None:
        self._client.close()
