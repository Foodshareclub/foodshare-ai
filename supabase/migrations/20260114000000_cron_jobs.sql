-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net;
-- pg_cron must be enabled via Supabase Dashboard

-- App settings (set these via SQL or Dashboard)
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'https://xxx.supabase.co';
-- ALTER DATABASE postgres SET app.settings.cron_secret = 'your_secret';

-- Schedule poll-repos every 5 minutes
SELECT cron.schedule(
  'poll-repos',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT current_setting('app.settings.supabase_url', true)) || '/functions/v1/poll-repos',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.cron_secret', true)),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Schedule process-queue every minute
SELECT cron.schedule(
  'process-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT current_setting('app.settings.supabase_url', true)) || '/functions/v1/process-queue',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.cron_secret', true)),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Index for faster polling queries
CREATE INDEX IF NOT EXISTS idx_review_history_recent 
ON review_history(repo_full_name, pr_number, head_sha, created_at DESC);

-- Index for job queue
CREATE INDEX IF NOT EXISTS idx_review_jobs_pending_retry
ON review_jobs(status, next_retry_at, created_at) 
WHERE status = 'pending';
