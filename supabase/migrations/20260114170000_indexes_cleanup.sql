-- Performance indexes for FoodShare AI
-- Run in Supabase SQL Editor

-- Review history indexes
CREATE INDEX IF NOT EXISTS idx_review_history_repo ON review_history(repo_full_name);
CREATE INDEX IF NOT EXISTS idx_review_history_status ON review_history(status);
CREATE INDEX IF NOT EXISTS idx_review_history_created ON review_history(created_at DESC);

-- Security scans indexes
CREATE INDEX IF NOT EXISTS idx_security_scans_repo ON security_scans(repo_full_name);
CREATE INDEX IF NOT EXISTS idx_security_scans_score ON security_scans(security_score);
CREATE INDEX IF NOT EXISTS idx_security_scans_created ON security_scans(created_at DESC);

-- Review queue indexes (if table exists)
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue(status);
  CREATE INDEX IF NOT EXISTS idx_review_queue_created ON review_queue(created_at);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Repo configs index
CREATE INDEX IF NOT EXISTS idx_repo_configs_enabled ON repo_configs(enabled) WHERE enabled = true;

-- Cleanup old data (keep last 90 days of reviews, 30 days of scans)
DELETE FROM review_history WHERE created_at < NOW() - INTERVAL '90 days';
DELETE FROM security_scans WHERE created_at < NOW() - INTERVAL '30 days';

-- Note: Run VACUUM ANALYZE manually in SQL editor if needed
