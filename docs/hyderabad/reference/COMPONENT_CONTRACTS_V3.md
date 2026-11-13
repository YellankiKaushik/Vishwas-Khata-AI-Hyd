# V3 Significant Component Contracts — Complete 37-Question Register

**Status:** technical-design inventory; a description of a proposed module is not runtime evidence. Reviewed source SHA `376a076afff2a3fc61f7a0183338a3a2e40057d3`.

Each card answers the exact 37 questions at the end of the user-supplied technical documentation prompt. Component answers identify missing operations and measurements instead of inventing them.

## CMP-FIN-001 — pre-Hyderabad finance domain
**Implementation status:** BASELINE-REVIEWED from repository/CI only. **Exact current/proposed paths:** `apps/api/main.py, domain.py, db.py, models.py, schema migrations 001–007`.

| # | Original mandatory question | Answer and evidence boundary |
|---:|---|---|
| 01 | What is it? | pre-Hyderabad finance domain |
| 02 | Why does it exist? | Preserve exact merchant-authorized credit/repayment accounting. |
| 03 | Who owns it? | Project backend/domain maintainer |
| 04 | What is its responsibility? | Validate merchant-scoped reviewed drafts and atomically post immutable journal entries/receipts. |
| 05 | What is explicitly outside its responsibility? | LLM interpretation truth, vendor settlement, sending messages, customer consent or credit scoring. |
| 06 | What are its inputs? | Validated customer ID, draft/version, positive integer paise, strict confirm=true and idempotency key. |
| 07 | What are its outputs? | Signed entry, authoritative balance, original response receipt, audit. |
| 08 | What systems depend on it? | Capture frontend and deterministic facts/assistant (read-only). |
| 09 | What does it depend on? | Server synthetic merchant session, SQLite FK/WAL, UTC clock and client operation IDs. |
| 10 | What data does it own? | ledger_drafts, ledger_entries, confirmation_receipts, idempotency_records and audit_events. |
| 11 | What interfaces does it expose? | /v1/ledger/drafts*, /v1/ledger/entries*; actual runtime OpenAPI is authority. |
| 12 | How does it behave at runtime? | Validate merchant-scoped reviewed drafts and atomically post immutable journal entries/receipts. |
| 13 | How is it configured? | DATABASE_PATH, DEMO_MODE, VISHWAS_AS_OF; existing config only. |
| 14 | How is it secured? | Server session merchant; no model or client-supplied tenant authority. |
| 15 | What permissions does it require? | Server session merchant; no model or client-supplied tenant authority. |
| 16 | How is sensitive data handled? | Synthetic customer and finance data; no actual merchant information permitted. |
| 17 | How does it handle concurrency? | SQLite BEGIN IMMEDIATE serialization, exact draft version and DB guard triggers. |
| 18 | How does it handle duplicate operations? | Stored original financial response receipt replays on matching idempotency payload; new key for new operation. |
| 19 | What happens when dependencies fail? | Database failure blocks confirmation; no speculative UI success. |
| 20 | What happens when it crashes? | SQLite transaction rolls back incomplete post; after commit a retried key returns original receipt. |
| 21 | What are its timeout policies? | SQLite busy_timeout is 2000ms in db.py; HTTP deadline operator/launcher-specific. |
| 22 | What are its retry policies? | Only stable idempotent client retry; never a second independent posting. |
| 23 | How is it monitored? | Existing audit and health endpoints, no operational telemetry pipeline asserted. |
| 24 | What metrics prove it is healthy? | Signed sum/invariants, duplicate-suppression tests, error counts; actual P95 unmeasured. |
| 25 | What alerts exist? | Any wrong balance, double post or immutability failure blocks the demo; RB-001. |
| 26 | What are its performance targets? | No measured production SLO; local correctness more important than speed. |
| 27 | What is its maximum tested capacity? | Up to 50 synthetic customer labels documented; no observed throughput benchmark. |
| 28 | How does it scale? | Single local process/SQLite writer; hosted has different native PG path. |
| 29 | How is it tested? | Previously documented backend/Edge/CI; rerun on Hyderabad branch before updated claims. |
| 30 | How is it deployed? | Original local PowerShell launcher; hosted separate, not automatically same service. |
| 31 | How is it rolled back? | Restore application build only with schema compatibility; never alter immutable journal. |
| 32 | How is its data recovered? | Stopped-db consistent backup then integrity/FK/checksum verification; no executed V3 DR drill. |
| 33 | What operational runbook covers it? | RB-001 |
| 34 | What known limitations exist? | Local demo session not production identity; synthetic only; no Paytm payments. |
| 35 | What technical debt exists? | Independent production auth, restore drill, deployment reliability, transaction capacity. |
| 36 | What architectural decisions created it? | Original V3 financial ADRs and Appendix R, not new HYD AI choices. |
| 37 | What open questions remain? | Independent original-regression rerun and deployment/hardware support. |

