-- Cron jobs for FoodShare AI
-- Run in Supabase SQL Editor after enabling pg_cron + pg_net extensions
-- Dashboard: Database → Extensions → Enable pg_cron, pg_net

-- Clear existing jobs
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('poll-repos', 'process-queue', 'scan-repos');

-- Poll repos for new PRs (every 5 min)
SELECT cron.schedule(
  'poll-repos',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/poll-repos',
    headers := '{"Authorization": "Bearer foodshare-cron-2026", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$
);

-- Process review queue (every minute)
SELECT cron.schedule(
  'process-queue',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/process-queue',
    headers := '{"Authorization": "Bearer foodshare-cron-2026", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$
);

-- Security scans (daily at 3am UTC)
SELECT cron.schedule(
  'scan-repos',
  '0 3 * * *',
  $$SELECT net.http_post(
    url := 'https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/scan-repos',
    headers := '{"Authorization": "Bearer foodshare-cron-2026", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$
);

-- View scheduled jobs
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
