# Repair 2 verification

Windows, 13 November 2026 IST. Browser-test patch `cb35f65e9b566b477848aff278f6d43f57df2922`.

| Check | Evidence |
| --- | --- |
| Previous laptop Edge candidate `3a6a74b` | Maintainer reported 26 passed, 2 failed, 1 skipped, exit 1. The saved trace, accessibility snapshot and screenshot show the capture dialog and exact customer option present. Voice trace records an APIResponse lifetime error with overlapping context teardown. |
| Repaired browser coverage | See the final implementation report for the managed-session runs. The current 29-test inventory keeps the absent authorized WAV skip and includes the repaired Hyderabad and voice cases. |
| `./.venv/Scripts/python.exe -m pytest -q tests --basetemp=.tmp/repair2-full --tb=short` | Exit 0, 229 passed, one existing Starlette warning. Static, finance, commitment, tenant, provider and restart regressions included. |
| `npm --prefix apps/web test` and `npm --prefix apps/web run build` | Both exited 0, 11 frontend unit tests and production build. |
| V3 `verification/verify_v3.py` | Exit 0, design verifier and 38 reference tests passed in a temporary reference export. |
| Real TCP and offline | Health, homepage, JS and CSS 200. Encoded wildcard and benign missing route 404. Confirmed balances 50000, 30000, 20000, 70000 paise. Stale rejection, unsent draft, new-credit review, fresh isolated restart. |
| `pip check` and `npm --prefix apps/web audit` | Both exited 0. No broken requirements, npm reported zero vulnerabilities. |

The backend totals include the focused financial, API and static cases. The provider tests and recorded English replay use local fixtures. No live provider calls. [80-case register](EVAL_RESULTS_FINAL.csv)
