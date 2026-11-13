# Vishwas-Khata-AI Hyderabad

**Team Tic Tac Tech · Paytm Build for India AI Hackathon, Hyderabad · Merchant Growth AI**

Small merchants need to know how much a customer still owes after several credits and repayments, and whether an earlier promise or follow-up still reflects the ledger. Vishwas-Khata-AI connects those decisions in one synthetic merchant workspace.

## Judge walkthrough

1. Select Ramesh. Review and confirm ₹500 credit and ₹200 repayment. The ledger shows ₹300 outstanding.
2. Save an expected repayment commitment and ask the assistant why Ramesh owes ₹300. The deterministic assistant explains the recorded balance using ledger evidence.
3. Review the follow-up draft. It stays `DRAFT_NOT_SENT`. Post a ₹100 repayment, then try the earlier draft again. The app rejects the stale draft and refreshes the balance to ₹200.
4. Confirm ₹500 new credit. The balance becomes ₹700 and the commitment shows `REVIEW_REQUIRED`. An exact retry returns the original receipt. A different hosted merchant session cannot access Ramesh’s records.

## Run the local demo

Use Windows PowerShell with Python 3.11+ and Node.js 24. From the repository root, install dependencies once, then launch.

```powershell
./scripts/setup.ps1 -DependenciesOnly
./scripts/demo_hyd.ps1
```

Open [the local demo](http://127.0.0.1:8000/). Each launch seeds its own synthetic SQLite database. The venue runbook covers the [walkthrough and offline fallback](docs/hyderabad/VENUE_RUNBOOK.md).

## Architecture and deployment

| Environment | Request path | Data |
| --- | --- | --- |
| Venue demo | React/Vite → FastAPI on loopback | Isolated SQLite journal |
| Restricted Vercel preview | React/Vite → same-origin `/v1/*` → Node.js 24 function | Dedicated PostgreSQL 17 with tenant-scoped sessions, RLS and immutable receipts |

The hosted API uses the same transaction and validation code in its disposable HTTPS acceptance server and the Vercel function. The [Vercel deployment instructions](apps/hosted/deployment/README.md) cover the repository root, protected Preview, database roles, private settings and verification.

## Evidence and scope

The frozen venue release has historical Windows browser acceptance. GitHub has recorded passing backend, V3, hosted unit and disposable PostgreSQL/HTTPS checks. The [project master report](PROJECT_MASTER_REPORT.md) records the current candidate, exact CI outcomes and release status. A public hosted URL has yet to be verified.

The demo uses fictional merchants and manually reviewed transactions. The assistant cannot post ledger entries or send messages. Live model calls, live Hindi/Telugu speech and real Paytm payments are outside this release. Paytm evidence is exercised through a synthetic contract.

Maintainer [@YellankiKaushik](https://github.com/YellankiKaushik). The Hyderabad entry builds on the earlier Vishwas-Khata codebase developed for the Bengaluru edition.
