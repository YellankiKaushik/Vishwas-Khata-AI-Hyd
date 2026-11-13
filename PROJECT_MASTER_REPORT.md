# Vishwas-Khata-AI — Project master report

Updated 13 November 2026 (Asia/Kolkata). Synthetic data only. This is the primary current report; retained release/design documents describe earlier checkpoints.

## 1. Executive project status

The tested Hyderabad release is published, independently verified, and remains frozen on GitHub `main`. The original desktop project, both Repair 2 source folders, private audio/authorization receipts, historical bundles and venue data were preserved.

| Release | Decision | Evidence boundary |
| --- | --- | --- |
| HACKATHON_DEMO_STATUS | READY_WITH_LIMITATIONS | Fresh actual backend, browser, build and signed financial journey passed. Physical microphone/playback and organizer eligibility remain outside automated acceptance. |
| PUBLIC_DEMO_STATUS | NOT_DEPLOYED | No interactive public HTTPS deployment exists. Public GitHub source is not a hosted application. |
| REAL_AI_STATUS | MOCK_ONLY | Deterministic English and fake-provider transport tests; no new live inference or speech request. |
| PAYTM_INTEGRATION_STATUS | APPROVAL_REQUIRED | Official documentation investigated; no authorized Paytm account integration or API implementation. |
| PRODUCTION_STATUS | PROTOTYPE_ONLY | No real merchant authentication, managed production persistence or approved pilot. |

Beyond-release changes are isolated on `feat/synthetic-staging-foundations`. Final staging regression status: **PASS** — 239 backend, 11 frontend, 28 Edge passed / 1 private-fixture skip, 38 reference and 11 embedded PostgreSQL tests. Production build, real HTTP financial smoke and dependency/source audits passed. No application test failed.

## 2. Original vision and Hyderabad V3 scope

The merchant controls the sequence: capture a transaction, correct its preview, explicitly confirm it, inspect the recorded balance, enter an expected repayment date, ask an evidence-grounded question, and review an unsent follow-up. Promises and administrative follow-up states never prove that money was received.

Authority reviewed: the checksummed `Project_Vishwas_Khata_V3/DEEP_TECHNICAL_ARCHITECTURE.md`, contracts and migrations; Hyderabad V3 reference requirements, component contracts and financial semantics under `docs/hyderabad/reference`; the implementation crosswalk, final closeout, publication checklist and venue runbook from the existing development checkout. The root architecture copy is the older Bengaluru V3 document, not a new Hyderabad implementation certificate. No new submitted pitch or organizer confirmation was supplied with this request; pitch eligibility and creation-origin cases remain open.

The V3 references intentionally retain design-time status. This report reconciles those requirements against actual code/tests without rewriting original package bytes or claiming future sections are implemented.

## 3. What is actually implemented

Frozen release: local FastAPI/SQLite ledger, customer identity review, immutable signed journal, original retry receipts, observations and corrections, four-slot briefing, migration 008 commitments, due evidence, bounded English assistant, unsent draft review, stale conflict handling and compiled React workflows.

Separate staging branch: explicit deterministic/OpenAI selection, approval-bound configurable model ID, bounded input, redacted token/latency receipts, hidden key representations, audited pip bootstrap, a source verifier that works in the sanitized checkout, repeatable real-HTTP smoke, and PostgreSQL/RLS commitment/evidence groundwork. The existing PostgreSQL `001_synthetic_journal.sql` was carried forward unchanged; `002_commitment_evidence.sql` is additive. Neither changes SQLite migrations 001–008 or the frozen source manifest.

The staging PostgreSQL code is an isolated database port. It has no public HTTP API or hosted frontend. Its original direct journal function is a database test primitive, not a replacement for reviewed financial drafts. It must not be exposed to a browser or published as full hosted parity.

## 4. Current feature inventory

| Capability | Existing code | Tested here | Publicly deployed | Live third party |
| --- | --- | --- | --- | --- |
| Reviewed credit, repayment, reversal and original-key retries | `apps/api/main.py`, `domain.py`, SQLite migrations | Actual handlers, migrated DB and Edge | No | Not applicable |
| Commitments, immutable events, due evidence, stale draft rejection | `commitments.py`, `hyd_evidence.py`, migration 008 | API, DB, browser journey | No | Not applicable |
| Evidence-grounded English assistant and polite unsent draft | `assistant.py`, `hyd_provider.py`, `MerchantAssistant.tsx` | Deterministic and injected transports | No | No inference call |
| Sales/visits, correction, limited-coverage facts and briefing | `analytics.py`, observation routes, `BriefingAudio.tsx` | API/UI/browser | No | No new TTS call |
| Local recording, PCM validation, cancellation and typed fallback | `voice.py`, `VoiceCapture.tsx`, `audio.ts` | Mock/virtual microphone/browser | No | Historical English samples only |
| Hindi/Telugu live speech or assistant answers | Gates and typed guidance exist | Negative gates, not language accuracy | No | No |
| PostgreSQL signed journal and commitment projections | `apps/hosted/migrations`, `apps/hosted/tests` | Embedded PostgreSQL engine | No | No managed DB connection |
| Merchant authentication, approved payments, outbound messaging | No production implementation | Disabled/absent boundaries | No | No |

## 5. Exact codebase and architecture

Frozen source identity and publication details are in section 9. Working changes are in the new independent Hyderabad master checkout, on the staging branch. The desktop migration-era working tree is unrelated to the accepted release and was left unchanged.

Local architecture: compiled React/Vite → loopback FastAPI → migrated SQLite. The server derives merchant identity, time, provenance, balances and evidence. The model can select a supported read-only decision; the server renders trusted financial facts. Optional speech runs server-side behind independent gates. Normal demo operation requires no provider key.

Selected hosted direction: separate synthetic-only service using managed PostgreSQL with a private server-side connection and RLS. Vercel is a prospective frontend/function host after API/session parity; a persistent FastAPI host is an alternative if the existing Python service is ported. Stateless function-local SQLite is unsuitable for durable shared hosting. Sites was evaluated: its Worker/D1 runtime would require another backend port and was not substituted for the requested PostgreSQL direction.

