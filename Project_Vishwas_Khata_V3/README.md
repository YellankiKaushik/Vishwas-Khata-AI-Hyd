# Project Vishwas Khata — Engineering Source of Truth Version 3.0.0

**Design approval status: PROPOSED.** No production implementation, vendor integration, user authentication or field pilot is claimed. This documentation package is intended to be the canonical **engineering build plan** for the Paytm Build for India AI Hackathon Bengaluru, **Track 1 — Merchant Growth AI**.

## Start here

1. [`verification/V2_TO_V3_AUDIT.md`](verification/V2_TO_V3_AUDIT.md): direct answer to whether V2 missed anything, including concrete gaps, tests and open evidence.
2. [`DEEP_TECHNICAL_ARCHITECTURE.md`](DEEP_TECHNICAL_ARCHITECTURE.md): 49 template sections plus the V3 normative Appendix R (complete proposed build blueprint).
3. [`adr/ADR-017-to-022.md`](adr/ADR-017-to-022.md): new architectural decisions (read after ADR-001–016).
4. [`contracts/openapi.yaml`](contracts/openapi.yaml): proposed API surface, 22 paths/23 operations; *not an implemented server*.
5. [`schema/`](schema/): apply SQLite migrations `001_initial.sql`, `002_integrity_hardening.sql`, `003_v3_contract_hardening.sql` in that order through a tracked migration runner.
6. [`reference/`](reference/): finance and observation **test-oracle** code; it is not a backend application.
7. [`evaluation/ACCEPTANCE_TESTS_V3.md`](evaluation/ACCEPTANCE_TESTS_V3.md): 70 specified application tests, **NOT RUN** until software exists.
8. [`verification/TRACEABILITY_MATRIX_V3.csv`](verification/TRACEABILITY_MATRIX_V3.csv): 25 FR design mappings to components, endpoints, storage and test IDs; no code implementation evidence.
9. [`verification/TEMPLATE_SUBSECTION_CROSSWALK.md`](verification/TEMPLATE_SUBSECTION_CROSSWALK.md): 218 numbered template prompts accounted for with truthful disposition and future evidence.
10. [`fixtures/demo_dataset.json`](fixtures/demo_dataset.json): synthetic-only customer, credit, recorded-sales and recorded-visit examples.

## Run internal reference checks

```bash
python verification/verify_v3.py
python -m unittest discover -s tests -v
```

**These commands validate the documentation/reference specification only.** They do not start React/FastAPI, call Sarvam, access Paytm accounts, test deployment security, or establish the product is ready for real merchant data. Check `verification/V3_STATIC_AUDIT_RESULTS.txt` for captured results.

## What to build first

Typed ledger draft → human confirmation → one immutable financial entry → correct receivable balance → deterministic facts → four-slot text briefing. That is P0. Sarvam input, voice playback, Hindi/Telugu and user-controlled suggestions are gated P1; consumer Vishwas Pay, fraud accuracy, AML graph and autonomous communication are future standalone work.

**Financial semantics:** Credit given increases receivable, repayment decreases it, recorded sales are explicitly *partial unverified observations*, a missing event does not mean no sale, and no observed visit does not prove a customer stopped visiting. Records are synthetic; no API or product may claim Paytm integration or lender underwriting. All money is represented as signed integer paise in persistence.

## Governance and source provenance

- Historical concept: user-provided 22-page Hyderabad original idea PDF + both Vishwas diagrams.
- Form template: user-provided `deep tech writing prompt(1).md` with 49 top-level sections / 218 numbered subtopics.
- The original source material is intentionally not bundled; the master document maps the idea lineage and keeps new design decisions distinguished from original material.
- V2 docs and prior V1 audit remain as history; **Appendix R, V3 ADRs, V3 OpenAPI and migration 003 control wherever old examples disagree**.
- Owner must approve scope and resolve open questions. Future changes require versioned docs/contracts/tests and an ADR for breaking finance or data-control semantics.
