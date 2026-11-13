-- Application hardening supplements V3 without weakening or editing its triggers.
CREATE TRIGGER draft_source_immutable BEFORE UPDATE ON ledger_drafts
WHEN NEW.source IS NOT OLD.source
BEGIN SELECT RAISE(ABORT,'DRAFT_SOURCE_IMMUTABLE'); END;
CREATE TRIGGER entry_source_matches_draft BEFORE INSERT ON ledger_entries
WHEN NEW.draft_id IS NOT NULL
BEGIN
 SELECT CASE WHEN NEW.source != (SELECT source FROM ledger_drafts WHERE merchant_id=NEW.merchant_id AND id=NEW.draft_id)
 THEN RAISE(ABORT,'POST_SOURCE_MISMATCH') END;
END;
CREATE TRIGGER ledger_integer_only BEFORE INSERT ON ledger_entries
WHEN typeof(NEW.amount_paise_signed)!='integer'
BEGIN SELECT RAISE(ABORT,'INTEGER_PAISE_REQUIRED'); END;
CREATE TRIGGER sale_integer_only BEFORE INSERT ON sales_events
WHEN typeof(NEW.amount_paise)!='integer'
BEGIN SELECT RAISE(ABORT,'INTEGER_PAISE_REQUIRED'); END;
CREATE TRIGGER draft_integer_insert BEFORE INSERT ON ledger_drafts
WHEN NEW.amount_paise IS NOT NULL AND (typeof(NEW.amount_paise)!='integer' OR NEW.amount_paise>100000000)
BEGIN SELECT RAISE(ABORT,'BOUNDED_INTEGER_PAISE_REQUIRED'); END;
CREATE TRIGGER draft_integer_update BEFORE UPDATE ON ledger_drafts
WHEN NEW.amount_paise IS NOT NULL AND (typeof(NEW.amount_paise)!='integer' OR NEW.amount_paise>100000000)
BEGIN SELECT RAISE(ABORT,'BOUNDED_INTEGER_PAISE_REQUIRED'); END;
