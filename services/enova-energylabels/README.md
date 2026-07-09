# Enova — Norwegian Energy Labels ingest + API

Sources **all published Norwegian building energy certificates** (energiattester,
`energikarakter` A–G) from [Enova's public-data API](https://data.enova.no) into
**Postgres** and exposes them over a **FastAPI**. An **Airflow DAG** runs the
ingest on a schedule; the same code runs from the CLI and the tests.

Enova serves the certificates as **one bulk CSV per calendar month**, fetched in
two hops, with the API version chosen by year:

```
GET https://api.data.enova.no/ems/offentlige-data/v{1|2}/Fil/{year}/{month}
    x-api-key: <key>
  -> { "fromDate", "toDate", "bankFileUrl": <signed Azure blob URL> }
GET <bankFileUrl>                          # no key; short-lived signed URL
  -> the monthly CSV of energy certificates
```

- **v2** covers **2026+** (energikarakter only; the coloured oppvarmingskarakter
  was removed 2026-01-01, and BRA / weighted-energy / attest-PDF columns added).
- **v1** covers **pre-2026** (older layout: keeps oppvarmingskarakter + fossil-
  andel + energivurdering). Data goes back to **2009**.

Iterating every month from 2009 to now, across both versions, yields **every
certificate exactly once** (each attest appears in the file for the month it was
issued). Verified live end-to-end: 2015-06 → 7 812 rows (v1), 2026-01 → 9 095
rows (v2).

```
Enova v1/v2 monthly CSVs ─(Airflow DAG / CLI)→ Postgres ─→ FastAPI
  GET Fil/{year}/{month}     enova/ingest.py    energy_labels  api/main.py
  → signed URL → CSV         enova/client.py       table
```

## Layout

| Path | What |
|------|------|
| `enova/client.py` | Two-hop fetch (envelope → signed CSV); picks v1/v2 by year |
| `enova/extract.py` | Maps a CSV row (v1 or v2 columns) to a stored record |
| `enova/db.py` | `energy_labels` table (v1∪v2 columns) + portable upsert |
| `enova/ingest.py` | Orchestration (shared by DAG + CLI), one file per (year, month) |
| `dags/enova_energy_labels_dag.py` | Airflow DAG — one mapped task per month |
| `api/main.py` | FastAPI: list/filter, by-attestnummer, grade stats |
| `sql/001_schema.sql` | Reference DDL (also auto-created by the ingest) |
| `tests/fixtures/` | Real v1 + v2 CSV samples (public NLOD data) |

## Configuration

All via `ENOVA_*` env vars (see `.env.example`). At minimum:

- `ENOVA_API_KEY` — your Enova API key (sent as the `x-api-key` header)
- `ENOVA_DATABASE_URL` — e.g. `postgresql+psycopg://enova:enova@localhost:5432/enova`
- `ENOVA_START_YEAR` / `ENOVA_START_MONTH` — backfill window start (default 2009-01)

## Run locally

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
docker compose up -d db                 # a local Postgres

export ENOVA_API_KEY=...                 # your Enova key
export ENOVA_DATABASE_URL=postgresql+psycopg://enova:enova@localhost:5432/enova
python -m enova.ingest                   # full backfill 2009..now (v1 + v2)

uvicorn api.main:app --reload            # http://localhost:8000/docs
```

Run the DAG by pointing an Airflow deployment's `dags/` at this folder and
installing this package on the workers (`pip install -e .`), with the `ENOVA_*`
env set. See `requirements-airflow.txt` for pinning guidance.

## What "all energy labels" covers

- **Every issued certificate** Enova publishes in the public bank files, 2009 →
  now. This is per-**attest** (certificate), not per-building: a building
  re-labelled over the years has one row per certificate. For "current label per
  building", derive the latest `utstedelsesdato` per matrikkel
  (`kommunenummer, gnr, bnr, snr, fnr, bygningsnummer`).
- Only **labelled** buildings appear — there is no row for a building that was
  never energy-labelled.
- Licensed under **NLOD** (Norwegian Licence for Open Government Data).

## Tests

```bash
pip install pytest && python -m pytest
```

Covers CSV parsing (v1 + v2, quoted commas, BOM), the two-hop client (version by
year, 404 / future-400 / auth paths), idempotent upsert, and the API — all
against real-data fixtures, no network or Postgres required.
