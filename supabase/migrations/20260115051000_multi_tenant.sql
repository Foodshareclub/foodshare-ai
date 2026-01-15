-- Multi-tenant support: Add organization_id to key tables (only if tables exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'review_queue') THEN
    ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS org_id TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reviews') THEN
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS org_id TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'repo_configs') THEN
    ALTER TABLE repo_configs ADD COLUMN IF NOT EXISTS org_id TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'security_scans') THEN
    ALTER TABLE security_scans ADD COLUMN IF NOT EXISTS org_id TEXT;
  END IF;
END $$;

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  github_org TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Org membership
CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- Indexes (only if tables exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'review_queue') THEN
    CREATE INDEX IF NOT EXISTS idx_review_queue_org ON review_queue(org_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reviews') THEN
    CREATE INDEX IF NOT EXISTS idx_reviews_org ON reviews(org_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'repo_configs') THEN
    CREATE INDEX IF NOT EXISTS idx_repo_configs_org ON repo_configs(org_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);

-- RLS for organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their orgs" ON organizations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM org_members WHERE org_members.org_id = id AND org_members.user_id = auth.uid())
  );

CREATE POLICY "Users can view their memberships" ON org_members
  FOR SELECT USING (user_id = auth.uid());

-- Function to get user's org
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;
