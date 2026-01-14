-- Drop existing permissive policies
DROP POLICY IF EXISTS "Authenticated users see own repos" ON repo_configs;
DROP POLICY IF EXISTS "Authenticated users manage own repos" ON repo_configs;
DROP POLICY IF EXISTS "Anyone can view reviews" ON review_history;
DROP POLICY IF EXISTS "Service can insert reviews" ON review_history;
DROP POLICY IF EXISTS "Service can update reviews" ON review_history;
DROP POLICY IF EXISTS "Anyone can view jobs" ON review_jobs;
DROP POLICY IF EXISTS "Anyone can insert jobs" ON review_jobs;
DROP POLICY IF EXISTS "Service can manage jobs" ON review_jobs;
DROP POLICY IF EXISTS "Service can delete jobs" ON review_jobs;

-- Create helper function to check service role
CREATE OR REPLACE FUNCTION is_service_role() RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_setting('request.jwt.claims', true)::json->>'role' = 'service_role';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- repo_configs: Strict ownership + service role
CREATE POLICY "repo_select" ON repo_configs FOR SELECT
  USING (is_service_role() OR user_id IS NULL OR auth.uid()::text = user_id);

CREATE POLICY "repo_insert" ON repo_configs FOR INSERT
  WITH CHECK (is_service_role() OR auth.uid()::text = user_id);

CREATE POLICY "repo_update" ON repo_configs FOR UPDATE
  USING (is_service_role() OR auth.uid()::text = user_id);

CREATE POLICY "repo_delete" ON repo_configs FOR DELETE
  USING (is_service_role() OR auth.uid()::text = user_id);

-- review_history: Read own repos only, service writes
CREATE POLICY "history_select" ON review_history FOR SELECT
  USING (
    is_service_role() OR 
    repo_full_name IN (SELECT full_name FROM repo_configs WHERE user_id IS NULL OR user_id = auth.uid()::text)
  );

CREATE POLICY "history_insert" ON review_history FOR INSERT
  WITH CHECK (is_service_role());

CREATE POLICY "history_update" ON review_history FOR UPDATE
  USING (is_service_role());

CREATE POLICY "history_delete" ON review_history FOR DELETE
  USING (is_service_role());

-- review_jobs: Users can view/create for own repos, service manages all
CREATE POLICY "jobs_select" ON review_jobs FOR SELECT
  USING (
    is_service_role() OR
    repo_full_name IN (SELECT full_name FROM repo_configs WHERE user_id IS NULL OR user_id = auth.uid()::text)
  );

CREATE POLICY "jobs_insert" ON review_jobs FOR INSERT
  WITH CHECK (
    is_service_role() OR
    repo_full_name IN (SELECT full_name FROM repo_configs WHERE user_id IS NULL OR user_id = auth.uid()::text)
  );

CREATE POLICY "jobs_update" ON review_jobs FOR UPDATE
  USING (is_service_role());

CREATE POLICY "jobs_delete" ON review_jobs FOR DELETE
  USING (is_service_role());

-- Add indexes for RLS performance
CREATE INDEX IF NOT EXISTS idx_review_history_repo ON review_history(repo_full_name);
CREATE INDEX IF NOT EXISTS idx_review_jobs_repo ON review_jobs(repo_full_name);
CREATE INDEX IF NOT EXISTS idx_repo_configs_full_name ON repo_configs(full_name);
