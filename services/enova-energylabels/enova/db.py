"""Storage layer: the ``energy_labels`` table and a dialect-portable upsert.

Prod runs on Postgres (JSONB, ``ON CONFLICT`` upsert). The same schema also
works on SQLite so the ingest and API can be exercised in tests without a
running Postgres. Columns mirror the real Enova v2 bank-file CSV.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

from sqlalchemy import (
    Boolean,
    Column,
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
    Column("dedupe_key", String, primary_key=True),  # Attestnummer (GUID)
    Column("attestnummer", String, index=True),
    Column("kommunenummer", String, index=True),      # Knr
    Column("gnr", Integer),
    Column("bnr", Integer),
    Column("snr", Integer),
    Column("fnr", Integer),
    Column("andelsnummer", String),
    Column("bygningsnummer", String),
    Column("gateadresse", String),
    Column("postnummer", String, index=True),
    Column("poststed", String),
    Column("bruksenhetsnummer", String),
    Column("organisasjonsnummer", String),
    Column("bygningskategori", String, index=True),
    Column("byggear", Integer),
    Column("oppgitt_bra", Numeric),
    Column("oppvarmet_bra", Numeric),
    Column("energikarakter", String, index=True),     # A–G
    Column("oppvarmingskarakter", String),            # removed by Enova 2026-01-01
    Column("utstedelsesdato", DateTime),
    Column("type_registrering", String),
    Column("levert_energi_kwh_m2", Numeric),
    Column("materialvalg", String),
    Column("vektet_levert_kwh", Numeric),
    Column("vektet_levert_kwh_m2", Numeric),
    Column("attest_uri", String),
    Column("fossilandel", Numeric),               # v1 only
    Column("har_energivurdering", Boolean),       # v1 only
    Column("energivurdering_dato", DateTime),     # v1 only
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
    # touch the same row twice, and files may occasionally overlap.
    by_key: dict[str, dict[str, Any]] = {}
    for r in rows:
        key = r.get("dedupe_key")
        if key:
            by_key[str(key)] = {**r, "ingested_at": now}
    payload = list(by_key.values())
    if not payload:
        return 0

    insert = pg_insert if engine.dialect.name == "postgresql" else sqlite_insert
    # Chunk so a large month stays under the backend bind-parameter ceiling
    # (Postgres caps at 65535 params; ~29 cols => ~2000 rows per statement).
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
