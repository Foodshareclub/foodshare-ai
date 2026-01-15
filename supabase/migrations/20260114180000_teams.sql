-- Team-based access control
-- Run in Supabase SQL Editor

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team members with roles
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- Link repos to teams
ALTER TABLE repo_configs ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_repo_configs_team ON repo_configs(team_id);

-- RLS policies
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Users can see teams they belong to
CREATE POLICY "Users can view their teams" ON teams
  FOR SELECT USING (id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- Users can see team members of their teams
CREATE POLICY "Users can view team members" ON team_members
  FOR SELECT USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- Only owners/admins can manage team members
CREATE POLICY "Admins can manage members" ON team_members
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Repo access based on team membership
DROP POLICY IF EXISTS "Users can view repos" ON repo_configs;
CREATE POLICY "Users can view repos" ON repo_configs
  FOR SELECT USING (
    team_id IS NULL OR 
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

-- Only admins can modify repos
DROP POLICY IF EXISTS "Users can modify repos" ON repo_configs;
CREATE POLICY "Admins can modify repos" ON repo_configs
  FOR ALL USING (
    team_id IS NULL OR
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );
