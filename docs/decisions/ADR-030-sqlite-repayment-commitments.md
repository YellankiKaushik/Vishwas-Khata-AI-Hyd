# ADR-030 - SQLite repayment commitments

Migration 008 adds customer-level repayment expectations to the local SQLite demo. A partial unique index allows one active expectation per merchant and customer. The active record starts at version 1. Each revision advances the version by one and uses the application's canonical UTC timestamp format. Cancellation and handling close the record permanently.

SQLite triggers capture every revision with the actor, reason, and before and after snapshots. The event ID combines the commitment ID and version. Merchant-scoped foreign keys bind the current record to its customer and each operation receipt to its event. The database rejects updates, deletions, and replacement inserts against existing history or receipts.

The existing migration runner applies the schema and records its checksum in one transaction. The migration adds no rows to existing tables and creates no commitments from historical activity. Balance checks, request fingerprinting, and atomic writes of the original response and application audit event belong in the commitment service.
