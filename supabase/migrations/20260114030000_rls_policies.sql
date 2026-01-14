-- Add user_id to repo_configs for ownership
ALTER TABLE repo_configs ADD COLUMN IF NOT EXISTS user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_repo_configs_user_id ON repo_configs(user_id);

-- Enable RLS on all tables
ALTER TABLE repo_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_jobs ENABLE ROW LEVEL SECURITY;

-- repo_configs: Users see own repos, anon sees all (for now - until auth is set up)
CREATE POLICY "Authenticated users see own repos" ON repo_configs FOR SELECT 
  USING (auth.uid() IS NULL OR auth.uid()::text = user_id OR user_id IS NULL);
CREATE POLICY "Authenticated users manage own repos" ON repo_configs FOR ALL 
  USING (auth.uid() IS NULL OR auth.uid()::text = user_id OR user_id IS NULL);

-- review_history: Read access for dashboard, write for service
CREATE POLICY "Anyone can view reviews" ON review_history FOR SELECT USING (true);
CREATE POLICY "Service can insert reviews" ON review_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update reviews" ON review_history FOR UPDATE USING (true);

-- review_jobs: Read for dashboard, full access for service
CREATE POLICY "Anyone can view jobs" ON review_jobs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert jobs" ON review_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can manage jobs" ON review_jobs FOR UPDATE USING (true);
CREATE POLICY "Service can delete jobs" ON review_jobs FOR DELETE USING (true);

-- Ensure service role has full access
GRANT ALL ON repo_configs TO service_role;
GRANT ALL ON review_history TO service_role;
GRANT ALL ON review_jobs TO service_role;
