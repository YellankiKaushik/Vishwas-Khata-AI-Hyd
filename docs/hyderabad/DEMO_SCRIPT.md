# Hyderabad demo walkthrough

Run from the repository root in PowerShell. Install dependencies once if they are missing.

```powershell
./scripts/setup.ps1 -DependenciesOnly
./scripts/demo_hyd.ps1
```

Type `http://127.0.0.1:8000/` in Edge. The launcher makes a fresh synthetic database for each run and fixes the business date to 13 November 2026 IST.

| Time | Operator action | What to show |
| --- | --- | --- |
| 0:00–0:35 | Open **Record transaction**. Select Ramesh by ID `cus_ramesh`, enter **Credit given**, ₹500, review and confirm. Repeat with **Repayment received**, ₹200. | The confirmation and journal show ₹300 outstanding. |
| 0:35–1:00 | Open **Merchant Assistant**. Select Ramesh. Review a new commitment for 13 November 2026, optional promise ₹300, and a short reason. Check the review box and save. | **Due today**, ₹300 recorded outstanding, and supporting records. |
| 1:00–1:20 | Ask **Why is Ramesh due?** and expand answer evidence. Open **Review follow-up draft** and confirm the review. | Date and amount come from recorded evidence. The preview says **Draft not sent**. |
| 1:20-1:45 | Leave the ₹300 draft open. In a second tab in the same synthetic session, post a reviewed ₹100 repayment. In the first tab select **Check freshness and copy**, then prepare a fresh draft. | ₹200 outstanding, ₹300 promise and an explicit stale rejection before the fresh draft. |
| 1:45–2:15 | Record another reviewed credit of ₹500 for Ramesh. Open his due item. | ₹700 outstanding and **Ledger review required**. The draft action is gated until a new review. |

Show the existing journal and new Merchant Assistant separately. Describe the assistant as deterministic English for this demo. If presenting a browser recording or screenshot, capture the running build on a machine that can reach its loopback server and record the tested commit.

## Laptop browser witness

Use ordinary Windows PowerShell with loopback available. On a fresh source checkout use `./scripts/setup.ps1 -DependenciesOnly`; this installs dependencies without seeding an operator-selected database. Confirm `git rev-parse HEAD` and, for the sanitized source, compare `SOURCE_MANIFEST.json` to the recorded canonical SHA. Run `./scripts/demo_hyd.ps1` in the first terminal. In a second terminal run:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/v1/health/live
Invoke-RestMethod http://127.0.0.1:8000/v1/health/ready
(Invoke-WebRequest http://127.0.0.1:8000/).StatusCode
npm --prefix apps/web run test:e2e
./.venv/Scripts/python.exe -m pytest -q tests/test_process_restart.py
```

The app uses port 8000 and Playwright owns a separate synthetic database on port 8001. Open Edge and follow the walkthrough above, with a 390px viewport and keyboard focus through the review form. Capture synthetic transaction review, due/assistant evidence, unsent draft, stale warning and new-credit review. The Hyderabad Playwright spec saves its captures under `test-results/browser`. Use the sanitized release checkout for the full inherited browser suite so historical screenshots in the canonical checkout remain intact.

Stop the demo with Ctrl+C. Relaunch to start with a new isolated synthetic database. If TCP is unavailable, run the verified fallback:

```powershell
./.venv/Scripts/python.exe scripts/demo_hyd_offline.py
# Use only in the Windows shell that denies loopback:
./.venv/Scripts/python.exe scripts/demo_hyd_offline.py --windows-no-sockets
```

The fallback prints actual ASGI results and does not require a browser, paid model or existing database. It does not clear the venue browser gate.