**P0 release policy:** Local demo session not production identity; synthetic only; no Paytm payments. The status above changes only after source, tests and dated evidence are recorded.

## CMP-OBS-002 — Recorded observations and analytics
**Implementation status:** BASELINE-REVIEWED from repository/CI only. **Exact current/proposed paths:** `apps/api/analytics.py; sales_events, visit_events, suggestions, briefing_snapshots`.

| # | Original mandatory question | Answer and evidence boundary |
|---:|---|---|
| 01 | What is it? | Recorded observations and analytics |
| 02 | Why does it exist? | Explain journal and observation facts without fabricating missing activity. |
| 03 | Who owns it? | Analytics/backend maintainer |
| 04 | What is its responsibility? | Derive IST-window deterministic recorded facts, evidence IDs/coverage and four briefing slots. |
| 05 | What is explicitly outside its responsibility? | Complete business revenue, verified churn, actual loan risk or reliable hourly forecast without data. |
| 06 | What are its inputs? | Merchant/session, business date, recorded journal/sales/visits and explicit observation source. |
| 07 | What are its outputs? | Daily facts, readiness, briefings, source IDs and hashes, insufficient-data flags. |
| 08 | What systems depend on it? | Existing dashboard, new proposed evidence broker. |
| 09 | What does it depend on? | SQLite immutable journal/observations, timezone-aware IST functions. |
| 10 | What data does it own? | sales_events, visit_events, observation_voids, suggestions, briefing snapshots. |
| 11 | What interfaces does it expose? | /v1/insights/daily, /v1/briefings/daily, /v1/suggestions and observations routes. |
| 12 | How does it behave at runtime? | Derive IST-window deterministic recorded facts, evidence IDs/coverage and four briefing slots. |
| 13 | How is it configured? | VISHWAS_AS_OF for fictional deterministic clock; no remote model requirement. |
| 14 | How is it secured? | Session-inferred merchant only; no cross-tenant observations. |
| 15 | What permissions does it require? | Session-inferred merchant only; no cross-tenant observations. |
| 16 | How is sensitive data handled? | All test events are synthetic; never send raw notes to unapproved provider. |
| 17 | How does it handle concurrency? | Read one committed snapshot; observation writes are separate audited actions. |
| 18 | How does it handle duplicate operations? | Observation client_operation_id and immutable source/void semantics per existing schema. |
| 19 | What happens when dependencies fail? | Unknown or partial source data yields INSUFFICIENT_DATA, not invented metric. |
| 20 | What happens when it crashes? | Recompute facts from journal on restart; no financial source state in cache. |
| 21 | What are its timeout policies? | Local DB query bounds; exact measured latency TBD. |
| 22 | What are its retry policies? | Read-only requests can be retried; observation write IDs stable. |
| 23 | How is it monitored? | Existing fact IDs/source hashes and test logs; no production metrics system. |
| 24 | What metrics prove it is healthy? | Coverage flags, source counts and provenance quality. |
| 25 | What alerts exist? | Unsupported total-sales/churn claim blocks pitch; RB-002. |
| 26 | What are its performance targets? | P95 deterministic projection target proposed, not measured. |
| 27 | What is its maximum tested capacity? | Bounded local 50-customer demo and available synthetic events. |
| 28 | How does it scale? | Query refinement and indexed read; no warehouse/stream processor. |
| 29 | How is it tested? | Historic analytics/briefing tests, new freshness and coverage tests planned. |
| 30 | How is it deployed? | Local FastAPI code; hosted separate analytics projection implementation. |
| 31 | How is it rolled back? | Disable new due UI; preserve original analytics functions. |
| 32 | How is its data recovered? | Rebuild derived facts from consistent stored events. |
| 33 | What operational runbook covers it? | RB-002 |
| 34 | What known limitations exist? | Manually recorded sales/visits incomplete. |
| 35 | What technical debt exists? | Data coverage measurement and merchant research. |
| 36 | What architectural decisions created it? | Existing source-linked facts design plus Hyderabad evidence broker proposal. |
| 37 | What open questions remain? | Whether original visit-gap suggestions remain front-and-center in Hyderabad. |

**P0 release policy:** Manually recorded sales/visits incomplete. The status above changes only after source, tests and dated evidence are recorded.

## CMP-VOICE-003 — Voice and Sarvam adapter
**Implementation status:** BASELINE-LIMITED. **Exact current/proposed paths:** `apps/api/voice.py, config.py; apps/web/src/VoiceCapture.tsx, audio.ts`.

