"""Orchestration: pull energy certificates from Enova into Postgres.

Shared by the Airflow DAG and the ``python -m enova.ingest`` CLI so both run the
exact same code path. Enova serves one bulk file per calendar month, so the unit
of work is a (year, month) file.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy.engine import Engine

from .client import EnovaClient
from .db import create_engine_from_url, init_db, upsert_labels
from .extract import extract_label
from .settings import Settings, get_settings

log = logging.getLogger("enova.ingest")


@dataclass
class IngestResult:
    year: int
    month: int
    fetched: int
    written: int


def ingest_month(client: EnovaClient, engine: Engine, year: int, month: int, max_records: int = 0) -> IngestResult:
    """Fetch + upsert every attest in one monthly file. Returns counts."""
    labels: list[dict] = []
    for raw in client.iter_month(year, month):
        labels.append(extract_label(raw))
        if max_records and len(labels) >= max_records:
            break
    written = upsert_labels(engine, labels)
    log.info("%04d-%02d: fetched %d, wrote %d", year, month, len(labels), written)
    return IngestResult(year=year, month=month, fetched=len(labels), written=written)


def build_client(settings: Settings) -> EnovaClient:
    return EnovaClient(
        base_url=settings.base_url,
        endpoint=settings.endpoint,
        api_key=settings.api_key,
        api_key_header=settings.api_key_header,
        timeout=settings.request_timeout,
        results_path=settings.results_path,
    )


def run_ingest(settings: Settings | None = None, engine: Engine | None = None) -> list[IngestResult]:
    """Ingest every configured year+month. Creates the table if missing."""
    settings = settings or get_settings()
    engine = engine or create_engine_from_url(settings.database_url)
    init_db(engine)

    client = build_client(settings)
    try:
        return [
            ingest_month(client, engine, y, m, settings.max_records)
            for (y, m) in settings.year_months
        ]
    finally:
        client.close()


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    results = run_ingest()
    total = sum(r.written for r in results)
    print(f"Ingested {total} energy labels across {len(results)} monthly file(s).")
