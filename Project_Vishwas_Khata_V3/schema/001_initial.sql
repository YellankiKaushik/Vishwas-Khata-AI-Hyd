-- Project Vishwas Khata: proposed SQLite MVP schema (not deployed)
-- ALL data used with this schema during hackathon MUST BE SYNTHETIC.
-- Startup must execute: PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
-- Timestamps: RFC 3339 UTC; money: signed integer paise.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  simulated INTEGER NOT NULL DEFAULT 1 CHECK (simulated IN (0,1)),
  created_at TEXT NOT NULL,
  UNIQUE (id, simulated)
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
  normalized_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (merchant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_customers_merchant_name ON customers(merchant_id, normalized_name);
-- Duplicate normalized_name allowed (two distinct customers named Ramesh);
-- UI must require explicit disambiguation.

CREATE TABLE IF NOT EXISTS ledger_drafts (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  customer_id TEXT,
  raw_utterance TEXT,
  language TEXT,
  entry_type TEXT CHECK (entry_type IN ('CREDIT_GIVEN','REPAYMENT_RECEIVED') OR entry_type IS NULL),
  amount_paise INTEGER CHECK (amount_paise > 0 OR amount_paise IS NULL),
  state TEXT NOT NULL CHECK (state IN ('CREATED','NEEDS_REVIEW','AWAITING_CONFIRMATION','CONFIRMED','CANCELLED','EXPIRED','REJECTED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  parser_version TEXT NOT NULL DEFAULT 'ledger_extract_v1',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (merchant_id, id),
  FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_drafts_merchant_state ON ledger_drafts(merchant_id, state, updated_at);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL,
  draft_id TEXT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('CREDIT_GIVEN','REPAYMENT_RECEIVED','REVERSAL')),
  amount_paise_signed INTEGER NOT NULL CHECK (amount_paise_signed <> 0),
  reverses_entry_id TEXT,
  posted_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('MANUAL','VOICE_CONFIRMED','FIXTURE')),
  actor_id TEXT NOT NULL,
  reason TEXT,
  simulated INTEGER NOT NULL CHECK (simulated IN (0,1)),
  UNIQUE (merchant_id, id),
  UNIQUE (merchant_id, draft_id),
  UNIQUE (merchant_id, reverses_entry_id),
  FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id),
  FOREIGN KEY (merchant_id, draft_id) REFERENCES ledger_drafts(merchant_id, id),
  FOREIGN KEY (merchant_id, reverses_entry_id) REFERENCES ledger_entries(merchant_id, id),
  CHECK ((entry_type = 'CREDIT_GIVEN' AND amount_paise_signed > 0 AND reverses_entry_id IS NULL AND draft_id IS NOT NULL)
      OR (entry_type = 'REPAYMENT_RECEIVED' AND amount_paise_signed < 0 AND reverses_entry_id IS NULL AND draft_id IS NOT NULL)
      OR (entry_type = 'REVERSAL' AND reverses_entry_id IS NOT NULL AND draft_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_entries_merchant_customer_time ON ledger_entries(merchant_id, customer_id, posted_at, id);
CREATE INDEX IF NOT EXISTS idx_entries_merchant_time ON ledger_entries(merchant_id, posted_at, id);
-- Domain service must verify reversal amount = -original amount, same customer,
-- not previously reversed, and balance >= 0 after every normal repayment.

CREATE TABLE IF NOT EXISTS sales_events (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  observed_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('FIXTURE','MANUAL_OBSERVATION')),
  simulated INTEGER NOT NULL CHECK (simulated IN (0,1)),
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_sales_merchant_time ON sales_events(merchant_id, observed_at);

CREATE TABLE IF NOT EXISTS visit_events (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('FIXTURE','MANUAL_OBSERVATION')),
  simulated INTEGER NOT NULL CHECK (simulated IN (0,1)),
  FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_visit_merchant_customer_time ON visit_events(merchant_id, customer_id, observed_at);

CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  source_fact_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (state IN ('PROPOSED','DISMISSED','DONE_MANUALLY')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (merchant_id,id),
  FOREIGN KEY (merchant_id,customer_id) REFERENCES customers(merchant_id,id)
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (merchant_id,key),
  FOREIGN KEY (merchant_id,entry_id) REFERENCES ledger_entries(merchant_id,id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  result TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_merchant_time ON audit_events(merchant_id,created_at);

-- Approved fact-constrained briefing snapshots allow /speech to retrieve canonical
-- text by briefing_id instead of speaking arbitrary client-supplied text.
CREATE TABLE IF NOT EXISTS briefing_snapshots (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  business_date TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('hi-IN','te-IN','en-IN')),
  mode TEXT NOT NULL CHECK (mode IN ('TEMPLATE','VALIDATED_MODEL')),
  approved_slots_json TEXT NOT NULL,
  facts_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  simulated INTEGER NOT NULL CHECK (simulated IN (0,1)),
  UNIQUE (merchant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_briefing_merchant_day ON briefing_snapshots(merchant_id,business_date,created_at);