PostgreSQL groundwork uses a dedicated non-superuser schema owner without BYPASSRLS, FORCE RLS, transaction-local tenant binding, advisory transaction locks, append-only history and server-derived IST dates. Only a trusted future backend may set tenant context. Never give browser clients database credentials or permission to choose tenant context. The embedded tests do not establish behavior across independent PostgreSQL connections or a managed pooler.

## 6. Financial and AI safety guarantees

The local release preserves integer paise, strict explicit confirmation, exact versions, trusted merchant scope, BEGIN IMMEDIATE, journal-before-confirmed-state, atomic journal/receipt/audit commits, append-only postings, compensating reversals and nonnegative receivables. Retry keys survive uncertain responses. Commitment handling changes attention state without paying debt. Partial repayment does not rewrite the historical promise. New positive ledger entries require renewed review.

Answers use deterministic merchant-scoped records, provenance IDs, freshness hashes and IST dates. Invalid model decisions, unsupported questions, sparse evidence and outages retain deterministic behavior. Models receive temporary evidence aliases and allowed intent/locale, never raw financial write handles. No ledger action or customer message can be initiated by model output. No Paytm data, payment collection, lending conclusion or credit score is implemented.

Provider selection is deterministic by default. OpenAI additionally requires the live switch, backend key and a matching, unexpired, merchant/model-specific finite approval file. Each approved request consumes an atomic attempt before transport; timeouts consume the slot and do not retry. Input is capped at 12,000 serialized message bytes, output at 400 completion tokens and response bytes at 65,536; transport timeout is four seconds with a bounded receive deadline. Local assistant quota is 30 questions/minute/merchant and is per process, not a distributed hosted control. Token counts are recorded only if actually reported; actual billing cost remains unknown/null. Logs omit keys, prompts, raw responses and customer IDs.

These guarantees apply to the tested synthetic local mode and isolated DB tests. They are not certification for real merchants or a deployed multiuser service.

## 7. Browser, API, security and deployment test results

| Check | Exact frozen release, fresh run | Staging branch |
| --- | --- | --- |
| Backend | 229 passed, 0 failed; one existing Starlette deprecation warning | 239 passed, 0 failed; same existing warning |
| Frontend unit | 11 passed | 11 passed; frontend code unchanged |
| TypeScript / Vite production build | Passed | Passed; JS/CSS content hashes unchanged |
| Full actual Edge suite | 28 passed, 1 private-WAV skip, 0 failed, exit 0 | 28 passed, 1 private-WAV skip, 0 failed, exit 0 |
| V3 design verifier / separate reference tests | Passed / 38 passed | Passed / 38 passed |
| Financial scenario | 50,000 → 30,000 → 20,000 → 70,000 paise; unsent draft, stale 409 and REVIEW_REQUIRED | Real TCP smoke: health/homepage/JS/CSS 200, malformed path 404; same four balances and stale/unsent/review assertions. 11 embedded PostgreSQL tests passed |
| Source provenance | One-root history, exact tree, all 167 manifest hashes matched; private/media/secret scan passed | All 167 frozen hashes, 34 reference hashes and 8 historical migrations preserved; 181 publication files scanned without secrets |
| Dependency audit | npm: zero vulnerabilities; pip check passed. Initial pip 25.0.1 audit failed; upgrading isolated pip to 26.3 yielded no known vulnerabilities | Python audit: no known vulnerabilities; web and hosted npm audits: zero; pip 26.3 bootstrap pinned |
| Public GitHub access | Anonymous HTTPS 200 for README, commitments implementation and manifest; unauthenticated API confirmed SHA/tree | Implementation published on separate branch; independent GitHub commit/tree verification matched |
| Hosted HTTPS/API/isolation/browser/concurrency/recovery | NOT_RUN: no deployment or managed DB | NOT_RUN; release preflight blocks publication |

Evidence is retained privately in `.tmp/master-evidence/`, `test-results/browser/`, and the pre-existing laptop witness/closeout. Actual screenshots were inspected for desktop, 390px, review, unsent state and keyboard focus. The mobile navigation drawer remains open immediately after a desktop-to-mobile resize; its visible close control restores the full workspace. Overflow and focus assertions passed. No cosmetic app changes were made. Automated browser audio and virtual-device recording are not a physical microphone or audible-playback witness.

The missing authorized private WAV case remains skipped. Recorded English transcript replay is a different test and passed. Zero new paid provider calls, outbound customer messages, cloud deployments or real transactions occurred.

## 8. V3 requirements traceability and missing features

The tables appended below use the requested status vocabulary and distinguish the older base V3 namespace from the Hyderabad namespace. Matching FR numbers across those namespaces describe different requirements. A local IMPLEMENTED_AND_TESTED row does not imply hosted or live-provider verification.

Base V3 (the corrected Appendix R / 25-row V3 matrix supersedes retained older FR wording):

