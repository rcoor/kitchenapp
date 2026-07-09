-- Storage for Norwegian energy labels (energiattester) sourced from Enova.
-- Applied automatically by the ingest (SQLAlchemy create_all); kept here for
-- reference and manual/psql provisioning.

create table if not exists energy_labels (
    dedupe_key           text primary key,
    attestnummer         text,
    energikarakter       text,        -- A–G
    oppvarmingskarakter  text,        -- colour scale, removed by Enova 2026-01-01
    bygningskategori     text,
    byggeaar             integer,
    bruksareal           numeric,
    levert_energi_kwh_m2 numeric,
    kommunenummer        text,
    gateadresse          text,
    postnummer           text,
    poststed             text,
    gardsnummer          text,
    bruksnummer          text,
    utstedelsesdato      date,
    raw                  jsonb,
    ingested_at          timestamptz
);

create index if not exists idx_energy_labels_kommunenummer on energy_labels (kommunenummer);
create index if not exists idx_energy_labels_energikarakter on energy_labels (energikarakter);
create index if not exists idx_energy_labels_attestnummer   on energy_labels (attestnummer);