| # | Original mandatory question | Answer and evidence boundary |
|---:|---|---|
| 01 | What is it? | Voice and Sarvam adapter |
| 02 | Why does it exist? | Offer optional spoken input while never allowing uncertain audio to write money. |
| 03 | Who owns it? | Voice/frontend and provider operator |
| 04 | What is its responsibility? | Browser permission/capture/PCM WAV validation and separately consented STT/TTS adapter. |
| 05 | What is explicitly outside its responsibility? | Financial confirmation, general multilingual accuracy, autonomous posting. |
| 06 | What are its inputs? | Approved local microphone WAV, chosen language, explicit transcription action. |
| 07 | What are its outputs? | Untrusted editable transcript or status/error; optional approved TTS. |
| 08 | What systems depend on it? | Existing capture workflow and future assistant UI. |
| 09 | What does it depend on? | Browser device permissions, localhost API, optional Sarvam key/service. |
| 10 | What data does it own? | Transient WAV and transcription; no durable finance authority. |
| 11 | What interfaces does it expose? | /v1/voice/status, /v1/voice/validations, /v1/voice/transcriptions, /v1/briefings/speech. |
| 12 | How does it behave at runtime? | Browser permission/capture/PCM WAV validation and separately consented STT/TTS adapter. |
| 13 | How is it configured? | VOICE_PROVIDER, SARVAM_LIVE_VERIFIED, SARVAM_TTS_VERIFIED, locale lists, SARVAM_API_KEY. |
| 14 | How is it secured? | Server provider key; explicit capture/transcription permission. |
| 15 | What permissions does it require? | Server provider key; explicit capture/transcription permission. |
| 16 | How is sensitive data handled? | Audio transient unless downloaded, consent to provider transfer separate. |
| 17 | How does it handle concurrency? | Capture lifecycle/abort and quota; recording state isolated to current session. |
| 18 | How does it handle duplicate operations? | Paid requests should never auto-retry; explicit new operator authorization required. |
| 19 | What happens when dependencies fail? | Typed entry works when mic/provider unavailable. |
| 20 | What happens when it crashes? | No durable audio or money side effect; discard volatile buffers. |
| 21 | What are its timeout policies? | Bounded existing adapter requests/circuit; inspect exact defaults from voice.py before runbook values. |
| 22 | What are its retry policies? | No automatic billed retry; user can choose typed fallback. |
| 23 | How is it monitored? | Redacted request status/latency without raw WAV. |
| 24 | What metrics prove it is healthy? | Two English historical sample latencies; not general accuracy. |
| 25 | What alerts exist? | Any silent upload or amount auto-confirm is release blocker; RB-003/004. |
| 26 | What are its performance targets? | No general ASR P95 measured; target per-locale test plan. |
| 27 | What is its maximum tested capacity? | Process-local quotas and ≤20-sec WAV validation documented. |
| 28 | How does it scale? | No multi-instance quota guarantees. |
| 29 | How is it tested? | Browser virtual mic tests, two authorized English STT samples and one TTS result historically. |
| 30 | How is it deployed? | Optional local provider mode; hosted provider endpoints disabled. |
| 31 | How is it rolled back? | Turn off speech verification flags; preserve typed UI. |
| 32 | How is its data recovered? | Restart capture; raw audio not persisted. |
| 33 | What operational runbook covers it? | RB-003 / RB-004 |
| 34 | What known limitations exist? | Hindi/Telugu/mixed live ASR not verified; physical device witness pending. |
| 35 | What technical debt exists? | Actual native device and regional speech evaluation. |
| 36 | What architectural decisions created it? | Existing explicit upload/consent and merchant review boundary. |
| 37 | What open questions remain? | New finite provider approval and actual verified language list. |

**P0 release policy:** Hindi/Telugu/mixed live ASR not verified; physical device witness pending. The status above changes only after source, tests and dated evidence are recorded.

## CMP-COM-004 — Repayment commitment service
**Implementation status:** H-PROPOSED; NO CODE. **Exact current/proposed paths:** `PROPOSED apps/api/commitments.py; design-only SQLite migration 008 V3`.

