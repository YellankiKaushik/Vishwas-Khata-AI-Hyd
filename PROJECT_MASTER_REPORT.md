# Vishwas-Khata-AI Hyderabad project master report

## Current release status — 13 November 2026 (IST)

| Item | Verified state |
| --- | --- |
| GitHub main | `482e80a98a770b6e09786d52d754c4686efc6c37`. [PR #1](https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd/pull/1) is merged and preserves maintainer attribution. |
| Venue checkpoint | Annotated local tag `hyderabad-venue-2026-11-13` targets `03d8192b989ae9d1da212f318ff172a919043830`, the frozen source and historically browser-tested venue commit. Tag and GitHub release publication are pending. |
| PRs and remote branches | [PR #2](https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd/pull/2) remains an open draft. Its published head is `8173d4b7b65e3d7baf922ef42957349429678129`. Integration and cleanup are pending. Remote branches are `main`, `docs/hyderabad-maintainer`, `feat/synthetic-staging-foundations`, and `feat/hosted-synthetic-parity`. |
| Latest published acceptance | [Run 43414477563](https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd/actions/runs/43414477563) failed its final gate after both Edge installs failed. Backend and hosted-unit jobs passed. No green mandatory Chromium run exists for the current candidate. |
| Local backend and V3 | Supplemental Python 3.11 run passed 238 backend and 38 V3 tests. The real TCP restart test failed with Windows socket access error 10013. V3 verifier and source/secret scan passed. The exact locked Linux regression remains pending. |
| Local hosted units | 21 passed with Node 24.16.0 and cached PGlite 0.5.12, including two Vercel adapter tests. Current locked PGlite 0.5.16 run blocked on package access. The latest published run passed 19 tests on 0.5.16. |
| Frontend and browsers | Current Vitest and Vite/TypeScript build blocked by npm registry access. Playwright 1.64.1 requested Chromium 156.0.8078.4 (build 1248). Its CDN download exited 1 on DNS, so both current browser suites are unverified. Required jobs use supported Playwright Chromium with the browser sandbox disabled on disposable GitHub-hosted Ubuntu only. |
| PostgreSQL and HTTPS | Current checks blocked by an inaccessible local container engine and pending GitHub CI. Historical [run 43404020255](https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd/actions/runs/43404020255) passed PostgreSQL 17 migrations, concurrency, tenant isolation, backup/restore, HTTPS API acceptance, 11 frontend tests and the build. Its overall acceptance failed. The frozen Windows venue run recorded 28 browser passes and one private-audio skip. |
| Audits | Published Python and npm audit evidence remains historical. Current local advisory lookups are blocked by network access. |
| Vercel | Repository-root Node 24.x function serves `/v1/*` using the shared hosted handler. Vite output is `apps/web/dist`. The root production dependency lock installed locally from cache, and Vercel tracing found the handler, gate, database module and pg driver. Platform build, routing and deployed acceptance remain unverified. |
| Live status | `NOT_DEPLOYED`. No verified URL. Restricted preview requires an exact accepted Git SHA, authorized database configuration and Vercel Deployment Protection. Production financial routes remain gated. |
| Scope | The assistant grounds deterministic English responses in ledger evidence. Live model calls, real Paytm payments, live Hindi/Telugu speech, outbound delivery and production merchant onboarding remain outside the hackathon release. Open V3 cases are EV-059, EV-063, EV-064, EV-076, EV-077 and EV-079. |

Use `scripts/finalize_hyderabad_release.ps1` in Windows PowerShell 5.1 with the exact candidate SHA as `-ExpectedHead`. Actual PowerShell 5.1.26100.9818 parsed the script, rejected a wrong SHA and stopped at the GitHub authentication check with the correct SHA. Managed Git transport could not resolve GitHub. Live finalization remains unverified. The integration PR requires approval of its tested head before merge. The preview requires access to a protected Vercel project and a dedicated synthetic PostgreSQL 17 database. Configure credentials through the providers' private settings. The [deployment handoff](apps/hosted/deployment/README.md) covers setup, validation and rollback.

Production use requires verified merchant identity and consent, approved provider/payment contracts and data handling, independently reviewed operational security, auditable financial controls, tested recovery, retention, and incident procedures. The hackathon evidence covers the synthetic workflow.


## Historical executive status before the full Edge hierarchy repair

The published hackathon main release is 482e80a98a770b6e09786d52d754c4686efc6c37. [PR #2](https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd/pull/2) remains an open draft against feat/synthetic-staging-foundations. Its verified published head is a106c32e407978a8114516f81ef18bc44e8bcfc8. This repair is a direct child on feat/hosted-synthetic-parity and requires a new acceptance run after publication.

| Job in [run 43411694142](https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd/actions/runs/43411694142) | Observed result |
| --- | --- |
| backend | Passed. 239 backend tests and 38 V3 reference tests passed. The V3 verifier and source scan passed. The Python audit found no known vulnerabilities. |
| hosted-unit | Passed. All 19 tests passed on locked PGlite 0.5.16. The hosted npm audit reported zero vulnerabilities. |
| local-edge | Edge setup failed after package installation because /opt was root-owned with mode 0777. Frontend tests, the build and Playwright were skipped. The frontend npm audit reported zero vulnerabilities. |
| hosted-edge | Failed the same path check. PostgreSQL, HTTPS and Playwright were skipped in this run. |
| acceptance | Failed because both mandatory Edge jobs failed. |

On the Ubuntu 24.04 amd64 GitHub-hosted runner, Edge setup now verifies that / and /opt are root-owned, / is protected from group and other writes, and /opt is a genuine directory. It changes the observed mode 0777 to 0755 before the signed package installation. Setup then rechecks /opt, the installed package identity, both signed binary payloads, and all package path ownership and write permissions before enabling the root-owned sandbox helper. Unexpected writable modes fail closed. Browser sandboxing and TLS verification remain enabled.

[Run 43404020255](https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd/actions/runs/43404020255) remains the latest passing real PostgreSQL 17 migration and recovery evidence, including repeat migration, independent connections, role isolation, concurrency, rollback and backup/restore. It also passed the loopback HTTPS API acceptance with the complete ₹500 → ₹300 → ₹200 → ₹700 financial journey and stale-draft rejection, 11 frontend unit tests and the production build. The full local and hosted Edge suites still require a successful CI run with this correction.

Public demo status is NOT_DEPLOYED. Hosted preflight remains closed pending acceptance and deployment evidence. The public preview requires authorized access to an approved Node-capable HTTPS service and a dedicated synthetic PostgreSQL project with separate migration and runtime credentials. Configure credentials through the providers' private settings.

V3 cases EV-059, EV-063, EV-064, EV-076, EV-077 and EV-079 remain open. The assistant remains deterministic, and live AI and speech require separate approval and verification. Paytm remains at synthetic contract testing.


Local verification passed the release and source scan and 19 supplemental hosted tests with cached PGlite 0.5.12. The managed Windows shell blocked Git Bash before it could run the updated script's syntax check. The backend job checks shell syntax on Ubuntu.

## Historical CI and release evidence

### Edge package diagnostics in run 43409543864

GitHub main remains 482e80a98a770b6e09786d52d754c4686efc6c37. [PR #2](https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd/pull/2) is an open draft against staging. The last verified published head is e02f52b3806bba79ad5f3b200aae6d6d177dbf47. The correction containing this entry is its direct fast-forward child.

| Job in [run 43409543864](https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd/actions/runs/43409543864) | Observed result |
| --- | --- |
| backend | Success. 239 backend and 38 V3 reference tests passed, along with the V3 verifier and source scan. Python 3.12.16, pip 26.3, FastAPI 0.162.0, pytest 9.2.0 and pip_audit 2.10.1. Python audit reported no known vulnerabilities. |
| hosted-unit | Success. 19 tests passed on locked PGlite 0.5.16 with pg 8.23.1, Node 24.16.0 and npm 11.13.0. Hosted npm audit reported zero vulnerabilities. |
| local-edge | Failed in Edge setup, before frontend install, build or Playwright. The frontend npm audit reported zero vulnerabilities. |
| hosted-edge | Failed in the same setup step. PostgreSQL, HTTPS and Playwright were not run in this cycle. |
| acceptance | Failed because both mandatory Edge jobs failed. |

Both complete Edge job logs show Microsoft's signed microsoft-edge-stable 157.0.4341.57-1 package being installed and the script exiting 1 after man-db triggers. The prior script emitted no per-check diagnostics, so the exact failing assertion and the old runner's on-disk modes cannot be established from that run. Microsoft's package index and the documented Linux sandbox helper location were checked. Local inspection of the downloaded Linux package and its ownership was unavailable in this managed Windows environment.

Edge setup now reports each failed validation or command with its stage and source line. It checks installed package status, version and architecture. It accepts either exact dpkg owner spelling, with or without amd64 qualification, for both installed files. It rejects symlinks and checks their signed payload bytes before setting mode 4755. Root ownership and absence of group or other write permissions remain required for every path component. A nonroot group on a nonwritable ancestor is accepted, while the setuid helper itself must be root:root. The script reads the version directly from the verified binary. The four-job workflow keeps the same final acceptance gate and now checks shell syntax on the backend runner independently of Edge installation.

Local verification passed 48 provider/reference tests, 19 supplemental hosted tests with cached PGlite 0.5.12, and the release source scan. Local Git Bash was blocked by Windows managed-process error 0xC0000022 before it could run bash -n. The next CI run must exercise the new Edge setup, full local Edge suite and hosted Edge journey. No browser assertions or release gates were weakened.

The preceding run 43404020255 is still the real PostgreSQL 17 migration, recovery and HTTPS API witness. It verified the signed financial journey, isolation, conflicting retries, stale drafts, request limits and expired sessions against PostgreSQL. That run also passed 11 frontend tests and the Vite build. Neither run passed hosted Edge browser acceptance. Public preflight still exits 1 and no public HTTPS URL exists.

V3 cases EV-059, EV-063, EV-064, EV-076, EV-077 and EV-079 remain open. The English assistant remains deterministic; live AI and speech require separate approval and language verification. Paytm remains synthetic contract testing. No commercial pilot or real integrations are authorized.

The next action is to publish the reviewed fast-forward to the existing draft branch so GitHub Actions can run. Public preview will then require access to an approved Node-capable HTTPS service and a dedicated synthetic PostgreSQL project with separate runtime and migration credentials. Configure secrets through the provider's private environment.

### Initial PostgreSQL and HTTPS evidence in run 43404020255

GitHub main is 482e80a98a770b6e09786d52d754c4686efc6c37. PR #1 is merged with maintainer attribution verified. The stable venue demo and its SQLite migrations are preserved. [Draft PR #2](https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd/pull/2) targets staging. Its last observed published head is b1e0670cc65a8b082ec186fffba2393977b6bbef. The correction in this report's commit is a fast-forward child of that head.

### Observed CI results

[Run 43404020255](https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd/actions/runs/43404020255), job 131813724593, completed with failures. The complete job log was inspected.

| Check | Result |
| --- | --- |
| Exact installs | Python 3.12.16, pip 26.3, FastAPI 0.162.0, pytest 9.2.0, pip_audit 2.10.1, Node 24.16.0, npm 11.13.0, PGlite 0.5.16 and pg 8.23.1. Both npm lockfiles installed, including Playwright 1.64.1, TypeScript 5.8.3, Vite 8.3.5 and Vitest 5.0.5. |
| Backend and references | 239 backend tests and 38 V3 reference tests passed. The V3 verifier and source checks passed. |
| Hosted unit | 17 passed and 1 failed under PGlite 0.5.16. The permission test handled an expected 42501 inside the callback, so PGlite attempted COMMIT against the aborted transaction and surfaced 25P02. |
| Frontend | 11 Vitest tests passed. TypeScript and the production Vite build passed. |
| Local Edge 156.0.4314.58 | 10 passed and 19 failed. All 19 reported failures hit the sandbox helper configuration error on startup. The prior Windows venue witness is historical, with 28 passed and 1 private-audio skip. |
| Real PostgreSQL 17 | TLS migrations, repeat checks, roles, independent connections, isolation, concurrency, rollback and restored-database acceptance passed. |
| Hosted HTTPS API | Loopback HTTPS assets, readiness, origin, bounds, sessions, concurrent receipt replay, financial journey, stale draft rejection, quota, and expiry/revocation passed against real PostgreSQL. |
| Hosted Edge | 1 failure before the test body, caused by the same sandbox helper configuration. Hosted browser acceptance is pending. |
| Advisory checks | Python reported no known vulnerabilities. Both npm audits reported zero vulnerabilities. |

### Corrections and next acceptance

The negative posting permission test now asserts rejection of the entire transaction so the SQL error reaches PGlite's rollback handler. A separate regression checks SQLSTATE 42501 and verifies the hosted session can read its empty journal afterward. The runtime role, grants and RLS are unchanged. Local supplemental verification passed all 19 hosted tests with cached PGlite 0.5.12. Acceptance on 0.5.16 awaits the next CI run.

Both Edge jobs use the same Ubuntu runner-only setup. It obtains Edge through signed Microsoft APT metadata, verifies key fingerprints and the installed binary and helper against the package payload, checks root ownership and non-writable path components, then sets mode 4755 on the package-owned helper. Browser sandbox and HTTPS verification remain enabled. The workflow separates backend, hosted unit, local Edge and PostgreSQL/hosted Edge, with a final gate requiring all four jobs. Failure screenshots may be uploaded. CI trace recording is off because traces can include synthetic auth cookies. GitHub job logs remain the diagnostic source.

The hosted container has a readiness health check using its configured host. Public promotion remains closed. A Render Docker web service is a candidate for an approved free Node runtime. Render's free PostgreSQL expires after 30 days, and Neon Free does not establish IP-restricted private access. A dedicated synthetic PostgreSQL project with separate runtime and migration credentials and an approved connection policy must be verified before deployment. The Vercel preflight remains in place. There is no public HTTPS deployment or URL.

V3 cases EV-059, EV-063, EV-064, EV-076, EV-077 and EV-079 remain open. Real AI and live speech remain approval-gated. Official Paytm account integration remains separate from the passing fake-transport tests. Production remains prototype-only.

From the approved checkout in an authenticated ordinary PowerShell, publish the fast-forward correction with **git -C .tmp/development push origin HEAD:refs/heads/feat/hosted-synthetic-parity**. This triggers the next workflow on the existing draft. After CI passes, the only deployment access needed is an approved free Node-capable HTTPS service and a dedicated synthetic PostgreSQL project. Keep secrets in the respective private environment settings.

## Earlier release evidence

## Latest release decision

**Public demo status: NOT_DEPLOYED.** The frozen SQLite venue release is preserved. Hosted PR #2 remains an open draft against feat/synthetic-staging-foundations. Do not promote it until locked regressions, real PostgreSQL and hosted browser acceptance pass. The hosted public preflight still exits 1.

| GitHub ref or local checkpoint | Verified SHA and state |
| --- | --- |
| main and merged [PR #1](https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd/pull/1) | 482e80a98a770b6e09786d52d754c4686efc6c37. GitHub attributes the merge to YellankiKaushik. PR head a5fb6b7217ae52a4a5d010100cf011f72670b237. The original release root remains in history. Contributors graph refresh was not checked. |
| Published [PR #2](https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd/pull/2) | 50a3623651267df240ecf1d29204a0a967e892c7, tree 0682cc672307f8fcb20054cd57195dfe44a83de4 locally. GitHub confirms this head is still an open draft. |
| Local hosted acceptance parent | 3e2d40972883b616d9b8f94f303affb3a224c052, directly descended from the published head. The new acceptance commit is its child. |

### Windows diagnosis and safe fallback

The shell is Codex-managed Windows build 26300 with PowerShell 7.6.9. Node 24.16.0, npm 11.9.0, Python 3.11.9 and system pip 25.3 were observed. The checkout's Python 3.12 venv has bootstrap pip 25.0.1. Docker CLI 29.9.2 and the Desktop launcher exist. A normal user-level startup launched the process but produced no engine. Both the default and desktop-linux named pipes were absent. The Desktop log reports that the launcher cannot read the Docker Desktop registry key from this session. WSL status and distribution listing returned Wsl/E_ACCESSDENIED. Service Control Manager and virtualization CIM queries also returned access errors. These observations describe this process boundary. No conclusion about laptop-wide Docker or virtualization health was established.

No accessible PostgreSQL binaries, server process, or approved PostgreSQL connection were found. WSL could not be inspected for a working instance. npm registry DNS failed, PyPI could not supply pinned pip, and shell Git could not resolve GitHub. The GitHub connector confirmed public branch and PR metadata.

The new branch-only GitHub Actions workflow uses a standard Ubuntu 24.04 runner and a loopback-only disposable PostgreSQL 17 container. It installs both npm locks and the Python lock, runs independent unit and build steps, verifies both Edge suites, uses a disposable CA trusted in the runner's NSS store, and runs dependency audits. PostgreSQL tests assert FORCE RLS, migration checksums, competing edits, conflicting retries and compensating reversal. The HTTPS smoke adds the full 50,000 → 30,000 → 20,000 → 70,000 paise journey, original receipt replay and stale follow-up rejection. The browser test now gives both manually created contexts a base URL for relative HTTP requests. The workflow uses no cloud database, repository write permissions, or deployment credentials.

### Current acceptance evidence

| Command | Exit | Result |
| --- | --- | --- |
| scripts/verify_hosted_windows.ps1 -HostedBrowser | 1 | Stopped at scripts/setup.ps1 -DependenciesOnly. Pinned pip 26.3 unavailable through this network. |
| Python 3.11.9 -X utf8 -m pytest -q tests/test_provider_staging.py Project_Vishwas_Khata_V3/tests | 0 | 48 passed, comprising 10 provider guard and 38 V3 reference tests. |
| Python 3.11.9 -X utf8 Project_Vishwas_Khata_V3/verification/verify_v3.py | 0 | Static and SQLite reference verifier passed. Generated verification report was restored to the tracked historical file. |
| node --test apps/hosted/tests/*.test.mjs | 0 | 18 supplemental passes with cached PGlite 0.5.12. Hosted lock remains PGlite 0.5.16 and pg 8.23.1. |
| scripts/test_hosted_postgres.ps1 | 1 | Stopped at docker info. No database provisioned and no real PostgreSQL or browser witness. |
| node --check and PowerShell parser | 0 | Changed acceptance scripts parse. Three Playwright TypeScript files parsed with cached TypeScript 5.9.3. Workflow YAML parsed. Managed MSYS Bash could not start for an additional syntax check. |
| node apps/hosted/scripts/preflight.mjs | 1 | Public environment and witnessed acceptance remain unavailable. |

Full backend, frontend, locked hosted, Edge, and advisory checks are still blocked. The retained pins include FastAPI 0.162.0, pytest 9.2.0, pip_audit 2.10.1, Playwright 1.64.1, Vitest 5.0.5, TypeScript 5.8.3 and Vite 8.3.5. No locks changed. The six unresolved V3 cases remain EV-059, EV-063, EV-064, EV-076, EV-077 and EV-079.

From the approved checkout in an authenticated ordinary terminal, run **git -C .tmp/development push origin HEAD:refs/heads/feat/hosted-synthetic-parity**. This should update draft PR #2 and trigger the workflow without changing laptop Docker or WSL. Verify the resulting Actions run and retain its exact test evidence. Public deployment subsequently needs access to one approved free Node-capable HTTPS runtime and one dedicated synthetic PostgreSQL project with private runtime and separate migration credentials. No public URL exists.

## Historical publication and verification

The sections below preserve earlier observations. Use the latest release decision above for current status.

## Published branches and current verification

GitHub confirmed both branches and both pull requests. The original main commit and venue release are intact. The hosted PR remains a draft against staging.

| GitHub ref | Observed head | Review state |
| --- | --- | --- |
| main | 03d8192b989ae9d1da212f318ff172a919043830 | Historic source release, unchanged |
| feat/synthetic-staging-foundations | 206e6cd02205987dadda1685134d2f2e14f46821 | Staging base, linked author YellankiKaushik |
| docs/hyderabad-maintainer | 1deae905623b828a82c3916cc7061c3908b44b21 | [PR #1](https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd/pull/1) open and unmerged, linked author YellankiKaushik |
| feat/hosted-synthetic-parity | 50a3623651267df240ecf1d29204a0a967e892c7 | [PR #2](https://github.com/YellankiKaushik/Vishwas-Khata-AI-Hyd/pull/2) open as draft, linked author YellankiKaushik |

GitHub lists only README.md and SOURCE_MANIFEST.json in PR #1. Its review asks the README to distinguish the Bengaluru predecessor from the Hyderabad entry. Local follow-up a5fb6b7217ae52a4a5d010100cf011f72670b237 clarifies that distinction and updates the manifest. Both archived trees passed 167 hash checks each. Push from the managed shell failed at DNS resolution. The documentation update is pending publication and review. No default-branch attribution or Contributors refresh is verified.

### Acceptance run

| Exact command | Exit | Observed result |
| --- | --- | --- |
| git -C .tmp/development fetch origin | 128 | Managed Git DNS failure. GitHub API verified the refs above. |
| scripts/setup.ps1 -DependenciesOnly | 1 | Python 3.12.14 venv with bootstrap pip 25.0.1 could not download pinned pip 26.3. |
| npm.cmd --prefix apps/hosted ci --fetch-retries=0 | 1 | npm registry DNS failure. PGlite 0.5.16 and pg 8.23.1 are locked. A clean install was unavailable. |
| npm.cmd --prefix apps/web ci --fetch-retries=0 | 1 | npm install aborted in the network-restricted session. Frontend lock retained. Node 24.16.0 and npm 11.9.0 observed. |
| Python 3.11.9 -X utf8 -m pytest -q tests/test_provider_staging.py Project_Vishwas_Khata_V3/tests | 0 | 48 passed, comprising 10 provider guard tests and 38 V3 reference tests. |
| Python 3.11.9 -X utf8 -m pytest -q tests --tb=no | 2 | 15 collection errors in the backend suite after the dependency install failed. FastAPI 0.162.0 and pytest 9.2.0 remain pinned. |
| node --test apps/hosted/tests/*.test.mjs | 0 | 18 passed with explicitly supplemental cached PGlite 0.5.12. The required PGlite 0.5.16 run remains open. |
| npm.cmd --prefix apps/web test | 1 | Vitest executable unavailable. |
| npm.cmd --prefix apps/web run test:e2e | 1 | tsc unavailable, so the Vite build and Edge run did not start. TypeScript 5.9.3 parsed the modified hosted spec successfully. |
| npm.cmd --prefix apps/hosted audit --fetch-retries=0 | 1 | Audit endpoint DNS failure. |
| .venv/Scripts/python.exe -m pip_audit -r requirements-lock.txt | 1 | Locked pip_audit 2.10.1 unavailable. |
| Python 3.11.9 -X utf8 scripts/verify_release.py | 0 | Frozen 167-file manifest, 34 reference hashes and eight historic migrations passed. |
| scripts/test_hosted_postgres.ps1 | 1 | Docker Desktop is installed. Starting it from the managed session did not expose the Linux engine. WSL returned E_ACCESSDENIED. No container was provisioned. |
| node apps/hosted/scripts/preflight.mjs | 1 | Missing authorized runtime environment and external acceptance evidence. |

The local hosted follow-up expands the disposable real PostgreSQL checks to race two edits against the same commitment version, verify exactly one new event, and reject a same-tenant wrong-customer mutation. The HTTPS smoke covers PostgreSQL-backed request limits and an expired cookie on the disposable restored database. The browser spec captures runtime errors and checks cross-tenant mutation denial. The API child process receives only the runtime database URL. The new acceptance paths passed syntax checks and still need execution against real services.

### Remaining operator actions

Run the following from the approved Windows checkout in ordinary PowerShell. Start Docker Desktop first and wait until docker info reports a Linux server.

```powershell
git -C .tmp/development push origin docs/hyderabad-maintainer
Set-Location .tmp/development
./scripts/verify_hosted_windows.ps1 -HostedBrowser
```

The verification runner reports exact command exit codes and refuses to run the hosted suite on a PGlite version other than 0.5.16. For the browser phase, it prints the disposable local certificate and keeps the loopback service running. In the Edge test profile that trusts that certificate, follow the printed command to run the hosted Playwright configuration. After acceptance, push the local hosted follow-up to PR #2. Review the amended documentation in PR #1, then merge it using a normal merge commit once its checks pass.

Public HTTPS remains NOT_DEPLOYED. Public promotion needs an approved HTTPS runtime and dedicated synthetic PostgreSQL database, with separate runtime and migration credentials. The preflight is still closed. V3 classifications below remain in effect, including EV-059, EV-063, EV-064, EV-076, EV-077 and EV-079. The previous verification sections are historical records.

## Recovery and acceptance pass

The approved Hyderabad checkout is clean on main. Its separate .tmp/development repository contains all four prior commits with their original object IDs and parents. The verified complete-history bundle is .tmp/hyderabad-recovered.bundle, SHA-256 F71FCEF27F944E383CDAA6D340EB2A03F6BAEEE40129129B3DD28EC8613FE945. The follow-up fixes are on feat/hosted-synthetic-parity, which still descends from the staging tip. The root release and earlier backups were preserved.

GitHub still reports main at 03d8192b989ae9d1da212f318ff172a919043830 and staging at 206e6cd02205987dadda1685134d2f2e14f46821. The main-based maintainer commit 1deae905623b828a82c3916cc7061c3908b44b21 changes README.md and SOURCE_MANIFEST.json only. Each tree's 167 manifest entries matched its archive. The documentation author and committer match the identity that GitHub recognized on staging. Direct Git and the managed Windows PowerShell network probe could not resolve GitHub. The connected GitHub account's branch write returned 403. No PR, new remote author attribution, Contributors refresh, or public deployment has been observed.

| Command or witness | Result this pass |
| --- | --- |
| Windows PowerShell Test-NetConnection github.com -Port 443, git ls-remote, npm ping | Managed shell DNS/network failure. The user's separate normal PowerShell clone was reported successful. |
| scripts/setup.ps1 -DependenciesOnly | Exit 1. Python 3.12.14 created a venv with bootstrap pip 25.0.1. The pip 26.3 download failed. |
| npm ci for apps/hosted and apps/web | Exit 1. Registry unavailable. Node 24.16.0 and npm 11.9.0. Locked PGlite 0.5.16 was unavailable. |
| node --test apps/hosted/tests/*.test.mjs | Exit 0, 18 passed using cached PGlite 0.5.12. Includes two fake Paytm tests. The lockfile is unchanged. |
| Python 3.11.9 -X utf8 -m pytest -q tests/test_provider_staging.py Project_Vishwas_Khata_V3/tests | Exit 0, 10 injected-provider and 38 reference tests passed. |
| Python 3.11.9 -X utf8 -m pytest -q tests | Exit 2, 15 collection errors because FastAPI is unavailable. |
| npm run test and npm run test:e2e in apps/web | Exit 1. Vitest and tsc unavailable after the failed install. A TypeScript 5.9.3 source parse of the modified hosted browser test passed. |
| npm audit and python -m pip_audit -r requirements-lock.txt | Unavailable. The npm audit DNS lookup failed and pip_audit could not be installed. |
| scripts/test_hosted_postgres.ps1 | Exit 1 at docker info. The Docker Desktop Linux engine pipe is unavailable. No database was provisioned. |
| node apps/hosted/scripts/preflight.mjs | Exit 1. Private environment and public acceptance evidence are outstanding. |

Hosted readiness now checks the database result. Oversized uploads retain a structured 413 response, and the local acceptance service supports TLS on the loopback listener. The PostgreSQL script prepares a disposable TLS database, applies migrations twice, checks real roles and independent connections, and verifies signed journal totals after restoring a backup. The HTTPS smoke exercises the actual Node transport, and the Edge test now drives the React commitment, assistant and stale draft flows. These prepared acceptance paths still require a real run.

Run from the approved checkout in ordinary PowerShell:

```powershell
git fetch .tmp/hyderabad-recovered.bundle refs/heads/docs/hyderabad-maintainer:refs/heads/docs/hyderabad-maintainer refs/heads/feat/hosted-synthetic-parity:refs/heads/recovered/hosted-synthetic-parity
gh auth status
gh api user --jq .login
git ls-remote origin refs/heads/main refs/heads/feat/synthetic-staging-foundations
git -C .tmp/development push origin docs/hyderabad-maintainer
gh pr create --repo YellankiKaushik/Vishwas-Khata-AI-Hyd --base main --head docs/hyderabad-maintainer --title "Document Hyderabad maintainership and project lineage" --body "README and manifest only. All 167 snapshot hashes verified."
```

Check that the PR changes only the README and manifest, that required checks pass, and that GitHub recognizes the author before merging with a normal merge commit. Verify ancestry in the merged main history.

Run the locked suite in the separate development checkout, with Docker Desktop running for PostgreSQL:

```powershell
Set-Location .tmp/development
./scripts/setup.ps1 -DependenciesOnly
node -p "require('./apps/hosted/node_modules/@electric-sql/pglite/package.json').version"
./.venv/Scripts/python.exe -X utf8 -m pytest -q tests Project_Vishwas_Khata_V3/tests
./.venv/Scripts/python.exe -X utf8 scripts/verify_release.py
npm.cmd --prefix apps/hosted test
npm.cmd --prefix apps/web test
npm.cmd --prefix apps/web run build
npm.cmd --prefix apps/web run test:e2e
npm.cmd --prefix apps/hosted audit
npm.cmd --prefix apps/web audit
./.venv/Scripts/python.exe -m pip_audit -r requirements-lock.txt
./scripts/test_hosted_postgres.ps1 -Browser
```

Require the package version check to print 0.5.16 and each required check to exit 0. The disposable PostgreSQL script prints the certificate path and keeps the loopback service running for the Edge test. From apps/web in a test profile that trusts the generated local certificate, set VISHWAS_HOSTED_TEST_URL to the printed URL and run npm.cmd exec -- playwright test -c playwright.hosted.config.ts. Once verified, push feat/hosted-synthetic-parity and open its PR against feat/synthetic-staging-foundations.

Render documents a free Docker-capable web service but its free PostgreSQL databases expire after 30 days. A separate free Neon project is a candidate for durable synthetic persistence, subject to verifying role and connection support with an approved account. Existing Vercel configuration still enforces the gate and no authorized runtime or database was detected. Keep migration and runtime credentials separate, complete private acceptance, and promote only after the required HTTPS and recovery evidence is recorded. [Render free plan](https://render.com/docs/free) · [Render web services](https://render.com/docs/web-services) · [Neon free plan](https://neon.com/blog/neon-free-plan-1-gb-per-project)

## 1. Executive status

| Decision | Status | Evidence |
| --- | --- | --- |
| HACKATHON_DEMO_STATUS | READY_WITH_LIMITATIONS | The frozen Hyderabad demo keeps its previously verified venue release and backup. This pass independently reran 38 V3 reference tests. |
| GITHUB_CONTRIBUTOR_ATTRIBUTION_STATUS | VERIFIED_ON_STAGING / DEFAULT_BRANCH_PENDING | GitHub resolves the staging author and committer to YellankiKaushik. The README and manifest are committed on a separate local branch. GitHub rejected remote branch creation. |
| PUBLIC_DEMO_STATUS | NOT_DEPLOYED | Hosted code and acceptance scripts are prepared. Real PostgreSQL, production frontend and external HTTPS acceptance remain open. The release preflight exits 1. |
| REAL_AI_STATUS | MOCK_ONLY | Deterministic English and existing bounded local adapter. No live calls or paid tests this pass. |
| PAYTM_INTEGRATION_STATUS | STAGING_CONTRACT_TESTED / ACCOUNT_APPROVAL_REQUIRED | Two injected status-transport tests passed. No Paytm requests or payment processing. |
| PRODUCTION_STATUS | PROTOTYPE_ONLY | Synthetic sessions and fictional records. No merchant onboarding, production processing, service SLO, or backup/restore witness. |

## Attribution and release provenance

| Ref | Verified revision | Evidence |
| --- | --- | --- |
| GitHub default branch main | 03d8192b989ae9d1da212f318ff172a919043830 | Root author and committer both identify as Vishwas-Khata-AI source release. GitHub returned no linked account ID. |
| GitHub feat/synthetic-staging-foundations | 206e6cd02205987dadda1685134d2f2e14f46821 | Raw author and committer match locally. GitHub resolves both to YellankiKaushik. |
| Local docs/hyderabad-maintainer | 1deae905623b828a82c3916cc7061c3908b44b21 | Configured Git author email matched the independently linked staging commit. README recognizes the maintainer, Tic Tac Tech, Hyderabad scope and earlier code lineage. The manifest retains the source SHA and adds the frozen base snapshot reference. All 167 hashes match in both trees. |
| Local feat/hosted-synthetic-parity | Based on 206e6cd02205987dadda1685134d2f2e14f46821 | Backend milestone bc911b2806f9e115e78db887c6de0567f36a65f3, followed by frontend wiring and this report. |

The original checkout remains on main. Development uses a separate checkout under .tmp/development because the original Git metadata is read-only in this session. Direct Git transport failed to resolve GitHub and the local GitHub CLI could not authenticate. The connected GitHub account identified as YellankiKaushik and read the repository, but branch creation and tree writes returned HTTP 403. Neither branch reached GitHub. There is no new PR, merge SHA, remote author resolution for the new commit, or observed Contributors graph refresh.

## Hosted capability and V3 coverage

| Capability | Status | Observed scope or gap |
| --- | --- | --- |
| Synthetic session and scoped customer identities | Implemented and tested | Secure HttpOnly, Strict cookies, two-hour expiry, explicit revocation, server-controlled fictional customers, restrictive RLS on the existing tenant policies, and private runtime role. Test handlers used distinct sessions in embedded PostgreSQL. Hosted customer mutation remains outside the fixed synthetic roster. |
| Finance and receipts | Implemented and tested | Database-backed draft create/get/edit/cancel, exact integer paise, exact version, explicit confirmation, signed posting, atomic receipt, original replay, compensating reversal with reason, and no negative balances. The runtime role cannot call the raw posting function. |
| Commitments and due list | Implemented and tested in part | The handler exposes create/list/get/update/cancel/handle/history. The new journey directly exercised creation, update, history and handling. Immutable reason events, IST due states, stale evidence and positive-credit review passed in the embedded engine. Direct hosted HTTP cancellation and boundary-clock acceptance remain to run. |
| Assistant and reviewed drafts | Partially implemented | Hosted English supports a bounded set of deterministic due and balance questions. Unsupported questions receive guidance. Drafts require current version/evidence and explicit review. No delivery path exists. Local assistant continues to support the broader deterministic and optional bounded model path. |
| HTTP protections and quotas | Implemented and tested in part | Origin checks, cookies, streamed JSON cap, integer token validation, distributed quota SQL and redacted errors have handler-level tests. Private HTTPS ingress, real multi-process quotas and ingress capacity remain unverified. |
| Frontend parity | Implemented but unverified | Same-origin /v1 works with local FastAPI or the hosted Node service. Readiness selects hosted mode. Hosted saved writes are scoped to a session, and local-only briefing, observations, voice capture and custom customer creation are unavailable in hosted mode. A hosted Playwright configuration and two-browser test are prepared. |
| PostgreSQL promotion and recovery | Implemented but unverified | Migration runner uses an advisory lock, transaction and checksums. Runtime role grants are separate. Acceptance script checks independent connections, RLS, direct-write denial, retry and rollback. Managed migration, concurrency, retention and provider restore remain open. |
| Public HTTPS | Blocked by access | No reachable authorized database and no authenticated hosting account were available. Vercel config is still the original fail-closed staging preflight. A same-origin container with a private listener is prepared for an approved HTTPS host. |
| Real AI, speech and Paytm accounts | Blocked by authorization | Existing deterministic and fake-provider paths remain available. Hindi and Telugu require individual authorized verification. Official Paytm credentials and product permissions are still needed. |
| Production identity, payments and operations | Deferred conditional | Production merchant authentication, data handling, production payments, monitoring, encrypted backups and recovery objectives need a separate approval and acceptance process. |
| Outbound customer delivery and unrestricted model actions | Not implemented | No send, arbitrary finance action, creditworthiness, or lending decision path exists. |

The external Hyderabad V3 design, retained Hyderabad contracts, staging implementation and older reference package were reviewed. The original six unrun cases remain open: EV-059, EV-063, EV-064, EV-076, EV-077 and EV-079. Embedded database checks provide related evidence for isolation and composite keys. They do not close those named cases.

## Verification this pass

- 17 hosted tests passed with locally cached PGlite 0.5.12. The lockfile still pins 0.5.16, which was unavailable offline. The run includes the 11 staging PostgreSQL tests, four hosted request-handler tests and two fake Paytm tests.
- Hosted handler demonstrated 50,000 → 30,000 → 20,000 → 70,000 paise, original receipt replay, stale draft rejection, renewed review, and reversal back to 20,000 paise. It also checked separate sessions, revoked/expired cookies, origin rejection, strict amounts, request quota and raw-post denial.
- All 10 existing injected-provider staging tests passed. No provider traffic was made.
- All 38 V3 reference tests passed. The static design audit passed using Python UTF-8 mode. The frozen manifest, 34 reference hashes, eight historical migrations and publication source scan passed.
- The production pg dependency installed from cache and loaded. Node syntax checks and six changed TypeScript source parse checks passed. The locked frontend npm install, full typecheck/build, Vitest, Playwright, and dependency audits did not complete because pinned dependencies or the registry were unavailable. The backend regression did not collect because FastAPI is absent from this environment. A loopback TCP probe was denied with EACCES.
- The real PostgreSQL test exited with missing database configuration. The release preflight remains closed. No HTTPS URL, deploy revision, browser verification, production audit or provider restore claim is supported.

## Promotion and recovery procedure

1. Authenticate GitHub CLI as YellankiKaushik in a network-enabled terminal. Verify the two origin SHAs with git ls-remote. Push docs/hyderabad-maintainer from this checkout, verify the commit API author, review the documentation-only PR, merge with an ancestry-preserving merge, and verify the resulting main SHA. GitHub contributor statistics may refresh later. Push the reviewed feature branch separately and open its PR against feat/synthetic-staging-foundations.
2. Identify an existing approved free HTTPS runtime and dedicated synthetic PostgreSQL database. Provision the schema owner as a non-superuser without BYPASSRLS and a separate hyd_runtime LOGIN without role memberships. Limit the database to server access. Set HOSTED_MIGRATION_DATABASE_URL only in the migration runner. Configure HOSTED_DATABASE_URL, HOSTED_DATABASE_CA, HOSTED_SESSION_SECRET and HOSTED_PUBLIC_ORIGIN in private environment settings. Keep migration credentials out of the runtime.
3. Install locked dependencies and rerun the local Python, frontend, hosted, reference, browser and advisory checks. Apply npm run migrate from apps/hosted and run npm run test:postgres on the approved PostgreSQL instance. Test repeat migration and restored state on a disposable database. The migration runner rejects an existing untracked schema; a preexisting database requires reviewed provenance.
4. Build the container from the repository root with docker build -f apps/hosted/deployment/Dockerfile . and use an authenticated private acceptance environment with HTTPS ingress preserving the exact Host. The default container entry point enforces the public release preflight. Record full browser, concurrency, recovery and redacted logging evidence before public promotion.
5. If application rollback is required, use the prior compatible application image with the same forward-only schema, or take the endpoint offline if compatibility is unverified. Preserve the database and journal. Keep backups encrypted, restore to a separate instance and verify migrations, journal totals and receipt replay before switching connections. Apply any data correction as an explicitly reviewed compensating posting.
6. Obtain separate finite provider/model approvals before any live AI or speech request. Use synthetic English, Hindi and Telugu samples separately for rupees, ambiguous names, explicit customer identity, cancellation, device errors, timeout and typed fallback. For Paytm, obtain approved staging MID and credentials, the assigned host and applicable partner scope directly from Paytm before any staging traffic. The fake transport does not create, settle, or reconcile real payments.

Current official Paytm references: [Transaction Status API](https://www.paytmpayments.com/docs/api/v3/transaction-status-api/), [callback and webhooks](https://www.paytmpayments.com/docs/callback-and-webhook), [Settlement API](https://www.paytmpayments.com/docs/api/settlement-api), and [Mini App onboarding](https://business.paytm.com/docs/miniapps/integration-steps). Gateway access, production-only settlement, Mini App onboarding, Paytm for Business placement and production payment authorization are separate. The injected contract validates signed status against server-owned order identity and amount. It returns separate review evidence without a journal write.

## Earlier release record and full requirement crosswalk

The sections that follow preserve the pre-hosted implementation evidence. References to hosted groundwork and earlier test counts describe that checkpoint.

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
