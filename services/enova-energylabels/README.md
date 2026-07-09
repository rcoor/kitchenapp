# Enova — Norwegian Energy Labels ingest + API

Sources **all Norwegian building energy certificates** (energiattester,
`energikarakter` A–G) from [Enova's public-data API](https://data.enova.no) and
exposes them over a FastAPI. An Airflow DAG runs the ingest on a schedule; the
same ingest code runs from the CLI and the tests.

```
Enova public-data API  ──(Airflow DAG / CLI)──▶  Postgres  ──▶  FastAPI
   (energiattest,            enova/ingest.py       energy_labels    api/main.py
    POST + kommune filter,   enova/client.py         table
    Ocp-Apim-Subscription-Key)
```

## Layout

| Path | What |
|------|------|
| `enova/client.py` | Paginating client for the Enova energiattest endpoint |
| `enova/extract.py` | Tolerant field extraction (locates fields by name at any depth) |
| `enova/db.py` | `energy_labels` table + dialect-portable upsert |
| `enova/ingest.py` | Orchestration (shared by DAG + CLI) |
| `dags/enova_energy_labels_dag.py` | Airflow DAG — one mapped task per kommune |
| `api/main.py` | FastAPI: list/filter, by-attestnummer, grade stats |
| `sql/001_schema.sql` | Reference DDL (also auto-created by the ingest) |

## Configuration

All via `ENOVA_*` env vars (see `.env.example`). At minimum:

- `ENOVA_API_KEY` — free subscription key from data.enova.no
- `ENOVA_KOMMUNER` — comma-separated kommune numbers (default `0301` = Oslo)
- `ENOVA_DATABASE_URL` — e.g. `postgresql+psycopg://enova:enova@localhost:5432/enova`

## Run locally

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
docker compose up -d db                 # a local Postgres

export ENOVA_API_KEY=...                 # from data.enova.no
export ENOVA_DATABASE_URL=postgresql+psycopg://enova:enova@localhost:5432/enova
python -m enova.ingest                   # one-off backfill

uvicorn api.main:app --reload            # http://localhost:8000/docs
```

Run the DAG by pointing an Airflow deployment's `dags/` at this folder and
installing this package on the workers (`pip install -e .`), with the `ENOVA_*`
env set. See `requirements-airflow.txt` for pinning guidance.

## ⚠️ Enova API schema is assumed, not verified

The **auth model is confirmed** — data.enova.no is Azure API Management, so the
`Ocp-Apim-Subscription-Key` header is correct. But the exact **request body**
(`Kommunenummer` / `Side` / `AntallPerSide`) and **response field names** live
behind login at `portal.dev.ems.enova.no` and could not be fetched when this was
written. Two safeguards:

1. **Extraction is by field name at any depth** (`enova/extract.py`) and keeps
   the full raw record in the `raw` JSONB column — so the mapping survives a
   different response shape and can be verified against live output.
2. **The request schema is env-configurable** (`ENOVA_PARAM_KOMMUNE`,
   `ENOVA_PARAM_PAGE`, `ENOVA_PARAM_PAGE_SIZE`, `ENOVA_PAGE_START`,
   `ENOVA_RESULTS_PATH`) — match it to the real docs without touching code.

Once you have the OpenAPI/Swagger from the portal, confirm those names and the
field extractors in `extract.py`.

## Tests

```bash
pip install pytest && python -m pytest
```

Covers field extraction, client pagination (mocked HTTP), idempotent upsert, and
the API endpoints (against SQLite) — no network or Postgres required.

## Note on energikarakter vs oppvarmingskarakter

Every certificate carries an `energikarakter` (A–G). The coloured
`oppvarmingskarakter` scale was **removed by Enova on 2026-01-01**, so older
attester may still carry it while newer ones do not — it's stored when present.
This is reference data (no ticker/symbol).
