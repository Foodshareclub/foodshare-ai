-- Review job queue
CREATE TABLE IF NOT EXISTS review_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_full_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  analysis JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ
);

CREATE INDEX idx_review_jobs_status ON review_jobs(status);
CREATE INDEX idx_review_jobs_next_retry ON review_jobs(next_retry_at) WHERE status = 'pending';

-- Notifications log
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- error, warning, info
  channel TEXT NOT NULL, -- slack, email, webhook
  message TEXT NOT NULL,
  metadata JSONB,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
