# Independent Document Audit — Project Vishwas Khata Version 1 → Version 2

**Audit date:** 2026-10-27 IST. **Auditor:** AI-assisted review; no independent human engineering, security, regulatory or Paytm signoff. **Sources audited:** 22-page Hyderabad concept PDF; two Vishwas project images; entire 49-section documentation prompt (0–48); V1 master specification, SQL, OpenAPI, synthetic JSON, ADRs, seven Mermaid diagrams, 27 proposed acceptance cases and validation script. **New output:** V2 master, expanded OpenAPI, additive hardening SQL, runnable reference oracle/tests, ADRs, issue closures and verification manifest.

## Answer to the user's question: Was V1 fully complete?

**NO.** All 49 top-level headings existed, but the content did not reach the granularity, independent verification and contract consistency needed to serve as a final build source. V1 was a credible **proposed architecture**, not the complete implemented architecture required by the generic source-of-truth template. That distinction cannot be made true merely by adding words: no deployed Vishwas source repo, actual API handlers, production auth, field data, current vendor credential, Paytm sandbox access, merchant interviews or independent audit has been supplied.

## Audit methodology

1. Compared top-level numbered template headings 0–48 against V1 and V2.
2. Inspected original 22-page Hyderabad feature/workflow definitions, example transactions, scope tiers, data payloads, tech stack, roadmap and risks. Mapped all distinct original feature names to `P0/P1/FUTURE` in Appendix M.
3. Parsed V1 API/DDL and independently executed original V1 static validator (49 headings, seven diagrams, 15 paths, simple ₹500–₹200 fixture). Identified what validator did **not** cover.
4. Wrote more precise financial invariants at application and SQL boundaries, tested reference posting, replay, sign/correction and tenant checks.
5. Added IST boundary treatment and tested an example where UTC and merchant-local dates disagree.
6. Expanded OpenAPI surface for data-entry flows required by the product narrative and added schema/test evidence.
7. Checked sections for honest provenance: actual vs hypothetical results, absence of real Paytm API credentials and lending/fraud status.
8. Left open work expressly marked `TBD/NOT RUN` rather than inventing implementations.

## Material defects, not cosmetic issues

| Finding | V1 problem | V2 treatment | Remaining reality |
|---|---|---|---|
| F-01, High | `schema/001_initial.sql` permitted direct UPDATE/DELETE on journal without DB trigger | add `002_integrity_hardening.sql` immutable journal triggers | SQLite controls tested only, API not built |
| F-02, High | overpayment and reversal sign/tenant checks primarily delegated to application | add SQL insert guards and reference oracle tests | browser/API concurrency not tested |
| F-03, High | V1 validator grouped example sales with SQLite `date(observed_at)` in UTC | define inclusive/exclusive IST→UTC business-day windows and boundary tests | deployed analytics code absent |
| F-04, Medium | no standard API for creating/searching customers or entering explicit sales/visits | add 5 API paths / six operations (20 paths, 21 operations total) | proposed, no HTTP server yet |
| F-05, High | original Hyderabad vision's features not comprehensively mapped individually | add 17-row original-idea lineage matrix in Appendix M | deferred consumer ideas intentionally not part of Track 1 |
| F-06, Medium | non-goal loan eligibility wording could be misread as financial readiness advice | pin "recordkeeping completeness, not underwriting" status/error text | lender pilot review needed if ever expanded |
| F-07, High | original V1 acceptance cases were all marked NOT RUN; basic validator checked only SQL arithmetic | runnable 16-case SQL/domain reference tests + 50-case app acceptance matrix | most app tests remain NOT RUN |
| F-08, Medium | money and report uncertainty behavior underspecified at observation boundaries | facts, null/unknown semantics, completeness and event source IDs | data-collection workflow P1 |
| F-09, Medium | fixed future provider behavior can drift | vendor/model capability probe, config ports, version evidence | live credentials/model tests absent |
| F-10, High | local demo auth and publicly exposed app boundary needed clearer enforcement | nonloopback refusal and real-data release stop criteria | real auth not implemented |
| F-11, Medium | pricing/distribution and "merchant growth" mostly aspirational | explicit hypotheses, formulas, merchant interview/ROI metrics | no actual pilots or unit economics |
| F-12, Medium | cancellation/retry/client duplicate outcomes needed deterministic state contracts | transition matrix, idempotency priority, no-success-before-confirm | app logic must be written |
| F-13, Medium | code/repo/deployment instructions intentionally proposed but not runnable | milestone gates, target repository layout, provision checklist | full app source repository absent |
| F-14, Medium | original source had overly specific consumer fraud rule examples | record as historical unvalidated heuristics; FUTURE consumer lane | detection accuracy not claimed |
| F-15, Medium | backup/DR/incident response lacked actionable local procedure | migration/restore/operator runbooks and evidence gates | RPO/RTO remain untested targets |
| F-16, Medium | UI accessibility and error/fallback behavior scattered | explicit screens, states, localization and review contracts | frontend absent |
| F-17, Low | V1 had broad claim of source of truth without final owners/sign-off | design precedence, review, explicit unapproved status | owner approval pending |
| F-18, Medium | source→requirements→API→tests mapping not machine-checkable end-to-end | traceability CSV and typed operation coverage check | future implementation links TBD |

**Audit verdict:** V2 is substantially more implementable and traceable, but cannot truthfully be called *the verified implemented system* or certify "everything has been built." It is a **Version 2 build blueprint/source-of-truth candidate** for the agreed Bengaluru MVP, with explicit open decisions and measurable gates.