| # | Original mandatory question | Answer and evidence boundary |
|---:|---|---|
| 01 | What is it? | Repayment commitment service |
| 02 | Why does it exist? | Remember merchant-entered customer-account expected dates without altering money. |
| 03 | Who owns it? | Backend/domain maintainer (reviewer TBD) |
| 04 | What is its responsibility? | Create/edit/cancel/handle one active customer expectation per merchant/customer, audit revisions. |
| 05 | What is explicitly outside its responsibility? | Assign a repayment to individual advances, pay debts, change journal, initiate collection. |
| 06 | What are its inputs? | Owned customer, valid IST calendar date, optional paise expectation, current version, reason, operator ID. |
| 07 | What are its outputs? | Current snapshot, generated immutable event, stored original operation receipt and derived review state. |
| 08 | What systems depend on it? | React commitment editor; evidence broker/due projection. |
| 09 | What does it depend on? | Authenticated demo session, SQLite transaction manager, signed journal balance, latest ledger hash. |
| 10 | What data does it own? | PROPOSED repayment_commitments, commitment_events and commitment_operation_receipts. |
| 11 | What interfaces does it expose? | PROPOSED /v1/commitments POST/GET/PATCH/cancel/handle/events. |
| 12 | How does it behave at runtime? | Create/edit/cancel/handle one active customer expectation per merchant/customer, audit revisions. |
| 13 | How is it configured? | PROPOSED HYD_COMMITMENTS_ENABLED OFF pending actual schema/test. |
| 14 | How is it secured? | Only trusted session merchant; model has none. |
| 15 | What permissions does it require? | Only trusted session merchant; model has none. |
| 16 | How is sensitive data handled? | Fictional customer expectation only; notes bounded and not sent to model by default. |
| 17 | How does it handle concurrency? | BEGIN IMMEDIATE + version CAS/unique active index + trigger-authored history. |
| 18 | How does it handle duplicate operations? | Stable Client-Operation-Id/request digest; replay original receipt before current version check. |
| 19 | What happens when dependencies fail? | Missing DB or invalid balance -> rollback, safe 4xx/503. |
| 20 | What happens when it crashes? | Transaction atomically rolls back row/event/receipt/audit; no partial promise. |
| 21 | What are its timeout policies? | Short SQLite lock, no provider call inside transaction; exact P95 unmeasured. |
| 22 | What are its retry policies? | Only byte-equivalent operation replay; conflicts are not auto-retried. |
| 23 | How is it monitored? | Proposed mutation totals, event mismatch zero-required test and redacted audit. |
| 24 | What metrics prove it is healthy? | One event/version, correct balance, zero unmatched receipts. |
| 25 | What alerts exist? | Silent update, tenant leak or malformed event = critical stop, RB-001/002. |
| 26 | What are its performance targets? | Proposed local P95 ≤500ms on 50-customer fixture, not measured. |
| 27 | What is its maximum tested capacity? | One active per customer, ≤50 synthetic accounts in P0. |
| 28 | How does it scale? | Local serialized writes; native PG separate future parity. |
| 29 | How is it tested? | Design SQL isolated smoke only; full 001..007 migration and API tests NOT RUN. |
| 30 | How is it deployed? | Local backend feature OFF until 008 code reviewed and applied; hosted later. |
| 31 | How is it rolled back? | Disable routes; do not delete commitment history or original ledger. |
| 32 | How is its data recovered? | Restore stopped-db synthetic backup and verify event/version/receipt counts. |
| 33 | What operational runbook covers it? | RB-001 / RB-002 |
| 34 | What known limitations exist? | Customer-level promise not legally enforceable or allocated debt. |
| 35 | What technical debt exists? | Application-level balance and valid-date validation; hosted parity. |
| 36 | What architectural decisions created it? | HYD-ADR-009 and HYD-ADR-011 proposed. |
| 37 | What open questions remain? | Whether promise amount optional field is in hackathon P0 and operator sign-off. |

**P0 release policy:** Customer-level promise not legally enforceable or allocated debt. The status above changes only after source, tests and dated evidence are recorded.

## CMP-EVID-005 — Merchant-scoped evidence broker
**Implementation status:** H-PROPOSED; NO CODE. **Exact current/proposed paths:** `PROPOSED apps/api/evidence.py read-only projections`.

