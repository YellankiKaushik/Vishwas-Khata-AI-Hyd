-- Run in the SQL Editor of project xzsccwmljyckbmjcfang as postgres.
-- Set distinct passwords privately afterward. This script never rotates credentials.
BEGIN;
DO $provision$
DECLARE
    role_name text;
    schema_name text;
    temporary_set boolean;
    had_membership boolean;
    role_options boolean := current_setting('server_version_num')::int >= 160000;
BEGIN
    IF current_database() <> 'postgres' OR current_user <> 'postgres' THEN
        RAISE EXCEPTION 'Run as postgres in the selected Supabase project database';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('hyd_demo.migrations', 0));

    FOREACH role_name IN ARRAY ARRAY['hyd_owner', 'hyd_runtime'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT %s',
                role_name, CASE WHEN role_name = 'hyd_owner' THEN 2 ELSE 10 END);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles r WHERE rolname = role_name
            AND (NOT rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
              OR rolconnlimit NOT BETWEEN 1 AND CASE WHEN role_name = 'hyd_owner' THEN 2 ELSE 10 END
              OR EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid))) THEN
            RAISE EXCEPTION 'Existing role % requires manual review', role_name;
        END IF;
    END LOOP;

    SELECT EXISTS (SELECT 1 FROM pg_auth_members
        WHERE roleid = 'hyd_owner'::regrole AND member = current_user::regrole) INTO had_membership;
    temporary_set := NOT pg_has_role(current_user, 'hyd_owner', CASE WHEN role_options THEN 'SET' ELSE 'MEMBER' END);
    IF temporary_set THEN
        IF role_options THEN
            EXECUTE 'GRANT hyd_owner TO postgres WITH SET TRUE';
        ELSE
            GRANT hyd_owner TO postgres;
        END IF;
    END IF;
    FOREACH schema_name IN ARRAY ARRAY['hyd_demo', 'hyd_demo_release'] LOOP
        IF EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = schema_name
            AND n.nspowner <> 'hyd_owner'::regrole) THEN
            RAISE EXCEPTION 'Existing schema % has an unexpected owner', schema_name;
        END IF;
        EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION hyd_owner', schema_name);
    END LOOP;
    SET LOCAL ROLE hyd_owner;
    REVOKE ALL ON SCHEMA hyd_demo, hyd_demo_release FROM PUBLIC;
    RESET ROLE;
    IF temporary_set THEN
        IF had_membership THEN
            EXECUTE 'REVOKE SET OPTION FOR hyd_owner FROM postgres';
        ELSE
            REVOKE hyd_owner FROM postgres;
        END IF;
    END IF;
    IF NOT has_database_privilege('hyd_owner', current_database(), 'CONNECT')
        OR NOT has_database_privilege('hyd_runtime', current_database(), 'CONNECT') THEN
        RAISE EXCEPTION 'Project administrator must grant database CONNECT to the app roles';
    END IF;
END
$provision$;
COMMIT;
