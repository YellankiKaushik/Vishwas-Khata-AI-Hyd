-- Customer-level repayment expectations and their history.
CREATE TABLE repayment_commitments (
  id TEXT PRIMARY KEY CHECK (length(id) > 0),
  merchant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  expected_date TEXT NOT NULL CHECK (
    expected_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND expected_date >= '0001-01-01'
    AND date(expected_date, '+0 days') IS expected_date
  ),
  promised_amount_paise INTEGER CHECK (
    promised_amount_paise IS NULL OR (
      typeof(promised_amount_paise) = 'integer'
      AND promised_amount_paise BETWEEN 1 AND 100000000
    )
  ),
  last_reviewed_ledger_hash TEXT NOT NULL CHECK (
    length(last_reviewed_ledger_hash) = 64
    AND last_reviewed_ledger_hash NOT GLOB '*[^0-9a-f]*'
  ),
  state TEXT NOT NULL CHECK (state IN ('ACTIVE', 'CANCELLED', 'HANDLED')),
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version >= 1),
  actor_id TEXT NOT NULL CHECK (length(trim(actor_id)) > 0),
  last_reason TEXT NOT NULL CHECK (length(trim(last_reason)) > 0 AND length(last_reason) <= 240),
  created_at TEXT NOT NULL,
  -- Match the application's utc_text format so text order is chronological.
  updated_at TEXT NOT NULL CHECK (
    updated_at >= created_at
    AND updated_at GLOB '????-??-??T??:??:??.[0-9][0-9][0-9][0-9][0-9][0-9]Z'
    AND strftime('%Y-%m-%dT%H:%M:%S', substr(updated_at, 1, 19), '+0 seconds')
      IS substr(updated_at, 1, 19)
  ),
  UNIQUE (merchant_id, id),
  FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id)
) WITHOUT ROWID;

CREATE UNIQUE INDEX idx_commitments_active_customer
  ON repayment_commitments(merchant_id, customer_id) WHERE state = 'ACTIVE';
CREATE INDEX idx_commitments_customer_state
  ON repayment_commitments(merchant_id, customer_id, state);
CREATE INDEX idx_commitments_state_expected_date
  ON repayment_commitments(merchant_id, state, expected_date);

CREATE TABLE commitment_events (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  commitment_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('CREATED', 'UPDATED', 'CANCELLED', 'HANDLED')),
  previous_version INTEGER,
  new_version INTEGER NOT NULL CHECK (typeof(new_version) = 'integer' AND new_version >= 1),
  previous_snapshot_json TEXT,
  new_snapshot_json TEXT NOT NULL CHECK (json_valid(new_snapshot_json)),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0 AND length(reason) <= 240),
  created_at TEXT NOT NULL,
  actor_id TEXT NOT NULL CHECK (length(trim(actor_id)) > 0),
  CHECK (
    (event_type = 'CREATED' AND new_version = 1
      AND previous_version IS NULL AND previous_snapshot_json IS NULL)
    OR (event_type <> 'CREATED' AND new_version > 1
      AND previous_version IS NOT NULL AND previous_version = new_version - 1
      AND previous_snapshot_json IS NOT NULL AND json_valid(previous_snapshot_json))
  ),
  UNIQUE (merchant_id, id),
  UNIQUE (merchant_id, commitment_id, new_version),
  FOREIGN KEY (merchant_id, commitment_id) REFERENCES repayment_commitments(merchant_id, id)
) WITHOUT ROWID;

CREATE TABLE commitment_operation_receipts (
  merchant_id TEXT NOT NULL,
  operation_id TEXT NOT NULL CHECK (length(operation_id) BETWEEN 8 AND 128),
  event_id TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (merchant_id, operation_id),
  FOREIGN KEY (merchant_id, event_id) REFERENCES commitment_events(merchant_id, id)
) WITHOUT ROWID;

CREATE TRIGGER commitment_insert_guard BEFORE INSERT ON repayment_commitments
BEGIN
  SELECT CASE WHEN NEW.version <> 1 OR NEW.state <> 'ACTIVE' OR NEW.updated_at <> NEW.created_at
    THEN RAISE(ABORT, 'COMMITMENT_INVALID_INITIAL_STATE') END;
  -- REPLACE can delete conflicting rows without firing delete triggers.
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM repayment_commitments WHERE id = NEW.id
  ) OR EXISTS (
    SELECT 1 FROM repayment_commitments
    WHERE merchant_id = NEW.merchant_id AND customer_id = NEW.customer_id AND state = 'ACTIVE'
  ) THEN RAISE(ABORT, 'COMMITMENT_ALREADY_EXISTS') END;
END;

