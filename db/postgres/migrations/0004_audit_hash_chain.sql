-- Tamper-evident audit log: chain each event to the previous one via a hash.

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS hash TEXT;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS prev_hash TEXT;
