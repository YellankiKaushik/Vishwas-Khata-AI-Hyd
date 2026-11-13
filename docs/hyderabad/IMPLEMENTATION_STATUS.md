# Hyderabad implementation status

| Area | Implementation | Evidence |
| --- | --- | --- |
| Commitment operations | Create, page, get, edit, cancel, handle and immutable events. Stable original receipts use `Client-Operation-Id` inside the same transaction as change and audit. | API and migration tests |
| Due facts | Signed journal balances, an explicit IST date, commitment event and version, recorded-data coverage and a freshness hash. Positive additions after the last review require review. | Golden journey, date boundaries, reversal, duplicate-name and tenant tests |
| Grounded assistant | English deterministic questions, server-rendered figures and dates, constrained mock and gated model proposals. | ASGI tests and fake provider transport |
| Follow-up drafts | Stateless `DRAFT_NOT_SENT` preview with current facts hash, exact version and explicit review. | Stale draft, no-send and zero-balance tests |
| Merchant Assistant | React review forms, due list, questions, evidence, immutable history and freshness check before clipboard copy. | TypeScript and production build. Real browser run pending. |
| Demo | Isolated database, pinned synthetic 13 November 2026 IST, typed workflow, model disabled. | Isolated seed and compiled build. Browser run pending. |

The running API publishes all 11 Hyderabad operation IDs in `/openapi.json`. The proposed contracts under `reference/` are design snapshots. Runtime responses carry additional review and evidence fields so the UI can revalidate facts before edit and copy. They include the UTC as-of time, source counts and hashes, customer label, pagination information and assistant mode. Errors retain the existing `error.request_id` envelope. The edit accepts the design's explicit `review_latest_ledger: true` and an optional `reviewed_ledger_hash`. If the journal moved since the prior review, the client must submit the current hash. Create also accepts a current balance review hash, which the React form obtains from the balance API.

Commitment and question limits are local per-process controls. Exact commitment retries are checked before charging the mutation limit. Optional model calls have a separate persistent, finite operator approval; repeating an approved request ID returns current deterministic facts without another vendor call.

The compiled UI comes from the existing React workspace, and the only financial writes remain the existing reviewed journal confirmation and compensating reversal handlers.
