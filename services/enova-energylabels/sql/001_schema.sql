-- Storage for Norwegian energy labels (energiattester) sourced from Enova's
-- public-data bank files (v1 for pre-2026, v2 for 2026+). Applied automatically
-- by the ingest (SQLAlchemy create_all); kept here for reference / psql use.
--
-- Columns are the union of the v1 and v2 CSV layouts. v2 dropped the coloured
-- oppvarmingskarakter (removed 2026-01-01) and added the BRA / weighted-energy /
-- attest-uri columns; v1 carries oppvarmingskarakter + fossilandel + energi-
-- vurdering. Unrelated columns are simply null on the version that lacks them.

create table if not exists energy_labels (
    dedupe_key           text primary key,   -- Attestnummer
    attestnummer         text,
    kommunenummer        text,               -- Knr
    gnr                  integer,
    bnr                  integer,
    snr                  integer,
    fnr                  integer,
    andelsnummer         text,
    bygningsnummer       text,
    gateadresse          text,
    postnummer           text,
    poststed             text,
    bruksenhetsnummer    text,
    organisasjonsnummer  text,
    bygningskategori     text,
    byggear              integer,
    oppgitt_bra          numeric,            -- v2
    oppvarmet_bra        numeric,            -- v2
    energikarakter       text,               -- A–G
    oppvarmingskarakter  text,               -- v1 (colour scale; removed 2026)
    utstedelsesdato      timestamp,
    type_registrering    text,               -- Simple / Advanced
    levert_energi_kwh_m2 numeric,
    materialvalg         text,
    vektet_levert_kwh    numeric,            -- v2
    vektet_levert_kwh_m2 numeric,            -- v2
    attest_uri           text,               -- v2 (link to the PDF attest)
    fossilandel          numeric,            -- v1
    har_energivurdering  boolean,            -- v1
    energivurdering_dato timestamp,          -- v1
    raw                  jsonb,
    ingested_at          timestamptz
);

create index if not exists idx_energy_labels_kommunenummer   on energy_labels (kommunenummer);
create index if not exists idx_energy_labels_energikarakter   on energy_labels (energikarakter);
create index if not exists idx_energy_labels_bygningskategori on energy_labels (bygningskategori);
create index if not exists idx_energy_labels_postnummer       on energy_labels (postnummer);
create index if not exists idx_energy_labels_attestnummer     on energy_labels (attestnummer);