| # | Original mandatory question | Answer and evidence boundary |
|---:|---|---|
| 01 | What is it? | Merchant-scoped evidence broker |
| 02 | Why does it exist? | Answer merchant questions only using exact recorded source facts. |
| 03 | Who owns it? | Backend/analytics maintainer |
| 04 | What is its responsibility? | Canonical FactBundle with ledger sum, explicit commitment, IST date, source IDs/hash, coverage. |
| 05 | What is explicitly outside its responsibility? | Infer payment settlement, arbitrary SQL, create/edit money, send messages. |
| 06 | What are its inputs? | Trusted server merchant, bounded approved intent/customer filter, single request clock. |
| 07 | What are its outputs? | Structured immutable-in-response facts with exact source hash and staleness flags. |
| 08 | What systems depend on it? | Assistant controller, due list and follow-up composer. |
| 09 | What does it depend on? | Existing signed journal read projection, new commitment tables and SQLite snapshot. |
| 10 | What data does it own? | Ephemeral JSON facts, not a second persistent finance ledger. |
| 11 | What interfaces does it expose? | Internal broker method and PROPOSED GET /v1/followups/due. |
| 12 | How does it behave at runtime? | Canonical FactBundle with ledger sum, explicit commitment, IST date, source IDs/hash, coverage. |
| 13 | How is it configured? | P0 max 50 facts; exact flag implementation TBD. |
| 14 | How is it secured? | Session scoped read only; no external model database credentials. |
| 15 | What permissions does it require? | Session scoped read only; no external model database credentials. |
| 16 | How is sensitive data handled? | Minimize customer identifiers before vendor; synthetic data only. |
| 17 | How does it handle concurrency? | One DB read snapshot; re-read before actionable draft. |
| 18 | How does it handle duplicate operations? | Pure read, replay safe; no side-effect writes. |
| 19 | What happens when dependencies fail? | If DB down return unavailable; missing facts -> INSUFFICIENT_DATA. |
| 20 | What happens when it crashes? | Recompute from source on restart. |
| 21 | What are its timeout policies? | Proposed deterministic overhead P95 ≤500ms, not measured. |
| 22 | What are its retry policies? | Read-only safe client retries; no write or billing. |
| 23 | How is it monitored? | Proposed source hash, record count, coverage, stale errors. |
| 24 | What metrics prove it is healthy? | Fact consistency, leakage test, canonical hash pass rate. |
| 25 | What alerts exist? | Cross-tenant fact or mismatched money blocks release; RB-002. |
| 26 | What are its performance targets? | Due list P95 ≤300ms target; unmeasured. |
| 27 | What is its maximum tested capacity? | At most 50 bounded customer items/request. |
| 28 | How does it scale? | No index/vector system; add SQL indexes if profiling supports. |
| 29 | How is it tested? | Expected tenant, stale, partial/zero/new-credit, date/IST cases NOT RUN. |
| 30 | How is it deployed? | Within local FastAPI code after 008 migration. |
| 31 | How is it rolled back? | Disable due assistant; core finance unaffected. |
| 32 | How is its data recovered? | Derive from immutable ledger; no extra store. |
| 33 | What operational runbook covers it? | RB-002 |
| 34 | What known limitations exist? | Partial sale/visit coverage; no per-advance repayment allocation. |
| 35 | What technical debt exists? | Canonical JSON hashing, source versioning and Postgres parity. |
| 36 | What architectural decisions created it? | HYD-ADR-011 and existing evidence provenance principles. |
| 37 | What open questions remain? | Precise snapshot fingerprint format and status when no amount promised. |

**P0 release policy:** Partial sale/visit coverage; no per-advance repayment allocation. The status above changes only after source, tests and dated evidence are recorded.

## CMP-AI-006 — Bounded assistant controller and model adapter
**Implementation status:** H-PROPOSED; NO CODE / LIVE CALLS. **Exact current/proposed paths:** `PROPOSED apps/api/assistant.py and ai_provider.py; V3 JSON schema`.

| # | Original mandatory question | Answer and evidence boundary |
|---:|---|---|
| 01 | What is it? | Bounded assistant controller and model adapter |
| 02 | Why does it exist? | Interpret flexible merchant questions while isolating model uncertainty from money. |
| 03 | Who owns it? | AI/backend engineer (TBD), operator approves spending |
| 04 | What is its responsibility? | Classify intent/select approved template, bind evidence, server render trusted amounts, safe fallback. |
| 05 | What is explicitly outside its responsibility? | Financial posting, deciding payment truth, arbitrary tool use, external contact, debt risk scoring. |
| 06 | What are its inputs? | Authenticated ≤500-character question, locale, bounded FactBundle and approved model configuration. |
| 07 | What are its outputs? | Validated server AssistantResponse, provider-mode label, redacted metrics. |
| 08 | What systems depend on it? | Assistant workspace and follow-up composer. |
| 09 | What does it depend on? | Read-only evidence broker, server templates, optional selected LLM vendor. |
| 10 | What data does it own? | No durable authoritative record; transient minimized context and proposed model decision. |
| 11 | What interfaces does it expose? | PROPOSED /v1/assistant/questions and /v1/assistant/status. |
| 12 | How does it behave at runtime? | Classify intent/select approved template, bind evidence, server render trusted amounts, safe fallback. |
| 13 | How is it configured? | PROPOSED HYD_AI_* flags; default OFF and budget TBD. |
| 14 | How is it secured? | Server-only approved key, no DB/write session to model. |
| 15 | What permissions does it require? | Server-only approved key, no DB/write session to model. |
| 16 | How is sensitive data handled? | Synthetic bounded facts; no raw audio, phone, actual customer debt notes sent. |
| 17 | How does it handle concurrency? | At most one in-flight model call/session proposed; no write lock during HTTP. |
| 18 | How does it handle duplicate operations? | No exactly-once billed guarantee; no automatic paid retries, visible ambiguity. |
| 19 | What happens when dependencies fail? | Invalid JSON, 429, timeout -> trusted deterministic fallback. |
| 20 | What happens when it crashes? | No model state to recover; journal remains independent. |
| 21 | What are its timeout policies? | Proposed provider hard total 12s; exact vendor SDK TBD. |
| 22 | What are its retry policies? | Zero automatic paid retries; a new explicit operator-approved call only. |
| 23 | How is it monitored? | Proposed schema-reject rate, source-binding failures, duration/tokens/cost redacted. |
| 24 | What metrics prove it is healthy? | Per-intent confusion, 0 wrong amount accepted, 0 tenant leaks in evaluated battery. |
| 25 | What alerts exist? | Any unsupported financial claim/model write path = block; provider cost cap -> off. |
| 26 | What are its performance targets? | Model call deadline target only; real observed latency TBD. |
| 27 | What is its maximum tested capacity? | Finite synthetic 50 fact records, 5 calls/session proposed and bounded spending. |
| 28 | How does it scale? | No multi-agent/broker/vector service; not deployed publicly. |
| 29 | How is it tested? | 60 preregistered synthetic cases NOT_RUN; provider currently unselected. |
| 30 | How is it deployed? | Local optional feature off until reviewed, never unrestricted public inference. |
| 31 | How is it rolled back? | Disable provider and use deterministic facts/templates. |
| 32 | How is its data recovered? | Recompute answer from ledger; no external finance state. |
| 33 | What operational runbook covers it? | RB-003 |
| 34 | What known limitations exist? | Restricted template language, no verified merchant task uplift. |
| 35 | What technical debt exists? | Vendor terms, live model evaluation, localized template review. |
| 36 | What architectural decisions created it? | HYD-ADR-010 proposed. |
| 37 | What open questions remain? | Provider, API price/retention, chosen approved locales and operator authorization. |

