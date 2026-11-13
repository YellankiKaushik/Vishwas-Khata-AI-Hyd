# V2 Implementation Acceptance Matrix — 50 scenarios

**Evidence state as of 2026-10-27:** All actual API/browser/provider/merchant tests are NOT RUN. The 16 standalone financial reference tests are separately executed and reported. They must not be substituted for deployed-application proof.

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


### Additional acceptance cases added in V2

| ID | Scenario | Expected outcome |
|---|---|---|
| T-028 | "five thousand, no five hundred" transcript | no silent resolution; merchant review |
| T-029 | PATCH with stale version | 409, draft unchanged |
| T-030 | repayment ₹600 when outstanding ₹500 | 422, no journal change |
| T-031 | reverse original credit after repayment already applied | blocked if balance would go negative; original unchanged |
| T-032 | sales event absent but credit exists | `INSUFFICIENT_DATA` for sales; ledger unaffected |
| T-033 | suggestion dismissed | no phone/SMS/WhatsApp/network request |
| T-034 | seed reset attempted with DEMO_MODE=false | refuses, no DB destruction |
| T-035 | DB write lock exceeds deadline | 503, no premature success; stable retry |
| T-036 | response lost after committed confirm | retry same key returns original ID |
| T-037 | 2026-10-26T19:00Z sales fact | counts for Oct 27 in IST |
| T-038 | provider key absent | manual path remains usable |
| T-039 | SQL attempts UPDATE/DELETE journal | immutable trigger rejects both |
| T-040 | reverse target wrong customer or merchant | rejects with no mutation |
| T-041 | 10,000-char fake speech request | size/length guard before provider charge |
| T-042 | LLM fictional ₹40,000 profit claim | invalid narrative, template returned |
| T-043 | nonexistent merchant ID passed via API | no tenant override accepted |
| T-044 | wrong locale TTS after provider change | disable, text survives |
| T-045 | sale near UTC midnight | business-day grouping correct |
| T-046 | duplicate display names Ramesh (different IDs) | explicit selection required |
| T-047 | audio fixture manually labeled as live | response provenance policy rejects mislabeled mode |
| T-048 | commercial claim asserted without pilot data | PPT evidence checklist fails |
| T-049 | new migration against populated old fixture | migrate and validate constraints |
| T-050 | baseline synthetic cost calculation | formula output matches input units; no invented current rate |


**Procedure:** maintain status PASS/FAIL/NOT RUN per case, associate Git SHA, fixture hash, language/provider version, test command, environment and redacted evidence URL. Reference SQL tests have a different evidence category from actual app tests.