| V3 ID | Status | Actual code / relevant tests | Remaining requirement, dependency and release stage |
| --- | --- | --- | --- |
| FR-001 | IMPLEMENTED_AND_TESTED | `main.py merchant session / test_contract_http.py`; original IDs T-001, T-016 | None for the local synthetic contract; P0 hackathon. |
| FR-002 | IMPLEMENTED_NOT_FULLY_TESTED | `voice.py, VoiceCapture.tsx / test_voice_http.py, voice.spec.ts`; original IDs T-002, T-003, T-004 | Local mock/recorded protocol passed. Separate finite live-language approval and physical device witness still required; P2 voice. No broader language claim. |
| FR-003 | IMPLEMENTED_AND_TESTED | `domain.py extraction / test_capture_validation.py`; original IDs T-004, T-005, T-028 | None for the local synthetic contract; P0 hackathon. |
| FR-004 | IMPLEMENTED_AND_TESTED | `main.py draft edit / test_finance_http.py`; original IDs T-007, T-029 | None for the local synthetic contract; P0 hackathon. |
| FR-005 | IMPLEMENTED_AND_TESTED | `main.py confirmation, migrations / test_finance_http.py`; original IDs T-006, T-008, T-021, T-036 | None for the local synthetic contract; P0 hackathon. |
| FR-006 | IMPLEMENTED_AND_TESTED | `domain.py balance and entries / test_finance_http.py`; original IDs T-009, T-022 | None for the local synthetic contract; P0 hackathon. |
| FR-007 | IMPLEMENTED_AND_TESTED | `domain.py overpayment guard / test_finance_http.py`; original IDs T-008, T-030 | None for the local synthetic contract; P0 hackathon. |
| FR-008 | IMPLEMENTED_AND_TESTED | `domain.py reversal / test_finance_http.py`; original IDs T-026, T-031, T-039, T-040 | None for the local synthetic contract; P0 hackathon. |
| FR-009 | IMPLEMENTED_AND_TESTED | `main.py observations / test_observations_http.py`; original IDs T-010, T-032, T-037 | None for the local synthetic contract; P0 hackathon. |
| FR-010 | IMPLEMENTED_AND_TESTED | `analytics.py daily facts / test_observations_http.py`; original IDs T-010, T-012 | None for the local synthetic contract; P0 hackathon. |
| FR-011 | IMPLEMENTED_AND_TESTED | `analytics.py cadence / test_observations_http.py`; original IDs T-011, T-020 | None for the local synthetic contract; P0 hackathon. |
| FR-012 | IMPLEMENTED_AND_TESTED | `analytics.py briefing / briefing.spec.ts`; original IDs T-012, T-018, T-019 | None for the local synthetic contract; P0 hackathon. |
| FR-013 | IMPLEMENTED_NOT_FULLY_TESTED | `voice.py briefing speech / test_voice_http.py, playback.spec.ts`; original IDs T-013, T-027 | Local mock/recorded protocol passed. Separate finite live-language approval and physical device witness still required; P2 voice. No broader language claim. |
| FR-014 | IMPLEMENTED_AND_TESTED | `main.py suggestions / test_observations_http.py`; original IDs T-014, T-033 | None for the local synthetic contract; P0 hackathon. |
| FR-015 | IMPLEMENTED_AND_TESTED | `manage.py synthetic seed / test_completion_security.py`; original IDs T-015, T-034 | None for the local synthetic contract; P0 hackathon. |
| FR-016 | IMPLEMENTED_AND_TESTED | `migrations 001–007 / test_finance_http.py, test_application_completion.py`; original IDs T-051, T-052, T-053 | None for the local synthetic contract; P0 hackathon. |
| FR-017 | IMPLEMENTED_AND_TESTED | `main.py operation receipts / test_observations_http.py`; original IDs T-054, T-055 | None for the local synthetic contract; P0 hackathon. |
| FR-018 | IMPLEMENTED_AND_TESTED | `main.py observation void / test_observations_http.py`; original IDs T-056, T-057 | None for the local synthetic contract; P0 hackathon. |
| FR-019 | IMPLEMENTED_AND_TESTED | `analytics.py coverage / test_observations_http.py`; original IDs T-058, T-062 | None for the local synthetic contract; P0 hackathon. |
| FR-020 | IMPLEMENTED_AND_TESTED | `analytics.py scoped visits / test_observations_http.py`; original IDs T-059, T-060 | None for the local synthetic contract; P0 hackathon. |
| FR-021 | IMPLEMENTED_NOT_FULLY_TESTED | `voice.py provider protocol / test_voice_http.py, test_final_voice_guards.py`; original IDs T-061, T-064 | Local mock/recorded protocol passed. Separate finite live-language approval and physical device witness still required; P2 voice. No broader language claim. |
| FR-022 | IMPLEMENTED_AND_TESTED | `useSavedOperation.ts, receipts / recovery.spec.ts, draft-recovery.spec.ts`; original IDs T-065 | None for the local synthetic contract; P0 hackathon. |
| FR-023 | IMPLEMENTED_AND_TESTED | `main.py suggestion actions / test_observations_http.py`; original IDs T-066 | None for the local synthetic contract; P0 hackathon. |
| FR-024 | IMPLEMENTED_AND_TESTED | `analytics.py snapshot freshness / briefing.spec.ts`; original IDs T-067 | None for the local synthetic contract; P0 hackathon. |
| FR-025 | IMPLEMENTED_AND_TESTED | `runtime OpenAPI, source manifest / test_contract_http.py, verify_release.py`; original IDs T-068, T-069, T-070 | None for the local synthetic contract; P0 hackathon. |

Hyderabad V3 (all FR rows from its independent requirements register):