**P0 release policy:** Restricted template language, no verified merchant task uplift. The status above changes only after source, tests and dated evidence are recorded.

## CMP-FUP-007 — Unsent follow-up composer
**Implementation status:** H-PROPOSED; NO CODE. **Exact current/proposed paths:** `PROPOSED followups service + React review panel, no messaging connector`.

| # | Original mandatory question | Answer and evidence boundary |
|---:|---|---|
| 01 | What is it? | Unsent follow-up composer |
| 02 | Why does it exist? | Turn supported due information into one respectful reviewed next step. |
| 03 | Who owns it? | Product/backend/front-end maintainers |
| 04 | What is its responsibility? | Revalidate due evidence and create clearly labelled unsent, editable proposal. |
| 05 | What is explicitly outside its responsibility? | Message delivery, contact database, debtor coercion or payment proof. |
| 06 | What are its inputs? | Owned current commitment/version, fresh facts hash, selected locale, merchant review. |
| 07 | What are its outputs? | DRAFT_NOT_SENT, sent=false, explicit customer-level current outstanding and evidence. |
| 08 | What systems depend on it? | Merchant assistant workspace. |
| 09 | What does it depend on? | Scoped evidence broker, approved text templates and server formatter. |
| 10 | What data does it own? | Proposed transient draft only; optional manual handled event deferred. |
| 11 | What interfaces does it expose? | PROPOSED POST /v1/followups/drafts. |
| 12 | How does it behave at runtime? | Revalidate due evidence and create clearly labelled unsent, editable proposal. |
| 13 | How is it configured? | PROPOSED HYD_FOLLOWUP_PERSIST_ENABLED=false; send integration unavailable. |
| 14 | How is it secured? | Session merchant review; no external sender credential. |
| 15 | What permissions does it require? | Session merchant review; no external sender credential. |
| 16 | How is sensitive data handled? | No phone number needed, no auto transfer; fictional wording. |
| 17 | How does it handle concurrency? | Recheck source hash and version before returning actionable draft. |
| 18 | How does it handle duplicate operations? | Read-like generation may repeat; no delivered communication to dedupe. |
| 19 | What happens when dependencies fail? | Model off → reviewed fixed template; stale facts -> 409 re-review. |
| 20 | What happens when it crashes? | Draft lost; no delivery or journal side effect. |
| 21 | What are its timeout policies? | Deterministic render short; model optional separate deadline. |
| 22 | What are its retry policies? | Safe regeneration after manual re-review; no automated contact retry. |
| 23 | How is it monitored? | Proposed draft-status and stale-error metrics. |
| 24 | What metrics prove it is healthy? | 0 sent=true, 0 unsupported numeric claim, task completion time. |
| 25 | What alerts exist? | Any fake delivery status or stale amount = block, RB-002. |
| 26 | What are its performance targets? | No measured P95; include assistant/UI benchmark. |
| 27 | What is its maximum tested capacity? | One selected customer draft at a time for P0. |
| 28 | How does it scale? | Stateless local operation; no external send service. |
| 29 | How is it tested? | No send network, zero balance, stale credit, polite template, reviewed locale tests NOT RUN. |
| 30 | How is it deployed? | Local UI/backend new feature; optional hosting separate. |
| 31 | How is it rolled back? | Hide draft route; ledger untouched. |
| 32 | How is its data recovered? | Re-render from fresh source after merchant review. |
| 33 | What operational runbook covers it? | RB-002/003 |
| 34 | What known limitations exist? | No WhatsApp/SMS delivery, no real customer opt-in collection flow. |
| 35 | What technical debt exists? | Future message opt-out, delivery outbox, consent and legal review. |
| 36 | What architectural decisions created it? | HYD-ADR-010 and draft-only principles. |
| 37 | What open questions remain? | Exact reviewed Telugu/Hindi template copy and future opt-in sending. |

