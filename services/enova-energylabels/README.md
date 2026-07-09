# Enova — Norwegian Energy Labels ingest + API

Sources **all Norwegian building energy certificates** (energiattester,
`energikarakter` A–G) from [Enova's public-data API](https://data.enova.no) and
exposes them over a FastAPI. An Airflow DAG runs the ingest on a schedule; the
same ingest code runs from the CLI and the tests.

Enova's v2 "offentlige data" service publishes the full attest set as **one bulk
file per calendar month**:

```
GET https://api.data.enova.no/ems/offentlige-data/v2/Fil/{year}/{month}
x-api-key: <your key>
```

Fetching every year+month gives every Norwegian energy label.

```
Enova v2 monthly files ──(Airflow DAG / CLI)──▶ Postgres ──▶ FastAPI
  GET Fil/{year}/{month}    enova/ingest.py      energy_labels   api/main.py
  x-api-key                 enova/client.py         table
```

## Layout

| Path | What |
|------|------|
| `enova/client.py` | Downloads + parses the monthly `Fil/{year}/{month}` files |
| `enova/extract.py` | Tolerant field extraction (locates fields by name at any depth) |
| `enova/db.py` | `energy_labels` table + dialect-portable upsert |
| `enova/ingest.py` | Orchestration (shared by DAG + CLI), one file per (year, month) |
| `dags/enova_energy_labels_dag.py` | Airflow DAG — one mapped task per month |
| `api/main.py` | FastAPI: list/filter, by-attestnummer, grade stats |
| `sql/001_schema.sql` | Reference DDL (also auto-created by the ingest) |

## Configuration

All via `ENOVA_*` env vars (see `.env.example`). At minimum:

- `ENOVA_API_KEY` — your Enova API key (sent as the `x-api-key` header)
- `ENOVA_DATABASE_URL` — e.g. `postgresql+psycopg://enova:enova@localhost:5432/enova`
- `ENOVA_START_YEAR` / `ENOVA_START_MONTH` — start of the backfill window
  (end defaults to the current month)

## Run locally

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
docker compose up -d db                 # a local Postgres

export ENOVA_API_KEY=...                 # your Enova key
export ENOVA_DATABASE_URL=postgresql+psycopg://enova:enova@localhost:5432/enova
python -m enova.ingest                   # backfill all months start..now

uvicorn api.main:app --reload            # http://localhost:8000/docs
```

Run the DAG by pointing an Airflow deployment's `dags/` at this folder and
installing this package on the workers (`pip install -e .`), with the `ENOVA_*`
env set. See `requirements-airflow.txt` for pinning guidance.

## ⚠️ File record schema is assumed, not verified

The **access model is confirmed** — v2 `GET Fil/{year}/{month}` with an
`x-api-key` header. What could **not** be verified against a live response is the
exact **field layout inside each file** (the record objects). Two safeguards:

1. **Extraction is by field name at any depth** (`enova/extract.py`) and keeps
   the full raw record in the `raw` JSONB column — so the mapping survives the
   real shape and can be corrected against live output.
2. **File parsing is format-tolerant** (`enova/client.py`): a top-level JSON
   array, an object wrapping the array, or NDJSON are all handled; an explicit
   `ENOVA_RESULTS_PATH` can point at a nested array.

After a first live run, sanity-check a stored `raw` value and tighten the field
extractors in `extract.py` if any names differ.

> **Secrets:** the API key is read from `ENOVA_API_KEY` and never committed. Keep
> it in your secret store / Airflow connection, not in the repo.

## Tests

```bash
pip install pytest && python -m pytest
```

Covers file parsing (array / envelope / NDJSON), the monthly client (mocked
HTTP, incl. 404 + auth errors), idempotent upsert, and the API endpoints
(against SQLite) — no network or Postgres required.

## Note on energikarakter vs oppvarmingskarakter

Every certificate carries an `energikarakter` (A–G). The coloured
`oppvarmingskarakter` scale was **removed by Enova on 2026-01-01**, so older
attester may still carry it while newer ones do not — it's stored when present.
This is reference data (no ticker/symbol).