| V3 ID | Requirement | Status | Existing implementation / tests | Missing functionality, dependency, priority / stage |
| --- | --- | --- | --- | --- |
| FR-001 | Create customer in correct merchant scope; duplicate names remain separate IDs | IMPLEMENTED_AND_TESTED | apps/api/main.py and domain.py; TC-B-001 / test_finance_http.py, test_application_completion.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-002 | Create/edit draft with strict typed money, exact version, explicit final `confirm=true` | IMPLEMENTED_AND_TESTED | apps/api/main.py and domain.py; TC-B-002 / test_finance_http.py, test_draft_intents.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-003 | Credit adds receivables; repayment subtracts; negative receivable forbidden | IMPLEMENTED_AND_TESTED | apps/api/domain.py and migrations 001–007; TC-B-003 / test_finance_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-004 | Retry receipt returns original post result; wrong-key payload conflict; append-only reversal | IMPLEMENTED_AND_TESTED | apps/api/main.py and db.py; TC-B-004 / test_finance_http.py, test_application_completion.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-005 | Record PCM WAV and preserve typed fallback; paid STT gated | IMPLEMENTED_NOT_FULLY_TESTED | apps/api/voice.py and VoiceCapture.tsx; TC-B-005 / test_voice_http.py, VoiceCapture.test.tsx | Physical capture and representative live accuracy remain unverified; finite speech authorization and operator witness. P2 voice; typed P0 path accepted. |
| FR-006 | Return deterministic fact provenance, coverage limits and IST date | IMPLEMENTED_AND_TESTED | apps/api/analytics.py; TC-B-006 / test_observations_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-007 | Merchant creates customer-level expected-date commitment using exact ID, local date, optional explicit amount and version | IMPLEMENTED_AND_TESTED | apps/api/commitments.py; TC-H-001 / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-008 | Every commitment edit/cancel/close appends immutable event with actor, reason, timestamp and prior version | IMPLEMENTED_AND_TESTED | apps/api/migrations/008_hyd_commitments.sql; TC-H-002 / test_commitment_migration.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-009 | Derive due/overdue from IST business date, explicit promise and current authoritative balance; never equate visit gap with due date | IMPLEMENTED_AND_TESTED | apps/api/hyd_evidence.py; TC-H-003 / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-010 | Partial repayment updates displayed balance without inventing allocation to a particular advance | IMPLEMENTED_AND_TESTED | apps/api/hyd_evidence.py; TC-H-004 / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-011 | Fully settled customer not shown as needing a money follow-up; commitment retained historically | IMPLEMENTED_AND_TESTED | apps/api/hyd_evidence.py; TC-H-005 / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-012 | Read-only, merchant-scoped evidence retrieval using approved query types and bounded results | IMPLEMENTED_AND_TESTED | apps/api/assistant.py; TC-H-006 / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-013 | Assistant answers supported questions in structured schema; validates source IDs and re-derives amounts | IMPLEMENTED_AND_TESTED | apps/api/assistant.py and hyd_provider.py; TC-H-007 / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-014 | Fail closed for invented numbers, stale evidence, mismatched tenant, invalid JSON, missing date, unsupported question | IMPLEMENTED_AND_TESTED | apps/api/assistant.py; TC-H-008 / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-015 | Generate polite follow-up *draft*, never send; merchant can approve/save/dismiss locally | IMPLEMENTED_AND_TESTED | apps/api/assistant.py and MerchantAssistant.tsx; TC-H-009 / test_hyderabad_http.py; hyderabad.spec.ts passed | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-016 | Assistant messages show as-of date, evidence type, unsupported inference caveats, and provider availability | IMPLEMENTED_AND_TESTED | apps/web/src/MerchantAssistant.tsx; TC-H-010 / Vite build, hyderabad.spec.ts passed | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-017 | One connected customer credit→repayment→promise→follow-up journey from React interface | IMPLEMENTED_AND_TESTED | apps/web/e2e/hyderabad.spec.ts; TC-H-011 / Playwright readiness | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-018 | Disabling or timing out AI leaves existing ledger/customer workflows operational | IMPLEMENTED_AND_TESTED | apps/api/assistant.py; TC-H-012 / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-019 | Existing original test suite passes after additive migration | IMPLEMENTED_AND_TESTED | tests/ and migration 008; TC-H-013 / 229 normal pytest tests including restart | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-020 | Optional real provider answer verified and recorded separately from mocks | BLOCKED_BY_AUTHORIZATION | apps/api/hyd_provider.py; TC-H-014 / MockTransport tests | Live model test not performed. Requires key configured privately, current model/rates/credits and exact finite human approval. P2 AI staging; not essential to typed hackathon. |
| FR-021 | Speech language enables only exact supported tested locale, with correction/confirmation | BLOCKED_BY_AUTHORIZATION | apps/api/voice.py; TC-H-015 / voice HTTP tests | Only historical English samples; Hindi/Telugu and venue hardware unverified. Requires separately permitted samples, per-language review and physical witness. P2 speech. |
| FR-022 | Measured synthetic task usability sample with real N and timing | DEFERRED_CONDITIONAL | docs/hyderabad/RELEASE_READINESS.md; TC-H-016 / None | No measured N/timing usability sample. Requires consented participants and a defined protocol. P2/P3 usability; not P0 acceptance. |
| FR-023 | Independently port assistant and commitments into hosted PostgreSQL with RLS/HTTPS tests | PARTIALLY_IMPLEMENTED | apps/hosted/migrations/001 and 002; tests/journal.test.mjs, commitments.test.mjs; TC-H-017 / 11 PGlite SQL tests; no hosted HTTP test | PostgreSQL journal/commitment/evidence SQL tested in PGlite. Missing sessions, reviewed financial draft/API and UI parity, managed connection, actual concurrency and HTTPS. Access plus implementation gates in section 10; P1 public demo. |
| FR-024 | UI never shows send status for unsent contact; state includes `DRAFT_NOT_SENT` | IMPLEMENTED_AND_TESTED | apps/api/assistant.py and MerchantAssistant.tsx; TC-H-018 / test_hyderabad_http.py; fresh browser acceptance passed | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-025 | Reject duplicative/stale commitment updates with merchant-scoped idempotency and versions | IMPLEMENTED_AND_TESTED | apps/api/commitments.py; TC-H-019 / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-026 | Distinguish intentionally missing observations from recorded zero; explanations do not claim sales or churn | IMPLEMENTED_AND_TESTED | apps/api/analytics.py and assistant.py; TC-H-020 / test_observations_http.py and test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-027 | Instrument redacted AI result codes, input/output hashes, tokens/cost (if actual) without raw audio/PII | IMPLEMENTED_NOT_FULLY_TESTED | apps/api/assistant.py; new provider telemetry in hyd_provider.py; TC-H-021 / test_eval_activity_definition_and_positive_balances | Hashes/result codes and new redacted usage/latency receipts tested with fake transports. Live tokens, actual cost and production telemetry unavailable; finite provider approval needed. P2 staging. |
| FR-028 | No model output triggers `ledger/drafts/*/confirm`, reversals, or external message delivery | IMPLEMENTED_AND_TESTED | apps/api/assistant.py and hyd_provider.py; TC-H-022 / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-HV3-01 | Trigger generated auditable create | IMPLEMENTED_AND_TESTED | apps/api/commitments.py; TST-HV3-01/02 / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-HV3-02 | Exact-version update and terminal lock | IMPLEMENTED_AND_TESTED | apps/api/commitments.py; TST-HV3-02 / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-HV3-03 | Due status from current ledger and explicit date | IMPLEMENTED_AND_TESTED | apps/api/hyd_evidence.py; TST-HV3-06 / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-HV3-04 | Fresh-credit after commitment forces review | IMPLEMENTED_AND_TESTED | apps/api/hyd_evidence.py; TST-HV3-07 / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-HV3-05 | Model cannot author financial amounts/dates | IMPLEMENTED_AND_TESTED | apps/api/assistant.py and hyd_provider.py; TST-HV3-09 / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-HV3-06 | No outbound customer messaging | IMPLEMENTED_AND_TESTED | apps/api/assistant.py and MerchantAssistant.tsx; TST-HV3-13 / test_hyderabad_http.py; hyderabad.spec.ts passed | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-HV3-07 | Response loss does not duplicate event | IMPLEMENTED_AND_TESTED | apps/api/commitments.py; TST-HV3-04 / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-HV3-08 | Hosted isolated parity before promotion | PARTIALLY_IMPLEMENTED | apps/hosted/migrations/001 and 002; tests/journal.test.mjs, commitments.test.mjs; TST-HV3-15 / 11 PGlite SQL tests; no hosted HTTP test | See FR-023. New PostgreSQL RLS is tested in-process; public HTTP sessions and real PostgreSQL concurrency are not. P1 hosted acceptance. |
| FR-HV3-09 | Unverified live language disabled | IMPLEMENTED_AND_TESTED | apps/api/voice.py; TST-HV3-12 / voice HTTP tests | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-HV3-10 | Canonical project branding for Hyderabad | IMPLEMENTED_AND_TESTED | apps/web/src/MerchantAssistant.tsx; TST-HV3-BRAND / Vite build, hyderabad.spec.ts passed | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-HV3-11 | HANDLED administrative state is not a payment | IMPLEMENTED_AND_TESTED | apps/api/migrations/008_hyd_commitments.sql; TST-HV3-HANDLED / test_commitment_migration.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-HV3-12 | Commitment history/customer cross-identity FK | PARTIALLY_IMPLEMENTED | apps/api/migrations/008_hyd_commitments.sql; TST-HV3-COMPOSITE / test_commitment_migration.py | Local 008 preserves snapshot identity but lacks the exact parent/customer composite FK required by this design. New PostgreSQL migration has that FK and rejection tests. Original SQLite EV-063/064 remain open; additive local migration would require separate review. P1 contract hardening. |
| FR-HV3-13 | Official event and pitch truth | DEFERRED_CONDITIONAL | apps/web/e2e/hyderabad.spec.ts; TST-HV3-EVENT / Playwright readiness | Organizer deadlines, eligibility and final submitted pitch were not verified. Requires organizer evidence and final claim review; P0 event/pitch business gate, outside technical demo acceptance. |
| FR-HV3-14 | No fabrication of all-new code origin | IMPLEMENTED_AND_TESTED | apps/web/src/MerchantAssistant.tsx; TST-HV3-PROVENANCE / Vite build, hyderabad.spec.ts passed | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-HV3-15 | Evidence in session scope | IMPLEMENTED_AND_TESTED | apps/api/assistant.py; TST-HV3-TENANT / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-HV3-16 | No stale saved copy draft after ledger change | IMPLEMENTED_AND_TESTED | apps/api/assistant.py and MerchantAssistant.tsx; TST-HV3-STALE / test_hyderabad_http.py; hyderabad.spec.ts passed | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-HV3-17 | Invalid calendar/IST boundary | IMPLEMENTED_AND_TESTED | apps/api/commitments.py; TST-HV3-DATE / test_hyderabad_http.py | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-HV3-18 | Bound inference quotas and no retries | IMPLEMENTED_AND_TESTED | apps/api/hyd_provider.py; TST-HV3-QUOTA / MockTransport tests | No unresolved local P0 contract. Fresh API/DB and compiled Edge acceptance supersede the old browser-blocked rows. Hosted/live promotion remains separate. |
| FR-HV3-19 | PPT claims review and event eligibility | DEFERRED_CONDITIONAL | apps/web/e2e/hyderabad.spec.ts; TST-HV3-SLIDES / Playwright readiness | Same organizer and final-pitch dependency as FR-HV3-13. No new eligibility claim or deck generated; P0 event/pitch. |

