-- OHADA FinanceOS PostgreSQL target schema.
-- This mirrors the current SQLite MVP tables and prepares the production
-- migration path. Runtime PostgreSQL adapter will be added in the next step.

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  currency TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'accountant', 'viewer')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  currency TEXT NOT NULL,
  fiscal_year_start DATE NOT NULL,
  fiscal_year_end DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS accounting_periods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'locked')),
  created_at TIMESTAMPTZ NOT NULL,
  locked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auxiliary_accounts (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  account_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  source TEXT NOT NULL,
  batch_id TEXT,
  bank_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  line_index INTEGER NOT NULL,
  account_code TEXT NOT NULL,
  auxiliary_code TEXT,
  label TEXT NOT NULL,
  debit NUMERIC(18, 2) NOT NULL DEFAULT 0,
  credit NUMERIC(18, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS classification_corrections (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,
  account_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_import_batches (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  transaction_count INTEGER NOT NULL,
  imported_count INTEGER NOT NULL,
  duplicate_count INTEGER NOT NULL,
  learned_count INTEGER NOT NULL,
  entry_ids_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_batches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  frequency TEXT NOT NULL,
  entry_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS lettering_groups (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  account_code TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('manual', 'automatic')),
  line_refs_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json JSONB,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
  payload_json JSONB NOT NULL,
  result_json JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stored_files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_created_at ON journal_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_batch_id ON journal_entries(batch_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_bank_fingerprint ON journal_entries(bank_fingerprint);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON journal_entries(reference);
CREATE INDEX IF NOT EXISTS idx_journal_lines_auxiliary_code ON journal_lines(auxiliary_code);
CREATE INDEX IF NOT EXISTS idx_bank_import_batches_created_at ON bank_import_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_batches_created_at ON subscription_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lettering_groups_account_code ON lettering_groups(account_code);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stored_files_created_at ON stored_files(created_at DESC);
