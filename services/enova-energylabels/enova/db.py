"""Storage layer: the ``energy_labels`` table and a dialect-portable upsert.

Prod runs on Postgres (JSONB, ``ON CONFLICT`` upsert). The same schema also
works on SQLite so the ingest and API can be exercised in tests without a
running Postgres.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    create_engine,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.engine import Engine
from sqlalchemy.types import JSON

metadata = MetaData()

# JSONB on Postgres, plain JSON elsewhere (e.g. SQLite in tests).
_JSON = JSON().with_variant(JSONB(), "postgresql")

energy_labels = Table(
    "energy_labels",
    metadata,
    Column("dedupe_key", String, primary_key=True),
    Column("attestnummer", String, index=True),
    Column("energikarakter", String, index=True),
    Column("oppvarmingskarakter", String),
    Column("bygningskategori", String),
    Column("byggeaar", Integer),
    Column("bruksareal", Numeric),
    Column("levert_energi_kwh_m2", Numeric),
    Column("kommunenummer", String, index=True),
    Column("gateadresse", String),
    Column("postnummer", String),
    Column("poststed", String),
    Column("gardsnummer", String),
    Column("bruksnummer", String),
    Column("utstedelsesdato", Date),
    Column("raw", _JSON),
    Column("ingested_at", DateTime(timezone=True)),
)

# Columns that a re-ingest of the same attest should refresh.
_UPDATE_COLUMNS = [c.name for c in energy_labels.columns if c.name != "dedupe_key"]


def create_engine_from_url(database_url: str) -> Engine:
    return create_engine(database_url, future=True)


def init_db(engine: Engine) -> None:
    metadata.create_all(engine)


def upsert_labels(engine: Engine, rows: Iterable[dict[str, Any]]) -> int:
    """Insert or update energy-label rows keyed on ``dedupe_key``.

    Rows without a dedupe_key are skipped. Returns the number of rows written.
    """
    now = datetime.now(timezone.utc)
    # De-duplicate by key (last wins): a single ON CONFLICT statement cannot
    # touch the same row twice, and pages may occasionally overlap.
    by_key: dict[str, dict[str, Any]] = {}
    for r in rows:
        key = r.get("dedupe_key")
        if key:
            by_key[str(key)] = {**r, "ingested_at": now}
    payload = list(by_key.values())
    if not payload:
        return 0

    insert = pg_insert if engine.dialect.name == "postgresql" else sqlite_insert
    # Chunk so a large kommune stays under the backend bind-parameter ceiling
    # (Postgres caps at 65535 params; ~17 cols => a few thousand rows per stmt).
    chunk_size = 500
    written = 0
    with engine.begin() as conn:
        for start in range(0, len(payload), chunk_size):
            batch = payload[start : start + chunk_size]
            stmt = insert(energy_labels).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=["dedupe_key"],
                set_={c: getattr(stmt.excluded, c) for c in _UPDATE_COLUMNS},
            )
            conn.execute(stmt)
            written += len(batch)
    return written