All 11 Hyderabad API operations (`API-HV3-01` through `API-HV3-11`) remain IMPLEMENTED_AND_TESTED in the local service; actual OpenAPI/schema/error and route tests cover them. P0-WEB-HTTP and P0-WEB-DEVICE are IMPLEMENTED_AND_TESTED for actual loopback HTTP and Edge viewport/keyboard checks; they do not certify physical speech hardware.

| Nonfunctional V3 ID | Status | Evidence and exact unresolved limit / priority |
| --- | --- | --- |
| NFR-001, NFR-004, NFR-008, NFR-OBS-001 | IMPLEMENTED_AND_TESTED | Local atomic finance, integer paise, audit and correlation tests; no unresolved P0 local finance contract. |
| NFR-002, NFR-SEC-001 | IMPLEMENTED_AND_TESTED | Local merchant-scoped negative API/DB tests. Hosted browser-session isolation remains NOT_IMPLEMENTED under FR-023; P1. |
| NFR-003 | IMPLEMENTED_AND_TESTED | Stream byte/duration/format validation and invalid audio tests. Exact provider protocols tested without live calls; P0 local. |
| NFR-005, NFR-A11Y-001 | IMPLEMENTED_NOT_FULLY_TESTED | Actual Edge keyboard, focus, labels and 390px checks passed. Manual screen-reader/assistive-technology audit absent; P2 accessibility. |
| NFR-006, NFR-PERF-001, NFR-PERF-002 | IMPLEMENTED_NOT_FULLY_TESTED | Working routes and browser durations observed; no specified p95 sample, 1,000-record load test or venue ASR latency measurement. P2 benchmark; live latency needs finite authorization. |
| NFR-007, NFR-RES-001 | IMPLEMENTED_AND_TESTED | Provider outage/timeout, typed fallback, stale response and no-financial-write tests passed; P0 offline reliability. |
| NFR-009 | IMPLEMENTED_NOT_FULLY_TESTED | Local cancellation/session cleanup/no-default-audio-storage tests passed. No current provider retention-policy/live-account witness; P2/P3 privacy. |
| NFR-010, NFR-011 | IMPLEMENTED_AND_TESTED | Dependency injection, clean locked install and isolated synthetic seed/restart passed; P0 portability. |
| NFR-012 | PARTIALLY_IMPLEMENTED | Local corruption preservation, isolated fresh startup and restart tested. Managed encrypted backup/restore/RPO/RTO absent; P3 pilot gate. |
| NFR-COR-001 | IMPLEMENTED_NOT_FULLY_TESTED | 10 simultaneous same-draft local attempts and conflicting repayments tested; literal 100-attempt target and real PostgreSQL multi-connection test not run. P1/P2 concurrency. |
| NFR-COR-002 | IMPLEMENTED_AND_TESTED | Grounded numeric rendering, model-schema rejection and stale evidence refresh tested. Applies only to recorded synthetic facts; P0. |
| NFR-PRIV-001 | PARTIALLY_IMPLEMENTED | Local non-synthetic mode is rejected. No public service exists to exercise the public-mode guarantee; preflight refuses hosting. P1 hosted gate. |
| DEP-001, DEP-003, DEP-004 | IMPLEMENTED_NOT_FULLY_TESTED | Speech adapters and browser controls exist; historical English-only receipts are separate. New authorized language and physical device evaluation needed; P2. |
| DEP-002 | NOT_IMPLEMENTED | No Sarvam chat/extraction adapter; current deterministic parser and separately bounded optional OpenAI adapter fill the demo role. A Sarvam adapter would need schema tests and finite authorization; conditional P2. |
| DEP-005 | BLOCKED_BY_AUTHORIZATION | No approved Paytm access; requirements and distinct integration goals are in section 12. P3 official integration. |
| DEP-006 | DEFERRED_CONDITIONAL | Outbound WhatsApp/SMS intentionally absent. Requires separate product/privacy/provider approval; not part of current release. |

