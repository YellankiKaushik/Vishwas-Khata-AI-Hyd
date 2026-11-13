-- V2 additive migration. Must be run AFTER 001_initial.sql.
-- Reference contract for SQLite; must be ported and tested independently for PostgreSQL.
-- Assumes PRAGMA foreign_keys=ON per connection and application BEGIN IMMEDIATE.

CREATE TRIGGER IF NOT EXISTS trg_ledger_entries_no_update
BEFORE UPDATE ON ledger_entries
BEGIN
 SELECT RAISE(ABORT, 'IMMUTABLE_LEDGER_UPDATE');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_entries_no_delete
BEFORE DELETE ON ledger_entries
BEGIN
 SELECT RAISE(ABORT, 'IMMUTABLE_LEDGER_DELETE');
END;

-- Reversal requires an existing original belonging to same tenant/customer.
-- A reversal's amount must exactly negate the original posting.
-- Reverse-of-reversal is not part of this MVP and is forbidden.
CREATE TRIGGER IF NOT EXISTS trg_reversal_identity_before_insert
BEFORE INSERT ON ledger_entries
WHEN NEW.entry_type = 'REVERSAL'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM ledger_entries original
    WHERE original.merchant_id = NEW.merchant_id
      AND original.id = NEW.reverses_entry_id
      AND original.customer_id = NEW.customer_id
      AND original.entry_type IN ('CREDIT_GIVEN','REPAYMENT_RECEIVED')
      AND NEW.amount_paise_signed = -original.amount_paise_signed
  ) THEN RAISE(ABORT, 'INVALID_REVERSAL_IDENTITY_OR_SIGN') END;
END;

-- Merchant cannot have negative receivable balance in P0 account semantics.
-- Credit +500 and repay -600 is rejected; reversing +500 after repaying -200
-- is rejected until repayment has been compensated through a reviewed flow.
CREATE TRIGGER IF NOT EXISTS trg_nonnegative_receivable_before_insert
BEFORE INSERT ON ledger_entries
WHEN NEW.entry_type IN ('REPAYMENT_RECEIVED','REVERSAL')
BEGIN
 SELECT CASE WHEN (
   COALESCE((SELECT SUM(p.amount_paise_signed)
     FROM ledger_entries p
     WHERE p.merchant_id = NEW.merchant_id AND p.customer_id = NEW.customer_id),0)
   + NEW.amount_paise_signed
 ) < 0 THEN RAISE(ABORT, 'NEGATIVE_RECEIVABLE_FORBIDDEN') END;
END;

-- Avoid duplicate suggestion from same reason code at same event set in future.
-- No materialized insight table is created in this small MVP.

CREATE INDEX IF NOT EXISTS idx_entries_reversal_reference
ON ledger_entries(merchant_id, reverses_entry_id);

CREATE INDEX IF NOT EXISTS idx_sales_merchant_source_time
ON sales_events(merchant_id, source, observed_at);

CREATE INDEX IF NOT EXISTS idx_visits_merchant_source_time
ON visit_events(merchant_id, source, observed_at);
