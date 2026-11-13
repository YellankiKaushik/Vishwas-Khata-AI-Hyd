-- Additive application state; normative V3 files remain byte-for-byte unchanged.
ALTER TABLE ledger_drafts ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL' CHECK(source IN ('MANUAL','VOICE_CONFIRMED','FIXTURE'));
CREATE TABLE demo_sessions (
 token_hash TEXT PRIMARY KEY,
 merchant_id TEXT NOT NULL REFERENCES merchants(id),
 expires_at TEXT NOT NULL
);
CREATE TABLE seed_runs (fixture_version TEXT PRIMARY KEY, sha256 TEXT NOT NULL);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER idempotency_no_update BEFORE UPDATE ON idempotency_records BEGIN SELECT RAISE(ABORT,'IDEMPOTENCY_IMMUTABLE'); END;
CREATE TRIGGER idempotency_no_delete BEFORE DELETE ON idempotency_records BEGIN SELECT RAISE(ABORT,'IDEMPOTENCY_IMMUTABLE'); END;
