"""Runtime configuration for the Enova energy-label ingest + API.

All values come from the environment (12-factor) so the same package runs under
Airflow, the FastAPI server, and local CLI/tests. See ``.env.example``.
"""
from __future__ import annotations

from datetime import date
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ENOVA_", env_file=".env", extra="ignore")

    # --- Enova public-data API (energimerkeordningen / energiattest) ---------
    # v2 "offentlige data" serves the full attest set as one bulk file per
    # calendar month:  GET {base}/{endpoint}/{year}/{month}  with an x-api-key
    # header. Fetching every year+month gives all Norwegian energy labels.
    base_url: str = "https://api.data.enova.no/ems/offentlige-data/v2"
    endpoint: str = "Fil"
    api_key: str = Field(default="", description="Enova API key (sent as the x-api-key header)")
    api_key_header: str = "x-api-key"

    # Which months to pull: [start .. end] inclusive. end defaults to the
    # current month, so a run always reaches the latest published file.
    start_year: int = 2010
    start_month: int = 1
    end_year: int | None = None
    end_month: int | None = None

    request_timeout: float = 120.0
    # 0 = unlimited; otherwise an upper safety bound on records per run.
    max_records: int = 0
    # Optional dotted path to the record array inside a file, if it is wrapped.
    results_path: str = ""

    # --- Storage -------------------------------------------------------------
    database_url: str = "postgresql+psycopg://enova:enova@localhost:5432/enova"

    @property
    def year_months(self) -> list[tuple[int, int]]:
        """Inclusive (year, month) pairs from start to end (default: now)."""
        today = date.today()
        end_y = self.end_year or today.year
        end_m = self.end_month or today.month
        out: list[tuple[int, int]] = []
        y, m = self.start_year, self.start_month
        while (y, m) <= (end_y, end_m):
            out.append((y, m))
            m += 1
            if m > 12:
                y, m = y + 1, 1
        return out


@lru_cache
def get_settings() -> Settings:
    return Settings()
