"""Airflow DAG: source all Norwegian energy labels from Enova into Postgres.

Enova serves one bulk file per calendar month, so the DAG maps one ingest task
per (year, month) — giving natural parallelism and easy backfill. Configuration
comes from ``ENOVA_*`` env vars (see ``enova.settings.Settings``); set at least
``ENOVA_API_KEY`` and ``ENOVA_DATABASE_URL`` on the Airflow workers.

The heavy lifting lives in the ``enova`` package (also used by the CLI and the
tests), so this file is just the schedule + fan-out wiring.
"""
from __future__ import annotations

import pendulum
from airflow.decorators import dag, task

from enova.db import create_engine_from_url, init_db
from enova.ingest import build_client, ingest_month
from enova.settings import get_settings


@dag(
    dag_id="enova_energy_labels",
    schedule="@daily",
    start_date=pendulum.datetime(2026, 1, 1, tz="Europe/Oslo"),
    catchup=False,
    tags=["enova", "energimerking", "norway"],
    default_args={"retries": 2, "retry_delay": pendulum.duration(minutes=5)},
)
def enova_energy_labels():
    @task
    def list_months() -> list[dict]:
        return [{"year": y, "month": m} for (y, m) in get_settings().year_months]

    @task
    def ingest_file(year: int, month: int) -> dict:
        settings = get_settings()
        engine = create_engine_from_url(settings.database_url)
        init_db(engine)
        client = build_client(settings)
        try:
            result = ingest_month(client, engine, year, month, settings.max_records)
        finally:
            client.close()
        return {"year": result.year, "month": result.month, "fetched": result.fetched, "written": result.written}

    # Dynamic task mapping: one ingest task per (year, month) file.
    ingest_file.expand_kwargs(list_months())


enova_energy_labels()
