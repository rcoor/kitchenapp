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
    # "Offentlige data" serves the full attest set as one bulk file per calendar
    # month:  GET {base}/v{N}/{endpoint}/{year}/{month}  with an x-api-key header,
    # returning a signed URL to a monthly CSV. v2 covers 2026+; earlier years are
    # on v1 (an older CSV layout). The client picks the version by year, so pulling
    # every year+month across both versions gives ALL Norwegian energy labels.
    base_url: str = "https://api.data.enova.no/ems/offentlige-data"
    endpoint: str = "Fil"
    api_key: str = Field(default="", description="Enova API key (sent as the x-api-key header)")
    api_key_header: str = "x-api-key"
    v2_start_year: int = 2026  # first year served by v2; earlier years use v1

    # Which months to pull: [start .. end] inclusive. Default start covers the
    # full history (the scheme dates from ~2010); end defaults to the current
    # month, so a run always reaches the latest published file.
    start_year: int = 2009  # earliest year with published attester
    start_month: int = 1
    end_year: int | None = None
    end_month: int | None = None

    request_timeout: float = 120.0
    # 0 = unlimited; otherwise an upper safety bound on records per run.
    max_records: int = 0

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
