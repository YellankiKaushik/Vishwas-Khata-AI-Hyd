-- Original confirmation responses are immutable, including balance at posting.
-- Legacy journal/idempotency rows are preserved; no original response is fabricated.
CREATE TABLE confirmation_receipts (
 merchant_id TEXT NOT NULL,
 entry_id TEXT NOT NULL,
 response_json TEXT NOT NULL CHECK(json_valid(response_json)),
 PRIMARY KEY(merchant_id,entry_id),
 FOREIGN KEY(merchant_id,entry_id) REFERENCES ledger_entries(merchant_id,id)
);
CREATE TRIGGER receipt_no_update BEFORE UPDATE ON confirmation_receipts
BEGIN SELECT RAISE(ABORT,'RECEIPT_IMMUTABLE'); END;
CREATE TRIGGER receipt_no_delete BEFORE DELETE ON confirmation_receipts
BEGIN SELECT RAISE(ABORT,'RECEIPT_IMMUTABLE'); END;
