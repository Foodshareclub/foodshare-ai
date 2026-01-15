-- Enable extensions and setup cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

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

-- Security scans (every 6 hours)
SELECT cron.schedule(
  'scan-repos',
  '0 */6 * * *',
  $$SELECT net.http_post(
    url := 'https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/scan-repos',
    headers := '{"Authorization": "Bearer foodshare-cron-2026", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$
);
