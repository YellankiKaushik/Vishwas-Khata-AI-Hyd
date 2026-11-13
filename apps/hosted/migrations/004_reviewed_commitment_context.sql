BEGIN;

ALTER TABLE hyd_demo.commitments ADD COLUMN last_reason text
    CHECK (last_reason IS NULL OR length(last_reason) BETWEEN 1 AND 200);
ALTER TABLE hyd_demo.commitment_receipts ADD COLUMN reason text
    CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 200);

-- Snapshot trigger from 002 includes the server-reviewed reason in the same event.
CREATE FUNCTION hyd_demo.record_review_reason() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    NEW.last_reason := NULLIF(current_setting('hyd_demo.commitment_reason', true), '');
    RETURN NEW;
END;
$$;
CREATE TRIGGER commitment_review_reason BEFORE INSERT OR UPDATE ON hyd_demo.commitments
    FOR EACH ROW EXECUTE FUNCTION hyd_demo.record_review_reason();

CREATE FUNCTION hyd_demo.reviewed_commitment_change(
    p_customer uuid, p_commitment uuid, p_operation uuid, p_action text, p_version integer,
    p_date date, p_promised integer, p_ledger_hash text, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_tenant uuid := NULLIF(current_setting('hyd_demo.tenant_id', true), '')::uuid;
    v_prior hyd_demo.commitment_receipts;
    v_response jsonb;
BEGIN
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'TENANT_REQUIRED' USING ERRCODE = '42501'; END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION 'INVALID_REASON' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('hyd_demo.journal:' || v_tenant::text, 0));
    SELECT * INTO v_prior FROM hyd_demo.commitment_receipts WHERE tenant_id = v_tenant AND operation_id = p_operation;
    IF FOUND AND v_prior.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    PERFORM set_config('hyd_demo.commitment_reason', p_reason, true);
    v_response := hyd_demo.mutate_commitment(p_customer, p_commitment, p_operation, p_action,
        p_version, p_date, p_promised, p_ledger_hash, true);
    PERFORM set_config('hyd_demo.commitment_reason', '', true);
    IF v_prior.operation_id IS NULL THEN
        -- The base append-only receipt trigger also rejects owner updates.
        -- Store the reason with the initial insert through its BEFORE trigger.
        IF NOT EXISTS (SELECT 1 FROM hyd_demo.commitment_receipts WHERE tenant_id = v_tenant
            AND operation_id = p_operation AND reason = p_reason) THEN
            RAISE EXCEPTION 'COMMITMENT_REASON_MISSING';
        END IF;
    END IF;
    RETURN v_response;
END;
$$;

-- The receipt column uses the same request context with its own field name.
CREATE FUNCTION hyd_demo.record_receipt_reason() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    NEW.reason := NULLIF(current_setting('hyd_demo.commitment_reason', true), '');
    RETURN NEW;
END;
$$;
CREATE TRIGGER commitment_receipt_reason BEFORE INSERT ON hyd_demo.commitment_receipts
    FOR EACH ROW EXECUTE FUNCTION hyd_demo.record_receipt_reason();

-- Even a runtime connection cannot scope itself by setting an arbitrary tenant UUID.
-- The session digest is server-generated. The owner may still run reviewed migration
-- and recovery work without a session when connected as a separate maintenance role.
CREATE FUNCTION hyd_demo.valid_runtime_tenant(p_tenant uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
    SELECT CASE WHEN session_user = 'hyd_runtime' OR current_setting('role') = 'hyd_runtime'
        THEN EXISTS (SELECT 1 FROM hyd_demo.demo_sessions
            WHERE tenant_id = p_tenant AND token_hash = current_setting('hyd_demo.session_hash', true)
                AND revoked_at IS NULL AND expires_at > statement_timestamp())
        ELSE true END
$$;

DO $$
DECLARE v_name text;
BEGIN
    FOREACH v_name IN ARRAY ARRAY['customers','journal','commitments','commitment_events',
        'commitment_receipts','financial_drafts','confirmation_receipts'] LOOP
        EXECUTE format('CREATE POLICY runtime_session_scope ON hyd_demo.%I AS RESTRICTIVE
            USING (hyd_demo.valid_runtime_tenant(tenant_id))', v_name);
    END LOOP;
END;
$$;

CREATE FUNCTION hyd_demo.hosted_ready() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$ SELECT true $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hyd_demo FROM PUBLIC;
COMMIT;
