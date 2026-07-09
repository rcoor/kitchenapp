"""HTTP client for Enova's public-data energy-label ("energiattest") API.

The endpoint is a POST that filters by kommune and pages the result set. Each
page is a JSON array (or an object wrapping one — several envelope keys are
tried). Authentication is the ``Ocp-Apim-Subscription-Key`` header.
"""
from __future__ import annotations

from typing import Any, Iterator

import httpx

_ENVELOPE_KEYS = ("Energiattestene", "energiattester", "results", "value", "data", "items")


def _get_path(obj: Any, path: str) -> Any:
    if not path or path == "$":
        return obj
    cur = obj
    for key in path.lstrip("$.").split("."):
        if cur is None:
            return None
        cur = cur.get(key) if isinstance(cur, dict) else None
    return cur


def _rows_from_response(body: Any, results_path: str) -> list[dict[str, Any]]:
    rows = _get_path(body, results_path) if results_path else body
    if isinstance(rows, list):
        return rows
    if isinstance(body, dict):
        for key in _ENVELOPE_KEYS:
            if isinstance(body.get(key), list):
                return body[key]
    return []


class EnovaClient:
    """Pages through Enova energy certificates for one or more kommuner."""

    def __init__(
        self,
        base_url: str,
        endpoint: str,
        api_key: str,
        *,
        page_size: int = 1000,
        max_pages: int = 50,
        timeout: float = 60.0,
        results_path: str = "",
        param_kommune: str = "Kommunenummer",
        param_page: str = "Side",
        param_page_size: str = "AntallPerSide",
        page_start: int = 1,
        client: httpx.Client | None = None,
    ) -> None:
        self.url = f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}"
        self.api_key = api_key
        self.page_size = page_size
        self.max_pages = max_pages
        self.results_path = results_path
        self.param_kommune = param_kommune
        self.param_page = param_page
        self.param_page_size = param_page_size
        self.page_start = page_start
        self._client = client or httpx.Client(timeout=timeout)

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Ocp-Apim-Subscription-Key": self.api_key,
        }

    def iter_attester(self, kommunenummer: str | None) -> Iterator[dict[str, Any]]:
        """Yield raw attest records for a kommune, following pagination."""
        for i in range(self.max_pages):
            page = self.page_start + i
            body: dict[str, Any] = {self.param_page: page, self.param_page_size: self.page_size}
            if kommunenummer:
                body[self.param_kommune] = kommunenummer
            first_page = i == 0

            resp = self._client.post(self.url, json=body, headers=self._headers)
            if resp.status_code >= 400:
                # A failure on the very first page is fatal (bad key / bad schema);
                # a later-page failure just ends pagination for this kommune.
                if first_page:
                    raise EnovaApiError(
                        f"Enova API {resp.status_code} for kommune "
                        f"{kommunenummer or '(all)'}: {resp.text[:200]}"
                    )
                return

            rows = _rows_from_response(resp.json(), self.results_path)
            if not rows:
                return
            yield from rows
            if len(rows) < self.page_size:
                return  # short page => last page

    def close(self) -> None:
        self._client.close()


class EnovaApiError(RuntimeError):
    pass