Production-only identity/onboarding, RBAC/revocation, real-data consent/purpose, export/deletion, managed retention, alerting and incident/backup operations are NOT_IMPLEMENTED. They are P3 pilot prerequisites, with exact evidence/dependencies in sections 13–16. Historical V1 export/consent language was not silently treated as implemented by V3 seeding or real-mode rejection. Architecture governance, ownership, performance/capacity targets, advanced AI, payment rails and partner placement remain design/conditional beyond the tested subset; passing the document verifier is not runtime acceptance.

The six original design-evaluation cases remain visible as NOT_RUN: EV-059 (hosted promotion/RLS), EV-063 (same-merchant mismatched customer event), EV-064 (cross-merchant event), EV-076 (event deadline truth), EV-077 (authorship/pitch truth), EV-079 (missing hosted URL). New PostgreSQL composite-FK tests exercise related invariants on a different engine; they do not retroactively close the frozen SQLite evaluation register. Latest development closeout records 74 PASS, 0 BLOCKED, 6 NOT_RUN; the immutable exported candidate retains its earlier register, 73 PASS, 1 BLOCKED, 6 NOT_RUN. EV-075 branding was subsequently accepted with actual browser screenshots. Both records are preserved, not conflated.

## 9. Verified GitHub repository URL, branch, SHA and tree

| Item | Independently verified value |
| --- | --- |
| Repository | https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd |
| Visibility / publication branch | Public / `main` |
| Published and browser-tested commit | `03d8192b989ae9d1da212f318ff172a919043830` |
| Published tree | `ad842744a605517da3f4c63c9905ef781e312002` |
| Manifest blob | `827106ba089b8c06e2ce057ce989d63f2f73b0be` |
| Manifest provenance / files | Canonical source `1847ac081dcf6d2c611831c3e51336e1516bbe03`; 167 file hashes |
| Verification | Guarded normal push into empty remote; subsequent ls-remote/fetch, independent GitHub connector, anonymous HTTPS source reads and unauthenticated GitHub branch API all matched |
| Beyond-release branch | `feat/synthetic-staging-foundations`; tested implementation commit `1438c4a726909ce5aff858dac3b7368efd23e5b3`, tree `79c1483b82cbd691ae3dca4826d75f2f58dd6583`. This report is a subsequent documentation-only commit on that branch. |

No force push, history rewrite, original-repository write or backup modification was used. `main` remains the exact tested one-root sanitized snapshot. This report and staging work belong on the separate branch, not on the frozen release.

## 10. Actual public demo URL and verification status

**No public interactive demo URL exists.** GitHub source access is verified; it is not an interactive deployment.

Vercel `whoami` returned an invalid-token error. The maintainer subsequently chose to handle Vercel authorization personally. No login loop, cloud resource creation or deployment was attempted afterward. No approved managed PostgreSQL connection was supplied to the new checkout. Plugin discovery found Supabase and Neon integrations available but not connected; Supabase was suggested as the smallest relevant connection. No project was created or queried, and more options may exist in the plugin directory.

Missing access is only part of the blocker: hosted expiring isolated sessions, reviewed draft/confirmation API parity, bounded HTTP/security controls, frontend integration and actual multi-connection/HTTPS acceptance still need implementation. Logging in or deploying static React alone will not satisfy this gate. `apps/hosted/release-gate.json` enumerates those unresolved checks; `npm --prefix apps/hosted run preflight` deliberately exits nonzero. Its Vercel build command invokes that guard. No public API is exposed by the staging groundwork.

## 11. Live AI and speech integration status

Normal assistant behavior is deterministic English. The adapter and fake transports are tested, but no live model key/finite approval was configured or consumed for this work. Additional providers require separately implemented and tested adapters; arbitrary endpoints are not accepted. The configured model ID must match its private approval. The current default is retained from the existing adapter; verify current account availability before approving any call. Official documentation currently marks that model family deprecated.

Historical 31 October evidence records two authorized English STT calls and one TTS call; those approvals are consumed and cannot be reused. Their private receipts remain in the historical project. They do not verify Hyderabad venue hardware, general accuracy, Hindi or Telugu. All live speech flags and locale allowlists remain disabled. English offline capture/review and typed fallback are tested; Hindi/Telugu have typed guidance and negative gates, not verified live support.

