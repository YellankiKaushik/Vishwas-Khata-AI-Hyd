-- Synthetic staging groundwork only. No public API/session layer is supplied.
-- Install after 001 as the dedicated NOLOGIN, NOBYPASSRLS schema owner.
BEGIN;

ALTER TABLE hyd_demo.journal ADD COLUMN sequence bigint GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX journal_sequence ON hyd_demo.journal(sequence);

CREATE TABLE hyd_demo.commitments (
    tenant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    commitment_id uuid NOT NULL DEFAULT gen_random_uuid(),
    expected_date date NOT NULL CHECK (expected_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
    promised_paise integer CHECK (promised_paise BETWEEN 1 AND 100000000),
    state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'CANCELLED', 'HANDLED')),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    reviewed_positive_sequence bigint NOT NULL CHECK (reviewed_positive_sequence >= 0),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, commitment_id),
    UNIQUE (tenant_id, customer_id, commitment_id),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES hyd_demo.customers(tenant_id, customer_id)
);
CREATE UNIQUE INDEX one_active_commitment ON hyd_demo.commitments(tenant_id, customer_id) WHERE state = 'ACTIVE';

CREATE TABLE hyd_demo.commitment_events (
    tenant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    commitment_id uuid NOT NULL,
    version integer NOT NULL,
    prior_version integer,
    actor_tenant uuid NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('CREATED', 'UPDATED', 'CANCELLED', 'HANDLED')),
    snapshot jsonb NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, commitment_id, version),
    FOREIGN KEY (tenant_id, customer_id, commitment_id)
        REFERENCES hyd_demo.commitments(tenant_id, customer_id, commitment_id),
    CHECK (actor_tenant = tenant_id),
    CHECK ((version = 1 AND prior_version IS NULL) OR prior_version = version - 1)
);

CREATE TABLE hyd_demo.commitment_receipts (
    tenant_id uuid NOT NULL,
    operation_id uuid NOT NULL,
    request jsonb NOT NULL,
    response jsonb NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, operation_id)
);

ALTER TABLE hyd_demo.commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyd_demo.commitments FORCE ROW LEVEL SECURITY;
ALTER TABLE hyd_demo.commitment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyd_demo.commitment_events FORCE ROW LEVEL SECURITY;
ALTER TABLE hyd_demo.commitment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyd_demo.commitment_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY commitment_tenant ON hyd_demo.commitments
    USING (tenant_id = NULLIF(current_setting('hyd_demo.tenant_id', true), '')::uuid);
CREATE POLICY event_tenant ON hyd_demo.commitment_events
    USING (tenant_id = NULLIF(current_setting('hyd_demo.tenant_id', true), '')::uuid);
CREATE POLICY receipt_tenant ON hyd_demo.commitment_receipts
    USING (tenant_id = NULLIF(current_setting('hyd_demo.tenant_id', true), '')::uuid);

CREATE TRIGGER commitment_events_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON hyd_demo.commitment_events
    FOR EACH STATEMENT EXECUTE FUNCTION hyd_demo.reject_journal_mutation();
CREATE TRIGGER commitment_receipts_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON hyd_demo.commitment_receipts
    FOR EACH STATEMENT EXECUTE FUNCTION hyd_demo.reject_journal_mutation();

CREATE FUNCTION hyd_demo.guard_commitment() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'COMMITMENT_HISTORY_REQUIRED'; END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.version <> 1 OR NEW.state <> 'ACTIVE' THEN RAISE EXCEPTION 'INVALID_INITIAL_COMMITMENT'; END IF;
    ELSE
        IF OLD.state <> 'ACTIVE' OR NEW.version <> OLD.version + 1
           OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
           OR NEW.commitment_id IS DISTINCT FROM OLD.commitment_id THEN
            RAISE EXCEPTION 'COMMITMENT_VERSION_OR_IDENTITY_CONFLICT';
        END IF;
    END IF;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;
CREATE TRIGGER commitment_guard BEFORE INSERT OR UPDATE OR DELETE ON hyd_demo.commitments
    FOR EACH ROW EXECUTE FUNCTION hyd_demo.guard_commitment();
CREATE TRIGGER commitment_no_truncate BEFORE TRUNCATE ON hyd_demo.commitments
    FOR EACH STATEMENT EXECUTE FUNCTION hyd_demo.reject_journal_mutation();

