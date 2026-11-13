BEGIN;

CREATE SCHEMA hyd_demo;
REVOKE ALL ON SCHEMA hyd_demo FROM PUBLIC;

CREATE TABLE hyd_demo.customers (
    tenant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    sample_name text NOT NULL CHECK (sample_name IN ('Ramesh', 'Priya', 'Lakshmi')),
    PRIMARY KEY (tenant_id, customer_id),
    UNIQUE (tenant_id, sample_name)
);

CREATE TABLE hyd_demo.journal (
    tenant_id uuid NOT NULL,
    entry_id uuid NOT NULL DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL,
    operation_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('CREDIT_GIVEN', 'REPAYMENT_RECEIVED', 'REVERSAL')),
    signed_paise bigint NOT NULL CHECK (signed_paise BETWEEN -100000000 AND 100000000 AND signed_paise <> 0),
    balance_after_paise bigint NOT NULL CHECK (balance_after_paise >= 0),
    reverses_entry_id uuid,
    posted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, entry_id),
    UNIQUE (tenant_id, operation_id),
    UNIQUE (tenant_id, customer_id, entry_id),
    UNIQUE (tenant_id, reverses_entry_id),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES hyd_demo.customers (tenant_id, customer_id),
    FOREIGN KEY (tenant_id, customer_id, reverses_entry_id)
        REFERENCES hyd_demo.journal (tenant_id, customer_id, entry_id),
    CHECK (
        (kind = 'CREDIT_GIVEN' AND signed_paise > 0 AND reverses_entry_id IS NULL)
        OR (kind = 'REPAYMENT_RECEIVED' AND signed_paise < 0 AND reverses_entry_id IS NULL)
        OR (kind = 'REVERSAL' AND reverses_entry_id IS NOT NULL)
    )
);

-- The future authenticated API must bind the server-derived tenant in each transaction.
-- Browser clients must never receive a database credential or choose this setting.
ALTER TABLE hyd_demo.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyd_demo.customers FORCE ROW LEVEL SECURITY;
ALTER TABLE hyd_demo.journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE hyd_demo.journal FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_tenant ON hyd_demo.customers
    USING (tenant_id = NULLIF(current_setting('hyd_demo.tenant_id', true), '')::uuid);
CREATE POLICY journal_tenant ON hyd_demo.journal
    USING (tenant_id = NULLIF(current_setting('hyd_demo.tenant_id', true), '')::uuid);

CREATE FUNCTION hyd_demo.reject_journal_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'JOURNAL_APPEND_ONLY' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER journal_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON hyd_demo.journal
    FOR EACH STATEMENT EXECUTE FUNCTION hyd_demo.reject_journal_mutation();

-- Install as a dedicated, non-superuser schema owner without BYPASSRLS.
-- The separate API role needs SELECT and EXECUTE only. Explicit reviewed-draft
-- versions and authenticated sessions belong to the API layer still to be ported.
CREATE FUNCTION hyd_demo.post_entry(
    p_customer_id uuid, p_operation_id uuid, p_kind text, p_amount_paise integer,
    p_confirm boolean, p_reverses_entry_id uuid DEFAULT NULL
) RETURNS hyd_demo.journal
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
    v_tenant uuid := NULLIF(current_setting('hyd_demo.tenant_id', true), '')::uuid;
    v_prior hyd_demo.journal;
    v_original hyd_demo.journal;
    v_signed bigint;
    v_balance bigint;
BEGIN
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'TENANT_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'READ_COMMITTED_REQUIRED' USING ERRCODE = '25001';
    END IF;
    IF p_confirm IS DISTINCT FROM true OR p_customer_id IS NULL OR p_operation_id IS NULL
       OR p_kind IS NULL OR p_kind NOT IN ('CREDIT_GIVEN', 'REPAYMENT_RECEIVED', 'REVERSAL')
       OR (p_kind = 'REVERSAL' AND (p_reverses_entry_id IS NULL OR p_amount_paise IS NOT NULL))
       OR (p_kind <> 'REVERSAL' AND (
           p_reverses_entry_id IS NOT NULL OR p_amount_paise IS NULL
           OR p_amount_paise NOT BETWEEN 1 AND 100000000
       )) THEN
        RAISE EXCEPTION 'INVALID_CONFIRMED_ENTRY' USING ERRCODE = '22023';
    END IF;

    -- Serialize tenant writes. At READ COMMITTED the next statement sees the
    -- latest committed receipt and balance after waiting for the lock.
    PERFORM pg_advisory_xact_lock(hashtextextended('hyd_demo.journal:' || v_tenant::text, 0));
    SELECT * INTO v_prior FROM hyd_demo.journal
        WHERE tenant_id = v_tenant AND operation_id = p_operation_id;
    IF FOUND THEN
        IF v_prior.customer_id IS DISTINCT FROM p_customer_id OR v_prior.kind IS DISTINCT FROM p_kind
           OR v_prior.reverses_entry_id IS DISTINCT FROM p_reverses_entry_id
           OR (p_kind <> 'REVERSAL' AND abs(v_prior.signed_paise) IS DISTINCT FROM p_amount_paise) THEN
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
        END IF;
        RETURN v_prior;
    END IF;

    PERFORM 1 FROM hyd_demo.customers WHERE tenant_id = v_tenant AND customer_id = p_customer_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF p_kind = 'REVERSAL' THEN
        SELECT * INTO v_original FROM hyd_demo.journal
            WHERE tenant_id = v_tenant AND customer_id = p_customer_id AND entry_id = p_reverses_entry_id
                AND kind <> 'REVERSAL';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'REVERSIBLE_ENTRY_NOT_FOUND' USING ERRCODE = 'P0002';
        END IF;
        IF EXISTS (SELECT 1 FROM hyd_demo.journal
            WHERE tenant_id = v_tenant AND reverses_entry_id = p_reverses_entry_id) THEN
            RAISE EXCEPTION 'ENTRY_ALREADY_REVERSED' USING ERRCODE = '23505';
        END IF;
        v_signed := -v_original.signed_paise;
    ELSIF p_kind = 'CREDIT_GIVEN' THEN
        v_signed := p_amount_paise;
    ELSE
        v_signed := -p_amount_paise;
    END IF;

    SELECT COALESCE(sum(signed_paise), 0) + v_signed INTO v_balance
        FROM hyd_demo.journal WHERE tenant_id = v_tenant AND customer_id = p_customer_id;
    IF v_balance < 0 THEN
        RAISE EXCEPTION 'NEGATIVE_RECEIVABLE' USING ERRCODE = '23514';
    END IF;

    INSERT INTO hyd_demo.journal (
        tenant_id, customer_id, operation_id, kind, signed_paise, balance_after_paise, reverses_entry_id
    ) VALUES (
        v_tenant, p_customer_id, p_operation_id, p_kind, v_signed, v_balance, p_reverses_entry_id
    ) RETURNING * INTO v_prior;
    RETURN v_prior;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA hyd_demo FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hyd_demo FROM PUBLIC;

COMMIT;