**P0 release policy:** No WhatsApp/SMS delivery, no real customer opt-in collection flow. The status above changes only after source, tests and dated evidence are recorded.

## CMP-UI-008 — React merchant assistant and capture UX
**Implementation status:** Existing React foundation; Hyderabad workflow PROPOSED. **Exact current/proposed paths:** `Existing apps/web/src/App.tsx,Capture.tsx,VoiceCapture.tsx,api.ts; proposed AssistantWorkspace/CommitmentEditor`.

| # | Original mandatory question | Answer and evidence boundary |
|---:|---|---|
| 01 | What is it? | React merchant assistant and capture UX |
| 02 | Why does it exist? | Compress workflow into one understandable record→insight→action experience. |
| 03 | Who owns it? | Frontend maintainer |
| 04 | What is its responsibility? | Collect explicit input/reviews, show receipts, evidence/date meaning, error and unsent status. |
| 05 | What is explicitly outside its responsibility? | Computing authoritative balances, selecting merchant tenant, paid provider credentials. |
| 06 | What are its inputs? | Typed/recorded synthetic details, merchant-click confirmation, API responses and source hash. |
| 07 | What are its outputs? | UI states, stable operation ID, visible proof and confirmation notices. |
| 08 | What systems depend on it? | Merchant operator and demo reviewer. |
| 09 | What does it depend on? | Local FastAPI, browser mic permission, typed API contract. |
| 10 | What data does it own? | Transient UI state/preferences only; no trusted finance state in local storage. |
| 11 | What interfaces does it expose? | Existing browser REST client plus proposed commitment/assistant/follow-up calls. |
| 12 | How does it behave at runtime? | Collect explicit input/reviews, show receipts, evidence/date meaning, error and unsent status. |
| 13 | How is it configured? | Frontend build-time API origin and availability status; no VITE_* API secret. |
| 14 | How is it secured? | Browser consent for microphone, server session for data APIs. |
| 15 | What permissions does it require? | Browser consent for microphone, server session for data APIs. |
| 16 | How is sensitive data handled? | Audio transient, plain text model content, no contact delivery. |
| 17 | How does it handle concurrency? | Abort/ignore stale responses on session/customer/hash/version changes. |
| 18 | How does it handle duplicate operations? | Persist stable operation ID for deliberate retry; never auto-create duplicate finance. |
| 19 | What happens when dependencies fail? | Typed fallback, deterministic due list, visible provider unavailable. |
| 20 | What happens when it crashes? | Restart/reload and fetch authoritative state, no optimistic confirmed writes. |
| 21 | What are its timeout policies? | Browser network timeouts operator/implementation specific; show pending. |
| 22 | What are its retry policies? | Safe known idempotency key for finance; operator-controlled re-submit. |
| 23 | How is it monitored? | Browser E2E, error states, manual mobile/keyboard observations. |
| 24 | What metrics prove it is healthy? | Task time/error/assist count, stale-screen bug count. |
| 25 | What alerts exist? | Wrong confirmed badge, hidden stale amount or sent status = demo blocker. |
| 26 | What are its performance targets? | 390px responsive and keyboard usability targets; no measured first-load result. |
| 27 | What is its maximum tested capacity? | One demo merchant workflow, no physical native app. |
| 28 | How does it scale? | Large App.tsx requires maintainability refactor only if low regression risk. |
| 29 | How is it tested? | Historical frontend/Edge, new workflow E2E/mic/keyboard NOT RUN. |
| 30 | How is it deployed? | Vite build in local demo; optional Vercel frontend not proof backend. |
| 31 | How is it rolled back? | Disable new workspace and route back to original capture pages. |
| 32 | How is its data recovered? | Re-fetch journal/state on reload; unconfirmed edits remain proposals. |
| 33 | What operational runbook covers it? | RB-004 |
| 34 | What known limitations exist? | Physical phone, screen-reader and native microphone tests not established. |
| 35 | What technical debt exists? | UI component size and language accessibility. |
| 36 | What architectural decisions created it? | V3 workflow boundary and separate finance/message review. |
| 37 | What open questions remain? | Actual usability participants and device/browser to validate. |

