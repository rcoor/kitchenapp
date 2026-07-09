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
issued).

**Verified live at full scale** (a whole-history sourcing run, 2009 → 2026):

| | |
|---|---|
| Certificates (attester) | **1 822 500** |
| Distinct building units | **1 337 787** |
| Grades | A 64 256 · B 209 212 · C 225 118 · D 321 766 · E 278 349 · F 324 339 · G 399 460 |

(~18 whole-year requests via `iter_year`; the grade counts sum exactly to the
total.)

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

## Quick start with Docker (Apple Silicon / M1 ready)

Everything runs in containers — no local Python needed. All images are
multi-arch, so they run natively on arm64 (M1/M2) with no emulation.

```bash
cp .env.example .env         # then set ENOVA_API_KEY=...
docker compose up --build    # Postgres + one-shot backfill + API
```

- **API** → http://localhost:8000/docs
- The `ingest` container back-fills every certificate then exits; the `api`
  container creates the table on startup, so it serves immediately (and fills as
  the backfill runs). Data persists in the `enova_pgdata` volume.
- A full history backfill is ~1.8M rows / ~2 GB / ~20 min. For a quick trial set
  `ENOVA_START_YEAR=2025` in `.env`.

Handy targets (see `Makefile`): `make up`, `make ingest` (refresh), `make psql`,
`make down`, `make clean` (wipe volume).

### Optional: Airflow (scheduled ingestion)

```bash
docker compose --profile airflow up --build   # UI at http://localhost:8080 (admin/admin)
```

The Airflow image installs the ingest into an isolated venv and runs it via a
BashOperator, so Airflow's SQLAlchemy 1.4 never clashes with this project's
SQLAlchemy 2.0.

## Run without Docker

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

export ENOVA_API_KEY=...                 # your Enova key
export ENOVA_DATABASE_URL=postgresql+psycopg://enova:enova@localhost:5432/enova
python -m enova.ingest                   # full backfill 2009..now (v1 + v2)
uvicorn api.main:app --reload            # http://localhost:8000/docs
```

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
