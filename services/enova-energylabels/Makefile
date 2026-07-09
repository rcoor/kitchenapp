.PHONY: up down logs ingest psql api airflow test clean

# Core stack: Postgres + one-shot backfill + API (http://localhost:8000/docs)
up:
	docker compose up --build

# Same, in the background
up-d:
	docker compose up --build -d

# Re-run the backfill (e.g. to pull the latest month)
ingest:
	docker compose run --rm ingest

# Full stack incl. Airflow UI (http://localhost:8080, admin/admin)
airflow:
	docker compose --profile airflow up --build

logs:
	docker compose logs -f

# psql into the database
psql:
	docker compose exec db psql -U enova -d enova

down:
	docker compose down

# Stop and delete the database volume (wipes all ingested data)
clean:
	docker compose down -v

# Run the unit tests locally (no Docker)
test:
	python -m pytest -q
