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

---
## Version 3 additional application acceptance cases — all NOT RUN until application built

| ID | Setup / stimulus | Required observable result | Current status |
|---|---|---|---|
| T-051 | attempt journal insert with amount unequal to approved draft | DB rejects, no committed posting | NOT RUN |
| T-052 | edit a confirmed draft economic field | immutable failure, original journal/balance unchanged | NOT RUN |
| T-053 | set event simulated flag unlike merchant's mode | DB rejects with no side effect | NOT RUN |
| T-054 | retry same sale client_operation_id and same canonical payload | same event ID, 200 replay, one event | NOT RUN |
| T-055 | same sale operation ID, different amount | 409 with no mutation | NOT RUN |
| T-056 | void a recorded sale | original remains, new void event, aggregate excludes voided record | NOT RUN |
| T-057 | merchant B attempts to void merchant A's observation | 404/no disclosure, no void | NOT RUN |
| T-058 | supply one sales observation | coverage `PARTIAL_UNVERIFIED`, never authoritative sales claim | NOT RUN |
| T-059 | customer has <3 distinct days of recorded visits | INSUFFICIENT_VISIT_HISTORY; no churn label | NOT RUN |
| T-060 | multiple visits on same day | deduplicate before median interval | NOT RUN |
| T-061 | Sarvam server adapter receives audio via client multipart field `audio` | vendor request uses `file`; secret only server side | NOT RUN |
| T-062 | synthetic fixture contains events after a requested as-of time | no future evidence reported as already observed | NOT RUN |
| T-063 | migration runner is invoked twice | returns already-applied, no second ALTER TABLE | NOT RUN |
| T-064 | ASR/TTS disconnected | text/manual path usable, no money dropped | NOT RUN |
| T-065 | response lost after committed confirm | UI resolves original key and does not double post | NOT RUN |
| T-066 | inspect deployed frontend/API egress under no-sender mode | no WhatsApp, SMS, Paytm payment or lending action | NOT RUN |
| T-067 | source sale/visit voided after snapshot generated | outdated fact hash invalidated and briefing rebuilt | NOT RUN |
| T-068 | actual HTTP response/parameter validation from implemented server | conforms to OpenAPI v0.3.0 proposal | NOT RUN |
| T-069 | run migration on nonempty historical V2 fixture | preserve auditable signed balances; stop on bad historic rows | NOT RUN |
| T-070 | review proposed presentation claims | unsourced 50M merchant/₹805 crore/growth statistics removed or properly evidenced | NOT RUN |

**Separate evidence categories:** `REFERENCE_PASS` only for runnable SQLite/domain oracle tests in the package; `APPLICATION_PASS` only when the real server/client is exercised; `PROVIDER_PASS` only on authenticated vendor probe; `FIELD_VALIDATED` only after a properly conducted consented merchant test. Never conflate them.
