-- Split user identity from organization-specific roles.

CREATE TABLE IF NOT EXISTS organization_users (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'accountant', 'viewer')),
  PRIMARY KEY (user_id, organization_id)
);

INSERT INTO organization_users (user_id, organization_id, role)
SELECT id, organization_id, role
FROM users
WHERE organization_id IS NOT NULL AND role IS NOT NULL
ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role;

DROP INDEX IF EXISTS idx_users_organization_id;

ALTER TABLE users DROP COLUMN IF EXISTS organization_id;
ALTER TABLE users DROP COLUMN IF EXISTS role;

CREATE INDEX IF NOT EXISTS idx_organization_users_user_id ON organization_users(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_users_organization_id ON organization_users(organization_id);
