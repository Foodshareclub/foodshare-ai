-- Fix: Remove leftover team policies
DROP POLICY IF EXISTS "Users can view their teams" ON teams;
DROP POLICY IF EXISTS "Users can view team members" ON team_members;
DROP POLICY IF EXISTS "Admins can manage members" ON team_members;
DROP POLICY IF EXISTS "Users can view repos" ON repo_configs;
DROP POLICY IF EXISTS "Admins can modify repos" ON repo_configs;

-- Drop team tables if they exist
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS teams CASCADE;

-- Remove team_id column from repo_configs
ALTER TABLE repo_configs DROP COLUMN IF EXISTS team_id;
