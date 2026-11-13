-- Install as the same non-superuser owner as migrations 001 and 002.
BEGIN;

CREATE TABLE hyd_demo.demo_sessions (
    token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    tenant_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);

CREATE TABLE hyd_demo.request_quotas (
    bucket text NOT NULL CHECK (bucket ~ '^[0-9a-f]{64}$'),
    minute_start timestamptz NOT NULL,
    requests integer NOT NULL CHECK (requests > 0),
    PRIMARY KEY (bucket, minute_start)
);

CREATE FUNCTION hyd_demo.consume_quota(p_bucket text, p_limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_minute timestamptz := date_trunc('minute', statement_timestamp());
    v_count integer;
BEGIN
    IF p_bucket IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'INVALID_QUOTA' USING ERRCODE = '22023';
    END IF;
    INSERT INTO hyd_demo.request_quotas VALUES (p_bucket, v_minute, 1)
    ON CONFLICT (bucket, minute_start) DO UPDATE SET requests = hyd_demo.request_quotas.requests + 1
        WHERE hyd_demo.request_quotas.requests < p_limit
    RETURNING requests INTO v_count;
    RETURN v_count IS NOT NULL;
END;
$$;

CREATE FUNCTION hyd_demo.open_demo_session(p_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_tenant uuid;
BEGIN
    INSERT INTO hyd_demo.demo_sessions(token_hash, expires_at)
    VALUES (p_hash, statement_timestamp() + interval '2 hours') RETURNING tenant_id INTO v_tenant;
    PERFORM set_config('hyd_demo.session_hash', p_hash, true);
    PERFORM set_config('hyd_demo.tenant_id', v_tenant::text, true);
    INSERT INTO hyd_demo.customers(tenant_id, customer_id, sample_name)
        SELECT v_tenant, gen_random_uuid(), name FROM unnest(ARRAY['Ramesh','Priya','Lakshmi']) AS name;
    RETURN v_tenant;
END;
$$;

CREATE FUNCTION hyd_demo.bind_demo_session(p_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_tenant uuid;
BEGIN
    PERFORM set_config('hyd_demo.session_hash', '', true);
    PERFORM set_config('hyd_demo.tenant_id', '', true);
    SELECT tenant_id INTO v_tenant FROM hyd_demo.demo_sessions
        WHERE token_hash = p_hash AND revoked_at IS NULL AND expires_at > clock_timestamp() FOR SHARE;
    IF v_tenant IS NOT NULL THEN
        PERFORM set_config('hyd_demo.session_hash', p_hash, true);
        PERFORM set_config('hyd_demo.tenant_id', v_tenant::text, true);
    END IF;
    RETURN v_tenant;
END;
$$;

CREATE FUNCTION hyd_demo.revoke_demo_session(p_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
    UPDATE hyd_demo.demo_sessions SET revoked_at = clock_timestamp()
        WHERE token_hash = p_hash AND revoked_at IS NULL AND expires_at > clock_timestamp();
    RETURN FOUND;
END;
$$;

CREATE FUNCTION hyd_demo.prune_quota_windows()
RETURNS bigint LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v_deleted bigint;
BEGIN
    DELETE FROM hyd_demo.request_quotas WHERE minute_start < statement_timestamp() - interval '1 day';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

CREATE TABLE hyd_demo.financial_drafts (
    tenant_id uuid NOT NULL,
    draft_id uuid NOT NULL DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('CREDIT_GIVEN', 'REPAYMENT_RECEIVED', 'REVERSAL')),
    amount_paise integer CHECK (amount_paise BETWEEN 1 AND 100000000),
    reverses_entry_id uuid,
    creation_key uuid NOT NULL,
    creation_payload jsonb NOT NULL,
    cancelled_at timestamptz,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '20 minutes'),
    PRIMARY KEY (tenant_id, draft_id),
    UNIQUE (tenant_id, creation_key),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES hyd_demo.customers (tenant_id, customer_id),
    FOREIGN KEY (tenant_id, customer_id, reverses_entry_id)
        REFERENCES hyd_demo.journal (tenant_id, customer_id, entry_id),
    CHECK ((kind = 'REVERSAL' AND reverses_entry_id IS NOT NULL AND amount_paise IS NULL)
        OR (kind <> 'REVERSAL' AND reverses_entry_id IS NULL AND amount_paise IS NOT NULL))
);

CREATE TABLE hyd_demo.confirmation_receipts (
    tenant_id uuid NOT NULL,
    operation_id uuid NOT NULL,
    draft_id uuid NOT NULL,
    version integer NOT NULL,
    entry_id uuid NOT NULL,
    reason text CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 200),
    PRIMARY KEY (tenant_id, operation_id),
    UNIQUE (tenant_id, draft_id),
    UNIQUE (tenant_id, entry_id),
    FOREIGN KEY (tenant_id, draft_id) REFERENCES hyd_demo.financial_drafts(tenant_id, draft_id),
    FOREIGN KEY (tenant_id, entry_id) REFERENCES hyd_demo.journal(tenant_id, entry_id)
);

ALTER TABLE hyd_demo.financial_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyd_demo.financial_drafts FORCE ROW LEVEL SECURITY;
ALTER TABLE hyd_demo.confirmation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyd_demo.confirmation_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY financial_draft_tenant ON hyd_demo.financial_drafts
    USING (tenant_id = NULLIF(current_setting('hyd_demo.tenant_id', true), '')::uuid);
CREATE POLICY financial_receipt_tenant ON hyd_demo.confirmation_receipts
    USING (tenant_id = NULLIF(current_setting('hyd_demo.tenant_id', true), '')::uuid);
CREATE TRIGGER confirmation_receipts_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
    ON hyd_demo.confirmation_receipts FOR EACH STATEMENT EXECUTE FUNCTION hyd_demo.reject_journal_mutation();

CREATE FUNCTION hyd_demo.get_financial_draft(p_draft uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
    SELECT to_jsonb(d) - 'creation_payload' - 'creation_key' - 'tenant_id'
        || jsonb_build_object('posted_result', to_jsonb(j) - 'tenant_id' - 'operation_id')
    FROM hyd_demo.financial_drafts d
    LEFT JOIN hyd_demo.confirmation_receipts r USING (tenant_id, draft_id)
    LEFT JOIN hyd_demo.journal j ON (j.tenant_id, j.entry_id) = (r.tenant_id, r.entry_id)
    WHERE d.draft_id = p_draft
$$;

CREATE FUNCTION hyd_demo.save_financial_draft(
    p_draft uuid, p_key uuid, p_version integer, p_customer uuid, p_kind text, p_paise integer, p_reverse uuid, p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_tenant uuid := NULLIF(current_setting('hyd_demo.tenant_id', true), '')::uuid;
    v_row hyd_demo.financial_drafts;
    v_payload jsonb := jsonb_build_array(p_customer, p_kind, p_paise, p_reverse, p_reason);
BEGIN
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'TENANT_REQUIRED' USING ERRCODE = '42501'; END IF;
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'READ_COMMITTED_REQUIRED';
    END IF;
    IF (p_kind = 'REVERSAL' AND (p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 200))
        OR (p_kind <> 'REVERSAL' AND p_reason IS NOT NULL) THEN
        RAISE EXCEPTION 'INVALID_REASON' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('hyd_demo.journal:' || v_tenant::text, 0));
    IF p_draft IS NULL THEN
        IF p_key IS NULL OR p_version IS NOT NULL THEN
            RAISE EXCEPTION 'INVALID_DRAFT' USING ERRCODE = '22023';
        END IF;
        SELECT * INTO v_row FROM hyd_demo.financial_drafts
            WHERE tenant_id = v_tenant AND creation_key = p_key;
        IF FOUND THEN
            IF v_row.creation_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
            RETURN hyd_demo.get_financial_draft(v_row.draft_id);
        END IF;
        INSERT INTO hyd_demo.financial_drafts(tenant_id, customer_id, kind, amount_paise, reverses_entry_id,
            creation_key, creation_payload)
        VALUES (v_tenant, p_customer, p_kind, p_paise, p_reverse, p_key, v_payload) RETURNING * INTO v_row;
    ELSE
        SELECT * INTO v_row FROM hyd_demo.financial_drafts WHERE tenant_id = v_tenant AND draft_id = p_draft;
        IF NOT FOUND THEN RAISE EXCEPTION 'DRAFT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
        IF EXISTS (SELECT 1 FROM hyd_demo.confirmation_receipts WHERE tenant_id = v_tenant AND draft_id = p_draft)
            THEN RAISE EXCEPTION 'ALREADY_CONFIRMED'; END IF;
        IF v_row.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'DRAFT_TERMINAL'; END IF;
        IF v_row.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'DRAFT_EXPIRED'; END IF;
        IF v_row.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
        IF v_row.kind = 'REVERSAL' OR p_kind = 'REVERSAL' THEN RAISE EXCEPTION 'DRAFT_TERMINAL'; END IF;
        UPDATE hyd_demo.financial_drafts SET customer_id = p_customer, kind = p_kind,
            amount_paise = p_paise, version = version + 1
            WHERE tenant_id = v_tenant AND draft_id = p_draft RETURNING * INTO v_row;
    END IF;
    RETURN hyd_demo.get_financial_draft(v_row.draft_id);
END;
$$;

CREATE FUNCTION hyd_demo.confirm_financial_draft(p_draft uuid, p_key uuid, p_version integer, p_confirm boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_tenant uuid := NULLIF(current_setting('hyd_demo.tenant_id', true), '')::uuid;
    v_row hyd_demo.financial_drafts;
    v_prior hyd_demo.confirmation_receipts;
    v_entry hyd_demo.journal;
BEGIN
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'TENANT_REQUIRED' USING ERRCODE = '42501'; END IF;
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'READ_COMMITTED_REQUIRED';
    END IF;
    IF p_draft IS NULL OR p_key IS NULL OR p_version IS NULL OR p_confirm IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'EXPLICIT_REVIEW_REQUIRED' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('hyd_demo.journal:' || v_tenant::text, 0));
    SELECT * INTO v_prior FROM hyd_demo.confirmation_receipts WHERE tenant_id = v_tenant AND operation_id = p_key;
    IF FOUND THEN
        IF (v_prior.draft_id, v_prior.version) IS DISTINCT FROM (p_draft, p_version) THEN
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
        END IF;
        RETURN hyd_demo.get_financial_draft(p_draft)->'posted_result';
    END IF;
    SELECT * INTO v_row FROM hyd_demo.financial_drafts WHERE tenant_id = v_tenant AND draft_id = p_draft;
    IF NOT FOUND THEN RAISE EXCEPTION 'DRAFT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    IF EXISTS (SELECT 1 FROM hyd_demo.confirmation_receipts WHERE tenant_id = v_tenant AND draft_id = p_draft)
        THEN RAISE EXCEPTION 'ALREADY_CONFIRMED'; END IF;
    IF v_row.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'DRAFT_TERMINAL'; END IF;
    IF v_row.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'DRAFT_EXPIRED'; END IF;
    IF v_row.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
    IF EXISTS (SELECT 1 FROM hyd_demo.journal WHERE tenant_id = v_tenant AND operation_id = p_key) THEN
        RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
    END IF;
    SELECT * INTO v_entry FROM hyd_demo.post_entry(v_row.customer_id, p_key, v_row.kind,
        v_row.amount_paise, true, v_row.reverses_entry_id);
    INSERT INTO hyd_demo.confirmation_receipts(tenant_id, operation_id, draft_id, version, entry_id, reason)
    VALUES (v_tenant, p_key, p_draft, p_version, v_entry.entry_id, v_row.creation_payload->>4);
    RETURN hyd_demo.get_financial_draft(p_draft)->'posted_result';
END;
$$;

CREATE FUNCTION hyd_demo.cancel_financial_draft(p_draft uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_tenant uuid := NULLIF(current_setting('hyd_demo.tenant_id', true), '')::uuid;
BEGIN
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'TENANT_REQUIRED' USING ERRCODE = '42501'; END IF;
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'READ_COMMITTED_REQUIRED';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('hyd_demo.journal:' || v_tenant::text, 0));
    IF EXISTS (SELECT 1 FROM hyd_demo.confirmation_receipts WHERE tenant_id = v_tenant AND draft_id = p_draft)
        THEN RAISE EXCEPTION 'ALREADY_CONFIRMED'; END IF;
    UPDATE hyd_demo.financial_drafts SET cancelled_at = COALESCE(cancelled_at, clock_timestamp())
        WHERE tenant_id = v_tenant AND draft_id = p_draft;
    IF NOT FOUND THEN RAISE EXCEPTION 'DRAFT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    RETURN hyd_demo.get_financial_draft(p_draft);
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA hyd_demo FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hyd_demo FROM PUBLIC;
-- Grant narrowly to the private connection role in deployment/privileges.sql.
COMMIT;
