-- Stores the editable SYSCOHADA liasse (financial statements) as a JSON blob
-- per organization, consumed by the React liasse modules.

CREATE TABLE IF NOT EXISTS liasse_data (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
  data_json TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