**Expanded subsection accounting:** all **218 numbered template subheadings** are individually tracked in `verification/TEMPLATE_SUBSECTION_CROSSWALK.md`. A mapped design topic is not necessarily implemented, tested or production-relevant.

## Template-section coverage matrix (0–48)

Each row below is *document design coverage*, not proof of code. The generic template contains far more subheading prompts than can be evidenced for an unbuilt prototype. For conditional production topics, `FUTURE/TBD` is the correct explicit answer, not a fictional implementation.

| Template section | V1 assessment | V2 coverage / evidence |
|---|---|---|
| 0 Document governance | partial | change precedence, status/ownership, freeze/change classification |
| 1 Executive overview | present | 12 invariant one-minute model, explicit source of authority |
| 2 Problem/goals/scope | partial | persona/JTBD, experiments, metric dictionary, no-goals |
| 3 Stakeholders/drivers | present | ranked drivers and enforceable architecture principles |
| 4 Requirements/traceability | partial | 15 expanded FRs, NFR thresholds, test mapping |
| 5 Context/trust | present | system vs Paytm boundaries and permission matrix |
| 6 Solution strategy | present | alternatives, reasons and dependency version rules |
| 7 High-level architecture | present | deploy units, startup chain and failure isolation |
| 8 Components | partial | exact port inputs/outputs/guards of eight components |
| 9 Runtime | partial | draft state transitions, concurrent replay, date semantics |
| 10 API | partial | 20 paths/21 operations, errors, additions for observations/customers |
| 11 Events | conditional | audit semantics, future outbox boundary |
| 12 Data | partial | cash/credit/visit separation, formulas, timezone, triggers |
| 13 Security | partial | 14-threat register, guard matrix, explicitly missing controls |
| 14 Privacy | conditional | synthetic-only, data minimization and live-data gate |
| 15 Infrastructure/deployment | partial | environment posture and release checklist |
| 16 Scalability/performance | partial | notional load, measurement and cost formula |
| 17 Reliability | partial | 12 failure modes, retry/timeout candidates |
| 18 Backup/DR | partial | exact local demo recovery, RPO/RTO caveat |
| 19 Observability | present | structured log fields and metrics |
| 20 SLO | partial | exact SLIs vs unmeasured SLA abstention |
| 21 Testing | partial | expanded test pyramid, 50-case acceptance matrix |
| 22 CI/CD | present | future pipeline gates, release evidence policy |
| 23 Operations | partial | seven concrete runbooks/severity, not prod-validated |
| 24 Scheduled processing | conditional | none P0, future triggers explicitly bounded |
| 25 External integrations | partial | model probes and no-Paytm-access truth table |
| 26 Config | partial | precise env names and startup refusal rules |
| 27 Local development | partial | M0–M5 milestones and realistic stopping rules |
| 28 Repo architecture | present | target project layout and dependency direction |
| 29 ADR | present | ADR-009..016 in addition to V1 eight |
| 30 Risks/debt | partial | 12 risks, release gates and residual-risk honesty |
| 31 Costs/capacity | partial | margin unit economics and willingness-to-pay research |
| 32 Migration | conditional | v1→v2 hardening; future PostgreSQL parity |
| 33 Decommissioning | conditional | synthetic exit / production legal-retention TBD |
| 34 AI/ML | partial | typed prompts, abstention, live evaluation protocol |
| 35 Multi-tenant | conditional | merchant scope and IDOR negative cases |
| 36 Frontend | partial | screen states, regional UX, accessibility |
| 37 Mobile | conditional | browser only; native N/A + future gate |
| 38 Data platform | conditional | on-demand SQL, warehouse N/A |
| 39 Compliance | conditional | legal applicability TBD; no certification |
| 40 Troubleshooting | partial | actionable decision trees |
| 41 Readiness | partial | checklists with actual evidence gates |
| 42 Quality review | partial | strengths and falsifiable gaps table |
| 43 Open questions | present | 12 question/owner/closure gates |
| 44 Decision summary | present | ADR-001..016 summary |
| 45 Risk summary | present | residual risks and live-data blockers |
| 46 Debt summary | present | TD-101..110 with exit triggers |
| 47 References | present | explicit origin vs outside research vs inferred design |
| 48 Appendices | partial | 17-row feature lineage, seven-slide pitch map, verification index |

## Specific things deliberately NOT "covered as built"

- Actual production app: no real frontend/backend source is implemented here.
- Current working Sarvam integration: no authenticated call/probe or bill was supplied.
- Paytm merchant API, transaction data, fraud risk and bank settlement: no authorized contract.
- Fraud-score precision, recall, false-positive rate: no labeled dataset.
- Loan/insurance regulated finance journeys: not part of Track 1.
- Consumer Vishwas Pay: retained as separate future product, not merged into the merchant MVP.
- Privacy compliance, independent penetration test, actual data retention controls: untested.
- Real merchants, real-world effectiveness, subscription conversion and revenue: no interviews/pilot data.
- Cloud availability, backup restore, user-perceived latency: targets only.

## How to use this audit

Treat V2 as an explicit build contract **after the owner accepts its scope/ADRs**. The acceptance matrix describes how to graduate individual features from `PLANNED` to `TESTED`. When implementation differs, record an ADR and update contracts and tests; do not retroactively declare the prose correct by assertion. Stage 1 submission may explain *what we propose to build*, not pretend testing is done.