CREATE TRIGGER commitment_update_guard BEFORE UPDATE ON repayment_commitments
BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.merchant_id IS NOT OLD.merchant_id
    OR NEW.customer_id IS NOT OLD.customer_id OR NEW.created_at IS NOT OLD.created_at
    THEN RAISE(ABORT, 'COMMITMENT_IDENTITY_IMMUTABLE') END;
  SELECT CASE WHEN OLD.state <> 'ACTIVE'
    THEN RAISE(ABORT, 'COMMITMENT_TERMINAL') END;
  SELECT CASE WHEN NEW.version <> OLD.version + 1 OR NEW.updated_at <= OLD.updated_at
    THEN RAISE(ABORT, 'COMMITMENT_INVALID_REVISION') END;
END;

CREATE TRIGGER commitment_no_delete BEFORE DELETE ON repayment_commitments
BEGIN
  SELECT RAISE(ABORT, 'COMMITMENT_DELETE_FORBIDDEN');
END;

CREATE TRIGGER commitment_event_insert_guard BEFORE INSERT ON commitment_events
BEGIN
  -- The version is current only after the parent write and is filled by its AFTER trigger.
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM repayment_commitments
    WHERE merchant_id = NEW.merchant_id AND id = NEW.commitment_id AND version = NEW.new_version
  ) OR EXISTS (
    SELECT 1 FROM commitment_events WHERE id = NEW.id
  ) OR EXISTS (
    SELECT 1 FROM commitment_events
    WHERE merchant_id = NEW.merchant_id AND commitment_id = NEW.commitment_id
      AND new_version = NEW.new_version
  ) THEN RAISE(ABORT, 'COMMITMENT_EVENT_IMMUTABLE') END;
END;

CREATE TRIGGER commitment_event_no_update BEFORE UPDATE ON commitment_events
BEGIN
  SELECT RAISE(ABORT, 'COMMITMENT_EVENT_IMMUTABLE');
END;

CREATE TRIGGER commitment_event_no_delete BEFORE DELETE ON commitment_events
BEGIN
  SELECT RAISE(ABORT, 'COMMITMENT_EVENT_IMMUTABLE');
END;

CREATE TRIGGER commitment_record_creation AFTER INSERT ON repayment_commitments
BEGIN
  INSERT INTO commitment_events (
    id, merchant_id, commitment_id, event_type, new_version, new_snapshot_json,
    reason, created_at, actor_id
  ) VALUES (
    NEW.id || ':1', NEW.merchant_id, NEW.id, 'CREATED', NEW.version,
    json_object(
      'customer_id', NEW.customer_id, 'expected_date', NEW.expected_date,
      'promised_amount_paise', NEW.promised_amount_paise, 'state', NEW.state,
      'version', NEW.version, 'last_reviewed_ledger_hash', NEW.last_reviewed_ledger_hash
    ),
    NEW.last_reason, NEW.updated_at, NEW.actor_id
  );
END;

CREATE TRIGGER commitment_record_revision AFTER UPDATE ON repayment_commitments
BEGIN
  INSERT INTO commitment_events (
    id, merchant_id, commitment_id, event_type, previous_version, new_version,
    previous_snapshot_json, new_snapshot_json, reason, created_at, actor_id
  ) VALUES (
    NEW.id || ':' || NEW.version, NEW.merchant_id, NEW.id,
    CASE NEW.state WHEN 'ACTIVE' THEN 'UPDATED' ELSE NEW.state END, OLD.version, NEW.version,
    (SELECT new_snapshot_json FROM commitment_events
      WHERE merchant_id = OLD.merchant_id AND commitment_id = OLD.id AND new_version = OLD.version),
    json_object(
      'customer_id', NEW.customer_id, 'expected_date', NEW.expected_date,
      'promised_amount_paise', NEW.promised_amount_paise, 'state', NEW.state,
      'version', NEW.version, 'last_reviewed_ledger_hash', NEW.last_reviewed_ledger_hash
    ),
    NEW.last_reason, NEW.updated_at, NEW.actor_id
  );
END;

CREATE TRIGGER commitment_receipt_insert_guard BEFORE INSERT ON commitment_operation_receipts
WHEN EXISTS (
  SELECT 1 FROM commitment_operation_receipts
  WHERE merchant_id = NEW.merchant_id AND operation_id = NEW.operation_id
)
BEGIN
  SELECT RAISE(ABORT, 'COMMITMENT_RECEIPT_IMMUTABLE');
END;

CREATE TRIGGER commitment_receipt_no_update BEFORE UPDATE ON commitment_operation_receipts
BEGIN
  SELECT RAISE(ABORT, 'COMMITMENT_RECEIPT_IMMUTABLE');
END;

CREATE TRIGGER commitment_receipt_no_delete BEFORE DELETE ON commitment_operation_receipts
BEGIN
  SELECT RAISE(ABORT, 'COMMITMENT_RECEIPT_IMMUTABLE');
END;
