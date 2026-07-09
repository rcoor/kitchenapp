"""Map an Enova bank-file CSV row to a stored energy-label record.

Column names are the real v2 bank-file headers (verified against a live file):

    Knr, Gnr, Bnr, Snr, Fnr, Andelsnummer, Bygningsnummer, GateAdresse,
    Postnummer, Poststed, BruksEnhetsNummer, Organisasjonsnummer,
    Bygningskategori, Byggear, OppgittBra, OppvarmetBra, Energikarakter,
    Utstedelsesdato, TypeRegistrering, Attestnummer,
    BeregnetLevertEnergiTotaltkWhm2, Materialvalg,
    BeregnetVektetLevertEnergiReferanseklimaKWh,
    BeregnetVektetLevertEnergiReferanseklimaKWhm2, AttestUri

The coloured Oppvarmingskarakter was removed by Enova on 2026-01-01, so v2
(2026+) files do not carry it; it is still captured if a file provides it.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any


def _ci(row: dict[str, Any]) -> dict[str, Any]:
    """Case-insensitive view of a CSV row keyed by lower-cased header."""
    return {str(k).strip().lower(): v for k, v in row.items()}


def _s(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _f(v: Any) -> float | None:
    s = _s(v)
    if s is None:
        return None
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return None


def _i(v: Any) -> int | None:
    f = _f(v)
    return int(f) if f is not None else None


def _b(v: Any) -> bool | None:
    s = _s(v)
    if s is None:
        return None
    return s.lower() in ("true", "1", "ja", "yes")


def _dt(v: Any) -> datetime | None:
    s = _s(v)
    if s is None:
        return None
    # e.g. "2026-01-31T23:22:23.0000000" — trim to seconds for fromisoformat.
    try:
        return datetime.fromisoformat(s[:19])
    except ValueError:
        try:
            return datetime.fromisoformat(s[:10])
        except ValueError:
            return None


def extract_label(row: dict[str, Any]) -> dict[str, Any]:
    """Normalize one raw CSV row into a storable energy-label dict."""
    r = _ci(row)
    attest = _s(r.get("attestnummer"))
    knr = _s(r.get("knr")) or _s(r.get("kommunenummer"))

    dedupe_key = attest or "|".join(
        p for p in (knr, _s(r.get("gnr")), _s(r.get("bnr")), _s(r.get("snr")),
                    _s(r.get("fnr")), _s(r.get("bygningsnummer"))) if p
    ) or None

    return {
        "dedupe_key": dedupe_key,
        "attestnummer": attest,
        "kommunenummer": knr,
        "gnr": _i(r.get("gnr")),
        "bnr": _i(r.get("bnr")),
        "snr": _i(r.get("snr")),
        "fnr": _i(r.get("fnr")),
        "andelsnummer": _s(r.get("andelsnummer")),
        "bygningsnummer": _s(r.get("bygningsnummer")),
        "gateadresse": _s(r.get("gateadresse")),
        "postnummer": _s(r.get("postnummer")),
        "poststed": _s(r.get("poststed")),
        "bruksenhetsnummer": _s(r.get("bruksenhetsnummer")),
        "organisasjonsnummer": _s(r.get("organisasjonsnummer")),
        "bygningskategori": _s(r.get("bygningskategori")),
        "byggear": _i(r.get("byggear")),
        "oppgitt_bra": _f(r.get("oppgittbra")),
        "oppvarmet_bra": _f(r.get("oppvarmetbra")),
        "energikarakter": (_s(r.get("energikarakter")) or "").upper() or None,
        "oppvarmingskarakter": _s(r.get("oppvarmingskarakter")),
        "utstedelsesdato": _dt(r.get("utstedelsesdato")),
        "type_registrering": _s(r.get("typeregistrering")),
        "levert_energi_kwh_m2": _f(r.get("beregnetlevertenergitotaltkwhm2")),
        "materialvalg": _s(r.get("materialvalg")),
        "vektet_levert_kwh": _f(r.get("beregnetvektetlevertenergireferanseklimakwh")),
        "vektet_levert_kwh_m2": _f(r.get("beregnetvektetlevertenergireferanseklimakwhm2")),
        "attest_uri": _s(r.get("attesturi")),
        # v1-only fields (older format); None on v2 files.
        "fossilandel": _f(r.get("beregnetfossilandel")),
        "har_energivurdering": _b(r.get("harenergivurdering")),
        "energivurdering_dato": _dt(r.get("energivurderingdato")),
        "raw": row,
    }
