-- Enable pg_cron extension (requires Supabase Pro or self-hosted)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule poll-repos every 5 minutes
SELECT cron.schedule(
  'poll-repos',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/poll-repos',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret'),
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
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-queue',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Add index for faster polling queries
CREATE INDEX IF NOT EXISTS idx_review_history_recent 
ON review_history(repo_full_name, pr_number, head_sha, created_at DESC);
