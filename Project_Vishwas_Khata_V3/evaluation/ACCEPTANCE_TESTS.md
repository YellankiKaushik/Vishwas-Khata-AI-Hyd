# Vishwas Khata — Acceptance and Regression Test Specification

> Proposed acceptance suite. **No test is claimed to have run.** Every case MUST be recorded as PASS/FAIL/NOT RUN with commit hash, environment and evidence link before public "built" claims.

## Test environment

Local SQLite from `../schema/001_initial.sql`; seed `../fixtures/demo_dataset.json`; `DEMO_MODE=true` on localhost; fake AI adapters for deterministic tests; Sarvam live smoke tests only with explicitly synthetic voice. Reference date = 2026-10-27 in `Asia/Kolkata` for fixture-exact assertions. Ensure non-debug tests do not rely on current system date.

## Critical test cases

| ID | Setup/stimulus | Assertion | Status |
|---|---|---|---|
| T-001 | Clean seed and `GET /merchants/me` | Correct merchant, `simulated:true`; no other merchant data | NOT RUN |
| T-002 | Upload > allowed size or unsupported MIME | HTTP 413/422; no vendor call; no draft | NOT RUN |
| T-003 | Simulate model timeout/429/503 | Typed input usable; no ledger change; error trace redacted | NOT RUN |
| T-004 | `utt_001` from fixture | Intent CREDIT_GIVEN, 50000 paise, `cus_ramesh`; journal still empty | NOT RUN |
| T-005 | Seed two customers with same display name | Customer picker, no auto-assign | NOT RUN |
| T-006 | Confirm twice same idempotency key | Stable entry ID; exactly 1 journal row | NOT RUN |
| T-007 | Cancel and expire unposted drafts | No journal delta; stale confirm 409 | NOT RUN |
| T-008 | Post 50000 credit, 20000 repayment | Balance = 30000 paise exactly | NOT RUN |
| T-009 | Sum signed journal independently | UI balance and SQL SUM match | NOT RUN |
| T-010 | No sales events, but one posted credit | Cash sales `null/INSUFFICIENT_DATA` not ₹500 | NOT RUN |
| T-011 | Priya visits Oct 7/11/15, reference Oct 27 | Median interval 4d, absence 12d, threshold 8d; source IDs | NOT RUN |
| T-012 | Generate daily briefing | Four ordered slots; all monetary quantities provable from facts | NOT RUN |
| T-013 | Force TTS failure | Text remains; no updated money | NOT RUN |
| T-014 | Open suggestion | No outbound SMS/WhatsApp/webhook call | NOT RUN |
| T-015 | Seed reset and repeat | Deterministic fixtures, no real-store destruction | NOT RUN |
| T-016 | Attempt to enable real-data mode without required privacy/auth controls | Startup/request refuses to operate | NOT RUN |
| T-017 | `utt_006` injection and malicious HTML | No write, no execution, no secret disclosure | NOT RUN |
| T-018 | AI output invents 40% profit growth | Rewrite rejected, template shown | NOT RUN |
| T-019 | AI invents loan eligibility | Rewrite rejected and flag; no loan approval claims | NOT RUN |
| T-020 | Customer with fewer than 3 visits | No inactive label; insufficient-data state | NOT RUN |
| T-021 | Concurrent 10 confirm requests to same draft | Precisely 1 entry; correct state/idempotency behavior | NOT RUN |
| T-022 | New tenant tries GET/POST using first tenant's IDs | 403/404; no leak of original record | NOT RUN |
| T-023 | Inspect shipped JS bundle + Git tree | No actual provider key or secret data | NOT RUN |
| T-024 | Exceed per-merchant upload quota | 429 before external vendor call | NOT RUN |
| T-025 | Transcript is `<script>alert(1)</script>` | Renders as inert text; no code execution | NOT RUN |
| T-026 | Reverse 50000 credit | 2 entries (+50000,−50000) => balance zero, original unchanged | NOT RUN |
| T-027 | Request hi-IN or te-IN narrative | Correct language (not English hidden as local); amounts preserved | NOT RUN |

## Required qualitative evaluation log

For each audio sample: `clip_id`, locale, speaker/test condition, reference transcript, ASR transcript, expected type/customer/paise, actual extraction, human edit, success/failure, latency, vendor model, price usage and `fixture/live` mode. Keep real identities out of the study unless separately consented and governed.

## Release gate script (future)

1. Build backend/frontend from clean install.
2. Apply schema, reset synthetic seed, run FK integrity + `SELECT SUM` reconcile.
3. Run unit tests and property tests with no external AI calls.
4. Run API contract and AuthZ negative tests including concurrency.
5. Run two E2E demos from reset state, capture screen and logs with no PII.
6. Run selected actual vendor probe in at least primary language, record real performance and fallback.
7. Mark test statuses and attach real artifacts. If untested, leave status NOT RUN.

**Acceptance principle:** a pretty demo that gets an amount wrong or invents a sales figure is a failure even when all APIs return HTTP 200.
