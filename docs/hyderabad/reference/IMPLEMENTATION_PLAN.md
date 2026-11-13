# Hyderabad implementation plan — gated vertical slices

**Owner:** project maintainer; reviewers TBD. **All new work NOT STARTED at document publication.**

1. **H0 — Baseline and eligibility (P0):** confirm registration/reuse rules, commit SHA, baseline CI, original media rights. No code change until finance snapshot reproducible.
2. **H1 — Commitments (P0):** review `contracts/008_hyd_commitments_PROPOSED.sql` and historical migrations. Implement new SQLite migration with actual FK/immutability/version guards, backend API with strict schema, current rows+events+receipts in one transaction. Test invalid dates, amounts, double-active, concurrent updates, cross-tenant access and replay. Do not backfill fake due dates.
3. **H2 — Evidence (P0):** deterministic due-list query for explicit dates and current journal sum. Implement scoped FactBundle with source IDs/hash/IST date. Test credit after commitment, partial/full repayment and absence of data.
4. **H3 — Safe assistant (P0):** inject mock model adapter, strict JSON schema validator and mismatch rejection first. Add one optional live provider only with explicit permission, fixed cost ceiling and synthetic evaluation. Keep deterministic fallback.
5. **H4 — Frontend vertical slice (P0):** reuse capture/review, create commitment editor, ask assistant, show evidence, display polite DRAFT_NOT_SENT. Test compiled browser, keyboard and phone viewport.
6. **H5 — Release/claims (P0):** rerun original finance/UI tests, new E2E, CI, integrity, secret/media scan; update claims register. Create Gamma deck from verified outputs, not from unbuilt diagrams.
7. **H6 — Conditional:** multilingual live ASR, small consented usability check, cost/latency benchmarking, hosted PostgreSQL/RLS/HTTPS parity. Don't let P1 jeopardize H0–H5.

**Stop rules:** invalid money, tenant leak, unreliable provider, unauthorized spending, stale/false due facts, no verified media rights or organizer disallowance all block corresponding claims or promotion.
