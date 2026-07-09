"""FastAPI service exposing the ingested Norwegian energy labels.

Reads the ``energy_labels`` table that the Airflow DAG populates. The database
engine is a dependency so tests can point it at a throwaway database.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.engine import Engine

from enova.db import create_engine_from_url, energy_labels, init_db
from enova.settings import get_settings

_engine: Engine | None = None


def get_engine() -> Engine:
    """Lazily build the shared engine from settings (overridable in tests)."""
    global _engine
    if _engine is None:
        _engine = create_engine_from_url(get_settings().database_url)
    return _engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure the table exists so the API is usable before/while the ingest runs.
    init_db(get_engine())
    yield


app = FastAPI(
    title="Enova Norwegian Energy Labels",
    version="1.0.0",
    description="Query Norwegian building energy certificates (energikarakter A–G) "
    "sourced from Enova's public-data API.",
    lifespan=lifespan,
)


def _row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row._mapping)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/energy-labels")
def list_energy_labels(
    engine: Engine = Depends(get_engine),
    kommunenummer: str | None = Query(default=None, description="Filter by kommune number (Knr), e.g. 0301"),
    energikarakter: str | None = Query(default=None, description="Filter by grade A–G"),
    bygningskategori: str | None = None,
    poststed: str | None = None,
    byggear_min: int | None = None,
    byggear_max: int | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    conditions = []
    if kommunenummer:
        conditions.append(energy_labels.c.kommunenummer == kommunenummer)
    if energikarakter:
        conditions.append(energy_labels.c.energikarakter == energikarakter.upper())
    if bygningskategori:
        conditions.append(energy_labels.c.bygningskategori == bygningskategori)
    if poststed:
        conditions.append(energy_labels.c.poststed == poststed)
    if byggear_min is not None:
        conditions.append(energy_labels.c.byggear >= byggear_min)
    if byggear_max is not None:
        conditions.append(energy_labels.c.byggear <= byggear_max)

    with engine.connect() as conn:
        total = conn.execute(
            select(func.count()).select_from(energy_labels).where(*conditions)
        ).scalar_one()
        rows = conn.execute(
            select(energy_labels)
            .where(*conditions)
            .order_by(energy_labels.c.utstedelsesdato.desc().nullslast())
            .limit(limit)
            .offset(offset)
        ).fetchall()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [_row_to_dict(r) for r in rows],
    }


# The columns that identify one physical dwelling/building unit. The "current"
# label for a unit is its most recently issued attest.
_BUILDING_KEY = [
    energy_labels.c.kommunenummer,
    energy_labels.c.gnr,
    energy_labels.c.bnr,
    energy_labels.c.snr,
    energy_labels.c.fnr,
    energy_labels.c.bygningsnummer,
    energy_labels.c.bruksenhetsnummer,
]


@app.get("/buildings")
def list_buildings(
    engine: Engine = Depends(get_engine),
    kommunenummer: str | None = Query(default=None, description="Filter by kommune number (Knr)"),
    energikarakter: str | None = Query(default=None, description="Current grade A–G"),
    poststed: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    """Current energy label per building/dwelling unit (latest attest per matrikkel).

    Collapses the per-certificate history to one row per unit, keeping the most
    recently issued attest.
    """
    rn = func.row_number().over(
        partition_by=_BUILDING_KEY,
        order_by=[energy_labels.c.utstedelsesdato.desc().nullslast(), energy_labels.c.dedupe_key.desc()],
    ).label("_rn")
    latest = select(energy_labels, rn).subquery()

    conditions = [latest.c._rn == 1]
    if kommunenummer:
        conditions.append(latest.c.kommunenummer == kommunenummer)
    if energikarakter:
        conditions.append(latest.c.energikarakter == energikarakter.upper())
    if poststed:
        conditions.append(latest.c.poststed == poststed)

    with engine.connect() as conn:
        total = conn.execute(select(func.count()).select_from(latest).where(*conditions)).scalar_one()
        rows = conn.execute(
            select(latest).where(*conditions)
            .order_by(latest.c.utstedelsesdato.desc().nullslast())
            .limit(limit).offset(offset)
        ).fetchall()

    items = [{k: v for k, v in r._mapping.items() if k != "_rn"} for r in rows]
    return {"total": total, "limit": limit, "offset": offset, "items": items}


@app.get("/energy-labels/{attestnummer}")
def get_energy_label(attestnummer: str, engine: Engine = Depends(get_engine)) -> dict[str, Any]:
    with engine.connect() as conn:
        row = conn.execute(
            select(energy_labels).where(energy_labels.c.attestnummer == attestnummer).limit(1)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Energy label not found")
    return _row_to_dict(row)


@app.get("/stats/energikarakter")
def stats_by_grade(
    engine: Engine = Depends(get_engine),
    kommunenummer: str | None = None,
) -> dict[str, Any]:
    conditions = []
    if kommunenummer:
        conditions.append(energy_labels.c.kommunenummer == kommunenummer)
    with engine.connect() as conn:
        rows = conn.execute(
            select(energy_labels.c.energikarakter, func.count().label("count"))
            .where(*conditions)
            .group_by(energy_labels.c.energikarakter)
            .order_by(energy_labels.c.energikarakter)
        ).fetchall()
    return {"counts": [{"energikarakter": r[0], "count": r[1]} for r in rows]}
