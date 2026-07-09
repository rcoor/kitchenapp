"""Runtime configuration for the Enova energy-label ingest + API.

All values come from the environment (12-factor) so the same package runs under
Airflow, the FastAPI server, and local CLI/tests. See ``.env.example``.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ENOVA_", env_file=".env", extra="ignore")

    # --- Enova public-data API (energimerkeordningen / energiattest) ---------
    # Base URL + resource for Enova's public-data API on data.enova.no. The
    # energy-label ("energiattest") endpoint is a POST that filters by kommune
    # and pages the result set. Access needs a free subscription key.
    base_url: str = "https://api.data.enova.no/ems/offentlige-data/v1"
    endpoint: str = "Energiattest"
    api_key: str = Field(default="", description="Ocp-Apim-Subscription-Key from data.enova.no")

    # Comma-separated kommune numbers to pull (the API filters by kommune).
    # Default: Oslo. Empty string = attempt an unfiltered pull (may be rejected).
    kommuner: str = "0301"

    page_size: int = 1000
    max_pages_per_kommune: int = 50
    max_total: int = 100_000
    request_timeout: float = 60.0
    # Optional dotted path to the result array if it is not at the top level.
    results_path: str = ""

    # Request-body field names. These are the *assumed* names for the public
    # energiattest endpoint; the exact contract lives behind login on
    # portal.dev.ems.enova.no. If the real docs differ, override via env
    # (ENOVA_PARAM_*) — no code change needed.
    param_kommune: str = "Kommunenummer"
    param_page: str = "Side"
    param_page_size: str = "AntallPerSide"
    page_start: int = 1  # 1-based paging; set 0 if the API is 0-based

    # --- Storage -------------------------------------------------------------
    database_url: str = "postgresql+psycopg://enova:enova@localhost:5432/enova"

    @property
    def kommune_list(self) -> list[str]:
        return [k.strip() for k in self.kommuner.split(",") if k.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
