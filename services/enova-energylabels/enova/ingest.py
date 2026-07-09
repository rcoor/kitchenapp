"""Orchestration: pull energy certificates from Enova into Postgres.

Shared by the Airflow DAG and the ``python -m enova.ingest`` CLI so both run the
exact same code path.
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
    kommune: str
    fetched: int
    written: int


def ingest_kommune(client: EnovaClient, engine: Engine, kommunenummer: str, max_total: int) -> IngestResult:
    """Fetch + upsert every attest for one kommune. Returns counts."""
    labels: list[dict] = []
    for raw in client.iter_attester(kommunenummer or None):
        labels.append(extract_label(raw, kommunenummer or None))
        if len(labels) >= max_total:
            break
    written = upsert_labels(engine, labels)
    log.info("kommune %s: fetched %d, wrote %d", kommunenummer or "(all)", len(labels), written)
    return IngestResult(kommune=kommunenummer or "(all)", fetched=len(labels), written=written)


def run_ingest(settings: Settings | None = None, engine: Engine | None = None) -> list[IngestResult]:
    """Ingest all configured kommuner. Creates the table if missing."""
    settings = settings or get_settings()
    engine = engine or create_engine_from_url(settings.database_url)
    init_db(engine)

    client = EnovaClient(
        base_url=settings.base_url,
        endpoint=settings.endpoint,
        api_key=settings.api_key,
        page_size=settings.page_size,
        max_pages=settings.max_pages_per_kommune,
        timeout=settings.request_timeout,
        results_path=settings.results_path,
        param_kommune=settings.param_kommune,
        param_page=settings.param_page,
        param_page_size=settings.param_page_size,
        page_start=settings.page_start,
    )
    try:
        targets = settings.kommune_list or [""]
        return [ingest_kommune(client, engine, knr, settings.max_total) for knr in targets]
    finally:
        client.close()


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    results = run_ingest()
    total = sum(r.written for r in results)
    print(f"Ingested {total} energy labels across {len(results)} kommune(r).")
