-- Run as hyd_demo's non-superuser owner after migrations. Provision hyd_runtime
-- as a private LOGIN with no role memberships, ownership or BYPASSRLS beforehand.
REVOKE ALL ON ALL TABLES IN SCHEMA hyd_demo FROM hyd_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hyd_demo FROM hyd_runtime;
GRANT USAGE ON SCHEMA hyd_demo TO hyd_runtime;
GRANT SELECT ON hyd_demo.customers, hyd_demo.journal, hyd_demo.commitments,
    hyd_demo.commitment_events, hyd_demo.confirmation_receipts TO hyd_runtime;
GRANT EXECUTE ON FUNCTION hyd_demo.open_demo_session(text), hyd_demo.bind_demo_session(text),
    hyd_demo.revoke_demo_session(text), hyd_demo.consume_quota(text, integer),
    hyd_demo.get_financial_draft(uuid), hyd_demo.cancel_financial_draft(uuid),
    hyd_demo.save_financial_draft(uuid, uuid, integer, uuid, text, integer, uuid, text),
    hyd_demo.confirm_financial_draft(uuid, uuid, integer, boolean),
    hyd_demo.ledger_evidence(uuid), hyd_demo.commitment_evidence(uuid),
    hyd_demo.reviewed_commitment_change(uuid, uuid, uuid, text, integer, date, integer, text, text),
    hyd_demo.hosted_ready(), hyd_demo.valid_runtime_tenant(uuid),
    hyd_demo.review_followup(uuid, integer, text, boolean) TO hyd_runtime;
