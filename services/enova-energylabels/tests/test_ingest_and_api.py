from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from enova.client import parse_csv
from enova.db import init_db, upsert_labels
from enova.extract import extract_label
from enova.ingest import ingest_month

FIXTURE = Path(__file__).parent / "fixtures" / "sample_bankfile.csv"


class FakeClient:
    """Stands in for EnovaClient — yields parsed CSV rows without any HTTP."""

    def __init__(self, rows_by_month):
        self._rows = rows_by_month

    def iter_month(self, year, month):
        yield from self._rows.get((year, month), [])


@pytest.fixture
def rows():
    return parse_csv(FIXTURE.read_text(encoding="utf-8"))


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


def test_ingest_month_writes_real_rows(engine, rows):
    client = FakeClient({(2026, 1): rows})
    result = ingest_month(client, engine, 2026, 1)
    assert (result.year, result.month, result.fetched, result.written) == (2026, 1, 3, 3)


def test_ingest_is_idempotent(engine, rows):
    client = FakeClient({(2026, 1): rows + rows})  # duplicated rows
    assert ingest_month(client, engine, 2026, 1).written == 3  # de-duped on Attestnummer


def test_api_health(api):
    assert api.get("/health").json() == {"status": "ok"}


def test_api_list_filter_and_get(api, engine, rows):
    upsert_labels(engine, [extract_label(r) for r in rows])

    body = api.get("/energy-labels", params={"kommunenummer": "5001"}).json()
    assert body["total"] == 1
    assert body["items"][0]["poststed"] == "TRONDHEIM"
    assert body["items"][0]["energikarakter"] == "G"

    body = api.get("/energy-labels", params={"energikarakter": "c"}).json()
    assert body["total"] == 1
    assert body["items"][0]["kommunenummer"] == "3303"

    one = api.get("/energy-labels/2c51263d-bc78-43cb-8ae5-cc3bb859232d").json()
    assert one["gateadresse"] == "Håvet 3"
    assert api.get("/energy-labels/nope").status_code == 404


def test_api_buildings_collapses_to_current_label(api, engine, rows):
    # v2 fixture: 3 distinct buildings. v1 fixture: 2 attester for the SAME unit.
    v1 = parse_csv((Path(__file__).parent / "fixtures" / "sample_bankfile_v1.csv").read_text(encoding="utf-8"))
    upsert_labels(engine, [extract_label(r) for r in rows] + [extract_label(r) for r in v1])

    all_labels = api.get("/energy-labels", params={"limit": 1}).json()
    buildings = api.get("/buildings").json()
    assert all_labels["total"] == 5           # 3 v2 + 2 v1 certificates
    assert buildings["total"] == 4            # the 2 v1 attester collapse to 1 unit

    # The collapsed unit keeps the most recently issued attest (23:57 > 23:52).
    drobak = [b for b in buildings["items"] if b["poststed"] == "DRØBAK"]
    assert len(drobak) == 1
    assert drobak[0]["attestnummer"] == "A2015-571245"


def test_api_stats(api, engine, rows):
    upsert_labels(engine, [extract_label(r) for r in rows])
    counts = {c["energikarakter"]: c["count"] for c in api.get("/stats/energikarakter").json()["counts"]}
    assert counts == {"C": 1, "D": 1, "G": 1}
