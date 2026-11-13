# Vishwas-Khata-AI Hyderabad

A local synthetic merchant workspace for Team Tic Tac Tech's Merchant Growth AI demonstration. The existing signed SQLite journal powers repayment commitments, due-date evidence, grounded English questions and unsent follow-up drafts.

Repository maintainer: [@YellankiKaushik](https://github.com/YellankiKaushik)

Hackathon team: Tic Tac Tech

Vishwas-Khata-AI Hyderabad is Team Tic Tac Tech's project for the Hyderabad Edition of the Paytm Build for India AI Hackathon, Track 1 (Merchant Growth AI). It builds on the earlier Vishwas-Khata codebase developed for the Bengaluru edition.

## Launch the Hyderabad demo

From the repository root in Windows PowerShell, install dependencies once if needed. Then run the launcher and open the app.

```powershell
./scripts/setup.ps1 -DependenciesOnly
./scripts/demo_hyd.ps1
```

Each launch builds the React app, seeds a fresh isolated database and fixes the synthetic business date to 13 November 2026 IST. The demo uses typed input and deterministic answers. Type `http://127.0.0.1:8000/` in Edge. Stop the server with Ctrl+C.

| Document | Use |
| --- | --- |
| [Demo script](docs/hyderabad/DEMO_SCRIPT.md) | ₹500 credit, ₹200 repayment, ₹300 commitment, draft review, stale facts and new credit |
| [Venue runbook](docs/hyderabad/VENUE_RUNBOOK.md) | Launch, synthetic walkthrough, browser verification and fallback |
| [Test evidence](docs/hyderabad/TEST_EVIDENCE.md) | Commands, observed results and blocked checks |
| [Implementation status](docs/hyderabad/IMPLEMENTATION_STATUS.md) | Runtime contracts and safeguards |
| [Claims register](docs/hyderabad/CLAIMS_REGISTER.md) | Current demo wording and evidence limits |

The Hyderabad model adapter is opt-in and the demo launcher disables it. The offline fallback is `./.venv/Scripts/python.exe scripts/demo_hyd_offline.py`. Browser and real-server verification require an ordinary laptop terminal with loopback access. The app is an independent prototype using fictional data.
