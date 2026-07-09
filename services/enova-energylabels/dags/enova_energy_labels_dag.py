"""Airflow DAG: source all Norwegian energy labels from Enova into Postgres.

One task per configured kommune so a slow/failing kommune is retried in
isolation and the fan-out parallelises. Configuration comes from ``ENOVA_*``
environment variables (see ``enova.settings.Settings``); set at least
``ENOVA_API_KEY`` and ``ENOVA_DATABASE_URL`` on the Airflow workers.

The heavy lifting lives in the ``enova`` package (also used by the CLI and the
tests), so this file is just the schedule + fan-out wiring.
"""
from __future__ import annotations

import pendulum
from airflow.decorators import dag, task

from enova.client import EnovaClient
from enova.db import create_engine_from_url, init_db
from enova.ingest import ingest_kommune
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
    def list_kommuner() -> list[str]:
        return get_settings().kommune_list or [""]

    @task
    def ingest_one(kommunenummer: str) -> dict:
        settings = get_settings()
        engine = create_engine_from_url(settings.database_url)
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
            result = ingest_kommune(client, engine, kommunenummer, settings.max_total)
        finally:
            client.close()
        return {"kommune": result.kommune, "fetched": result.fetched, "written": result.written}

    # Dynamic task mapping: one ingest task per kommune.
    ingest_one.expand(kommunenummer=list_kommuner())


enova_energy_labels()
