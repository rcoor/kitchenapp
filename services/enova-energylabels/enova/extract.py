"""Field extraction for Enova energy certificates ("energiattest").

Enova's public-data payload nests fields (attest / bygg / adresse / energi …)
and the exact shape is not contractually pinned here, so — like a tolerant
scraper — we locate fields *by name at any depth* rather than by a fixed path,
and keep the full raw record so nothing is lost and the mapping can be verified
against live output.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any

# Field-name matchers (case-insensitive), tried against every key at any depth.
_RE_KARAKTER = re.compile(r"^energikarakter$", re.I)
_RE_HEAT = re.compile(r"oppvarmingskarakter", re.I)
_RE_DATE = re.compile(r"(utstedelses.*dato|attest.*dato|^dato$|gyldig.*fra)", re.I)
_RE_ENERGY = re.compile(r"(beregnet.*levert|levert.*energi|energitotalt|kwhm2|kwhperm2|totalt.*kwh)", re.I)
_RE_CATEGORY = re.compile(r"(bygningskategori|bygningstype|byggkategori)", re.I)
_RE_YEAR = re.compile(r"(byggeaar|byggear|oppfoerings)", re.I)
_RE_AREA = re.compile(r"(bruksareal|^bra$)", re.I)
_RE_ATTEST = re.compile(r"(attestnummer|attestid|energiattestid|attestguid)", re.I)
_RE_ADDR = re.compile(r"(gateadresse|gatenavn)$", re.I)
_RE_POST = re.compile(r"^postnummer$", re.I)
_RE_PLACE = re.compile(r"^poststed$", re.I)
_RE_KNR = re.compile(r"^kommunenummer$", re.I)
_RE_GNR = re.compile(r"(gardsnummer|gaardsnummer|gnr)$", re.I)
_RE_BNR = re.compile(r"(bruksnummer|bnr)$", re.I)


def deep_find(obj: Any, pattern: re.Pattern[str], depth: int = 0) -> Any:
    """Return the first primitive value whose key matches ``pattern`` (any depth)."""
    if obj is None or depth > 6:
        return None
    if isinstance(obj, dict):
        for k, v in obj.items():
            if pattern.search(str(k)) and not isinstance(v, (dict, list)):
                return v
        for v in obj.values():
            found = deep_find(v, pattern, depth + 1)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = deep_find(v, pattern, depth + 1)
            if found is not None:
                return found
    return None


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    cleaned = re.sub(r"[^0-9.,-]", "", str(value)).replace(",", ".")
    try:
        return float(cleaned) if cleaned not in ("", "-", ".") else None
    except ValueError:
        return None


def _to_int(value: Any) -> int | None:
    f = _to_float(value)
    return int(f) if f is not None else None


def _to_date(value: Any) -> date | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    # Enova dates look like "2018-05-01T00:00:00"; take the date part.
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def extract_label(raw: dict[str, Any], kommunenummer: str | None = None) -> dict[str, Any]:
    """Normalize one raw Enova attest into a flat, storable energy-label row."""
    karakter = deep_find(raw, _RE_KARAKTER)
    attest = deep_find(raw, _RE_ATTEST)
    knr = kommunenummer or deep_find(raw, _RE_KNR)
    utstedelsesdato = _to_date(deep_find(raw, _RE_DATE))
    gnr = deep_find(raw, _RE_GNR)
    bnr = deep_find(raw, _RE_BNR)

    dedupe_key = str(attest).strip() if attest not in (None, "") else ""
    if not dedupe_key:
        parts = [str(p) for p in (knr, gnr, bnr, utstedelsesdato, karakter) if p not in (None, "")]
        dedupe_key = "|".join(parts)

    return {
        "dedupe_key": dedupe_key or None,
        "attestnummer": str(attest) if attest not in (None, "") else None,
        "energikarakter": str(karakter).strip().upper() if karakter not in (None, "") else None,
        "oppvarmingskarakter": _str_or_none(deep_find(raw, _RE_HEAT)),
        "bygningskategori": _str_or_none(deep_find(raw, _RE_CATEGORY)),
        "byggeaar": _to_int(deep_find(raw, _RE_YEAR)),
        "bruksareal": _to_float(deep_find(raw, _RE_AREA)),
        "levert_energi_kwh_m2": _to_float(deep_find(raw, _RE_ENERGY)),
        "kommunenummer": _str_or_none(knr),
        "gateadresse": _str_or_none(deep_find(raw, _RE_ADDR)),
        "postnummer": _str_or_none(deep_find(raw, _RE_POST)),
        "poststed": _str_or_none(deep_find(raw, _RE_PLACE)),
        "gardsnummer": _str_or_none(gnr),
        "bruksnummer": _str_or_none(bnr),
        "utstedelsesdato": utstedelsesdato,
        "raw": raw,
    }


def _str_or_none(value: Any) -> str | None:
    return str(value) if value not in (None, "") else None
