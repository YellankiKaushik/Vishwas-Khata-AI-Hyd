-- VISHWAS-KHATA-AI HYDERABAD V3: DESIGN REFERENCE, NOT AN APPLIED MIGRATION.
-- Intended ONLY after historical checksummed 001..007 in local synthetic SQLite.
-- Security/semantics still depend on the Python server: server session/merchant,
-- current signed balance, actual calendar-date validation, request hash, quotas,
-- operation replay, and cross-tenant policy are NOT solved by this DDL alone.
-- Do NOT apply to actual user databases or hosted PostgreSQL without review.
PRAGMA foreign_keys=ON;

-- The current snapshot is mutable ONLY through allowed transitions. A database
-- trigger auto-creates one append-only audit event for every row insert/update.
-- ACTIVE is one customer-level expectation, NEVER an installment allocation.
CREATE TABLE IF NOT EXISTS repayment_commitments (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  expected_date TEXT NOT NULL CHECK (
    length(expected_date)=10 AND
    expected_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  promised_amount_paise INTEGER NULL CHECK (
    promised_amount_paise IS NULL OR
    (typeof(promised_amount_paise)='integer' AND
     promised_amount_paise BETWEEN 1 AND 100000000)
  ),
  state TEXT NOT NULL CHECK (state IN ('ACTIVE','CANCELLED','HANDLED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (typeof(version)='integer' AND version>=1),
  -- Ledger snapshot marker at the merchant's most recent review. The application
  -- uses it to invalidate follow-up drafts after material ledger changes.
  last_reviewed_ledger_hash TEXT NOT NULL CHECK(length(last_reviewed_ledger_hash)=64),
  note TEXT CHECK(note IS NULL OR length(note)<=240),
  last_reason TEXT NOT NULL CHECK(length(trim(last_reason)) BETWEEN 3 AND 240),
  actor_id TEXT NOT NULL CHECK(length(trim(actor_id))>=1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(merchant_id,id),
  UNIQUE(merchant_id,id,customer_id),
  FOREIGN KEY(merchant_id,customer_id) REFERENCES customers(merchant_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hyd_active_customer
 ON repayment_commitments(merchant_id,customer_id) WHERE state='ACTIVE';
CREATE INDEX IF NOT EXISTS idx_hyd_due
 ON repayment_commitments(merchant_id,state,expected_date,customer_id);

CREATE TABLE IF NOT EXISTS commitment_events (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  commitment_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('CREATED','UPDATED','CANCELLED','HANDLED')),
  previous_version INTEGER CHECK(previous_version IS NULL OR previous_version>=1),
  new_version INTEGER NOT NULL CHECK(new_version>=1),
  previous_snapshot_json TEXT CHECK(previous_snapshot_json IS NULL OR json_valid(previous_snapshot_json)),
  new_snapshot_json TEXT NOT NULL CHECK(json_valid(new_snapshot_json)),
  reason TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(merchant_id,commitment_id,new_version),
  FOREIGN KEY(merchant_id,commitment_id,customer_id)
    REFERENCES repayment_commitments(merchant_id,id,customer_id) ON DELETE RESTRICT,
  FOREIGN KEY(merchant_id,customer_id) REFERENCES customers(merchant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_hyd_commitment_history
 ON commitment_events(merchant_id,commitment_id,new_version,id);
CREATE TRIGGER IF NOT EXISTS hyd_event_no_update BEFORE UPDATE ON commitment_events
BEGIN SELECT RAISE(ABORT,'COMMITMENT_EVENT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS hyd_event_no_delete BEFORE DELETE ON commitment_events
BEGIN SELECT RAISE(ABORT,'COMMITMENT_EVENT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS hyd_commitment_no_delete BEFORE DELETE ON repayment_commitments
BEGIN SELECT RAISE(ABORT,'COMMITMENT_DELETE_FORBIDDEN'); END;

CREATE TRIGGER IF NOT EXISTS hyd_commitment_insert_guard BEFORE INSERT ON repayment_commitments
BEGIN
 SELECT CASE WHEN NEW.version != 1 OR NEW.state != 'ACTIVE'
   THEN RAISE(ABORT,'COMMITMENT_CREATE_MUST_BE_ACTIVE_V1') END;
END;
CREATE TRIGGER IF NOT EXISTS hyd_commitment_update_guard BEFORE UPDATE ON repayment_commitments
BEGIN
 SELECT CASE WHEN NEW.id IS NOT OLD.id
   OR NEW.merchant_id IS NOT OLD.merchant_id
   OR NEW.customer_id IS NOT OLD.customer_id
   OR NEW.created_at IS NOT OLD.created_at
   THEN RAISE(ABORT,'COMMITMENT_IDENTITY_IMMUTABLE') END;
 SELECT CASE WHEN OLD.state != 'ACTIVE'
   THEN RAISE(ABORT,'TERMINAL_COMMITMENT_LOCKED') END;
 SELECT CASE WHEN NEW.state NOT IN ('ACTIVE','CANCELLED','HANDLED')
   THEN RAISE(ABORT,'INVALID_COMMITMENT_TRANSITION') END;
 SELECT CASE WHEN NEW.version != OLD.version + 1
   THEN RAISE(ABORT,'COMMITMENT_VERSION_MUST_INCREMENT') END;
 SELECT CASE WHEN NEW.updated_at <= OLD.updated_at
   THEN RAISE(ABORT,'COMMITMENT_TIME_MUST_ADVANCE') END;
END;

-- App never inserts history manually; triggers are the only writer in normal use.
-- BEGIN IMMEDIATE + create/update + immutable response receipt + audit all share
-- one transaction. A failure in event insertion aborts the parent statement.
CREATE TRIGGER IF NOT EXISTS hyd_commitment_created AFTER INSERT ON repayment_commitments
BEGIN
 INSERT INTO commitment_events (
  id,merchant_id,commitment_id,customer_id,event_type,previous_version,new_version,
  previous_snapshot_json,new_snapshot_json,reason,actor_id,created_at
 ) VALUES (
  lower(hex(randomblob(16))),NEW.merchant_id,NEW.id,NEW.customer_id,'CREATED',NULL,1,NULL,
  json_object('state',NEW.state,'expected_date',NEW.expected_date,
   'promised_amount_paise',NEW.promised_amount_paise,'ledger_hash',NEW.last_reviewed_ledger_hash,
   'note',NEW.note,'version',NEW.version),
  NEW.last_reason,NEW.actor_id,NEW.updated_at
 );
END;
CREATE TRIGGER IF NOT EXISTS hyd_commitment_changed AFTER UPDATE ON repayment_commitments
BEGIN
 INSERT INTO commitment_events (
  id,merchant_id,commitment_id,customer_id,event_type,previous_version,new_version,
  previous_snapshot_json,new_snapshot_json,reason,actor_id,created_at
 ) VALUES (
  lower(hex(randomblob(16))),NEW.merchant_id,NEW.id,NEW.customer_id,
  CASE NEW.state WHEN 'CANCELLED' THEN 'CANCELLED'
     WHEN 'HANDLED' THEN 'HANDLED' ELSE 'UPDATED' END,
  OLD.version,NEW.version,
  json_object('state',OLD.state,'expected_date',OLD.expected_date,
   'promised_amount_paise',OLD.promised_amount_paise,'ledger_hash',OLD.last_reviewed_ledger_hash,
   'note',OLD.note,'version',OLD.version),
  json_object('state',NEW.state,'expected_date',NEW.expected_date,
   'promised_amount_paise',NEW.promised_amount_paise,'ledger_hash',NEW.last_reviewed_ledger_hash,
   'note',NEW.note,'version',NEW.version),
  NEW.last_reason,NEW.actor_id,NEW.updated_at
 );
END;

-- Replay receipts retain the exact original HTTP body, regardless of later
-- updates. The event version FK prevents pointing at nonexistent history.
CREATE TABLE IF NOT EXISTS commitment_operation_receipts (
  merchant_id TEXT NOT NULL,
  operation_id TEXT NOT NULL CHECK(length(operation_id) BETWEEN 8 AND 128),
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  commitment_id TEXT NOT NULL,
  event_version INTEGER NOT NULL,
  response_json TEXT NOT NULL CHECK(json_valid(response_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(merchant_id,operation_id),
  FOREIGN KEY(merchant_id,commitment_id,event_version)
    REFERENCES commitment_events(merchant_id,commitment_id,new_version) ON DELETE RESTRICT
);
CREATE TRIGGER IF NOT EXISTS hyd_receipt_no_update BEFORE UPDATE ON commitment_operation_receipts
BEGIN SELECT RAISE(ABORT,'COMMITMENT_RECEIPT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS hyd_receipt_no_delete BEFORE DELETE ON commitment_operation_receipts
BEGIN SELECT RAISE(ABORT,'COMMITMENT_RECEIPT_IMMUTABLE'); END;

-- IMPORTANT: HANDLED is an administrative close, NEVER proof of payment.
-- Referential integrity additionally prevents fabricated event customer identity
-- within one merchant (composite merchant/commitment/customer parent key).
-- UNRESOLVED RELEASE GATES (application/SQLite migration tests required):
-- * A valid ISO calendar date and timezone-aware `Asia/Kolkata` policy.
-- * Current customer outstanding >0 at create and edit; promised amount <= balance
--   when entered; amount after repayments is never treated as allocated debt.
-- * Freeze or require explicit re-review if NEW CREDIT or positive reversal after
--   `last_reviewed_ledger_hash`; any ledger change invalidates pending follow-up.
-- * Validate all merchant IDs against the server session; no trust in client IDs.
-- * Sequence: BEGIN IMMEDIATE -> lookup receipt -> validate state and balances ->
--   create/update -> SELECT generated event -> insert receipt -> insert audit -> COMMIT.
-- * Sequence for an exact duplicate operation returns stored original receipt,
--   before checking current version; differing digest must 409.
-- * Finite date/amount/text validation and dynamic `$`/UTC handling in app.
-- * Hosted PostgreSQL requires a separate equivalent migration, RLS policies,
--   safe session handling, and DB-native trigger evaluation; this file is SQLite only.