Proposed future live test, **not authorized or executed**: two synthetic read-only English questions, each with a fixed request ID, one attempt, at most 400 output tokens and the adapter's bounded input. At the currently documented gpt-4.1-mini prices ($0.40/M input, $1.60/M output), reserving 16,000 input tokens plus 400 output tokens per request estimates $0.00704/request, $0.01408 for two, before tax/currency changes. This is a conservative estimate, not a provider-enforced billing cap. Confirm current prices, credits, available model and capped/disabled recharge before separate approval. Record date, provider/model, outcome, latency, reported usage, billing cost if available and final fallback mode. Preserve every attempt receipt. A single test does not establish production readiness.

Official references: [model capabilities/pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [Chat Completions request and usage fields](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).

## 12. Official Paytm integration and approval status

| Goal | Official public interface and current conclusion | Required approval/evidence |
| --- | --- | --- |
| A. Payment Gateway staging | Initiate Transaction → hosted checkout → signed callback → server-to-server Transaction Status. No staging transport is implemented. | Assigned test MID, Merchant Key, website name, permitted callback/webhook URLs and explicit synthetic staging-test authorization. Keep keys backend-only and use official checksum library. |
| B. Merchant reconciliation | Public Settlement API describes transaction-level settled sales/refunds/chargebacks and is production-only, with date-window limits. This is not a general merchant-ledger feed. | Permission for the specific merchant/MID, enabled product and account-specific credentials/agreement. No authorized access exists. |
| C. Paytm for Business / partner / embedded placement | Mini App documentation describes a distinct platform flow; it does not establish approval to appear inside Paytm for Business. No broadly applicable business-app listing permission was established. | Obtain written partner/platform approval, current onboarding route and supported scopes directly from Paytm. PG keys do not grant placement or merchant-data access. |
| D. Production processing | Not implemented or enabled. | Official onboarding/activation, eligible merchant, production credentials, security/operations checks and separate authorization for charges/transfers. |

For a future approved adapter, verify official signatures, then independently query authoritative status. Match MID, order, transaction ID, INR amount and currency to server-owned expected records; distinguish PENDING, FAILED, SUCCESS and reversals. Deduplicate signed events and posting effects; test replays, out-of-order delivery, wrong amount/merchant and network uncertainty. A callback must not directly reduce receivables. Retain confirmed gateway evidence separately and require reviewed reconciliation before any auditable ledger effect.

Official sources checked on 13 November 2026: [Transaction Status API](https://www.paytmpayments.com/docs/api/v3/transaction-status-api/), [callback/webhook behavior](https://www.paytmpayments.com/docs/callback-and-webhook), [payment response fields](https://www.paytmpayments.com/docs/payment-status), [Settlement API](https://www.paytmpayments.com/docs/api/settlement-api), [Mini Apps payment flow](https://business.paytm.com/docs/miniapps/payment-flow). Public examples currently show multiple gateway-host variants; confirm the assigned staging base URL against current account-specific documentation/support before configuring transport. No undocumented merchant API was invented.

## 13. Production-readiness gap assessment

| Area | Present evidence | Missing implementation / acceptance | Priority / stage |
| --- | --- | --- | --- |
| Identity | Trusted local synthetic session; API tenant-negative tests | Real merchant auth/onboarding, role policy, revocation, expiring hosted sessions and browser isolation | P1 hosted sessions; P3 pilot identity |
| Persistence | SQLite transactions/migrations and isolated PostgreSQL/RLS routines | Managed DB provisioning/access, reviewed finance/API parity, connection pooling, tested migration rollout and multi-connection concurrency | P1 public demo |
| Transport/security | Local origin/host/CSP controls, streamed input bounds, per-process quotas | HTTPS host validation, distributed rate limits, CSRF/session design, bounded hosted API, least-privilege grants verified on real host | P1 public demo |
| Operations | Offline launch/fallback, source checks, dependency audits | Monitoring, alerting, incident owner, operational rollback, encrypted managed backups and measured restore/RPO/RTO | P3 pilot |
| Privacy | Synthetic-only runtime, private audio/secret exclusions | Consented real-data purpose, retention schedule, export/deletion, lawful basis and qualified privacy/security review | P3 before real data |
| AI/voice | Deterministic facts, schemas, finite approval attempts and local mocks | Approved live model quality/cost trials, English hardware witness, individually reviewed Hindi/Telugu samples and translations | P2 staging |
| Payments | No active transport or financial side effects | Official authorization, signed staging adapter and adverse callback tests; independent reconciliation policy | P3 Paytm staging |
| Product/accessibility | Compiled phone/desktop, focus, keyboard, errors and stale-state checks | Manual assistive-technology review, real usability sample, supported-language UI review and consented pilot | P2/P3 |

Real merchant data remains prohibited. Synthetic-only defensive groundwork is not a substitute for authentication, consent, operational recovery or a security review. No legal-compliance certification is claimed.

## 14. API key and environment-variable setup instructions

For the local venue demo, no keys are required. In a private checkout, copy `.env.example` to ignored `.env`; do not put secret values into chat, source, reports or frontend `VITE_*` variables. Defaults: `DEMO_MODE=true`, `VOICE_PROVIDER=mock`, `HYDERABAD_ASSISTANT_PROVIDER=deterministic`, live assistant/STT/TTS switches false and speech locale lists empty.

For a separately approved local inference trial only, configure backend `HYDERABAD_ASSISTANT_API_KEY`, select `HYDERABAD_ASSISTANT_PROVIDER=openai`, set `HYDERABAD_ASSISTANT_MODEL` to the exact approved model, and prepare ignored `private/hyd-assistant-approvals/<approval-id>.json`. Required fields are approval_id, exact merchant_id/model, operator_confirmed=true, credits_checked=true, auto_recharge_status=CAPPED or DISABLED, timezone-aware expires_at, max_calls between 1 and 5, and unique approved_request_ids (8–128 permitted characters). Set the matching approval ID and enable switch only after explicit finite authorization. Never create a true approval on the human's behalf or delete an attempt to retry. These filesystem receipts are local-only; a hosted adapter needs a transactional durable quota/receipt store.

Speech additionally needs backend `SARVAM_API_KEY`, the relevant verified STT/TTS switch and individually evaluated locale allowlists. Setting them does not authorize a paid request; keep them disabled until separate approval and actual language/hardware evidence exist.

Future hosting secret names reserved by preflight: `HOSTED_DATABASE_URL`, `HOSTED_DATABASE_CA`, `HOSTED_SESSION_SECRET`, `HOSTED_PUBLIC_ORIGIN`. These are scaffolding names, not a connected runtime. Use a dedicated non-owner runtime role without BYPASSRLS, TLS certificate validation and least-privilege grants; keep a separate migration credential. Use managed secret settings, not repository files. [Supabase connection/pooler guidance](https://supabase.com/docs/guides/database/connecting-to-postgres) distinguishes transaction pooling for serverless from direct migration connections. No Supabase service-role key belongs in the browser.

No Paytm secret is required now. If staging integration is explicitly approved later, provision the assigned test MID/key/website and callback origin in a backend secret manager. Production credentials require a separate release gate.

## 15. Deployment and rollback commands

Use a new local folder for the frozen venue release:

```powershell
git clone --branch main https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd.git Vishwas-Khata-AI-Hyd-venue
Set-Location Vishwas-Khata-AI-Hyd-venue
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
./scripts/setup.ps1 -DependenciesOnly
./scripts/demo_hyd.ps1
# Open http://127.0.0.1:8000/ in Edge. Stop the owned server with Ctrl+C.
```

Compare the two identities to section 9 before launching. Each Hyderabad launcher uses a new synthetic `.tmp` database; it must never reset an existing venue database. The frozen checkout still has its historical setup script: if its tool audit reports old pip, update only its venv with `./.venv/Scripts/python.exe -m pip install --upgrade pip==26.3`, then rerun the audit. The staging branch has that bootstrap pinned already.

On the separate staging branch:

```powershell
./scripts/setup.ps1 -DependenciesOnly
./scripts/test.ps1 -Audit
./.venv/Scripts/python.exe scripts/smoke_local_http.py
./.venv/Scripts/python.exe scripts/verify_release.py
npm --prefix apps/hosted run preflight  # Expected refusal while release gate is closed
```

Offline fallback: `./.venv/Scripts/python.exe scripts/demo_hyd_offline.py`. Two-minute presentation: confirm ₹500 credit and ₹200 repayment; review the ₹300 promise; ask why the customer is due; review Draft not sent; add ₹100 repayment and reject the stale preview; refresh to ₹200; add ₹500 credit and show ₹700 / REVIEW_REQUIRED.

Public deployment commands are intentionally gated. After hosted implementation and local acceptance, the maintainer's `vercel login` authorizes the CLI; link only the intended project and configure private staging secrets. Use a verified PostgreSQL migration connection with the dedicated non-BYPASSRLS owner, then a reviewed preview deployment. Do not bypass `apps/hosted` preflight or expose the loopback service. [Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js) supports a future server-side function API; a static frontend alone supplies none of the missing backend.

No cloud revision exists, so a cloud rollback command cannot yet target a verified deployment. The release rollback is to stop the owned experimental server and launch the frozen commit from a separate clone, preserving both old databases. Before any future cloud promotion, record an actual previous deployment ID and tested provider-specific rollback command; never use Git force-push, destructive journal rollback or an untested migration downgrade.

## 16. Exact user actions still requiring authorization

1. Vercel: maintainer handles login/account authorization personally, as requested. No token is needed in chat. After it succeeds, identify the intended project. Login alone does not clear the missing hosted implementation gates.
2. Hosted database: identify an existing approved free synthetic staging PostgreSQL/Supabase project and configure a private least-privilege connection/CA through the approved backend secret mechanism. Explicitly approve any resource that would cost money; no paid resource was created.
3. Live AI/speech: if desired, separately authorize provider/model or language, exact samples/request IDs, maximum attempts and cost, with verified credits and capped/disabled recharge. No remaining historical approval can be reused.
4. Physical venue: witness the actual microphone and audible playback, or present the tested typed/deterministic path. No request to recreate missing private audio is needed for the typed release.
5. Paytm: obtain written permission for the exact integration goal and test credentials through official onboarding before any transport test. Production charges/transfers need additional authorization.
6. Event/pitch: verify organizer deadlines, reuse rules, eligibility and final submitted claims. A passing technical demo does not establish event eligibility.

## 17. Priority-based remaining roadmap

P0 completed: publish and independently verify the exact accepted snapshot; preserve the launch/fallback and private evidence. Keep that release frozen. Review this report for current limits instead of relying on historical blocked-browser paragraphs.

P1: finish server-derived isolated hosted sessions and reviewed financial-draft API parity, bounded read-only assistant/API projections, quotas, request limits and frontend compatibility. Verify grants/migrations on authorized managed PostgreSQL, test multiple real connections, then preview HTTPS, full Ramesh browser flow, independent second-browser isolation, repeated/concurrent requests, logs, expiry and recovery. Publish a URL only after those gates pass.

P2: separately approved bounded live English model/voice trial, then individually consented Hindi/Telugu evaluations covering rupee numbers, ambiguous names, corrections, timeout, empty/invalid/cancelled media and session changes. Keep all unverified languages disabled. Complete manual accessibility and measured synthetic usability checks.

P3: official Paytm staging permissions and isolated integration; real identity/onboarding, privacy/retention, encrypted backups and restore, incident handling, monitoring and audited consent before a small authorized pilot. Progress from internal synthetic testing → restricted staging → consented pilot → broader release only with operational evidence.

## 18. Final release decision and limitations

Ship the published frozen Hyderabad application as **READY_WITH_LIMITATIONS** for a local synthetic demonstration. The repeatable signed ledger, deterministic English assistant and unsent draft journey have actual browser acceptance. The staging branch adds tested foundations and remains separate from that release.

Do not describe a public demo as live, AI/voice languages as generally verified, Paytm as integrated, or the product as production/pilot ready. Public deployment, approved live trials, physical hardware, official integration and real-merchant operations remain separate acceptance stages.
