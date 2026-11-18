-- One-time local setup. Run as your local superuser (postgres):
--   psql -U postgres -f scripts/local-app-role.sql
--
-- Creates a NON-superuser role that owns the dev database. Row-level
-- security is skipped for superusers, so the app must never connect as
-- "postgres". CREATEDB lets `prisma migrate dev` create its shadow database.

CREATE ROLE school_app LOGIN PASSWORD 'school_app_pw' CREATEDB NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE school_saas OWNER school_app;
