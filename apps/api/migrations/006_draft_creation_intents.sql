-- Optional client creation intent prevents duplicate unposted drafts after response loss.
CREATE TABLE draft_creation_intents (
 merchant_id TEXT NOT NULL REFERENCES merchants(id),
 operation_id TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 draft_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(merchant_id,operation_id),
 FOREIGN KEY(merchant_id,draft_id) REFERENCES ledger_drafts(merchant_id,id)
);
CREATE TRIGGER draft_intents_no_update BEFORE UPDATE ON draft_creation_intents BEGIN SELECT RAISE(ABORT,'DRAFT_INTENT_IMMUTABLE'); END;
CREATE TRIGGER draft_intents_no_delete BEFORE DELETE ON draft_creation_intents BEGIN SELECT RAISE(ABORT,'DRAFT_INTENT_IMMUTABLE'); END;
