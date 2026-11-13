# Synthetic hosted deployment

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
