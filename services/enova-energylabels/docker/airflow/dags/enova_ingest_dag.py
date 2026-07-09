"""Airflow DAG (docker-compose profile): schedule the Enova ingest.

Runs the ingest through the isolated venv built into the image, so no part of
this project is imported into the Airflow interpreter (which pins SQLAlchemy
1.4). All configuration comes from the ENOVA_* env set on the Airflow workers.
"""
from __future__ import annotations

import pendulum
from airflow.decorators import dag, task

VENV_PYTHON = "/home/airflow/enova-venv/bin/python"


@dag(
    dag_id="enova_energy_labels",
    schedule="@daily",
    start_date=pendulum.datetime(2026, 1, 1, tz="Europe/Oslo"),
    catchup=False,
    tags=["enova", "energimerking", "norway"],
    default_args={"retries": 2, "retry_delay": pendulum.duration(minutes=5)},
)
def enova_energy_labels():
    @task.bash
    def ingest() -> str:
        # ENOVA_* (API key, DB URL, year window) are inherited from the env.
        return f"{VENV_PYTHON} -m enova.ingest"

    ingest()


enova_energy_labels()
