-- Dead Letter Queue for failed jobs
CREATE TABLE IF NOT EXISTS review_jobs_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_job_id UUID NOT NULL,
  repo_full_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  error TEXT,
  analysis JSONB,
  original_created_at TIMESTAMPTZ NOT NULL,
  moved_to_dlq_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX idx_dlq_repo_pr ON review_jobs_dlq(repo_full_name, pr_number);
CREATE INDEX idx_dlq_moved_at ON review_jobs_dlq(moved_to_dlq_at DESC);

-- Function to move failed jobs to DLQ
CREATE OR REPLACE FUNCTION move_to_dlq()
RETURNS void AS $$
BEGIN
  INSERT INTO review_jobs_dlq (
    original_job_id,
    repo_full_name,
    pr_number,
    owner,
    repo,
    attempts,
    error,
    analysis,
    original_created_at,
    metadata
  )
  SELECT 
    id,
    repo_full_name,
    pr_number,
    owner,
    repo,
    attempts,
    error,
    analysis,
    created_at,
    jsonb_build_object(
      'status', status,
      'max_attempts', max_attempts,
      'started_at', started_at,
      'completed_at', completed_at
    )
  FROM review_jobs
  WHERE status = 'failed' 
    AND attempts >= max_attempts
    AND updated_at < NOW() - INTERVAL '7 days';
  
  DELETE FROM review_jobs
  WHERE status = 'failed' 
    AND attempts >= max_attempts
    AND updated_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule DLQ cleanup weekly
SELECT cron.schedule(
  'cleanup-dlq',
  '0 0 * * 0',
  $$SELECT move_to_dlq();$$
);
