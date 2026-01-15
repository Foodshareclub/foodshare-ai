-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_review_jobs_status_created ON review_jobs(status, created_at) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_review_jobs_next_retry ON review_jobs(next_retry_at) WHERE next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_history_repo_pr ON review_history(repo_full_name, pr_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_history_status ON review_history(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repo_configs_enabled ON repo_configs(enabled) WHERE enabled = true;

-- Add updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_review_jobs_updated_at BEFORE UPDATE ON review_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_repo_configs_updated_at BEFORE UPDATE ON repo_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add connection pooling settings (run as superuser)
-- ALTER SYSTEM SET max_connections = 100;
-- ALTER SYSTEM SET shared_buffers = '256MB';
-- ALTER SYSTEM SET effective_cache_size = '1GB';
-- ALTER SYSTEM SET maintenance_work_mem = '64MB';
-- ALTER SYSTEM SET checkpoint_completion_target = 0.9;
-- ALTER SYSTEM SET wal_buffers = '16MB';
-- ALTER SYSTEM SET default_statistics_target = 100;
-- ALTER SYSTEM SET random_page_cost = 1.1;
-- ALTER SYSTEM SET effective_io_concurrency = 200;
-- ALTER SYSTEM SET work_mem = '4MB';
-- ALTER SYSTEM SET min_wal_size = '1GB';
-- ALTER SYSTEM SET max_wal_size = '4GB';
