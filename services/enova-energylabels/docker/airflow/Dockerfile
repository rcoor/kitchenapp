# Airflow image for the optional scheduled-ingestion profile.
#
# The ingest runs in an ISOLATED virtualenv (/home/airflow/enova-venv) invoked
# by a BashOperator, so this project's SQLAlchemy 2.0 never clashes with the
# SQLAlchemy 1.4 that Airflow itself pins. Multi-arch base → runs on M1.
FROM apache/airflow:2.10.4-python3.11

COPY --chown=airflow:airflow pyproject.toml /home/airflow/enova-src/pyproject.toml
COPY --chown=airflow:airflow enova /home/airflow/enova-src/enova
COPY --chown=airflow:airflow api /home/airflow/enova-src/api

RUN python -m venv /home/airflow/enova-venv \
 && /home/airflow/enova-venv/bin/pip install --no-cache-dir /home/airflow/enova-src