**P0 release policy:** Physical phone, screen-reader and native microphone tests not established. The status above changes only after source, tests and dated evidence are recorded.

## CMP-HOST-009 — Opt-in hosted synthetic PostgreSQL backend
**Implementation status:** BASELINE-LIMITED code/CI; HYD extension NOT IMPLEMENTED. **Exact current/proposed paths:** `apps/hosted/, api/index.py, apps/hosted/config.py, Supabase migration and docs/HOSTED_DEMO.md`.

| # | Original mandatory question | Answer and evidence boundary |
|---:|---|---|
| 01 | What is it? | Opt-in hosted synthetic PostgreSQL backend |
| 02 | Why does it exist? | Demonstrate a remotely accessible synthetic app only if security promotion passes. |
| 03 | Who owns it? | Deployment/DB/security maintainer |
| 04 | What is its responsibility? | Separate synthetic tenant-scoped PostgreSQL APIs with RLS/cookie/HTTPS deployment controls. |
| 05 | What is explicitly outside its responsibility? | Production Paytm integration, real merchant identity, automatically ported V3 routes. |
| 06 | What are its inputs? | Validated hosted cookie, backend exact origin, PostgreSQL DSN and synthetic API requests. |
| 07 | What are its outputs? | Native PG financial responses, scoped projections and errors. |
| 08 | What systems depend on it? | Optional hosted frontend, but live backend not independently attested. |
| 09 | What does it depend on? | Vercel function, Supabase transaction pooler, reviewed rewrite, dedicated non-admin DB role. |
| 10 | What data does it own? | Hosted synthetic PostgreSQL separate from local SQLite; no shared auto-sync. |
| 11 | What interfaces does it expose? | Existing hosted /v1 subset; new V3 routes not present. |
| 12 | How does it behave at runtime? | Separate synthetic tenant-scoped PostgreSQL APIs with RLS/cookie/HTTPS deployment controls. |
| 13 | How is it configured? | HOSTED_DEMO_ENABLED, HOSTED_DATABASE_URL, HOSTED_FRONTEND_ORIGIN, HOSTED_ALLOWED_HOSTS. |
| 14 | How is it secured? | Server-only DB role, tenant RLS, exact HTTPS/cookie origin restrictions. |
| 15 | What permissions does it require? | Server-only DB role, tenant RLS, exact HTTPS/cookie origin restrictions. |
| 16 | How is sensitive data handled? | Synthetic only, no real customer/audio; hosted paid voice disabled. |
| 17 | How does it handle concurrency? | Postgres DB-specific transactions/locks, review native RLS and receipt semantics. |
| 18 | How does it handle duplicate operations? | Native PG idempotency with scoped receipt; test replay after proxy loss. |
| 19 | What happens when dependencies fail? | No public promotion when DB, HTTPS host or rewrites wrong; use local replay. |
| 20 | What happens when it crashes? | Stateless function restart, DB transaction protects data if correctly deployed. |
| 21 | What are its timeout policies? | Function/database/vendor deadlines and pool capacity actual deployed configuration TBD. |
| 22 | What are its retry policies? | Idempotent financial retry only; avoid auto AI billing. |
| 23 | How is it monitored? | Health/ready + CI proxy tests; no production monitoring proved. |
| 24 | What metrics prove it is healthy? | Cross-tenant RLS tests, HTTP/DB readiness; remote latency unknown. |
| 25 | What alerts exist? | Any public tenant leak or insecure TLS stops promotion, RB-005. |
| 26 | What are its performance targets? | Native PG test results documented; actual hosted capacity unmeasured. |
| 27 | What is its maximum tested capacity? | Supabase pooler candidate but real configured instance unverified. |
| 28 | How does it scale? | Potential serverless separate infrastructure only, no production autoscale claim. |
| 29 | How is it tested? | Local native PG/HTTPS proxy tests reported in hosted CI; new V3 parity NOT RUN. |
| 30 | How is it deployed? | Deployment-gated Vercel/Supabase plan; frontend URL != verified backend. |
| 31 | How is it rolled back? | Disable hosted flag/rewrite; preserve migration tables and evidence. |
| 32 | How is its data recovered? | Operator-guided PG backup/restore procedures not tested remote. |
| 33 | What operational runbook covers it? | RB-005 |
| 34 | What known limitations exist? | No live provider speech or proven remote infrastructure. |
| 35 | What technical debt exists? | Production identity, RLS parity, hosted AI budget, actual remote smoke. |
| 36 | What architectural decisions created it? | Existing ADR-024_HOSTED_SYNTHETIC_POSTGRES and V3 parity gate. |
| 37 | What open questions remain? | Whether hosted release is needed and whether remote project/config are available. |

**P0 release policy:** No live provider speech or proven remote infrastructure. The status above changes only after source, tests and dated evidence are recorded.
