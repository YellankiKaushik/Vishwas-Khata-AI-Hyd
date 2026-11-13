# Independent Final Document and Contract Audit — V2 → V3

**Date:** 2026-10-27 IST. **Scope:** original 22-page Hyderabad idea and two supplied concept diagrams; uploaded 49-section / 218-subsection architecture template; V2 35,193-word master, machine-readable OpenAPI, SQLite migrations, fixtures, ADRs, traceability, reference code and tests. **Result:** V2 did *not* fully meet the user's demand for an unambiguous final implementation source. V3 strengthens specific parts and labels unsatisfied real-world verification explicitly.

## Bottom-line audit decision

V2 was useful and structurally comprehensive, but **not final in the sense of complete or verified engineering specification**. V3 is the recommended **design baseline** for the Bengaluru *Track 1: Merchant Growth AI* project. It is not a built product, independently audited secure application, live vendor integration, production merchant platform, or substitute for real tests. Avoid treating completeness of a document template as proof of architecture correctness. It is appropriate to proceed to a **Stage 1 ideation pitch** based on V3; actual build acceptance must await implementation tests.

## Method and transparency correction

- Checked the original project family, feature names and original 22-page working plan; mapped the historical two-product strategy into Merchant Growth P0/P1 and separately marked consumer fraud ideas as FUTURE.
- Matched the original documentation template sections 0–48 and 218 numbered sub-prompts using an explicit disposition crosswalk. `MAPPED` is not the same as `IMPLEMENTED` or `TESTED`.
- Reran V2 validator and 16 reference tests: all passed. That fact does **not** contradict the findings below, because the old suite failed to assert several financial and observational invariants.
- Parsed the actual OpenAPI using PyYAML, checked parameter and operation identities, and compared endpoints with schema and domain behavior.
- Executed SQL migration chain and expanded reference suite with negative cases; performed clean SQLite integrity checks.
- Reviewed the latest available official Sarvam docs for speech-to-text parameters and TTS capability; **no authenticated vendor request** was run.
- **Important retracted preliminary suspicion:** duplicated `date` query parameter was **not** an actual V2 contract defect. It appeared twice because two overlapping display ranges printed the same line. Actual parsed V2 spec has one `date` parameter. V3's verifier checks parameter uniqueness to prevent future mistakes.

## Confirmed deficiencies and Version 3 response

| Finding | Severity | Verified V2 gap | V3 control/evidence | Still open |
|---|---|---|---|---|
| G-01 | CRITICAL | V2 SQL accepted money entry that referenced a draft but did not independently compare amount/customer/type to reviewed draft | `003_v3_contract_hardening.sql` trigger + negative reference test | deployed HTTP path not implemented |
| G-02 | HIGH | confirmed draft economic values could be updated after the fact | confirmed draft immutable, posting row must precede confirmed status, edited economic fields version-bumped | actual DB race test pending |
| G-03 | HIGH | sales/visit observations could be edited/deleted, rewriting business insight history | append-only events + owned voids, anti-join report | admin/real data retention plan pending |
| G-04 | HIGH | manual observation network retry had no explicit unique per-operation identity | `client_operation_id` in OpenAPI and DB; matching replay vs divergent conflict | actual HTTP handler pending |
| G-05 | HIGH | simple `OBSERVED`/sales sum might be misread as entire merchant revenue | `PARTIAL_UNVERIFIED`/`NO_DATA`; replace misleading V2 field name before API deployment | measured coverage impossible until integrated feed |
| G-06 | MEDIUM | partial current-day query might report synthetic future-hour events as already observed | reference `as_of_utc` filter and explicit rules | actual API implementation pending |
| G-07 | MEDIUM | visit gap rule not demonstrated as runnable source with void exclusion and per-day dedup | `observations_reference.py` + positive/sparse/duplicate tests | field validity of churn proxy unknown |
| G-08 | MEDIUM | amount bound enforced in app example, not always at SQL ingress | V3 insert cap for finance and sales rows | broader integer aggregate concurrency pending |
| G-09 | MEDIUM | V2 validator over-relied on section count and total word count | V3 contract uniqueness/path coverage, module/source and migration tests | actual code still missing |
| G-10 | MEDIUM | product narrative and technical source status could be confused | new V3 governing appendix R, status/claims boundary and architecture ADR-017–022 | human project owner approval pending |
| G-11 | MEDIUM | original proposal's risk scoring and finance claims could be mistaken for implemented Merchant Growth work | preserve as FUTURE; data/signal and evaluation prerequisites spelled out | separate future work |
| G-12 | MEDIUM | provider client `audio` versus vendor multipart `file` adapter behavior not explicit enough | provider mapping, model/live probe checklist and official source URL | vendor key/request/billing untested |
| G-13 | MEDIUM | no end-to-end app evidence for prior 50 acceptance cases | 20 additional cases T-051..070 with honest NOT RUN status and verified reference checks | all 70 application tests NOT RUN |
| G-14 | MEDIUM | missing evidence, customer identity and recorded visits need stronger uncertainty language | explicit source IDs, missingness semantics, homonym controls and limits on churn inference | field evidence pending |
| G-15 | MEDIUM | changes to financial/observation behavior lacked stable build tickets and precise stopping rules | V3 annex R.13, mapped tests/ADRs | tickets are proposed until code exists |

