from datetime import date

from enova.extract import extract_label


SAMPLE = {
    "energiattest": {
        "attestnummer": "A-123",
        "energikarakter": "c",
        "oppvarmingskarakter": "Gul",
        "utstedelsesdato": "2018-05-01T00:00:00",
    },
    "bygg": {"bygningskategori": "Småhus", "byggeaar": 1985, "bruksareal": "120.5"},
    "adresse": {
        "gateadresse": "Storgata 1",
        "postnummer": "0301",
        "poststed": "OSLO",
        "kommunenummer": "0301",
        "gardsnummer": 208,
        "bruksnummer": 12,
    },
    "energi": {"beregnetLevertEnergiTotaltkWhm2": "155"},
}


def test_extract_label_pulls_nested_fields():
    label = extract_label(SAMPLE, "0301")
    assert label["dedupe_key"] == "A-123"
    assert label["attestnummer"] == "A-123"
    assert label["energikarakter"] == "C"  # upper-cased
    assert label["oppvarmingskarakter"] == "Gul"
    assert label["bygningskategori"] == "Småhus"
    assert label["byggeaar"] == 1985
    assert label["bruksareal"] == 120.5
    assert label["levert_energi_kwh_m2"] == 155.0
    assert label["kommunenummer"] == "0301"
    assert label["poststed"] == "OSLO"
    assert label["utstedelsesdato"] == date(2018, 5, 1)
    assert label["raw"] is SAMPLE


def test_dedupe_key_falls_back_to_matrikkel_when_no_attestnummer():
    raw = {"energikarakter": "B", "gardsnummer": 5, "bruksnummer": 9, "dato": "2020-01-02"}
    label = extract_label(raw, "1103")
    assert label["attestnummer"] is None
    assert label["dedupe_key"] == "1103|5|9|2020-01-02|B"


def test_missing_fields_are_none():
    label = extract_label({"energikarakter": "A"}, None)
    assert label["energikarakter"] == "A"
    assert label["byggeaar"] is None
    assert label["utstedelsesdato"] is None
