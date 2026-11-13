# Deploy a restricted synthetic preview on Vercel

Import the GitHub repository in Vercel. Use the **repository root**, the **Other** framework preset, and **Node.js 24.x**. Keep the commands from the root `vercel.json`. It runs `npm ci` for the function, installs and builds Vite in `apps/web`, and serves `apps/web/dist`. The `/v1/*` rewrite invokes `api/merchant.mjs`, a Node function using the same handler and transactions as the local HTTPS acceptance server. The frontend uses relative API URLs and the browser receives only the synthetic session cookie.

1. Enable Vercel Authentication for Preview deployments and expose Vercel system environment variables. Keep the production environment without hosted credentials. Use a Git-backed preview of the exact green CI commit so `VERCEL_GIT_COMMIT_SHA` is set by Vercel.
2. Set the Preview-only values below. For `HOSTED_PUBLIC_ORIGIN` use the exact HTTPS **branch URL** shown in the protected Preview settings, with no trailing slash. Use this same URL for the browser, HTTPS tests and judges with access. Test readiness through that URL and preserve Deployment Protection.
3. Set `HOSTED_PREVIEW_ACCEPTED_SHA` only after inspecting the passing required CI jobs for that exact SHA and confirming the target database and protection settings. Redeploy that Git revision. A build can succeed with the gate closed. The function returns 503 on readiness and business routes until the preview conditions match, including the deployed Git SHA. It refuses production financial API requests even if Preview settings are copied.

| Preview variable | Value |
| --- | --- |
| `HOSTED_PUBLIC_ORIGIN` | Exact HTTPS origin of the protected branch URL |
| `HOSTED_DATABASE_URL` | PostgreSQL URL for `hyd_runtime`; credentials percent-encoded, no TLS options in query parameters |
| `HOSTED_DATABASE_CA` | Actual PEM CA chain for the database endpoint, with literal newlines |
| `HOSTED_SESSION_SECRET` | Fresh cryptographically random secret of at least 32 bytes |
| `HOSTED_PREVIEW_ACCEPTED_SHA` | Full Git commit SHA from the passing acceptance run |

The database pool is shared within each function instance with two connections and a one-second idle timeout. Set a provider-side connection budget for the runtime role, because Vercel may start multiple instances. Verify the approved network path, certificate hostname, latency and capacity on the actual project. The app trusts the configured origin and incoming Host, and uses Vercel's ingress-provided IP only to bucket session creation limits.

## Provision and verify PostgreSQL privately

Create a dedicated synthetic PostgreSQL 17 database and two roles with the provider's private administration UI. The migration login owns the database/schema and has no superuser or RLS bypass. The runtime login is named `hyd_runtime` and has no ownership, membership, superuser, RLS bypass, replication or role/database creation privileges. Limit runtime access to this database and reserve separate owner/maintenance capacity. Use TLS with verified hostname and CA for both URLs. Keep `HOSTED_MIGRATION_DATABASE_URL` in the private migration environment only.

From the same checked-out revision, run `npm.cmd --prefix apps/hosted ci` and then `npm.cmd --prefix apps/hosted run migrate` with the owner URL and CA supplied privately. A second run checks migration checksums and reapplies the narrow runtime grants. Use provider backups or an encrypted custom-format PostgreSQL dump. Restore into a separate restricted synthetic database and repeat migrations and the role/tenant checks before relying on that backup. Keep backups out of Git and Vercel.

## Verify or withdraw the preview

In the Vercel dashboard confirm the expected Git SHA, deployment ID and protected URL. Run the two checks below from the repository root after supplying the exact test origin in `VISHWAS_HOSTED_TEST_URL` and a Vercel Protection Bypass for Automation secret in `VERCEL_AUTOMATION_BYPASS_SECRET` in the test shell only. Each browser context authenticates to the platform separately and creates its own merchant session. Keep traces disabled.

```powershell
npm.cmd --prefix apps/web ci
Push-Location apps/web
npx.cmd playwright install chromium
npx.cmd playwright test -c playwright.hosted.config.ts --trace off
Pop-Location
node apps/hosted/acceptance/http.mjs
```

Check that both tests exit successfully. Record the commit, deployment ID, URL, browser version and results in the master report. Use Vercel **Logs** filtered to that deployment or `vercel logs --deployment <deployment-id>` to check for errors and credential leakage. Review platform and database logs privately. Afterward, remove the temporary automation secret from the test environment and revoke it in Vercel when no longer needed.

If the preview fails, keep Deployment Protection enabled and withdraw the affected preview link. Clear the accepted SHA and redeploy with the gate closed. Remove the failed deployment or its alias through the dashboard as needed, retaining database backups. Reopen only for a previously verified, schema-compatible revision. Leave the public production gate closed.

## Container and disposable acceptance

The Dockerfile at `apps/hosted/deployment/Dockerfile` builds the React app and serves it with the Node API from a single HTTPS origin. Build with the repository root as the context. The image runs as an unprivileged user. Both container startup and the server check the public release gate. The disposable acceptance server uses its own TLS certificate and binds to loopback.

## Database and ingress

Use a dedicated PostgreSQL 17 database containing synthetic data. Use a direct, TLS-verified database endpoint with restricted network access, retention and tested restore. Run migrations in a private job with a dedicated non-superuser owner. Provision `hyd_runtime` as a login with no role memberships, object ownership, role administration, replication or RLS bypass. Restrict database connections to these roles and authorized maintenance operators. The migration script applies the runtime grants in `privileges.sql` and records migration checksums.

| Setting | Where it belongs |
| --- | --- |
| `HOSTED_MIGRATION_DATABASE_URL` | Private migration job only |
| `HOSTED_DATABASE_URL` | Node runtime only, authenticating as `hyd_runtime` |
| `HOSTED_DATABASE_CA` | Migration job and runtime, using the trusted database CA |
| `HOSTED_SESSION_SECRET` | Runtime secret store, generated for this environment |
| `HOSTED_PUBLIC_ORIGIN` | Runtime configuration, the exact HTTPS origin |
| `PORT` | Private listener port supplied by the runtime, default 8080 |

Terminate TLS at trusted ingress. Preserve the request Host and restrict access to the private listener to that ingress. The runtime derives quota input from the immediate network peer. Verify session and request quotas through the actual ingress, including shared proxy addresses. Keep database credentials and session secrets out of build arguments, frontend variables, logs and browser artifacts.

## Promotion evidence

Use an access-restricted environment and the documented disposable PostgreSQL/HTTPS checks to establish migration, isolation, concurrency, backup and restore evidence. On the intended runtime, verify secure session cookies, two isolated merchant sessions, the complete reviewed Ramesh journey, origin and request bounds, quotas, readiness and the production React build. Review each requirement in `../release-gate.json` against recorded evidence before approving public startup. The public configuration has no provider calls, live payments or external customer delivery.
