# V3 Test and Model Evidence Protocol

**Status:** Planned. The 80 cases in `verification/eval_cases_V3.csv` are `NOT_RUN`. Do not convert to green merely because a case exists on paper.

## Reproducible verification record

For each scenario record `{case_id, preconditions, fixture_hash, source_sha, test_command, environment, browser_or_device, actual_output, expected_output, provider_mode, model_version, prompt_version, locale, elapsed_ms, token_use, provider_cost, status, timestamp_utc, reviewer}`. Never place API keys, real PII, private voice clips, provider billing tokens or raw customer debt data into logs or the public ZIP.

## Mandatory invariant classes

1. Ledger sign, precision, bounded amount, underpayment, overpayment, reversal/compensation, tenant scoping, concurrency, stale draft version, idempotency and exact historical receipts.
2. Commitment strict ISO calendar days, event history trigger/FK, version/state locks, customer-level balance and no per-advance allocation, replay receipts and new credit stale protections.
3. AI output cannot write finance, message customers, invent rupee/date/sent state, leak tenant data, execute customer-supplied prompt injection or produce unverified “Paytm settlement.”
4. Provider unavailable/429/timeout/invalid JSON: typed ledger remains usable, zero unbounded retry or surprise charges.
5. Actual localized STT accuracy requires separately approved and funded **real** tests; typed fixtures cannot count.
6. Hosting requires **separate** PostgreSQL migrations, RLS, origin/cookie and actual deployed response evidence; no local-test-only promotion.

## Release quality bar (TARGET, NOT ACHIEVED)

- All deterministic financial/tenant/security negative tests pass, **zero** unauthorized financial writes.
- AI evidence correctness target >=95% on an explicitly pinned synthetic eval set, **zero** fabricated financial amounts in accepted final server responses.
- No `NOT_RUN` safety-critical case may be presented as passed.
- UX task completion N, observer details and median recorded; no fake p95 with tiny sample.
- Actual LLM and STT claims require new explicit operator approval for finite live provider calls; historical Sarvam probes do not authorize new spend.
- Publishing slides requires a manually reviewed claims register with evidence URL and reviewed actual build SHA.