CREATE FUNCTION hyd_demo.record_commitment_event() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    INSERT INTO hyd_demo.commitment_events
        (tenant_id, customer_id, commitment_id, version, prior_version, actor_tenant, event_type, snapshot)
    VALUES (NEW.tenant_id, NEW.customer_id, NEW.commitment_id, NEW.version,
        CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.version END, NEW.tenant_id,
        CASE WHEN TG_OP = 'INSERT' THEN 'CREATED' WHEN NEW.state = 'ACTIVE' THEN 'UPDATED' ELSE NEW.state END,
        to_jsonb(NEW));
    RETURN NEW;
END;
$$;
CREATE TRIGGER commitment_event AFTER INSERT OR UPDATE ON hyd_demo.commitments
    FOR EACH ROW EXECUTE FUNCTION hyd_demo.record_commitment_event();

CREATE FUNCTION hyd_demo.ledger_evidence(p_customer uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_tenant uuid := NULLIF(current_setting('hyd_demo.tenant_id', true), '')::uuid;
    v_entries jsonb;
    v_balance bigint;
    v_positive bigint;
BEGIN
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'TENANT_REQUIRED' USING ERRCODE = '42501'; END IF;
    IF NOT EXISTS (SELECT 1 FROM hyd_demo.customers WHERE tenant_id = v_tenant AND customer_id = p_customer) THEN
        RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    SELECT COALESCE(sum(signed_paise), 0), COALESCE(max(sequence) FILTER (WHERE signed_paise > 0), 0),
        COALESCE(jsonb_agg(jsonb_build_array(entry_id, signed_paise, sequence) ORDER BY sequence), '[]'::jsonb)
    INTO v_balance, v_positive, v_entries FROM hyd_demo.journal
        WHERE tenant_id = v_tenant AND customer_id = p_customer;
    RETURN jsonb_build_object('outstanding_paise', v_balance, 'positive_sequence', v_positive,
        'evidence_ids', (SELECT COALESCE(jsonb_agg('ledger:' || entry_id ORDER BY sequence), '[]'::jsonb)
            FROM hyd_demo.journal WHERE tenant_id = v_tenant AND customer_id = p_customer),
        'ledger_hash', encode(sha256(convert_to(jsonb_build_array(v_tenant, p_customer, v_entries)::text, 'UTF8')), 'hex'));
END;
$$;

CREATE FUNCTION hyd_demo.commitment_evidence(p_commitment uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_tenant uuid := NULLIF(current_setting('hyd_demo.tenant_id', true), '')::uuid;
    v_row hyd_demo.commitments;
    v_ledger jsonb;
    v_date date := (statement_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
    v_status text;
    v_data jsonb;
BEGIN
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'TENANT_REQUIRED' USING ERRCODE = '42501'; END IF;
    SELECT * INTO v_row FROM hyd_demo.commitments WHERE tenant_id = v_tenant AND commitment_id = p_commitment;
    IF NOT FOUND THEN RAISE EXCEPTION 'COMMITMENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    v_ledger := hyd_demo.ledger_evidence(v_row.customer_id);
    v_status := CASE WHEN v_row.state <> 'ACTIVE' THEN v_row.state
        WHEN (v_ledger->>'outstanding_paise')::bigint = 0 THEN 'SETTLED'
        WHEN (v_ledger->>'positive_sequence')::bigint > v_row.reviewed_positive_sequence THEN 'REVIEW_REQUIRED'
        WHEN v_row.expected_date > v_date THEN 'NOT_DUE'
        WHEN v_row.expected_date = v_date THEN 'DUE_TODAY' ELSE 'PAST_EXPECTED_DATE' END;
    v_data := to_jsonb(v_row) || v_ledger || jsonb_build_object('as_of_date_ist', v_date,
        'coverage', 'RECORDED_LEDGER_AND_COMMITMENTS_ONLY', 'due_status', v_status,
        'followup_eligible', v_status IN ('DUE_TODAY', 'PAST_EXPECTED_DATE'));
    RETURN v_data || jsonb_build_object('evidence_hash',
        encode(sha256(convert_to(v_data::text, 'UTF8')), 'hex'));
END;
$$;

CREATE FUNCTION hyd_demo.mutate_commitment(
    p_customer uuid, p_commitment uuid, p_operation uuid, p_action text, p_version integer,
    p_date date, p_promised integer, p_ledger_hash text, p_confirm boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_tenant uuid := NULLIF(current_setting('hyd_demo.tenant_id', true), '')::uuid;
    v_row hyd_demo.commitments;
    v_prior hyd_demo.commitment_receipts;
    v_request jsonb := jsonb_build_array(p_customer, p_commitment, p_action, p_version, p_date, p_promised, p_ledger_hash, p_confirm);
    v_ledger jsonb;
    v_response jsonb;
BEGIN
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'TENANT_REQUIRED' USING ERRCODE = '42501'; END IF;
    IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'READ_COMMITTED_REQUIRED'; END IF;
    IF p_confirm IS DISTINCT FROM true OR p_operation IS NULL OR p_customer IS NULL OR p_commitment IS NULL
        OR p_action IS NULL OR p_action NOT IN ('CREATE', 'UPDATE', 'CANCEL', 'HANDLE') THEN
        RAISE EXCEPTION 'EXPLICIT_REVIEW_REQUIRED' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('hyd_demo.journal:' || v_tenant::text, 0));
    SELECT * INTO v_prior FROM hyd_demo.commitment_receipts WHERE tenant_id = v_tenant AND operation_id = p_operation;
    IF FOUND THEN
        IF v_prior.request IS DISTINCT FROM v_request THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505'; END IF;
        RETURN v_prior.response;
    END IF;
    v_ledger := hyd_demo.ledger_evidence(p_customer);
    IF p_action IN ('CREATE', 'UPDATE') THEN
        IF p_date IS NULL OR p_ledger_hash IS DISTINCT FROM v_ledger->>'ledger_hash' THEN RAISE EXCEPTION 'STALE_LEDGER'; END IF;
        IF (v_ledger->>'outstanding_paise')::bigint <= 0
           OR (p_promised IS NOT NULL AND (p_promised <= 0 OR p_promised > (v_ledger->>'outstanding_paise')::bigint)) THEN
            RAISE EXCEPTION 'INVALID_PROMISE_AMOUNT';
        END IF;
    END IF;
    IF p_action = 'CREATE' THEN
        IF p_version IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
        INSERT INTO hyd_demo.commitments(tenant_id, customer_id, commitment_id, expected_date, promised_paise, reviewed_positive_sequence)
        VALUES (v_tenant, p_customer, p_commitment, p_date, p_promised, (v_ledger->>'positive_sequence')::bigint);
    ELSE
        SELECT * INTO v_row FROM hyd_demo.commitments
            WHERE tenant_id = v_tenant AND customer_id = p_customer AND commitment_id = p_commitment FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'COMMITMENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
        IF v_row.state <> 'ACTIVE' OR p_version IS DISTINCT FROM v_row.version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
        UPDATE hyd_demo.commitments SET
            expected_date = CASE WHEN p_action = 'UPDATE' THEN p_date ELSE expected_date END,
            promised_paise = CASE WHEN p_action = 'UPDATE' THEN p_promised ELSE promised_paise END,
            reviewed_positive_sequence = CASE WHEN p_action = 'UPDATE' THEN (v_ledger->>'positive_sequence')::bigint ELSE reviewed_positive_sequence END,
            state = CASE p_action WHEN 'CANCEL' THEN 'CANCELLED' WHEN 'HANDLE' THEN 'HANDLED' ELSE state END,
            version = version + 1 WHERE tenant_id = v_tenant AND commitment_id = p_commitment;
    END IF;
    v_response := hyd_demo.commitment_evidence(p_commitment);
    INSERT INTO hyd_demo.commitment_receipts(tenant_id, operation_id, request, response)
        VALUES (v_tenant, p_operation, v_request, v_response);
    RETURN v_response;
END;
$$;

CREATE FUNCTION hyd_demo.review_followup(p_commitment uuid, p_version integer, p_evidence_hash text, p_confirm boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_data jsonb;
BEGIN
    IF p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'EXPLICIT_REVIEW_REQUIRED'; END IF;
    v_data := hyd_demo.commitment_evidence(p_commitment);
    IF p_version IS DISTINCT FROM (v_data->>'version')::integer THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
    IF p_evidence_hash IS DISTINCT FROM v_data->>'evidence_hash' THEN RAISE EXCEPTION 'STALE_EVIDENCE'; END IF;
    IF (v_data->>'followup_eligible')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'REVIEW_REQUIRED'; END IF;
    RETURN jsonb_build_object('status', 'DRAFT_NOT_SENT', 'sent', false, 'language', 'en-IN',
        'outstanding_paise', v_data->'outstanding_paise', 'source_facts_hash', v_data->'evidence_hash',
        'text', 'Hello, could you please review the recorded balance of INR ' ||
            to_char((v_data->>'outstanding_paise')::numeric / 100, 'FM9999999999990.00') ||
            '? Our recorded expected date is ' || (v_data->>'expected_date') ||
            '. If you have already paid, please let me know so I can check the record. Thank you.');
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA hyd_demo FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hyd_demo FROM PUBLIC;
COMMIT;
