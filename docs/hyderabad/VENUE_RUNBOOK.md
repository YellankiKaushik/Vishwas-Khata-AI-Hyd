# Vishwas-Khata-AI venue runbook

Use the verified Hyderabad checkout or clone the reviewed source bundle into a new directory. The separate desktop checkout has only the migration-era commit. Tested Windows tools were Python 3.12.14, Node 24.16.0 and Microsoft Edge 157.0.4341.46. Internet access is needed to install locked dependencies in a clean copy. The demo uses installed packages, local SQLite, and deterministic English without an AI key.

Use `git clone -b main <bundle> <new-folder>` for a new copy of the portable bundle. Compare the commit and tree with the maintainer's handoff.

Use the Repair 2 candidate and tree from the final implementation report. Keep the prior `.tmp/hotfix-final-witness` checkout and its browser artifacts intact.

## Start and verify

In ordinary Windows PowerShell from the repository root:

```powershell
git status --short
git rev-parse HEAD
Get-Location
if (!(Test-Path apps/web/package.json)) { throw 'Change to the repository root first.' }
# Fresh copy only
./scripts/setup.ps1 -DependenciesOnly
./scripts/demo_hyd.ps1
```

Type `http://127.0.0.1:8000/` into the Edge address bar. In a second terminal at the same repository root:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/v1/health/live
Invoke-RestMethod http://127.0.0.1:8000/v1/health/ready
(Invoke-WebRequest http://127.0.0.1:8000/).StatusCode
try {
  (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8000/%2A%2A?utm_source=chatgpt.com' -ErrorAction Stop).StatusCode
} catch {
  if (!$_.Exception.Response) { throw }
  [int]$_.Exception.Response.StatusCode
}
npm --prefix apps/web run test:e2e
"Playwright exit code $LASTEXITCODE"
./.venv/Scripts/python.exe -m pytest -q tests/test_process_restart.py
```

Expect HTTP 200 for both health endpoints and the homepage, schema revision 008, and 404 for the malformed path. Playwright owns port 8001 and a separate synthetic database. Run the browser suite from the root of a disposable clone to keep historical evidence intact. Use the ordinary terminal and installed Edge with sandboxing enabled. npm reports ENOENT for the relative `--prefix apps/web` when the current directory lacks that path.

Before the complete suite, run each repaired case once and then repeat each three times:

```powershell
npm --prefix apps/web run build
Push-Location apps/web
npx playwright test e2e/hyderabad.spec.ts --workers=1 --trace on
"Hyderabad exit $LASTEXITCODE"
npx playwright test e2e/voice.spec.ts --grep 'recorded real STT response replay' --workers=1 --trace on
"Voice exit $LASTEXITCODE"
npx playwright test e2e/hyderabad.spec.ts --workers=1 --repeat-each=3 --trace on
"Hyderabad repeats exit $LASTEXITCODE"
npx playwright test e2e/voice.spec.ts --grep 'recorded real STT response replay' --workers=1 --repeat-each=3 --trace on
"Voice repeats exit $LASTEXITCODE"
Pop-Location
npm --prefix apps/web run test:e2e
"Full Edge exit $LASTEXITCODE"
```

The 29-test target is 28 passes and one skip for the absent authorized WAV. Copy synthetic evidence to a separate folder before starting the next Playwright run. The runner replaces its output directory.

## Two-minute demonstration

| Time | Action | Expected evidence |
| --- | --- | --- |
| 0:00–0:35 | Open Record transaction and confirm ₹500 credit for Ramesh. Confirm ₹200 repayment. | Signed journal and ₹300 outstanding. |
| 0:35–1:00 | In Merchant Assistant review a ₹300 repayment expectation for 13 November 2026 IST. | Due today with supporting records. |
| 1:00–1:25 | Ask **Why is Ramesh due?** and open the draft review. | Grounded ₹300 answer and **Draft not sent**. |
| 1:25–2:00 | Confirm a further ₹100 repayment and refresh the draft. Confirm ₹500 new credit. | ₹200 fresh draft, old evidence rejected, then ₹700 with **Ledger review required**. |

For the stale-preview witness, leave the ₹300 draft open in one tab and post the ₹100 repayment in another tab in the same synthetic merchant session. Back in the first tab, choose **Check freshness and copy**. Verify the error and that the stale preview disappears. At 390 px check horizontal overflow, then Tab through the review form, confirm visible focus, and capture synthetic evidence only.

## Recovery and fallback

Stop the launcher with Ctrl+C. Relaunching creates a new synthetic database in `.tmp`; keep the earlier file if diagnosis is needed. A corrupt database must be preserved. Start a fresh isolated demo instead of editing its ledger or migration. If a port is occupied, stop only the earlier demo process you own. Keep the application on loopback.

```powershell
./.venv/Scripts/python.exe scripts/demo_hyd_offline.py
# Only if the Windows shell cannot initialize its local socket pair
./.venv/Scripts/python.exe scripts/demo_hyd_offline.py --windows-no-sockets
```

The fallback verifies the same balances, stale evidence, explicit confirmation, and unsent status in-process. Present it as API evidence if the laptop browser cannot run. [Browser witness worksheet](LAPTOP_BROWSER_WITNESS.md)
