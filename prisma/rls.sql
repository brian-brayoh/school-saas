-- Row-level security for every school-owned table.
--
-- Idempotent: safe to run after every migration (npm run db:rls; db:setup
-- and db:deploy already include it). Any table in the current schema that
-- has a "tenantId" column gets RLS enabled + FORCED and the same policy, so
-- new tables are covered automatically the next time this runs.
--
-- A request only sees rows where "tenantId" = app.tenant_id, which
-- src/lib/db.ts sets per transaction (withTenant). withSystem sets
-- app.bypass_rls = 'on' for platform-level work (onboarding, seed, checks).
--
-- IMPORTANT: superusers and roles with BYPASSRLS ignore all of this.
-- `npm run rls:check` fails loudly if DATABASE_URL uses such a role.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
     AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = current_schema()
      AND c.column_name = 'tenantId'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', r.table_name);
    EXECUTE format(
      $p$CREATE POLICY tenant_isolation ON %I
           USING (
             "tenantId" = current_setting('app.tenant_id', true)
             OR current_setting('app.bypass_rls', true) = 'on'
           )
           WITH CHECK (
             "tenantId" = current_setting('app.tenant_id', true)
             OR current_setting('app.bypass_rls', true) = 'on'
           )$p$,
      r.table_name
    );
  END LOOP;

  -- Optional dedicated app role (see README, "Production on Neon").
  -- When it exists and migrations run as a different owner role, give it
  -- data access to every table, now and in future.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'school_app')
     AND current_user <> 'school_app' THEN
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO school_app', current_schema());
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO school_app', current_schema());
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO school_app', current_schema());
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO school_app', current_schema());
  END IF;
END
$$;