## Cross-source coverage judgement

**Original concept features:** The original 17 named Hyderabad source ideas are retained in the Version 3 master Appendix M, with P0/P1/FUTURE disposition. Consumer-facing Vishwas Pay, TrustLens/NaamCheck, credit-score explanation, ChainBreak graph AML, deepfake detection, and agentic orchestrator are not silently represented as implemented. Narrowing to Vishwas Khata for Track 1 is deliberate, not an omission. All future functionality requires new research and authorization.

**Template:** Sections 0 through 48 and all 218 numbered prompts are accounted for, but not all generic production components apply. Kubernetes, a multi-zone operational SLA, realtime event broker, cloud disaster recovery, lender API and fraud training pipeline are `N/A` for this local prototype or remain `TBD` for production. A master can be *complete as a design* without any such subsystem being implemented.

**Hackathon PPT:** Seven required categories remain Title, Problem, Solution, Tech Stack, USP, Impact and Business Model. Stage 1 is an ideation pitch. The detailed master is the implementation source; the PPT is a curated seven-section communication document, not a direct printout of 41,000+ engineering words.

**Professional diligence:** The following have NOT been performed: external code/security audit; authenticated Sarvam API call; Paytm account/API verification; real merchant onboarding; privacy legal review; real payment or loan decision; deployed HTTP test; measured accuracy, cost, performance, recovery or adoption. The existence of proposed values and reference-only tests does not supply that proof.

## Verification classification

| Evidence class | Meaning | V3 status |
|---|---|---|
| Documentation structural coverage | sections/subsection disposition, source lineage, named decisions | verified by scanner + manual inspection |
| Machine-readable design coherence | OpenAPI uniqueness/refs + migration load | verified by V3 checker |
| Executable reference domain semantics | synthetic SQLite/finance/observation functions | reference unit tests executed |
| Server implementation and E2E | real React/FastAPI components and cross-connection tests | NOT IMPLEMENTED / NOT RUN |
| Live voice/localization integration | authenticated Sarvam call and evaluated sample recordings | NOT RUN |
| Production/privacy/legal claims | real-data controls, vendor agreements, secure operations | NOT APPROVED |
| Commercial outcomes | customer research, willingness-to-pay, ROI, merchant adoption | NOT MEASURED |

## Signoff recommendation

**Approve Version 3 as a BUILD DESIGN BASELINE for the merchant-only MVP**, contingent on the project owner accepting scope and ADRs. Do **not** call it a finalized, tested product. The next work is an evidence-labeled seven-slide Stage 1 deck (deadline from the user's event listing is October 27 at 11:59 PM IST), then implement G0–G5/T-001..070 to replace planned statements with verified behavior. Do not postpone submission to achieve fictional technical completeness.
