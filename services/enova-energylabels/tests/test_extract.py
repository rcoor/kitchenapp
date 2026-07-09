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


# Representative record modelled on Enova's documented public energiattest
# dataset field names (flat PascalCase, incl. the "Byggeår" å and abbreviated
# "Knr"). Locks the extractor against those real-world spellings.
ENOVA_DATASET_RECORD = {
    "Attestnummer": "A2013-427111",
    "Knr": "0301",
    "Gnr": 208, "Bnr": 253,
    "GateAdresse": "Karl Johans gate 31",
    "Postnummer": "0159",
    "Poststed": "OSLO",
    "Bygningskategori": "Boligblokk",
    "Byggeår": 1899,
    "Energikarakter": "C",
    "Oppvarmingskarakter": "Gul",
    "Utstedelsesdato": "2013-08-20T00:00:00",
    "BeregnetLevertEnergiTotaltkWhm2": 185.0,
}


def test_extract_matches_enova_dataset_field_names():
    label = extract_label(ENOVA_DATASET_RECORD)
    assert label["dedupe_key"] == "A2013-427111"
    assert label["energikarakter"] == "C"
    assert label["byggeaar"] == 1899           # "Byggeår" (å) must match
    assert label["kommunenummer"] == "0301"    # abbreviated "Knr" must match
    assert label["gardsnummer"] == "208"
    assert label["bruksnummer"] == "253"
    assert label["levert_energi_kwh_m2"] == 185.0
    assert label["utstedelsesdato"] == date(2013, 8, 20)
