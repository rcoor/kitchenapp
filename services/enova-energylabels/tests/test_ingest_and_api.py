import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from enova.db import init_db, upsert_labels
from enova.extract import extract_label
from enova.ingest import ingest_month


class FakeClient:
    """Stands in for EnovaClient — yields raw attester without any HTTP."""

    def __init__(self, rows_by_month):
        self._rows = rows_by_month

    def iter_month(self, year, month):
        yield from self._rows.get((year, month), [])


@pytest.fixture
def engine(tmp_path):
    eng = create_engine(f"sqlite:///{tmp_path/'enova.db'}", future=True)
    init_db(eng)
    return eng


@pytest.fixture
def api(engine):
    from api.main import app, get_engine

    app.dependency_overrides[get_engine] = lambda: engine
    yield TestClient(app)
    app.dependency_overrides.clear()


def _attest(n, karakter, kommune="0301"):
    return {
        "energiattest": {"attestnummer": f"A{n}", "energikarakter": karakter,
                         "utstedelsesdato": f"2019-01-{n:02d}T00:00:00"},
        "adresse": {"kommunenummer": kommune, "poststed": "OSLO"},
        "energi": {"beregnetLevertEnergiTotaltkWhm2": 100 + n},
    }


def test_ingest_month_writes_rows(engine):
    client = FakeClient({(2019, 1): [_attest(1, "A"), _attest(2, "C")]})
    result = ingest_month(client, engine, 2019, 1)
    assert (result.year, result.month) == (2019, 1)
    assert result.fetched == 2
    assert result.written == 2


def test_ingest_is_idempotent(engine):
    client = FakeClient({(2019, 1): [_attest(1, "A"), _attest(1, "A")]})  # duplicate key
    result = ingest_month(client, engine, 2019, 1)
    assert result.written == 1  # de-duped on dedupe_key

    # Re-running upserts (updates) rather than duplicating.
    upsert_labels(engine, [extract_label(_attest(1, "B"))])
    from sqlalchemy import select
    from enova.db import energy_labels

    with engine.connect() as conn:
        rows = conn.execute(select(energy_labels.c.energikarakter)).fetchall()
    assert [r[0] for r in rows] == ["B"]  # single row, updated grade


def test_api_health(api):
    assert api.get("/health").json() == {"status": "ok"}


def test_api_list_filter_and_get(api, engine):
    upsert_labels(engine, [
        extract_label(_attest(1, "A")),
        extract_label(_attest(2, "C")),
        extract_label(_attest(3, "A", kommune="1103")),
    ])

    body = api.get("/energy-labels", params={"energikarakter": "a"}).json()
    assert body["total"] == 2
    assert {item["energikarakter"] for item in body["items"]} == {"A"}

    body = api.get("/energy-labels", params={"kommunenummer": "1103"}).json()
    assert body["total"] == 1
    assert body["items"][0]["attestnummer"] == "A3"

    one = api.get("/energy-labels/A2").json()
    assert one["energikarakter"] == "C"
    assert api.get("/energy-labels/nope").status_code == 404


def test_api_stats(api, engine):
    upsert_labels(engine, [
        extract_label(_attest(1, "A")),
        extract_label(_attest(2, "A")),
        extract_label(_attest(3, "C")),
    ])
    counts = {c["energikarakter"]: c["count"] for c in api.get("/stats/energikarakter").json()["counts"]}
    assert counts == {"A": 2, "C": 1}
