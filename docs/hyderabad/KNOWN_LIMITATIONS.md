# Hyderabad known limitations

- This local release uses a synthetic merchant and SQLite. Hosted Hyderabad deployment, multi-merchant production identity and hosted row-level security remain outside the verified release.
- The typed assistant supports English and a bounded set of questions about recorded activity, due expectations and customer balances. Ambiguous names require a customer ID. Hindi and Telugu assistant templates and live speech remain unverified.
- The optional model adapter passed tests with a fake HTTP transport. A real provider call has not been authorized or run. The default launcher disables model inference, and optional responses still use server-owned text, amounts and dates.
- The model approval is bound to a local merchant, exact request IDs, an expiration and up to five attempts. Each attempt is reserved durably before any request. The adapter sends only intent, locale and temporary source aliases. The app does not supply a model with a customer's notes, name, question text or ledger values.
- Real localhost HTTP and the process restart test passed on Windows. Playwright reached server readiness on port 8001, then sandbox-enabled Edge exited during launch with Crashpad error 0x6D. No browser test body or app screenshot was obtained. The 390 px and keyboard witness remains open.
- Source IDs in responses are bounded to 20. Hashes and amounts still cover the contributing records. The due list is limited to the synthetic merchant's 50-customer scope.
- A fresh draft request revalidates facts on the server. The clipboard action checks again immediately before copy. The app cannot control pasted copies or revoke text already on a user's clipboard.
- Network advisory checks require access to package registries. Current results are in [TEST_EVIDENCE.md](TEST_EVIDENCE.md).
- The destination repository was empty on verification. The publication candidate uses a new source-only history and excludes inherited media.
