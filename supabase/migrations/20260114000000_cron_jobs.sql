-- Enable pg_net for HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Index for faster polling queries
CREATE INDEX IF NOT EXISTS idx_review_history_recent 
ON review_history(repo_full_name, pr_number, head_sha, created_at DESC);

-- Index for job queue
CREATE INDEX IF NOT EXISTS idx_review_jobs_pending_retry
ON review_jobs(status, next_retry_at, created_at) 
WHERE status = 'pending';
