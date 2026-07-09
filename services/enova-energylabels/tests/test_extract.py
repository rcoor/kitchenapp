from datetime import datetime
from pathlib import Path

from enova.client import parse_csv
from enova.extract import extract_label

FIXTURE = Path(__file__).parent / "fixtures" / "sample_bankfile.csv"


def _rows():
    return parse_csv(FIXTURE.read_text(encoding="utf-8"))


def test_parse_csv_reads_real_headers():
    rows = _rows()
    assert len(rows) == 3
    assert rows[0]["Knr"] == "3303"
    assert rows[0]["Energikarakter"] == "C"


def test_extract_maps_real_bankfile_row():
    label = extract_label(_rows()[0])
    assert label["dedupe_key"] == "2c51263d-bc78-43cb-8ae5-cc3bb859232d"  # Attestnummer GUID
    assert label["attestnummer"] == "2c51263d-bc78-43cb-8ae5-cc3bb859232d"
    assert label["kommunenummer"] == "3303"       # Knr
    assert label["gnr"] == 7586 and label["bnr"] == 2
    assert label["gateadresse"] == "Håvet 3"
    assert label["postnummer"] == "3616"
    assert label["poststed"] == "KONGSBERG"
    assert label["bygningskategori"] == "Småhus"
    assert label["byggear"] == 1925
    assert label["oppvarmet_bra"] == 195.0
    assert label["energikarakter"] == "C"
    assert label["levert_energi_kwh_m2"] == 165.6
    assert label["vektet_levert_kwh_m2"] == 155.26
    assert label["materialvalg"] == "Tre"
    assert label["utstedelsesdato"] == datetime(2026, 1, 31, 23, 22, 23)
    assert label["oppvarmingskarakter"] is None   # removed by Enova in 2026
    assert label["attest_uri"].endswith(".pdf") or "attester" in label["attest_uri"]


def test_all_fixture_rows_have_keys_and_grades():
    labels = [extract_label(r) for r in _rows()]
    assert [l["energikarakter"] for l in labels] == ["C", "D", "G"]
    assert all(l["dedupe_key"] for l in labels)


def test_blank_numeric_fields_become_none():
    label = extract_label({"Attestnummer": "x", "Byggear": "", "OppgittBra": ""})
    assert label["byggear"] is None
    assert label["oppgitt_bra"] is None


def test_extract_maps_v1_bankfile_row():
    rows = parse_csv((Path(__file__).parent / "fixtures" / "sample_bankfile_v1.csv").read_text(encoding="utf-8"))
    label = extract_label(rows[0])
    assert label["attestnummer"] == "A2015-571245"       # v1 non-GUID id
    assert label["energikarakter"] == "A"
    assert label["oppvarmingskarakter"] == "Lightgreen"  # v1 keeps the colour scale
    assert label["gateadresse"] == "SLYNGVEIEN,4,E"      # quoted commas preserved
    assert label["levert_energi_kwh_m2"] == 71.2
    assert label["har_energivurdering"] is False
    # v1 files carry no BRA / weighted / uri columns.
    assert label["oppvarmet_bra"] is None
    assert label["vektet_levert_kwh_m2"] is None
    assert label["attest_uri"] is None
