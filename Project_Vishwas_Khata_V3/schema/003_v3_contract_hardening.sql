-- V3: ADDITIVE schema constraints, after 001 and 002. All examples synthetic.
-- Execute in a migration transaction or fail closed. Retain schema_migrations bookkeeping at app layer.
PRAGMA foreign_keys=ON;

-- Replay identity for merchant-entered observations. SQLite UNIQUE allows null for legacy seeded rows.
ALTER TABLE sales_events ADD COLUMN client_operation_id TEXT;
ALTER TABLE visit_events ADD COLUMN client_operation_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_op_id ON sales_events(merchant_id,client_operation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_op_id ON visit_events(merchant_id,client_operation_id);

-- Money and synthetic provenance MUST agree with the original draft + parent merchant.
CREATE TRIGGER IF NOT EXISTS trg_financial_post_matches_draft_v3 BEFORE INSERT ON ledger_entries
WHEN NEW.entry_type IN ('CREDIT_GIVEN','REPAYMENT_RECEIVED')
BEGIN
 SELECT CASE WHEN NOT EXISTS (
   SELECT 1 FROM ledger_drafts d JOIN merchants m ON m.id=d.merchant_id
   WHERE d.merchant_id=NEW.merchant_id AND d.id=NEW.draft_id AND d.customer_id=NEW.customer_id
     AND d.entry_type=NEW.entry_type AND d.amount_paise=ABS(NEW.amount_paise_signed)
     AND d.state='AWAITING_CONFIRMATION'
     AND (SELECT simulated FROM merchants WHERE id=NEW.merchant_id)=NEW.simulated
 ) THEN RAISE(ABORT,'POST_MISMATCHES_CONFIRMED_DRAFT') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_all_journal_rows_bounded_v3 BEFORE INSERT ON ledger_entries
BEGIN
 SELECT CASE WHEN NEW.amount_paise_signed NOT BETWEEN -100000000 AND 100000000
   THEN RAISE(ABORT,'MONEY_AMOUNT_OUT_OF_BOUND') END;
 SELECT CASE WHEN NEW.simulated != (SELECT simulated FROM merchants WHERE id=NEW.merchant_id)
   THEN RAISE(ABORT,'SIMULATED_PROVENANCE_MISMATCH') END;
END;

-- Changing signed posting metadata after confirmation invalidates the audit trail.
CREATE TRIGGER IF NOT EXISTS trg_confirmed_draft_immutable_v3 BEFORE UPDATE ON ledger_drafts
WHEN OLD.state='CONFIRMED'
BEGIN SELECT RAISE(ABORT,'CONFIRMED_DRAFT_IMMUTABLE'); END;

-- State transition to confirmed MUST have posted row already in same transaction;
-- reference order is (insert ledger entry → mark draft confirmed).
CREATE TRIGGER IF NOT EXISTS trg_confirmed_requires_post_v3 BEFORE UPDATE ON ledger_drafts
WHEN NEW.state='CONFIRMED' AND OLD.state!='CONFIRMED'
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM ledger_entries e
 WHERE e.merchant_id=NEW.merchant_id AND e.draft_id=NEW.id AND e.customer_id=NEW.customer_id
   AND e.entry_type=NEW.entry_type AND ABS(e.amount_paise_signed)=NEW.amount_paise)
 THEN RAISE(ABORT,'CONFIRM_REQUIRES_POST') END;
END;

-- No silent transformations between simulated/real source modes; source records append only.
CREATE TRIGGER IF NOT EXISTS trg_sales_insert_provenance_v3 BEFORE INSERT ON sales_events
BEGIN
 SELECT CASE WHEN NEW.simulated != (SELECT simulated FROM merchants WHERE id=NEW.merchant_id)
   THEN RAISE(ABORT,'SALE_PROVENANCE_MISMATCH') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_visits_insert_provenance_v3 BEFORE INSERT ON visit_events
BEGIN
 SELECT CASE WHEN NEW.simulated != (SELECT simulated FROM merchants WHERE id=NEW.merchant_id)
   THEN RAISE(ABORT,'VISIT_PROVENANCE_MISMATCH') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_sales_no_update_v3 BEFORE UPDATE ON sales_events
BEGIN SELECT RAISE(ABORT,'SALES_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_sales_no_delete_v3 BEFORE DELETE ON sales_events
BEGIN SELECT RAISE(ABORT,'SALES_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_visits_no_update_v3 BEFORE UPDATE ON visit_events
BEGIN SELECT RAISE(ABORT,'VISITS_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_visits_no_delete_v3 BEFORE DELETE ON visit_events
BEGIN SELECT RAISE(ABORT,'VISITS_APPEND_ONLY'); END;

CREATE TABLE IF NOT EXISTS observation_voids (
 id TEXT PRIMARY KEY,
 merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
 source_kind TEXT NOT NULL CHECK(source_kind IN ('SALE','VISIT')),
 source_id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 240),
 created_at TEXT NOT NULL,
 UNIQUE(merchant_id,source_kind,source_id)
);
CREATE INDEX IF NOT EXISTS idx_voids_by_merchant_kind ON observation_voids(merchant_id,source_kind,source_id);
CREATE TRIGGER IF NOT EXISTS trg_void_source_exists_v3 BEFORE INSERT ON observation_voids
BEGIN
 SELECT CASE WHEN
 (NEW.source_kind='SALE' AND NOT EXISTS(SELECT 1 FROM sales_events e WHERE e.merchant_id=NEW.merchant_id AND e.id=NEW.source_id))
 OR (NEW.source_kind='VISIT' AND NOT EXISTS(SELECT 1 FROM visit_events e WHERE e.merchant_id=NEW.merchant_id AND e.id=NEW.source_id))
 THEN RAISE(ABORT,'VOID_SOURCE_NOT_OWNED') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_voids_no_update_v3 BEFORE UPDATE ON observation_voids
BEGIN SELECT RAISE(ABORT,'VOID_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_voids_no_delete_v3 BEFORE DELETE ON observation_voids
BEGIN SELECT RAISE(ABORT,'VOID_APPEND_ONLY'); END;

-- Active draft identity cannot be reassigned; economic edits must increment optimistic version.
CREATE TRIGGER IF NOT EXISTS trg_draft_economic_edits_version_v3 BEFORE UPDATE ON ledger_drafts
WHEN NEW.merchant_id IS NOT OLD.merchant_id OR NEW.id IS NOT OLD.id
  OR NEW.customer_id IS NOT OLD.customer_id OR NEW.entry_type IS NOT OLD.entry_type
  OR NEW.amount_paise IS NOT OLD.amount_paise
BEGIN
 SELECT CASE WHEN NEW.merchant_id IS NOT OLD.merchant_id OR NEW.id IS NOT OLD.id
   THEN RAISE(ABORT,'DRAFT_IDENTITY_IMMUTABLE') END;
 SELECT CASE WHEN NEW.version != OLD.version + 1
   THEN RAISE(ABORT,'DRAFT_ECONOMIC_EDIT_MUST_INCREMENT_VERSION') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_terminal_draft_lock_v3 BEFORE UPDATE ON ledger_drafts
WHEN OLD.state IN ('CANCELLED','EXPIRED','REJECTED')
BEGIN SELECT RAISE(ABORT,'DRAFT_TERMINAL_STATE_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS trg_sale_amount_cap_v3 BEFORE INSERT ON sales_events
WHEN NEW.amount_paise > 100000000
BEGIN SELECT RAISE(ABORT,'OBSERVED_SALE_AMOUNT_OUT_OF_BOUND'); END;
