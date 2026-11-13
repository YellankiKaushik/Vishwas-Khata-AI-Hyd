# Repayment and follow-up semantics — canonical V3 implementation contract

**Non-negotiable:** the signed append-only journal is the only authoritative receivable record. Commitment metadata and suggestions never represent a payment confirmation. Customer-level outstanding = the signed sum of the customer's active journal entries; every normal repayment must leave balance >= 0, and a reversal must be compensating/authorized.

## Controlled synthetic story

1. Post credit given ₹500. Ledger balance = 50,000 paise (positive receivable).
2. Post repayment received ₹200. Ledger balance = 30,000 paise (still owed according to records).
3. Merchant optionally records expected date 2026-11-13, optional promised amount ₹300, version 1, subject to outstanding and customer authorization checks.
4. On date 2026-11-13 IST, due list may flag `DUE_TODAY` with factual evidence IDs and coverage `RECORDED_LEDGER_AND_COMMITMENTS_ONLY`.
5. Merchant can draft a POLITE follow-up: **draft is not sent**. `sent=false`, no implied WhatsApp delivery, no bank settlement.
6. Another ₹100 repayment makes balance = 20,000 paise; the old message fact hash is stale and requires a fresh render. `promised_amount_paise=30000` remains a historical merchant statement, **not** automatically 20000 or 10000.
7. A new ₹500 credit after that old commitment makes current balance ₹700. The old promise MUST NOT be automatically applied to newly added debt: `REVIEW_REQUIRED` until explicit merchant review.
8. A manual `HANDLED` action closes the follow-up expectation; it is NOT money received and does not change ₹700 receivable. A new explicit repayment changes the journal and is the only allowed route to reduce the recorded balance.

## Ambiguity and safety rules

- If a merchant says “he paid me,” require exact customer, rupee amount, transaction type and explicit review before ledger post.
- Ambiguous customer names are always resolved by explicit customer ID; names can duplicate.
- Do not say “overdue by law,” “defaulted,” “loan,” “verified settlement,” or “you will recover” from only a merchant-entered expected date.
- `HANDLED` means administrative attention closed, not proof of successful contact or cleared balance.
- Commitment creation and edits are allowed only when current outstanding > 0, and optional promised amount <= reviewed outstanding; if balance changes later, rerender and re-review without silent allocation.
- Date math uses timezone-aware UTC clock → `Asia/Kolkata` business date; expected_date must be a valid YYYY-MM-DD Gregorian calendar day, not a mere shaped string.
- Positive credit/reversal after last merchant review invalidates any due-state assumption; any ledger change invalidates a preexisting draft hash.
- All current commitment updates create append-only events, with immutable receipts plus auditing in same SQLite transaction.
- No unsolicited customer contact in this release. Generated text is copied/used by merchant only outside app, and app must not claim delivery.
