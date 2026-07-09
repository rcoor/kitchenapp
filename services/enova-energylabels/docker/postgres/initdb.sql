-- Runs once on first DB init. Creates a separate metadata database for the
-- optional Airflow profile (harmless if Airflow is never used).
CREATE DATABASE airflow;
